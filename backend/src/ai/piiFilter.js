/**
 * @file piiFilter.js
 * @description Outbound PII Redaction Filter for AI Gateway (P1).
 * Strips phone numbers, email addresses, payment cards, and physical addresses
 * before user prompts leave to external LLM providers (Anthropic).
 */

const logger = require('../utils/logger');

// Canonical Regex definitions for sensitive PII in quick-commerce chat
const PATTERNS = {
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  PHONE: /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g,
  CARD: /\b(?:\d{4}[ -]?){3,4}\d{1,4}\b/g,
  PINCODE: /\b[1-9][0-9]{2}\s?[0-9]{3}\b/g,
  ADDRESS_KEYWORD: /\b(?:flat(?:\s+no)?|apartment|apt|house(?:\s+no)?|street|road|layout|nagar|colony|sector|floor)\s*[:#]?[^\n,.]+/gi,
};

/**
 * Redacts outbound PII from user text.
 * @param {string} text
 * @returns {{ sanitizedText: string, hasPII: boolean, redactedTypes: string[] }}
 */
function redactOutboundPII(text) {
  if (!text || typeof text !== 'string') {
    return { sanitizedText: '', hasPII: false, redactedTypes: [] };
  }

  let sanitized = text;
  const redactedTypes = [];

  // Fresh regex instances to avoid stateful lastIndex issues with the global flag
  const filters = [
    { type: 'email', regex: new RegExp(PATTERNS.EMAIL.source, 'gi'), token: '[EMAIL_REDACTED]' },
    { type: 'phone', regex: new RegExp(PATTERNS.PHONE.source, 'g'), token: '[PHONE_REDACTED]' },
    { type: 'card', regex: new RegExp(PATTERNS.CARD.source, 'g'), token: '[CARD_REDACTED]' },
    { type: 'address', regex: new RegExp(PATTERNS.ADDRESS_KEYWORD.source, 'gi'), token: '[ADDRESS_REDACTED]' },
    { type: 'pincode', regex: new RegExp(PATTERNS.PINCODE.source, 'g'), token: '[PINCODE_REDACTED]' },
  ];

  for (const { type, regex, token } of filters) {
    if (regex.test(sanitized)) {
      regex.lastIndex = 0;
      sanitized = sanitized.replace(regex, token);
      redactedTypes.push(type);
    }
  }

  const hasPII = redactedTypes.length > 0;
  if (hasPII) {
    logger.info('Outbound PII redacted before external AI provider dispatch', {
      redactedTypes,
    });
  }

  return {
    sanitizedText: sanitized,
    hasPII,
    redactedTypes,
  };
}

module.exports = {
  redactOutboundPII,
  PATTERNS,
};
