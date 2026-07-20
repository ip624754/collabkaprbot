import pino from 'pino';

// Pino is intentionally used as a thin wrapper over console:
// - structured logs (better Vercel readability)
// - zero UI/behavior impact
//
// IMPORTANT: never log tokens / raw ctx.api.

const env = process.env.APP_ENV || 'dev';
const level = (process.env.LOG_LEVEL || (env === 'prod' ? 'info' : 'debug')).trim();

// Redact common secret-ish fields if they ever appear in logged objects.
const redact = {
  paths: [
    'token',
    'BOT_TOKEN',
    'headers.authorization',
    'headers.cookie',
    'req.headers.authorization',
    'req.headers.cookie',
    '*.api.token',
    '*.ctx.api.token',
    'user_id',
    'from_id',
    'chat_id',
    'tg_id',
    'tgId',
    'actorTgId',
    'username',
    'text',
    'caption',
    'cb_data',
    'data',
    'payload',
    '*.user_id',
    '*.from_id',
    '*.chat_id',
    '*.tg_id',
    '*.tgId',
    '*.actorTgId',
    '*.username',
    '*.text',
    '*.caption',
    '*.cb_data',
    '*.payload'
  ],
  censor: '[REDACTED]'
};

const logger = pino({
  level,
  base: { app: 'collabkaprbot', env },
  redact,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
