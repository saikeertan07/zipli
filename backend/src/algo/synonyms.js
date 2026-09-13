/**
 * @file synonyms.js
 * @description Hindi / Hinglish grocery transliteration & synonym dictionary.
 * Maps common vernacular grocery terms to standard product catalog terms.
 * Pure algorithmic lookup without external dependencies.
 */

const HINGLISH_MAP = {
  doodh: 'milk',
  dudh: 'milk',
  aloo: 'potato',
  alu: 'potato',
  chawal: 'rice',
  atta: 'flour',
  aata: 'flour',
  pyaz: 'onion',
  pyaaz: 'onion',
  tamatar: 'tomato',
  adrak: 'ginger',
  lahsun: 'garlic',
  lasun: 'garlic',
  dahi: 'curd',
  paneer: 'cottage cheese',
  haldi: 'turmeric',
  jeera: 'cumin',
  mirch: 'chili',
  mirchi: 'chili',
  ghee: 'ghee',
  dal: 'lentils',
  daal: 'lentils',
  tel: 'oil',
  cheeni: 'sugar',
  chini: 'sugar',
  namak: 'salt',
  nimbu: 'lemon',
  kela: 'banana',
  seb: 'apple',
  matar: 'peas',
  palak: 'spinach',
  dhaniya: 'coriander',
  pudina: 'mint',
  chai: 'tea',
  pani: 'water',
  paani: 'water',
  anda: 'egg',
  ande: 'eggs',
  makhan: 'butter',
  makkhan: 'butter',
  bread: 'bread',
};

/**
 * Looks up the English canonical equivalent for a Hinglish/vernacular term.
 *
 * @param {string} term - Lowercase term.
 * @returns {string|null} English synonym or null if not found.
 */
function getSynonym(term) {
  if (!term || typeof term !== 'string') return null;
  const normalized = term.trim().toLowerCase();
  return HINGLISH_MAP[normalized] || null;
}

/**
 * Expands an array of tokens by appending their canonical synonyms.
 *
 * @param {string[]} tokens - Original token array.
 * @returns {string[]} Expanded array including synonyms.
 */
function expandTokensWithSynonyms(tokens) {
  if (!Array.isArray(tokens)) return [];
  const expanded = new Set(tokens);

  for (const token of tokens) {
    const syn = getSynonym(token);
    if (syn) {
      // If synonym has multiple words (e.g. 'cottage cheese'), split them
      const synTokens = syn.split(/\s+/);
      for (const st of synTokens) {
        expanded.add(st);
      }
    }
  }

  return Array.from(expanded);
}

module.exports = {
  HINGLISH_MAP,
  getSynonym,
  expandTokensWithSynonyms,
};
