const pino = require('pino');
const { env } = require('./env');

let transport;
if (env.NODE_ENV === 'development') {
  try {
    transport = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    });
  } catch {
    // pino-pretty not installed (e.g. production image), fall back to default JSON logging
    transport = undefined;
  }
}

const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}, transport);

module.exports = logger;
