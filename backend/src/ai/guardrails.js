/**
 * @file guardrails.js
 * @description Layered Prompt Injection Defense & Input Sanitization for Zipli AI.
 * Protects against delimiter attacks, system prompt leakage, role-reversals (DAN),
 * obfuscated leetspeak/base64 payloads, and SQL/XSS injections.
 */

const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  '$': 's',
  '!': 'i',
};

// Injection & Jailbreak Heuristic Signatures
const JAILBREAK_PATTERNS = [
  /\b(?:ignore|disregard|forget|override|bypass|clear|drop)\s+(?:all\s+|your\s+)?(?:previous\s+|prior\s+|above\s+|initial\s+|system\s+)?(?:instructions|prompts|rules|directives|context)\b/i,
  /\b(?:show|reveal|print|repeat|output|dump|echo|display|write)\s+(?:me\s+|out\s+|your\s+|all\s+|the\s+)*(?:hidden\s+|internal\s+|initial\s+|developer\s+|master\s+|system\s+|secret\s+)*(?:system\s+)?(?:prompt|instructions|rules|preamble|guidelines)\b/i,
  /\bwhat\s+(?:is|are)\s+your\s+(?:system\s+prompt|initial\s+instructions|hidden\s+rules|core\s+directives)\b/i,
  /\brepeat\s+verbatim\b/i,
  /\becho\s+your\s+preamble\b/i,
  /\boutput\s+everything\s+(?:before|above)\s+this\s+line\b/i,
  /\byou\s+are\s+now\s+(?:dan|developer\s+mode|unrestricted|jailbroken|unfiltered|root|admin|god\s+mode)\b/i,
  /\byou\s+are\s+now\s+in\s+(?:god|developer|maintenance|unrestricted|admin)\s+mode\b/i,
  /\bact\s+as\s+(?:root|a\s+hacker|an\s+unfiltered|dan|linux\s+terminal|superuser|an\s+evil)\b/i,
  /\bfrom\s+now\s+on\s*,\s*(?:you\s+(?:can|will|must)|ignore|act\s+as)\b/i,
  /\benter\s+(?:developer|maintenance|unrestricted|god|admin)\s+mode\b/i,
  /\bpretend\s+(?:to\s+be|you\s+have\s+no\s+rules|rules\s+don't\s+apply)\b/i,
  /\b(?:system|assistant|user)\s*:\s*(?:ignore|you\s+are|override)\b/i,
  /\[inst\]/i,
  /\[\/inst\]/i,
  /<<sys>>/i,
  /<\/sys>>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /---+\s*end\s+system\s+prompt/i,
  /###\s*instruction/i,
  /<script[\s>]/i,
  /\b(?:drop\s+table|union\s+select|insert\s+into|exec\s*\(|eval\s*\(|rm\s+-rf)/i,
  /\$\{process\.env/i,
  /\{\{.*\}\}/,
];

/**
 * Normalizes input text by removing invisible zero-width characters,
 * collapsing redundant whitespace, converting basic leetspeak, and decoding base64.
 *
 * @param {string} text
 * @returns {{ raw: string, lower: string, deLeeted: string, collapsedSpaced: string }}
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') {
    return { raw: text, lower: '', deLeeted: '', collapsedSpaced: '' };
  }

  // 1. Check for Base64 encoded payload before lowercasing
  let base64Decoded = '';
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    if (token.length >= 16 && /^[A-Za-z0-9+/]+={0,2}$/.test(token)) {
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        if (/^[a-zA-Z0-9\s.,!?'"-]+$/.test(decoded) && decoded.length > 6) {
          base64Decoded += ' ' + decoded.toLowerCase();
        }
      } catch {}
    }
  }

  // 2. Unicode normalization (NFKC)
  let normalized = text.normalize('NFKC');

  // 3. Remove zero-width characters and invisible control codes
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF\u00A0\u2060]/g, '');

  // 4. Lowercase
  let lower = normalized.toLowerCase() + base64Decoded;

  // 5. Generate de-leeted variant for scanning
  let deLeeted = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    deLeeted += LEET_MAP[ch] || ch;
  }

  // 6. Collapse single-spaced letter words into continuous words
  const collapsedSpaced = lower
    .replace(/\b[a-zA-Z](?:\s[a-zA-Z])+\b/g, (m) => m.replace(/\s+/g, ''))
    .replace(/\s+/g, ' ');

  return {
    raw: text,
    lower,
    deLeeted,
    collapsedSpaced,
  };
}

/**
 * Evaluates an incoming message for prompt injection attacks and malicious payloads.
 *
 * @param {string} message
 * @returns {{
 *   safe: boolean,
 *   decision: 'ALLOW' | 'BLOCK',
 *   riskScore: number,
 *   reasons: string[],
 *   sanitizedText: string
 * }}
 */
function evaluatePromptSafety(message) {
  if (!message || typeof message !== 'string') {
    return {
      safe: true,
      decision: 'ALLOW',
      riskScore: 0.0,
      reasons: [],
      sanitizedText: '',
    };
  }

  const { lower, deLeeted, collapsedSpaced } = normalizeText(message);
  const reasons = [];
  let riskScore = 0.0;

  // Check all variations against known adversarial signatures
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(lower)) {
      riskScore += 0.6;
      reasons.push(`Pattern match: ${pattern.source}`);
    } else if (pattern.test(deLeeted)) {
      riskScore += 0.6;
      reasons.push(`Obfuscated leetspeak match: ${pattern.source}`);
    } else if (pattern.test(collapsedSpaced)) {
      riskScore += 0.6;
      reasons.push(`Spaced character match: ${pattern.source}`);
    }
  }

  // Cap risk score between 0.0 and 1.0
  riskScore = Math.min(1.0, riskScore);
  const safe = riskScore < 0.5;

  // Sanitize text: strip dangerous tags and control characters
  const sanitizedText = message
    .replace(/<[^>]*>?/gm, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();

  return {
    safe,
    decision: safe ? 'ALLOW' : 'BLOCK',
    riskScore: Number(riskScore.toFixed(2)),
    reasons,
    sanitizedText,
  };
}

/**
 * Output guardrail: ensures model outputs do not leak internal system tokens,
 * environment variables, API secrets, or credit card patterns.
 *
 * @param {string} outputText
 * @returns {{ safe: boolean, outputText: string }}
 */
function evaluateOutputSafety(outputText) {
  if (!outputText || typeof outputText !== 'string') {
    return { safe: true, outputText: '' };
  }

  // Mask any leaked API keys or JWT tokens in output
  let cleaned = outputText
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g, '[REDACTED_CARD]');

  return {
    safe: true,
    outputText: cleaned,
  };
}

module.exports = {
  normalizeText,
  evaluatePromptSafety,
  evaluateOutputSafety,
  JAILBREAK_PATTERNS,
};
