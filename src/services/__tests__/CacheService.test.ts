import type { UserStatusResponse } from '../../models/ApiResponses';
import type { CacheConfig } from '../../utils/config';
import { CacheKeys, CacheService, CacheTTL } from '../CacheService';

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn(),
  quit: jest.fn(),
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  info: jest.fn(),
  dbSize: jest.fn(),
  flushDb: jest.fn(),
  on: jest.fn(),
};

// Mock createClient
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockConfig: CacheConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      enabled: true,
      redisUrl: 'redis://localhost:6379',
      redisHost: 'localhost',
      redisPort: 6379,
      redisPassword: undefined,
      redisDb: 0,
      defaultTtl: 60,
    };

    cacheService = new CacheService(mockConfig);
  });

  describe('initialization', () => {
    it('should skip initialization when cache is disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledCache = new CacheService(disabledConfig);
      
      await disabledCache.initialize();
      
      expect(disabledCache.isAvailable()).toBe(false);
    });

    it('should initialize Redis client successfully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      
      await cacheService.initialize();
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('user status operations', () => {
    const userId = 'test-user-123';
    const mockUserStatus: UserStatusResponse = {
      userId,
      status: 'online',
      activities: [],
      lastUpdated: new Date().toISOString(),
      inVoiceChannel: false,
    };

    beforeEach(async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheService.initialize();
      // Simulate connected state
      (cacheService as any).isConnected = true;
    });

    it('should get user status from cache', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockUserStatus));
      
      const result = await cacheService.getUserStatus(userId);
      
      expect(mockRedisClient.get).toHaveBeenCalledWith(CacheKeys.USER_STATUS(userId));
      expect(result).toEqual(mockUserStatus);
    });

    it('should return null when user status not in cache', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await cacheService.getUserStatus(userId);
      
      expect(result).toBeNull();
    });

    it('should set user status in cache', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      
      await cacheService.setUserStatus(userId, mockUserStatus);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        CacheKeys.USER_STATUS(userId),
        CacheTTL.USER_STATUS,
        JSON.stringify(mockUserStatus)
      );
    });

    it('should use custom TTL when provided', async () => {
      const customTtl = 120;
      mockRedisClient.setEx.mockResolvedValue('OK');
      
      await cacheService.setUserStatus(userId, mockUserStatus, customTtl);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        CacheKeys.USER_STATUS(userId),
        customTtl,
        JSON.stringify(mockUserStatus)
      );
    });
  });

  describe('cache invalidation', () => {
    const userId = 'test-user-123';

    beforeEach(async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheService.initialize();
      (cacheService as any).isConnected = true;
    });

    it('should invalidate all user cache keys', async () => {
      mockRedisClient.del.mockResolvedValue(3);
      
      await cacheService.invalidateUser(userId);
      
      expect(mockRedisClient.del).toHaveBeenCalledWith([
        CacheKeys.USER_STATUS(userId),
        CacheKeys.USER_ACTIVITY(userId),
        CacheKeys.USER_PRESENCE(userId),
        CacheKeys.USER_PRESENCE_DATA(userId),
      ]);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheService.initialize();
      (cacheService as any).isConnected = true;
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));
      
      const result = await cacheService.getUserStatus('test-user');
      
      expect(result).toBeNull();
    });

    it('should handle set errors gracefully', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis connection failed'));
      
      const mockUserStatus: UserStatusResponse = {
        userId: 'test-user',
        status: 'online',
        activities: [],
        lastUpdated: new Date().toISOString(),
        inVoiceChannel: false,
      };

      // Should not throw
      await expect(cacheService.setUserStatus('test-user', mockUserStatus)).resolves.toBeUndefined();
    });
  });

  describe('availability checks', () => {
    it('should return false when cache is disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledCache = new CacheService(disabledConfig);
      
      expect(disabledCache.isAvailable()).toBe(false);
    });

    it('should return false when not connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheService.initialize();
      
      // isConnected is false by default
      expect(cacheService.isAvailable()).toBe(false);
    });
  });
});