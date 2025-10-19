import { ApiServer } from '../api/server';
import { DiscordBotService } from '../bot/services/DiscordBotService';
import { AppConfig } from '../utils/config';
import { connectionRecovery } from '../utils/errorHandler';
import { LogContext, logger } from '../utils/logger';
import { CacheService } from './CacheService';
import { CacheServiceFactory } from './CacheServiceFactory';
import { DatabaseService } from './DatabaseService';
import { DiscordClientFactory } from './DiscordClientFactory';

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopped' | 'error';
  details?: any;
  lastCheck?: Date;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
  uptime: number;
  timestamp: Date;
}

export class ServiceOrchestrator {
  private config: AppConfig;
  private services: Map<string, any> = new Map();
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private isShuttingDown = false;
  private startTime = Date.now();

  private cacheService?: CacheService;
  private databaseService?: DatabaseService;
  private discordBotService?: DiscordBotService;
  private apiServer?: ApiServer;

  constructor(config: AppConfig) {
    this.config = config;
    this.initializeHealthStatus();
  }

  private initializeHealthStatus(): void {
    const serviceNames = ['cache', 'database', 'discord-client', 'discord-bot', 'api-server'];
    
    for (const name of serviceNames) {
      this.serviceHealth.set(name, {
        name,
        status: 'stopped',
        lastCheck: new Date()
      });
    }
  }

  public async start(): Promise<void> {
    const context: LogContext = {
      component: 'ServiceOrchestrator',
      operation: 'startup'
    };

    logger.info('Starting service orchestration...', context);

    try {
      await this.startCacheService(context);
      await this.startDatabaseService(context);
      await this.startDiscordClient(context);
      await this.startApiServer(context);
      await this.startDiscordBotService(context);

      logger.info('All services started successfully', {
        ...context,
        operation: 'startup_complete',
        metadata: {
          servicesCount: this.services.size,
          uptime: this.getUptime()
        }
      });

    } catch (error) {
      logger.error('Failed to start services', context, error as Error);
      await this.shutdown();
      throw error;
    }
  }

  private async startCacheService(context: LogContext): Promise<void> {
    this.updateServiceHealth('cache', 'starting');
    
    try {
      logger.info('Starting Cache Service...', {
        ...context,
        operation: 'cache_start'
      });

      this.cacheService = await connectionRecovery.attemptRecovery(
        'CacheService',
        () => CacheServiceFactory.create(this.config.cache),
        context
      );

      this.services.set('cache', this.cacheService);

      if (this.cacheService.isAvailable()) {
        this.updateServiceHealth('cache', 'healthy', {
          available: true,
          enabled: this.config.cache.enabled
        });
        
        logger.info('Cache Service started successfully', {
          ...context,
          operation: 'cache_start_success'
        });
      } else {
        this.updateServiceHealth('cache', 'unhealthy', {
          available: false,
          reason: 'disabled or connection failed'
        });
        
        logger.warn('Cache Service started but not available', {
          ...context,
          operation: 'cache_start_warning'
        });
      }
    } catch (error) {
      this.updateServiceHealth('cache', 'error', { error: (error as Error).message });
      logger.error('Failed to start Cache Service', {
        ...context,
        operation: 'cache_start_failed'
      }, error as Error);
    }
  }

  private async startDatabaseService(context: LogContext): Promise<void> {
    this.updateServiceHealth('database', 'starting');
    
    try {
      logger.info('Starting Database Service...', {
        ...context,
        operation: 'database_start'
      });

      this.databaseService = new DatabaseService();
      await this.databaseService.initialize();
      
      this.services.set('database', this.databaseService);
      this.updateServiceHealth('database', 'healthy');
      
      logger.info('Database Service started successfully', {
        ...context,
        operation: 'database_start_success'
      });
    } catch (error) {
      this.updateServiceHealth('database', 'error', { error: (error as Error).message });
      logger.error('Failed to start Database Service', {
        ...context,
        operation: 'database_start_failed'
      }, error as Error);
      throw error;
    }
  }

