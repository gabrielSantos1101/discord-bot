import dotenv from 'dotenv';
import { CacheServiceFactory } from './services';
import { DiscordClientFactory } from './services/DiscordClientFactory';
import { loadConfig } from './utils/config';

// Load environment variables
dotenv.config();

// Main application entry point
async function main() {
  let databaseService: any = null;
  let botService: any = null;
  console.log('Discord Bot API starting...');
  
  // Load configuration
  const config = loadConfig();
  
  // Initialize Cache Service (Task 4 - Complete)
  try {
    console.log('Initializing Cache Service...');
    const cacheService = await CacheServiceFactory.create(config.cache);
    
    if (cacheService.isAvailable()) {
      console.log('✓ Cache Service initialized and connected to Redis');
      
      // Show cache stats
      const stats = await cacheService.getStats();
      if (stats && stats.connected) {
        console.log(`  → Redis memory usage: ${stats.memory || 'unknown'}`);
        console.log(`  → Cached keys: ${stats.keyCount || 0}`);
      }
    } else {
      console.log('⚠ Cache Service initialized but not available (disabled or connection failed)');
    }
  } catch (error: any) {
    console.error('✗ Failed to initialize Cache Service:', error.message);
  }
  
  // Initialize Discord Client (Task 3 - Complete)
  try {
    console.log('Initializing Discord Client...');
    DiscordClientFactory.getInstance();
    console.log('✓ Discord Client initialized successfully');
    
    // Test connection if bot token is available
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
  
  // Initialize REST API Service (Task 5.1 - Complete, Task 7 - Enhanced)
  let apiServer: any = null;
  try {
    console.log('Initializing REST API Service...');
    const { ApiServer } = await import('./api');
    apiServer = new ApiServer(config);
    
    // Set services for use in routes
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
  
  // Initialize Database Service (Task 7 - Complete)
  try {
    console.log('Initializing Database Service...');
    const { DatabaseService } = await import('./services/DatabaseService');
    databaseService = new DatabaseService();
    await databaseService.initialize();
    console.log('✓ Database Service initialized successfully');
  } catch (error: any) {
    console.error('✗ Failed to initialize Database Service:', error.message);
  }

  // Initialize Discord Bot Service (Task 6 - Complete, Task 7 - Enhanced)
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

  // Setup signal handlers with service references
  const services = { botService, databaseService };
  
  // Handle process signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM', services));
  process.on('SIGINT', () => gracefulShutdown('SIGINT', services));

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await gracefulShutdown('uncaughtException', services);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await gracefulShutdown('unhandledRejection', services);
  });
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string, services: { botService?: any, databaseService?: any } = {}) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  
  try {
    // Stop bot service
    if (services.botService) {
      await services.botService.stop();
      console.log('✓ Bot service stopped');
    }
    
    // Close database service
    if (services.databaseService) {
      await services.databaseService.close();
      console.log('✓ Database service closed');
    }
    
    // Close cache service
    await CacheServiceFactory.close();
    console.log('✓ Cache service closed');
    
    console.log('✓ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error during shutdown:', error);
    process.exit(1);
  }
}



// Start the application
main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});