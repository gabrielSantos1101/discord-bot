import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import winston from 'winston';
import { AppConfig } from '../utils/config';

/**
 * Error response interface
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
  };
}

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
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: this.config.api.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting middleware (100 req/min per IP)
    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: this.config.api.rateLimit, // limit each IP to 100 requests per windowMs
      message: {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
          timestamp: new Date().toISOString(),
          requestId: 'rate-limit'
        }
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    });
    this.app.use('/api', limiter);

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = this.generateRequestId();
      req.headers['x-request-id'] = requestId;
      const startTime = Date.now();
      
      this.logger.info('Incoming request', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Log response
      const originalSend = res.send;
      res.send = function(body) {
        res.locals['responseBody'] = body;
        return originalSend.call(this, body);
      };

      res.on('finish', () => {
        this.logger.info('Request completed', {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime: Date.now() - startTime
        });
      });

      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // API info endpoint
    this.app.get('/api', (_req: Request, res: Response) => {
      res.json({
        name: 'Discord Bot API',
        version: '1.0.0',
        description: 'REST API for Discord user activity monitoring and auto channel management',
        endpoints: {
          users: '/api/users/{userId}/{endpoint}',
          config: '/api/config/server/{serverId}',
          channels: '/api/channels/auto/{templateId}'
        }
      });
    });

    // User routes (implemented in task 5.2)
    const { userRoutes } = require('./routes/userRoutes');
    this.app.use('/api/users', userRoutes);

    // Configuration routes (implemented in task 5.3)
    const { configRoutes } = require('./routes/configRoutes');
    this.app.use('/api/config', configRoutes);
    this.app.use('/api/channels', configRoutes);
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      const requestId = req.headers['x-request-id'] as string || this.generateRequestId();
      res.status(404).json(this.createErrorResponse(
        'NOT_FOUND',
        `Endpoint ${req.method} ${req.originalUrl} not found`,
        requestId
      ));
    });

    // Global error handler
    this.app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || this.generateRequestId();
      
      this.logger.error('Unhandled error', {
        requestId,
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url
      });

      // Don't expose internal errors in production
      const message = this.config.environment === 'production' 
        ? 'Internal server error' 
        : error.message;

      res.status(500).json(this.createErrorResponse(
        'INTERNAL_ERROR',
        message,
        requestId,
        this.config.environment === 'development' ? error.stack : undefined
      ));
    });
  }

  /**
   * Create standardized error response
   */
  private createErrorResponse(
    code: string, 
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
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

        // Graceful shutdown
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