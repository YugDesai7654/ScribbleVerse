import pino from 'pino';
import pinoHttp from 'pino-http';

const environment = process.env.NODE_ENV || 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (environment === 'test' ? 'silent' : 'info'),
  base: {
    service: 'scribbleverse-socket-server',
    environment,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'request.headers.authorization',
      'request.headers.cookie',
      'res.headers.set-cookie',
      'response.headers.set-cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});

export const requestLogger = pinoHttp({
  logger,
  customLogLevel: (_request, response, error) => {
    if (error || response.statusCode >= 500) return 'error';
    if (response.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (request, response) =>
    `${request.method} ${request.url} completed with ${response.statusCode}`,
  customErrorMessage: (request, response) =>
    `${request.method} ${request.url} failed with ${response.statusCode}`,
});
