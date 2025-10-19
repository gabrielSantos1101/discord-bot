import { Request, Response, Router } from 'express';
import { ApiResponse, AutoChannelStatusResponse, ServerConfigResponse } from '../../models/ApiResponses';
import { ErrorCode } from '../../models/ErrorTypes';
import { validateServerConfig } from '../../models/validators/ConfigValidator';

/**
 * Configuration routes for server and channel management
 */
export class ConfigRoutes {
  private router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  /**
   * Setup configuration routes
   */
  private setupRoutes(): void {
    // POST /api/config/server/{serverId} - Update server configuration
    this.router.post('/server/:serverId', this.updateServerConfig.bind(this));
    
    // GET /api/channels/auto/{templateId} - Get auto channel status
    this.router.get('/auto/:templateId', this.getAutoChannelStatus.bind(this));
  }

  /**
   * Update server configuration endpoint
   * POST /api/config/server/{serverId}
   */
  private async updateServerConfig(req: Request, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const requestId = req.headers['x-request-id'] as string;
      const configData = req.body;

      // Validate server ID
      if (!serverId || !this.isValidServerId(serverId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_SERVER_ID',
          'Server ID must be a valid Discord snowflake (numeric string)',
          requestId
        ));
        return;
      }

      // Validate configuration data
      const validationErrors = validateServerConfig(configData);
      if (validationErrors.length > 0) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_CONFIG_DATA',
          'Invalid configuration data provided',
          requestId,
          validationErrors
        ));
        return;
      }

      // TODO: Implement actual configuration storage (database integration in future task)
      // For now, we'll simulate the configuration update
      const mockConfig = {
        commandPrefix: configData.commandPrefix || '!',
        autoChannelCount: configData.autoChannels?.length || 0,
        apiEnabled: configData.apiAccess?.enabled !== false
      };

      const response: ServerConfigResponse = {
        serverId,
        updated: true,
        config: mockConfig
      };

      res.json(this.createSuccessResponse(response, requestId));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  /**
   * Get auto channel status endpoint
   * GET /api/channels/auto/{templateId}
   */
  private async getAutoChannelStatus(req: Request, res: Response): Promise<void> {
    try {
      const { templateId } = req.params;
      const requestId = req.headers['x-request-id'] as string;

      // Validate template ID
      if (!templateId || !this.isValidChannelId(templateId)) {
        res.status(400).json(this.createErrorResponse(
          'INVALID_TEMPLATE_ID',
          'Template ID must be a valid Discord snowflake (numeric string)',
          requestId
        ));
        return;
      }

      // TODO: Implement actual channel status retrieval (database/Discord API integration in future task)
      // For now, we'll return mock data
      const mockChannelStatus: AutoChannelStatusResponse = {
        templateId,
        activeChannels: [
          {
            id: '1234567890123456789',
            name: 'Auto Channel 1',
            userCount: 3,
            createdAt: new Date(Date.now() - 300000).toISOString() // 5 minutes ago
          },
          {
            id: '1234567890123456790',
            name: 'Auto Channel 2',
            userCount: 1,
            createdAt: new Date(Date.now() - 120000).toISOString() // 2 minutes ago
          }
        ],
        maxChannels: 10,
        canCreateNew: true
      };

      res.json(this.createSuccessResponse(mockChannelStatus, requestId));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  /**
   * Validate Discord server ID (snowflake format)
   */
  private isValidServerId(serverId: string): boolean {
    // Discord snowflakes are 64-bit integers represented as strings
    // They should be 17-19 digits long and numeric
    const snowflakeRegex = /^\d{17,19}$/;
    return snowflakeRegex.test(serverId);
  }

  /**
   * Validate Discord channel ID (snowflake format)
   */
  private isValidChannelId(channelId: string): boolean {
    // Same validation as server ID - Discord uses same snowflake format
    const snowflakeRegex = /^\d{17,19}$/;
    return snowflakeRegex.test(channelId);
  }

  /**
   * Handle errors and send appropriate responses
   */
  private handleError(error: any, req: Request, res: Response): void {
    const requestId = req.headers['x-request-id'] as string;
    
    // Handle known error types
    if (error.code === ErrorCode.INVALID_REQUEST) {
      res.status(400).json(this.createErrorResponse(
        'INVALID_REQUEST',
        error.message,
        requestId
      ));
      return;
    }

    if (error.code === ErrorCode.INSUFFICIENT_PERMISSIONS) {
      res.status(403).json(this.createErrorResponse(
        'INSUFFICIENT_PERMISSIONS',
        'Insufficient permissions to modify server configuration',
        requestId
      ));
      return;
    }

    if (error.code === ErrorCode.SERVICE_UNAVAILABLE) {
      res.status(503).json(this.createErrorResponse(
        'SERVICE_UNAVAILABLE',
        'Configuration service is currently unavailable',
        requestId
      ));
      return;
    }

    // Handle unknown errors
    console.error('Unhandled error in config routes:', error);
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
export const configRoutes = new ConfigRoutes().getRouter();