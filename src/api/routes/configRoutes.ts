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

      // Get database service from app locals (will be set by main server)
      const databaseService = req.app.locals['databaseService'];
      if (!databaseService) {
        res.status(500).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Database service not available',
            timestamp: new Date().toISOString(),
            requestId: requestId
          }
        });
        return;
      }

      // Get existing configuration or create default
      let serverConfig = await databaseService.getServerConfig(serverId);
      if (!serverConfig) {
        serverConfig = await databaseService.createDefaultServerConfig(serverId);
      }

      // Update configuration with provided data
      if (configData.commandPrefix !== undefined) {
        serverConfig.commandPrefix = configData.commandPrefix;
      }
      if (configData.enabled !== undefined) {
        serverConfig.enabled = configData.enabled;
      }
      if (configData.timezone !== undefined) {
        serverConfig.timezone = configData.timezone;
      }
      if (configData.adminRoles !== undefined) {
        serverConfig.adminRoles = configData.adminRoles;
      }
      if (configData.apiAccess !== undefined) {
        serverConfig.apiAccess = { ...serverConfig.apiAccess, ...configData.apiAccess };
      }
      if (configData.logging !== undefined) {
        serverConfig.logging = { ...serverConfig.logging, ...configData.logging };
      }
      if (configData.autoChannels !== undefined) {
        serverConfig.autoChannels = configData.autoChannels;
      }

      // Save updated configuration
      serverConfig.lastUpdated = new Date();
      await databaseService.saveServerConfig(serverConfig);

      // Notify bot service to reload configuration
      const botService = req.app.locals['botService'];
      if (botService) {
        await botService.reloadServerConfiguration(serverId);
      }

      const response: ServerConfigResponse = {
        serverId,
        updated: true,
        config: {
          commandPrefix: serverConfig.commandPrefix,
          autoChannelCount: serverConfig.autoChannels.length,
          apiEnabled: serverConfig.apiAccess.enabled
        }
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

      // Get bot service to access auto channel manager
      const botService = req.app.locals['botService'];
      if (!botService) {
        res.status(503).json(this.createErrorResponse(
          'SERVICE_UNAVAILABLE',
          'Bot service not available',
          requestId
        ));
        return;
      }

      const autoChannelManager = botService.getAutoChannelManager();
      if (!autoChannelManager) {
        res.status(503).json(this.createErrorResponse(
          'SERVICE_UNAVAILABLE',
          'Auto channel manager not available',
          requestId
        ));
        return;
      }

      // Get database service to find channel configuration
      const databaseService = req.app.locals['databaseService'];
      if (!databaseService) {
        res.status(503).json(this.createErrorResponse(
          'SERVICE_UNAVAILABLE',
          'Database service not available',
          requestId
        ));
        return;
      }

      // Find which server this template belongs to
      const serverIds = await databaseService.getAllServerIds();
      let channelConfig = null;

      for (const sid of serverIds) {
        const configs = await databaseService.getChannelConfigs(sid);
        const config = configs.find((c: any) => c.templateChannelId === templateId);
        if (config) {
          channelConfig = config;
          break;
        }
      }

      if (!channelConfig) {
        res.status(404).json(this.createErrorResponse(
          'TEMPLATE_NOT_FOUND',
          'No auto-channel configuration found for this template ID',
          requestId
        ));
        return;
      }

      // Get current stats from auto channel manager
      const stats = autoChannelManager.getStats();
      const activeChannelsForTemplate = stats.channelsByTemplate[templateId] || 0;

      const channelStatus: AutoChannelStatusResponse = {
        templateId,
        activeChannels: [], // TODO: Get actual active channel details in future enhancement
        maxChannels: channelConfig.maxChannels,
        canCreateNew: activeChannelsForTemplate < channelConfig.maxChannels
      };

      res.json(this.createSuccessResponse(channelStatus, requestId));
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