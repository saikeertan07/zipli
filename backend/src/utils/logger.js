/**
 * Structured JSON Logger for Zipli
 * Outputs single-line JSON log events with timestamp, severity level,
 * request IDs (when available), and arbitrary metadata.
 */

const { AsyncLocalStorage } = require('async_hooks');
const { env } = require('../config/env');

const asyncLocalStorage = new AsyncLocalStorage();

const _LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'secret',
  'keysecret',
  'webhooksecret',
  'authorization',
  'cookie',
  'cardnumber',
  'cvv',
  'apikey',
]);

const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
const PHONE_REGEX = /(?:\+?91[\s-]?)?[6-9]\d{9}\b/g;
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g;

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]')
    .replace(EMAIL_REGEX, (email) => {
      const parts = email.split('@');
      return (parts[0] ? parts[0].slice(0, 1) : '') + '***@' + parts[1];
    })
    .replace(PHONE_REGEX, '+91-XXXXX-XXXX');
}

function redactPII(val, depth = 0, seen = new WeakSet()) {
  if (depth > 6 || val === null || val === undefined) return val;
  if (typeof val === 'string') return sanitizeString(val);
  if (typeof val !== 'object') return val;

  if (seen.has(val)) return '[Circular]';
  seen.add(val);

  if (Array.isArray(val)) {
    return val.map((item) => redactPII(item, depth + 1, seen));
  }

  const out = {};
  for (const [k, v] of Object.entries(val)) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactPII(v, depth + 1, seen);
    }
  }
  return out;
}

function formatLog(level, message, meta = {}) {
  const store = asyncLocalStorage.getStore() || {};
  const cleanMessage = sanitizeString(typeof message === 'string' ? message : String(message));
  const cleanMeta = redactPII(meta) || {};
  const requestId = cleanMeta.requestId || store.requestId || undefined;

  const logObject = {
    timestamp: new Date().toISOString(),
    level,
    message: cleanMessage,
    ...(requestId ? { requestId } : {}),
    ...cleanMeta,
  };

  if (meta instanceof Error) {
    logObject.error = sanitizeString(meta.message);
    logObject.stack = meta.stack;
  } else if (meta && meta.error instanceof Error) {
    logObject.error = sanitizeString(meta.error.message);
    logObject.stack = meta.error.stack;
  }

  return JSON.stringify(logObject);
}

function shouldLog(level) {
  if (env && env.NODE_ENV === 'test' && !process.env.DEBUG) {
    // Keep test runs clean unless DEBUG is explicitly enabled
    return level === 'error';
  }
  return true;
}

const logger = {
  debug(message, meta) {
    if (shouldLog('debug')) {
      process.stdout.write(formatLog('debug', message, meta) + '\n');
    }
  },

  info(message, meta) {
    if (shouldLog('info')) {
      process.stdout.write(formatLog('info', message, meta) + '\n');
    }
  },

  warn(message, meta) {
    if (shouldLog('warn')) {
      process.stderr.write(formatLog('warn', message, meta) + '\n');
    }
  },

  error(message, meta) {
    if (shouldLog('error')) {
      process.stderr.write(formatLog('error', message, meta) + '\n');
    }
  },

  /**
   * Run a function within an AsyncLocalStorage context carrying requestId
   */
  runWithContext(context, fn) {
    return asyncLocalStorage.run(context, fn);
  },

  getStore() {
    return asyncLocalStorage.getStore();
  },

  redactPII,
  sanitizeString,
};

module.exports = logger;
