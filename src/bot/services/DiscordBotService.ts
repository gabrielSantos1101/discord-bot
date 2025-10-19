import { Client, Events, GatewayIntentBits } from 'discord.js';
import { CacheService } from '../../services/CacheService';
import { DatabaseService } from '../../services/DatabaseService';
import { getDiscordConfig } from '../../utils/config';
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
        GatewayIntentBits.MessageContent
      ]
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
   * Handle bot ready event
   */
  private async onReady(client: Client): Promise<void> {
    console.log(`Discord bot ready! Logged in as ${client.user?.tag}`);
    
    try {
      // Initialize managers
      this.autoChannelManager = new AutoChannelManager(this.client, this.cacheService);
      this.commandManager = new CommandManager(this.client, this.databaseService);

      // Load configurations for all servers
      await this.loadAllServerConfigurations();

      this.isReady = true;
      console.log('Discord bot service fully initialized');
    } catch (error) {
      console.error('Error initializing bot service:', error);
    }
  }

  /**
   * Handle bot errors
   */
  private onError(error: Error): void {
    console.error('Discord client error:', error);
  }

  /**
   * Handle bot warnings
   */
  private onWarn(warning: string): void {
    console.warn('Discord client warning:', warning);
  }

  /**
   * Handle bot joining a new guild
   */
  private async onGuildJoin(guild: any): Promise<void> {
    console.log(`Joined new guild: ${guild.name} (${guild.id})`);
    
    try {
      // Create default configuration for new guild
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

      // Load configurations for servers bot is currently in
      for (const guildId of botGuilds) {
        let serverConfig = await this.databaseService.getServerConfig(guildId);
        
        // Create default config if none exists
        if (!serverConfig) {
          serverConfig = await this.databaseService.createDefaultServerConfig(guildId);
        }

        // Load channel configurations into AutoChannelManager
        if (this.autoChannelManager && serverConfig.enabled) {
          this.autoChannelManager.loadChannelConfigs(serverConfig.autoChannels);
        }
      }

      // Clean up configurations for servers bot is no longer in
      for (const serverId of serverIds) {
        if (!botGuilds.includes(serverId)) {
          console.log(`Bot no longer in server ${serverId}, keeping config for potential rejoin`);
          // Note: We keep the config in case the bot rejoins the server later
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

      // Reload channel configurations in AutoChannelManager
      if (this.autoChannelManager) {
        this.autoChannelManager.loadChannelConfigs(serverConfig.autoChannels);
      }

      // Notify command manager of config reload
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
      const config = getDiscordConfig();
      await this.client.login(config.botToken);
    } catch (error) {
      console.error('Failed to start Discord bot:', error);
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