import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from '../utils/logger';
import { CacheService } from './CacheService';

/**
 * Diagnostic result for a specific check
 */
export interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: Record<string, any>;
  recommendation?: string;
}

/**
 * Complete diagnostic report
 */
export interface DiagnosticReport {
  timestamp: Date;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  checks: DiagnosticResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

/**
 * Service for diagnosing bot configuration and health
 */
export class DiagnosticService {
  private client: Client;
  private cacheService: CacheService;

  constructor(client: Client, cacheService: CacheService) {
    this.client = client;
    this.cacheService = cacheService;
  }

  /**
   * Run complete diagnostic check
   */
  public async runDiagnostics(): Promise<DiagnosticReport> {
    const startTime = Date.now();
    
    logger.info('Starting diagnostic checks', {
      component: 'DiagnosticService',
      operation: 'diagnostics_start'
    });

    const checks: DiagnosticResult[] = [];

    // Run all diagnostic checks
    checks.push(await this.checkDiscordConnection());
    checks.push(await this.checkIntentConfiguration());
    checks.push(await this.checkGuildPresences());
    checks.push(await this.checkCacheService());
    checks.push(await this.checkPresenceCapture());
    checks.push(await this.checkActivityDataFlow());

    // Calculate summary
    const summary = {
      total: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      failed: checks.filter(c => c.status === 'fail').length,
      warnings: checks.filter(c => c.status === 'warning').length
    };

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (summary.failed > 0) {
      overallStatus = 'critical';
    } else if (summary.warnings > 0) {
      overallStatus = 'degraded';
    }

    const report: DiagnosticReport = {
      timestamp: new Date(),
      overallStatus,
      checks,
      summary
    };

    const duration = Date.now() - startTime;

    logger.info('Diagnostic checks completed', {
      component: 'DiagnosticService',
      operation: 'diagnostics_complete',
      metadata: {
        duration,
        overallStatus,
        summary
      }
    });

    return report;
  }

  /**
   * Check Discord client connection
   */
  private async checkDiscordConnection(): Promise<DiagnosticResult> {
    try {
      if (!this.client.isReady()) {
        return {
          name: 'Discord Connection',
          status: 'fail',
          message: 'Discord client is not ready',
          recommendation: 'Check bot token and network connectivity'
        };
      }

      const user = this.client.user;
      if (!user) {
        return {
          name: 'Discord Connection',
          status: 'fail',
          message: 'Discord client user is not available',
          recommendation: 'Restart the bot service'
        };
      }

      return {
        name: 'Discord Connection',
        status: 'pass',
        message: 'Discord client is connected and ready',
        details: {
          botTag: user.tag,
          botId: user.id,
          guilds: this.client.guilds.cache.size,
          users: this.client.users.cache.size
        }
      };

    } catch (error) {
      return {
        name: 'Discord Connection',
        status: 'fail',
        message: `Discord connection check failed: ${error}`,
        recommendation: 'Check bot token and restart the service'
      };
    }
  }

  /**
   * Check intent configuration
   */
  private async checkIntentConfiguration(): Promise<DiagnosticResult> {
    try {
      const intents = this.client.options.intents;
      const requiredIntents = [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ];

      const missingIntents: string[] = [];
      const presentIntents: string[] = [];

      for (const intent of requiredIntents) {
        const intentName = GatewayIntentBits[intent];
        if (Array.isArray(intents)) {
          if (intents.includes(intent)) {
            presentIntents.push(intentName);
          } else {
            missingIntents.push(intentName);
          }
        } else if (typeof intents === 'number') {
          if ((intents & intent) === intent) {
            presentIntents.push(intentName);
          } else {
            missingIntents.push(intentName);
          }
        }
      }

      if (missingIntents.length > 0) {
        return {
          name: 'Intent Configuration',
          status: 'fail',
          message: `Missing required intents: ${missingIntents.join(', ')}`,
          details: {
            presentIntents,
            missingIntents
          },
          recommendation: 'Add missing intents to bot configuration and enable them in Discord Developer Portal'
        };
      }

      return {
        name: 'Intent Configuration',
        status: 'pass',
        message: 'All required intents are configured',
        details: {
          presentIntents
        }
      };

    } catch (error) {
      return {
        name: 'Intent Configuration',
        status: 'fail',
        message: `Intent configuration check failed: ${error}`,
        recommendation: 'Review bot initialization code'
      };
    }
  }

