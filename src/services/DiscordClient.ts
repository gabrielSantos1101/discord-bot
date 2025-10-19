import { Activity } from '../models/Activity';
import { DiscordApiError, ErrorCode } from '../models/ErrorTypes';
import { RichPresence } from '../models/RichPresence';
import { UserData, UserStatus } from '../models/UserData';
import { CircuitBreaker, DEFAULT_BACKOFF_CONFIGS, extractErrorInfo, handleDiscordRateLimit, LogContext, logger, retryWithBackoff, SanitizationUtils, ValidationUtils } from '../utils';

/**
 * Rate limiting configuration for Discord API
 */
interface RateLimitConfig {
  maxRequestsPerSecond: number;
  currentRequests: number;
  windowStart: number;
  requestQueue: Array<() => void>;
  isRateLimited: boolean;
  rateLimitResetAt: number | null;
}

/**
 * Discord API response for user data
 */
interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  global_name?: string;
  bot?: boolean;
}

/**
 * Discord API response for guild member data
 */
interface DiscordGuildMember {
  user: DiscordUser;
  nick?: string;
  roles: string[];
  joined_at: string;
  premium_since?: string;
  deaf: boolean;
  mute: boolean;
  pending?: boolean;
  permissions?: string;
}

/**
 * Discord API response for presence data
 */
interface DiscordPresence {
  user: {
    id: string;
  };
  guild_id: string;
  status: UserStatus;
  activities: DiscordActivity[];
  client_status: {
    desktop?: string;
    mobile?: string;
    web?: string;
  };
}

/**
 * Discord API activity structure
 */
interface DiscordActivity {
  name: string;
  type: number;
  url?: string;
  created_at: number;
  timestamps?: {
    start?: number;
    end?: number;
  };
  application_id?: string;
  details?: string;
  state?: string;
  emoji?: {
    name: string;
    id?: string;
    animated?: boolean;
  };
  party?: {
    id?: string;
    size?: [number, number];
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  secrets?: {
    join?: string;
    spectate?: string;
    match?: string;
  };
  instance?: boolean;
  flags?: number;
}

/**
 * Client for making direct HTTP requests to Discord API
 * Handles authentication, rate limiting, and data transformation with robust error handling
 */
export class DiscordClient {
  private readonly baseUrl = 'https://discord.com/api/v10';
  private readonly botToken: string;
  private readonly rateLimitConfig: RateLimitConfig;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly requestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitHits: 0
  };

  constructor(botToken: string) {
    if (!botToken) {
      throw new Error('Bot token is required');
    }
    
    this.botToken = botToken;
    this.rateLimitConfig = {
      maxRequestsPerSecond: 50,
      currentRequests: 0,
      windowStart: Date.now(),
      requestQueue: [],
      isRateLimited: false,
      rateLimitResetAt: null
    };
    
    // Initialize circuit breaker for Discord API
    this.circuitBreaker = new CircuitBreaker(5, 60000); // 5 failures, 1 minute recovery
  }

