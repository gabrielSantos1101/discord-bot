import type { 
  ApiResponse, 
  UserStatusResponse, 
  UserActivityResponse, 
  UserPresenceResponse,
  AutoChannelStatusResponse
} from '../ApiResponses';
import { ValidationError } from '../ErrorTypes';
import { validateActivity } from './UserDataValidator';
import { validateRichPresence } from './RichPresenceValidator';

/**
 * Validates generic API response wrapper
 */
export function validateApiResponse(response: any, dataValidator?: (data: any) => ValidationError[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!response || typeof response !== 'object') {
    errors.push({
      field: 'response',
      rule: 'required_object',
      message: 'API response must be an object',
      value: response
    });
    return errors;
  }
  
  // Validate required fields
  if (response.data === undefined) {
    errors.push({
      field: 'data',
      rule: 'required',
      message: 'Response data is required',
      value: response.data
    });
  }
  
  if (!response.timestamp || typeof response.timestamp !== 'string') {
    errors.push({
      field: 'timestamp',
      rule: 'required_string',
      message: 'Timestamp is required and must be a string',
      value: response.timestamp
    });
  }
  
  if (!response.requestId || typeof response.requestId !== 'string') {
    errors.push({
      field: 'requestId',
      rule: 'required_string',
      message: 'Request ID is required and must be a string',
      value: response.requestId
    });
  }
  
  if (typeof response.success !== 'boolean') {
    errors.push({
      field: 'success',
      rule: 'boolean',
      message: 'Success must be a boolean',
      value: response.success
    });
  }
  
  // Validate data if validator provided
  if (dataValidator && response.data !== undefined) {
    const dataErrors = dataValidator(response.data);
    dataErrors.forEach(error => {
      errors.push({
        ...error,
        field: `data.${error.field}`
      });
    });
  }
  
  return errors;
}

/**
 * Validates user status response data
 */
export function validateUserStatusResponseData(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({
      field: 'userStatusData',
      rule: 'required_object',
      message: 'User status data must be an object',
      value: data
    });
    return errors;
  }
  
  // Validate required fields
  if (!data.userId || typeof data.userId !== 'string') {
    errors.push({
      field: 'userId',
      rule: 'required_string',
      message: 'User ID is required and must be a string',
      value: data.userId
    });
  }
  
  if (!data.status || !['online', 'idle', 'dnd', 'offline'].includes(data.status)) {
    errors.push({
      field: 'status',
      rule: 'enum',
      message: 'Status must be one of: online, idle, dnd, offline',
      value: data.status
    });
  }
  
  if (!data.lastUpdated || typeof data.lastUpdated !== 'string') {
    errors.push({
      field: 'lastUpdated',
      rule: 'required_string',
      message: 'Last updated is required and must be a string',
      value: data.lastUpdated
    });
  }
  
  if (typeof data.inVoiceChannel !== 'boolean') {
    errors.push({
      field: 'inVoiceChannel',
      rule: 'boolean',
      message: 'In voice channel must be a boolean',
      value: data.inVoiceChannel
    });
  }
  
  // Validate activities array
  if (!Array.isArray(data.activities)) {
    errors.push({
      field: 'activities',
      rule: 'array',
      message: 'Activities must be an array',
      value: data.activities
    });
  } else {
    data.activities.forEach((activity: any, index: number) => {
      const activityErrors = validateActivity(activity);
      activityErrors.forEach(error => {
        errors.push({
          ...error,
          field: `activities[${index}].${error.field.replace('activity.', '')}`
        });
      });
    });
  }
  
  return errors;
}

/**
 * Validates user activity response data
 */
export function validateUserActivityResponseData(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({
      field: 'userActivityData',
      rule: 'required_object',
      message: 'User activity data must be an object',
      value: data
    });
    return errors;
  }
  
  // Validate required fields
  if (!data.userId || typeof data.userId !== 'string') {
    errors.push({
      field: 'userId',
      rule: 'required_string',
      message: 'User ID is required and must be a string',
      value: data.userId
    });
  }
  
  if (!data.lastUpdated || typeof data.lastUpdated !== 'string') {
    errors.push({
      field: 'lastUpdated',
      rule: 'required_string',
      message: 'Last updated is required and must be a string',
      value: data.lastUpdated
    });
  }
  
  // Validate activities array
  if (!Array.isArray(data.activities)) {
    errors.push({
      field: 'activities',
      rule: 'array',
      message: 'Activities must be an array',
      value: data.activities
    });
  } else {
    data.activities.forEach((activity: any, index: number) => {
      const activityErrors = validateActivity(activity);
      activityErrors.forEach(error => {
        errors.push({
          ...error,
          field: `activities[${index}].${error.field.replace('activity.', '')}`
        });
      });
    });
  }
  
  return errors;
}

