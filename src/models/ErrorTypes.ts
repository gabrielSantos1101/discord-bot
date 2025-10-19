/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    /** Error code for programmatic handling */
    code: string;
    
    /** Human-readable error message */
    message: string;
    
    /** Additional error details */
    details?: any;
    
    /** When the error occurred */
    timestamp: string;
    
    /** Request ID for tracking */
    requestId: string;
  };
}

/**
 * Common error codes used throughout the application
 */
export enum ErrorCode {
  // User-related errors
  USER_NOT_FOUND = "USER_NOT_FOUND",
  USER_NOT_IN_SERVER = "USER_NOT_IN_SERVER",
  USER_PRIVACY_RESTRICTED = "USER_PRIVACY_RESTRICTED",
  
  // Channel-related errors
  CHANNEL_NOT_FOUND = "CHANNEL_NOT_FOUND",
  CHANNEL_LIMIT_REACHED = "CHANNEL_LIMIT_REACHED",
  CHANNEL_CREATION_FAILED = "CHANNEL_CREATION_FAILED",
  INVALID_TEMPLATE_CHANNEL = "INVALID_TEMPLATE_CHANNEL",
  
  // Permission errors
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS",
  FORBIDDEN_OPERATION = "FORBIDDEN_OPERATION",
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  DISCORD_RATE_LIMITED = "DISCORD_RATE_LIMITED",
  
  // Configuration errors
  INVALID_CONFIGURATION = "INVALID_CONFIGURATION",
  SERVER_NOT_CONFIGURED = "SERVER_NOT_CONFIGURED",
  CONFIGURATION_SAVE_FAILED = "CONFIGURATION_SAVE_FAILED",
  
  // Service errors
  DISCORD_API_ERROR = "DISCORD_API_ERROR",
  CACHE_UNAVAILABLE = "CACHE_UNAVAILABLE",
  DATABASE_ERROR = "DATABASE_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  
  // Validation errors
  INVALID_REQUEST = "INVALID_REQUEST",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_FIELD_VALUE = "INVALID_FIELD_VALUE",
  
  // Internal errors
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Field that failed validation */
  field: string;
  
  /** Validation rule that was violated */
  rule: string;
  
  /** Human-readable error message */
  message: string;
  
  /** Value that failed validation */
  value?: any;
}

/**
 * Rate limit error details
 */
export interface RateLimitError {
  /** Current request count */
  current: number;
  
  /** Maximum allowed requests */
  limit: number;
  
  /** Time window in seconds */
  window: number;
  
  /** When the rate limit resets */
  resetAt: string;
  
  /** Seconds until reset */
  retryAfter: number;
}

/**
 * Discord API error details
 */
export interface DiscordApiError {
  /** Discord error code */
  code: number;
  
  /** Discord error message */
  message: string;
  
  /** HTTP status code */
  status: number;
  
  /** Whether this is a rate limit error */
  isRateLimit: boolean;
  
  /** Retry after seconds (for rate limits) */
  retryAfter?: number;
}