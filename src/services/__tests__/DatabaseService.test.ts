import { ChannelConfig } from '../../models/ChannelConfig';
import { ServerConfig } from '../../models/ServerConfig';
import { DatabaseService } from '../DatabaseService';

describe('DatabaseService', () => {
  let databaseService: DatabaseService;
  
  // Use a test database URL - you might want to set this in your test environment
  const testConnectionString = process.env['TEST_DATABASE_URL'] || 
    'postgresql://test:test@localhost:5432/discord_bot_test';

  beforeEach(async () => {
    try {
      databaseService = new DatabaseService(testConnectionString);
      await databaseService.initialize();
      
      // Clean up any existing test data
      await cleanupTestData();
    } catch (error) {
      console.warn('Test database not available, skipping database tests');
      return;
    }
  });

  afterEach(async () => {
    if (databaseService) {
      await cleanupTestData();
      await databaseService.close();
    }
  });

  async function cleanupTestData() {
    try {
      // Clean up test data - remove any test server configs
      const testServerIds = ['123456789012345678', '111111111111111111', '222222222222222222'];
      for (const serverId of testServerIds) {
        try {
          await databaseService.deleteChannelConfig(serverId, '987654321098765432');
        } catch (e) {
          // Ignore if doesn't exist
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  describe('Server Configuration', () => {
    it('should create and retrieve default server configuration', async () => {
      if (!databaseService) {
        console.warn('Skipping test - database not available');
        return;
      }

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
      if (!databaseService) {
        console.warn('Skipping test - database not available');
        return;
      }

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
      if (!databaseService) {
        console.warn('Skipping test - database not available');
        return;
      }

      const config = await databaseService.getServerConfig('nonexistent');
      expect(config).toBeNull();
    });
  });

  describe('Channel Configuration', () => {
    it('should save and retrieve channel configurations', async () => {
      if (!databaseService) {
        console.warn('Skipping test - database not available');
        return;
      }

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
      if (!databaseService) {
        console.warn('Skipping test - database not available');
        return;
      }

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
      if (!databaseService) {
        console.warn('Skipping test - database not available');
        return;
      }

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
      if (!databaseService) {
        console.warn('Skipping test - database not available');
        return;
      }

      const serverIds = ['111111111111111111', '222222222222222222'];

      for (const serverId of serverIds) {
        await databaseService.createDefaultServerConfig(serverId);
      }

      const retrieved = await databaseService.getAllServerIds();
      expect(retrieved).toEqual(expect.arrayContaining(serverIds));
    });
  });
});