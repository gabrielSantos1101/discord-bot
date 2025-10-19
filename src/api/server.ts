import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import winston from 'winston';
import { ErrorCode } from '../models/ErrorTypes';
import { AppConfig } from '../utils/config';
import {
  createErrorResponse as createStandardErrorResponse,
  extractErrorInfo,
  generateRequestId
} from '../utils/errorHandler';
import { LogContext, logger } from '../utils/logger';

/**
 * Express server for Discord Bot API
 */
export class ApiServer {
  private app: Application;
  private config: AppConfig;
  private logger: winston.Logger;

  constructor(config: AppConfig) {
    this.app = express();
    this.config = config;
    this.logger = this.createLogger();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Create Winston logger instance
   */
  private createLogger(): winston.Logger {
    return winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/combined.log'
        })
      ]
    });
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(helmet());

    this.app.use(cors({
      origin: this.config.api.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    this.app.use(express.json({
      limit: '1mb',
      verify: (_req, _res, buf) => {
        if (buf.length > 1024 * 1024) {
          const error = new Error('Payload too large');
          (error as any).code = ErrorCode.INVALID_REQUEST;
          throw error;
        }
      }
    }));

    this.app.use(express.urlencoded({
      extended: true,
      limit: '1mb',
      parameterLimit: 100
    }));

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string;
      const context: LogContext = {
        requestId,
        component: 'ApiServer',
        operation: 'input_sanitization'
      };

      try {
        if (req.body && typeof req.body === 'object') {
          req.body = this.sanitizeRequestData(req.body, context);
        }

        if (req.query && typeof req.query === 'object') {
          req.query = this.sanitizeRequestData(req.query, context);
        }

        if (req.params && typeof req.params === 'object') {
          req.params = this.sanitizeRequestData(req.params, context);
        }

        next();
      } catch (error) {
        logger.error('Input sanitization failed', context, error as Error);
        next(error);
      }
    });

    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: this.config.api.rateLimit,
      message: {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
          timestamp: new Date().toISOString(),
          requestId: 'rate-limit'
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = generateRequestId();
      req.headers['x-request-id'] = requestId;
      const startTime = Date.now();

      const context: LogContext = {
        requestId,
        component: 'ApiServer',
        operation: 'request'
      };

      logger.info('Incoming request', {
        ...context,
        metadata: {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          contentLength: req.get('Content-Length'),
          contentType: req.get('Content-Type')
        }
      });

      const originalSend = res.send;
      res.send = function (body) {
        res.locals['responseBody'] = body;
        return originalSend.call(this, body);
      };

      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

        const responseContext = {
          ...context,
          operation: 'response',
          metadata: {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTime,
            contentLength: res.get('Content-Length')
          }
        };

        if (logLevel === 'warn') {
          logger.warn('Request completed with error', responseContext);
        } else {
          logger.info('Request completed successfully', responseContext);
        }

        if (responseTime > 5000) {
          logger.performance('slow_api_request', responseTime, {
            ...context,
            metadata: {
              threshold: 5000,
              method: req.method,
              url: req.url
            }
          });
        }
      });

      next();
    });
  }

  /**
   * Setup API routes with enhanced health checks
   */
  private setupRoutes(): void {
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    this.app.get('/health/detailed', async (req: Request, res: Response) => {
      const requestId = req.headers['x-request-id'] as string;
      const context: LogContext = {
        requestId,
        component: 'ApiServer',
        operation: 'health_check'
      };

      try {
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          services: {
            api: { status: 'healthy' },
            discord: { status: 'unknown' } as any,
            cache: { status: 'unknown' } as any,
            database: { status: 'unknown' } as any
          },
          metrics: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
          }
        };

        try {
          const { DiscordClientFactory } = require('../services/DiscordClientFactory');
          const discordClient = DiscordClientFactory.getInstance();
          if (discordClient && typeof discordClient.healthCheck === 'function') {
            const discordHealth = await discordClient.healthCheck();
            health.services.discord = {
              status: discordHealth.healthy ? 'healthy' : 'unhealthy',
              details: discordHealth
            };
          }
        } catch (error) {
          health.services.discord = { status: 'error', error: (error as Error).message };
        }

        try {
          const { CacheServiceFactory } = require('../services/CacheServiceFactory');
          const cacheService = await CacheServiceFactory.create();
          health.services.cache = {
            status: cacheService.isAvailable() ? 'healthy' : 'unavailable'
          };
        } catch (error) {
          health.services.cache = { status: 'error', error: (error as Error).message };
        }

        const serviceStatuses = Object.values(health.services).map(s => s.status);
        const hasUnhealthy = serviceStatuses.includes('unhealthy') || serviceStatuses.includes('error');

        if (hasUnhealthy) {
          health.status = 'degraded';
          res.status(503);
        }

        logger.debug('Health check completed', {
          ...context,
          metadata: { overallStatus: health.status }
        });

        res.json(health);
      } catch (error) {
        logger.error('Health check failed', context, error as Error);
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: 'Health check failed'
        });
      }
    });

    this.app.get('/api', (_req: Request, res: Response) => {
      res.json({
        name: 'Discord Bot API',
        version: '1.0.0',
        description: 'REST API for Discord user activity monitoring and auto channel management',
        endpoints: {
          users: '/api/users/{userId}/{endpoint}',
          config: '/api/config/server/{serverId}',
          channels: '/api/channels/auto/{templateId}'
        },
        documentation: {
          health: '/health',
          detailedHealth: '/health/detailed',
          metrics: '/metrics'
        }
      });
    });

    this.app.get('/metrics', (req: Request, res: Response) => {
      const requestId = req.headers['x-request-id'] as string;
      const context: LogContext = {
        requestId,
        component: 'ApiServer',
        operation: 'metrics'
      };

      try {
        const metrics = {
          timestamp: new Date().toISOString(),
          process: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
          },
          nodejs: {
            version: process.version,
            platform: process.platform,
            arch: process.arch
          }
        };

        logger.debug('Metrics requested', context);
        res.json(metrics);
      } catch (error) {
        logger.error('Failed to generate metrics', context, error as Error);
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });

    const { userRoutes } = require('./routes/userRoutes');
    this.app.use('/api/users', userRoutes);

    const { configRoutes } = require('./routes/configRoutes');
    this.app.use('/api/config', configRoutes);
    this.app.use('/api/channels', configRoutes);
  }

  /**
   * Setup comprehensive error handling middleware
   */
  private setupErrorHandling(): void {
    this.app.use('*', (req: Request, res: Response) => {
      const requestId = req.headers['x-request-id'] as string || generateRequestId();
      const context: LogContext = {
        requestId,
        component: 'ApiServer',
        operation: 'not_found'
      };

      logger.warn('Endpoint not found', {
        ...context,
        metadata: {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip
        }
      });

      res.status(404).json(createStandardErrorResponse(
        ErrorCode.UNKNOWN_ERROR,
        `Endpoint ${req.method} ${req.originalUrl} not found`,
        requestId
      ));
    });

    this.app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || generateRequestId();
      const context: LogContext = {
        requestId,
        component: 'ApiServer',
        operation: 'error_handler'
      };

      const errorInfo = extractErrorInfo(error);

      let statusCode = 500;
      switch (errorInfo.code) {
        case ErrorCode.USER_NOT_FOUND:
        case ErrorCode.CHANNEL_NOT_FOUND:
          statusCode = 404;
          break;
        case ErrorCode.INVALID_REQUEST:
        case ErrorCode.MISSING_REQUIRED_FIELD:
        case ErrorCode.INVALID_FIELD_VALUE:
          statusCode = 400;
          break;
        case ErrorCode.UNAUTHORIZED_ACCESS:
          statusCode = 401;
          break;
        case ErrorCode.INSUFFICIENT_PERMISSIONS:
        case ErrorCode.FORBIDDEN_OPERATION:
          statusCode = 403;
          break;
        case ErrorCode.RATE_LIMIT_EXCEEDED:
        case ErrorCode.DISCORD_RATE_LIMITED:
          statusCode = 429;
          break;
        case ErrorCode.SERVICE_UNAVAILABLE:
        case ErrorCode.CACHE_UNAVAILABLE:
        case ErrorCode.DATABASE_ERROR:
          statusCode = 503;
          break;
        default:
          statusCode = 500;
      }

      const logLevel = statusCode >= 500 ? 'error' : 'warn';
      const logMessage = `HTTP ${statusCode}: ${errorInfo.message}`;

      if (logLevel === 'error') {
        logger.error(logMessage, {
          ...context,
          metadata: {
            statusCode,
            errorCode: errorInfo.code,
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }
        }, error);
      } else {
        logger.warn(logMessage, {
          ...context,
          metadata: {
            statusCode,
            errorCode: errorInfo.code,
            method: req.method,
            url: req.url,
            ip: req.ip
          }
        });
      }

      const responseError = createStandardErrorResponse(
        errorInfo.code,
        errorInfo.message,
        requestId,
        (this.config.environment === 'development' || statusCode < 500)
          ? errorInfo.details
          : undefined
      );

      if (statusCode === 429 && errorInfo.details?.retryAfter) {
        res.set('Retry-After', errorInfo.details.retryAfter.toString());
      }

      res.status(statusCode).json(responseError);
    });
  }



  /**
   * Sanitize request data to prevent injection attacks
   */
  private sanitizeRequestData(data: any, context?: LogContext): any {
    if (typeof data === 'string') {
      const sanitized = data
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
        .trim()
        .substring(0, 1000);

      if (sanitized !== data) {
        logger.debug('String sanitized', {
          ...context,
          metadata: {
            originalLength: data.length,
            sanitizedLength: sanitized.length
          }
        });
      }

      return sanitized;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeRequestData(item, context));
    }

    if (data && typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeRequestData(value, context);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = this.app.listen(this.config.api.port, () => {
          this.logger.info(`API server started on port ${this.config.api.port}`, {
            port: this.config.api.port,
            environment: this.config.environment,
            rateLimit: this.config.api.rateLimit
          });
          resolve();
        });

        server.on('error', (error) => {
          this.logger.error('Server startup error', { error: error.message });
          reject(error);
        });

        process.on('SIGTERM', () => {
          this.logger.info('SIGTERM received, shutting down gracefully');
          server.close(() => {
            this.logger.info('Server closed');
            process.exit(0);
          });
        });

        process.on('SIGINT', () => {
          this.logger.info('SIGINT received, shutting down gracefully');
          server.close(() => {
            this.logger.info('Server closed');
            process.exit(0);
          });
        });

      } catch (error) {
        this.logger.error('Failed to start server', { error });
        reject(error);
      }
    });
  }

  /**
   * Set database service for use in routes
   */
  public setDatabaseService(databaseService: any): void {
    this.app.locals['databaseService'] = databaseService;
  }

  /**
   * Set bot service for use in routes
   */
  public setBotService(botService: any): void {
    this.app.locals['botService'] = botService;
  }

  /**
   * Get Express app instance (for testing)
   */
  public getApp(): Application {
    return this.app;
  }
}