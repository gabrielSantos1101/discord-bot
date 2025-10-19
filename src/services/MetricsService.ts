import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

/**
 * Metrics for presence events processing
 */
export interface PresenceMetrics {
  eventsProcessed: number;
  eventsPerMinute: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  errorCount: number;
  errorRate: number;
  averageProcessingTime: number;
  lastEventTime: Date | null;
  activeUsers: number;
  debounceQueueSize: number;
}

/**
 * Metrics for API endpoints
 */
export interface ApiMetrics {
  totalRequests: number;
  requestsPerMinute: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageResponseTime: number;
  cacheServedRequests: number;
  apiServedRequests: number;
  cacheUtilizationRate: number;
}

/**
 * System health metrics
 */
export interface SystemMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  discordConnected: boolean;
  cacheConnected: boolean;
  databaseConnected: boolean;
  guildsCount: number;
  usersCount: number;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  errorRateThreshold: number; // Percentage
  responseTimeThreshold: number; // Milliseconds
  cacheHitRateThreshold: number; // Percentage
  memoryUsageThreshold: number; // Percentage
  enabled: boolean;
}

/**
 * Alert event
 */
export interface Alert {
  type: 'error_rate' | 'response_time' | 'cache_hit_rate' | 'memory_usage' | 'presence_processing' | 'system_health';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  metadata?: any;
}

/**
 * Comprehensive metrics service for monitoring presence events and system performance
 */
export class MetricsService extends EventEmitter {
  private presenceMetrics: PresenceMetrics;
  private apiMetrics: ApiMetrics;
  private systemMetrics: SystemMetrics;
  private alertConfig: AlertConfig;

  private eventTimestamps: number[] = [];
  private requestTimestamps: number[] = [];
  private processingTimes: number[] = [];
  private responseTimes: number[] = [];

  private startTime: number;
  private lastCpuUsage: NodeJS.CpuUsage;

  private metricsCleanupInterval?: NodeJS.Timeout;
  private alertCheckInterval?: NodeJS.Timeout;

  constructor(alertConfig?: Partial<AlertConfig>) {
    super();
    
    this.startTime = Date.now();
    this.lastCpuUsage = process.cpuUsage();

    this.presenceMetrics = {
      eventsProcessed: 0,
      eventsPerMinute: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      errorCount: 0,
      errorRate: 0,
      averageProcessingTime: 0,
      lastEventTime: null,
      activeUsers: 0,
      debounceQueueSize: 0
    };

    this.apiMetrics = {
      totalRequests: 0,
      requestsPerMinute: 0,
      successfulRequests: 0,
      failedRequests: 0,
      successRate: 0,
      averageResponseTime: 0,
      cacheServedRequests: 0,
      apiServedRequests: 0,
      cacheUtilizationRate: 0
    };

    this.systemMetrics = {
      uptime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      discordConnected: false,
      cacheConnected: false,
      databaseConnected: false,
      guildsCount: 0,
      usersCount: 0
    };

    this.alertConfig = {
      errorRateThreshold: 5,
      responseTimeThreshold: 2000,
      cacheHitRateThreshold: 80,
      memoryUsageThreshold: 85,
      enabled: true,
      ...alertConfig
    };

    this.setupPeriodicUpdates();
    this.setupCleanup();

    logger.info('Metrics service initialized', {
      component: 'MetricsService',
      operation: 'initialization',
      metadata: {
        alertsEnabled: this.alertConfig.enabled,
        thresholds: this.alertConfig
      }
    });
  }

  /**
   * Record a presence event being processed
   */
  recordPresenceEvent(processingTime: number, success: boolean, fromCache: boolean = false): void {
    const now = Date.now();
    
    this.presenceMetrics.eventsProcessed++;
    this.presenceMetrics.lastEventTime = new Date();
    this.eventTimestamps.push(now);
    
    if (success) {
      this.processingTimes.push(processingTime);
      if (fromCache) {
        this.presenceMetrics.cacheHits++;
      } else {
        this.presenceMetrics.cacheMisses++;
      }
    } else {
      this.presenceMetrics.errorCount++;
    }

    this.updatePresenceMetrics();
  }

