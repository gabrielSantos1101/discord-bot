import { getDiscordConfig, validateBotToken } from '../utils/config';
import { CacheService } from './CacheService';
import { DiscordClient } from './DiscordClient';

/**
 * Factory for creating configured Discord client instances
 */
export class DiscordClientFactory {
  private static instance: DiscordClient | null = null;

  /**
   * Create a new Discord client instance
   */
  static create(cacheService: CacheService): DiscordClient {
    const config = getDiscordConfig();
    
    if (!config.botToken) {
      throw new Error('Discord bot token is required. Please set DISCORD_BOT_TOKEN environment variable.');
    }

    if (!validateBotToken(config.botToken)) {
      throw new Error('Invalid Discord bot token format. Please check your DISCORD_BOT_TOKEN environment variable.');
    }

    return new DiscordClient(config.botToken, cacheService);
  }

  /**
   * Get singleton instance of Discord client
   */
  static getInstance(cacheService: CacheService): DiscordClient {
    if (!this.instance) {
      this.instance = this.create(cacheService);
    }
    return this.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    this.instance = null;
  }

  /**
   * Test Discord client connection
   */
  static async testConnection(cacheService: CacheService): Promise<boolean> {
    try {
      const client = this.create(cacheService);
      // Try to get the bot's own user data to test the connection
      const botUser = await client.getUserData('@me');
      return botUser.bot === true;
    } catch (error) {
      console.error('Discord client connection test failed:', error);
      return false;
    }
  }
}