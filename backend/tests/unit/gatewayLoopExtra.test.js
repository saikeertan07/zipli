const { AIGateway } = require('../../src/ai/gateway');

describe('AI Gateway Agent Loop Comprehensive Unit Suite (P0/P1)', () => {
  describe('executeTool direct dispatch', () => {
    let gateway;

    beforeEach(() => {
      gateway = new AIGateway();
    });

    test('executes findSubstitutes tool', async () => {
      const res = await gateway.executeTool('findSubstitutes', { productId: 1 });
      expect(res.chip).toContain('Substitution');
      expect(res.safeDelimitedOutput).toContain('<verified_tool_inventory');
    });

    test('executes proposeCartAdditions tool', async () => {
      const res = await gateway.executeTool('proposeCartAdditions', {
        items: [{ productId: 1, quantity: 2 }],
        rationale: 'Daily grocery list',
      });
      expect(res.chip).toContain('Proposed Cart');
      expect(res.proposedCart.length).toBe(1);
    });

    test('executes getStoreInventoryStatus tool', async () => {
      const res = await gateway.executeTool('getStoreInventoryStatus', {
        productIds: [1, 2],
      });
      expect(res.chip).toContain('Dark Store Stock Check');
      expect(res.products).toBeDefined();
    });
  });

  describe('processChat with custom providers', () => {
    test('executes multi-step agent loop with tool_use and subsequent final answer', async () => {
      let callCount = 0;
      const mockProvider = {
        name: 'MOCK_PROVIDER',
        generateChatResponse: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              text: 'I will check substitutes for product 1.',
              toolCalls: [
                {
                  id: 'call_sub_1',
                  name: 'findSubstitutes',
                  args: { productId: 1 },
                },
              ],
              usage: { total_tokens: 120 },
            };
          }
          return {
            text: 'Here are the recommended substitutes from inventory.',
            toolCalls: [],
            usage: { total_tokens: 80 },
          };
        }),
      };

      const gateway = new AIGateway({ provider: mockProvider });
      const streamEvents = [];

      const result = await gateway.processChat({
        message: 'What can I substitute for milk?',
        onStreamEvent: (event) => streamEvents.push(event),
      });

      expect(result.response).toContain('recommended substitutes');
      expect(result.toolResults.length).toBe(1);
      expect(result.toolResults[0].tool).toBe('findSubstitutes');
      expect(streamEvents.length).toBeGreaterThan(0);
      expect(result.tokensUsed).toBe(200);
    });

    test('handles upstream Anthropic provider error by falling back to offline provider', async () => {
      const failingAnthropicProvider = {
        name: 'ANTHROPIC',
        generateChatResponse: jest.fn().mockRejectedValue(new Error('503 Service Unavailable')),
      };

      const gateway = new AIGateway({ provider: failingAnthropicProvider });
      const result = await gateway.processChat({
        message: 'Recipe for pasta',
      });

      expect(result).toBeDefined();
      expect(result.response).toBeDefined();
      expect(failingAnthropicProvider.generateChatResponse).toHaveBeenCalledTimes(1);
    });

    test('records circuit breaker success for successful Anthropic provider response', async () => {
      const successfulAnthropicProvider = {
        name: 'ANTHROPIC',
        generateChatResponse: jest.fn().mockResolvedValue({
          text: 'Direct response from Claude without tools.',
          toolCalls: [],
          usage: { total_tokens: 45 },
        }),
      };

      const gateway = new AIGateway({ provider: successfulAnthropicProvider });
      const result = await gateway.processChat({
        message: 'Hello Assistant',
      });

      expect(result.response).toContain('Direct response from Claude');
      expect(result.tokensUsed).toBe(45);
    });
  });
});
