import dotenv from 'dotenv';
import { CacheServiceFactory } from './services';
import { DiscordClientFactory } from './services/DiscordClientFactory';
import { loadConfig } from './utils/config';
import { connectionRecovery } from './utils/errorHandler';
import { LogContext, logger } from './utils/logger';

dotenv.config();

async function main() {
  let databaseService: any = null;
  let botService: any = null;
  
  const context: LogContext = {
    component: 'Application',
    operation: 'startup'
  };

  logger.info('Discord Bot API starting...', context);

  const config = loadConfig();
  
  logger.info('Configuration loaded', {
    ...context,
    metadata: {
      environment: config.environment,
      logLevel: config.logLevel,
      apiPort: config.api.port
    }
  });
 
  try {
    logger.info('Initializing Cache Service...', {
      ...context,
      operation: 'cache_init'
    });

    const cacheService = await connectionRecovery.attemptRecovery(
      'CacheService',
      () => CacheServiceFactory.create(config.cache),
      context
    );
    
    if (cacheService.isAvailable()) {
      logger.info('Cache Service initialized and connected', {
        ...context,
        operation: 'cache_init_success'
      });

      const stats = await cacheService.getStats();
      if (stats && stats.connected) {
        logger.info('Cache Service stats', {
          ...context,
          metadata: {
            memoryUsage: stats.memory || 'unknown',
            keyCount: stats.keyCount || 0,
            connected: stats.connected
          }
        });
      }
    } else {
      logger.warn('Cache Service initialized but not available', {
        ...context,
        operation: 'cache_init_warning',
        metadata: { reason: 'disabled or connection failed' }
      });
    }
  } catch (error: any) {
    logger.error('Failed to initialize Cache Service', {
      ...context,
      operation: 'cache_init_failed'
    }, error);
  }

  try {
    console.log('Initializing Discord Client...');
    DiscordClientFactory.getInstance();
    console.log('✓ Discord Client initialized successfully');
    
    if (process.env['DISCORD_BOT_TOKEN']) {
      console.log('Testing Discord API connection...');
      const connectionTest = await DiscordClientFactory.testConnection();
      console.log(connectionTest ? '✓ Discord API connection successful' : '✗ Discord API connection failed');
    } else {
      console.log('⚠ DISCORD_BOT_TOKEN not set - skipping connection test');
    }
  } catch (error: any) {
    console.error('✗ Failed to initialize Discord Client:', error.message);
  }

  let apiServer: any = null;
  try {
    console.log('Initializing REST API Service...');
    const { ApiServer } = await import('./api');
    apiServer = new ApiServer(config);
    
    if (databaseService) {
      apiServer.setDatabaseService(databaseService);
    }
    if (botService) {
      apiServer.setBotService(botService);
    }
    
    await apiServer.start();
    console.log(`✓ REST API Service started on port ${config.api.port}`);
  } catch (error: any) {
    console.error('✗ Failed to initialize REST API Service:', error.message);
  }
  
  try {
    console.log('Initializing Database Service...');
    const { DatabaseService } = await import('./services/DatabaseService');
    databaseService = new DatabaseService();
    await databaseService.initialize();
    console.log('✓ Database Service initialized successfully');
  } catch (error: any) {
    console.error('✗ Failed to initialize Database Service:', error.message);
  }

  try {
    console.log('Initializing Discord Bot Service...');
    const { DiscordBotService } = await import('./bot/services/DiscordBotService');
    const cacheService = await CacheServiceFactory.create(config.cache);
    
    if (databaseService) {
      botService = new DiscordBotService(databaseService, cacheService);
      await botService.start();
      console.log('✓ Discord Bot Service started successfully');
      
      const status = botService.getStatus();
      console.log(`  → Connected to ${status.guilds} guilds`);
      console.log(`  → Cached ${status.users} users`);
    } else {
      console.log('⚠ Skipping Discord Bot Service - Database Service not available');
    }
  } catch (error: any) {
    console.error('✗ Failed to initialize Discord Bot Service:', error.message);
  }
  
  console.log('Application initialized successfully');

  const services = { botService, databaseService };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM', services));
  process.on('SIGINT', () => gracefulShutdown('SIGINT', services));

  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception - Application will exit', {
      component: 'Application',
      operation: 'uncaught_exception'
    }, error);
    await gracefulShutdown('uncaughtException', services);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Promise Rejection - Application will exit', {
      component: 'Application',
      operation: 'unhandled_rejection',
      metadata: {
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: String(promise)
      }
    }, reason instanceof Error ? reason : new Error(String(reason)));
    await gracefulShutdown('unhandledRejection', services);
  });
}

async function gracefulShutdown(signal: string, services: { botService?: any, databaseService?: any } = {}) {
  const context: LogContext = {
    component: 'Application',
    operation: 'shutdown',
    metadata: { signal }
  };

  logger.info(`Received ${signal}, shutting down gracefully...`, context);
  
  const shutdownTimeout = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit', context);
    process.exit(1);
  }, 30000);

  try {
    if (services.botService) {
      logger.info('Stopping bot service...', context);
      await services.botService.stop();
      logger.info('Bot service stopped successfully', context);
    }

    if (services.databaseService) {
      logger.info('Closing database service...', context);
      await services.databaseService.close();
      logger.info('Database service closed successfully', context);
    }

    logger.info('Closing cache service...', context);
    await CacheServiceFactory.close();
    logger.info('Cache service closed successfully', context);
    
    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed successfully', context);
    process.exit(0);
  } catch (error) {
    clearTimeout(shutdownTimeout);
    logger.error('Error during shutdown', context, error as Error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Failed to start application', {
    component: 'Application',
    operation: 'startup_failed'
  }, error);
  process.exit(1);
});