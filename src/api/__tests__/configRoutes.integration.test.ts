import express from 'express';
import request from 'supertest';
import { ChannelConfig } from '../../models/ChannelConfig';
import { ServerConfig } from '../../models/ServerConfig';
import { ConfigRoutes } from '../routes/configRoutes';

describe('ConfigRoutes Integration Tests', () => {
  let app: express.Application;
  let mockDatabaseService: any;
  let mockBotService: any;
  let mockAutoChannelManager: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock services
    mockDatabaseService = {
      getServerConfig: jest.fn(),
      createDefaultServerConfig: jest.fn(),
      saveServerConfig: jest.fn(),
      getAllServerIds: jest.fn(),
      getChannelConfigs: jest.fn()
    };

    mockAutoChannelManager = {
      getStats: jest.fn()
    };

    mockBotService = {
      reloadServerConfiguration: jest.fn(),
      getAutoChannelManager: jest.fn().mockReturnValue(mockAutoChannelManager)
    };

    // Setup Express app
    app = express();
    app.use(express.json());

    // Add request ID middleware
    app.use((req, _res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || 'test-request-id';
      next();
    });

    // Add mock services to app locals
    app.locals['databaseService'] = mockDatabaseService;
    app.locals['botService'] = mockBotService;

    const configRoutes = new ConfigRoutes();
    app.use('/api/config', configRoutes.getRouter());
    app.use('/api/channels', configRoutes.getRouter());
  });

  describe('POST /api/config/server/:serverId', () => {
    const validServerId = '123456789012345678';
    const mockServerConfig: ServerConfig = {
      serverId: validServerId,
      commandPrefix: '!',
      enabled: true,
      timezone: 'UTC',
      adminRoles: ['admin-role'],
      apiAccess: {
        enabled: true,
        allowedEndpoints: ['/api/users/*'],
        rateLimit: 100,
        allowedIPs: []
      },
      logging: {
        level: 'info',
        channels: [],
        logUserActivities: true,
        logChannelOperations: false
      },
      autoChannels: [],
      lastUpdated: new Date()
    };

    it('should update server configuration successfully', async () => {
      mockDatabaseService.getServerConfig.mockResolvedValue(mockServerConfig);
      mockDatabaseService.saveServerConfig.mockResolvedValue(undefined);
      mockBotService.reloadServerConfiguration.mockResolvedValue(undefined);

      const updateData = {
        commandPrefix: '?',
        enabled: false,
        adminRoles: ['new-admin-role']
      };

      const response = await request(app)
        .post(`/api/config/server/${validServerId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          serverId: validServerId,
          updated: true,
          config: {
            commandPrefix: '?',
            autoChannelCount: 0,
            apiEnabled: true
          }
        },
        success: true,
        requestId: 'test-request-id'
      });

      expect(mockDatabaseService.saveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          commandPrefix: '?',
          enabled: false,
          adminRoles: ['new-admin-role']
        })
      );
      expect(mockBotService.reloadServerConfiguration).toHaveBeenCalledWith(validServerId);
    });

    it('should create default config if server config does not exist', async () => {
      mockDatabaseService.getServerConfig.mockResolvedValue(null);
      mockDatabaseService.createDefaultServerConfig.mockResolvedValue(mockServerConfig);
      mockDatabaseService.saveServerConfig.mockResolvedValue(undefined);

      const updateData = {
        commandPrefix: '?'
      };

      const response = await request(app)
        .post(`/api/config/server/${validServerId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data.updated).toBe(true);
      expect(mockDatabaseService.createDefaultServerConfig).toHaveBeenCalledWith(validServerId);
    });

    it('should return 400 for invalid server ID', async () => {
      const invalidServerId = 'invalid-id';

      const response = await request(app)
        .post(`/api/config/server/${invalidServerId}`)
        .send({ commandPrefix: '?' })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: 'INVALID_SERVER_ID',
          message: expect.stringContaining('valid Discord snowflake')
        }
      });

      expect(mockDatabaseService.getServerConfig).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid configuration data', async () => {
      const invalidConfigData = {
        commandPrefix: '', // Invalid empty prefix
        enabled: 'not-boolean', // Invalid type
        adminRoles: 'not-array' // Invalid type
      };

      const response = await request(app)
        .post(`/api/config/server/${validServerId}`)
        .send(invalidConfigData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: 'INVALID_CONFIG_DATA',
          message: 'Invalid configuration data provided',
          details: expect.any(Array)
        }
      });
    });

    it('should return 500 when database service is not available', async () => {
      delete app.locals['databaseService'];

      const response = await request(app)
        .post(`/api/config/server/${validServerId}`)
        .send({ commandPrefix: '?' })
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database service not available'
        }
      });
    });

    it('should handle partial configuration updates', async () => {
      mockDatabaseService.getServerConfig.mockResolvedValue(mockServerConfig);
      mockDatabaseService.saveServerConfig.mockResolvedValue(undefined);

      const partialUpdate = {
        apiAccess: {
          rateLimit: 200
        },
        logging: {
          level: 'debug'
        }
      };

      const response = await request(app)
        .post(`/api/config/server/${validServerId}`)
        .send(partialUpdate)
        .expect(200);

      expect(response.body.data.updated).toBe(true);
      expect(mockDatabaseService.saveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          apiAccess: expect.objectContaining({
            rateLimit: 200
          }),
          logging: expect.objectContaining({
            level: 'debug'
          })
        })
      );
    });
  });

  describe('GET /api/channels/auto/:templateId', () => {
    const validTemplateId = '123456789012345678';
    const mockChannelConfig: ChannelConfig = {
      templateChannelId: validTemplateId,
      serverId: '987654321098765432',
      namePattern: 'Auto-{number}',
      maxChannels: 5,
      emptyTimeout: 10,
      permissions: [],
      enabled: true,
      userLimit: 0
    };

    it('should return auto channel status successfully', async () => {
      mockDatabaseService.getAllServerIds.mockResolvedValue(['987654321098765432']);
      mockDatabaseService.getChannelConfigs.mockResolvedValue([mockChannelConfig]);
      mockAutoChannelManager.getStats.mockReturnValue({
        totalChannels: 2,
        channelsByTemplate: {
          [validTemplateId]: 2
        },
        queueSize: 0
      });

      const response = await request(app)
        .get(`/api/channels/auto/${validTemplateId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          templateId: validTemplateId,
          activeChannels: [],
          maxChannels: 5,
          canCreateNew: true
        },
        success: true
      });
    });

    it('should return canCreateNew false when at max channels', async () => {
      mockDatabaseService.getAllServerIds.mockResolvedValue(['987654321098765432']);
      mockDatabaseService.getChannelConfigs.mockResolvedValue([mockChannelConfig]);
      mockAutoChannelManager.getStats.mockReturnValue({
        totalChannels: 5,
        channelsByTemplate: {
          [validTemplateId]: 5
        },
        queueSize: 1
      });

      const response = await request(app)
        .get(`/api/channels/auto/${validTemplateId}`)
        .expect(200);

      expect(response.body.data.canCreateNew).toBe(false);
    });

    it('should return 400 for invalid template ID', async () => {
      const invalidTemplateId = 'invalid-id';

      const response = await request(app)
        .get(`/api/channels/auto/${invalidTemplateId}`)
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: 'INVALID_TEMPLATE_ID',
          message: expect.stringContaining('valid Discord snowflake')
        }
      });
    });

    it('should return 404 when template configuration not found', async () => {
      mockDatabaseService.getAllServerIds.mockResolvedValue(['987654321098765432']);
      mockDatabaseService.getChannelConfigs.mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/channels/auto/${validTemplateId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'No auto-channel configuration found for this template ID'
        }
      });
    });

    it('should return 503 when bot service is not available', async () => {
      delete app.locals['botService'];

      const response = await request(app)
        .get(`/api/channels/auto/${validTemplateId}`)
        .expect(503);

      expect(response.body).toMatchObject({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Bot service not available'
        }
      });
    });

    it('should return 503 when auto channel manager is not available', async () => {
      mockBotService.getAutoChannelManager.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/channels/auto/${validTemplateId}`)
        .expect(503);

      expect(response.body).toMatchObject({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Auto channel manager not available'
        }
      });
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.getAllServerIds.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get(`/api/channels/auto/${validTemplateId}`)
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred'
        }
      });
    });
  });

  describe('Error handling', () => {
    it('should handle insufficient permissions error', async () => {
      const error = new Error('Insufficient permissions');
      (error as any).code = 'INSUFFICIENT_PERMISSIONS';
      mockDatabaseService.saveServerConfig.mockRejectedValue(error);
      mockDatabaseService.getServerConfig.mockResolvedValue({
        serverId: '123456789012345678',
        commandPrefix: '!',
        enabled: true,
        timezone: 'UTC',
        adminRoles: [],
        apiAccess: { enabled: true, allowedEndpoints: [], rateLimit: 100, allowedIPs: [] },
        logging: { level: 'info', channels: [], logUserActivities: true, logChannelOperations: false },
        autoChannels: [],
        lastUpdated: new Date()
      });

      const response = await request(app)
        .post('/api/config/server/123456789012345678')
        .send({ commandPrefix: '?' })
        .expect(403);

      expect(response.body).toMatchObject({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: expect.stringContaining('permissions')
        }
      });
    });

    it('should handle service unavailable error', async () => {
      const error = new Error('Service unavailable');
      (error as any).code = 'SERVICE_UNAVAILABLE';
      mockDatabaseService.getServerConfig.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/config/server/123456789012345678')
        .send({ commandPrefix: '?' })
        .expect(503);

      expect(response.body).toMatchObject({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: expect.stringContaining('unavailable')
        }
      });
    });
  });
});