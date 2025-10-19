import { logger } from '../utils/logger';

/**
 * Types of presence-related errors
 */
export enum PresenceErrorType {
  INTENT_MISSING = 'intent_missing',
  INTENT_DISABLED = 'intent_disabled',
  CACHE_UNAVAILABLE = 'cache_unavailable',
  EVENT_PROCESSING = 'event_processing',
  DATA_TRANSFORMATION = 'data_transformation',
  SYNC_FAILURE = 'sync_failure',
  RATE_LIMIT = 'rate_limit',
  PERMISSION_DENIED = 'permission_denied',
  NETWORK_ERROR = 'network_error',
  UNKNOWN = 'unknown'
}

/**
 * Error context for presence operations
 */
export interface PresenceErrorContext {
  userId?: string;
  guildId?: string;
  operation?: string;
  component?: string;
  metadata?: Record<string, any>;
}

/**
 * Presence error with enhanced information
 */
export class PresenceError extends Error {
  public readonly type: PresenceErrorType;
  public readonly context: PresenceErrorContext;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;

  constructor(
    type: PresenceErrorType,
    message: string,
    context: PresenceErrorContext = {},
    recoverable: boolean = true,
    cause?: Error
  ) {
    super(message);
    this.name = 'PresenceError';
    this.type = type;
    this.context = context;
    this.timestamp = new Date();
    this.recoverable = recoverable;
    
    if (cause && cause.stack) {
      this.stack = cause.stack;
    }
  }
}

/**
 * Error statistics for monitoring
 */
export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<PresenceErrorType, number>;
  errorsByComponent: Record<string, number>;
  recentErrors: Array<{
    type: PresenceErrorType;
    message: string;
    timestamp: Date;
    context: PresenceErrorContext;
  }>;
  lastReset: Date;
}

/**
 * Enhanced error handler for presence-related operations
 */
export class PresenceErrorHandler {
  private errorStats: ErrorStats;
  private maxRecentErrors = 100;
  private alertThresholds = {
    intentErrors: 5,
    cacheErrors: 10,
    syncErrors: 15,
    totalErrors: 50
  };

  constructor() {
    this.errorStats = {
      totalErrors: 0,
      errorsByType: {} as Record<PresenceErrorType, number>,
      errorsByComponent: {},
      recentErrors: [],
      lastReset: new Date()
    };

    // Initialize error counters
    Object.values(PresenceErrorType).forEach(type => {
      this.errorStats.errorsByType[type] = 0;
    });
  }

  /**
   * Handle a presence-related error
   */
  public handleError(error: Error | PresenceError, context: PresenceErrorContext = {}): PresenceError {
    let presenceError: PresenceError;

    if (error instanceof PresenceError) {
      presenceError = error;
    } else {
      const errorType = this.classifyError(error, context);
      presenceError = new PresenceError(
        errorType,
        error.message,
        context,
        this.isRecoverable(errorType),
        error
      );
    }

    this.recordError(presenceError);
    this.logError(presenceError);
    this.checkAlertThresholds();

    return presenceError;
  }

  /**
   * Classify an error into a presence error type
   */
  private classifyError(error: Error, context: PresenceErrorContext): PresenceErrorType {
    const message = error.message.toLowerCase();
    // const stack = error.stack?.toLowerCase() || '';

    // Intent-related errors
    if (message.includes('missing access') || message.includes('insufficient permissions')) {
      return PresenceErrorType.INTENT_MISSING;
    }

    if (message.includes('intent') && (message.includes('disabled') || message.includes('not enabled'))) {
      return PresenceErrorType.INTENT_DISABLED;
    }

    // Cache-related errors
    if (message.includes('redis') || message.includes('cache') || context.component === 'CacheService') {
      return PresenceErrorType.CACHE_UNAVAILABLE;
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('429')) {
      return PresenceErrorType.RATE_LIMIT;
    }

    // Permission errors
    if (message.includes('permission') || message.includes('forbidden') || message.includes('403')) {
      return PresenceErrorType.PERMISSION_DENIED;
    }

    // Network errors
    if (message.includes('network') || message.includes('timeout') || message.includes('econnreset')) {
      return PresenceErrorType.NETWORK_ERROR;
    }

    // Sync errors
    if (context.operation?.includes('sync') || context.component === 'PresenceSyncService') {
      return PresenceErrorType.SYNC_FAILURE;
    }

    // Event processing errors
    if (context.operation?.includes('event') || context.operation?.includes('presence')) {
      return PresenceErrorType.EVENT_PROCESSING;
    }

    // Data transformation errors
    if (message.includes('transform') || message.includes('parse') || message.includes('serialize')) {
      return PresenceErrorType.DATA_TRANSFORMATION;
    }

    return PresenceErrorType.UNKNOWN;
  }

