/**
 * Example usage of the DiscordClient for direct API queries
 * This demonstrates how to use the Discord client to fetch user data
 */

import { ErrorCode } from '../models/ErrorTypes';
import { DiscordClientFactory } from '../services/DiscordClientFactory';

async function demonstrateDiscordClient() {
  try {
    // Create Discord client instance
    const client = DiscordClientFactory.create();
    
    console.log('Discord Client created successfully');
    
    // Example 1: Get user data
    console.log('\n--- Example 1: Get User Data ---');
    try {
      const userData = await client.getUserData('123456789012345678');
      console.log('User Data:', {
        id: userData.id,
        username: userData.username,
        status: userData.status,
        activitiesCount: userData.activities.length,
        hasRichPresence: !!userData.presence
      });
    } catch (error: any) {
      if (error.code === ErrorCode.USER_NOT_FOUND) {
        console.log('User not found (expected for demo)');
      } else {
        console.error('Error fetching user data:', error.message);
      }
    }
    
    // Example 2: Get user activities
    console.log('\n--- Example 2: Get User Activities ---');
    try {
      const activities = await client.getUserActivities('123456789012345678');
      console.log('User Activities:', activities);
    } catch (error: any) {
      console.log('Could not fetch activities (expected for demo)');
    }
    
    // Example 3: Get user status
    console.log('\n--- Example 3: Get User Status ---');
    try {
      const status = await client.getUserStatus('123456789012345678');
      console.log('User Status:', status);
    } catch (error: any) {
      console.log('Could not fetch status (expected for demo)');
    }
    
    // Example 4: Get Rich Presence
    console.log('\n--- Example 4: Get Rich Presence ---');
    try {
      const richPresence = await client.getUserRichPresence('123456789012345678');
      console.log('Rich Presence:', richPresence);
    } catch (error: any) {
      console.log('Could not fetch Rich Presence (expected for demo)');
    }
    
    console.log('\n--- Discord Client Demo Complete ---');
    
  } catch (error: any) {
    console.error('Failed to create Discord client:', error.message);
    console.log('Make sure to set DISCORD_BOT_TOKEN environment variable');
  }
}

// Example of testing connection
async function testDiscordConnection() {
  console.log('\n--- Testing Discord Connection ---');
  
  try {
    const isConnected = await DiscordClientFactory.testConnection();
    console.log('Connection test result:', isConnected ? 'SUCCESS' : 'FAILED');
  } catch (error: any) {
    console.error('Connection test failed:', error.message);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('Discord Client Usage Examples');
  console.log('============================');
  
  demonstrateDiscordClient()
    .then(() => testDiscordConnection())
    .catch(console.error);
}

export { demonstrateDiscordClient, testDiscordConnection };