  private async startDiscordClient(context: LogContext): Promise<void> {
    this.updateServiceHealth('discord-client', 'starting');
    
    try {
      logger.info('Starting Discord Client...', {
        ...context,
        operation: 'discord_client_start'
      });

      if (!this.cacheService) {
        throw new Error('Cache Service is required for Discord Client');
      }

      DiscordClientFactory.getInstance(this.cacheService);

      if (this.config.discord.botToken) {
        const connectionTest = await DiscordClientFactory.testConnection(this.cacheService);
        
        if (connectionTest) {
          this.updateServiceHealth('discord-client', 'healthy', {
            connected: true,
            purpose: 'API queries'
          });
          
          logger.info('Discord Client started and connected successfully', {
            ...context,
            operation: 'discord_client_start_success'
          });
        } else {
          this.updateServiceHealth('discord-client', 'unhealthy', {
            connected: false,
            reason: 'connection test failed'
          });
          
          logger.warn('Discord Client started but connection test failed', {
            ...context,
            operation: 'discord_client_start_warning'
          });
        }
      } else {
        this.updateServiceHealth('discord-client', 'unhealthy', {
          connected: false,
          reason: 'no bot token configured'
        });
        
        logger.warn('Discord Client started but no bot token configured', {
          ...context,
          operation: 'discord_client_start_no_token'
        });
      }

      this.services.set('discord-client', DiscordClientFactory.getInstance(this.cacheService));
    } catch (error) {
      this.updateServiceHealth('discord-client', 'error', { error: (error as Error).message });
      logger.error('Failed to start Discord Client', {
        ...context,
        operation: 'discord_client_start_failed'
      }, error as Error);
      throw error;
    }
  }

  private async startApiServer(context: LogContext): Promise<void> {
    this.updateServiceHealth('api-server', 'starting');
    
    try {
      logger.info('Starting API Server...', {
        ...context,
        operation: 'api_server_start'
      });

      this.apiServer = new ApiServer(this.config);

      if (this.databaseService) {
        this.apiServer.setDatabaseService(this.databaseService);
      }

      if (this.cacheService) {
        this.apiServer.setCacheService(this.cacheService);
      }
      
      await this.apiServer.start();
      
      this.services.set('api-server', this.apiServer);
      this.updateServiceHealth('api-server', 'healthy', {
        port: this.config.api.port,
        purpose: 'REST API for queries'
      });
      
      logger.info('API Server started successfully', {
        ...context,
        operation: 'api_server_start_success',
        metadata: { port: this.config.api.port }
      });
    } catch (error) {
      this.updateServiceHealth('api-server', 'error', { error: (error as Error).message });
      logger.error('Failed to start API Server', {
        ...context,
        operation: 'api_server_start_failed'
      }, error as Error);
      throw error;
    }
  }

  private async startDiscordBotService(context: LogContext): Promise<void> {
    this.updateServiceHealth('discord-bot', 'starting');
    
    try {
      if (!this.databaseService) {
        throw new Error('Database Service is required for Discord Bot Service');
      }

      if (!this.cacheService) {
        logger.warn('Cache Service not available, Discord Bot will work without cache', {
          ...context,
          operation: 'discord_bot_start_no_cache'
        });
        this.cacheService = await CacheServiceFactory.create({ ...this.config.cache, enabled: false });
      }

      logger.info('Starting Discord Bot Service...', {
        ...context,
        operation: 'discord_bot_start'
      });

      this.discordBotService = new DiscordBotService(this.databaseService, this.cacheService);
      await this.discordBotService.start();
      
      if (this.apiServer) {
        this.apiServer.setBotService(this.discordBotService);
      }
      
      this.services.set('discord-bot', this.discordBotService);
      
      const status = this.discordBotService.getStatus();
      this.updateServiceHealth('discord-bot', 'healthy', {
        ready: status.ready,
        guilds: status.guilds,
        users: status.users,
        purpose: 'Channel management'
      });
      
      logger.info('Discord Bot Service started successfully', {
        ...context,
        operation: 'discord_bot_start_success',
        metadata: {
          guilds: status.guilds,
          users: status.users
        }
      });
    } catch (error) {
      this.updateServiceHealth('discord-bot', 'error', { error: (error as Error).message });
      logger.error('Failed to start Discord Bot Service', {
        ...context,
        operation: 'discord_bot_start_failed'
      }, error as Error);
      logger.warn('Continuing without Discord Bot Service - API will still work for queries', context);
    }
  }

