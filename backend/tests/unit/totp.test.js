/**
 * @file totp.test.js
 * @description Unit tests for Pure RFC 6238 TOTP Algorithm (/algo/totp.js).
 */

const {
  base32Encode,
  base32Decode,
  generateTOTPSecret,
  generateHOTP,
  generateTOTP,
  verifyTOTP,
  getOTPAuthURI,
} = require('../../src/algo/totp');

describe('Pure RFC 6238 TOTP Engine (/algo/totp.js)', () => {
  describe('Base32 Encoding & Decoding (RFC 4648)', () => {
    it('encodes and decodes ascii strings accurately', () => {
      const input = Buffer.from('Hello, World!');
      const encoded = base32Encode(input);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = base32Decode(encoded);
      expect(decoded.toString('utf8')).toBe('Hello, World!');
    });

    it('handles padding and whitespace gracefully during decode', () => {
      const input = 'JBSWY3DPEHPK3PXP===';
      const decoded = base32Decode(input);
      expect(decoded).toBeInstanceOf(Buffer);
    });

    it('throws on invalid base32 characters', () => {
      expect(() => base32Decode('INVALID_189!')).toThrow(/Invalid base32 character/);
      expect(() => base32Decode(12345)).toThrow(TypeError);
    });
  });

  describe('Secret Generation & OTPAuth URI', () => {
    it('generates random Base32 secret of specified length', () => {
      const secret = generateTOTPSecret(20);
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(32); // 20 bytes = 160 bits = 32 Base32 chars
      const defaultSecret = generateTOTPSecret();
      expect(typeof defaultSecret).toBe('string');
      expect(defaultSecret.length).toBe(32);
    });

    it('formats compliant otpauth URI for authenticator apps', () => {
      const uri = getOTPAuthURI({
        label: 'alice@example.com',
        secret: 'JBSWY3DPEHPK3PXP',
        issuer: 'Zipli Pro',
      });

      expect(uri).toContain('otpauth://totp/Zipli%20Pro:alice%40example.com');
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('issuer=Zipli%20Pro');
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');

      const defaultUri = getOTPAuthURI({
        label: 'bob@example.com',
        secret: 'JBSWY3DPEHPK3PXP',
      });
      expect(defaultUri).toContain('issuer=Zipli');
    });

    it('generates HOTP and TOTP with default options', () => {
      const buf = Buffer.from('test-secret-123456');
      const hotp = generateHOTP(buf, 0);
      expect(hotp.length).toBe(6);

      const sec = 'JBSWY3DPEHPK3PXP';
      const totpNow = generateTOTP(sec);
      expect(totpNow.length).toBe(6);
      expect(verifyTOTP(totpNow, sec)).toBe(true);
    });
  });

  describe('TOTP Generation & Verification (RFC 6238)', () => {
    const testSecret = 'JBSWY3DPEHPK3PXP'; // Standard test secret
    const fixedTime = 1000000000000; // 1,000,000,000 seconds

    it('generates a 6-digit numeric OTP code', () => {
      const code = generateTOTP(testSecret, { timestamp: fixedTime });
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it('verifies exact code match within current time window', () => {
      const code = generateTOTP(testSecret, { timestamp: fixedTime });
      const valid = verifyTOTP(code, testSecret, { timestamp: fixedTime });
      expect(valid).toBe(true);
    });

    it('tolerates clock drift within window = 1 (+-30 seconds)', () => {
      const code = generateTOTP(testSecret, { timestamp: fixedTime });

      // 25s forward (within 30s step)
      expect(verifyTOTP(code, testSecret, { timestamp: fixedTime + 25000, window: 1 })).toBe(true);
      // 25s backward
      expect(verifyTOTP(code, testSecret, { timestamp: fixedTime - 25000, window: 1 })).toBe(true);
      // 45s forward (drift +1 step -> within window=1)
      expect(verifyTOTP(code, testSecret, { timestamp: fixedTime + 45000, window: 1 })).toBe(true);
    });

    it('rejects codes outside the drift window', () => {
      const code = generateTOTP(testSecret, { timestamp: fixedTime });
      // 70s forward (exceeds window=1 which allows up to +-30s)
      expect(verifyTOTP(code, testSecret, { timestamp: fixedTime + 70000, window: 1 })).toBe(false);
    });

    it('rejects invalid or tampered codes', () => {
      expect(verifyTOTP('000000', testSecret, { timestamp: fixedTime })).toBe(false);
      expect(verifyTOTP('12345', testSecret, { timestamp: fixedTime })).toBe(false);
      expect(verifyTOTP('abcdef', testSecret, { timestamp: fixedTime })).toBe(false);
      expect(verifyTOTP(null, testSecret)).toBe(false);
      expect(verifyTOTP('', testSecret)).toBe(false);
      expect(verifyTOTP('123456', 'INVALID_BASE32_CHARACTERS_!!!', { timestamp: fixedTime })).toBe(
        false
      );
      expect(verifyTOTP('123456', null)).toBe(false);
    });

    it('supports custom digits, step, and algorithm', () => {
      const customCode = generateTOTP(testSecret, { digits: 8, step: 60, algorithm: 'sha256' });
      expect(customCode.length).toBe(8);
      expect(verifyTOTP(customCode, testSecret, { digits: 8, step: 60, algorithm: 'sha256' })).toBe(
        true
      );
    });
  });
});
