const { Trie, TrieNode } = require('../../src/algo/trie');

describe('Pure Prefix Tree / Trie (/algo/trie.js)', () => {
  let trie;

  beforeEach(() => {
    trie = new Trie();
  });

  it('initializes with an empty root node and zero size', () => {
    expect(trie.size()).toBe(0);
    expect(trie.root).toBeInstanceOf(TrieNode);
  });

  it('inserts and contains words', () => {
    trie.insert('milk');
    trie.insert('mango');
    trie.insert('mint');

    expect(trie.size()).toBe(3);
    expect(trie.contains('milk')).toBe(true);
    expect(trie.contains('mango')).toBe(true);
    expect(trie.contains('mint')).toBe(true);
    expect(trie.contains('mil')).toBe(false); // prefix only, not end of word
    expect(trie.contains('apple')).toBe(false);
  });

  it('checks prefix presence via hasPrefix', () => {
    trie.insert('avocado');
    expect(trie.hasPrefix('avo')).toBe(true);
    expect(trie.hasPrefix('avocado')).toBe(true);
    expect(trie.hasPrefix('app')).toBe(false);
  });

  it('provides autocomplete suggestions ordered by weight descending', () => {
    trie.insert('milk', 50);
    trie.insert('mint', 10);
    trie.insert('mineral water', 80);
    trie.insert('mango', 90);

    const suggestions = trie.suggest('m', 3);
    expect(suggestions.length).toBe(3);
    // mango (90), mineral water (80), milk (50)
    expect(suggestions[0].word).toBe('mango');
    expect(suggestions[1].word).toBe('mineral water');
    expect(suggestions[2].word).toBe('milk');
  });

  it('sorts suggestions alphabetically when weights are identical', () => {
    trie.insert('apple', 10);
    trie.insert('apricot', 10);

    const suggestions = trie.suggest('ap');
    expect(suggestions.length).toBe(2);
    expect(suggestions[0].word).toBe('apple');
    expect(suggestions[1].word).toBe('apricot');
  });

  it('handles remove on non-existent word', () => {
    expect(trie.remove('nonexistent')).toBe(false);
    trie.insert('hello');
    expect(trie.remove('hell')).toBe(false); // prefix but not end of word
    expect(trie.remove('help')).toBe(false);
  });

  it('handles invalid insert calls safely', () => {
    trie.insert(null);
    trie.insert('');
    trie.insert(12345);
    expect(trie.size()).toBe(0);
  });

  it('removes words and prunes tree branches when appropriate', () => {
    trie.insert('cat');
    trie.insert('cats');

    expect(trie.size()).toBe(2);
    expect(trie.contains('cat')).toBe(true);
    expect(trie.contains('cats')).toBe(true);

    const removed = trie.remove('cats');
    expect(removed).toBe(true);
    expect(trie.size()).toBe(1);
    expect(trie.contains('cats')).toBe(false);
    expect(trie.contains('cat')).toBe(true); // Prefix remains intact
  });

  it('handles clearing and edge-case inputs', () => {
    trie.insert('apple');
    trie.clear();
    expect(trie.size()).toBe(0);
    expect(trie.contains('apple')).toBe(false);

    expect(trie.contains(null)).toBe(false);
    expect(trie.contains('   ')).toBe(false);
    expect(trie.hasPrefix('')).toBe(false);
    expect(trie.hasPrefix('   ')).toBe(false);
    expect(trie.hasPrefix(null)).toBe(false);
    expect(trie.suggest('')).toEqual([]);
    expect(trie.suggest('   ')).toEqual([]);
    expect(trie.suggest(null)).toEqual([]);
    expect(trie.remove(null)).toBe(false);
    expect(trie.remove('   ')).toBe(false);
  });
});
