import { createClient, RedisClientType } from 'redis';
import type { UserActivityResponse, UserPresenceResponse, UserStatusResponse } from '../models/ApiResponses';
import type { BatchPresenceResult, UserActivityData } from '../models/UserActivityData';
import type { CacheConfig } from '../utils/config';

/**
 * Cache keys for different data types
 */
export const CacheKeys = {
  USER_STATUS: (userId: string) => `user:${userId}:status`,
  USER_ACTIVITY: (userId: string) => `user:${userId}:activity`,
  USER_PRESENCE: (userId: string) => `user:${userId}:presence`,
  USER_PRESENCE_DATA: (userId: string) => `presence:${userId}`,
  GUILD_PRESENCES: (guildId: string) => `guild_presences:${guildId}`,
  PRESENCE_BATCH: (guildId: string) => `presence_batch:${guildId}`,
  AUTO_CHANNELS: (templateId: string) => `channel:${templateId}:auto`,
  SERVER_CONFIG: (serverId: string) => `server:${serverId}:config`,
} as const;

/**
 * TTL values for different data types (in seconds)
 */
export const CacheTTL = {
  USER_STATUS: 30,
  USER_ACTIVITY: 60,
  USER_PRESENCE: 45,
  USER_PRESENCE_DATA: 300,
  OFFLINE_USER: 900,
  BATCH_DATA: 60,
  AUTO_CHANNELS: 300,
  SERVER_CONFIG: 86400,
} as const;

/**
 * Redis cache service for storing Discord user data and configurations
 */
export class CacheService {
  private client: RedisClientType | null = null;
  private config: CacheConfig;
  private isConnected = false;

  private memoryCache = new Map<string, { data: UserActivityData; expiry: number }>();
  private memoryCleanupInterval: NodeJS.Timeout | null = null;

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
      let redisConfig: any;

