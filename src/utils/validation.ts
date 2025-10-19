import Joi from 'joi';
import { ErrorCode, ValidationError } from '../models/ErrorTypes';
import { LogContext, logger } from './logger';

/**
 * Validation result interface
 */
export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Sanitization options
 */
export interface SanitizationOptions {
  stripHtml?: boolean;
  trim?: boolean;
  toLowerCase?: boolean;
  allowedChars?: string;
  maxLength?: number;
}

/**
 * Common validation schemas
 */
export const ValidationSchemas = {
  discordUserId: Joi.string()
    .pattern(/^\d{17,19}$/)
    .required()
    .messages({
      'string.pattern.base': 'User ID must be a valid Discord snowflake (17-19 digits)',
      'any.required': 'User ID is required'
    }),

  discordGuildId: Joi.string()
    .pattern(/^\d{17,19}$/)
    .required()
    .messages({
      'string.pattern.base': 'Guild ID must be a valid Discord snowflake (17-19 digits)',
      'any.required': 'Guild ID is required'
    }),

  discordChannelId: Joi.string()
    .pattern(/^\d{17,19}$/)
    .required()
    .messages({
      'string.pattern.base': 'Channel ID must be a valid Discord snowflake (17-19 digits)',
      'any.required': 'Channel ID is required'
    }),

  serverConfig: Joi.object({
    serverId: Joi.string().pattern(/^\d{17,19}$/).required(),
    commandPrefix: Joi.string().min(1).max(5).default('!'),
    autoChannels: Joi.array().items(
      Joi.object({
        templateChannelId: Joi.string().pattern(/^\d{17,19}$/).required(),
        namePattern: Joi.string().min(1).max(50).required(),
        maxChannels: Joi.number().integer().min(1).max(50).default(10),
        emptyTimeout: Joi.number().integer().min(1).max(60).default(5)
      })
    ).default([]),
    apiAccess: Joi.object({
      enabled: Joi.boolean().default(true),
      allowedEndpoints: Joi.array().items(Joi.string()).default([]),
      rateLimit: Joi.number().integer().min(1).max(1000).default(100)
    }).default({})
  }),

  /** Channel configuration validation */
  channelConfig: Joi.object({
    templateChannelId: Joi.string().pattern(/^\d{17,19}$/).required(),
    serverId: Joi.string().pattern(/^\d{17,19}$/).required(),
    namePattern: Joi.string()
      .min(1)
      .max(50)
      .pattern(/^[a-zA-Z0-9\-_\{\}]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Name pattern can only contain letters, numbers, hyphens, underscores, and {number} placeholder'
      }),
    maxChannels: Joi.number().integer().min(1).max(50).default(10),
    emptyTimeout: Joi.number().integer().min(1).max(60).default(5)
  }),

  /** API request parameters */
  apiParams: Joi.object({
    userId: Joi.string().pattern(/^\d{17,19}$/).required(),
    guildId: Joi.string().pattern(/^\d{17,19}$/).optional(),
    includePresence: Joi.boolean().default(false),
    includeActivities: Joi.boolean().default(true)
  }),

  /** Pagination parameters */
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('id', 'username', 'lastSeen', 'createdAt').default('id'),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc')
  })
};

/**
 * Validation utility class
 */
export class ValidationUtils {
  /**
   * Validate data against a Joi schema
   */
  static validate<T>(
    data: any,
    schema: Joi.Schema,
    context?: LogContext
  ): ValidationResult<T> {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const validationErrors: ValidationError[] = error.details.map(detail => ({
        field: detail.path.join('.'),
        rule: detail.type,
        message: detail.message,
        value: detail.context?.value
      }));

      // Log validation errors
      validationErrors.forEach(validationError => {
        logger.validationError(
          validationError.field,
          validationError.rule,
          validationError.value,
          context
        );
      });

      return {
        isValid: false,
        errors: validationErrors
      };
    }

    return {
      isValid: true,
      data: value as T
    };
  }

  /**
   * Validate Discord User ID
   */
  static validateUserId(userId: string, context?: LogContext): ValidationResult<string> {
    return this.validate(userId, ValidationSchemas.discordUserId, {
      ...context,
      operation: 'validate_user_id'
    });
  }

  /**
   * Validate Discord Guild ID
   */
  static validateGuildId(guildId: string, context?: LogContext): ValidationResult<string> {
    return this.validate(guildId, ValidationSchemas.discordGuildId, {
      ...context,
      operation: 'validate_guild_id'
    });
  }

  /**
   * Validate Discord Channel ID
   */
  static validateChannelId(channelId: string, context?: LogContext): ValidationResult<string> {
    return this.validate(channelId, ValidationSchemas.discordChannelId, {
      ...context,
      operation: 'validate_channel_id'
    });
  }

  /**
   * Validate API request parameters
   */
  static validateApiParams(params: any, context?: LogContext): ValidationResult {
    return this.validate(params, ValidationSchemas.apiParams, {
      ...context,
      operation: 'validate_api_params'
    });
  }

  /**
   * Validate server configuration
   */
  static validateServerConfig(config: any, context?: LogContext): ValidationResult {
    return this.validate(config, ValidationSchemas.serverConfig, {
      ...context,
      operation: 'validate_server_config'
    });
  }

  /**
   * Validate channel configuration
   */
  static validateChannelConfig(config: any, context?: LogContext): ValidationResult {
    return this.validate(config, ValidationSchemas.channelConfig, {
      ...context,
      operation: 'validate_channel_config'
    });
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(params: any, context?: LogContext): ValidationResult {
    return this.validate(params, ValidationSchemas.pagination, {
      ...context,
      operation: 'validate_pagination'
    });
  }
}

