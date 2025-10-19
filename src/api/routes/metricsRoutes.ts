import { Request, Response, Router } from 'express';
import { MetricsService } from '../../services/MetricsService';
import { logger } from '../../utils/logger';

/**
 * Metrics routes for monitoring and dashboard endpoints
 */
export function createMetricsRoutes(metricsService: MetricsService): Router {
  const router = Router();

  /**
   * GET /api/metrics - Get comprehensive metrics dashboard
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      logger.info('Metrics dashboard requested', {
        component: 'MetricsAPI',
        operation: 'dashboard_request',
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      });

      const dashboard = metricsService.getMetricsDashboard();

      return res.json({
        success: true,
        data: dashboard
      });

    } catch (error) {
      logger.error('Metrics dashboard request failed', {
        component: 'MetricsAPI',
        operation: 'dashboard_error'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to get metrics dashboard',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/metrics/presence - Get presence-specific metrics
   */
  router.get('/presence', async (_req: Request, res: Response) => {
    try {
      const presenceMetrics = metricsService.getPresenceMetrics();

      return res.json({
        success: true,
        data: presenceMetrics
      });

    } catch (error) {
      logger.error('Presence metrics request failed', {
        component: 'MetricsAPI',
        operation: 'presence_metrics_error'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to get presence metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/metrics/api - Get API-specific metrics
   */
  router.get('/api', async (_req: Request, res: Response) => {
    try {
      const apiMetrics = metricsService.getApiMetrics();

      return res.json({
        success: true,
        data: apiMetrics
      });

    } catch (error) {
      logger.error('API metrics request failed', {
        component: 'MetricsAPI',
        operation: 'api_metrics_error'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to get API metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/metrics/system - Get system-specific metrics
   */
  router.get('/system', async (_req: Request, res: Response) => {
    try {
      const systemMetrics = metricsService.getSystemMetrics();

      return res.json({
        success: true,
        data: systemMetrics
      });

    } catch (error) {
      logger.error('System metrics request failed', {
        component: 'MetricsAPI',
        operation: 'system_metrics_error'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to get system metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/metrics/reset - Reset all metrics (admin only)
   */
  router.post('/reset', async (req: Request, res: Response) => {
    try {
      logger.info('Metrics reset requested', {
        component: 'MetricsAPI',
        operation: 'metrics_reset',
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      });

      metricsService.resetMetrics();

      return res.json({
        success: true,
        message: 'Metrics reset successfully'
      });

    } catch (error) {
      logger.error('Metrics reset failed', {
        component: 'MetricsAPI',
        operation: 'metrics_reset_error'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to reset metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * PUT /api/metrics/alerts - Update alert configuration
   */
  router.put('/alerts', async (req: Request, res: Response) => {
    try {
      const { errorRateThreshold, responseTimeThreshold, cacheHitRateThreshold, memoryUsageThreshold, enabled } = req.body;

      const alertConfig: any = {};
      if (typeof errorRateThreshold === 'number') alertConfig.errorRateThreshold = errorRateThreshold;
      if (typeof responseTimeThreshold === 'number') alertConfig.responseTimeThreshold = responseTimeThreshold;
      if (typeof cacheHitRateThreshold === 'number') alertConfig.cacheHitRateThreshold = cacheHitRateThreshold;
      if (typeof memoryUsageThreshold === 'number') alertConfig.memoryUsageThreshold = memoryUsageThreshold;
      if (typeof enabled === 'boolean') alertConfig.enabled = enabled;

      metricsService.updateAlertConfig(alertConfig);

      logger.info('Alert configuration updated', {
        component: 'MetricsAPI',
        operation: 'alert_config_update',
        metadata: {
          config: alertConfig,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      });

      return res.json({
        success: true,
        message: 'Alert configuration updated successfully',
        data: alertConfig
      });

    } catch (error) {
      logger.error('Alert configuration update failed', {
        component: 'MetricsAPI',
        operation: 'alert_config_error'
      }, error as Error);

      return res.status(500).json({
        error: 'Failed to update alert configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/metrics/health - Get health status based on metrics
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const presenceMetrics = metricsService.getPresenceMetrics();
      const apiMetrics = metricsService.getApiMetrics();
      const systemMetrics = metricsService.getSystemMetrics();

      let status = 'healthy';
      const issues: string[] = [];

      if (presenceMetrics.errorRate > 10) {
        status = 'degraded';
        issues.push(`High presence error rate: ${presenceMetrics.errorRate}%`);
      }

      if (presenceMetrics.cacheHitRate < 70 && (presenceMetrics.cacheHits + presenceMetrics.cacheMisses) > 10) {
        status = 'degraded';
        issues.push(`Low cache hit rate: ${presenceMetrics.cacheHitRate}%`);
      }

      if (apiMetrics.successRate < 95 && apiMetrics.totalRequests > 10) {
        status = 'degraded';
        issues.push(`Low API success rate: ${apiMetrics.successRate}%`);
      }

      if (apiMetrics.averageResponseTime > 3000) {
        status = 'degraded';
        issues.push(`High API response time: ${apiMetrics.averageResponseTime}ms`);
      }

      const memoryUsagePercent = Math.round((systemMetrics.memoryUsage.heapUsed / systemMetrics.memoryUsage.heapTotal) * 100);
      if (memoryUsagePercent > 90) {
        status = 'unhealthy';
        issues.push(`Critical memory usage: ${memoryUsagePercent}%`);
      } else if (memoryUsagePercent > 80) {
        status = 'degraded';
        issues.push(`High memory usage: ${memoryUsagePercent}%`);
      }

      if (!systemMetrics.discordConnected || !systemMetrics.cacheConnected) {
        status = 'unhealthy';
        issues.push('Critical system components disconnected');
      }

      return res.json({
        success: true,
        data: {
          status,
          issues,
          metrics: {
            presence: presenceMetrics,
            api: apiMetrics,
            system: systemMetrics
          },
          timestamp: new Date()
        }
      });

    } catch (error) {
      logger.error('Health check failed', {
        component: 'MetricsAPI',
        operation: 'health_check_error'
      }, error as Error);

      return res.status(500).json({
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}