  /**
   * Check guild presences availability
   */
  private async checkGuildPresences(): Promise<DiagnosticResult> {
    try {
      const guilds = this.client.guilds.cache;
      if (guilds.size === 0) {
        return {
          name: 'Guild Presences',
          status: 'warning',
          message: 'No guilds available for presence validation',
          recommendation: 'Ensure bot is added to at least one server'
        };
      }

      let totalMembers = 0;
      let totalPresences = 0;
      const guildDetails: any[] = [];

      for (const guild of guilds.values()) {
        const memberCount = guild.memberCount || 0;
        const presenceCount = guild.presences.cache.size;
        
        totalMembers += memberCount;
        totalPresences += presenceCount;

        guildDetails.push({
          id: guild.id,
          name: guild.name,
          memberCount,
          presenceCount,
          presenceRatio: memberCount > 0 ? (presenceCount / memberCount * 100).toFixed(1) + '%' : '0%'
        });
      }

      // Check if we're getting reasonable presence data
      const presenceRatio = totalMembers > 0 ? (totalPresences / totalMembers) : 0;

      if (totalPresences === 0 && totalMembers > 1) {
        return {
          name: 'Guild Presences',
          status: 'fail',
          message: 'No presence data available despite having members',
          details: {
            totalGuilds: guilds.size,
            totalMembers,
            totalPresences,
            guildDetails
          },
          recommendation: 'Enable GuildPresences intent in Discord Developer Portal'
        };
      }

      if (presenceRatio < 0.1 && totalMembers > 10) {
        return {
          name: 'Guild Presences',
          status: 'warning',
          message: 'Low presence data availability',
          details: {
            totalGuilds: guilds.size,
            totalMembers,
            totalPresences,
            presenceRatio: (presenceRatio * 100).toFixed(1) + '%',
            guildDetails
          },
          recommendation: 'Verify GuildPresences intent is enabled and bot has proper permissions'
        };
      }

      return {
        name: 'Guild Presences',
        status: 'pass',
        message: 'Guild presence data is available',
        details: {
          totalGuilds: guilds.size,
          totalMembers,
          totalPresences,
          presenceRatio: (presenceRatio * 100).toFixed(1) + '%',
          guildDetails
        }
      };

    } catch (error) {
      return {
        name: 'Guild Presences',
        status: 'fail',
        message: `Guild presence check failed: ${error}`,
        recommendation: 'Check bot permissions and guild access'
      };
    }
  }

  /**
   * Check cache service health
   */
  private async checkCacheService(): Promise<DiagnosticResult> {
    try {
      const isAvailable = this.cacheService.isAvailable();
      
      if (!isAvailable) {
        return {
          name: 'Cache Service',
          status: 'warning',
          message: 'Cache service is not available',
          recommendation: 'Check Redis connection or enable fallback caching'
        };
      }

      const stats = await this.cacheService.getStats();
      
      return {
        name: 'Cache Service',
        status: 'pass',
        message: 'Cache service is operational',
        details: stats || {}
      };

    } catch (error) {
      return {
        name: 'Cache Service',
        status: 'fail',
        message: `Cache service check failed: ${error}`,
        recommendation: 'Check Redis configuration and connectivity'
      };
    }
  }

  /**
   * Check presence capture functionality
   */
  private async checkPresenceCapture(): Promise<DiagnosticResult> {
    try {
      // Check if we have recent presence data in cache
      const guilds = this.client.guilds.cache;
      let recentPresenceCount = 0;
      let totalChecked = 0;

      for (const guild of guilds.values()) {
        const presences = guild.presences.cache;
        
        for (const presence of presences.values()) {
          if (presence.user?.bot) continue;
          
          totalChecked++;
          
          // Check if we have cached data for this user
          const cachedData = await this.cacheService.getUserPresenceData(presence.user?.id || '');
          if (cachedData) {
            const age = Date.now() - cachedData.lastUpdated.getTime();
            if (age < 10 * 60 * 1000) { // Less than 10 minutes old
              recentPresenceCount++;
            }
          }

          // Limit check to avoid performance issues
          if (totalChecked >= 20) break;
        }
        
        if (totalChecked >= 20) break;
      }

      if (totalChecked === 0) {
        return {
          name: 'Presence Capture',
          status: 'warning',
          message: 'No users available for presence capture validation',
          recommendation: 'Ensure bot is in active servers with online users'
        };
      }

      const captureRatio = recentPresenceCount / totalChecked;

      if (captureRatio < 0.3) {
        return {
          name: 'Presence Capture',
          status: 'warning',
          message: 'Low presence capture rate detected',
          details: {
            totalChecked,
            recentPresenceCount,
            captureRatio: (captureRatio * 100).toFixed(1) + '%'
          },
          recommendation: 'Check presence event handlers and cache operations'
        };
      }

      return {
        name: 'Presence Capture',
        status: 'pass',
        message: 'Presence capture is working correctly',
        details: {
          totalChecked,
          recentPresenceCount,
          captureRatio: (captureRatio * 100).toFixed(1) + '%'
        }
      };

    } catch (error) {
      return {
        name: 'Presence Capture',
        status: 'fail',
        message: `Presence capture check failed: ${error}`,
        recommendation: 'Check presence event handlers and cache service'
      };
    }
  }

