import dotenv from 'dotenv';
import { DiscordClientFactory } from './services/DiscordClientFactory';

// Load environment variables
dotenv.config();

// Main application entry point
async function main() {
  console.log('Discord Bot API starting...');
  
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
  // - Cache Service (Task 4)
  // - Database Service
  // - Discord Bot Service (Task 6)
  
  console.log('Application initialized successfully');
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});