const assert = require('node:assert/strict');
const { validateEnv, ConfigValidationError } = require('../../src/config/env');

describe('Config Validation (env.js)', () => {
  const baseValidEnv = {
    NODE_ENV: 'development',
    PORT: '5000',
    JWT_SECRET: 'dev_secret_key_12345_sample_string',
    DELIVERY_FEE: '2',
  };

  it('validates a correct development config', () => {
    const config = validateEnv(baseValidEnv);
    assert.strictEqual(config.PORT, 5000);
    assert.strictEqual(config.NODE_ENV, 'development');
    assert.strictEqual(config.DELIVERY_FEE, 2);
    assert.strictEqual(config.BCRYPT_ROUNDS, 10);
  });

  it('sets test environment defaults', () => {
    const config = validateEnv({ ...baseValidEnv, NODE_ENV: 'test' });
    assert.strictEqual(config.BCRYPT_ROUNDS, 4);
  });

  it('refuses to boot in production if JWT_SECRET < 32 chars', () => {
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'too_short_jwt_secret',
        });
      },
      (err) => {
        assert(err instanceof ConfigValidationError);
        assert(err.errors.some((e) => e.includes('at least 32 characters')));
        return true;
      }
    );
  });

  it('refuses to boot in production if JWT_SECRET contains "change", "secret", "example", or "zip"', () => {
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'change_this_to_a_long_random_string_over_32_chars',
          PGPASSWORD: 'strong_prod_pass_123',
        });
      },
      (err) => {
        assert(err instanceof ConfigValidationError);
        assert(err.errors.some((e) => e.includes('placeholder words')));
        return true;
      }
    );

    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'super_secure_zipli_key_that_is_long_enough_32_chars',
          PGPASSWORD: 'strong_prod_pass_123',
        });
      },
      (err) => {
        assert(err instanceof ConfigValidationError);
        assert(err.errors.some((e) => e.includes('placeholder words')));
        return true;
      }
    );
  });

  it('refuses to boot in production if database password is default or missing', () => {
    const strongSecret = '9f8b2a3c7d6e5f4a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e';
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: strongSecret,
          PGPASSWORD: 'zipli_pass',
        });
      },
      (err) => {
        assert(err instanceof ConfigValidationError);
        assert(err.errors.some((e) => e.includes('PGPASSWORD')));
        return true;
      }
    );
  });

  it('accepts strong production JWT_SECRET and non-default PGPASSWORD and defaults rounds to 12', () => {
    const strongSecret = '9f8b2a3c7d6e5f4a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e';
    const config = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: strongSecret,
      PGPASSWORD: 'a_very_strong_unique_prod_db_password_42',
      PAYMENT_PROVIDER: 'cod_only',
    });
    assert.strictEqual(config.NODE_ENV, 'production');
    assert.strictEqual(config.BCRYPT_ROUNDS, 12);
  });

  it('ensures .env.production.example template values strictly fail the production boot guard', () => {
    const fs = require('fs');
    const path = require('path');
    const templateContent = fs.readFileSync(
      path.resolve(__dirname, '../../../.env.production.example'),
      'utf8'
    );
    const parsed = require('dotenv').parse(templateContent);
    assert.throws(
      () => {
        validateEnv(parsed);
      },
      (err) => {
        assert(err instanceof ConfigValidationError);
        assert(err.errors.some((e) => e.includes('placeholder words') || e.includes('PGPASSWORD')));
        return true;
      }
    );
  });

  it('rejects invalid PORT and negative DELIVERY_FEE', () => {
    assert.throws(
      () => {
        validateEnv({
          ...baseValidEnv,
          PORT: '99999',
          DELIVERY_FEE: '-5',
        });
      },
      (err) => {
        assert(err instanceof ConfigValidationError);
        assert(err.errors.some((e) => e.includes('PORT')));
        assert(err.errors.some((e) => e.includes('DELIVERY_FEE')));
        return true;
      }
    );
  });
});
