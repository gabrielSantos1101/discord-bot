import type { UserData, UserStatus } from '../UserData';
import { ValidationError } from '../ErrorTypes';
import { validateRichPresence } from './RichPresenceValidator';

/**
 * Validates user status value
 */
export function validateUserStatus(status: any): status is UserStatus {
  return typeof status === 'string' && 
         ['online', 'idle', 'dnd', 'offline'].includes(status);
}

/**
 * Validates activity object
 */
export function validateActivity(activity: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!activity || typeof activity !== 'object') {
    errors.push({
      field: 'activity',
      rule: 'required_object',
      message: 'Activity must be an object',
      value: activity
    });
    return errors;
  }
  
  // Validate type
  if (!activity.type || !['playing', 'listening', 'watching', 'custom', 'competing'].includes(activity.type)) {
    errors.push({
      field: 'activity.type',
      rule: 'enum',
      message: 'Activity type must be one of: playing, listening, watching, custom, competing',
      value: activity.type
    });
  }
  
  // Validate name
  if (!activity.name || typeof activity.name !== 'string' || activity.name.trim().length === 0) {
    errors.push({
      field: 'activity.name',
      rule: 'required_string',
      message: 'Activity name is required and must be a non-empty string',
      value: activity.name
    });
  }
  
  // Validate optional fields
  if (activity.details !== undefined && typeof activity.details !== 'string') {
    errors.push({
      field: 'activity.details',
      rule: 'string',
      message: 'Activity details must be a string if provided',
      value: activity.details
    });
  }
  
  if (activity.state !== undefined && typeof activity.state !== 'string') {
    errors.push({
      field: 'activity.state',
      rule: 'string',
      message: 'Activity state must be a string if provided',
      value: activity.state
    });
  }
  
  // Validate timestamps
  if (activity.timestamps) {
    if (typeof activity.timestamps !== 'object') {
      errors.push({
        field: 'activity.timestamps',
        rule: 'object',
        message: 'Activity timestamps must be an object',
        value: activity.timestamps
      });
    } else {
      if (activity.timestamps.start !== undefined && 
          (!Number.isInteger(activity.timestamps.start) || activity.timestamps.start < 0)) {
        errors.push({
          field: 'activity.timestamps.start',
          rule: 'positive_integer',
          message: 'Start timestamp must be a positive integer',
          value: activity.timestamps.start
        });
      }
      
      if (activity.timestamps.end !== undefined && 
          (!Number.isInteger(activity.timestamps.end) || activity.timestamps.end < 0)) {
        errors.push({
          field: 'activity.timestamps.end',
          rule: 'positive_integer',
          message: 'End timestamp must be a positive integer',
          value: activity.timestamps.end
        });
      }
    }
  }
  
  // Validate optional URL
  if (activity.url !== undefined && typeof activity.url !== 'string') {
    errors.push({
      field: 'activity.url',
      rule: 'string',
      message: 'Activity URL must be a string if provided',
      value: activity.url
    });
  }
  
  return errors;
}

/**
 * Validates complete UserData object
 */
export function validateUserData(userData: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!userData || typeof userData !== 'object') {
    errors.push({
      field: 'userData',
      rule: 'required_object',
      message: 'User data must be an object',
      value: userData
    });
    return errors;
  }
  
  // Validate required fields
  if (!userData.id || typeof userData.id !== 'string') {
    errors.push({
      field: 'id',
      rule: 'required_string',
      message: 'User ID is required and must be a string',
      value: userData.id
    });
  }
  
  if (!userData.username || typeof userData.username !== 'string') {
    errors.push({
      field: 'username',
      rule: 'required_string',
      message: 'Username is required and must be a string',
      value: userData.username
    });
  }
  
  if (!userData.discriminator || typeof userData.discriminator !== 'string') {
    errors.push({
      field: 'discriminator',
      rule: 'required_string',
      message: 'Discriminator is required and must be a string',
      value: userData.discriminator
    });
  }
  
  // Validate status
  if (!validateUserStatus(userData.status)) {
    errors.push({
      field: 'status',
      rule: 'enum',
      message: 'Status must be one of: online, idle, dnd, offline',
      value: userData.status
    });
  }
  
  // Validate activities array
  if (!Array.isArray(userData.activities)) {
    errors.push({
      field: 'activities',
      rule: 'array',
      message: 'Activities must be an array',
      value: userData.activities
    });
  } else {
    userData.activities.forEach((activity: any, index: number) => {
      const activityErrors = validateActivity(activity);
      activityErrors.forEach(error => {
        errors.push({
          ...error,
          field: `activities[${index}].${error.field.replace('activity.', '')}`
        });
      });
    });
  }
  
  // Validate lastSeen
  if (!userData.lastSeen || !(userData.lastSeen instanceof Date)) {
    errors.push({
      field: 'lastSeen',
      rule: 'date',
      message: 'Last seen must be a valid Date object',
      value: userData.lastSeen
    });
  }
  
  // Validate optional fields
  if (userData.avatar !== undefined && typeof userData.avatar !== 'string') {
    errors.push({
      field: 'avatar',
      rule: 'string',
      message: 'Avatar must be a string if provided',
      value: userData.avatar
    });
  }
  
  if (userData.globalName !== undefined && typeof userData.globalName !== 'string') {
    errors.push({
      field: 'globalName',
      rule: 'string',
      message: 'Global name must be a string if provided',
      value: userData.globalName
    });
  }
  
  if (userData.bot !== undefined && typeof userData.bot !== 'boolean') {
    errors.push({
      field: 'bot',
      rule: 'boolean',
      message: 'Bot flag must be a boolean if provided',
      value: userData.bot
    });
  }
  
  // Validate optional presence
  if (userData.presence !== undefined) {
    const presenceErrors = validateRichPresence(userData.presence);
    presenceErrors.forEach(error => {
      errors.push({
        ...error,
        field: `presence.${error.field.replace('richPresence.', '')}`
      });
    });
  }
  
  return errors;
}

/**
 * Type guard for UserData
 */
export function isValidUserData(userData: any): userData is UserData {
  return validateUserData(userData).length === 0;
}