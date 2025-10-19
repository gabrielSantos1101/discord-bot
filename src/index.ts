import dotenv from 'dotenv';
import { CacheServiceFactory } from './services';
import { DiscordClientFactory } from './services/DiscordClientFactory';
import { loadConfig } from './utils/config';

// Load environment variables
dotenv.config();

// Main application entry point
async function main() {
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
  
  // TODO: Initialize remaining services in next tasks
  // - REST API Service (Task 5)
  // - Database Service
  // - Discord Bot Service (Task 6)
  
  console.log('Application initialized successfully');
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  
  try {
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

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await gracefulShutdown('unhandledRejection');
});

// Start the application
main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});