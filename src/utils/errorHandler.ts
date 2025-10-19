import { ErrorCode, ErrorResponse } from '../models/ErrorTypes';
import { LogContext, logger } from './logger';

/**
 * Backoff strategy configuration
 */
export interface BackoffConfig {
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  maxAttempts: number;
  jitter: number;
}

/**
 * Default backoff configurations for different scenarios
 */
export const DEFAULT_BACKOFF_CONFIGS = {
  discord_api: {
    initialDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
    maxAttempts: 5,
    jitter: 0.1
  } as BackoffConfig,
  
  connection_recovery: {
    initialDelay: 2000,
    maxDelay: 60000,
    multiplier: 1.5,
    maxAttempts: 10,
    jitter: 0.2
  } as BackoffConfig,
  
  cache_fallback: {
    initialDelay: 500,
    maxDelay: 5000,
    multiplier: 2,
    maxAttempts: 3,
    jitter: 0.1
  } as BackoffConfig
};

/**
 * Retry operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: BackoffConfig,
  context?: LogContext
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelay;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 1) {
        logger.info('Operation succeeded after retry', {
          ...context,
          operation: 'retry_success',
          metadata: { attempt, totalAttempts: config.maxAttempts }
        });
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      logger.warn('Operation failed, will retry', {
        ...context,
        operation: 'retry_attempt',
        metadata: {
          attempt,
          totalAttempts: config.maxAttempts,
          error: lastError.message,
          nextDelayMs: attempt < config.maxAttempts ? delay : null
        }
      });

      if (attempt === config.maxAttempts) {
        break;
      }

      const jitteredDelay = delay + (delay * config.jitter * Math.random());
      await sleep(jitteredDelay);

      delay = Math.min(delay * config.multiplier, config.maxDelay);
    }
  }

  if (!lastError) {
    lastError = new Error('Unknown error occurred during retry attempts');
  }

  logger.error('Operation failed after all retry attempts', {
    ...context,
    operation: 'retry_exhausted',
    metadata: {
      totalAttempts: config.maxAttempts,
      finalError: lastError.message
    }
  }, lastError);

  throw lastError;
}

/**
 * Handle Discord API rate limiting with intelligent backoff
 */
export async function handleDiscordRateLimit(
  retryAfter: number,
  context?: LogContext
): Promise<void> {
  const waitTime = retryAfter * 1000;
  
  logger.rateLimitHit(retryAfter, {
    ...context,
    metadata: {
      waitTimeMs: waitTime,
      retryAfterSeconds: retryAfter
    }
  });

  await sleep(waitTime + 100);
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: any
): ErrorResponse {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId
    }
  };
}

/**
 * Extract error information from various error types
 */
export function extractErrorInfo(error: any): {
  code: ErrorCode;
  message: string;
  details?: any;
  isRetryable: boolean;
} {
  if (error.code && Object.values(ErrorCode).includes(error.code)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      isRetryable: isRetryableError(error.code)
    };
  }

  if (error.details && error.details.status) {
    const status = error.details.status;
    
    if (status === 429) {
      return {
        code: ErrorCode.DISCORD_RATE_LIMITED,
        message: 'Discord API rate limit exceeded',
        details: error.details,
        isRetryable: true
      };
    }
    
    if (status === 404) {
      return {
        code: ErrorCode.USER_NOT_FOUND,
        message: 'Resource not found',
        details: error.details,
        isRetryable: false
      };
    }
    
    if (status >= 500) {
      return {
        code: ErrorCode.DISCORD_API_ERROR,
        message: 'Discord API server error',
        details: error.details,
        isRetryable: true
      };
    }
    
    if (status === 403) {
      return {
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Insufficient permissions',
        details: error.details,
        isRetryable: false
      };
    }
  }

  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'Service temporarily unavailable',
      details: { networkError: error.code },
      isRetryable: true
    };
  }

  if (error.name === 'ValidationError' || error.isJoi) {
    return {
      code: ErrorCode.INVALID_REQUEST,
      message: 'Request validation failed',
      details: error.details || error.message,
      isRetryable: false
    };
  }

  return {
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: error.message || 'An unexpected error occurred',
    details: process.env['NODE_ENV'] === 'development' ? error.stack : undefined,
    isRetryable: false
  };
}

/**
 * Determine if an error code represents a retryable error
 */
export function isRetryableError(code: ErrorCode): boolean {
  const retryableErrors = [
    ErrorCode.DISCORD_RATE_LIMITED,
    ErrorCode.DISCORD_API_ERROR,
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.CACHE_UNAVAILABLE,
    ErrorCode.DATABASE_ERROR
  ];
  
  return retryableErrors.includes(code);
}

