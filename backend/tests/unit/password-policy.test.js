const assert = require('node:assert/strict');

describe('Password Policy Validation', () => {
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

  it('rejects passwords shorter than 8 characters', () => {
    assert.strictEqual(passwordRegex.test('Pass1'), false);
    assert.strictEqual(passwordRegex.test('P@ss12'), false);
    assert.strictEqual(passwordRegex.test('1234567'), false);
  });

  it('rejects passwords without digits', () => {
    assert.strictEqual(passwordRegex.test('PasswordOnly'), false);
    assert.strictEqual(passwordRegex.test('abcdefgh'), false);
  });

  it('rejects passwords without letters', () => {
    assert.strictEqual(passwordRegex.test('12345678'), false);
    assert.strictEqual(passwordRegex.test('123456789!@#'), false);
  });

  it('accepts valid passwords meeting all criteria', () => {
    assert.strictEqual(passwordRegex.test('Zipli2026!'), true);
    assert.strictEqual(passwordRegex.test('groceryPass1'), true);
    assert.strictEqual(passwordRegex.test('99applesInBasket'), true);
  });
});
