/**
 * @file totp.js
 * @description Pure RFC 6238 / RFC 4226 Time-Based One-Time Password (TOTP) Implementation.
 * Zero external dependencies. Uses Node.js crypto module.
 * Supports standard Base32 encoding/decoding, HMAC-SHA1/SHA256, custom step and window drift tolerance.
 */

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer to a Base32 string (RFC 4648).
 *
 * @param {Buffer} buffer
 * @returns {string} Base32 encoded string
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Buffer (RFC 4648).
 *
 * @param {string} base32
 * @returns {Buffer}
 */
function base32Decode(base32) {
  if (typeof base32 !== 'string') {
    throw new TypeError('Base32 input must be a string');
  }

  const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically random Base32 secret for TOTP setup.
 *
 * @param {number} [byteLength=20] - Size in bytes (160 bits recommended)
 * @returns {string} Base32 secret
 */
function generateTOTPSecret(byteLength = 20) {
  const bytes = crypto.randomBytes(byteLength);
  return base32Encode(bytes);
}

/**
 * Generates an HOTP counter-based one-time password (RFC 4226).
 *
 * @param {Buffer} secretBuffer
 * @param {number|bigint} counter
 * @param {number} [digits=6]
 * @param {string} [algorithm='sha1']
 * @returns {string} OTP string
 */
function generateHOTP(secretBuffer, counter, digits = 6, algorithm = 'sha1') {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac(algorithm, secretBuffer).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = code % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Generates a TOTP code (RFC 6238).
 *
 * @param {string} secretBase32 - Base32 encoded secret
 * @param {Object} [options={}]
 * @param {number} [options.step=30] - Time step in seconds
 * @param {number} [options.digits=6] - Code length
 * @param {number} [options.timestamp] - Unix time in milliseconds (defaults to Date.now())
 * @param {string} [options.algorithm='sha1']
 * @returns {string} 6-digit OTP code
 */
function generateTOTP(secretBase32, options = {}) {
  const step = options.step || 30;
  const digits = options.digits || 6;
  const timestamp = options.timestamp !== undefined ? options.timestamp : Date.now();
  const algorithm = options.algorithm || 'sha1';

  const counter = Math.floor(timestamp / 1000 / step);
  const secretBuf = base32Decode(secretBase32);
  return generateHOTP(secretBuf, counter, digits, algorithm);
}

/**
 * Verifies a TOTP code with time-step drift tolerance (RFC 6238).
 *
 * @param {string} token - The user submitted 6-digit code
 * @param {string} secretBase32 - Base32 encoded secret
 * @param {Object} [options={}]
 * @param {number} [options.step=30] - Step size in seconds
 * @param {number} [options.window=1] - Tolerated steps before and after (1 = +-30s)
 * @param {number} [options.digits=6] - Expected digits
 * @param {number} [options.timestamp] - Time in ms
 * @param {string} [options.algorithm='sha1']
 * @returns {boolean} true if valid within time window
 */
function verifyTOTP(token, secretBase32, options = {}) {
  if (!token || typeof token !== 'string') return false;
  if (!secretBase32) return false;

  const step = options.step || 30;
  const window = options.window !== undefined ? options.window : 1;
  const digits = options.digits || 6;
  const timestamp = options.timestamp !== undefined ? options.timestamp : Date.now();
  const algorithm = options.algorithm || 'sha1';

  const formattedToken = token.trim();
  if (formattedToken.length !== digits || !/^\d+$/.test(formattedToken)) {
    return false;
  }

  let secretBuf;
  try {
    secretBuf = base32Decode(secretBase32);
  } catch (_err) {
    return false;
  }

  const currentCounter = Math.floor(timestamp / 1000 / step);
  const tokenBuf = Buffer.from(formattedToken);

  for (let delta = -window; delta <= window; delta++) {
    const expected = generateHOTP(secretBuf, currentCounter + delta, digits, algorithm);
    const expectedBuf = Buffer.from(expected);

    if (tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return true;
    }
  }

  return false;
}

/**
 * Formats an otpauth:// URL for QR code generation in authenticator apps.
 *
 * @param {Object} params
 * @param {string} params.label - e.g. user email or username
 * @param {string} params.secret - Base32 secret
 * @param {string} [params.issuer='Zipli']
 * @param {number} [params.digits=6]
 * @param {number} [params.period=30]
 * @returns {string} otpauth URI
 */
function getOTPAuthURI({ label, secret, issuer = 'Zipli', digits = 6, period = 30 }) {
  const encLabel = encodeURIComponent(label);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encIssuer}:${encLabel}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=${digits}&period=${period}`;
}

module.exports = {
  base32Encode,
  base32Decode,
  generateTOTPSecret,
  generateHOTP,
  generateTOTP,
  verifyTOTP,
  getOTPAuthURI,
};
