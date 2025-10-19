import type { ChannelConfig } from '../ChannelConfig';
import type { ServerConfig } from '../ServerConfig';
import { ValidationError } from '../ErrorTypes';

/**
 * Validates channel permission object
 */
export function validateChannelPermission(permission: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!permission || typeof permission !== 'object') {
    errors.push({
      field: 'permission',
      rule: 'required_object',
      message: 'Channel permission must be an object',
      value: permission
    });
    return errors;
  }
  
  // Validate ID
  if (!permission.id || typeof permission.id !== 'string') {
    errors.push({
      field: 'permission.id',
      rule: 'required_string',
      message: 'Permission ID is required and must be a string',
      value: permission.id
    });
  }
  
  // Validate type
  if (!permission.type || !['role', 'member'].includes(permission.type)) {
    errors.push({
      field: 'permission.type',
      rule: 'enum',
      message: 'Permission type must be either "role" or "member"',
      value: permission.type
    });
  }
  
  // Validate allow permissions
  if (!permission.allow || typeof permission.allow !== 'string') {
    errors.push({
      field: 'permission.allow',
      rule: 'required_string',
      message: 'Allow permissions must be a string (bitfield)',
      value: permission.allow
    });
  }
  
  // Validate deny permissions
  if (!permission.deny || typeof permission.deny !== 'string') {
    errors.push({
      field: 'permission.deny',
      rule: 'required_string',
      message: 'Deny permissions must be a string (bitfield)',
      value: permission.deny
    });
  }
  
  return errors;
}

/**
 * Validates channel configuration object
 */
export function validateChannelConfig(config: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!config || typeof config !== 'object') {
    errors.push({
      field: 'channelConfig',
      rule: 'required_object',
      message: 'Channel config must be an object',
      value: config
    });
    return errors;
  }
  
  // Validate required string fields
  const requiredStringFields = ['templateChannelId', 'serverId', 'namePattern'];
  for (const field of requiredStringFields) {
    if (!config[field] || typeof config[field] !== 'string') {
      errors.push({
        field: field,
        rule: 'required_string',
        message: `${field} is required and must be a string`,
        value: config[field]
      });
    }
  }
  
  // Validate maxChannels
  if (!Number.isInteger(config.maxChannels) || config.maxChannels < 1 || config.maxChannels > 50) {
    errors.push({
      field: 'maxChannels',
      rule: 'integer_range',
      message: 'Max channels must be an integer between 1 and 50',
      value: config.maxChannels
    });
  }
  
  // Validate emptyTimeout
  if (!Number.isInteger(config.emptyTimeout) || config.emptyTimeout < 1 || config.emptyTimeout > 1440) {
    errors.push({
      field: 'emptyTimeout',
      rule: 'integer_range',
      message: 'Empty timeout must be an integer between 1 and 1440 minutes',
      value: config.emptyTimeout
    });
  }
  
  // Validate userLimit
  if (!Number.isInteger(config.userLimit) || config.userLimit < 0 || config.userLimit > 99) {
    errors.push({
      field: 'userLimit',
      rule: 'integer_range',
      message: 'User limit must be an integer between 0 and 99',
      value: config.userLimit
    });
  }
  
  // Validate enabled flag
  if (typeof config.enabled !== 'boolean') {
    errors.push({
      field: 'enabled',
      rule: 'boolean',
      message: 'Enabled must be a boolean',
      value: config.enabled
    });
  }
  
  // Validate permissions array
  if (!Array.isArray(config.permissions)) {
    errors.push({
      field: 'permissions',
      rule: 'array',
      message: 'Permissions must be an array',
      value: config.permissions
    });
  } else {
    config.permissions.forEach((permission: any, index: number) => {
      const permissionErrors = validateChannelPermission(permission);
      permissionErrors.forEach(error => {
        errors.push({
          ...error,
          field: `permissions[${index}].${error.field.replace('permission.', '')}`
        });
      });
    });
  }
  
  // Validate optional categoryId
  if (config.categoryId !== undefined && typeof config.categoryId !== 'string') {
    errors.push({
      field: 'categoryId',
      rule: 'string',
      message: 'Category ID must be a string if provided',
      value: config.categoryId
    });
  }
  
  return errors;
}

/**
 * Validates API access configuration
 */
