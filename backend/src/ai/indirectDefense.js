/**
 * @file indirectDefense.js
 * @description Indirect Prompt Injection Defense for Tool Results (P1).
 * Sanitizes untrusted catalog data, descriptions, and user reviews before
 * feeding them back into the LLM context.
 */

// Injection patterns to strip from database / 3rd party content
const INDIRECT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/gi,
  /disregard\s+(?:all\s+)?(?:prior|previous)\s+rules/gi,
  /system\s*:\s*(?:ignore|override|you\s+are)/gi,
  /\[\/?(?:inst|sys)\]/gi,
  /<<\/?sys>>/gi,
  /<\|(?:im_start|im_end)\|>/gi,
  /---+\s*end\s+(?:system\s+)?prompt/gi,
  /\b(?:act\s+as\s+dan|developer\s+mode|root\s+terminal|superuser)\b/gi,
  /\b(?:drop\s+table|union\s+select|insert\s+into)\b/gi,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /\b(?:eval|exec)\s*\(/gi,
  /\$\{process\.env[^}]*\}/gi,
];

/**
 * Strips dangerous injection sequences from strings.
 * @param {string} text
 * @returns {string} Sanitized text
 */
function sanitizeString(text) {
  if (typeof text !== 'string') return text;

  let cleaned = text;
  for (const pattern of INDIRECT_INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[FILTERED_INJECTION_TEXT]');
  }

  // Prevent delimiter breakouts
  cleaned = cleaned.replace(/<\/?(?:tool_data|verified_tool_inventory|context)[^>]*>/gi, '');

  return cleaned.trim();
}

/**
 * Deep-sanitizes any object, array, or primitive returned from database/tool.
 * @param {any} data
 * @returns {any} Sanitized clone
 */
function sanitizeToolOutput(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeToolOutput(item));
  }

  if (typeof data === 'object') {
    const sanitizedObj = {};
    for (const [key, val] of Object.entries(data)) {
      sanitizedObj[key] = sanitizeToolOutput(val);
    }
    return sanitizedObj;
  }

  return data;
}

/**
 * Wraps tool output into safe structural tags for LLM agent loops.
 * @param {string} toolName
 * @param {any} rawResult
 * @returns {string} XML-delimited safe tool result
 */
function wrapToolResultInSafeDelimiter(toolName, rawResult) {
  const sanitized = sanitizeToolOutput(rawResult);
  const jsonStr = JSON.stringify(sanitized, null, 2);

  return `<verified_tool_inventory tool="${toolName}">\n${jsonStr}\n</verified_tool_inventory>`;
}

module.exports = {
  sanitizeString,
  sanitizeToolOutput,
  wrapToolResultInSafeDelimiter,
  INDIRECT_INJECTION_PATTERNS,
};
