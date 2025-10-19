import path from 'path';
import winston from 'winston';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  guildId?: string;
  component?: string;
  operation?: string;
  metadata?: Record<string, any>;
}

class StructuredLogger {
  private logger: winston.Logger;

  constructor() {
    this.logger = this.createLogger();
  }

  private createLogger(): winston.Logger {
    const logDir = 'logs';
    
    return winston.createLogger({
      level: process.env['LOG_LEVEL'] || 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf((info) => {
          const { timestamp, level, message, ...meta } = info;
          return JSON.stringify({
            timestamp,
            level: level.toUpperCase(),
            message,
            ...meta
          });
        })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf((info) => {
              const { timestamp, level, message, requestId, component, operation, ...meta } = info;
              let logLine = `${timestamp} [${level}]`;
              
              if (component) logLine += ` [${component}]`;
              if (operation) logLine += ` [${operation}]`;
              if (requestId) logLine += ` [${requestId}]`;
              
              logLine += `: ${message}`;

              const metaKeys = Object.keys(meta);
              if (metaKeys.length > 0) {
                logLine += ` ${JSON.stringify(meta)}`;
              }
              
              return logLine;
            })
          )
        }),

        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true
        }),
        
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true
        }),

        new winston.transports.File({
          filename: path.join(logDir, 'discord-api.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format((info) => {
              if ((info as any).component === 'DiscordClient' || (info as any).component === 'DiscordBot') {
                return info;
              }
              return false;
            })()
          ),
          maxsize: 10 * 1024 * 1024,
          maxFiles: 3,
          tailable: true
        })
      ]
    });
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.logger.error(message, {
      ...context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, context);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }

  rateLimitHit(retryAfter: number, context?: LogContext): void {
    this.warn('Discord API rate limit hit', {
      ...context,
      component: 'DiscordClient',
      operation: 'rate_limit',
      metadata: {
        retryAfter,
        retryAfterMs: retryAfter * 1000
      }
    });
  }

  discordApiRequest(endpoint: string, method: string = 'GET', context?: LogContext): void {
    this.debug('Discord API request', {
      ...context,
      component: 'DiscordClient',
      operation: 'api_request',
      metadata: {
        endpoint,
        method
      }
    });
  }

  discordApiResponse(endpoint: string, status: number, responseTime: number, context?: LogContext): void {
    this.debug('Discord API response', {
      ...context,
      component: 'DiscordClient',
      operation: 'api_response',
      metadata: {
        endpoint,
        status,
        responseTime
      }
    });
  }

  connectionRecovery(service: string, attempt: number, context?: LogContext): void {
    this.info('Connection recovery attempt', {
      ...context,
      component: service,
      operation: 'connection_recovery',
      metadata: {
        attempt
      }
    });
  }

  validationError(field: string, rule: string, value: any, context?: LogContext): void {
    this.warn('Validation error', {
      ...context,
      component: 'Validator',
      operation: 'validation',
      metadata: {
        field,
        rule,
        value: typeof value === 'object' ? JSON.stringify(value) : value
      }
    });
  }

  performance(operation: string, duration: number, context?: LogContext): void {
    this.info('Performance metric', {
      ...context,
      operation: 'performance',
      metadata: {
        operation,
        duration,
        unit: 'ms'
      }
    });
  }

  getWinstonLogger(): winston.Logger {
    return this.logger;
  }
}

export const logger = new StructuredLogger();