  /**
   * Check activity data flow from events to API
   */
  private async checkActivityDataFlow(): Promise<DiagnosticResult> {
    try {
      // Find a user with activities to test the flow
      let testUserId: string | null = null;
      let testActivities: any[] = [];

      for (const guild of this.client.guilds.cache.values()) {
        for (const presence of guild.presences.cache.values()) {
          if (presence.user?.bot) continue;
          
          if (presence.activities.length > 0) {
            testUserId = presence.user?.id || null;
            testActivities = presence.activities;
            break;
          }
        }
        if (testUserId) break;
      }

      if (!testUserId) {
        return {
          name: 'Activity Data Flow',
          status: 'warning',
          message: 'No users with activities found for testing data flow',
          recommendation: 'Test when users have active games or applications'
        };
      }

      // Check if the activity data is properly cached
      const cachedData = await this.cacheService.getUserPresenceData(testUserId);
      
      if (!cachedData) {
        return {
          name: 'Activity Data Flow',
          status: 'warning',
          message: 'Activity data not found in cache for test user',
          details: {
            testUserId,
            hasActivities: testActivities.length > 0
          },
          recommendation: 'Check presence event processing and cache operations'
        };
      }

      const hasMatchingActivities = cachedData.activities.length > 0;

      if (!hasMatchingActivities && testActivities.length > 0) {
        return {
          name: 'Activity Data Flow',
          status: 'warning',
          message: 'Activity data mismatch between Discord and cache',
          details: {
            testUserId,
            discordActivities: testActivities.length,
            cachedActivities: cachedData.activities.length
          },
          recommendation: 'Check activity data transformation and caching logic'
        };
      }

      return {
        name: 'Activity Data Flow',
        status: 'pass',
        message: 'Activity data flow is working correctly',
        details: {
          testUserId,
          discordActivities: testActivities.length,
          cachedActivities: cachedData.activities.length,
          lastUpdated: cachedData.lastUpdated
        }
      };

    } catch (error) {
      return {
        name: 'Activity Data Flow',
        status: 'fail',
        message: `Activity data flow check failed: ${error}`,
        recommendation: 'Check presence event handlers and data transformation logic'
      };
    }
  }

  /**
   * Check specific intent availability
   */
  public async checkIntent(intent: GatewayIntentBits): Promise<boolean> {
    try {
      const intents = this.client.options.intents;
      
      if (Array.isArray(intents)) {
        return intents.includes(intent);
      } else if (typeof intents === 'number') {
        return (intents & intent) === intent;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to check intent', {
        component: 'DiagnosticService',
        operation: 'check_intent',
        metadata: { intent }
      }, error as Error);
      return false;
    }
  }

  /**
   * Log diagnostic alert for critical issues
   */
  public logAlert(result: DiagnosticResult): void {
    if (result.status === 'fail') {
      logger.error(`ALERT: ${result.name} failed`, {
        component: 'DiagnosticService',
        operation: 'alert',
        metadata: {
          checkName: result.name,
          message: result.message,
          details: result.details,
          recommendation: result.recommendation
        }
      });
    } else if (result.status === 'warning') {
      logger.warn(`WARNING: ${result.name} has issues`, {
        component: 'DiagnosticService',
        operation: 'warning',
        metadata: {
          checkName: result.name,
          message: result.message,
          details: result.details,
          recommendation: result.recommendation
        }
      });
    }
  }

  /**
   * Run diagnostics and log alerts for any issues
   */
  public async runDiagnosticsWithAlerts(): Promise<DiagnosticReport> {
    const report = await this.runDiagnostics();
    
    // Log alerts for failed or warning checks
    for (const check of report.checks) {
      if (check.status === 'fail' || check.status === 'warning') {
        this.logAlert(check);
      }
    }

    return report;
  }
}