/**
 * Validates user presence response data
 */
export function validateUserPresenceResponseData(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({
      field: 'userPresenceData',
      rule: 'required_object',
      message: 'User presence data must be an object',
      value: data
    });
    return errors;
  }
  
  // Validate required fields
  if (!data.userId || typeof data.userId !== 'string') {
    errors.push({
      field: 'userId',
      rule: 'required_string',
      message: 'User ID is required and must be a string',
      value: data.userId
    });
  }
  
  if (!data.lastUpdated || typeof data.lastUpdated !== 'string') {
    errors.push({
      field: 'lastUpdated',
      rule: 'required_string',
      message: 'Last updated is required and must be a string',
      value: data.lastUpdated
    });
  }
  
  // Validate optional current activity
  if (data.currentActivity !== null && data.currentActivity !== undefined) {
    const activityErrors = validateActivity(data.currentActivity);
    activityErrors.forEach(error => {
      errors.push({
        ...error,
        field: `currentActivity.${error.field.replace('activity.', '')}`
      });
    });
  }
  
  // Validate optional rich presence
  if (data.richPresence !== null && data.richPresence !== undefined) {
    const richPresenceErrors = validateRichPresence(data.richPresence);
    richPresenceErrors.forEach(error => {
      errors.push({
        ...error,
        field: `richPresence.${error.field.replace('richPresence.', '')}`
      });
    });
  }
  
  return errors;
}

/**
 * Validates auto channel status response data
 */
export function validateAutoChannelStatusResponseData(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({
      field: 'autoChannelData',
      rule: 'required_object',
      message: 'Auto channel data must be an object',
      value: data
    });
    return errors;
  }
  
  // Validate required fields
  if (!data.templateId || typeof data.templateId !== 'string') {
    errors.push({
      field: 'templateId',
      rule: 'required_string',
      message: 'Template ID is required and must be a string',
      value: data.templateId
    });
  }
  
  if (!Number.isInteger(data.maxChannels) || data.maxChannels < 1) {
    errors.push({
      field: 'maxChannels',
      rule: 'positive_integer',
      message: 'Max channels must be a positive integer',
      value: data.maxChannels
    });
  }
  
  if (typeof data.canCreateNew !== 'boolean') {
    errors.push({
      field: 'canCreateNew',
      rule: 'boolean',
      message: 'Can create new must be a boolean',
      value: data.canCreateNew
    });
  }
  
  // Validate active channels array
  if (!Array.isArray(data.activeChannels)) {
    errors.push({
      field: 'activeChannels',
      rule: 'array',
      message: 'Active channels must be an array',
      value: data.activeChannels
    });
  } else {
    data.activeChannels.forEach((channel: any, index: number) => {
      if (!channel || typeof channel !== 'object') {
        errors.push({
          field: `activeChannels[${index}]`,
          rule: 'object',
          message: 'Each active channel must be an object',
          value: channel
        });
        return;
      }
      
      const requiredStringFields = ['id', 'name', 'createdAt'];
      for (const field of requiredStringFields) {
        if (!channel[field] || typeof channel[field] !== 'string') {
          errors.push({
            field: `activeChannels[${index}].${field}`,
            rule: 'required_string',
            message: `${field} is required and must be a string`,
            value: channel[field]
          });
        }
      }
      
      if (!Number.isInteger(channel.userCount) || channel.userCount < 0) {
        errors.push({
          field: `activeChannels[${index}].userCount`,
          rule: 'non_negative_integer',
          message: 'User count must be a non-negative integer',
          value: channel.userCount
        });
      }
    });
  }
  
  return errors;
}

/**
 * Type guards for API responses
 */
export function isValidUserStatusResponse(response: any): response is ApiResponse<UserStatusResponse> {
  return validateApiResponse(response, validateUserStatusResponseData).length === 0;
}

export function isValidUserActivityResponse(response: any): response is ApiResponse<UserActivityResponse> {
  return validateApiResponse(response, validateUserActivityResponseData).length === 0;
}

export function isValidUserPresenceResponse(response: any): response is ApiResponse<UserPresenceResponse> {
  return validateApiResponse(response, validateUserPresenceResponseData).length === 0;
}

export function isValidAutoChannelStatusResponse(response: any): response is ApiResponse<AutoChannelStatusResponse> {
  return validateApiResponse(response, validateAutoChannelStatusResponseData).length === 0;
}