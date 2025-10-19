import { Request, Response, Router } from 'express';
import { ApiResponse, UserActivityResponse, UserPresenceResponse, UserStatusResponse } from '../../models/ApiResponses';
import { ErrorCode } from '../../models/ErrorTypes';
import { validateUserData } from '../../models/validators/UserDataValidator';
import { CacheService } from '../../services/CacheService';
import { DiscordClient } from '../../services/DiscordClient';
import { DiscordClientFactory } from '../../services/DiscordClientFactory';

/**
 * User routes for Discord user data endpoints
 */
export class UserRoutes {
  private router: Router;
  private discordClient: DiscordClient;
  private cacheService: CacheService;
  private metricsService?: any;

  constructor(cacheService: CacheService, metricsService?: any) {
    this.router = Router();
    this.cacheService = cacheService;
    this.metricsService = metricsService;
    this.discordClient = DiscordClientFactory.getInstance(cacheService);
    this.setupRoutes();
  }

  /**
   * Setup user routes
   */
  private setupRoutes(): void {
    this.router.get('/:userId/status', this.getUserStatus.bind(this));
    this.router.get('/:userId/activity', this.getUserActivity.bind(this));
    this.router.get('/:userId/presence', this.getUserPresence.bind(this));
  }

  /**
   * Get user status endpoint
   * GET /api/users/{userId}/status
   */
  private async getUserStatus(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let fromCache = false;

    try {
      const { userId } = req.params;
      const { guildId } = req.query;
      const requestId = req.headers['x-request-id'] as string;

      if (!userId || !this.isValidUserId(userId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_USER_ID',
          'User ID must be a valid Discord snowflake (numeric string)',
          requestId
        ));
        return;
      }

      let userData;
      let fromCache = false;
      const cachedPresence = await this.cacheService.getUserPresenceDataWithFallback(userId);

      if (cachedPresence && this.isCacheValid(cachedPresence)) {
        userData = {
          id: userId,
          status: cachedPresence.status,
          activities: cachedPresence.activities,
          lastSeen: cachedPresence.lastUpdated
        };
        fromCache = true;
      } else {
        userData = await this.discordClient.getUserData(
          userId, 
          guildId as string | undefined
        );
      }

      const validationErrors = validateUserData(userData);
      if (validationErrors.length > 0) {
        res.status(500).json(this.createErrorResponse(
          'INVALID_RESPONSE_DATA',
          'Invalid data received from Discord API',
          requestId,
          validationErrors
        ));
        return;
      }

      const response: UserStatusResponse = {
        userId: userData.id,
        status: userData.status,
        activities: userData.activities,
        lastUpdated: userData.lastSeen.toISOString(),
        inVoiceChannel: false,
        fromCache
      };

      success = true;
      res.json(this.createSuccessResponse(response, requestId));
    } catch (error) {
      this.handleError(error, req, res);
    } finally {
      if (this.metricsService) {
        const responseTime = Date.now() - startTime;
        this.metricsService.recordApiRequest(responseTime, success, fromCache);
      }
    }
  }

  /**
   * Get user activity endpoint
   * GET /api/users/{userId}/activity
   */
  private async getUserActivity(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let fromCache = false;

    try {
      const { userId } = req.params;
      const { guildId } = req.query;
      const requestId = req.headers['x-request-id'] as string;

      if (!userId || !this.isValidUserId(userId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_USER_ID',
          'User ID must be a valid Discord snowflake (numeric string)',
          requestId
        ));
        return;
      }

      let activities;
      let lastUpdated;
      let fromCache = false;

      const cachedPresence = await this.cacheService.getUserPresenceDataWithFallback(userId);
      if (cachedPresence && this.isCacheValid(cachedPresence)) {
        activities = cachedPresence.activities;
        lastUpdated = cachedPresence.lastUpdated.toISOString();
        fromCache = true;
      } else {
        activities = await this.discordClient.getUserActivities(
          userId,
          guildId as string | undefined
        );
        lastUpdated = new Date().toISOString();
      }

      const response: UserActivityResponse = {
        userId,
        activities,
        lastUpdated,
        fromCache
      };

      success = true;
      res.json(this.createSuccessResponse(response, requestId));
    } catch (error) {
      this.handleError(error, req, res);
    } finally {
      if (this.metricsService) {
        const responseTime = Date.now() - startTime;
        this.metricsService.recordApiRequest(responseTime, success, fromCache);
      }
    }
  }

  /**
   * Get user Rich Presence endpoint
   * GET /api/users/{userId}/presence
   */
  private async getUserPresence(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let fromCache = false;

    try {
      const { userId } = req.params;
      const { guildId } = req.query;
      const requestId = req.headers['x-request-id'] as string;

      if (!userId || !this.isValidUserId(userId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_USER_ID',
          'User ID must be a valid Discord snowflake (numeric string)',
          requestId
        ));
        return;
      }

      let userData;
      let fromCache = false;

      const cachedPresence = await this.cacheService.getUserPresenceDataWithFallback(userId);
      if (cachedPresence && this.isCacheValid(cachedPresence)) {
        userData = {
          id: userId,
          status: cachedPresence.status,
          activities: cachedPresence.activities,
          lastSeen: cachedPresence.lastUpdated
        };
        fromCache = true;
      } else {
        userData = await this.discordClient.getUserData(
          userId,
          guildId as string | undefined
        );
      }

      const richPresence = await this.discordClient.getUserRichPresence(
        userId,
        guildId as string | undefined
      );

      const currentActivity = userData.activities.find(activity => 
        activity.type !== 'custom'
      ) || userData.activities[0] || null;

      const response: UserPresenceResponse = {
        userId,
        currentActivity,
        richPresence,
        lastUpdated: userData.lastSeen.toISOString(),
        fromCache
      };

      success = true;
      res.json(this.createSuccessResponse(response, requestId));
    } catch (error) {
      this.handleError(error, req, res);
    } finally {
      if (this.metricsService) {
        const responseTime = Date.now() - startTime;
        this.metricsService.recordApiRequest(responseTime, success, fromCache);
      }
    }
  }

  /**
   * Validate Discord user ID (snowflake format)
   */
  private isValidUserId(userId: string): boolean {
    const snowflakeRegex = /^\d{17,19}$/;
    return snowflakeRegex.test(userId);
  }

  /**
   * Check if cached presence data is still valid
   */
  private isCacheValid(presence: any): boolean {
    const maxAge = 5 * 60 * 1000;
    const age = Date.now() - presence.lastUpdated.getTime();
    return age < maxAge;
  }

  /**
   * Handle errors and send appropriate responses
   */
  private handleError(error: any, req: Request, res: Response): void {
    const requestId = req.headers['x-request-id'] as string;

    if (error.code === ErrorCode.USER_NOT_FOUND) {
      res.status(404).json(this.createErrorResponse(
        'USER_NOT_FOUND',
        error.message,
        requestId
      ));
      return;
    }

    if (error.code === ErrorCode.DISCORD_API_ERROR) {
      const discordError = error.details;
      if (discordError.isRateLimit) {
        res.status(429).json(this.createErrorResponse(
          'RATE_LIMITED',
          'Discord API rate limit exceeded',
          requestId,
          { retryAfter: discordError.retryAfter }
        ));
        return;
      }

      res.status(502).json(this.createErrorResponse(
        'DISCORD_API_ERROR',
        'Error communicating with Discord API',
        requestId,
        { status: discordError.status, message: discordError.message }
      ));
      return;
    }

    if (error.code === ErrorCode.SERVICE_UNAVAILABLE) {
      res.status(503).json(this.createErrorResponse(
        'SERVICE_UNAVAILABLE',
        'Discord API is currently unavailable',
        requestId
      ));
      return;
    }

    console.error('Unhandled error in user routes:', error);
    res.status(500).json(this.createErrorResponse(
      'INTERNAL_ERROR',
      'An unexpected error occurred',
      requestId
    ));
  }

  /**
   * Create success response wrapper
   */
  private createSuccessResponse<T>(data: T, requestId: string): ApiResponse<T> {
    return {
      data,
      timestamp: new Date().toISOString(),
      requestId,
      success: true
    };
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    code: string,
    message: string,
    requestId: string,
    details?: any
  ) {
    return {
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
        requestId
      }
    };
  }

  /**
   * Get router instance
   */
  public getRouter(): Router {
    return this.router;
  }
}

export function createUserRoutes(cacheService: CacheService, metricsService?: any): Router {
  return new UserRoutes(cacheService, metricsService).getRouter();
}

export let userRoutes: Router;