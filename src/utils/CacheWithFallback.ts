import type { UserActivityResponse, UserPresenceResponse, UserStatusResponse } from '../models/ApiResponses';
import type { CacheService } from '../services/CacheService';

/**
 * Utility class that provides cache operations with automatic fallback
 */
export class CacheWithFallback {
  constructor(private cacheService: CacheService) {}

  /**
   * Get user status with fallback to provided function
   */
  async getUserStatus(
    userId: string,
    fallbackFn: () => Promise<UserStatusResponse>
  ): Promise<UserStatusResponse> {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.getUserStatus(userId);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn('Cache error, falling back to direct fetch:', error);
    }

    // Fallback to direct fetch
    const data = await fallbackFn();
    
    // Try to cache the result (fire and forget)
    this.cacheService.setUserStatus(userId, data).catch(err => {
      console.warn('Failed to cache user status:', err);
    });

    return data;
  }

  /**
   * Get user activity with fallback to provided function
   */
  async getUserActivity(
    userId: string,
    fallbackFn: () => Promise<UserActivityResponse>
  ): Promise<UserActivityResponse> {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.getUserActivity(userId);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn('Cache error, falling back to direct fetch:', error);
    }

    // Fallback to direct fetch
    const data = await fallbackFn();
    
    // Try to cache the result (fire and forget)
    this.cacheService.setUserActivity(userId, data).catch(err => {
      console.warn('Failed to cache user activity:', err);
    });

    return data;
  }

  /**
   * Get user presence with fallback to provided function
   */
  async getUserPresence(
    userId: string,
    fallbackFn: () => Promise<UserPresenceResponse>
  ): Promise<UserPresenceResponse> {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.getUserPresence(userId);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn('Cache error, falling back to direct fetch:', error);
    }

    // Fallback to direct fetch
    const data = await fallbackFn();
    
    // Try to cache the result (fire and forget)
    this.cacheService.setUserPresence(userId, data).catch(err => {
      console.warn('Failed to cache user presence:', err);
    });

    return data;
  }

  /**
   * Get auto channels with fallback to provided function
   */
  async getAutoChannels(
    templateId: string,
    fallbackFn: () => Promise<string[]>
  ): Promise<string[]> {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.getAutoChannels(templateId);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn('Cache error, falling back to direct fetch:', error);
    }

    // Fallback to direct fetch
    const data = await fallbackFn();
    
    // Try to cache the result (fire and forget)
    this.cacheService.setAutoChannels(templateId, data).catch(err => {
      console.warn('Failed to cache auto channels:', err);
    });

    return data;
  }

  /**
   * Get server config with fallback to provided function
   */
  async getServerConfig<T>(
    serverId: string,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.getServerConfig(serverId);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn('Cache error, falling back to direct fetch:', error);
    }

    // Fallback to direct fetch
    const data = await fallbackFn();
    
    // Try to cache the result (fire and forget)
    this.cacheService.setServerConfig(serverId, data).catch(err => {
      console.warn('Failed to cache server config:', err);
    });

    return data;
  }

  /**
   * Invalidate user cache (fire and forget)
   */
  invalidateUser(userId: string): void {
    this.cacheService.invalidateUser(userId).catch(err => {
      console.warn('Failed to invalidate user cache:', err);
    });
  }

  /**
   * Invalidate auto channels cache (fire and forget)
   */
  invalidateAutoChannels(templateId: string): void {
    this.cacheService.invalidateAutoChannels(templateId).catch(err => {
      console.warn('Failed to invalidate auto channels cache:', err);
    });
  }
}