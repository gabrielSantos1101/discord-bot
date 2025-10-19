import { createClient, RedisClientType } from 'redis';
import type { UserActivityResponse, UserPresenceResponse, UserStatusResponse } from '../models/ApiResponses';
import type { CacheConfig } from '../utils/config';

/**
 * Cache keys for different data types
 */
export const CacheKeys = {
  USER_STATUS: (userId: string) => `user:${userId}:status`,
  USER_ACTIVITY: (userId: string) => `user:${userId}:activity`,
  USER_PRESENCE: (userId: string) => `user:${userId}:presence`,
  AUTO_CHANNELS: (templateId: string) => `channel:${templateId}:auto`,
  SERVER_CONFIG: (serverId: string) => `server:${serverId}:config`,
} as const;

/**
 * TTL values for different data types (in seconds)
 */
export const CacheTTL = {
  USER_STATUS: 30,      // 30 seconds for status
  USER_ACTIVITY: 60,    // 60 seconds for activities
  USER_PRESENCE: 45,    // 45 seconds for presence
  AUTO_CHANNELS: 300,   // 5 minutes for channel data
  SERVER_CONFIG: 86400, // 24 hours for server config
} as const;

/**
 * Redis cache service for storing Discord user data and configurations
 */
export class CacheService {
  private client: RedisClientType | null = null;
  private config: CacheConfig;
  private isConnected = false;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('Cache is disabled, skipping Redis initialization');
      return;
    }

    try {
      // Use Redis URL if provided, otherwise construct from individual config
      let redisConfig: any;
      
      if (this.config.redisUrl) {
        redisConfig = {
          url: this.config.redisUrl,
          socket: {
            reconnectStrategy: (retries: number) => {
              // Exponential backoff with max 30 seconds
              return Math.min(retries * 50, 30000);
            }
          }
        };
      } else {
        redisConfig = {
          socket: {
            host: this.config.redisHost,
            port: this.config.redisPort,
            reconnectStrategy: (retries: number) => {
              // Exponential backoff with max 30 seconds
              return Math.min(retries * 50, 30000);
            }
          },
          database: this.config.redisDb
        };

        if (this.config.redisPassword) {
          redisConfig.password = this.config.redisPassword;
        }
      }

      this.client = createClient(redisConfig);

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('Redis client disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      console.log('Redis cache service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Redis cache:', error);
      this.config.enabled = false;
      this.client = null;
    }
  }

  /**
   * Check if cache is available and enabled
   */
  isAvailable(): boolean {
    return this.config.enabled && this.client !== null && this.isConnected;
  }

  /**
   * Get cached user status
   */
  async getUserStatus(userId: string): Promise<UserStatusResponse | null> {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.client!.get(CacheKeys.USER_STATUS(userId));
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error getting user status from cache:', error);
      return null;
    }
  }

  /**
   * Cache user status data
   */
  async setUserStatus(userId: string, data: UserStatusResponse, ttl?: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = CacheKeys.USER_STATUS(userId);
      const value = JSON.stringify(data);
      const expiry = ttl || CacheTTL.USER_STATUS;
      
      await this.client!.setEx(key, expiry, value);
    } catch (error) {
      console.error('Error setting user status in cache:', error);
    }
  }

  /**
   * Get cached user activity
   */
  async getUserActivity(userId: string): Promise<UserActivityResponse | null> {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.client!.get(CacheKeys.USER_ACTIVITY(userId));
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error getting user activity from cache:', error);
      return null;
    }
  }

  /**
   * Cache user activity data
   */
  async setUserActivity(userId: string, data: UserActivityResponse, ttl?: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = CacheKeys.USER_ACTIVITY(userId);
      const value = JSON.stringify(data);
      const expiry = ttl || CacheTTL.USER_ACTIVITY;
      
      await this.client!.setEx(key, expiry, value);
    } catch (error) {
      console.error('Error setting user activity in cache:', error);
    }
  }

  /**
   * Get cached user presence (Rich Presence)
   */
  async getUserPresence(userId: string): Promise<UserPresenceResponse | null> {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.client!.get(CacheKeys.USER_PRESENCE(userId));
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error getting user presence from cache:', error);
      return null;
    }
  }

  /**
   * Cache user presence data
   */
  async setUserPresence(userId: string, data: UserPresenceResponse, ttl?: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = CacheKeys.USER_PRESENCE(userId);
      const value = JSON.stringify(data);
      const expiry = ttl || CacheTTL.USER_PRESENCE;
      
      await this.client!.setEx(key, expiry, value);
    } catch (error) {
      console.error('Error setting user presence in cache:', error);
    }
  }

  /**
   * Get cached auto channels data
   */
  async getAutoChannels(templateId: string): Promise<string[] | null> {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.client!.get(CacheKeys.AUTO_CHANNELS(templateId));
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error getting auto channels from cache:', error);
      return null;
    }
  }

  /**
   * Cache auto channels data
   */
  async setAutoChannels(templateId: string, channelIds: string[], ttl?: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = CacheKeys.AUTO_CHANNELS(templateId);
      const value = JSON.stringify(channelIds);
      const expiry = ttl || CacheTTL.AUTO_CHANNELS;
      
      await this.client!.setEx(key, expiry, value);
    } catch (error) {
      console.error('Error setting auto channels in cache:', error);
    }
  }

  /**
   * Get cached server configuration
   */
  async getServerConfig(serverId: string): Promise<any | null> {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.client!.get(CacheKeys.SERVER_CONFIG(serverId));
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error getting server config from cache:', error);
      return null;
    }
  }

  /**
   * Cache server configuration
   */
  async setServerConfig(serverId: string, config: any, ttl?: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = CacheKeys.SERVER_CONFIG(serverId);
      const value = JSON.stringify(config);
      const expiry = ttl || CacheTTL.SERVER_CONFIG;
      
      await this.client!.setEx(key, expiry, value);
    } catch (error) {
      console.error('Error setting server config in cache:', error);
    }
  }

  /**
   * Invalidate cache for a specific user
   */
  async invalidateUser(userId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const keys = [
        CacheKeys.USER_STATUS(userId),
        CacheKeys.USER_ACTIVITY(userId),
        CacheKeys.USER_PRESENCE(userId)
      ];
      
      await this.client!.del(keys);
    } catch (error) {
      console.error('Error invalidating user cache:', error);
    }
  }

  /**
   * Invalidate cache for auto channels
   */
  async invalidateAutoChannels(templateId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.client!.del(CacheKeys.AUTO_CHANNELS(templateId));
    } catch (error) {
      console.error('Error invalidating auto channels cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ connected: boolean; keyCount?: number; memory?: string } | null> {
    if (!this.isAvailable()) {
      return { connected: false };
    }

    try {
      const info = await this.client!.info('memory');
      const keyCount = await this.client!.dbSize();
      
      // Parse memory usage from info string
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memory = memoryMatch ? memoryMatch[1] : 'unknown';

      const result: { connected: boolean; keyCount?: number; memory?: string } = {
        connected: true,
        keyCount
      };
      
      if (memory) {
        result.memory = memory;
      }
      
      return result;
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { connected: false };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        console.log('Redis connection closed');
      } catch (error) {
        console.error('Error closing Redis connection:', error);
      } finally {
        this.client = null;
        this.isConnected = false;
      }
    }
  }

  /**
   * Clear all cache data (use with caution)
   */
  async clearAll(): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.client!.flushDb();
      console.log('All cache data cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }
}