  /**
   * Determine if an error type is recoverable
   */
  private isRecoverable(errorType: PresenceErrorType): boolean {
    const nonRecoverableTypes = [
      PresenceErrorType.INTENT_MISSING,
      PresenceErrorType.INTENT_DISABLED,
      PresenceErrorType.PERMISSION_DENIED
    ];

    return !nonRecoverableTypes.includes(errorType);
  }

  /**
   * Record error in statistics
   */
  private recordError(error: PresenceError): void {
    this.errorStats.totalErrors++;
    this.errorStats.errorsByType[error.type]++;

    const component = error.context.component || 'unknown';
    this.errorStats.errorsByComponent[component] = (this.errorStats.errorsByComponent[component] || 0) + 1;

    // Add to recent errors
    this.errorStats.recentErrors.push({
      type: error.type,
      message: error.message,
      timestamp: error.timestamp,
      context: error.context
    });

    // Trim recent errors if needed
    if (this.errorStats.recentErrors.length > this.maxRecentErrors) {
      this.errorStats.recentErrors = this.errorStats.recentErrors.slice(-this.maxRecentErrors);
    }
  }

  /**
   * Log error with appropriate level and context
   */
  private logError(error: PresenceError): void {
    const logContext: any = {
      component: error.context.component || 'PresenceErrorHandler',
      operation: error.context.operation || 'error_handling',
      metadata: {
        errorType: error.type,
        recoverable: error.recoverable,
        timestamp: error.timestamp,
        ...error.context.metadata
      }
    };

    if (error.context.userId) {
      logContext.userId = error.context.userId;
    }
    if (error.context.guildId) {
      logContext.guildId = error.context.guildId;
    }

    if (!error.recoverable) {
      logger.error(`CRITICAL: ${error.message}`, logContext, error);
    } else if (this.isHighFrequencyError(error.type)) {
      logger.warn(`Frequent error: ${error.message}`, logContext);
    } else {
      logger.error(error.message, logContext, error);
    }
  }

  /**
   * Check if error type is occurring frequently
   */
  private isHighFrequencyError(errorType: PresenceErrorType): boolean {
    const recentCount = this.errorStats.recentErrors
      .filter(e => e.type === errorType && Date.now() - e.timestamp.getTime() < 5 * 60 * 1000)
      .length;

    return recentCount > 5;
  }

  /**
   * Check alert thresholds and log alerts
   */
  private checkAlertThresholds(): void {
    const stats = this.errorStats;

    // Check intent errors
    if (stats.errorsByType[PresenceErrorType.INTENT_MISSING] >= this.alertThresholds.intentErrors) {
      this.logAlert('Intent Missing Alert', 
        `${stats.errorsByType[PresenceErrorType.INTENT_MISSING]} intent missing errors detected`,
        'Enable GuildPresences intent in Discord Developer Portal'
      );
    }

    if (stats.errorsByType[PresenceErrorType.INTENT_DISABLED] >= this.alertThresholds.intentErrors) {
      this.logAlert('Intent Disabled Alert',
        `${stats.errorsByType[PresenceErrorType.INTENT_DISABLED]} intent disabled errors detected`,
        'Enable GuildPresences intent in Discord Developer Portal'
      );
    }

    // Check cache errors
    if (stats.errorsByType[PresenceErrorType.CACHE_UNAVAILABLE] >= this.alertThresholds.cacheErrors) {
      this.logAlert('Cache Unavailable Alert',
        `${stats.errorsByType[PresenceErrorType.CACHE_UNAVAILABLE]} cache errors detected`,
        'Check Redis connection and configuration'
      );
    }

    // Check sync errors
    if (stats.errorsByType[PresenceErrorType.SYNC_FAILURE] >= this.alertThresholds.syncErrors) {
      this.logAlert('Sync Failure Alert',
        `${stats.errorsByType[PresenceErrorType.SYNC_FAILURE]} sync errors detected`,
        'Check presence synchronization service and Discord API connectivity'
      );
    }

    // Check total errors
    if (stats.totalErrors >= this.alertThresholds.totalErrors) {
      this.logAlert('High Error Rate Alert',
        `${stats.totalErrors} total presence errors detected`,
        'Review system health and error patterns'
      );
    }
  }

