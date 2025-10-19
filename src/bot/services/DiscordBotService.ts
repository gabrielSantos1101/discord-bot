import { Client, Events, GatewayIntentBits } from 'discord.js';
import { CacheService } from '../../services/CacheService';
import { DatabaseService } from '../../services/DatabaseService';
import { getDiscordConfig } from '../../utils/config';
import { logger } from '../../utils/logger';
import { CommandManager } from '../commands/CommandManager';
import { AutoChannelManager } from '../managers/AutoChannelManager';

/**
 * Main Discord bot service that manages the bot connection and integrates all components
 */
export class DiscordBotService {
  private client: Client;
  private autoChannelManager: AutoChannelManager | null = null;
  private commandManager: CommandManager | null = null;
  private databaseService: DatabaseService;
  private cacheService: CacheService;
  private isReady = false;

  constructor(databaseService: DatabaseService, cacheService: CacheService) {
    this.databaseService = databaseService;
    this.cacheService = cacheService;
    
    // Initialize Discord client with required intents
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

      await this.loadAllServerConfigurations();

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
}