  /**
   * Get user data by user ID with robust error handling and validation
   * Makes direct HTTP request to Discord API
   */
  async getUserData(userId: string, guildId?: string): Promise<UserData> {
    const context: LogContext = {
      component: 'DiscordClient',
      operation: 'getUserData',
      userId: SanitizationUtils.sanitizeUserId(userId),
      ...(guildId && { guildId: SanitizationUtils.sanitizeUserId(guildId) })
    };

    // Validate and sanitize input
    const userIdValidation = ValidationUtils.validateUserId(userId, context);
    if (!userIdValidation.isValid) {
      const error = new Error('Invalid user ID format');
      (error as any).code = ErrorCode.INVALID_REQUEST;
      (error as any).details = userIdValidation.errors;
      throw error;
    }

    if (guildId) {
      const guildIdValidation = ValidationUtils.validateGuildId(guildId, context);
      if (!guildIdValidation.isValid) {
        const error = new Error('Invalid guild ID format');
        (error as any).code = ErrorCode.INVALID_REQUEST;
        (error as any).details = guildIdValidation.errors;
        throw error;
      }
    }

    const sanitizedUserId = userIdValidation.data!;
    const sanitizedGuildId = guildId ? ValidationUtils.validateGuildId(guildId, context).data : undefined;

    return retryWithBackoff(async () => {
      try {
        logger.info('Fetching user data', {
          ...context,
          metadata: { hasGuildId: !!sanitizedGuildId }
        });

        const user = await this.makeRequest<DiscordUser>(`/users/${sanitizedUserId}`, context);
        
        let guildMember: DiscordGuildMember | null = null;
        if (sanitizedGuildId) {
          try {
            guildMember = await this.makeRequest<DiscordGuildMember>(
              `/guilds/${sanitizedGuildId}/members/${sanitizedUserId}`,
              context
            );
          } catch (error) {
            const errorInfo = extractErrorInfo(error);
            if (errorInfo.code === ErrorCode.USER_NOT_FOUND) {
              logger.warn('User not found in guild, continuing with basic data', {
                ...context,
                metadata: { guildId: sanitizedGuildId }
              });
            } else {
              logger.warn('Failed to fetch guild member data', {
                ...context,
                metadata: { error: errorInfo.message }
              });
            }
          }
        }

        let presence: DiscordPresence | null = null;
        if (sanitizedGuildId) {
          try {
            presence = await this.getPresenceData(sanitizedUserId, sanitizedGuildId, context);
          } catch (error) {
            logger.debug('Presence data not available', {
              ...context,
              metadata: { reason: (error as Error).message }
            });
          }
        }

        const userData = this.transformUserData(user, guildMember, presence);
        
        logger.info('User data fetched successfully', {
          ...context,
          metadata: {
            hasActivities: userData.activities.length > 0,
            hasPresence: !!userData.presence,
            status: userData.status
          }
        });

        return userData;
      } catch (error) {
        const errorInfo = extractErrorInfo(error);
        
        logger.error('Failed to fetch user data', {
          ...context,
          metadata: {
            errorCode: errorInfo.code,
            isRetryable: errorInfo.isRetryable
          }
        }, error as Error);

        if (errorInfo.code === ErrorCode.USER_NOT_FOUND) {
          const notFoundError = new Error(`User with ID ${sanitizedUserId} not found`);
          (notFoundError as any).code = ErrorCode.USER_NOT_FOUND;
          throw notFoundError;
        }

        throw error;
      }
    }, DEFAULT_BACKOFF_CONFIGS.discord_api, context);
  }

  /**
   * Get user activities by user ID
   */
  async getUserActivities(userId: string, guildId?: string): Promise<Activity[]> {
    const userData = await this.getUserData(userId, guildId);
    return userData.activities;
  }

  /**
   * Get user status by user ID
   */
  async getUserStatus(userId: string, guildId?: string): Promise<UserStatus> {
    const userData = await this.getUserData(userId, guildId);
    return userData.status;
  }

  /**
   * Get Rich Presence data for a user
   */
  async getUserRichPresence(userId: string, guildId?: string): Promise<RichPresence | null> {
    const userData = await this.getUserData(userId, guildId);
    return userData.presence || null;
  }

