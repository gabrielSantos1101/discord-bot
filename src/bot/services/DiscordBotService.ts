import { Client, Events, GatewayIntentBits } from 'discord.js';
import { CacheService } from '../../services/CacheService';
import { DatabaseService } from '../../services/DatabaseService';
import { DiagnosticService } from '../../services/DiagnosticService';
import { MetricsService } from '../../services/MetricsService';
import { PresenceError, presenceErrorHandler, PresenceErrorType } from '../../services/PresenceErrorHandler';
import { PresenceSyncService } from '../../services/PresenceSyncService';
import { getDiscordConfig } from '../../utils/config';
import { logger } from '../../utils/logger';
import { CommandManager } from '../commands/CommandManager';
import { PresenceEventHandler } from '../handlers/PresenceEventHandler';
import { AutoChannelManager } from '../managers/AutoChannelManager';

/**
 * Main Discord bot service that manages the bot connection and integrates all components
 */
export class DiscordBotService {
  private client: Client;
  private autoChannelManager: AutoChannelManager | null = null;
  private commandManager: CommandManager | null = null;
  private presenceEventHandler: PresenceEventHandler | null = null;
  private presenceSyncService: PresenceSyncService | null = null;
  private diagnosticService: DiagnosticService | null = null;
  private metricsService: MetricsService | null = null;
  private databaseService: DatabaseService;
  private cacheService: CacheService;
  private isReady = false;