/**
 * Sanitization utility class
 */
export class SanitizationUtils {
  /**
   * Sanitize string input
   */
  static sanitizeString(
    input: string,
    options: SanitizationOptions = {},
    context?: LogContext
  ): string {
    if (typeof input !== 'string') {
      logger.warn('Attempted to sanitize non-string value', {
        ...context,
        operation: 'sanitize_string',
        metadata: { inputType: typeof input }
      });
      return String(input);
    }

    let sanitized = input;

    // Trim whitespace
    if (options.trim !== false) {
      sanitized = sanitized.trim();
    }

    // Strip HTML tags
    if (options.stripHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Convert to lowercase
    if (options.toLowerCase) {
      sanitized = sanitized.toLowerCase();
    }

    // Filter allowed characters
    if (options.allowedChars) {
      const allowedPattern = new RegExp(`[^a-zA-Z0-9${options.allowedChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g');
      sanitized = sanitized.replace(allowedPattern, '');
    }

    // Enforce maximum length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
      logger.warn('String truncated due to length limit', {
        ...context,
        operation: 'sanitize_string',
        metadata: {
          originalLength: input.length,
          maxLength: options.maxLength,
          truncated: true
        }
      });
    }

    return sanitized;
  }

  /**
   * Sanitize Discord User ID
   */
  static sanitizeUserId(userId: string, context?: LogContext): string {
    return this.sanitizeString(userId, {
      trim: true,
      allowedChars: '',
      maxLength: 19
    }, {
      ...context,
      operation: 'sanitize_user_id'
    });
  }

  /**
   * Sanitize channel name pattern
   */
  static sanitizeChannelNamePattern(pattern: string, context?: LogContext): string {
    return this.sanitizeString(pattern, {
      trim: true,
      toLowerCase: true,
      allowedChars: '-_{}',
      maxLength: 50
    }, {
      ...context,
      operation: 'sanitize_channel_pattern'
    });
  }

  /**
   * Sanitize object by applying sanitization to all string properties
   */
  static sanitizeObject(
    obj: Record<string, any>,
    options: SanitizationOptions = {},
    context?: LogContext
  ): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value, options, {
          ...context,
          metadata: { ...context?.metadata, field: key }
        });
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeObject(value, options, {
          ...context,
          metadata: { ...context?.metadata, field: key }
        });
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Remove potentially dangerous characters from user input
   */
  static removeDangerousChars(input: string, context?: LogContext): string {
    // Remove null bytes, control characters, and other potentially dangerous chars
    const dangerous = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
    const cleaned = input.replace(dangerous, '');

    if (cleaned !== input) {
      logger.warn('Dangerous characters removed from input', {
        ...context,
        operation: 'remove_dangerous_chars',
        metadata: {
          originalLength: input.length,
          cleanedLength: cleaned.length,
          removedChars: input.length - cleaned.length
        }
      });
    }

    return cleaned;
  }
}

/**
 * Create validation error from Joi validation result
 */
export function createValidationError(
  validationResult: ValidationResult,
  requestId: string
): Error {
  const error = new Error('Validation failed');
  (error as any).code = ErrorCode.INVALID_REQUEST;
  (error as any).details = {
    requestId,
    errors: validationResult.errors
  };
  return error;
}

/**
 * Middleware factory for request validation
 */
export function createValidationMiddleware(schema: Joi.Schema) {
  return (req: any, _res: any, next: any) => {
    const requestId = req.headers['x-request-id'] || 'unknown';
    const context: LogContext = {
      requestId,
      component: 'ValidationMiddleware'
    };

    // Validate request body, params, and query
    const dataToValidate = {
      ...req.body,
      ...req.params,
      ...req.query
    };

    const result = ValidationUtils.validate(dataToValidate, schema, context);

    if (!result.isValid) {
      const error = createValidationError(result, requestId);
      return next(error);
    }

    // Attach validated and sanitized data to request
    req.validatedData = result.data;
    next();
  };
}

// Export instances for convenience
export const validator = ValidationUtils;
export const sanitizer = SanitizationUtils;