  /**
   * Record an API request
   */
  recordApiRequest(responseTime: number, success: boolean, fromCache: boolean = false): void {
    const now = Date.now();
    
    this.apiMetrics.totalRequests++;
    this.requestTimestamps.push(now);
    this.responseTimes.push(responseTime);
    
    if (success) {
      this.apiMetrics.successfulRequests++;
    } else {
      this.apiMetrics.failedRequests++;
    }

    if (fromCache) {
      this.apiMetrics.cacheServedRequests++;
    } else {
      this.apiMetrics.apiServedRequests++;
    }

    this.updateApiMetrics();
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics(systemInfo: Partial<SystemMetrics>): void {
    this.systemMetrics = {
      ...this.systemMetrics,
      ...systemInfo,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(this.lastCpuUsage)
    };

    this.lastCpuUsage = process.cpuUsage();
  }

  /**
   * Update presence queue size
   */
  updatePresenceQueueSize(size: number): void {
    this.presenceMetrics.debounceQueueSize = size;
  }

  /**
   * Update active users count
   */
  updateActiveUsers(count: number): void {
    this.presenceMetrics.activeUsers = count;
  }

  /**
   * Get current presence metrics
   */
  getPresenceMetrics(): PresenceMetrics {
    return { ...this.presenceMetrics };
  }

  /**
   * Get current API metrics
   */
  getApiMetrics(): ApiMetrics {
    return { ...this.apiMetrics };
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemMetrics {
    return { ...this.systemMetrics };
  }

  /**
   * Get comprehensive metrics dashboard
   */
  getMetricsDashboard(): {
    presence: PresenceMetrics;
    api: ApiMetrics;
    system: SystemMetrics;
    alerts: Alert[];
    timestamp: Date;
  } {
    return {
      presence: this.getPresenceMetrics(),
      api: this.getApiMetrics(),
      system: this.getSystemMetrics(),
      alerts: this.getRecentAlerts(),
      timestamp: new Date()
    };
  }

  /**
   * Reset all metrics (useful for testing or periodic resets)
   */
  resetMetrics(): void {
    this.presenceMetrics = {
      eventsProcessed: 0,
      eventsPerMinute: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      errorCount: 0,
      errorRate: 0,
      averageProcessingTime: 0,
      lastEventTime: null,
      activeUsers: 0,
      debounceQueueSize: 0
    };

    this.apiMetrics = {
      totalRequests: 0,
      requestsPerMinute: 0,
      successfulRequests: 0,
      failedRequests: 0,
      successRate: 0,
      averageResponseTime: 0,
      cacheServedRequests: 0,
      apiServedRequests: 0,
      cacheUtilizationRate: 0
    };

    this.eventTimestamps = [];
    this.requestTimestamps = [];
    this.processingTimes = [];
    this.responseTimes = [];

    logger.info('Metrics reset', {
      component: 'MetricsService',
      operation: 'reset'
    });
  }

  /**
   * Update alert configuration
   */
  updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    
    logger.info('Alert configuration updated', {
      component: 'MetricsService',
      operation: 'alert_config_update',
      metadata: this.alertConfig
    });
  }

  /**
   * Get recent alerts (last 24 hours)
   */
  private getRecentAlerts(): Alert[] {
    return [];
  }

  /**
   * Update presence metrics calculations
   */
  private updatePresenceMetrics(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentEvents = this.eventTimestamps.filter(timestamp => timestamp > oneMinuteAgo);
    this.presenceMetrics.eventsPerMinute = recentEvents.length;

    const totalCacheOperations = this.presenceMetrics.cacheHits + this.presenceMetrics.cacheMisses;
    this.presenceMetrics.cacheHitRate = totalCacheOperations > 0 
      ? Math.round((this.presenceMetrics.cacheHits / totalCacheOperations) * 100)
      : 0;

    this.presenceMetrics.errorRate = this.presenceMetrics.eventsProcessed > 0
      ? Math.round((this.presenceMetrics.errorCount / this.presenceMetrics.eventsProcessed) * 100)
      : 0;

    if (this.processingTimes.length > 0) {
      const sum = this.processingTimes.reduce((a, b) => a + b, 0);
      this.presenceMetrics.averageProcessingTime = Math.round(sum / this.processingTimes.length);
    }
  }

  /**
   * Update API metrics calculations
   */
  private updateApiMetrics(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentRequests = this.requestTimestamps.filter(timestamp => timestamp > oneMinuteAgo);
    this.apiMetrics.requestsPerMinute = recentRequests.length;

    this.apiMetrics.successRate = this.apiMetrics.totalRequests > 0
      ? Math.round((this.apiMetrics.successfulRequests / this.apiMetrics.totalRequests) * 100)
      : 0;

    if (this.responseTimes.length > 0) {
      const sum = this.responseTimes.reduce((a, b) => a + b, 0);
      this.apiMetrics.averageResponseTime = Math.round(sum / this.responseTimes.length);
    }

    const totalServedRequests = this.apiMetrics.cacheServedRequests + this.apiMetrics.apiServedRequests;
    this.apiMetrics.cacheUtilizationRate = totalServedRequests > 0
      ? Math.round((this.apiMetrics.cacheServedRequests / totalServedRequests) * 100)
      : 0;
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(): void {
    if (!this.alertConfig.enabled) {
      return;
    }

    if (this.presenceMetrics.errorRate > this.alertConfig.errorRateThreshold) {
      this.emitAlert({
        type: 'error_rate',
        severity: this.presenceMetrics.errorRate > this.alertConfig.errorRateThreshold * 2 ? 'critical' : 'warning',
        message: `High presence event error rate: ${this.presenceMetrics.errorRate}%`,
        value: this.presenceMetrics.errorRate,
        threshold: this.alertConfig.errorRateThreshold,
        timestamp: new Date()
      });
    }

    if (this.apiMetrics.averageResponseTime > this.alertConfig.responseTimeThreshold) {
      this.emitAlert({
        type: 'response_time',
        severity: this.apiMetrics.averageResponseTime > this.alertConfig.responseTimeThreshold * 2 ? 'critical' : 'warning',
        message: `High API response time: ${this.apiMetrics.averageResponseTime}ms`,
        value: this.apiMetrics.averageResponseTime,
        threshold: this.alertConfig.responseTimeThreshold,
        timestamp: new Date()
      });
    }

    if (this.presenceMetrics.cacheHitRate < this.alertConfig.cacheHitRateThreshold && this.presenceMetrics.cacheHits + this.presenceMetrics.cacheMisses > 10) {
      this.emitAlert({
        type: 'cache_hit_rate',
        severity: this.presenceMetrics.cacheHitRate < this.alertConfig.cacheHitRateThreshold / 2 ? 'critical' : 'warning',
        message: `Low cache hit rate: ${this.presenceMetrics.cacheHitRate}%`,
        value: this.presenceMetrics.cacheHitRate,
        threshold: this.alertConfig.cacheHitRateThreshold,
        timestamp: new Date()
      });
    }

    const memoryUsagePercent = Math.round((this.systemMetrics.memoryUsage.heapUsed / this.systemMetrics.memoryUsage.heapTotal) * 100);
    if (memoryUsagePercent > this.alertConfig.memoryUsageThreshold) {
      this.emitAlert({
        type: 'memory_usage',
        severity: memoryUsagePercent > this.alertConfig.memoryUsageThreshold * 1.1 ? 'critical' : 'warning',
        message: `High memory usage: ${memoryUsagePercent}%`,
        value: memoryUsagePercent,
        threshold: this.alertConfig.memoryUsageThreshold,
        timestamp: new Date(),
        metadata: {
          heapUsed: this.systemMetrics.memoryUsage.heapUsed,
          heapTotal: this.systemMetrics.memoryUsage.heapTotal
        }
      });
    }

    if (!this.systemMetrics.discordConnected || !this.systemMetrics.cacheConnected) {
      this.emitAlert({
        type: 'system_health',
        severity: 'critical',
        message: 'Critical system components disconnected',
        value: 0,
        threshold: 1,
        timestamp: new Date(),
        metadata: {
          discordConnected: this.systemMetrics.discordConnected,
          cacheConnected: this.systemMetrics.cacheConnected,
          databaseConnected: this.systemMetrics.databaseConnected
        }
      });
    }
  }

  /**
   * Emit an alert event
   */
  private emitAlert(alert: Alert): void {
    this.emit('alert', alert);
    
    logger.warn('Alert triggered', {
      component: 'MetricsService',
      operation: 'alert',
      metadata: {
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        value: alert.value,
        threshold: alert.threshold
      }
    });
  }

  /**
   * Setup periodic metric updates and calculations
   */
  private setupPeriodicUpdates(): void {
    setInterval(() => {
      this.updatePresenceMetrics();
      this.updateApiMetrics();
      this.updateSystemMetrics({});
    }, 30000);

    this.alertCheckInterval = setInterval(() => {
      this.checkAlerts();
    }, 60000);
  }

  /**
   * Setup cleanup of old data
   */
  private setupCleanup(): void {
    this.metricsCleanupInterval = setInterval(() => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      this.eventTimestamps = this.eventTimestamps.filter(timestamp => timestamp > oneHourAgo);
      this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > oneHourAgo);

      if (this.processingTimes.length > 1000) {
        this.processingTimes = this.processingTimes.slice(-1000);
      }
      if (this.responseTimes.length > 1000) {
        this.responseTimes = this.responseTimes.slice(-1000);
      }

      logger.debug('Metrics cleanup completed', {
        component: 'MetricsService',
        operation: 'cleanup',
        metadata: {
          eventTimestamps: this.eventTimestamps.length,
          requestTimestamps: this.requestTimestamps.length,
          processingTimes: this.processingTimes.length,
          responseTimes: this.responseTimes.length
        }
      });
    }, 5 * 60 * 1000);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.metricsCleanupInterval) {
      clearInterval(this.metricsCleanupInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
    
    this.removeAllListeners();
    
    logger.info('Metrics service destroyed', {
      component: 'MetricsService',
      operation: 'destroy'
    });
  }
}