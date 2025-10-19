import { ChannelConfig } from '../ChannelConfig';
import { ServerConfig } from '../ServerConfig';
import {
    isValidChannelConfig,
    isValidServerConfig,
    validateApiAccessConfig,
    validateChannelConfig,
    validateLoggingConfig,
    validateServerConfig
} from '../validators/ConfigValidator';

describe('ConfigValidator', () => {
  describe('validateChannelConfig', () => {
    const validChannelConfig: ChannelConfig = {
      templateChannelId: '123456789012345678',
      serverId: '987654321098765432',
      namePattern: 'Auto-{number}',
      maxChannels: 5,
      emptyTimeout: 10,
      permissions: [],
      enabled: true,
      userLimit: 0
    };

    it('should validate correct channel config', () => {
      const errors = validateChannelConfig(validChannelConfig);
      expect(errors).toHaveLength(0);
    });

    it('should reject null or undefined config', () => {
      const errors1 = validateChannelConfig(null);
      expect(errors1).toHaveLength(1);
      expect(errors1[0]?.field).toBe('channelConfig');

      const errors2 = validateChannelConfig(undefined);
      expect(errors2).toHaveLength(1);
      expect(errors2[0]?.field).toBe('channelConfig');
    });

    it('should reject missing required string fields', () => {
      const invalidConfig = { ...validChannelConfig };
      delete (invalidConfig as any).templateChannelId;
      delete (invalidConfig as any).serverId;
      delete (invalidConfig as any).namePattern;

      const errors = validateChannelConfig(invalidConfig);
      expect(errors.some(e => e.field === 'templateChannelId')).toBe(true);
      expect(errors.some(e => e.field === 'serverId')).toBe(true);
      expect(errors.some(e => e.field === 'namePattern')).toBe(true);
    });

    it('should reject invalid maxChannels values', () => {
      const invalidConfig1 = { ...validChannelConfig, maxChannels: 0 };
      const errors1 = validateChannelConfig(invalidConfig1);
      expect(errors1.some(e => e.field === 'maxChannels')).toBe(true);

      const invalidConfig2 = { ...validChannelConfig, maxChannels: 51 };
      const errors2 = validateChannelConfig(invalidConfig2);
      expect(errors2.some(e => e.field === 'maxChannels')).toBe(true);

      const invalidConfig3 = { ...validChannelConfig, maxChannels: 'invalid' as any };
      const errors3 = validateChannelConfig(invalidConfig3);
      expect(errors3.some(e => e.field === 'maxChannels')).toBe(true);
    });

    it('should reject invalid emptyTimeout values', () => {
      const invalidConfig1 = { ...validChannelConfig, emptyTimeout: 0 };
      const errors1 = validateChannelConfig(invalidConfig1);
      expect(errors1.some(e => e.field === 'emptyTimeout')).toBe(true);

      const invalidConfig2 = { ...validChannelConfig, emptyTimeout: 1441 };
      const errors2 = validateChannelConfig(invalidConfig2);
      expect(errors2.some(e => e.field === 'emptyTimeout')).toBe(true);
    });

    it('should reject invalid userLimit values', () => {
      const invalidConfig1 = { ...validChannelConfig, userLimit: -1 };
      const errors1 = validateChannelConfig(invalidConfig1);
      expect(errors1.some(e => e.field === 'userLimit')).toBe(true);

      const invalidConfig2 = { ...validChannelConfig, userLimit: 100 };
      const errors2 = validateChannelConfig(invalidConfig2);
      expect(errors2.some(e => e.field === 'userLimit')).toBe(true);
    });

    it('should reject non-boolean enabled flag', () => {
      const invalidConfig = { ...validChannelConfig, enabled: 'true' as any };
      const errors = validateChannelConfig(invalidConfig);
      expect(errors.some(e => e.field === 'enabled')).toBe(true);
    });

    it('should reject non-array permissions', () => {
      const invalidConfig = { ...validChannelConfig, permissions: 'not array' as any };
      const errors = validateChannelConfig(invalidConfig);
      expect(errors.some(e => e.field === 'permissions')).toBe(true);
    });

    it('should validate permissions in array', () => {
      const invalidPermission = { id: '', type: 'invalid', allow: '', deny: '' };
      const invalidConfig = { ...validChannelConfig, permissions: [invalidPermission] };
      const errors = validateChannelConfig(invalidConfig);
      expect(errors.some(e => e.field.startsWith('permissions[0]'))).toBe(true);
    });
  });

  describe('validateApiAccessConfig', () => {
    const validApiConfig = {
      enabled: true,
      allowedEndpoints: ['/api/users/*'],
      rateLimit: 100,
      allowedIPs: ['127.0.0.1']
    };

    it('should validate correct API access config', () => {
      const errors = validateApiAccessConfig(validApiConfig);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid enabled flag', () => {
      const invalidConfig = { ...validApiConfig, enabled: 'true' as any };
      const errors = validateApiAccessConfig(invalidConfig);
      expect(errors.some(e => e.field === 'apiAccess.enabled')).toBe(true);
    });

    it('should reject invalid rate limit values', () => {
      const invalidConfig1 = { ...validApiConfig, rateLimit: 0 };
      const errors1 = validateApiAccessConfig(invalidConfig1);
      expect(errors1.some(e => e.field === 'apiAccess.rateLimit')).toBe(true);

      const invalidConfig2 = { ...validApiConfig, rateLimit: 10001 };
      const errors2 = validateApiAccessConfig(invalidConfig2);
      expect(errors2.some(e => e.field === 'apiAccess.rateLimit')).toBe(true);
    });

    it('should reject non-array allowedEndpoints', () => {
      const invalidConfig = { ...validApiConfig, allowedEndpoints: 'not array' as any };
      const errors = validateApiAccessConfig(invalidConfig);
      expect(errors.some(e => e.field === 'apiAccess.allowedEndpoints')).toBe(true);
    });

    it('should reject non-string endpoints in array', () => {
      const invalidConfig = { ...validApiConfig, allowedEndpoints: [123, 'valid'] };
      const errors = validateApiAccessConfig(invalidConfig);
      expect(errors.some(e => e.field === 'apiAccess.allowedEndpoints[0]')).toBe(true);
    });
  });

  describe('validateLoggingConfig', () => {
    const validLoggingConfig = {
      level: 'info',
      channels: ['log-channel'],
      logUserActivities: true,
      logChannelOperations: false
    };

    it('should validate correct logging config', () => {
      const errors = validateLoggingConfig(validLoggingConfig);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid log level', () => {
      const invalidConfig = { ...validLoggingConfig, level: 'invalid' };
      const errors = validateLoggingConfig(invalidConfig);
      expect(errors.some(e => e.field === 'logging.level')).toBe(true);
    });

    it('should reject non-array channels', () => {
      const invalidConfig = { ...validLoggingConfig, channels: 'not array' as any };
      const errors = validateLoggingConfig(invalidConfig);
      expect(errors.some(e => e.field === 'logging.channels')).toBe(true);
    });

    it('should reject non-boolean flags', () => {
      const invalidConfig = { 
        ...validLoggingConfig, 
        logUserActivities: 'true' as any,
        logChannelOperations: 'false' as any
      };
      const errors = validateLoggingConfig(invalidConfig);
      expect(errors.some(e => e.field === 'logging.logUserActivities')).toBe(true);
      expect(errors.some(e => e.field === 'logging.logChannelOperations')).toBe(true);
    });
  });

  describe('validateServerConfig', () => {
    const validServerConfig: ServerConfig = {
      serverId: '123456789012345678',
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

    it('should validate correct server config', () => {
      const errors = validateServerConfig(validServerConfig);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const invalidConfig = { ...validServerConfig };
      delete (invalidConfig as any).serverId;
      delete (invalidConfig as any).commandPrefix;

      const errors = validateServerConfig(invalidConfig);
      expect(errors.some(e => e.field === 'serverId')).toBe(true);
      expect(errors.some(e => e.field === 'commandPrefix')).toBe(true);
    });

    it('should reject invalid lastUpdated date', () => {
      const invalidConfig = { ...validServerConfig, lastUpdated: 'not a date' as any };
      const errors = validateServerConfig(invalidConfig);
      expect(errors.some(e => e.field === 'lastUpdated')).toBe(true);
    });

    it('should reject non-array adminRoles', () => {
      const invalidConfig = { ...validServerConfig, adminRoles: 'not array' as any };
      const errors = validateServerConfig(invalidConfig);
      expect(errors.some(e => e.field === 'adminRoles')).toBe(true);
    });

    it('should validate nested configurations', () => {
      const invalidConfig = {
        ...validServerConfig,
        apiAccess: { enabled: 'invalid' },
        logging: { level: 'invalid' }
      };
      const errors = validateServerConfig(invalidConfig);
      expect(errors.some(e => e.field.includes('apiAccess'))).toBe(true);
      expect(errors.some(e => e.field.includes('logging'))).toBe(true);
    });
  });

  describe('type guards', () => {
    it('should correctly identify valid channel config', () => {
      const validConfig: ChannelConfig = {
        templateChannelId: '123456789012345678',
        serverId: '987654321098765432',
        namePattern: 'Auto-{number}',
        maxChannels: 5,
        emptyTimeout: 10,
        permissions: [],
        enabled: true,
        userLimit: 0
      };
      expect(isValidChannelConfig(validConfig)).toBe(true);
    });

    it('should correctly identify invalid channel config', () => {
      const invalidConfig = { maxChannels: 0 };
      expect(isValidChannelConfig(invalidConfig)).toBe(false);
    });

    it('should correctly identify valid server config', () => {
      const validConfig: ServerConfig = {
        serverId: '123456789012345678',
        commandPrefix: '!',
        enabled: true,
        timezone: 'UTC',
        adminRoles: [],
        apiAccess: {
          enabled: true,
          allowedEndpoints: [],
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
      expect(isValidServerConfig(validConfig)).toBe(true);
    });

    it('should correctly identify invalid server config', () => {
      const invalidConfig = { serverId: '' };
      expect(isValidServerConfig(invalidConfig)).toBe(false);
    });
  });
});