export function validateApiAccessConfig(config: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!config || typeof config !== 'object') {
    errors.push({
      field: 'apiAccess',
      rule: 'required_object',
      message: 'API access config must be an object',
      value: config
    });
    return errors;
  }
  
  // Validate enabled
  if (typeof config.enabled !== 'boolean') {
    errors.push({
      field: 'apiAccess.enabled',
      rule: 'boolean',
      message: 'API access enabled must be a boolean',
      value: config.enabled
    });
  }
  
  // Validate allowedEndpoints
  if (!Array.isArray(config.allowedEndpoints)) {
    errors.push({
      field: 'apiAccess.allowedEndpoints',
      rule: 'array',
      message: 'Allowed endpoints must be an array',
      value: config.allowedEndpoints
    });
  } else {
    config.allowedEndpoints.forEach((endpoint: any, index: number) => {
      if (typeof endpoint !== 'string') {
        errors.push({
          field: `apiAccess.allowedEndpoints[${index}]`,
          rule: 'string',
          message: 'Each allowed endpoint must be a string',
          value: endpoint
        });
      }
    });
  }
  
  // Validate rateLimit
  if (!Number.isInteger(config.rateLimit) || config.rateLimit < 1 || config.rateLimit > 10000) {
    errors.push({
      field: 'apiAccess.rateLimit',
      rule: 'integer_range',
      message: 'Rate limit must be an integer between 1 and 10000',
      value: config.rateLimit
    });
  }
  
  // Validate allowedIPs
  if (!Array.isArray(config.allowedIPs)) {
    errors.push({
      field: 'apiAccess.allowedIPs',
      rule: 'array',
      message: 'Allowed IPs must be an array',
      value: config.allowedIPs
    });
  } else {
    config.allowedIPs.forEach((ip: any, index: number) => {
      if (typeof ip !== 'string') {
        errors.push({
          field: `apiAccess.allowedIPs[${index}]`,
          rule: 'string',
          message: 'Each allowed IP must be a string',
          value: ip
        });
      }
    });
  }
  
  return errors;
}

/**
 * Validates logging configuration
 */
export function validateLoggingConfig(config: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!config || typeof config !== 'object') {
    errors.push({
      field: 'logging',
      rule: 'required_object',
      message: 'Logging config must be an object',
      value: config
    });
    return errors;
  }
  
  // Validate level
  if (!config.level || !['error', 'warn', 'info', 'debug'].includes(config.level)) {
    errors.push({
      field: 'logging.level',
      rule: 'enum',
      message: 'Log level must be one of: error, warn, info, debug',
      value: config.level
    });
  }
  
  // Validate channels
  if (!Array.isArray(config.channels)) {
    errors.push({
      field: 'logging.channels',
      rule: 'array',
      message: 'Log channels must be an array',
      value: config.channels
    });
  } else {
    config.channels.forEach((channel: any, index: number) => {
      if (typeof channel !== 'string') {
        errors.push({
          field: `logging.channels[${index}]`,
          rule: 'string',
          message: 'Each log channel must be a string',
          value: channel
        });
      }
    });
  }
  
  // Validate boolean flags
  const booleanFields = ['logUserActivities', 'logChannelOperations'];
  for (const field of booleanFields) {
    if (typeof config[field] !== 'boolean') {
      errors.push({
        field: `logging.${field}`,
        rule: 'boolean',
        message: `${field} must be a boolean`,
        value: config[field]
      });
    }
  }
  
  return errors;
}

/**
 * Validates complete server configuration
 */
export function validateServerConfig(config: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!config || typeof config !== 'object') {
    errors.push({
      field: 'serverConfig',
      rule: 'required_object',
      message: 'Server config must be an object',
      value: config
    });
    return errors;
  }
  
  // Validate required string fields
  const requiredStringFields = ['serverId', 'commandPrefix', 'timezone'];
  for (const field of requiredStringFields) {
    if (!config[field] || typeof config[field] !== 'string') {
      errors.push({
        field: field,
        rule: 'required_string',
        message: `${field} is required and must be a string`,
        value: config[field]
      });
    }
  }
  
  // Validate enabled flag
  if (typeof config.enabled !== 'boolean') {
    errors.push({
      field: 'enabled',
      rule: 'boolean',
      message: 'Enabled must be a boolean',
      value: config.enabled
    });
  }
  
  // Validate lastUpdated
  if (!config.lastUpdated || !(config.lastUpdated instanceof Date)) {
    errors.push({
      field: 'lastUpdated',
      rule: 'date',
      message: 'Last updated must be a valid Date object',
      value: config.lastUpdated
    });
  }
  
  // Validate autoChannels array
  if (!Array.isArray(config.autoChannels)) {
    errors.push({
      field: 'autoChannels',
      rule: 'array',
      message: 'Auto channels must be an array',
      value: config.autoChannels
    });
  } else {
    config.autoChannels.forEach((channelConfig: any, index: number) => {
      const channelErrors = validateChannelConfig(channelConfig);
      channelErrors.forEach(error => {
        errors.push({
          ...error,
          field: `autoChannels[${index}].${error.field}`
        });
      });
    });
  }
  
  // Validate adminRoles array
  if (!Array.isArray(config.adminRoles)) {
    errors.push({
      field: 'adminRoles',
      rule: 'array',
      message: 'Admin roles must be an array',
      value: config.adminRoles
    });
  } else {
    config.adminRoles.forEach((role: any, index: number) => {
      if (typeof role !== 'string') {
        errors.push({
          field: `adminRoles[${index}]`,
          rule: 'string',
          message: 'Each admin role must be a string',
          value: role
        });
      }
    });
  }
  
  // Validate nested configurations
  if (config.apiAccess) {
    const apiErrors = validateApiAccessConfig(config.apiAccess);
    errors.push(...apiErrors);
  }
  
  if (config.logging) {
    const loggingErrors = validateLoggingConfig(config.logging);
    errors.push(...loggingErrors);
  }
  
  return errors;
}

/**
 * Type guards
 */
export function isValidChannelConfig(config: any): config is ChannelConfig {
  return validateChannelConfig(config).length === 0;
}

export function isValidServerConfig(config: any): config is ServerConfig {
  return validateServerConfig(config).length === 0;
}