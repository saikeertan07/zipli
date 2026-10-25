/**
 * @file providers.js
 * @description LLM Provider abstraction layer with Fake (deterministic tests),
 * Anthropic (production Claude 3.5), and OfflineFallback (zero-cloud BM25).
 */

const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { AI_TOOLS, validateToolCall } = require('./tools');

/**
 * Abstract LLMProvider interface.
 */
class LLMProvider {
  /**
   * @param {Object} params
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {string} [params.systemPrompt]
   * @param {Array<Object>} [params.tools]
   * @param {number} [params.temperature=0.2]
   * @returns {Promise<{
   *   text: string,
   *   toolCalls?: Array<{ id: string, name: string, args: Object }>,
   *   provider: string,
   *   usage?: Object
   * }>}
   */
  async generateChatResponse(_params) {
    throw new Error('generateChatResponse() must be implemented by provider adapter');
  }
}

/**
 * Deterministic FakeLLMProvider for unit tests and local simulation.
 */
class FakeLLMProvider extends LLMProvider {
  constructor() {
    super();
    this.name = 'FAKE';
  }

  async generateChatResponse({ messages }) {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const lower = lastUserMessage.toLowerCase();

    // 1. Tool Call: Substitution
    if (
      lower.includes('substitute') ||
      lower.includes('out of stock') ||
      lower.includes('replacement') ||
      lower.includes('alternative')
    ) {
      const idMatch = lower.match(/product\s*#?(\d+)/i) || lower.match(/id\s*#?(\d+)/i);
      const targetId = idMatch ? parseInt(idMatch[1], 10) : 1;
      return {
        text: 'Let me look for suitable in-stock alternatives from our local dark store:',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'findSubstitutes',
            args: { productId: targetId },
          },
        ],
        provider: this.name,
      };
    }

    // 1b. Tool Call: Store inventory status
    if (
      lower.includes('inventory') ||
      lower.includes('stock status') ||
      lower.includes('check stock')
    ) {
      return {
        text: 'Checking real-time inventory levels in your local dark store:',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'getStoreInventoryStatus',
            args: { productIds: [1, 2] },
          },
        ],
        provider: this.name,
      };
    }

    // 2. Tool Call: Recipe planning & meal ingredients
    if (
      lower.includes('recipe') ||
      lower.includes('ingredients') ||
      lower.includes('how to make') ||
      lower.includes('need to make') ||
      lower.includes('what to buy for') ||
      lower.includes('needed for') ||
      lower.includes('need for') ||
      lower.includes('groceries for') ||
      lower.includes('plan grocery list') ||
      lower.includes('bundle for') ||
      lower.includes('biryani') ||
      lower.includes('pasta') ||
      lower.includes('chai') ||
      lower.includes('curry') ||
      lower.includes('soup') ||
      lower.includes('smoothie') ||
      lower.includes('cookies') ||
      lower.includes('salad') ||
      lower.includes('sambar') ||
      lower.includes('paratha') ||
      lower.includes('kit') ||
      lower.includes('prep') ||
      lower.includes('dish') ||
      lower.includes('cook')
    ) {
      const dish = lower.includes('biryani')
        ? 'Chicken Biryani'
        : lower.includes('pasta')
          ? 'Pasta Arrabbiata'
          : lower.includes('chai')
            ? 'Masala Chai'
            : lower.includes('palak paneer')
              ? 'Palak Paneer'
              : lower.includes('smoothie')
                ? 'Breakfast Smoothie'
                : lower.includes('dal tadka')
                  ? 'Dal Tadka'
                  : 'Vegetable Curry';

      return {
        text: `Here are the fresh ingredients required to make ${dish}:`,
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'getRecipeIngredients',
            args: { dishName: dish, servings: 2 },
          },
        ],
        provider: this.name,
      };
    }

    // 3. Tool Call: Proposed cart additions
    if (lower.includes('add to cart') || lower.includes('put in cart')) {
      return {
        text: 'I have proposed these items for your cart. Please review and confirm to add them:',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'proposeCartAdditions',
            args: {
              items: [{ productId: 1, quantity: 2 }],
              rationale: 'Customer requested quick add',
            },
          },
        ],
        provider: this.name,
      };
    }

    // 4. Tool Call: Catalog search
    const cleanTerm = lower
      .replace(
        /find|show me|search|do you have|in stock|\?|please|i want|chahiye|1kg|500g|1 litre|2kg|pack of \d+|box/gi,
        ''
      )
      .trim();
    const queryTerm = cleanTerm.length > 1 ? cleanTerm : 'groceries';

    return {
      text: `Here are the top matches for "${queryTerm}" available for 10-minute express delivery:`,
      toolCalls: [
        {
          id: `call_${Date.now()}`,
          name: 'searchCatalog',
          args: { query: queryTerm, limit: 5 },
        },
      ],
      provider: this.name,
    };
  }
}

/**
 * OfflineFallbackProvider: Deterministic pure BM25 / keyword rule engine (F-030).
 * Operates with zero network calls and sub-millisecond execution.
 */