  /**
   * Log an alert for critical error patterns
   */
  private logAlert(alertType: string, message: string, recommendation: string): void {
    logger.error(`PRESENCE ALERT: ${alertType}`, {
      component: 'PresenceErrorHandler',
      operation: 'alert',
      metadata: {
        alertType,
        message,
        recommendation,
        errorStats: this.getErrorSummary()
      }
    });
  }

  /**
   * Get error statistics summary
   */
  public getErrorStats(): ErrorStats {
    return { ...this.errorStats };
  }

  /**
   * Get error summary for reporting
   */
  public getErrorSummary(): Record<string, any> {
    const now = Date.now();
    const recentErrors = this.errorStats.recentErrors.filter(
      e => now - e.timestamp.getTime() < 60 * 60 * 1000 // Last hour
    );

    return {
      totalErrors: this.errorStats.totalErrors,
      recentErrorsCount: recentErrors.length,
      topErrorTypes: Object.entries(this.errorStats.errorsByType)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([type, count]) => ({ type, count })),
      topComponents: Object.entries(this.errorStats.errorsByComponent)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([component, count]) => ({ component, count })),
      lastReset: this.errorStats.lastReset
    };
  }

  /**
   * Reset error statistics
   */
  public resetStats(): void {
    this.errorStats = {
      totalErrors: 0,
      errorsByType: {} as Record<PresenceErrorType, number>,
      errorsByComponent: {},
      recentErrors: [],
      lastReset: new Date()
    };

    // Initialize error counters
    Object.values(PresenceErrorType).forEach(type => {
      this.errorStats.errorsByType[type] = 0;
    });

    logger.info('Presence error statistics reset', {
      component: 'PresenceErrorHandler',
      operation: 'stats_reset'
    });
  }

  /**
   * Get recovery suggestions for an error type
   */
  public getRecoverySuggestions(errorType: PresenceErrorType): string[] {
    const suggestions: Record<PresenceErrorType, string[]> = {
      [PresenceErrorType.INTENT_MISSING]: [
        'Enable GuildPresences intent in Discord Developer Portal',
        'Restart the bot service after enabling the intent',
        'Verify bot has proper permissions in the server'
      ],
      [PresenceErrorType.INTENT_DISABLED]: [
        'Enable GuildPresences intent in Discord Developer Portal',
        'Ensure bot application is verified if required',
        'Restart the bot service'
      ],
      [PresenceErrorType.CACHE_UNAVAILABLE]: [
        'Check Redis server connectivity',
        'Verify Redis configuration settings',
        'Enable memory fallback caching',
        'Restart Redis service if needed'
      ],
      [PresenceErrorType.EVENT_PROCESSING]: [
        'Check presence event handler implementation',
        'Verify Discord WebSocket connection',
        'Review event processing logs for patterns'
      ],
      [PresenceErrorType.DATA_TRANSFORMATION]: [
        'Review data transformation logic',
        'Check for Discord API changes',
        'Validate presence data structure'
      ],
      [PresenceErrorType.SYNC_FAILURE]: [
        'Check Discord API connectivity',
        'Verify bot permissions in guilds',
        'Review sync service configuration',
        'Check for rate limiting issues'
      ],
      [PresenceErrorType.RATE_LIMIT]: [
        'Implement exponential backoff',
        'Reduce sync frequency temporarily',
        'Check for concurrent operations',
        'Review Discord API usage patterns'
      ],
      [PresenceErrorType.PERMISSION_DENIED]: [
        'Verify bot permissions in the server',
        'Check role hierarchy and permissions',
        'Ensure bot has necessary server permissions'
      ],
      [PresenceErrorType.NETWORK_ERROR]: [
        'Check network connectivity',
        'Verify DNS resolution',
        'Review firewall settings',
        'Check for proxy configuration issues'
      ],
      [PresenceErrorType.UNKNOWN]: [
        'Review error logs for patterns',
        'Check system resources',
        'Verify bot configuration',
        'Contact support if issue persists'
      ]
    };

    return suggestions[errorType] || suggestions[PresenceErrorType.UNKNOWN];
  }
}

// Global instance for use throughout the application
export const presenceErrorHandler = new PresenceErrorHandler();