  /**
   * Make authenticated HTTP request to Discord API with comprehensive error handling
   */
  private async makeRequest<T>(endpoint: string, context?: LogContext): Promise<T> {
    const requestContext = {
      ...context,
      operation: 'discord_api_request',
      metadata: { endpoint }
    };

    return this.circuitBreaker.execute(async () => {
      await this.waitForRateLimit(requestContext);

      const url = `${this.baseUrl}${endpoint}`;
      const headers = {
        'Authorization': `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (discord-bot-api, 1.0.0)',
        'X-RateLimit-Precision': 'millisecond'
      };

      const startTime = Date.now();
      this.requestMetrics.totalRequests++;

      logger.discordApiRequest(endpoint, 'GET', requestContext);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, { 
          headers,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseTime = Date.now() - startTime;
        
        logger.discordApiResponse(endpoint, response.status, responseTime, requestContext);

        if (response.status === 429) {
          this.requestMetrics.rateLimitHits++;
          const retryAfter = parseFloat(response.headers.get('retry-after') || '1');
          
          logger.rateLimitHit(retryAfter, {
            ...requestContext,
            metadata: {
              ...requestContext.metadata,
              global: response.headers.get('x-ratelimit-global') === 'true',
              bucket: response.headers.get('x-ratelimit-bucket')
            }
          });

          await handleDiscordRateLimit(retryAfter, requestContext);
          return this.makeRequest<T>(endpoint, context); // Retry the request
        }

        if (!response.ok) {
          this.requestMetrics.failedRequests++;
          const errorData = await response.json().catch(() => ({}));
          const error = this.createDiscordApiError(response.status, errorData);
          
          logger.error('Discord API error response', {
            ...requestContext,
            metadata: {
              ...requestContext.metadata,
              status: response.status,
              errorData
            }
          }, error);
          
          throw error;
        }

        this.updateRateLimitTracking(response, requestContext);

        const data = await response.json() as T;
        this.requestMetrics.successfulRequests++;

        if (responseTime > 2000) {
          logger.performance('slow_discord_api_request', responseTime, {
            ...requestContext,
            metadata: { ...requestContext.metadata, threshold: 2000 }
          });
        }

        return data;
      } catch (error) {
        this.requestMetrics.failedRequests++;
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
          const connectionError = this.createError(
            ErrorCode.SERVICE_UNAVAILABLE, 
            'Unable to connect to Discord API'
          );
          
          logger.error('Discord API connection failed', {
            ...requestContext,
            metadata: { ...requestContext.metadata, networkError: true }
          }, connectionError);
          
          throw connectionError;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          const timeoutError = this.createError(
            ErrorCode.SERVICE_UNAVAILABLE,
            'Discord API request timed out'
          );
          
          logger.error('Discord API request timeout', {
            ...requestContext,
            metadata: { ...requestContext.metadata, timeout: true }
          }, timeoutError);
          
          throw timeoutError;
        }

        throw error;
      }
    }, requestContext);
  }

  /**
   * Get presence data (simplified - in real implementation this would come from gateway)
   */
  private async getPresenceData(
    _userId: string, 
    _guildId: string, 
    context?: LogContext
  ): Promise<DiscordPresence | null> {
    logger.debug('Presence data not available via REST API', {
      ...context,
      operation: 'get_presence_data',
      metadata: { reason: 'REST API limitation' }
    });
    
    return null;
  }

  /**
   * Wait for rate limit if necessary with enhanced tracking
   */
  private async waitForRateLimit(context?: LogContext): Promise<void> {
    const now = Date.now();
    
    if (now - this.rateLimitConfig.windowStart >= 1000) {
      this.rateLimitConfig.currentRequests = 0;
      this.rateLimitConfig.windowStart = now;
    }

    if (this.rateLimitConfig.isRateLimited && this.rateLimitConfig.rateLimitResetAt) {
      const waitTime = this.rateLimitConfig.rateLimitResetAt - now;
      if (waitTime > 0) {
        logger.debug('Waiting for rate limit to reset', {
          ...context,
          operation: 'rate_limit_wait',
          metadata: { waitTimeMs: waitTime }
        });
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.rateLimitConfig.isRateLimited = false;
        this.rateLimitConfig.rateLimitResetAt = null;
        
        logger.debug('Rate limit reset, continuing', {
          ...context,
          operation: 'rate_limit_reset'
        });
      }
    }

    if (this.rateLimitConfig.currentRequests >= this.rateLimitConfig.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - this.rateLimitConfig.windowStart);
      if (waitTime > 0) {
        logger.debug('Waiting for rate limit window reset', {
          ...context,
          operation: 'rate_limit_window_wait',
          metadata: { 
            waitTimeMs: waitTime,
            currentRequests: this.rateLimitConfig.currentRequests,
            maxRequests: this.rateLimitConfig.maxRequestsPerSecond
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.rateLimitConfig.currentRequests = 0;
        this.rateLimitConfig.windowStart = Date.now();
      }
    }

    this.rateLimitConfig.currentRequests++;
  }

  /**
   * Update rate limit tracking based on response headers with enhanced logging
   */
  private updateRateLimitTracking(response: Response, context?: LogContext): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAfter = response.headers.get('x-ratelimit-reset-after');
    const limit = response.headers.get('x-ratelimit-limit');
    const bucket = response.headers.get('x-ratelimit-bucket');

    if (remaining && resetAfter && limit) {
      const remainingRequests = parseInt(remaining);
      const resetTime = parseFloat(resetAfter) * 1000;
      const totalLimit = parseInt(limit);

      logger.debug('Rate limit info updated', {
        ...context,
        operation: 'rate_limit_update',
        metadata: {
          remaining: remainingRequests,
          limit: totalLimit,
          resetAfterMs: resetTime,
          bucket,
          utilizationPercent: Math.round(((totalLimit - remainingRequests) / totalLimit) * 100)
        }
      });

      if (remainingRequests <= 5) {
        logger.warn('Approaching Discord API rate limit', {
          ...context,
          operation: 'rate_limit_warning',
          metadata: {
            remaining: remainingRequests,
            limit: totalLimit,
            resetAfterMs: resetTime
          }
        });
      }

      if (remainingRequests === 0 && resetAfter) {
        this.rateLimitConfig.isRateLimited = true;
        this.rateLimitConfig.rateLimitResetAt = Date.now() + resetTime;
      }
    }
  }

  /**
   * Transform Discord API user data to internal format
   */
  private transformUserData(
    user: DiscordUser, 
    _guildMember: DiscordGuildMember | null, 
    presence: DiscordPresence | null
  ): UserData {
    const activities = presence?.activities ? this.transformActivities(presence.activities) : [];
    const richPresence = this.extractRichPresence(activities);

    const result: UserData = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      status: presence?.status || 'offline',
      activities,
      lastSeen: new Date(),
      bot: user.bot || false
    };

    if (user.avatar) result.avatar = user.avatar;
    if (user.global_name) result.globalName = user.global_name;
    if (richPresence) result.presence = richPresence;

    return result;
  }

  /**
   * Transform Discord activities to internal format
   */
  private transformActivities(discordActivities: DiscordActivity[]): Activity[] {
    return discordActivities.map(activity => {
      let type: Activity['type'];
      switch (activity.type) {
        case 0: type = 'playing'; break;
        case 1: type = 'listening'; break;
        case 2: type = 'watching'; break;
        case 3: type = 'custom'; break;
        case 5: type = 'competing'; break;
        default: type = 'custom';
      }

      const result: Activity = {
        type,
        name: activity.name
      };

      if (activity.details) result.details = activity.details;
      if (activity.state) result.state = activity.state;
      if (activity.timestamps) result.timestamps = activity.timestamps;
      if (activity.url) result.url = activity.url;

      return result;
    });
  }

  /**
   * Extract Rich Presence data from activities
   */
  private extractRichPresence(activities: Activity[]): RichPresence | null {
    const richActivity = activities.find(activity => 
      activity.details || activity.state || activity.type === 'playing'
    );

    if (!richActivity) {
      return null;
    }

    const result: RichPresence = {};
    
    if (richActivity.details) result.details = richActivity.details;
    if (richActivity.state) result.state = richActivity.state;
    
    return result;
  }

  /**
   * Create standardized error
   */
  private createError(code: ErrorCode, message: string, details?: any): Error {
    const error = new Error(message);
    (error as any).code = code;
    (error as any).details = details;
    return error;
  }

  /**
   * Create Discord API specific error
   */
  private createDiscordApiError(status: number, errorData: any): Error {
    const discordError: DiscordApiError = {
      code: errorData.code || 0,
      message: errorData.message || 'Unknown Discord API error',
      status,
      isRateLimit: status === 429,
      retryAfter: errorData.retry_after
    };

    const error = new Error(`Discord API Error: ${discordError.message}`);
    (error as any).code = ErrorCode.DISCORD_API_ERROR;
    (error as any).details = discordError;
    return error;
  }

  /**
   * Get client metrics for monitoring
   */
  getMetrics() {
    return {
      requests: { ...this.requestMetrics },
      rateLimit: {
        isLimited: this.rateLimitConfig.isRateLimited,
        resetAt: this.rateLimitConfig.rateLimitResetAt,
        currentRequests: this.rateLimitConfig.currentRequests,
        maxRequests: this.rateLimitConfig.maxRequestsPerSecond
      },
      circuitBreaker: this.circuitBreaker.getState()
    };
  }

  /**
   * Reset metrics (useful for monitoring systems)
   */
  resetMetrics(): void {
    this.requestMetrics.totalRequests = 0;
    this.requestMetrics.successfulRequests = 0;
    this.requestMetrics.failedRequests = 0;
    this.requestMetrics.rateLimitHits = 0;
    
    logger.info('Discord client metrics reset', {
      component: 'DiscordClient',
      operation: 'metrics_reset'
    });
  }

  /**
   * Health check for the Discord client
   */
  async healthCheck() {
    const metrics = this.getMetrics();
    const circuitBreakerOpen = metrics.circuitBreaker.state === 'open';
    const highFailureRate = metrics.requests.totalRequests > 0 && 
      (metrics.requests.failedRequests / metrics.requests.totalRequests) > 0.5;

    const healthy = !circuitBreakerOpen && !highFailureRate;
    
    let status = 'healthy';
    if (circuitBreakerOpen) {
      status = 'circuit_breaker_open';
    } else if (highFailureRate) {
      status = 'high_failure_rate';
    } else if (metrics.rateLimit.isLimited) {
      status = 'rate_limited';
    }

    return {
      healthy,
      status,
      metrics
    };
  }
}