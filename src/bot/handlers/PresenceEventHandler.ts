import { Activity as DiscordActivity, Presence } from 'discord.js';
import { Activity } from '../../models/Activity';
import { UserActivityResponse, UserPresenceResponse, UserStatusResponse } from '../../models/ApiResponses';
import { CacheService } from '../../services/CacheService';
import { presenceErrorHandler } from '../../services/PresenceErrorHandler';
import { logger } from '../../utils/logger';

/**
 * Interface for user activity data processed from Discord presence
 */
export interface UserActivityData {
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activities: Activity[];
  lastUpdated: Date;
  clientStatus?: {
    desktop?: string;
    mobile?: string;
    web?: string;
  } | undefined;
}

/**
 * Handles Discord presence update events and manages user activity caching
 */
export class PresenceEventHandler {
  private cacheService: CacheService;
  private presenceUpdateQueue = new Map<string, NodeJS.Timeout>();
  private memoryCache = new Map<string, UserActivityData>();
  private readonly DEBOUNCE_DELAY = 1000; // 1 second
  private readonly MEMORY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(cacheService: CacheService) {
    this.cacheService = cacheService;
    this.setupMemoryCleanup();
  }

  /**
   * Handle presence update events from Discord
   */
  async handlePresenceUpdate(oldPresence: Presence | null, newPresence: Presence): Promise<void> {
    try {
      const userId = newPresence.userId;

      logger.debug('Processing presence update', {
        component: 'PresenceEventHandler',
        operation: 'presence_update',
        userId,
        metadata: {
          oldStatus: oldPresence?.status,
          newStatus: newPresence.status,
          activitiesCount: newPresence.activities.length
        }
      });

      this.debouncePresenceUpdate(userId, newPresence);

    } catch (error) {
      const errorContext: any = {
        component: 'PresenceEventHandler',
        operation: 'presence_update',
        userId: newPresence.userId
      };
      if (newPresence.guild?.id) {
        errorContext.guildId = newPresence.guild.id;
      }
      presenceErrorHandler.handleError(error as Error, errorContext);
    }
  }

  /**
   * Process Discord presence data into our activity format
   */
  processActivityData(presence: Presence): UserActivityData {
    const activities = presence.activities
      .filter(activity => this.isValidActivity(activity))
      .map(activity => this.transformDiscordActivity(activity));

    let clientStatus: { desktop?: string; mobile?: string; web?: string } | undefined;
    if (presence.clientStatus) {
      clientStatus = {};
      if (presence.clientStatus.desktop) {
        clientStatus.desktop = String(presence.clientStatus.desktop);
      }
      if (presence.clientStatus.mobile) {
        clientStatus.mobile = String(presence.clientStatus.mobile);
      }
      if (presence.clientStatus.web) {
        clientStatus.web = String(presence.clientStatus.web);
      }
    }

    return {
      userId: presence.userId,
      status: presence.status as 'online' | 'idle' | 'dnd' | 'offline',
      activities,
      lastUpdated: new Date(),
      clientStatus
    };
  }

  /**
   * Update user cache with activity data
   */
  async updateUserCache(userId: string, activityData: UserActivityData): Promise<void> {
    try {
      this.memoryCache.set(userId, activityData);

      if (this.cacheService.isAvailable()) {
        await Promise.all([
          this.updateUserStatus(userId, activityData),
          this.updateUserActivity(userId, activityData),
          this.updateUserPresence(userId, activityData)
        ]);
      }

      logger.debug('Updated user cache', {
        component: 'PresenceEventHandler',
        operation: 'cache_update',
        userId,
        metadata: {
          activitiesCount: activityData.activities.length,
          status: activityData.status,
          cacheAvailable: this.cacheService.isAvailable()
        }
      });

    } catch (error) {
      presenceErrorHandler.handleError(error as Error, {
        component: 'PresenceEventHandler',
        operation: 'cache_update',
        userId
      });
    }
  }

  /**
   * Get user activity data from cache (memory fallback if Redis unavailable)
   */
  async getUserActivityData(userId: string): Promise<UserActivityData | null> {
    try {
      if (this.cacheService.isAvailable()) {
        const cachedActivity = await this.cacheService.getUserActivity(userId);
        if (cachedActivity) {
          return {
            userId: cachedActivity.userId,
            status: 'online',
            activities: cachedActivity.activities,
            lastUpdated: new Date(cachedActivity.lastUpdated)
          };
        }
      }

      const memoryData = this.memoryCache.get(userId);
      if (memoryData && this.isMemoryCacheValid(memoryData)) {
        return memoryData;
      }

      return null;
    } catch (error) {
      presenceErrorHandler.handleError(error as Error, {
        component: 'PresenceEventHandler',
        operation: 'get_activity_data',
        userId
      });

      return this.memoryCache.get(userId) || null;
    }
  }

