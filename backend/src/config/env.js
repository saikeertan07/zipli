const path = require('path');
const dotenv = require('dotenv');

// Load appropriate .env file (prioritize .env.test in test environment)
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });
if (envFile !== '.env') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}
// Fallback to .env.example for non-production environments when .env is absent
if (process.env.NODE_ENV !== 'production' && !process.env.JWT_SECRET) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.example') });
  dotenv.config({ path: path.resolve(__dirname, '../../../.env.example') });
}

class ConfigValidationError extends Error {
  constructor(errors) {
    super(`Config validation failed:\n  - ${errors.join('\n  - ')}`);
    this.name = 'ConfigValidationError';
    this.errors = errors;
  }
}

/**
 * Tiny hand-written schema validator for environment configuration.
 * Enforces security constraints and provides safe defaults.
 */
function validateEnv(rawEnv) {
  const errors = [];
  const nodeEnv = rawEnv.NODE_ENV || 'development';

  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of: development, production, test (got "${nodeEnv}")`);
  }

  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  // PORT validation
  let port = 5000;
  if (rawEnv.PORT !== undefined && rawEnv.PORT !== '') {
    const parsedPort = Number(rawEnv.PORT);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      errors.push(`PORT must be a valid port integer between 1 and 65535 (got "${rawEnv.PORT}")`);
    } else {
      port = parsedPort;
    }
  }

  // JWT_SECRET validation
  const jwtSecret = rawEnv.JWT_SECRET;
  if (!jwtSecret || typeof jwtSecret !== 'string' || !jwtSecret.trim()) {
    errors.push('JWT_SECRET is required and cannot be empty.');
  } else if (isProd) {
    if (jwtSecret.length < 32) {
      errors.push(
        `In production, JWT_SECRET must be at least 32 characters long (current length: ${jwtSecret.length}).`
      );
    }
    const lowerSecret = jwtSecret.toLowerCase();
    if (
      lowerSecret.includes('change') ||
      lowerSecret.includes('secret') ||
      lowerSecret.includes('example') ||
      lowerSecret.includes('zip')
    ) {
      errors.push(
        'In production, JWT_SECRET must not contain placeholder words: "change", "secret", "example", or "zip".'
      );
    }
  }

  // JWT_EXPIRES_IN
  const jwtExpiresIn = rawEnv.JWT_EXPIRES_IN || '7d';

  // BCRYPT_ROUNDS (default 12 in prod, 4 in test, 10 in dev)
  let bcryptRounds = isProd ? 12 : isTest ? 4 : 10;
  if (rawEnv.BCRYPT_ROUNDS !== undefined && rawEnv.BCRYPT_ROUNDS !== '') {
    const parsedRounds = Number(rawEnv.BCRYPT_ROUNDS);
    if (!Number.isInteger(parsedRounds) || parsedRounds < 4 || parsedRounds > 31) {
      errors.push(
        `BCRYPT_ROUNDS must be an integer between 4 and 31 (got "${rawEnv.BCRYPT_ROUNDS}")`
      );
    } else {
      bcryptRounds = parsedRounds;
    }
  }

  // DELIVERY_FEE
  let deliveryFee = 2;
  if (rawEnv.DELIVERY_FEE !== undefined && rawEnv.DELIVERY_FEE !== '') {
    const parsedFee = Number(rawEnv.DELIVERY_FEE);
    if (Number.isNaN(parsedFee) || parsedFee < 0) {
      errors.push(`DELIVERY_FEE must be a non-negative number (got "${rawEnv.DELIVERY_FEE}")`);
    } else {
      deliveryFee = parsedFee;
    }
  }

  // Database settings
  const databaseUrl = rawEnv.DATABASE_URL || null;
  const pgHost = rawEnv.PGHOST || 'localhost';
  let pgPort = 5432;
  if (rawEnv.PGPORT !== undefined && rawEnv.PGPORT !== '') {
    const parsedPgPort = Number(rawEnv.PGPORT);
    if (!Number.isInteger(parsedPgPort) || parsedPgPort < 1 || parsedPgPort > 65535) {
      errors.push(`PGPORT must be a valid port integer (got "${rawEnv.PGPORT}")`);
    } else {
      pgPort = parsedPgPort;
    }
  }
  const pgDatabase = rawEnv.PGDATABASE || 'zipli';
  const pgUser = rawEnv.PGUSER || 'zipli_user';
  const pgPassword = rawEnv.PGPASSWORD || (isProd ? null : 'zipli_pass');

  if (isProd) {
    if (!databaseUrl && (!pgPassword || pgPassword === 'zipli_pass')) {
      errors.push(
        'In production, database password (PGPASSWORD) or DATABASE_URL is required and must not be the default placeholder ("zipli_pass").'
      );
    }
  }

  // CORS
  const corsOrigin = rawEnv.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:5500';

  // Redis
  const redisUrl = rawEnv.REDIS_URL || null;

  // AI & LLM Settings (P0 / P1)
  const aiEnabled = rawEnv.AI_ENABLED !== 'false' && rawEnv.AI_ENABLED !== false;
  const aiProvider = rawEnv.AI_PROVIDER || null;
  const aiModel = rawEnv.AI_MODEL || 'claude-3-5-sonnet-latest';
  const aiMaxTokens = Number(rawEnv.AI_MAX_TOKENS) || 1024;
  const aiDailyTokenBudget = Number(rawEnv.AI_DAILY_TOKEN_BUDGET) || 50000;
  const anthropicApiKey = rawEnv.ANTHROPIC_API_KEY || '';
  const embeddingApiKey = rawEnv.EMBEDDING_API_KEY || '';
  const embeddingProvider = rawEnv.EMBEDDING_PROVIDER || 'local';

  // Payment Provider Settings (P0 Boot Guard)
  const paymentProvider = (rawEnv.PAYMENT_PROVIDER || '').toLowerCase();
  const razorpayKeyId = rawEnv.RAZORPAY_KEY_ID || '';
  const razorpayKeySecret = rawEnv.RAZORPAY_KEY_SECRET || '';
  const razorpayWebhookSecret = rawEnv.RAZORPAY_WEBHOOK_SECRET || '';

  if (isProd) {
    if (paymentProvider === 'fake') {
      errors.push('PAYMENT_PROVIDER cannot be "fake" in production.');
    }
    if (paymentProvider !== 'cod_only') {
      if (!razorpayKeyId) {
        errors.push('In production, RAZORPAY_KEY_ID is required unless PAYMENT_PROVIDER=cod_only.');
      }
      if (!razorpayKeySecret) {
        errors.push('In production, RAZORPAY_KEY_SECRET is required unless PAYMENT_PROVIDER=cod_only.');
      }
      if (!razorpayWebhookSecret) {
        errors.push('In production, RAZORPAY_WEBHOOK_SECRET is required unless PAYMENT_PROVIDER=cod_only.');
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return Object.freeze({
    NODE_ENV: nodeEnv,
    PORT: port,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    BCRYPT_ROUNDS: bcryptRounds,
    DELIVERY_FEE: deliveryFee,
    DATABASE_URL: databaseUrl,
    PGHOST: pgHost,
    PGPORT: pgPort,
    PGDATABASE: pgDatabase,
    PGUSER: pgUser,
    PGPASSWORD: pgPassword,
    CORS_ORIGIN: corsOrigin,
    REDIS_URL: redisUrl,
    AI_ENABLED: aiEnabled,
    AI_PROVIDER: aiProvider,
    AI_MODEL: aiModel,
    AI_MAX_TOKENS: aiMaxTokens,
    AI_DAILY_TOKEN_BUDGET: aiDailyTokenBudget,
    ANTHROPIC_API_KEY: anthropicApiKey,
    EMBEDDING_API_KEY: embeddingApiKey,
    EMBEDDING_PROVIDER: embeddingProvider,
    PAYMENT_PROVIDER: paymentProvider || (isProd ? 'razorpay' : isTest ? 'fake' : 'fake'),
    RAZORPAY_KEY_ID: razorpayKeyId,
    RAZORPAY_KEY_SECRET: razorpayKeySecret,
    RAZORPAY_WEBHOOK_SECRET: razorpayWebhookSecret,
  });
}

const env = validateEnv(process.env);

module.exports = { env, validateEnv, ConfigValidationError };
