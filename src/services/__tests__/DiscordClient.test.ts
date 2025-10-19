import { env } from 'process';
import { CacheService } from '../CacheService';
import { DiscordClient } from '../DiscordClient';

global.fetch = jest.fn();

describe('DiscordClient', () => {
  let client: DiscordClient;
  let mockCacheService: jest.Mocked<CacheService>;
  const mockBotToken = env['DISCORD_BOT_TOKEN'] || 'Bot.test.token';
  const validUserId = '123456789012345678'; // Valid Discord snowflake format
  const invalidUserId = '999999999012345678'; // Valid format but non-existent user

  beforeEach(() => {
    mockCacheService = {
      getUserPresenceDataWithFallback: jest.fn().mockResolvedValue(null),
      setUserPresenceDataWithFallback: jest.fn().mockResolvedValue(undefined),
      getUserPresencesBatchWithFallback: jest.fn().mockResolvedValue(new Map()),
      setMultipleUserPresencesWithFallback: jest.fn().mockResolvedValue({ success: [], failed: [] }),
      isAvailable: jest.fn().mockReturnValue(true)
    } as any;
    
    client = new DiscordClient(mockBotToken, mockCacheService);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid bot token', () => {
      expect(() => new DiscordClient(mockBotToken, mockCacheService)).not.toThrow();
    });

    it('should throw error with empty bot token', () => {
      expect(() => new DiscordClient('', mockCacheService)).toThrow('Bot token is required');
    });
  });

  describe('getUserData', () => {
    it('should fetch user data successfully', async () => {
      const mockUserResponse = {
        id: validUserId,
        username: 'testuser',
        discriminator: '1234',
        avatar: 'avatar_hash',
        global_name: 'Test User',
        bot: false
      };

      const mockHeaders = new Map();
      mockHeaders.get = jest.fn().mockReturnValue(null);

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserResponse),
        headers: mockHeaders
      });

      const userData = await client.getUserData(validUserId);

      expect(userData).toEqual({
        id: validUserId,
        username: 'testuser',
        discriminator: '1234',
        avatar: 'avatar_hash',
        globalName: 'Test User',
        bot: false,
        status: 'offline',
        activities: [],
        lastSeen: expect.any(Date)
      });

      expect(fetch).toHaveBeenCalledWith(
        `https://discord.com/api/v10/users/${validUserId}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bot ${mockBotToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'DiscordBot (discord-bot-api, 1.0.0)'
          })
        })
      );
    });

    it('should throw error for invalid user ID', async () => {
      await expect(client.getUserData('')).rejects.toThrow('Invalid user ID format');
    });

    it('should handle 404 user not found', async () => {
      const mockHeaders = new Map();
      mockHeaders.set = jest.fn();
      mockHeaders.get = jest.fn().mockReturnValue(null);

      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Unknown User' }),
        headers: mockHeaders
      });

      await expect(client.getUserData(invalidUserId)).rejects.toThrow(`User with ID ${invalidUserId} not found`);
    }, 10000);

    it('should handle rate limiting', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['retry-after', '1']])
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            id: validUserId,
            username: 'testuser',
            discriminator: '1234',
            bot: false
          }),
          headers: new Map()
        });

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      const userData = await client.getUserData(validUserId);

      expect(userData.id).toBe(validUserId);
      expect(fetch).toHaveBeenCalledTimes(2);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('getUserActivities', () => {
    it('should return user activities', async () => {
      const mockUserResponse = {
        id: validUserId,
        username: 'testuser',
        discriminator: '1234',
        bot: false
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserResponse),
        headers: new Map()
      });

      const activities = await client.getUserActivities(validUserId);

      expect(Array.isArray(activities)).toBe(true);
      expect(activities).toEqual([]);
    });
  });

  describe('getUserStatus', () => {
    it('should return user status', async () => {
      const mockUserResponse = {
        id: validUserId,
        username: 'testuser',
        discriminator: '1234',
        bot: false
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserResponse),
        headers: new Map()
      });

      const status = await client.getUserStatus(validUserId);

      expect(status).toBe('offline');
    });
  });

  describe('getUserRichPresence', () => {
    it('should return null when no rich presence', async () => {
      const mockUserResponse = {
        id: validUserId,
        username: 'testuser',
        discriminator: '1234',
        bot: false
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserResponse),
        headers: new Map()
      });

      const richPresence = await client.getUserRichPresence(validUserId);

      expect(richPresence).toBeNull();
    });
  });
});