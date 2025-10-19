import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Main application entry point
async function main() {
  console.log('Discord Bot API starting...');
  
  // TODO: Initialize services in next tasks
  // - Discord Bot Service
  // - REST API Service  
  // - Cache Service
  // - Database Service
  
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