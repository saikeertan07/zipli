/**
 * @file tokenizer.js
 * @description Pure string tokenizer for Zipli Pro search engine.
 * Strips diacritics, strips punctuation, normalizes case, removes stop-words,
 * and provides a Porter-lite inflectional stemmer for grocery search terms.
 */

// Common English stop-words that carry minimal semantic differentiation in grocery searches
const STOP_WORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  's',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  't',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
]);

/**
 * Porter-lite inflectional stemmer for grocery search terms.
 * Handles plurals, -ies, -ves, -ing, and -ed.
 *
 * @param {string} word - Lowercase single word.
 * @returns {string} Stemmed word.
 */
function lightStem(word) {
  if (typeof word !== 'string' || word.length < 4) return word || '';

  // Plurals and inflectional suffixes
  if (word.endsWith('berries')) return word.slice(0, -7) + 'berry';
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ves') && word.length > 4) return word.slice(0, -3) + 'f';
  if (word.endsWith('es') && !word.endsWith('ss') && word.length > 4) {
    if (
      word.endsWith('ches') ||
      word.endsWith('shes') ||
      word.endsWith('xes') ||
      word.endsWith('zes') ||
      word.endsWith('oes')
    ) {
      return word.slice(0, -2);
    }
  }
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    return word.slice(0, -1);
  }
  if (word.endsWith('ing') && word.length > 5) {
    const base = word.slice(0, -3);
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      return base.slice(0, -1);
    }
    return base;
  }
  if (word.endsWith('ed') && word.length > 4) {
    return word.slice(0, -2);
  }

  return word;
}

/**
 * Tokenizes arbitrary input text into clean, lowercase term tokens.
 * Strips diacritics (accents), non-alphanumeric punctuation, and stop words.
 *
 * @param {string} text - Raw input string.
 * @param {Object} [options]
 * @param {boolean} [options.keepStopWords=false] - Whether to preserve stop words.
 * @param {number} [options.minTokenLength=1] - Minimum length of tokens to retain.
 * @param {boolean} [options.stem=false] - Whether to apply light stemming.
 * @returns {string[]} Array of normalized tokens.
 */
function tokenize(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const { keepStopWords = false, minTokenLength = 1, stem = false } = options;

  // 1. Strip diacritics / accents (e.g. café -> cafe, jalapeño -> jalapeno)
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Replace punctuation & symbols with space, keep letters and digits
  const cleaned = normalized
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();

  if (!cleaned) {
    return [];
  }

  const rawTokens = cleaned.split(/\s+/);
  const result = [];

  for (const rawToken of rawTokens) {
    const token = stem ? lightStem(rawToken) : rawToken;
    if (token.length < minTokenLength) {
      continue;
    }
    if (!keepStopWords && STOP_WORDS.has(token)) {
      continue;
    }
    result.push(token);
  }

  return result;
}

module.exports = {
  STOP_WORDS,
  lightStem,
  tokenize,
};
