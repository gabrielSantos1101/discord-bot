import { AutoChannelStatusResponse, UserActivityResponse, UserPresenceResponse, UserStatusResponse } from '../ApiResponses';
import {
    isValidUserActivityResponse,
    isValidUserStatusResponse,
    validateApiResponse,
    validateAutoChannelStatusResponseData,
    validateUserActivityResponseData,
    validateUserPresenceResponseData,
    validateUserStatusResponseData
} from '../validators/ApiResponseValidator';

describe('ApiResponseValidator', () => {
  describe('validateApiResponse', () => {
    const validResponse = {
      data: { test: 'data' },
      timestamp: new Date().toISOString(),
      requestId: 'req-123',
      success: true
    };

    it('should validate correct API response', () => {
      const errors = validateApiResponse(validResponse);
      expect(errors).toHaveLength(0);
    });

    it('should reject null or undefined response', () => {
      const errors1 = validateApiResponse(null);
      expect(errors1).toHaveLength(1);
      expect(errors1[0]?.field).toBe('response');

      const errors2 = validateApiResponse(undefined);
      expect(errors2).toHaveLength(1);
      expect(errors2[0]?.field).toBe('response');
    });

    it('should reject missing required fields', () => {
      const invalidResponse = { ...validResponse };
      delete (invalidResponse as any).data;
      delete (invalidResponse as any).timestamp;
      delete (invalidResponse as any).requestId;

      const errors = validateApiResponse(invalidResponse);
      expect(errors.some(e => e.field === 'data')).toBe(true);
      expect(errors.some(e => e.field === 'timestamp')).toBe(true);
      expect(errors.some(e => e.field === 'requestId')).toBe(true);
    });

    it('should reject non-boolean success field', () => {
      const invalidResponse = { ...validResponse, success: 'true' as any };
      const errors = validateApiResponse(invalidResponse);
      expect(errors.some(e => e.field === 'success')).toBe(true);
    });

    it('should validate data with custom validator', () => {
      const dataValidator = (data: any) => {
        if (!data.required) {
          return [{ field: 'required', rule: 'required', message: 'Required field missing', value: data.required }];
        }
        return [];
      };

      const invalidResponse = { ...validResponse, data: { test: 'data' } };
      const errors = validateApiResponse(invalidResponse, dataValidator);
      expect(errors.some(e => e.field === 'data.required')).toBe(true);
    });
  });

  describe('validateUserStatusResponseData', () => {
    const validStatusData: UserStatusResponse = {
      userId: '123456789012345678',
      status: 'online',
      activities: [],
      lastUpdated: new Date().toISOString(),
      inVoiceChannel: false
    };

    it('should validate correct user status data', () => {
      const errors = validateUserStatusResponseData(validStatusData);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const invalidData = { ...validStatusData };
      delete (invalidData as any).userId;
      delete (invalidData as any).status;

      const errors = validateUserStatusResponseData(invalidData);
      expect(errors.some(e => e.field === 'userId')).toBe(true);
      expect(errors.some(e => e.field === 'status')).toBe(true);
    });

    it('should reject invalid status values', () => {
      const invalidData = { ...validStatusData, status: 'invalid' as any };
      const errors = validateUserStatusResponseData(invalidData);
      expect(errors.some(e => e.field === 'status')).toBe(true);
    });

    it('should reject non-boolean inVoiceChannel', () => {
      const invalidData = { ...validStatusData, inVoiceChannel: 'false' as any };
      const errors = validateUserStatusResponseData(invalidData);
      expect(errors.some(e => e.field === 'inVoiceChannel')).toBe(true);
    });

    it('should reject non-array activities', () => {
      const invalidData = { ...validStatusData, activities: 'not array' as any };
      const errors = validateUserStatusResponseData(invalidData);
      expect(errors.some(e => e.field === 'activities')).toBe(true);
    });

    it('should validate activities in array', () => {
      const invalidActivity = { type: 'invalid', name: '' };
      const invalidData = { ...validStatusData, activities: [invalidActivity] };
      const errors = validateUserStatusResponseData(invalidData);
      expect(errors.some(e => e.field.startsWith('activities[0]'))).toBe(true);
    });
  });

  describe('validateUserActivityResponseData', () => {
    const validActivityData: UserActivityResponse = {
      userId: '123456789012345678',
      activities: [
        {
          type: 'playing',
          name: 'Test Game'
        }
      ],
      lastUpdated: new Date().toISOString()
    };

    it('should validate correct user activity data', () => {
      const errors = validateUserActivityResponseData(validActivityData);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const invalidData = { ...validActivityData };
      delete (invalidData as any).userId;
      delete (invalidData as any).lastUpdated;

      const errors = validateUserActivityResponseData(invalidData);
      expect(errors.some(e => e.field === 'userId')).toBe(true);
      expect(errors.some(e => e.field === 'lastUpdated')).toBe(true);
    });

    it('should validate activities array', () => {
      const invalidActivity = { type: 'invalid', name: '' };
      const invalidData = { ...validActivityData, activities: [invalidActivity] };
      const errors = validateUserActivityResponseData(invalidData);
      expect(errors.some(e => e.field.startsWith('activities[0]'))).toBe(true);
    });
  });

  describe('validateUserPresenceResponseData', () => {
    const validPresenceData: UserPresenceResponse = {
      userId: '123456789012345678',
      currentActivity: {
        type: 'playing',
        name: 'Test Game'
      },
      richPresence: null,
      lastUpdated: new Date().toISOString()
    };

    it('should validate correct user presence data', () => {
      const errors = validateUserPresenceResponseData(validPresenceData);
      expect(errors).toHaveLength(0);
    });

    it('should validate with null current activity', () => {
      const dataWithNullActivity = { ...validPresenceData, currentActivity: null };
      const errors = validateUserPresenceResponseData(dataWithNullActivity);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const invalidData = { ...validPresenceData };
      delete (invalidData as any).userId;

      const errors = validateUserPresenceResponseData(invalidData);
      expect(errors.some(e => e.field === 'userId')).toBe(true);
    });

    it('should validate current activity when present', () => {
      const invalidActivity = { type: 'invalid', name: '' };
      const invalidData = { ...validPresenceData, currentActivity: invalidActivity };
      const errors = validateUserPresenceResponseData(invalidData);
      expect(errors.some(e => e.field.startsWith('currentActivity'))).toBe(true);
    });
  });

  describe('validateAutoChannelStatusResponseData', () => {
    const validChannelData: AutoChannelStatusResponse = {
      templateId: '123456789012345678',
      activeChannels: [
        {
          id: '987654321098765432',
          name: 'Auto-1',
          userCount: 2,
          createdAt: new Date().toISOString()
        }
      ],
      maxChannels: 5,
      canCreateNew: true
    };

    it('should validate correct auto channel data', () => {
      const errors = validateAutoChannelStatusResponseData(validChannelData);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const invalidData = { ...validChannelData };
      delete (invalidData as any).templateId;
      delete (invalidData as any).maxChannels;

      const errors = validateAutoChannelStatusResponseData(invalidData);
      expect(errors.some(e => e.field === 'templateId')).toBe(true);
      expect(errors.some(e => e.field === 'maxChannels')).toBe(true);
    });

    it('should reject invalid maxChannels values', () => {
      const invalidData = { ...validChannelData, maxChannels: 0 };
      const errors = validateAutoChannelStatusResponseData(invalidData);
      expect(errors.some(e => e.field === 'maxChannels')).toBe(true);
    });

    it('should reject non-boolean canCreateNew', () => {
      const invalidData = { ...validChannelData, canCreateNew: 'true' as any };
      const errors = validateAutoChannelStatusResponseData(invalidData);
      expect(errors.some(e => e.field === 'canCreateNew')).toBe(true);
    });

    it('should validate active channels array', () => {
      const invalidChannel = { id: '', name: 'Test', userCount: -1 };
      const invalidData = { ...validChannelData, activeChannels: [invalidChannel] };
      const errors = validateAutoChannelStatusResponseData(invalidData);
      expect(errors.some(e => e.field.startsWith('activeChannels[0]'))).toBe(true);
    });
  });

  describe('type guards', () => {
    it('should correctly identify valid user status response', () => {
      const validResponse = {
        data: {
          userId: '123456789012345678',
          status: 'online',
          activities: [],
          lastUpdated: new Date().toISOString(),
          inVoiceChannel: false
        },
        timestamp: new Date().toISOString(),
        requestId: 'req-123',
        success: true
      };
      expect(isValidUserStatusResponse(validResponse)).toBe(true);
    });

    it('should correctly identify invalid user status response', () => {
      const invalidResponse = {
        data: { status: 'invalid' },
        timestamp: new Date().toISOString(),
        requestId: 'req-123',
        success: true
      };
      expect(isValidUserStatusResponse(invalidResponse)).toBe(false);
    });

    it('should correctly identify valid user activity response', () => {
      const validResponse = {
        data: {
          userId: '123456789012345678',
          activities: [],
          lastUpdated: new Date().toISOString()
        },
        timestamp: new Date().toISOString(),
        requestId: 'req-123',
        success: true
      };
      expect(isValidUserActivityResponse(validResponse)).toBe(true);
    });

    it('should correctly identify invalid user activity response', () => {
      const invalidResponse = {
        data: { activities: 'not array' },
        timestamp: new Date().toISOString(),
        requestId: 'req-123',
        success: true
      };
      expect(isValidUserActivityResponse(invalidResponse)).toBe(false);
    });
  });
});