/**
 * Connection recovery manager
 */
export class ConnectionRecoveryManager {
  private recoveryAttempts = new Map<string, number>();
  private lastAttemptTime = new Map<string, number>();
  private readonly config: BackoffConfig;

  constructor(config: BackoffConfig = DEFAULT_BACKOFF_CONFIGS.connection_recovery) {
    this.config = config;
  }

  /**
   * Attempt to recover a connection with exponential backoff
   */
  async attemptRecovery<T>(
    serviceId: string,
    recoveryOperation: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const lastAttempt = this.lastAttemptTime.get(serviceId) || 0;
    const now = Date.now();

    if (now - lastAttempt > this.config.maxDelay) {
      this.recoveryAttempts.set(serviceId, 0);
    }

    const currentAttempt = this.recoveryAttempts.get(serviceId) || 0;

    if (currentAttempt >= this.config.maxAttempts) {
      const error = new Error(`Connection recovery failed after ${this.config.maxAttempts} attempts`);
      logger.error('Connection recovery exhausted', {
        ...context,
        component: serviceId,
        operation: 'connection_recovery_failed',
        metadata: { attempts: currentAttempt }
      }, error);
      throw error;
    }

    try {
      logger.connectionRecovery(serviceId, currentAttempt + 1, context);
      
      const result = await recoveryOperation();

      this.recoveryAttempts.delete(serviceId);
      this.lastAttemptTime.delete(serviceId);
      
      logger.info('Connection recovery successful', {
        ...context,
        component: serviceId,
        operation: 'connection_recovery_success',
        metadata: { attempts: currentAttempt + 1 }
      });
      
      return result;
    } catch (error) {
      const newAttemptCount = currentAttempt + 1;
      this.recoveryAttempts.set(serviceId, newAttemptCount);
      this.lastAttemptTime.set(serviceId, now);

      if (newAttemptCount < this.config.maxAttempts) {
        const delay = Math.min(
          this.config.initialDelay * Math.pow(this.config.multiplier, newAttemptCount - 1),
          this.config.maxDelay
        );
        
        const jitteredDelay = delay + (delay * this.config.jitter * Math.random());
        
        logger.warn('Connection recovery attempt failed, will retry', {
          ...context,
          component: serviceId,
          operation: 'connection_recovery_retry',
          metadata: {
            attempt: newAttemptCount,
            nextRetryInMs: jitteredDelay,
            error: (error as Error).message
          }
        });

        await sleep(jitteredDelay);
        return this.attemptRecovery(serviceId, recoveryOperation, context);
      }

      throw error;
    }
  }

  /**
   * Reset recovery state for a service
   */
  resetRecovery(serviceId: string): void {
    this.recoveryAttempts.delete(serviceId);
    this.lastAttemptTime.delete(serviceId);
  }

  /**
   * Get current recovery state for a service
   */
  getRecoveryState(serviceId: string): { attempts: number; lastAttempt: number | null } {
    return {
      attempts: this.recoveryAttempts.get(serviceId) || 0,
      lastAttempt: this.lastAttemptTime.get(serviceId) || null
    };
  }
}

/**
 * Global connection recovery manager instance
 */
export const connectionRecovery = new ConnectionRecoveryManager();

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeout: number = 60000 // 1 minute
  ) {}

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, context?: LogContext): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
        logger.info('Circuit breaker transitioning to half-open', {
          ...context,
          operation: 'circuit_breaker_half_open'
        });
      } else {
        const error = new Error('Circuit breaker is open');
        logger.warn('Circuit breaker rejected request', {
          ...context,
          operation: 'circuit_breaker_rejected',
          metadata: { state: this.state, failures: this.failures }
        });
        throw error;
      }
    }

    try {
      const result = await operation();
      
      if (this.state === 'half-open') {
        this.reset();
        logger.info('Circuit breaker reset to closed', {
          ...context,
          operation: 'circuit_breaker_closed'
        });
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      
      if (this.failures >= this.failureThreshold) {
        this.state = 'open';
        this.lastFailureTime = Date.now();
        logger.warn('Circuit breaker opened', {
          ...context,
          operation: 'circuit_breaker_opened',
          metadata: { failures: this.failures, threshold: this.failureThreshold }
        });
      }
      
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  /**
   * Get current circuit breaker state
   */
  getState(): { state: string; failures: number; threshold: number } {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.failureThreshold
    };
  }
}

/**
 * Utility function for sleeping
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}