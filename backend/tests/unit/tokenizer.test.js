const { tokenize, STOP_WORDS } = require('../../src/algo/tokenizer');

describe('Pure String Tokenizer (/algo/tokenizer.js)', () => {
  it('tokenizes standard English sentences into lowercase tokens', () => {
    const tokens = tokenize('Fresh Organic Farm Milk');
    expect(tokens).toEqual(['fresh', 'organic', 'farm', 'milk']);
  });

  it('strips punctuation, special symbols, and extra whitespace', () => {
    const tokens = tokenize('  Avocado (Pack of 2), 100% Organic!! -- Special Price: ₹180  ');
    // Note: 'of' is a stop-word and is removed by default
    expect(tokens).toEqual(['avocado', 'pack', '2', '100', 'organic', 'special', 'price', '180']);
  });

  it('filters stop-words by default', () => {
    const tokens = tokenize('This is a bottle of milk and some honey for you');
    expect(tokens).toEqual(['bottle', 'milk', 'honey']);
  });

  it('preserves stop-words when keepStopWords is true', () => {
    const tokens = tokenize('this is a test', { keepStopWords: true });
    expect(tokens).toEqual(['this', 'is', 'a', 'test']);
  });

  it('filters out tokens shorter than minTokenLength', () => {
    const tokens = tokenize('a 12 b 123 c 1234', { minTokenLength: 3, keepStopWords: true });
    expect(tokens).toEqual(['123', '1234']);
  });

  it('handles null, undefined, non-string, or empty input safely', () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize('')).toEqual([]);
    expect(tokenize(12345)).toEqual([]);
    expect(tokenize('   !@#$%^&*()   ')).toEqual([]);
  });

  it('exposes STOP_WORDS set containing standard stopwords', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('and')).toBe(true);
    expect(STOP_WORDS.has('milk')).toBe(false);
  });
});
