import { ChannelType, Collection } from 'discord.js';
import { ChannelConfig } from '../../models/ChannelConfig';
import { AutoChannelManager } from '../managers/AutoChannelManager';

// Mock global timer functions
const mockSetInterval = jest.fn().mockReturnValue(123);
const mockClearInterval = jest.fn();

Object.defineProperty(global, 'setInterval', {
  value: mockSetInterval,
  writable: true
});

Object.defineProperty(global, 'clearInterval', {
  value: mockClearInterval,
  writable: true
});

// Mock Discord.js
jest.mock('discord.js', () => ({
  ...jest.requireActual('discord.js'),
  Client: jest.fn(),
  Collection: jest.requireActual('discord.js').Collection,
  ChannelType: jest.requireActual('discord.js').ChannelType
}));

describe('AutoChannelManager', () => {
  let autoChannelManager: AutoChannelManager;
  let mockClient: any;
  let mockCacheService: any;
  let mockGuild: any;
  let mockTemplateChannel: any;
  let mockCreatedChannel: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset mocks
    mockSetInterval.mockClear();
    mockClearInterval.mockClear();

    // Setup mock cache service
    mockCacheService = {
      setAutoChannels: jest.fn().mockResolvedValue(undefined),
      getAutoChannels: jest.fn().mockResolvedValue([]),
      invalidateAutoChannels: jest.fn().mockResolvedValue(undefined)
    };

    // Setup mock guild
    mockGuild = {
      id: '987654321098765432',
      channels: {
        create: jest.fn(),
        cache: new Collection()
      },
      members: {
        fetch: jest.fn()
      }
    };

    // Setup mock template channel
    mockTemplateChannel = {
      id: '123456789012345678',
      name: 'Template Channel',
      type: ChannelType.GuildVoice,
      guild: mockGuild,
      parentId: '111111111111111111',
      userLimit: 0,
      isVoiceBased: jest.fn().mockReturnValue(true),
      permissionOverwrites: {
        cache: new Collection()
      }
    };

    // Setup mock created channel
    mockCreatedChannel = {
      id: '555555555555555555',
      name: 'Auto-1',
      type: ChannelType.GuildVoice,
      guild: mockGuild,
      delete: jest.fn().mockResolvedValue(undefined)
    };

    // Setup mock client
    mockClient = {
      on: jest.fn(),
      channels: {
        fetch: jest.fn()
      },
      guilds: {
        cache: new Collection()
      }
    };

    mockClient.guilds.cache.set(mockGuild.id, mockGuild);
    mockGuild.channels.cache.set(mockTemplateChannel.id, mockTemplateChannel);

    // Create AutoChannelManager after mocks are set up
    autoChannelManager = new AutoChannelManager(mockClient, mockCacheService);
  });

  afterEach(() => {
    jest.useRealTimers();
    autoChannelManager.stop();
  });

  describe('initialization', () => {
    it('should setup event listeners on client', () => {
      expect(mockClient.on).toHaveBeenCalledWith('voiceStateUpdate', expect.any(Function));
    });

    it('should start cleanup timer', () => {
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });
  });

  describe('loadChannelConfigs', () => {
    it('should load channel configurations', () => {
      const configs: ChannelConfig[] = [
        {
          templateChannelId: '123456789012345678',
          serverId: '987654321098765432',
          namePattern: 'Auto-{number}',
          maxChannels: 5,
          emptyTimeout: 10,
          permissions: [],
          enabled: true,
          userLimit: 0
        }
      ];

      autoChannelManager.loadChannelConfigs(configs);

      // Test that config is loaded by checking if it affects behavior
      const stats = autoChannelManager.getStats();
      expect(stats.totalChannels).toBe(0);
    });
  });

  describe('voice state update handling', () => {
    let mockMember: any;
    let mockOldState: any;
    let mockNewState: any;

    beforeEach(() => {
      mockMember = {
        id: '444444444444444444',
        voice: {
          channelId: null,
          setChannel: jest.fn().mockResolvedValue(undefined)
        }
      };

      mockOldState = {
        channelId: null,
        member: mockMember
      };

      mockNewState = {
        channelId: null,
        member: mockMember
      };

      mockGuild.members.fetch = jest.fn().mockResolvedValue(mockMember);
    });

    it('should handle user joining a template channel', async () => {
      // Load config first
      const config: ChannelConfig = {
        templateChannelId: '123456789012345678',
        serverId: '987654321098765432',
        namePattern: 'Auto-{number}',
        maxChannels: 5,
        emptyTimeout: 10,
        permissions: [],
        enabled: true,
        userLimit: 0
      };
      autoChannelManager.loadChannelConfigs([config]);

      // Setup mocks for channel creation
      mockClient.channels.fetch = jest.fn().mockResolvedValue(mockTemplateChannel);
      mockGuild.channels.create = jest.fn().mockResolvedValue(mockCreatedChannel);
      mockMember.voice.channelId = '123456789012345678';

      // Simulate user joining template channel
      mockNewState.channelId = '123456789012345678';

      // Get the voice state handler
      const voiceStateHandler = mockClient.on.mock.calls.find((call: any) => call[0] === 'voiceStateUpdate')?.[1];
      expect(voiceStateHandler).toBeDefined();

      if (voiceStateHandler) {
        await voiceStateHandler(mockOldState, mockNewState);

        expect(mockGuild.channels.create).toHaveBeenCalledWith({
          name: 'Auto-1',
          type: ChannelType.GuildVoice,
          parent: '111111111111111111',
          userLimit: 0,
          permissionOverwrites: []
        });

        expect(mockMember.voice.setChannel).toHaveBeenCalledWith('555555555555555555');
        expect(mockCacheService.setAutoChannels).toHaveBeenCalled();
      }
    });

    it('should handle user joining an active auto channel', async () => {
      const config: ChannelConfig = {
        templateChannelId: '123456789012345678',
        serverId: '987654321098765432',
        namePattern: 'Auto-{number}',
        maxChannels: 5,
        emptyTimeout: 10,
        permissions: [],
        enabled: true,
        userLimit: 0
      };
      autoChannelManager.loadChannelConfigs([config]);

      mockClient.channels.fetch = jest.fn().mockResolvedValue(mockTemplateChannel);
      mockGuild.channels.create = jest.fn().mockResolvedValue(mockCreatedChannel);

      const voiceStateHandler = mockClient.on.mock.calls.find((call: any) => call[0] === 'voiceStateUpdate')?.[1];

      if (voiceStateHandler) {
        // First create an auto channel
        mockNewState.channelId = '123456789012345678';
        await voiceStateHandler(mockOldState, mockNewState);

        // Reset cache mock
        mockCacheService.setAutoChannels = jest.fn().mockResolvedValue(undefined);

        // Simulate another user joining the created auto channel
        const secondUser = {
          id: '666666666666666666',
          voice: { channelId: '555555555555555555' }
        };
        const secondNewState = { channelId: '555555555555555555', member: secondUser };
        const secondOldState = { channelId: null, member: secondUser };

        await voiceStateHandler(secondOldState, secondNewState);

        // Should update user count and cache
        expect(mockCacheService.setAutoChannels).toHaveBeenCalled();
      }
    });

    it('should add user to queue when max channels reached', async () => {
      const config: ChannelConfig = {
        templateChannelId: '123456789012345678',
        serverId: '987654321098765432',
        namePattern: 'Auto-{number}',
        maxChannels: 1, // Set max to 1
        emptyTimeout: 10,
        permissions: [],
        enabled: true,
        userLimit: 0
      };
      autoChannelManager.loadChannelConfigs([config]);

      mockClient.channels.fetch = jest.fn().mockResolvedValue(mockTemplateChannel);
      mockGuild.channels.create = jest.fn().mockResolvedValue(mockCreatedChannel);

      const voiceStateHandler = mockClient.on.mock.calls.find((call: any) => call[0] === 'voiceStateUpdate')?.[1];

      if (voiceStateHandler) {
        // First user creates a channel
        mockMember.voice.channelId = '123456789012345678';
        mockNewState.channelId = '123456789012345678';
        await voiceStateHandler(mockOldState, mockNewState);

        // Reset mocks for second user
        mockGuild.channels.create = jest.fn();
        const secondMember = {
          id: '777777777777777777',
          voice: { channelId: '123456789012345678' }
        };
        const secondNewState = { channelId: '123456789012345678', member: secondMember };
        const secondOldState = { channelId: null, member: secondMember };

        // Second user should be added to queue (no new channel created)
        await voiceStateHandler(secondOldState, secondNewState);

        expect(mockGuild.channels.create).not.toHaveBeenCalled();

        // Check queue size
        const stats = autoChannelManager.getStats();
        expect(stats.queueSize).toBe(1);
      }
    });
  });

  describe('channel name generation', () => {
    it('should generate sequential channel names', async () => {
      const config: ChannelConfig = {
        templateChannelId: '123456789012345678',
        serverId: '987654321098765432',
        namePattern: 'Gaming-{number}',
        maxChannels: 5,
        emptyTimeout: 10,
        permissions: [],
        enabled: true,
        userLimit: 0
      };
      autoChannelManager.loadChannelConfigs([config]);

      mockClient.channels.fetch = jest.fn().mockResolvedValue(mockTemplateChannel);

      // Mock multiple channel creations
      const mockChannels = [
        { ...mockCreatedChannel, id: '555555555555555555', name: 'Gaming-1' },
        { ...mockCreatedChannel, id: '666666666666666666', name: 'Gaming-2' },
        { ...mockCreatedChannel, id: '777777777777777777', name: 'Gaming-3' }
      ];

      mockGuild.channels.create = jest.fn()
        .mockResolvedValueOnce(mockChannels[0])
        .mockResolvedValueOnce(mockChannels[1])
        .mockResolvedValueOnce(mockChannels[2]);

      const voiceStateHandler = mockClient.on.mock.calls.find((call: any) => call[0] === 'voiceStateUpdate')?.[1];

      if (voiceStateHandler) {
        // Create first channel
        const mockMember1 = { id: '111', voice: { channelId: '123456789012345678', setChannel: jest.fn() } };
        await voiceStateHandler(
          { channelId: null, member: mockMember1 },
          { channelId: '123456789012345678', member: mockMember1 }
        );

        // Create second channel
        const mockMember2 = { id: '222', voice: { channelId: '123456789012345678', setChannel: jest.fn() } };
        await voiceStateHandler(
          { channelId: null, member: mockMember2 },
          { channelId: '123456789012345678', member: mockMember2 }
        );

        // Create third channel
        const mockMember3 = { id: '333', voice: { channelId: '123456789012345678', setChannel: jest.fn() } };
        await voiceStateHandler(
          { channelId: null, member: mockMember3 },
          { channelId: '123456789012345678', member: mockMember3 }
        );

        expect(mockGuild.channels.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
          name: 'Gaming-1'
        }));
        expect(mockGuild.channels.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
          name: 'Gaming-2'
        }));
        expect(mockGuild.channels.create).toHaveBeenNthCalledWith(3, expect.objectContaining({
          name: 'Gaming-3'
        }));
      }
    });
  });

  describe('cleanup functionality', () => {
    it('should cleanup empty channels after timeout', async () => {
      const config: ChannelConfig = {
        templateChannelId: '123456789012345678',
        serverId: '987654321098765432',
        namePattern: 'Auto-{number}',
        maxChannels: 5,
        emptyTimeout: 5, // 5 minutes
        permissions: [],
        enabled: true,
        userLimit: 0
      };
      autoChannelManager.loadChannelConfigs([config]);

      mockClient.channels.fetch = jest.fn()
        .mockResolvedValueOnce(mockTemplateChannel)
        .mockResolvedValueOnce(mockCreatedChannel);
      mockGuild.channels.create = jest.fn().mockResolvedValue(mockCreatedChannel);

      const voiceStateHandler = mockClient.on.mock.calls.find((call: any) => call[0] === 'voiceStateUpdate')?.[1];

      if (voiceStateHandler) {
        const mockMember = {
          id: '444444444444444444',
          voice: { channelId: '123456789012345678', setChannel: jest.fn() }
        };

        // Create auto channel
        await voiceStateHandler(
          { channelId: null, member: mockMember },
          { channelId: '123456789012345678', member: mockMember }
        );

        // Simulate user leaving (making channel empty)
        await voiceStateHandler(
          { channelId: '555555555555555555', member: mockMember },
          { channelId: null, member: mockMember }
        );

        // Fast-forward time to trigger the cleanup timer (runs every minute)
        jest.advanceTimersByTime(60 * 1000); // 1 minute to trigger first cleanup check

        // Run pending timers to execute the cleanup
        jest.runOnlyPendingTimers();

        // The cleanup should have been triggered by the timer
        expect(mockCreatedChannel.delete).toHaveBeenCalledWith('Auto channel cleanup - empty timeout');
      }
    });

    it('should force cleanup when requested', async () => {
      const config: ChannelConfig = {
        templateChannelId: '123456789012345678',
        serverId: '987654321098765432',
        namePattern: 'Auto-{number}',
        maxChannels: 5,
        emptyTimeout: 5,
        permissions: [],
        enabled: true,
        userLimit: 0
      };
      autoChannelManager.loadChannelConfigs([config]);

      mockClient.channels.fetch = jest.fn()
        .mockResolvedValueOnce(mockTemplateChannel)
        .mockResolvedValueOnce(mockCreatedChannel);
      mockGuild.channels.create = jest.fn().mockResolvedValue(mockCreatedChannel);

      const voiceStateHandler = mockClient.on.mock.calls.find((call: any) => call[0] === 'voiceStateUpdate')?.[1];

      if (voiceStateHandler) {
        const mockMember = {
          id: '444444444444444444',
          voice: { channelId: '123456789012345678', setChannel: jest.fn() }
        };

        // Create and empty a channel
        await voiceStateHandler(
          { channelId: null, member: mockMember },
          { channelId: '123456789012345678', member: mockMember }
        );

        await voiceStateHandler(
          { channelId: '555555555555555555', member: mockMember },
          { channelId: null, member: mockMember }
        );

        // Fast-forward past timeout
        jest.advanceTimersByTime(6 * 60 * 1000);

        // Force cleanup
        await autoChannelManager.forceCleanup();

        expect(mockCreatedChannel.delete).toHaveBeenCalled();
      }
    });
  });

  describe('statistics', () => {
    it('should return correct statistics', () => {
      const stats = autoChannelManager.getStats();

      expect(stats).toEqual({
        totalChannels: 0,
        channelsByTemplate: {},
        queueSize: 0
      });
    });

    it('should track channels by template', async () => {
      const config: ChannelConfig = {
        templateChannelId: '123456789012345678',
        serverId: '987654321098765432',
        namePattern: 'Auto-{number}',
        maxChannels: 5,
        emptyTimeout: 10,
        permissions: [],
        enabled: true,
        userLimit: 0
      };
      autoChannelManager.loadChannelConfigs([config]);

      mockClient.channels.fetch = jest.fn().mockResolvedValue(mockTemplateChannel);
      mockGuild.channels.create = jest.fn().mockResolvedValue(mockCreatedChannel);

      const voiceStateHandler = mockClient.on.mock.calls.find((call: any) => call[0] === 'voiceStateUpdate')?.[1];

      if (voiceStateHandler) {
        const mockMember = {
          id: '444444444444444444',
          voice: { channelId: '123456789012345678', setChannel: jest.fn() }
        };

        // Create a channel
        await voiceStateHandler(
          { channelId: null, member: mockMember },
          { channelId: '123456789012345678', member: mockMember }
        );

        const stats = autoChannelManager.getStats();
        expect(stats.totalChannels).toBe(1);
        expect(stats.channelsByTemplate['123456789012345678']).toBe(1);
      }
    });
  });

  describe('stop functionality', () => {
    it('should cleanup resources when stopped', () => {
      autoChannelManager.stop();

      expect(mockClearInterval).toHaveBeenCalled();

      const stats = autoChannelManager.getStats();
      expect(stats.totalChannels).toBe(0);
      expect(stats.queueSize).toBe(0);
    });
  });
});