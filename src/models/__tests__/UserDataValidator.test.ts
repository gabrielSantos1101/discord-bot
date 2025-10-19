import { Activity } from '../Activity';
import { UserData } from '../UserData';
import { isValidUserData, validateActivity, validateUserData, validateUserStatus } from '../validators/UserDataValidator';

describe('UserDataValidator', () => {
  describe('validateUserStatus', () => {
    it('should validate correct user status values', () => {
      expect(validateUserStatus('online')).toBe(true);
      expect(validateUserStatus('idle')).toBe(true);
      expect(validateUserStatus('dnd')).toBe(true);
      expect(validateUserStatus('offline')).toBe(true);
    });

    it('should reject invalid user status values', () => {
      expect(validateUserStatus('invalid')).toBe(false);
      expect(validateUserStatus('')).toBe(false);
      expect(validateUserStatus(null)).toBe(false);
      expect(validateUserStatus(undefined)).toBe(false);
      expect(validateUserStatus(123)).toBe(false);
    });
  });

  describe('validateActivity', () => {
    const validActivity: Activity = {
      type: 'playing',
      name: 'Test Game',
      details: 'Playing level 1',
      state: 'In game',
      timestamps: {
        start: 1640995200000,
        end: 1640998800000
      },
      url: 'https://example.com'
    };

    it('should validate correct activity object', () => {
      const errors = validateActivity(validActivity);
      expect(errors).toHaveLength(0);
    });

    it('should validate minimal activity object', () => {
      const minimalActivity = {
        type: 'playing',
        name: 'Test Game'
      };
      const errors = validateActivity(minimalActivity);
      expect(errors).toHaveLength(0);
    });

    it('should reject null or undefined activity', () => {
      const errors1 = validateActivity(null);
      expect(errors1).toHaveLength(1);
      expect(errors1[0]?.field).toBe('activity');

      const errors2 = validateActivity(undefined);
      expect(errors2).toHaveLength(1);
      expect(errors2[0]?.field).toBe('activity');
    });

    it('should reject invalid activity type', () => {
      const invalidActivity = { ...validActivity, type: 'invalid' };
      const errors = validateActivity(invalidActivity);
      expect(errors.some(e => e.field === 'activity.type')).toBe(true);
    });

    it('should reject missing or empty activity name', () => {
      const invalidActivity1 = { ...validActivity, name: '' };
      const errors1 = validateActivity(invalidActivity1);
      expect(errors1.some(e => e.field === 'activity.name')).toBe(true);

      const invalidActivity2 = { ...validActivity };
      delete (invalidActivity2 as any).name;
      const errors2 = validateActivity(invalidActivity2);
      expect(errors2.some(e => e.field === 'activity.name')).toBe(true);
    });

    it('should reject invalid timestamp values', () => {
      const invalidActivity = {
        ...validActivity,
        timestamps: {
          start: -1,
          end: 'invalid'
        }
      };
      const errors = validateActivity(invalidActivity);
      expect(errors.some(e => e.field === 'activity.timestamps.start')).toBe(true);
      expect(errors.some(e => e.field === 'activity.timestamps.end')).toBe(true);
    });
  });

  describe('validateUserData', () => {
    const validUserData: UserData = {
      id: '123456789012345678',
      username: 'testuser',
      discriminator: '1234',
      avatar: 'avatar_hash',
      status: 'online',
      activities: [],
      lastSeen: new Date(),
      globalName: 'Test User',
      bot: false
    };

    it('should validate correct user data object', () => {
      const errors = validateUserData(validUserData);
      expect(errors).toHaveLength(0);
    });

    it('should validate minimal user data object', () => {
      const minimalUserData = {
        id: '123456789012345678',
        username: 'testuser',
        discriminator: '1234',
        status: 'online',
        activities: [],
        lastSeen: new Date()
      };
      const errors = validateUserData(minimalUserData);
      expect(errors).toHaveLength(0);
    });

    it('should reject null or undefined user data', () => {
      const errors1 = validateUserData(null);
      expect(errors1).toHaveLength(1);
      expect(errors1[0]?.field).toBe('userData');

      const errors2 = validateUserData(undefined);
      expect(errors2).toHaveLength(1);
      expect(errors2[0]?.field).toBe('userData');
    });

    it('should reject missing required fields', () => {
      const invalidUserData = { ...validUserData };
      delete (invalidUserData as any).id;
      delete (invalidUserData as any).username;
      
      const errors = validateUserData(invalidUserData);
      expect(errors.some(e => e.field === 'id')).toBe(true);
      expect(errors.some(e => e.field === 'username')).toBe(true);
    });

    it('should reject invalid status', () => {
      const invalidUserData = { ...validUserData, status: 'invalid' as any };
      const errors = validateUserData(invalidUserData);
      expect(errors.some(e => e.field === 'status')).toBe(true);
    });

    it('should reject non-array activities', () => {
      const invalidUserData = { ...validUserData, activities: 'not an array' as any };
      const errors = validateUserData(invalidUserData);
      expect(errors.some(e => e.field === 'activities')).toBe(true);
    });

    it('should validate activities in array', () => {
      const invalidActivity = { type: 'invalid', name: '' };
      const invalidUserData = { ...validUserData, activities: [invalidActivity] };
      const errors = validateUserData(invalidUserData);
      expect(errors.some(e => e.field.startsWith('activities[0]'))).toBe(true);
    });

    it('should reject invalid lastSeen date', () => {
      const invalidUserData = { ...validUserData, lastSeen: 'not a date' as any };
      const errors = validateUserData(invalidUserData);
      expect(errors.some(e => e.field === 'lastSeen')).toBe(true);
    });
  });

  describe('isValidUserData', () => {
    it('should return true for valid user data', () => {
      const validUserData: UserData = {
        id: '123456789012345678',
        username: 'testuser',
        discriminator: '1234',
        status: 'online',
        activities: [],
        lastSeen: new Date()
      };
      expect(isValidUserData(validUserData)).toBe(true);
    });

    it('should return false for invalid user data', () => {
      const invalidUserData = {
        id: '',
        username: 'testuser',
        status: 'invalid'
      };
      expect(isValidUserData(invalidUserData)).toBe(false);
    });
  });
});