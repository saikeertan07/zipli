const { AnthropicProvider, LLMProvider } = require('../../src/ai/providers');

describe('Anthropic Claude LLM Provider Unit Suite (P0/P1)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('base LLMProvider throws when generateChatResponse not overridden', async () => {
    const base = new LLMProvider();
    await expect(base.generateChatResponse({})).rejects.toThrow(
      'generateChatResponse() must be implemented'
    );
  });

  test('throws AppError if apiKey is missing', async () => {
    const provider = new AnthropicProvider({ apiKey: '' });
    await expect(
      provider.generateChatResponse({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toThrow('ANTHROPIC_API_KEY is not configured');
  });

  test('calls Anthropic /messages API and parses text response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'Hello! I am Claude. How can I help with groceries?' }],
        usage: { input_tokens: 50, output_tokens: 25 },
      }),
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key-123' });
    const res = await provider.generateChatResponse({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: 'Custom prompt',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res.text).toContain('Hello! I am Claude');
    expect(res.provider).toBe('ANTHROPIC');
    expect(res.usage.input_tokens).toBe(50);
    expect(res.usage.output_tokens).toBe(25);
  });

  test('parses tool_use blocks from Anthropic response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          { type: 'text', text: 'Looking up substitutes:' },
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'findSubstitutes',
            input: { productId: 42 },
          },
        ],
        usage: { input_tokens: 80, output_tokens: 40 },
      }),
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key-123' });
    const res = await provider.generateChatResponse({
      messages: [{ role: 'user', content: 'Find substitute for product 42' }],
    });

    expect(res.toolCalls).toBeDefined();
    expect(res.toolCalls.length).toBe(1);
    expect(res.toolCalls[0].name).toBe('findSubstitutes');
    expect(res.toolCalls[0].args.productId).toBe(42);
  });

  test('handles Anthropic API errors and throws formatted error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test-key-123' });
    await expect(
      provider.generateChatResponse({ messages: [{ role: 'user', content: 'test' }] })
    ).rejects.toThrow('AI Gateway upstream error');
  });
});
