import express from 'express';
import request from 'supertest';
import { UserData } from '../../models/UserData';
import { DiscordClient } from '../../services/DiscordClient';
import { UserRoutes } from '../routes/userRoutes';

// Mock DiscordClient
jest.mock('../../services/DiscordClient');
jest.mock('../../utils/config', () => ({
  loadConfig: () => ({
    discord: {
      botToken: 'test-bot-token'
    }
  })
}));

const MockedDiscordClient = DiscordClient as jest.MockedClass<typeof DiscordClient>;

describe('UserRoutes Integration Tests', () => {
  let app: express.Application;
  let mockDiscordClient: jest.Mocked<DiscordClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Discord client
    mockDiscordClient = {
      getUserData: jest.fn(),
      getUserActivities: jest.fn(),
      getUserStatus: jest.fn(),
      getUserRichPresence: jest.fn()
    } as any;

    MockedDiscordClient.mockImplementation(() => mockDiscordClient);

    // Setup Express app
    app = express();
    app.use(express.json());
    
    // Add request ID middleware
    app.use((req, _res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || 'test-request-id';
      next();
    });

    const userRoutes = new UserRoutes();
    app.use('/api/users', userRoutes.getRouter());
  });

  describe('GET /api/users/:userId/status', () => {
    const validUserId = '123456789012345678';
    const mockUserData: UserData = {
      id: validUserId,
      username: 'testuser',
      discriminator: '1234',
      status: 'online',
      activities: [
        {
          type: 'playing',
          name: 'Test Game'
        }
      ],
      lastSeen: new Date(),
      bot: false
    };

    it('should return user status successfully', async () => {
      mockDiscordClient.getUserData.mockResolvedValue(mockUserData);

      const response = await request(app)
        .get(`/api/users/${validUserId}/status`)
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          userId: validUserId,
          status: 'online',
          activities: expect.any(Array),
          lastUpdated: expect.any(String),
          inVoiceChannel: false
        },
        success: true,
        timestamp: expect.any(String),
        requestId: 'test-request-id'
      });

      expect(mockDiscordClient.getUserData).toHaveBeenCalledWith(validUserId, undefined);
    });

    it('should return user status with guild ID query parameter', async () => {
      mockDiscordClient.getUserData.mockResolvedValue(mockUserData);
      const guildId = '987654321098765432';

      const response = await request(app)
        .get(`/api/users/${validUserId}/status?guildId=${guildId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDiscordClient.getUserData).toHaveBeenCalledWith(validUserId, guildId);
    });

    it('should return 400 for invalid user ID', async () => {
      const invalidUserId = 'invalid-id';

      const response = await request(app)
        .get(`/api/users/${invalidUserId}/status`)
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: 'INVALID_USER_ID',
          message: expect.stringContaining('valid Discord snowflake'),
          requestId: 'test-request-id'
        }
      });

      expect(mockDiscordClient.getUserData).not.toHaveBeenCalled();
    });

    it('should return 400 for empty user ID', async () => {
      await request(app)
        .get('/api/users//status')
        .expect(404); // Express returns 404 for empty params

      expect(mockDiscordClient.getUserData).not.toHaveBeenCalled();
    });

    it('should handle Discord API user not found error', async () => {
      const error = new Error('User not found');
      (error as any).code = 'USER_NOT_FOUND';
      mockDiscordClient.getUserData.mockRejectedValue(error);

      const response = await request(app)
        .get(`/api/users/${validUserId}/status`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    });

    it('should handle Discord API rate limiting', async () => {
      const error = new Error('Rate limited');
      (error as any).code = 'DISCORD_API_ERROR';
      (error as any).details = {
        isRateLimit: true,
        retryAfter: 30
      };
      mockDiscordClient.getUserData.mockRejectedValue(error);

      const response = await request(app)
        .get(`/api/users/${validUserId}/status`)
        .expect(429);

      expect(response.body).toMatchObject({
        error: {
          code: 'RATE_LIMITED',
          message: expect.stringContaining('rate limit')
        }
      });
    });

    it('should handle service unavailable error', async () => {
      const error = new Error('Service unavailable');
      (error as any).code = 'SERVICE_UNAVAILABLE';
      mockDiscordClient.getUserData.mockRejectedValue(error);

      const response = await request(app)
        .get(`/api/users/${validUserId}/status`)
        .expect(503);

      expect(response.body).toMatchObject({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: expect.stringContaining('unavailable')
        }
      });
    });

    it('should handle unexpected errors', async () => {
      const error = new Error('Unexpected error');
      mockDiscordClient.getUserData.mockRejectedValue(error);

      const response = await request(app)
        .get(`/api/users/${validUserId}/status`)
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred'
        }
      });
    });
  });

  describe('GET /api/users/:userId/activity', () => {
    const validUserId = '123456789012345678';
    const mockActivities = [
      {
        type: 'playing' as const,
        name: 'Test Game',
        details: 'Level 1'
      },
      {
        type: 'listening' as const,
        name: 'Spotify',
        details: 'Test Song',
        state: 'by Test Artist'
      }
    ];

    it('should return user activities successfully', async () => {
      mockDiscordClient.getUserActivities.mockResolvedValue(mockActivities);

      const response = await request(app)
        .get(`/api/users/${validUserId}/activity`)
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          userId: validUserId,
          activities: mockActivities,
          lastUpdated: expect.any(String)
        },
        success: true
      });

      expect(mockDiscordClient.getUserActivities).toHaveBeenCalledWith(validUserId, undefined);
    });

    it('should return empty activities array', async () => {
      mockDiscordClient.getUserActivities.mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/users/${validUserId}/activity`)
        .expect(200);

      expect(response.body.data.activities).toEqual([]);
    });

    it('should return 400 for invalid user ID format', async () => {
      const response = await request(app)
        .get('/api/users/123/activity')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_USER_ID');
    });
  });

  describe('GET /api/users/:userId/presence', () => {
    const validUserId = '123456789012345678';
    const mockUserData: UserData = {
      id: validUserId,
      username: 'testuser',
      discriminator: '1234',
      status: 'online',
      activities: [
        {
          type: 'playing',
          name: 'Test Game'
        },
        {
          type: 'custom',
          name: 'Custom Status'
        }
      ],
      lastSeen: new Date(),
      bot: false
    };

    const mockRichPresence = {
      applicationId: '123456789',
      details: 'Editing file.ts',
      state: 'Working on project',
      largeImageKey: 'vscode-logo'
    };

    it('should return user presence successfully', async () => {
      mockDiscordClient.getUserData.mockResolvedValue(mockUserData);
      mockDiscordClient.getUserRichPresence.mockResolvedValue(mockRichPresence);

      const response = await request(app)
        .get(`/api/users/${validUserId}/presence`)
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          userId: validUserId,
          currentActivity: {
            type: 'playing',
            name: 'Test Game'
          },
          richPresence: mockRichPresence,
          lastUpdated: expect.any(String)
        },
        success: true
      });
    });

    it('should return null rich presence when not available', async () => {
      mockDiscordClient.getUserData.mockResolvedValue(mockUserData);
      mockDiscordClient.getUserRichPresence.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/users/${validUserId}/presence`)
        .expect(200);

      expect(response.body.data.richPresence).toBeNull();
    });

    it('should return first activity as current when no non-custom activities', async () => {
      const userDataWithCustomOnly = {
        ...mockUserData,
        activities: [
          {
            type: 'custom' as const,
            name: 'Custom Status'
          }
        ]
      };

      mockDiscordClient.getUserData.mockResolvedValue(userDataWithCustomOnly);
      mockDiscordClient.getUserRichPresence.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/users/${validUserId}/presence`)
        .expect(200);

      expect(response.body.data.currentActivity).toMatchObject({
        type: 'custom',
        name: 'Custom Status'
      });
    });

    it('should return null current activity when no activities', async () => {
      const userDataWithNoActivities = {
        ...mockUserData,
        activities: []
      };

      mockDiscordClient.getUserData.mockResolvedValue(userDataWithNoActivities);
      mockDiscordClient.getUserRichPresence.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/users/${validUserId}/presence`)
        .expect(200);

      expect(response.body.data.currentActivity).toBeNull();
    });
  });

  describe('Request ID handling', () => {
    it('should use provided request ID in response', async () => {
      const customRequestId = 'custom-request-123';
      const validUserId = '123456789012345678';
      
      mockDiscordClient.getUserActivities.mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/users/${validUserId}/activity`)
        .set('x-request-id', customRequestId)
        .expect(200);

      expect(response.body.requestId).toBe(customRequestId);
    });

    it('should include request ID in error responses', async () => {
      const customRequestId = 'error-request-123';
      
      const response = await request(app)
        .get('/api/users/invalid/activity')
        .set('x-request-id', customRequestId)
        .expect(400);

      expect(response.body.error.requestId).toBe(customRequestId);
    });
  });
});