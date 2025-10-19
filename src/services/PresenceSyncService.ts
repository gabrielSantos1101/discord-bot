import { Client, Guild, Presence } from 'discord.js';
import { PresenceEventHandler } from '../bot/handlers/PresenceEventHandler';
import { logger } from '../utils/logger';

/**
 * Metrics for presence synchronization
 */
export interface SyncMetrics {
  totalGuilds: number;
  totalPresences: number;
  syncedPresences: number;
  failedPresences: number;
  syncDuration: number;
  lastSyncTime: Date;
  missedEvents: number;
  recoveredEvents: number;
}

/**
 * Configuration for presence synchronization
 */
export interface SyncConfig {
  intervalMinutes: number;
  maxPresencesPerBatch: number;
  enableMissedEventRecovery: boolean;
  syncTimeoutMs: number;
}

/**
 * Service for periodic synchronization of presence data to handle missed events
 */
export class PresenceSyncService {
  private client: Client;
  private presenceEventHandler: PresenceEventHandler;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private metrics: SyncMetrics;
  private config: SyncConfig;
  private lastKnownPresences = new Map<string, string>(); // userId -> presence hash

  constructor(
    client: Client,
    presenceEventHandler: PresenceEventHandler,
    config?: Partial<SyncConfig>
  ) {
    this.client = client;
    this.presenceEventHandler = presenceEventHandler;
    
    this.config = {
      intervalMinutes: 5,
      maxPresencesPerBatch: 100,
      enableMissedEventRecovery: true,
      syncTimeoutMs: 30000,
      ...config
    };

    this.metrics = {
      totalGuilds: 0,
      totalPresences: 0,
      syncedPresences: 0,
      failedPresences: 0,
      syncDuration: 0,
      lastSyncTime: new Date(),
      missedEvents: 0,
      recoveredEvents: 0
    };

    logger.info('PresenceSyncService initialized', {
      component: 'PresenceSyncService',
      operation: 'initialization',
      metadata: {
        intervalMinutes: this.config.intervalMinutes,
        maxPresencesPerBatch: this.config.maxPresencesPerBatch,
        enableMissedEventRecovery: this.config.enableMissedEventRecovery
      }
    });
  }

  /**
   * Start the periodic synchronization
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('PresenceSyncService already running', {
        component: 'PresenceSyncService',
        operation: 'start'
      });
      return;
    }

    this.isRunning = true;
    
    // Run initial sync
    this.performSync().catch(error => {
      logger.error('Initial presence sync failed', {
        component: 'PresenceSyncService',
        operation: 'initial_sync'
      }, error);
    });

    // Setup periodic sync
    this.syncInterval = setInterval(async () => {
      try {
        await this.performSync();
      } catch (error) {
        logger.error('Periodic presence sync failed', {
          component: 'PresenceSyncService',
          operation: 'periodic_sync'
        }, error as Error);
      }
    }, this.config.intervalMinutes * 60 * 1000);

    logger.info('PresenceSyncService started', {
      component: 'PresenceSyncService',
      operation: 'start',
      metadata: {
        intervalMs: this.config.intervalMinutes * 60 * 1000
      }
    });
  }

  /**
   * Stop the periodic synchronization
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.isRunning = false;
    this.lastKnownPresences.clear();

    logger.info('PresenceSyncService stopped', {
      component: 'PresenceSyncService',
      operation: 'stop'
    });
  }

  /**
   * Perform a complete presence synchronization
   */
  public async performSync(): Promise<SyncMetrics> {
    const startTime = Date.now();
    
    logger.info('Starting presence synchronization', {
      component: 'PresenceSyncService',
      operation: 'sync_start',
      metadata: {
        guilds: this.client.guilds.cache.size
      }
    });

    // Reset metrics for this sync
    this.metrics = {
      ...this.metrics,
      totalGuilds: 0,
      totalPresences: 0,
      syncedPresences: 0,
      failedPresences: 0,
      syncDuration: 0,
      lastSyncTime: new Date(),
      missedEvents: 0,
      recoveredEvents: 0
    };

    try {
      const guilds = Array.from(this.client.guilds.cache.values());
      this.metrics.totalGuilds = guilds.length;

      for (const guild of guilds) {
        await this.syncGuildPresences(guild);
      }

      if (this.config.enableMissedEventRecovery) {
        await this.detectAndRecoverMissedEvents();
      }

      this.metrics.syncDuration = Date.now() - startTime;

      logger.info('Presence synchronization completed', {
        component: 'PresenceSyncService',
        operation: 'sync_complete',
        metadata: {
          ...this.metrics,
          successRate: this.metrics.totalPresences > 0 
            ? (this.metrics.syncedPresences / this.metrics.totalPresences * 100).toFixed(2) + '%'
            : '0%'
        }
      });

    } catch (error) {
      this.metrics.syncDuration = Date.now() - startTime;
      
      logger.error('Presence synchronization failed', {
        component: 'PresenceSyncService',
        operation: 'sync_error',
        metadata: this.metrics
      }, error as Error);
      
      throw error;
    }

    return { ...this.metrics };
  }

  /**
   * Synchronize presences for a specific guild
   */
  private async syncGuildPresences(guild: Guild): Promise<void> {
    try {
      logger.debug('Syncing guild presences', {
        component: 'PresenceSyncService',
        operation: 'guild_sync',
        guildId: guild.id,
        metadata: {
          guildName: guild.name,
          presencesCount: guild.presences.cache.size,
          membersCount: guild.memberCount
        }
      });

      const presences = Array.from(guild.presences.cache.values());
      this.metrics.totalPresences += presences.length;

      // Process presences in batches to avoid overwhelming the system
      const batches = this.createBatches(presences, this.config.maxPresencesPerBatch);

      for (const batch of batches) {
        await this.processBatch(batch, guild.id);
      }

    } catch (error) {
      logger.error('Failed to sync guild presences', {
        component: 'PresenceSyncService',
        operation: 'guild_sync_error',
        guildId: guild.id
      }, error as Error);
      
      throw error;
    }
  }