  /**
   * Debounce presence updates to avoid excessive processing
   */
  private debouncePresenceUpdate(userId: string, presence: Presence): void {
    const existingTimeout = this.presenceUpdateQueue.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        await this.processPresenceUpdate(userId, presence);
        this.presenceUpdateQueue.delete(userId);
      } catch (error) {
        presenceErrorHandler.handleError(error as Error, {
          component: 'PresenceEventHandler',
          operation: 'debounced_update',
          userId
        });
      }
    }, this.DEBOUNCE_DELAY);

    this.presenceUpdateQueue.set(userId, timeout);
  }

  /**
   * Process the actual presence update
   */
  private async processPresenceUpdate(userId: string, presence: Presence): Promise<void> {
    const activityData = this.processActivityData(presence);
    await this.updateUserCache(userId, activityData);
  }

  /**
   * Transform Discord activity to our Activity format
   */
  private transformDiscordActivity(activity: DiscordActivity): Activity {
    let activityType: Activity['type'];

    switch (activity.type) {
      case 0:
        activityType = 'playing';
        break;
      case 1:
        activityType = 'playing';
        break;
      case 2:
        activityType = 'listening';
        break;
      case 3:
        activityType = 'watching';
        break;
      case 4:
        activityType = 'custom';
        break;
      case 5:
        activityType = 'competing';
        break;
      default:
        activityType = 'playing';
    }

    const transformedActivity: Activity = {
      type: activityType,
      name: activity.name
    };

    if (activity.details) {
      transformedActivity.details = activity.details;
    }

    if (activity.state) {
      transformedActivity.state = activity.state;
    }

    if (activity.timestamps) {
      const timestamps: { start?: number; end?: number } = {};
      if (activity.timestamps.start) {
        timestamps.start = activity.timestamps.start.getTime();
      }
      if (activity.timestamps.end) {
        timestamps.end = activity.timestamps.end.getTime();
      }
      if (timestamps.start !== undefined || timestamps.end !== undefined) {
        transformedActivity.timestamps = timestamps;
      }
    }

    if (activity.url) {
      transformedActivity.url = activity.url;
    }

    return transformedActivity;
  }

  /**
   * Check if Discord activity is valid for processing
   */
  private isValidActivity(activity: DiscordActivity): boolean {
    return !!(activity.name && activity.name.trim().length > 0);
  }

  /**
   * Update user status cache
   */
  private async updateUserStatus(userId: string, activityData: UserActivityData): Promise<void> {
    const statusData: UserStatusResponse = {
      userId,
      status: activityData.status,
      activities: activityData.activities,
      lastUpdated: activityData.lastUpdated.toISOString(),
      inVoiceChannel: false
    };

    await this.cacheService.setUserStatus(userId, statusData);
  }

  /**
   * Update user activity cache
   */
  private async updateUserActivity(userId: string, activityData: UserActivityData): Promise<void> {
    const activityResponse: UserActivityResponse = {
      userId,
      activities: activityData.activities,
      lastUpdated: activityData.lastUpdated.toISOString()
    };

    await this.cacheService.setUserActivity(userId, activityResponse);
  }

  /**
   * Update user presence cache
   */
  private async updateUserPresence(userId: string, activityData: UserActivityData): Promise<void> {
    const currentActivity = activityData.activities.length > 0 ? activityData.activities[0] : null;

    const presenceData: UserPresenceResponse = {
      userId,
      currentActivity: currentActivity || null,
      richPresence: null,
      lastUpdated: activityData.lastUpdated.toISOString()
    };

    await this.cacheService.setUserPresence(userId, presenceData);
  }

  /**
   * Check if memory cache data is still valid
   */
  private isMemoryCacheValid(data: UserActivityData): boolean {
    const now = Date.now();
    const dataAge = now - data.lastUpdated.getTime();
    return dataAge < this.MEMORY_CACHE_TTL;
  }

  /**
   * Setup periodic cleanup of memory cache
   */
  private setupMemoryCleanup(): void {
    setInterval(() => {
      const now = Date.now();

      for (const [userId, data] of this.memoryCache.entries()) {
        const dataAge = now - data.lastUpdated.getTime();
        if (dataAge > this.MEMORY_CACHE_TTL) {
          this.memoryCache.delete(userId);
        }
      }

      logger.debug('Memory cache cleanup completed', {
        component: 'PresenceEventHandler',
        operation: 'memory_cleanup',
        metadata: {
          remainingEntries: this.memoryCache.size
        }
      });
    }, 5 * 60 * 1000);
  }

  /**
   * Get memory cache statistics
   */
  getMemoryCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.memoryCache.size,
      entries: Array.from(this.memoryCache.keys())
    };
  }

  /**
   * Clear all cached data for cleanup
   */
  clearCache(): void {
    for (const timeout of this.presenceUpdateQueue.values()) {
      clearTimeout(timeout);
    }
    this.presenceUpdateQueue.clear();
    this.memoryCache.clear();
    logger.info('Presence event handler cache cleared', {
      component: 'PresenceEventHandler',
      operation: 'cache_clear'
    });
  }
}