  constructor(databaseService: DatabaseService, cacheService: CacheService) {
    this.databaseService = databaseService;
    this.cacheService = cacheService;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
      ]
    });

    logger.info('Discord client initialized with intents', {
      component: 'DiscordBotService',
      operation: 'initialization',
      metadata: {
        intents: [
          'Guilds',
          'GuildVoiceStates', 
          'GuildMessages',
          'MessageContent',
          'GuildPresences'
        ]
      }
    });

    this.setupEventListeners();
  }

  /**
   * Setup Discord client event listeners
   */
  private setupEventListeners(): void {
    this.client.once(Events.ClientReady, this.onReady.bind(this));
    this.client.on(Events.Error, this.onError.bind(this));
    this.client.on(Events.Warn, this.onWarn.bind(this));
    this.client.on(Events.GuildCreate, this.onGuildJoin.bind(this));
    this.client.on(Events.PresenceUpdate, this.onPresenceUpdate.bind(this));
  }

  /**
   * Validate that required intents are properly configured and accessible
   */
  private async validateIntents(): Promise<void> {
    try {
      logger.info('Validating Discord intents', {
        component: 'DiscordBotService',
        operation: 'intent_validation'
      });

      const guilds = this.client.guilds.cache;
      if (guilds.size === 0) {
        logger.warn('No guilds available for intent validation', {
          component: 'DiscordBotService',
          operation: 'intent_validation'
        });
        return;
      }

      const testGuild = guilds.first();
      if (testGuild) {
        const presences = testGuild.presences.cache;
        
        logger.info('GuildPresences intent validation', {
          component: 'DiscordBotService',
          operation: 'intent_validation',
          guildId: testGuild.id,
          metadata: {
            guildName: testGuild.name,
            presencesCount: presences.size,
            membersCount: testGuild.memberCount
          }
        });

        if (presences.size === 0 && testGuild.memberCount && testGuild.memberCount > 1) {
          logger.warn('GuildPresences intent may not be enabled - no presence data available despite having members', {
            component: 'DiscordBotService',
            operation: 'intent_validation',
            guildId: testGuild.id,
            metadata: {
              recommendation: 'Enable GuildPresences intent in Discord Developer Portal'
            }
          });
        } else {
          logger.info('GuildPresences intent appears to be working correctly', {
            component: 'DiscordBotService',
            operation: 'intent_validation',
            metadata: {
              presencesAvailable: presences.size > 0
            }
          });
        }

        logger.info('Intent validation summary', {
          component: 'DiscordBotService',
          operation: 'intent_validation',
          metadata: {
            guildsAccess: guilds.size > 0,
            voiceStatesAccess: testGuild.voiceStates.cache.size >= 0,
            messagesAccess: true,
            presencesAccess: presences.size > 0
          }
        });
      }
    } catch (error) {
      logger.error('Failed to validate intents', {
        component: 'DiscordBotService',
        operation: 'intent_validation',
        metadata: {
          recommendation: 'Check Discord Developer Portal settings and bot permissions'
        }
      }, error as Error);
    }
  }

  /**
   * Handle bot ready event
   */
  private async onReady(client: Client): Promise<void> {
    logger.info('Discord bot ready', {
      component: 'DiscordBotService',
      operation: 'ready',
      metadata: {
        botTag: client.user?.tag,
        botId: client.user?.id
      }
    });
    
    try {
      await this.validateIntents();

      this.autoChannelManager = new AutoChannelManager(this.client, this.cacheService);
      this.commandManager = new CommandManager(this.client, this.databaseService);
      this.presenceEventHandler = new PresenceEventHandler(this.cacheService);
      this.presenceSyncService = new PresenceSyncService(
        this.client,
        this.presenceEventHandler
      );
      this.diagnosticService = new DiagnosticService(this.client, this.cacheService);
      this.metricsService = new MetricsService({
        errorRateThreshold: 5,
        responseTimeThreshold: 2000,
        cacheHitRateThreshold: 80,
        memoryUsageThreshold: 85,
        enabled: true
      });

      await this.loadAllServerConfigurations();
      this.presenceSyncService.start();

      this.setupMetricsMonitoring();

      setTimeout(async () => {
        try {
          await this.diagnosticService!.runDiagnosticsWithAlerts();
        } catch (error) {
          logger.error('Initial diagnostics failed', {
            component: 'DiscordBotService',
            operation: 'initial_diagnostics'
          }, error as Error);
        }
      }, 10000);

      this.isReady = true;
      logger.info('Discord bot service fully initialized', {
        component: 'DiscordBotService',
        operation: 'initialization_complete',
        metadata: {
          guilds: this.client.guilds.cache.size,
          users: this.client.users.cache.size
        }
      });
    } catch (error) {
      logger.error('Error initializing bot service', {
        component: 'DiscordBotService',
        operation: 'initialization'
      }, error as Error);
    }
  }

  /**
   * Handle bot errors
   */
  private onError(error: Error): void {
    logger.error('Discord client error', {
      component: 'DiscordBotService',
      operation: 'client_error'
    }, error);
  }

  /**
   * Handle bot warnings
   */
  private onWarn(warning: string): void {
    logger.warn('Discord client warning', {
      component: 'DiscordBotService',
      operation: 'client_warning',
      metadata: {
        warning: warning
      }
    });
  }

  /**
   * Handle bot joining a new guild
   */
  private async onGuildJoin(guild: any): Promise<void> {
    console.log(`Joined new guild: ${guild.name} (${guild.id})`);
    
    try {
      await this.databaseService.createDefaultServerConfig(guild.id);
      console.log(`Created default configuration for guild ${guild.id}`);
    } catch (error) {
      console.error('Error creating default config for new guild:', error);
    }
  }

  /**
   * Handle presence update events
   */
  private async onPresenceUpdate(oldPresence: any, newPresence: any): Promise<void> {
    const startTime = Date.now();
    let success = false;

    try {
      if (!this.presenceEventHandler) {
        const error = new PresenceError(
          PresenceErrorType.EVENT_PROCESSING,
          'Presence event handler not initialized',
          {
            component: 'DiscordBotService',
            operation: 'presence_update',
            userId: newPresence?.userId,
            guildId: newPresence?.guild?.id
          },
          false
        );
        presenceErrorHandler.handleError(error);
        return;
      }

      if (!newPresence || !newPresence.guild) {
        return;
      }

      await this.presenceEventHandler.handlePresenceUpdate(oldPresence, newPresence);
      success = true;
      
    } catch (error) {
      presenceErrorHandler.handleError(error as Error, {
        component: 'DiscordBotService',
        operation: 'presence_update',
        userId: newPresence?.userId,
        guildId: newPresence?.guild?.id
      });
    } finally {
      if (this.metricsService) {
        const processingTime = Date.now() - startTime;
        this.metricsService.recordPresenceEvent(processingTime, success);
        
        if (this.presenceEventHandler) {
          const queueSize = (this.presenceEventHandler as any).presenceUpdateQueue?.size || 0;
          this.metricsService.updatePresenceQueueSize(queueSize);
        }
      }
    }
  }

  /**
   * Load configurations for all servers the bot is in
   */
  private async loadAllServerConfigurations(): Promise<void> {
    try {
      const serverIds = await this.databaseService.getAllServerIds();
      const botGuilds = this.client.guilds.cache.map(guild => guild.id);

      for (const guildId of botGuilds) {
        let serverConfig = await this.databaseService.getServerConfig(guildId);

        if (!serverConfig) {
          serverConfig = await this.databaseService.createDefaultServerConfig(guildId);
        }

        if (this.autoChannelManager && serverConfig.enabled) {
          this.autoChannelManager.loadChannelConfigs(serverConfig.autoChannels);
        }
      }

      for (const serverId of serverIds) {
        if (!botGuilds.includes(serverId)) {
          console.log(`Bot no longer in server ${serverId}, keeping config for potential rejoin`);
        }
      }

      console.log(`Loaded configurations for ${botGuilds.length} servers`);
    } catch (error) {
      console.error('Error loading server configurations:', error);
    }
  }

  /**
   * Reload configuration for a specific server
   */
  public async reloadServerConfiguration(serverId: string): Promise<void> {
    try {
      const serverConfig = await this.databaseService.getServerConfig(serverId);
      if (!serverConfig) {
        console.warn(`No configuration found for server ${serverId}`);
        return;
      }

      if (this.autoChannelManager) {
        this.autoChannelManager.loadChannelConfigs(serverConfig.autoChannels);
      }

      if (this.commandManager) {
        await this.commandManager.reloadServerConfig(serverId);
      }

      console.log(`Reloaded configuration for server ${serverId}`);
    } catch (error) {
      console.error('Error reloading server configuration:', error);
      throw error;
    }
  }

  /**
   * Start the Discord bot
   */
  public async start(): Promise<void> {
    try {
      logger.info('Starting Discord bot', {
        component: 'DiscordBotService',
        operation: 'start'
      });

      const config = getDiscordConfig();
      await this.client.login(config.botToken);
      
      logger.info('Discord bot login successful', {
        component: 'DiscordBotService',
        operation: 'login'
      });
    } catch (error) {
      logger.error('Failed to start Discord bot', {
        component: 'DiscordBotService',
        operation: 'start'
      }, error as Error);
      throw error;
    }
  }

  /**
   * Stop the Discord bot
   */
  public async stop(): Promise<void> {
    try {
      if (this.autoChannelManager) {
        this.autoChannelManager.stop();
      }

      if (this.presenceSyncService) {
        this.presenceSyncService.stop();
      }

      if (this.presenceEventHandler) {
        this.presenceEventHandler.clearCache();
      }

      if (this.metricsService) {
        this.metricsService.destroy();
      }

      if (this.client) {
        await this.client.destroy();
      }

      this.isReady = false;
      console.log('Discord bot service stopped');
    } catch (error) {
      console.error('Error stopping Discord bot:', error);
      throw error;
    }
  }

  /**
   * Get bot status
   */
  public getStatus(): { ready: boolean; guilds: number; users: number } {
    return {
      ready: this.isReady,
      guilds: this.client.guilds.cache.size,
      users: this.client.users.cache.size
    };
  }

  /**
   * Get auto channel manager (for external access)
   */
  public getAutoChannelManager(): AutoChannelManager | null {
    return this.autoChannelManager;
  }

  /**
   * Get command manager (for external access)
   */
  public getCommandManager(): CommandManager | null {
    return this.commandManager;
  }

  /**
   * Get Discord client (for external access)
   */
  public getClient(): Client {
    return this.client;
  }

  /**
   * Get presence event handler (for external access)
   */
  public getPresenceEventHandler(): PresenceEventHandler | null {
    return this.presenceEventHandler;
  }

  /**
   * Get presence sync service (for external access)
   */
  public getPresenceSyncService(): PresenceSyncService | null {
    return this.presenceSyncService;
  }

  /**
   * Get diagnostic service (for external access)
   */
  public getDiagnosticService(): DiagnosticService | null {
    return this.diagnosticService;
  }

  /**
   * Get presence error handler (for external access)
   */
  public getPresenceErrorHandler() {
    return presenceErrorHandler;
  }

  /**
   * Run diagnostics and return report
   */
  public async runDiagnostics() {
    if (!this.diagnosticService) {
      throw new Error('Diagnostic service not initialized');
    }
    return await this.diagnosticService.runDiagnosticsWithAlerts();
  }

  /**
   * Get metrics service (for external access)
   */
  public getMetricsService(): MetricsService | null {
    return this.metricsService;
  }

  /**
   * Setup metrics monitoring and alerts
   */
  private setupMetricsMonitoring(): void {
    if (!this.metricsService) {
      return;
    }

    this.metricsService.on('alert', (alert: any) => {
      const logLevel = alert.severity === 'critical' ? 'error' : 'warn';
      logger[logLevel]('Metrics alert triggered', {
        component: 'DiscordBotService',
        operation: 'metrics_alert',
        metadata: {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          value: alert.value,
          threshold: alert.threshold,
          timestamp: alert.timestamp
        }
      });
    });

    setInterval(() => {
      if (this.metricsService) {
        const status = this.getStatus();
        this.metricsService.updateSystemMetrics({
          discordConnected: this.isReady,
          cacheConnected: this.cacheService.isAvailable(),
          databaseConnected: true,
          guildsCount: status.guilds,
          usersCount: status.users
        });

        if (this.presenceEventHandler) {
          const memoryCacheStats = this.presenceEventHandler.getMemoryCacheStats();
          this.metricsService.updateActiveUsers(memoryCacheStats.size);
        }
      }
    }, 30000);

    logger.info('Metrics monitoring setup completed', {
      component: 'DiscordBotService',
      operation: 'metrics_setup'
    });
  }
}