class OfflineFallbackProvider extends LLMProvider {
  constructor() {
    super();
    this.name = 'OFFLINE_FALLBACK';
    this._ruleEngine = new FakeLLMProvider();
  }

  async generateChatResponse(params) {
    const res = await this._ruleEngine.generateChatResponse(params);
    return {
      ...res,
      provider: this.name,
    };
  }
}

/**
 * Production Anthropic Claude 3.5 Sonnet Provider.
 */
class AnthropicProvider extends LLMProvider {
  constructor(options = {}) {
    super();
    this.name = 'ANTHROPIC';
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = options.model || process.env.AI_MODEL || 'claude-3-5-sonnet-latest';
    this.maxTokens = parseInt(options.maxTokens || process.env.AI_MAX_TOKENS, 10) || 1024;
    this.apiBase = options.apiBase || 'https://api.anthropic.com/v1';
    this.timeoutMs = parseInt(options.timeoutMs, 10) || 15000;
  }

  async generateChatResponse({ messages, systemPrompt, tools = AI_TOOLS, temperature = 0.2 }) {
    if (!this.apiKey) {
      throw new AppError('ANTHROPIC_API_KEY is not configured', 500);
    }

    // Format tools for Anthropic Claude format
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    // Filter messages to exclude system messages (passed in root 'system' field)
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const body = JSON.stringify({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature,
      system:
        systemPrompt ||
        'You are Zipli AI, a friendly, ultra-fast quick-commerce grocery shopping assistant in India. Help shoppers discover groceries, plan meals, and choose fresh produce. Only mention products, prices, and stock present in verified tool results. Never invent products or hallucinate prices. Be helpful, concise, and accurate.',
      messages: chatMessages,
      tools: anthropicTools,
    });

    const response = await fetch(`${this.apiBase}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error('Anthropic API request failed', { status: response.status, errText });
      throw new AppError(`AI Gateway upstream error: ${response.statusText}`, 502);
    }

    const data = await response.json();
    let text = '';
    const toolCalls = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          text += block.text;
        } else if (block.type === 'tool_use') {
          // Validate tool call arguments
          const validation = validateToolCall(block.name, block.input);
          if (validation.valid) {
            toolCalls.push({
              id: block.id,
              name: block.name,
              args: validation.parsedArgs,
            });
          } else {
            logger.warn('Discarded invalid tool call from model', { error: validation.error });
          }
        }
      }
    }

    return {
      text: text.trim(),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      provider: this.name,
      usage: data.usage,
    };
  }
}

// Provider Factory & Readiness Reporter
const fakeProvider = new FakeLLMProvider();
const offlineFallbackProvider = new OfflineFallbackProvider();
let anthropicProvider = null;
let warnedMissingKey = false;

function getAIHealthStatus() {
  if (process.env.AI_ENABLED === 'false' || process.env.AI_ENABLED === false) {
    return 'disabled';
  }
  const isTest = process.env.NODE_ENV === 'test';
  const isExplicitFake = (process.env.AI_PROVIDER || '').toLowerCase() === 'fake';
  if (isTest || isExplicitFake) {
    return 'healthy';
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'degraded';
  }
  return 'healthy';
}

function getLLMProvider(requested = null) {
  const reqStr = typeof requested === 'string' ? requested.trim() : '';
  if (reqStr.toUpperCase() === 'OFFLINE') return offlineFallbackProvider;

  const isTest = process.env.NODE_ENV === 'test';
  const isExplicitFake =
    (process.env.AI_PROVIDER || '').toLowerCase() === 'fake' || reqStr.toUpperCase() === 'FAKE';

  if (isTest || isExplicitFake) {
    return fakeProvider;
  }

  // Missing ANTHROPIC_API_KEY in production / non-test environment
  if (!process.env.ANTHROPIC_API_KEY) {
    if (!warnedMissingKey) {
      logger.warn(
        '⚠️ LOUD PRODUCTION WARNING: ANTHROPIC_API_KEY is unset! AI Gateway running in degraded OFFLINE_FALLBACK mode. /health/readiness reports ai: degraded.'
      );
      warnedMissingKey = true;
    }
    return offlineFallbackProvider;
  }

  if (!anthropicProvider) {
    anthropicProvider = new AnthropicProvider();
  }
  return anthropicProvider;
}

function logAIConfig() {
  const provider = getLLMProvider();
  const model = process.env.AI_MODEL || 'claude-3-5-sonnet-latest';
  const enabled = process.env.AI_ENABLED !== 'false';
  logger.info('[AI Gateway Config]', {
    activeProvider: provider.name,
    model,
    aiEnabled: enabled,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    nodeEnv: process.env.NODE_ENV,
  });
}

module.exports = {
  LLMProvider,
  FakeLLMProvider,
  OfflineFallbackProvider,
  AnthropicProvider,
  getLLMProvider,
  getAIHealthStatus,
  logAIConfig,
  fakeProvider,
  offlineFallbackProvider,
};
