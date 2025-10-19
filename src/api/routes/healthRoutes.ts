import { Request, Response, Router } from 'express';
import { ServiceOrchestrator } from '../../services/ServiceOrchestrator';
import { generateRequestId } from '../../utils/errorHandler';
import { LogContext, logger } from '../../utils/logger';

export class HealthRoutes {
  private router: Router;
  private orchestrator?: ServiceOrchestrator;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  public setOrchestrator(orchestrator: ServiceOrchestrator): void {
    this.orchestrator = orchestrator;
  }

  private setupRoutes(): void {
    this.router.get('/', this.basicHealthCheck.bind(this));
    this.router.get('/detailed', this.detailedHealthCheck.bind(this));
    this.router.get('/ready', this.readinessCheck.bind(this));
    this.router.get('/live', this.livenessCheck.bind(this));
  }

  private async basicHealthCheck(req: Request, res: Response): Promise<void> {
    const requestId = req.headers['x-request-id'] as string || generateRequestId();
    
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: this.orchestrator?.getUptime() || process.uptime()
      };

      res.json(health);
    } catch (error) {
      logger.error('Basic health check failed', {
        component: 'HealthRoutes',
        operation: 'basic_health_check',
        requestId
      }, error as Error);
      
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  }

  private async detailedHealthCheck(req: Request, res: Response): Promise<void> {
    const requestId = req.headers['x-request-id'] as string || generateRequestId();
    const context: LogContext = {
      requestId,
      component: 'HealthRoutes',
      operation: 'detailed_health_check'
    };

    try {
      if (!this.orchestrator) {
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: 'Service orchestrator not available'
        });
        return;
      }

      const systemHealth = await this.orchestrator.getSystemHealth();
      
      const response = {
        status: systemHealth.status,
        timestamp: systemHealth.timestamp.toISOString(),
        version: '1.0.0',
        uptime: systemHealth.uptime,
        services: systemHealth.services.map(service => ({
          name: service.name,
          status: service.status,
          lastCheck: service.lastCheck?.toISOString(),
          details: service.details
        })),
        metrics: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      };

      let httpStatus = 200;
      if (systemHealth.status === 'degraded') {
        httpStatus = 200;
      } else if (systemHealth.status === 'unhealthy') {
        httpStatus = 503;
      }

      logger.debug('Detailed health check completed', {
        ...context,
        metadata: { 
          overallStatus: systemHealth.status,
          servicesCount: systemHealth.services.length
        }
      });

      res.status(httpStatus).json(response);
    } catch (error) {
      logger.error('Detailed health check failed', context, error as Error);
      
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  }

  private async readinessCheck(req: Request, res: Response): Promise<void> {
    const requestId = req.headers['x-request-id'] as string || generateRequestId();
    
    try {
      if (!this.orchestrator) {
        res.status(503).json({
          ready: false,
          reason: 'Service orchestrator not available'
        });
        return;
      }

      const isReady = this.orchestrator.isReady();
      const systemHealth = await this.orchestrator.getSystemHealth();
      
      const response = {
        ready: isReady,
        timestamp: new Date().toISOString(),
        services: {
          critical: systemHealth.services
            .filter(s => ['api-server', 'discord-client'].includes(s.name))
            .map(s => ({ name: s.name, status: s.status })),
          optional: systemHealth.services
            .filter(s => !['api-server', 'discord-client'].includes(s.name))
            .map(s => ({ name: s.name, status: s.status }))
        }
      };

      res.status(isReady ? 200 : 503).json(response);
    } catch (error) {
      logger.error('Readiness check failed', {
        component: 'HealthRoutes',
        operation: 'readiness_check',
        requestId
      }, error as Error);
      
      res.status(503).json({
        ready: false,
        reason: 'Readiness check failed'
      });
    }
  }

  private async livenessCheck(_req: Request, res: Response): Promise<void> {
    try {
      res.json({
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: this.orchestrator?.getUptime() || process.uptime()
      });
    } catch (error) {
      res.status(500).json({
        alive: false,
        error: 'Liveness check failed'
      });
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}

export const healthRoutes = new HealthRoutes();
export const healthRouter = healthRoutes.getRouter();