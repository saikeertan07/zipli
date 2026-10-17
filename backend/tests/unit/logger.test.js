const assert = require('node:assert/strict');
const logger = require('../../src/utils/logger');

describe('Structured JSON Logger', () => {
  let prevDebug;

  beforeEach(() => {
    prevDebug = process.env.DEBUG;
    process.env.DEBUG = '1';
  });

  afterEach(() => {
    if (prevDebug !== undefined) {
      process.env.DEBUG = prevDebug;
    } else {
      delete process.env.DEBUG;
    }
  });

  it('formats log message as valid JSON with timestamp and level', () => {
    let captured = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      captured += chunk;
      return true;
    };

    try {
      logger.info('Test info message', { module: 'test-runner' });
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.ok(captured.length > 0, 'Log output should not be empty');
    const parsed = JSON.parse(captured.trim());
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.message, 'Test info message');
    assert.equal(parsed.module, 'test-runner');
    assert.ok(parsed.timestamp, 'Timestamp must be present');
  });

  it('automatically attaches requestId from AsyncLocalStorage context', () => {
    let captured = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      captured += chunk;
      return true;
    };

    try {
      logger.runWithContext({ requestId: 'req-abc-123' }, () => {
        logger.info('Contextual log message');
      });
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.ok(captured.length > 0, 'Log output should not be empty');
    const parsed = JSON.parse(captured.trim());
    assert.equal(parsed.requestId, 'req-abc-123');
    assert.equal(parsed.message, 'Contextual log message');
  });

  it('serializes errors cleanly in error logs', () => {
    let captured = '';
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk) => {
      captured += chunk;
      return true;
    };

    try {
      const error = new Error('Database connection failed');
      logger.error('Operation failed', { error });
    } finally {
      process.stderr.write = originalWrite;
    }

    const parsed = JSON.parse(captured.trim());
    assert.equal(parsed.level, 'error');
    assert.equal(parsed.message, 'Operation failed');
    assert.equal(parsed.error, 'Database connection failed');
    assert.ok(parsed.stack, 'Stack trace should be included');
  });

  it('redacts sensitive PII fields (passwords, tokens, emails, phone numbers) (F-060)', () => {
    let captured = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      captured += chunk;
      return true;
    };

    try {
      logger.info('User action: contact customer@example.com on +919876543210 with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.secret', {
        password: 'SuperSecretPassword123!',
        token: 'eySecretJwtToken',
        email: 'user.private@domain.com',
        phone: '+919876543210',
        metadata: {
          nestedToken: 'token123',
          normalData: 'public_value',
        },
      });
    } finally {
      process.stdout.write = originalWrite;
    }

    const parsed = JSON.parse(captured.trim());
    assert.equal(parsed.password, '[REDACTED]');
    assert.equal(parsed.token, '[REDACTED]');
    assert.ok(!captured.includes('SuperSecretPassword123!'), 'Plain password must not appear');
    assert.ok(!captured.includes('customer@example.com'), 'Raw email must not appear');
    assert.ok(!captured.includes('9876543210'), 'Raw phone number must not appear');
    assert.ok(!captured.includes('eyJhbGciOiJIUzI1NiJ9'), 'Raw JWT token must not appear');
    assert.equal(parsed.metadata.normalData, 'public_value');
  });
});
