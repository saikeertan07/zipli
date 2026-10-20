const { HINGLISH_MAP, getSynonym, expandTokensWithSynonyms } = require('../../src/algo/synonyms');

describe('Hindi/Hinglish Transliteration & Synonyms (/algo/synonyms.js)', () => {
  it('maps common Hindi/Hinglish grocery terms to English catalog equivalents', () => {
    expect(getSynonym('doodh')).toBe('milk');
    expect(getSynonym('aloo')).toBe('potato');
    expect(getSynonym('chawal')).toBe('rice');
    expect(getSynonym('atta')).toBe('flour');
    expect(getSynonym('pyaz')).toBe('onion');
    expect(getSynonym('tamatar')).toBe('tomato');
    expect(getSynonym('adrak')).toBe('ginger');
    expect(getSynonym('dahi')).toBe('curd');
    expect(getSynonym('tel')).toBe('oil');
    expect(getSynonym('namak')).toBe('salt');
  });

  it('handles casing, whitespace, and non-existent synonyms safely', () => {
    expect(getSynonym('  DOODH  ')).toBe('milk');
    expect(getSynonym('nonexistentterm')).toBeNull();
    expect(getSynonym(null)).toBeNull();
    expect(getSynonym('')).toBeNull();
    expect(getSynonym(123)).toBeNull();
  });

  it('expands tokens with synonyms into query tokens', () => {
    const original = ['doodh', 'fresh'];
    const expanded = expandTokensWithSynonyms(original);

    expect(expanded).toContain('doodh');
    expect(expanded).toContain('fresh');
    expect(expanded).toContain('milk');
  });

  it('splits multi-word synonyms and handles empty arrays', () => {
    const paneerExpanded = expandTokensWithSynonyms(['paneer']);
    expect(paneerExpanded).toContain('cottage');
    expect(paneerExpanded).toContain('cheese');

    expect(expandTokensWithSynonyms([])).toEqual([]);
    expect(expandTokensWithSynonyms(null)).toEqual([]);
  });

  it('exposes HINGLISH_MAP dictionary', () => {
    expect(Object.keys(HINGLISH_MAP).length).toBeGreaterThan(20);
  });
});
