/**
 * @file rrf.test.js
 * @description Unit tests for Pure Reciprocal Rank Fusion (RRF) algorithm (F-031).
 */

const { reciprocalRankFusion } = require('../../src/algo/rrf');

describe('Pure Reciprocal Rank Fusion (rrf.js)', () => {
  it('handles empty and invalid inputs gracefully', () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion(null)).toEqual([]);
    expect(reciprocalRankFusion([{ items: null }])).toEqual([]);
    expect(reciprocalRankFusion([{ items: [{ id: null }] }])).toEqual([]);
  });

  it('correctly calculates RRF scores and fuses multi-modal rankings', () => {
    const bm25List = {
      name: 'bm25',
      items: [
        { id: 101, name: 'Amul Toned Milk' },
        { id: 102, name: 'Nandini GoodLife Milk' },
        { id: 103, name: 'Mother Dairy Cow Milk' },
      ],
    };

    const vectorList = {
      name: 'dense_vector',
      items: [
        { id: 102, name: 'Nandini GoodLife Milk' }, // Rank 1 in vector, Rank 2 in BM25
        { id: 104, name: 'Epigamia Greek Yogurt' }, // Rank 2 in vector only
        { id: 101, name: 'Amul Toned Milk' }, // Rank 3 in vector, Rank 1 in BM25
      ],
    };

    const fused = reciprocalRankFusion([bm25List, vectorList], { k: 60 });

    // Item 102 is rank 2 in BM25 and rank 1 in vector:
    // Score(102) = 1/(60+2) + 1/(60+1) = 1/62 + 1/61 = 0.016129 + 0.016393 = 0.032522
    // Item 101 is rank 1 in BM25 and rank 3 in vector:
    // Score(101) = 1/(60+1) + 1/(60+3) = 1/61 + 1/63 = 0.016393 + 0.015873 = 0.032266
    expect(fused.length).toBe(4);
    expect(fused[0].id).toBe(102);
    expect(fused[0].matchSources).toEqual(expect.arrayContaining(['bm25', 'dense_vector']));
    expect(fused[1].id).toBe(101);
    expect(fused[1].matchSources).toEqual(expect.arrayContaining(['bm25', 'dense_vector']));

    // Items with single source match come after multi-source matches
    expect(fused[2].id).toBe(104);
    expect(fused[2].matchSources).toEqual(['dense_vector']);
    expect(fused[3].id).toBe(103);
    expect(fused[3].matchSources).toEqual(['bm25']);
  });

  it('respects custom weights and limit options', () => {
    const listA = {
      name: 'primary',
      weight: 2.0,
      items: [{ id: 'a' }, { id: 'b' }],
    };
    const listB = {
      name: 'secondary',
      weight: 0.5,
      items: [{ id: 'b' }, { id: 'c' }],
    };

    const fused = reciprocalRankFusion([listA, listB], { limit: 2, k: 50 });
    expect(fused.length).toBe(2);
    expect(fused[0].id).toBe('b'); // Boosted by both lists
  });

  it('breaks ties deterministically by doc ID', () => {
    const list = {
      items: [{ id: 'z_item' }, { id: 'a_item' }],
    };
    // If separate lists give identical individual scores
    const list1 = { items: [{ id: 'doc_2' }] };
    const list2 = { items: [{ id: 'doc_1' }] };

    const fused = reciprocalRankFusion([list1, list2]);
    expect(fused[0].rrfScore).toBe(fused[1].rrfScore);
    expect(fused[0].id).toBe('doc_1'); // Alphabetical tie-break
    expect(fused[1].id).toBe('doc_2');
  });
});
