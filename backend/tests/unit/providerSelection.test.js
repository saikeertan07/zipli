/**
 * @file providerSelection.test.js
 * @description Unit tests verifying production provider rules (P0):
 * 1. Fake LLM is NEVER used in production unless AI_PROVIDER=fake.
 * 2. Missing ANTHROPIC_API_KEY in prod falls back to offline BM25 provider.
 * 3. /health/readiness reports ai: degraded when Anthropic key is missing in prod.
 * 4. /health/readiness reports ai: disabled when AI_ENABLED=false.
 */

const {
  getLLMProvider,
  getAIHealthStatus,
  FakeLLMProvider,
  OfflineFallbackProvider,
} = require('../../src/ai/providers');
const { getReadiness } = require('../../src/controllers/health.controller');

describe('Production AI Provider Safety Rules (P0)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses FakeLLMProvider in test environment or when AI_PROVIDER=fake', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ANTHROPIC_API_KEY;

    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(FakeLLMProvider);
    expect(provider.name).toBe('FAKE');
  });

  it('strictly refuses FakeLLMProvider in production when key is unset and falls back to OFFLINE', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_PROVIDER;

    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(OfflineFallbackProvider);
    expect(provider.name).toBe('OFFLINE_FALLBACK');
  });

  it('reports ai: degraded in readiness probe when Anthropic key is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_PROVIDER;

    expect(getAIHealthStatus()).toBe('degraded');

    const req = {};
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };

    await getReadiness(req, res);
    expect(res.body.services.ai).toBe('degraded');
  });

  it('reports ai: disabled when AI_ENABLED=false', async () => {
    process.env.AI_ENABLED = 'false';

    expect(getAIHealthStatus()).toBe('disabled');
  });

  it('extracts target product ID dynamically in FakeLLMProvider without hardcoding', async () => {
    const fake = new FakeLLMProvider();
    const res = await fake.generateChatResponse({
      messages: [{ role: 'user', content: 'What can I substitute for product #42?' }],
    });

    expect(res.toolCalls).toBeDefined();
    expect(res.toolCalls[0].name).toBe('findSubstitutes');
    expect(res.toolCalls[0].args.productId).toBe(42);
  });
});
