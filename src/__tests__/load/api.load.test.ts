import express from 'express';
import request from 'supertest';
import { UserRoutes } from '../../api/routes/userRoutes';
import { DiscordClient } from '../../services/DiscordClient';

// Mock DiscordClient for load testing
jest.mock('../../services/DiscordClient');
jest.mock('../../utils/config', () => ({
  loadConfig: () => ({
    discord: {
      botToken: 'test-bot-token'
    }
  })
}));

const MockedDiscordClient = DiscordClient as jest.MockedClass<typeof DiscordClient>;

describe('API Load Tests', () => {
  let app: express.Application;
  let mockDiscordClient: jest.Mocked<DiscordClient>;

  beforeAll(() => {
    // Setup mock Discord client with realistic response times
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
      req.headers['x-request-id'] = req.headers['x-request-id'] || `load-test-${Date.now()}-${Math.random()}`;
      next();
    });

    const userRoutes = new UserRoutes();
    app.use('/api/users', userRoutes.getRouter());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup realistic mock responses
    mockDiscordClient.getUserData.mockImplementation(async (userId) => {
      // Simulate realistic API response time (50-200ms)
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
      
      return {
        id: userId,
        username: `user${userId.slice(-4)}`,
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
    });

    mockDiscordClient.getUserActivities.mockImplementation(async (userId) => {
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 100));
      
      return [
        {
          type: 'playing' as const,
          name: 'Test Game',
          details: 'Level 1'
        }
      ];
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 50 concurrent user status requests within 2 seconds', async () => {
      const startTime = Date.now();
      const userIds = Array.from({ length: 50 }, (_, i) => `12345678901234567${i.toString().padStart(2, '0')}`);
      
      const promises = userIds.map(userId => 
        request(app)
          .get(`/api/users/${userId}/status`)
          .expect(200)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete within 2 seconds (requirement from spec)
      expect(totalTime).toBeLessThan(2000);
      
      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.userId).toBe(userIds[index]);
      });

      // Verify all Discord API calls were made
      expect(mockDiscordClient.getUserData).toHaveBeenCalledTimes(50);
    });

    it('should handle 100 concurrent activity requests efficiently', async () => {
      const startTime = Date.now();
      const userIds = Array.from({ length: 100 }, (_, i) => `12345678901234567${i.toString().padStart(2, '0')}`);
      
      const promises = userIds.map(userId => 
        request(app)
          .get(`/api/users/${userId}/activity`)
          .expect(200)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time (allowing for 100 requests)
      expect(totalTime).toBeLessThan(3000);
      
      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.userId).toBe(userIds[index]);
        expect(Array.isArray(response.body.data.activities)).toBe(true);
      });

      expect(mockDiscordClient.getUserActivities).toHaveBeenCalledTimes(100);
    });

    it('should maintain response quality under load', async () => {
      const userIds = Array.from({ length: 30 }, (_, i) => `12345678901234567${i.toString().padStart(2, '0')}`);
      
      // Mix different endpoint types
      const promises = userIds.flatMap(userId => [
        request(app).get(`/api/users/${userId}/status`).expect(200),
        request(app).get(`/api/users/${userId}/activity`).expect(200),
        request(app).get(`/api/users/${userId}/presence`).expect(200)
      ]);

      const responses = await Promise.all(promises);

      // All responses should have proper structure
      responses.forEach(response => {
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('requestId');
      });
    });
  });

  describe('Error Handling Under Load', () => {
    it('should handle mixed success and error responses efficiently', async () => {
      const validUserIds = Array.from({ length: 25 }, (_, i) => `12345678901234567${i.toString().padStart(2, '0')}`);
      const invalidUserIds = Array.from({ length: 25 }, (_, i) => `invalid-${i}`);
      
      const promises = [
        ...validUserIds.map(userId => 
          request(app).get(`/api/users/${userId}/status`).expect(200)
        ),
        ...invalidUserIds.map(userId => 
          request(app).get(`/api/users/${userId}/status`).expect(400)
        )
      ];

      const responses = await Promise.all(promises);

      // Check success responses
      const successResponses = responses.slice(0, 25);
      successResponses.forEach(response => {
        expect(response.body.success).toBe(true);
      });

      // Check error responses
      const errorResponses = responses.slice(25);
      errorResponses.forEach(response => {
        expect(response.body.error.code).toBe('INVALID_USER_ID');
      });
    });

    it('should handle Discord API errors gracefully under load', async () => {
      // Setup some requests to fail
      mockDiscordClient.getUserData.mockImplementation(async (userId) => {
        if (userId.endsWith('99')) {
          const error = new Error('User not found');
          (error as any).code = 'USER_NOT_FOUND';
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          id: userId,
          username: `user${userId.slice(-4)}`,
          discriminator: '1234',
          status: 'online',
          activities: [],
          lastSeen: new Date(),
          bot: false
        };
      });

      const userIds = Array.from({ length: 20 }, (_, i) => `12345678901234567${i.toString().padStart(2, '0')}`);
      
      const promises = userIds.map(userId => 
        request(app).get(`/api/users/${userId}/status`)
      );

      const responses = await Promise.all(promises);

      // Check that error responses are properly formatted
      responses.forEach((response, index) => {
        if (userIds[index].endsWith('99')) {
          expect(response.status).toBe(404);
          expect(response.body.error.code).toBe('USER_NOT_FOUND');
        } else {
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
        }
      });
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not leak memory during sustained load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Run multiple batches of requests
      for (let batch = 0; batch < 5; batch++) {
        const userIds = Array.from({ length: 20 }, (_, i) => `batch${batch}user${i.toString().padStart(3, '0')}`);
        
        const promises = userIds.map(userId => 
          request(app).get(`/api/users/${userId}/status`).expect(200)
        );

        await Promise.all(promises);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      
      // Memory usage should not increase dramatically (allow for some variance)
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
      
      // Should not increase by more than 50% (generous threshold for test environment)
      expect(memoryIncreasePercent).toBeLessThan(50);
    });

    it('should handle request ID generation efficiently', async () => {
      const startTime = Date.now();
      const userIds = Array.from({ length: 100 }, (_, i) => `12345678901234567${i.toString().padStart(2, '0')}`);
      
      const promises = userIds.map(userId => 
        request(app)
          .get(`/api/users/${userId}/status`)
          .expect(200)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All responses should have unique request IDs
      const requestIds = responses.map(r => r.body.requestId);
      const uniqueRequestIds = new Set(requestIds);
      
      expect(uniqueRequestIds.size).toBe(requestIds.length);
      
      // Should complete efficiently
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Rate Limiting Simulation', () => {
    it('should handle simulated rate limiting gracefully', async () => {
      let requestCount = 0;
      
      mockDiscordClient.getUserData.mockImplementation(async (userId) => {
        requestCount++;
        
        // Simulate rate limiting after 30 requests
        if (requestCount > 30) {
          const error = new Error('Rate limited');
          (error as any).code = 'DISCORD_API_ERROR';
          (error as any).details = {
            isRateLimit: true,
            retryAfter: 1
          };
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          id: userId,
          username: `user${userId.slice(-4)}`,
          discriminator: '1234',
          status: 'online',
          activities: [],
          lastSeen: new Date(),
          bot: false
        };
      });

      const userIds = Array.from({ length: 50 }, (_, i) => `12345678901234567${i.toString().padStart(2, '0')}`);
      
      const promises = userIds.map(userId => 
        request(app).get(`/api/users/${userId}/status`)
      );

      const responses = await Promise.all(promises);

      // First 30 should succeed
      responses.slice(0, 30).forEach(response => {
        expect(response.status).toBe(200);
      });

      // Remaining should be rate limited
      responses.slice(30).forEach(response => {
        expect(response.status).toBe(429);
        expect(response.body.error.code).toBe('RATE_LIMITED');
      });
    });
  });
});