  private updateServiceHealth(
    serviceName: string, 
    status: ServiceHealth['status'], 
    details?: any
  ): void {
    this.serviceHealth.set(serviceName, {
      name: serviceName,
      status,
      details,
      lastCheck: new Date()
    });
  }

  public getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.serviceHealth.get(serviceName);
  }

  public async getSystemHealth(): Promise<SystemHealth> {
    const services = Array.from(this.serviceHealth.values());
    
    await this.performHealthChecks();

    let overallStatus: SystemHealth['status'] = 'healthy';
    
    const criticalServices = ['api-server', 'discord-client'];
    const hasCriticalErrors = services.some(service => 
      criticalServices.includes(service.name) && 
      (service.status === 'error' || service.status === 'unhealthy')
    );
    
    const hasAnyErrors = services.some(service => 
      service.status === 'error' || service.status === 'unhealthy'
    );
    
    if (hasCriticalErrors) {
      overallStatus = 'unhealthy';
    } else if (hasAnyErrors) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      services: Array.from(this.serviceHealth.values()),
      uptime: this.getUptime(),
      timestamp: new Date()
    };
  }

  private async performHealthChecks(): Promise<void> {
    if (this.cacheService) {
      try {
        const isAvailable = this.cacheService.isAvailable();
        this.updateServiceHealth('cache', isAvailable ? 'healthy' : 'unhealthy', {
          available: isAvailable
        });
      } catch (error) {
        this.updateServiceHealth('cache', 'error', { error: (error as Error).message });
      }
    }

    if (this.databaseService) {
      try {
        this.updateServiceHealth('database', 'healthy');
      } catch (error) {
        this.updateServiceHealth('database', 'error', { error: (error as Error).message });
      }
    }

    try {
      if (this.cacheService) {
        const discordClient = DiscordClientFactory.getInstance(this.cacheService);
        if (discordClient && typeof discordClient.healthCheck === 'function') {
          const health = await discordClient.healthCheck();
          this.updateServiceHealth('discord-client', health.healthy ? 'healthy' : 'unhealthy', health);
        }
      }
    } catch (error) {
      this.updateServiceHealth('discord-client', 'error', { error: (error as Error).message });
    }

    if (this.discordBotService) {
      try {
        const status = this.discordBotService.getStatus();
        this.updateServiceHealth('discord-bot', status.ready ? 'healthy' : 'unhealthy', status);
      } catch (error) {
        this.updateServiceHealth('discord-bot', 'error', { error: (error as Error).message });
      }
    }

    if (this.apiServer) {
      this.updateServiceHealth('api-server', 'healthy', {
        port: this.config.api.port
      });
    }
  }

  public getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  public getService<T>(serviceName: string): T | undefined {
    return this.services.get(serviceName) as T;
  }

  public isReady(): boolean {
    const apiServerHealth = this.serviceHealth.get('api-server');
    const discordClientHealth = this.serviceHealth.get('discord-client');
    
    return apiServerHealth?.status === 'healthy' && 
           (discordClientHealth?.status === 'healthy' || discordClientHealth?.status === 'unhealthy');
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    
    const context: LogContext = {
      component: 'ServiceOrchestrator',
      operation: 'shutdown'
    };

    logger.info('Starting graceful shutdown...', context);

    const shutdownTimeout = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit', context);
      process.exit(1);
    }, 30000);

    try {
      if (this.discordBotService) {
        logger.info('Stopping Discord Bot Service...', context);
        await this.discordBotService.stop();
        this.updateServiceHealth('discord-bot', 'stopped');
        logger.info('Discord Bot Service stopped', context);
      }

      if (this.apiServer) {
        logger.info('API Server shutdown handled by its own process handlers', context);
        this.updateServiceHealth('api-server', 'stopped');
      }

      if (this.databaseService) {
        logger.info('Closing Database Service...', context);
        await this.databaseService.close();
        this.updateServiceHealth('database', 'stopped');
        logger.info('Database Service closed', context);
      }

      if (this.cacheService) {
        logger.info('Closing Cache Service...', context);
        await CacheServiceFactory.close();
        this.updateServiceHealth('cache', 'stopped');
        logger.info('Cache Service closed', context);
      }

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed successfully', context);
      
    } catch (error) {
      clearTimeout(shutdownTimeout);
      logger.error('Error during shutdown', context, error as Error);
      throw error;
    }
  }
}