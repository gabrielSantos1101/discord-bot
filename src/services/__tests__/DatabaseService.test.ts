import fs from 'fs';
import { ChannelConfig } from '../../models/ChannelConfig';
import { ServerConfig } from '../../models/ServerConfig';
import { DatabaseService } from '../DatabaseService';

describe('DatabaseService', () => {
  let databaseService: DatabaseService;
  const testDbPath = './data/test-bot-config.db';

  beforeEach(async () => {
    // Clean up test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    databaseService = new DatabaseService(testDbPath);
    await databaseService.initialize();
  });

  afterEach(async () => {
    await databaseService.close();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Server Configuration', () => {
    it('should create and retrieve default server configuration', async () => {
      const serverId = '123456789012345678';

      const config = await databaseService.createDefaultServerConfig(serverId);
      expect(config.serverId).toBe(serverId);
      expect(config.commandPrefix).toBe('!');
      expect(config.enabled).toBe(true);

      const retrieved = await databaseService.getServerConfig(serverId);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.serverId).toBe(serverId);
    });

    it('should save and update server configuration', async () => {
      const serverId = '123456789012345678';

      const config: ServerConfig = {
        serverId,
        commandPrefix: '?',
        enabled: true,
        timezone: 'America/New_York',
        adminRoles: ['role1', 'role2'],
        apiAccess: {
          enabled: true,
          allowedEndpoints: ['/api/users/*'],
          rateLimit: 50,
          allowedIPs: []
        },
        logging: {
          level: 'debug',
          channels: ['log-channel'],
          logUserActivities: true,
          logChannelOperations: false
        },
        autoChannels: [],
        lastUpdated: new Date()
      };

      await databaseService.saveServerConfig(config);

      const retrieved = await databaseService.getServerConfig(serverId);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.commandPrefix).toBe('?');
      expect(retrieved!.adminRoles).toEqual(['role1', 'role2']);
    });

    it('should return null for non-existent server', async () => {
      const config = await databaseService.getServerConfig('nonexistent');
      expect(config).toBeNull();
    });
  });

  describe('Channel Configuration', () => {
    it('should save and retrieve channel configurations', async () => {
      const serverId = '123456789012345678';

      // Create server config first
      await databaseService.createDefaultServerConfig(serverId);

      const channelConfig: ChannelConfig = {
        templateChannelId: '987654321098765432',
        serverId,
        namePattern: 'Auto-{number}',
        maxChannels: 5,
        emptyTimeout: 10,
        permissions: [],
        enabled: true,
        userLimit: 0
      };

      await databaseService.saveChannelConfigs(serverId, [channelConfig]);

      const retrieved = await databaseService.getChannelConfigs(serverId);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]!.templateChannelId).toBe('987654321098765432');
      expect(retrieved[0]!.namePattern).toBe('Auto-{number}');
    });

    it('should get specific channel configuration', async () => {
      const serverId = '123456789012345678';
      const templateChannelId = '987654321098765432';

      // Create server config first
      await databaseService.createDefaultServerConfig(serverId);

      const channelConfig: ChannelConfig = {
        templateChannelId,
        serverId,
        namePattern: 'Gaming-{number}',
        maxChannels: 3,
        emptyTimeout: 5,
        permissions: [],
        enabled: true,
        userLimit: 10
      };

      await databaseService.saveChannelConfigs(serverId, [channelConfig]);

      const retrieved = await databaseService.getChannelConfig(serverId, templateChannelId);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.namePattern).toBe('Gaming-{number}');
      expect(retrieved!.userLimit).toBe(10);
    });

    it('should delete channel configuration', async () => {
      const serverId = '123456789012345678';
      const templateChannelId = '987654321098765432';

      // Create server config first
      await databaseService.createDefaultServerConfig(serverId);

      const channelConfig: ChannelConfig = {
        templateChannelId,
        serverId,
        namePattern: 'Test-{number}',
        maxChannels: 1,
        emptyTimeout: 1,
        permissions: [],
        enabled: true,
        userLimit: 0
      };

      await databaseService.saveChannelConfigs(serverId, [channelConfig]);

      // Verify it exists
      let retrieved = await databaseService.getChannelConfig(serverId, templateChannelId);
      expect(retrieved).toBeTruthy();

      // Delete it
      await databaseService.deleteChannelConfig(serverId, templateChannelId);

      // Verify it's gone
      retrieved = await databaseService.getChannelConfig(serverId, templateChannelId);
      expect(retrieved).toBeNull();
    });
  });

  describe('Server Management', () => {
    it('should get all server IDs', async () => {
      const serverIds = ['111111111111111111', '222222222222222222'];

      for (const serverId of serverIds) {
        await databaseService.createDefaultServerConfig(serverId);
      }

      const retrieved = await databaseService.getAllServerIds();
      expect(retrieved).toEqual(expect.arrayContaining(serverIds));
    });
  });
});