      if (this.config.redisUrl) {
        redisConfig = {
          url: this.config.redisUrl,
          socket: {
            reconnectStrategy: (retries: number) => {
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
    this.setupMemoryCleanup();
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
   * Get cached user presence data (enhanced version)
   */
  async getUserPresenceData(userId: string): Promise<UserActivityData | null> {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.client!.get(CacheKeys.USER_PRESENCE_DATA(userId));
      if (!cached) return null;

      const data = JSON.parse(cached);
      if (data && data.lastUpdated) {
        const lastUpdatedStr = data.lastUpdated as string;
        data.lastUpdated = new Date(lastUpdatedStr);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error getting user presence data from cache:', error);
      return null;
    }
  }

  /**
   * Cache user presence data (enhanced version)
   */
  async setUserPresenceData(userId: string, data: UserActivityData, ttl?: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = CacheKeys.USER_PRESENCE_DATA(userId);

      let expiry = ttl;
      if (!expiry) {
        expiry = data.status === 'offline' ? CacheTTL.OFFLINE_USER : CacheTTL.USER_PRESENCE_DATA;
      }

      const serializedData = {
        ...data,
        lastUpdated: data.lastUpdated.toISOString()
      };

      const value = JSON.stringify(serializedData);
      await this.client!.setEx(key, expiry, value);
    } catch (error) {
      console.error('Error setting user presence data in cache:', error);
    }
  }

  /**
   * Get multiple user presences in batch
   */
  async getUserPresencesBatch(userIds: string[]): Promise<Map<string, UserActivityData>> {
    const result = new Map<string, UserActivityData>();

    if (!this.isAvailable() || userIds.length === 0) {
      return result;
    }

    try {
      const keys = userIds.map(userId => CacheKeys.USER_PRESENCE_DATA(userId));
      const values = await this.client!.mGet(keys);

      for (let i = 0; i < userIds.length; i++) {
        const userId = userIds[i];
        const value = values[i];
        if (value !== null && value !== undefined && userId) {
          try {
            const data = JSON.parse(value as string);
            if (data && data.lastUpdated) {
              const lastUpdatedStr = data.lastUpdated as string;
              data.lastUpdated = new Date(lastUpdatedStr);
              result.set(userId, data);
            }
          } catch (parseError) {
            console.error(`Error parsing cached data for user ${userId}:`, parseError);
          }
        }
      }
    } catch (error) {
      console.error('Error getting user presences batch from cache:', error);
    }

    return result;
  }

  /**
   * Set multiple user presences in batch
   */
  async setMultipleUserPresences(presences: Map<string, UserActivityData>): Promise<BatchPresenceResult> {
    const result: BatchPresenceResult = {
      success: [],
      failed: []
    };

    if (!this.isAvailable() || presences.size === 0) {
      for (const userId of presences.keys()) {
        result.failed.push({
          userId,
          error: 'Cache service not available'
        });
      }
      return result;
    }

    try {
      const pipeline = this.client!.multi();

      for (const [userId, data] of presences.entries()) {
        try {
          const key = CacheKeys.USER_PRESENCE_DATA(userId);
          const expiry = data.status === 'offline' ? CacheTTL.OFFLINE_USER : CacheTTL.USER_PRESENCE_DATA;
          const serializedData = {
            ...data,
            lastUpdated: data.lastUpdated.toISOString()
          };

          const value = JSON.stringify(serializedData);
          pipeline.setEx(key, expiry, value);
          result.success.push(userId);
        } catch (serializationError) {
          result.failed.push({
            userId,
            error: `Serialization error: ${serializationError}`
          });
        }
      }

      await pipeline.exec();
    } catch (error) {
      console.error('Error setting multiple user presences in cache:', error);

      for (const userId of result.success) {
        result.failed.push({
          userId,
          error: `Batch operation failed: ${error}`
        });
      }
      result.success = [];
    }

    return result;
  }

  /**
   * Invalidate user presence data
   */
  async invalidateUserPresence(userId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.client!.del(CacheKeys.USER_PRESENCE_DATA(userId));
    } catch (error) {
      console.error('Error invalidating user presence cache:', error);
    }
  }

  /**
   * Setup automatic cleanup of expired memory cache entries
   */
  private setupMemoryCleanup(): void {
    this.memoryCleanupInterval = setInterval(() => {
      this.cleanupMemoryCache();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up expired entries from memory cache
   */
  private cleanupMemoryCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiry) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired entries from memory cache`);
    }
  }

  /**
   * Get user presence from memory cache
   */
  private getFromMemoryCache(userId: string): UserActivityData | null {
    const key = CacheKeys.USER_PRESENCE_DATA(userId);
    const entry = this.memoryCache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set user presence in memory cache
   */
  private setInMemoryCache(userId: string, data: UserActivityData, ttlSeconds: number): void {
    const key = CacheKeys.USER_PRESENCE_DATA(userId);
    const expiry = Date.now() + (ttlSeconds * 1000);

    this.memoryCache.set(key, { data, expiry });
  }

  /**
   * Enhanced getUserPresenceData with memory fallback
   */
  async getUserPresenceDataWithFallback(userId: string): Promise<UserActivityData | null> {
    if (this.isAvailable()) {
      try {
        const redisData = await this.getUserPresenceData(userId);
        if (redisData) {
          const ttl = redisData.status === 'offline' ? CacheTTL.OFFLINE_USER : CacheTTL.USER_PRESENCE_DATA;
          this.setInMemoryCache(userId, redisData, ttl);
          return redisData;
        }
      } catch (error) {
        console.warn('Redis cache error, falling back to memory cache:', error);
      }
    }

    return this.getFromMemoryCache(userId);
  }

  /**
   * Enhanced setUserPresenceData with memory sync
   */
  async setUserPresenceDataWithFallback(userId: string, data: UserActivityData, ttl?: number): Promise<void> {
    const expiry = ttl || (data.status === 'offline' ? CacheTTL.OFFLINE_USER : CacheTTL.USER_PRESENCE_DATA);

    this.setInMemoryCache(userId, data, expiry);

    if (this.isAvailable()) {
      try {
        await this.setUserPresenceData(userId, data, ttl);
      } catch (error) {
        console.warn('Failed to store in Redis cache, data saved in memory only:', error);
      }
    }
  }

  /**
   * Enhanced batch operations with memory fallback
   */
  async getUserPresencesBatchWithFallback(userIds: string[]): Promise<Map<string, UserActivityData>> {
    const result = new Map<string, UserActivityData>();

    if (userIds.length === 0) return result;

    if (this.isAvailable()) {
      try {
        const redisResults = await this.getUserPresencesBatch(userIds);

        for (const [userId, data] of redisResults.entries()) {
          const ttl = data.status === 'offline' ? CacheTTL.OFFLINE_USER : CacheTTL.USER_PRESENCE_DATA;
          this.setInMemoryCache(userId, data, ttl);
          result.set(userId, data);
        }

        const missingUserIds = userIds.filter(id => !result.has(id));
        for (const userId of missingUserIds) {
          const memoryData = this.getFromMemoryCache(userId);
          if (memoryData) {
            result.set(userId, memoryData);
          }
        }

        return result;
      } catch (error) {
        console.warn('Redis batch operation failed, falling back to memory cache:', error);
      }
    }

    for (const userId of userIds) {
      const memoryData = this.getFromMemoryCache(userId);
      if (memoryData) {
        result.set(userId, memoryData);
      }
    }

    return result;
  }

  /**
   * Enhanced batch set with memory sync
   */
  async setMultipleUserPresencesWithFallback(presences: Map<string, UserActivityData>): Promise<BatchPresenceResult> {
    const result: BatchPresenceResult = {
      success: [],
      failed: []
    };

    if (presences.size === 0) return result;

    for (const [userId, data] of presences.entries()) {
      try {
        const ttl = data.status === 'offline' ? CacheTTL.OFFLINE_USER : CacheTTL.USER_PRESENCE_DATA;
        this.setInMemoryCache(userId, data, ttl);
        result.success.push(userId);
      } catch (error) {
        result.failed.push({
          userId,
          error: `Memory cache error: ${error}`
        });
      }
    }

    if (this.isAvailable()) {
      try {
        const redisResult = await this.setMultipleUserPresences(presences);
        console.log(`Redis sync: ${redisResult.success.length} successful, ${redisResult.failed.length} failed`);
      } catch (error) {
        console.warn('Failed to sync batch data to Redis, data saved in memory only:', error);
      }
    }

    return result;
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
        CacheKeys.USER_PRESENCE(userId),
        CacheKeys.USER_PRESENCE_DATA(userId)
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
  async getStats(): Promise<{
    connected: boolean;
    keyCount?: number;
    memory?: string;
    memoryCache?: {
      entries: number;
      size: string;
    };
  } | null> {
    const result: any = {
      connected: this.isAvailable(),
      memoryCache: {
        entries: this.memoryCache.size,
        size: `${Math.round(JSON.stringify([...this.memoryCache.entries()]).length / 1024)}KB`
      }
    };

    if (this.isAvailable()) {
      try {
        const info = await this.client!.info('memory');
        const keyCount = await this.client!.dbSize();
        const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
        const memory = memoryMatch ? memoryMatch[1] : 'unknown';

        result.keyCount = keyCount;
        if (memory) {
          result.memory = memory;
        }
      } catch (error) {
        console.error('Error getting Redis cache stats:', error);
        result.connected = false;
      }
    }

    return result;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = null;
    }

    this.memoryCache.clear();

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