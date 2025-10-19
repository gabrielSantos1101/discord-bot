import dotenv from 'dotenv';
import { ServiceOrchestrator } from './services/ServiceOrchestrator';
import { loadConfig } from './utils/config';
import { LogContext, logger } from './utils/logger';

dotenv.config();

export class Application {
  private orchestrator: ServiceOrchestrator;
  private config: ReturnType<typeof loadConfig>;

  constructor() {
    this.config = loadConfig();
    this.orchestrator = new ServiceOrchestrator(this.config);
    this.setupProcessHandlers();
  }

  private setupProcessHandlers(): void {
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));

    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught Exception - Application will exit', {
        component: 'Application',
        operation: 'uncaught_exception'
      }, error);
      await this.handleShutdown('uncaughtException');
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled Promise Rejection - Application will exit', {
        component: 'Application',
        operation: 'unhandled_rejection',
        metadata: {
          reason: reason instanceof Error ? reason.message : String(reason),
          promise: String(promise)
        }
      }, reason instanceof Error ? reason : new Error(String(reason)));
      await this.handleShutdown('unhandledRejection');
    });
  }

  private async handleShutdown(signal: string): Promise<void> {
    const context: LogContext = {
      component: 'Application',
      operation: 'shutdown',
      metadata: { signal }
    };

    logger.info(`Received ${signal}, initiating graceful shutdown...`, context);
    
    try {
      await this.orchestrator.shutdown();
      logger.info('Application shutdown completed successfully', context);
      process.exit(0);
    } catch (error) {
      logger.error('Error during application shutdown', context, error as Error);
      process.exit(1);
    }
  }

  public async start(): Promise<void> {
    const context: LogContext = {
      component: 'Application',
      operation: 'startup'
    };

    try {
      logger.info('Discord Bot API Application starting...', {
        ...context,
        metadata: {
          environment: this.config.environment,
          logLevel: this.config.logLevel,
          apiPort: this.config.api.port,
          cacheEnabled: this.config.cache.enabled
        }
      });

      await this.orchestrator.start();

      const apiServer = this.orchestrator.getService<any>('api-server');
      if (apiServer && typeof apiServer.setOrchestrator === 'function') {
        apiServer.setOrchestrator(this.orchestrator);
      }

      logger.info('Discord Bot API Application started successfully', {
        ...context,
        operation: 'startup_complete',
        metadata: {
          uptime: this.orchestrator.getUptime(),
          ready: this.orchestrator.isReady()
        }
      });

      const systemHealth = await this.orchestrator.getSystemHealth();
      logger.info('System health status', {
        ...context,
        operation: 'health_status',
        metadata: {
          overallStatus: systemHealth.status,
          services: systemHealth.services.map(s => ({
            name: s.name,
            status: s.status
          }))
        }
      });

    } catch (error) {
      logger.error('Failed to start Discord Bot API Application', context, error as Error);
      process.exit(1);
    }
  }

  public getOrchestrator(): ServiceOrchestrator {
    return this.orchestrator;
  }

  public getConfig(): ReturnType<typeof loadConfig> {
    return this.config;
  }
}