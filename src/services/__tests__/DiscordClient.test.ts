import { env } from 'process';
import { DiscordClient } from '../DiscordClient';

// Mock fetch globally
global.fetch = jest.fn();

describe('DiscordClient', () => {
  let client: DiscordClient;
  const mockBotToken = env.DISCORD_BOT_TOKEN || '';

  beforeEach(() => {
    client = new DiscordClient(mockBotToken);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid bot token', () => {
      expect(() => new DiscordClient(mockBotToken)).not.toThrow();
    });

    it('should throw error with empty bot token', () => {
      expect(() => new DiscordClient('')).toThrow('Bot token is required');
    });
  });

  describe('getUserData', () => {
    it('should fetch user data successfully', async () => {
      const mockUserResponse = {
        id: '123456789',
        username: 'testuser',
        discriminator: '1234',
        avatar: 'avatar_hash',
        global_name: 'Test User',
        bot: false
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUserResponse),
        headers: new Map()
      });

      const userData = await client.getUserData('123456789');

      expect(userData).toEqual({
        id: '123456789',
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
        'https://discord.com/api/v10/users/123456789',
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
      await expect(client.getUserData('')).rejects.toThrow('User ID is required');
    });

    it('should handle 404 user not found', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Unknown User' })
      });

      await expect(client.getUserData('999999999')).rejects.toThrow('User with ID 999999999 not found');
    });

    it('should handle rate limiting', async () => {
      // First call returns rate limit
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
            id: '123456789',
            username: 'testuser',
            discriminator: '1234',
            bot: false
          }),
          headers: new Map()
        });

      // Mock setTimeout to resolve immediately for testing
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      const userData = await client.getUserData('123456789');

      expect(userData.id).toBe('123456789');
      expect(fetch).toHaveBeenCalledTimes(2);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('getUserActivities', () => {
    it('should return user activities', async () => {
      const mockUserResponse = {
        id: '123456789',
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

      const activities = await client.getUserActivities('123456789');

      expect(Array.isArray(activities)).toBe(true);
      expect(activities).toEqual([]);
    });
  });

  describe('getUserStatus', () => {
    it('should return user status', async () => {
      const mockUserResponse = {
        id: '123456789',
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

      const status = await client.getUserStatus('123456789');

      expect(status).toBe('offline');
    });
  });

  describe('getUserRichPresence', () => {
    it('should return null when no rich presence', async () => {
      const mockUserResponse = {
        id: '123456789',
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

      const richPresence = await client.getUserRichPresence('123456789');

      expect(richPresence).toBeNull();
    });
  });
});