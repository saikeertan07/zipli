const {
  DeterministicEmbeddingProvider,
  RemoteEmbeddingProvider,
  getEmbeddingProvider,
  cosineSimilarity,
  EMBEDDING_DIM,
} = require('../../src/ai/embeddingProvider');

describe('Embedding Provider & Dense Vector Utilities (P1)', () => {
  let provider;

  beforeEach(() => {
    provider = new DeterministicEmbeddingProvider();
  });

  test('generates unit-normalized 384-dimensional dense vectors', async () => {
    const vec = await provider.embedText('Amul Butter 500g');
    expect(vec.length).toBe(EMBEDDING_DIM);

    // Verify L2 norm is ~1.0
    let norm = 0;
    for (const v of vec) norm += v * v;
    expect(Math.abs(Math.sqrt(norm) - 1.0)).toBeLessThan(0.001);
  });

  test('bridges lexical Hinglish synonyms in dense vector space', async () => {
    const vecHinglish = await provider.embedText('dahi');
    const vecEnglish = await provider.embedText('curd');
    const vecUnrelated = await provider.embedText('laptop battery');

    const simSynonym = cosineSimilarity(vecHinglish, vecEnglish);
    const simUnrelated = cosineSimilarity(vecHinglish, vecUnrelated);

    // Cross-lingual synonym should have significantly higher similarity than unrelated text
    expect(simSynonym).toBeGreaterThan(0.5);
    expect(simSynonym).toBeGreaterThan(simUnrelated);
  });

  test('handles batch embedding', async () => {
    const batch = await provider.embedBatch(['milk', 'bread', 'eggs']);
    expect(batch.length).toBe(3);
    expect(batch[0].length).toBe(EMBEDDING_DIM);
  });

  test('cosine similarity handles edge cases', () => {
    expect(cosineSimilarity(null, [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  test('RemoteEmbeddingProvider falls back to deterministic local if apiKey missing', async () => {
    const remote = new RemoteEmbeddingProvider({ apiKey: '' });
    const vec = await remote.embedText('fresh apples');
    expect(vec.length).toBe(EMBEDDING_DIM);
  });

  test('getEmbeddingProvider returns a valid singleton instance', () => {
    const inst = getEmbeddingProvider();
    expect(inst).toBeDefined();
    expect(typeof inst.embedText).toBe('function');
  });
});