  /**
   * Process a batch of presences
   */
  private async processBatch(presences: Presence[], guildId: string): Promise<void> {
    const batchPromises = presences.map(async (presence) => {
      try {
        // Skip bot users
        if (presence.user?.bot) {
          return;
        }

        // Process the presence update
        await this.presenceEventHandler.handlePresenceUpdate(null, presence);
        
        // Update known presence hash for missed event detection
        if (presence.user?.id) {
          const presenceHash = this.generatePresenceHash(presence);
          this.lastKnownPresences.set(presence.user.id, presenceHash);
        }

        this.metrics.syncedPresences++;

      } catch (error) {
        this.metrics.failedPresences++;
        
        const logContext: any = {
          component: 'PresenceSyncService',
          operation: 'batch_process_error',
          guildId
        };
        if (presence.user?.id) {
          logContext.userId = presence.user.id;
        }
        
        logger.error('Failed to process presence in batch', logContext, error as Error);
      }
    });

    await Promise.allSettled(batchPromises);
  }

  /**
   * Detect and recover missed presence events
   */
  private async detectAndRecoverMissedEvents(): Promise<void> {
    if (!this.config.enableMissedEventRecovery) {
      return;
    }

    try {
      logger.debug('Detecting missed presence events', {
        component: 'PresenceSyncService',
        operation: 'missed_events_detection'
      });

      let missedCount = 0;
      let recoveredCount = 0;

      for (const guild of this.client.guilds.cache.values()) {
        const currentPresences = guild.presences.cache;

        for (const [userId, presence] of currentPresences) {
          if (presence.user?.bot) continue;

          const currentHash = this.generatePresenceHash(presence);
          const lastKnownHash = this.lastKnownPresences.get(userId);

          // If we have a different hash, we might have missed an event
          if (lastKnownHash && lastKnownHash !== currentHash) {
            missedCount++;
            
            try {
              // Recover by processing the current presence
              await this.presenceEventHandler.handlePresenceUpdate(null, presence);
              recoveredCount++;
              
              logger.debug('Recovered missed presence event', {
                component: 'PresenceSyncService',
                operation: 'event_recovery',
                userId,
                guildId: guild.id,
                metadata: {
                  oldHash: lastKnownHash,
                  newHash: currentHash
                }
              });

            } catch (error) {
              logger.error('Failed to recover missed presence event', {
                component: 'PresenceSyncService',
                operation: 'event_recovery_error',
                userId,
                guildId: guild.id
              }, error as Error);
            }
          }

          // Update the known hash
          this.lastKnownPresences.set(userId, currentHash);
        }
      }

      this.metrics.missedEvents = missedCount;
      this.metrics.recoveredEvents = recoveredCount;

      if (missedCount > 0) {
        logger.info('Missed events detection completed', {
          component: 'PresenceSyncService',
          operation: 'missed_events_summary',
          metadata: {
            missedEvents: missedCount,
            recoveredEvents: recoveredCount,
            recoveryRate: missedCount > 0 ? (recoveredCount / missedCount * 100).toFixed(2) + '%' : '0%'
          }
        });
      }

    } catch (error) {
      logger.error('Failed to detect missed events', {
        component: 'PresenceSyncService',
        operation: 'missed_events_error'
      }, error as Error);
    }
  }

  /**
   * Generate a hash for a presence to detect changes
   */
  private generatePresenceHash(presence: Presence): string {
    const activities = presence.activities.map(activity => ({
      type: activity.type,
      name: activity.name,
      state: activity.state,
      details: activity.details
    }));

    const hashData = {
      status: presence.status,
      activities: activities,
      clientStatus: presence.clientStatus
    };

    return Buffer.from(JSON.stringify(hashData)).toString('base64');
  }

  /**
   * Create batches from an array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get current synchronization metrics
   */
  public getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  /**
   * Get synchronization configuration
   */
  public getConfig(): SyncConfig {
    return { ...this.config };
  }

  /**
   * Update synchronization configuration
   */
  public updateConfig(newConfig: Partial<SyncConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    logger.info('PresenceSyncService configuration updated', {
      component: 'PresenceSyncService',
      operation: 'config_update',
      metadata: {
        oldConfig,
        newConfig: this.config
      }
    });

    // Restart if interval changed and service is running
    if (oldConfig.intervalMinutes !== this.config.intervalMinutes && this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Force a manual synchronization
   */
  public async forcSync(): Promise<SyncMetrics> {
    logger.info('Manual presence synchronization triggered', {
      component: 'PresenceSyncService',
      operation: 'manual_sync'
    });

    return await this.performSync();
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isRunning: boolean;
    lastSyncTime: Date;
    nextSyncTime: Date | null;
    knownPresences: number;
  } {
    const nextSyncTime = this.isRunning && this.metrics.lastSyncTime
      ? new Date(this.metrics.lastSyncTime.getTime() + (this.config.intervalMinutes * 60 * 1000))
      : null;

    return {
      isRunning: this.isRunning,
      lastSyncTime: this.metrics.lastSyncTime,
      nextSyncTime,
      knownPresences: this.lastKnownPresences.size
    };
  }
}