import { Request, Response, Router } from 'express';
import { ApiResponse, UserActivityResponse, UserPresenceResponse, UserStatusResponse } from '../../models/ApiResponses';
import { ErrorCode } from '../../models/ErrorTypes';
import { validateUserData } from '../../models/validators/UserDataValidator';
import { DiscordClient } from '../../services/DiscordClient';
import { loadConfig } from '../../utils/config';

/**
 * User routes for Discord user data endpoints
 */
export class UserRoutes {
  private router: Router;
  private discordClient: DiscordClient;

  constructor() {
    this.router = Router();
    const config = loadConfig();
    this.discordClient = new DiscordClient(config.discord.botToken);
    this.setupRoutes();
  }

  /**
   * Setup user routes
   */
  private setupRoutes(): void {
    // GET /api/users/{userId}/status - Get user status
    this.router.get('/:userId/status', this.getUserStatus.bind(this));
    
    // GET /api/users/{userId}/activity - Get user activities
    this.router.get('/:userId/activity', this.getUserActivity.bind(this));
    
    // GET /api/users/{userId}/presence - Get user Rich Presence
    this.router.get('/:userId/presence', this.getUserPresence.bind(this));
  }

  /**
   * Get user status endpoint
   * GET /api/users/{userId}/status
   */
  private async getUserStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { guildId } = req.query;
      const requestId = req.headers['x-request-id'] as string;

      // Validate user ID exists and is valid
      if (!userId || !this.isValidUserId(userId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_USER_ID',
          'User ID must be a valid Discord snowflake (numeric string)',
          requestId
        ));
        return;
      }

      // Query Discord API directly
      const userData = await this.discordClient.getUserData(
        userId, 
        guildId as string | undefined
      );

      // Validate response data
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
        inVoiceChannel: false // TODO: Implement voice channel detection in future task
      };

      res.json(this.createSuccessResponse(response, requestId));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  /**
   * Get user activity endpoint
   * GET /api/users/{userId}/activity
   */
  private async getUserActivity(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { guildId } = req.query;
      const requestId = req.headers['x-request-id'] as string;

      // Validate user ID exists and is valid
      if (!userId || !this.isValidUserId(userId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_USER_ID',
          'User ID must be a valid Discord snowflake (numeric string)',
          requestId
        ));
        return;
      }

      // Query Discord API directly
      const activities = await this.discordClient.getUserActivities(
        userId,
        guildId as string | undefined
      );

      const response: UserActivityResponse = {
        userId,
        activities,
        lastUpdated: new Date().toISOString()
      };

      res.json(this.createSuccessResponse(response, requestId));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  /**
   * Get user Rich Presence endpoint
   * GET /api/users/{userId}/presence
   */
  private async getUserPresence(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { guildId } = req.query;
      const requestId = req.headers['x-request-id'] as string;

      // Validate user ID exists and is valid
      if (!userId || !this.isValidUserId(userId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_USER_ID',
          'User ID must be a valid Discord snowflake (numeric string)',
          requestId
        ));
        return;
      }

      // Query Discord API directly
      const userData = await this.discordClient.getUserData(
        userId,
        guildId as string | undefined
      );

      const richPresence = await this.discordClient.getUserRichPresence(
        userId,
        guildId as string | undefined
      );

      // Get current activity (first non-custom activity or first activity)
      const currentActivity = userData.activities.find(activity => 
        activity.type !== 'custom'
      ) || userData.activities[0] || null;

      const response: UserPresenceResponse = {
        userId,
        currentActivity,
        richPresence,
        lastUpdated: userData.lastSeen.toISOString()
      };

      res.json(this.createSuccessResponse(response, requestId));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  /**
   * Validate Discord user ID (snowflake format)
   */
  private isValidUserId(userId: string): boolean {
    // Discord snowflakes are 64-bit integers represented as strings
    // They should be 17-19 digits long and numeric
    const snowflakeRegex = /^\d{17,19}$/;
    return snowflakeRegex.test(userId);
  }

  /**
   * Handle errors and send appropriate responses
   */
  private handleError(error: any, req: Request, res: Response): void {
    const requestId = req.headers['x-request-id'] as string;
    
    // Handle known error types
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

    // Handle unknown errors
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

// Export router instance for use in server
export const userRoutes = new UserRoutes().getRouter();