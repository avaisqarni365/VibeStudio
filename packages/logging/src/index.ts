import winston from "winston";

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "vibestudio" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

export interface LogContext {
  userId?: string;
  organizationId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  info(message: string, meta?: Record<string, unknown>) {
    logger.info(message, { ...this.context, ...meta });
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    logger.error(message, {
      ...this.context,
      ...meta,
      error: error ? { message: error.message, stack: error.stack } : undefined,
    });
  }

  warn(message: string, meta?: Record<string, unknown>) {
    logger.warn(message, { ...this.context, ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>) {
    logger.debug(message, { ...this.context, ...meta });
  }

  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }
}

export const createLogger = (context: LogContext = {}) => new Logger(context);
