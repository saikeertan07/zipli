/**
 * @file gateway.js
 * @description Production AI Gateway for Zipli Pro (Round 2 Hardening).
 * Coordinates:
 * 1. AI_ENABLED kill-switch & daily token budget defense.
 * 2. Outbound PII redaction before external model dispatch.
 * 3. Multi-turn Agent Loop (max 4 iterations): model -> tool_use -> execute -> safe delimiter -> synthesize.
 * 4. Circuit breaker protection routing to Offline Fallback upon upstream degradation.
 * 5. Indirect prompt injection defense on all database tool results.
 * 6. Server-side conversation persistence via conversationStore.
 */

const crypto = require('crypto');
const { evaluatePromptSafety, evaluateOutputSafety } = require('./guardrails');
const { getLLMProvider, offlineFallbackProvider } = require('./providers');
const { validateToolCall } = require('./tools');
const { wrapToolResultInSafeDelimiter } = require('./indirectDefense');
const { redactOutboundPII } = require('./piiFilter');
const { conversationStore } = require('./conversationStore');
const { tokenBudgetManager } = require('./tokenBudget');
const { aiCircuitBreaker } = require('./circuitBreaker');
const { hybridSearchService } = require('../services/hybridSearch.service');
const { assistiveAIService } = require('../services/assistiveAI.service');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

class AIGateway {
  constructor(options = {}) {
    this.defaultProvider = options.provider || null;
    this.maxLoopIterations = 4;
  }

  /**
   * Executes a tool by name with validated arguments.
   * Deep-sanitizes and wraps output in safe structural tags (P1 indirect injection defense).
   *
   * @param {string} toolName
   * @param {Object} args
   * @param {Object} [context={}]
   * @param {number} [context.userId]
   * @returns {Promise<{ toolResult: Object, safeDelimitedOutput: string, products: Array, proposedCart: Array, chip: string }>}
   */
  async executeTool(toolName, args, _context = {}) {
    let rawOutput = null;
    let products = [];
    let proposedCart = null;
    let chip = '';

    try {
      if (toolName === 'searchCatalog') {
        chip = `🔍 Catalog Search: "${args.query}"`;
        const sRes = await hybridSearchService.search({
          searchTerm: args.query,
          category: args.category,
          maxPrice: args.maxPrice,
          limit: args.limit || 5,
        });
        products = sRes.items;
        rawOutput = {
          query: args.query,
          count: products.length,
          items: products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            pricePaise: p.price_paise,
            stock: p.stock,
          })),
        };
      } else if (toolName === 'getRecipeIngredients') {
        chip = `🍲 Recipe Planner: ${args.dishName}`;
        const recipeResult = await assistiveAIService.recipeToCart(args.dishName, {
          servings: args.servings,
        });
        products = recipeResult.matchedItems.map((m) => ({
          id: m.productId,
          name: m.name,
          price: m.unitPrice,
          price_paise: m.unitPricePaise,
          quantity: m.quantity,
          img: m.image,
        }));
        proposedCart = recipeResult.cartProposal.items;
        rawOutput = {
          dishName: args.dishName,
          servings: args.servings,
          matchedCount: recipeResult.matchedItems.length,
          items: recipeResult.matchedItems,
          missing: recipeResult.missingIngredients,
          totalPaise: recipeResult.totalEstimatedPaise,
        };
      } else if (toolName === 'findSubstitutes') {
        chip = '🔄 Substitution Assistant';
        const subResult = await assistiveAIService.findSubstitutes(args.productId);
        products = subResult.substitutes.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price,
          price_paise: s.pricePaise,
          reason: s.reason,
          score: s.substituteScore,
        }));
        rawOutput = {
          originalProductId: args.productId,
          original: subResult.originalProduct,
          substitutesCount: subResult.substitutes.length,
          substitutes: subResult.substitutes,
        };
      } else if (toolName === 'proposeCartAdditions') {
        chip = '🛒 Proposed Cart Additions';
        proposedCart = args.items;
        rawOutput = {
          proposedItems: args.items,
          rationale: args.rationale || 'Customer requested items',
        };
      } else if (toolName === 'getStoreInventoryStatus') {
        chip = '📦 Dark Store Stock Check';
        const invResult = await assistiveAIService.getStoreInventoryStatus(
          args.productIds,
          args.storeId
        );
        rawOutput = invResult;
        products = invResult.inventory.map((i) => ({
          id: i.productId,
          name: i.name,
          stock: i.stock,
          inStock: i.inStock,
          price: i.price,
          price_paise: i.pricePaise,
        }));
      }

      const safeDelimitedOutput = wrapToolResultInSafeDelimiter(toolName, rawOutput);

      return {
        toolResult: rawOutput,
        safeDelimitedOutput,
        products,
        proposedCart,
        chip,
      };
    } catch (err) {
      logger.error('Tool execution failure', { tool: toolName, error: err.message });
      // Never leak SQL queries, internal stack traces, or schema details
      const safeDelimitedOutput = `<tool_result name="${toolName}" status="error">\nTool operation failed safely. Proceed with standard catalog recommendations.\n</tool_result>`;
      return {
        toolResult: { error: 'Tool execution failed safely' },
        safeDelimitedOutput,
        products: [],
        proposedCart: null,
        chip: `⚠️ ${toolName} Error`,
      };
    }
  }

  /**
   * Processes a user chat message through the complete production AI pipeline.
   *
   * @param {Object} params
   * @param {string} params.message
   * @param {string} [params.conversationId]
   * @param {Array<{role: string, content: string}>} [params.conversationHistory=[]]
   * @param {number} [params.userId]
   * @param {string} [params.clientIp]
   * @param {string} [params.providerName]
   * @param {Function} [params.onStreamEvent]
   * @returns {Promise<Object>}
   */
  async processChat({
    message,
    conversationId = null,
    conversationHistory = [],
    userId = null,
    clientIp = '127.0.0.1',
    providerName = null,
    onStreamEvent = null,
  }) {
    const startTime = Date.now();
    const messageId = `msg_${crypto.randomUUID()}`;

    // 0. Kill-Switch Check
    if (process.env.AI_ENABLED === 'false' || process.env.AI_ENABLED === false) {
      throw new AppError('AI Grocery Assistant is temporarily disabled for maintenance.', 503);
    }

    // 1. Token Budget Check (P0)
    const budgetId = userId ? `user:${userId}` : `ip:${clientIp}`;
    const budgetCheck = await tokenBudgetManager.checkBudget(budgetId, 150);
    if (!budgetCheck.allowed) {
      logger.warn('AI query rejected: daily token budget exceeded', {
        budgetId,
        limit: budgetCheck.limit,
      });
      throw new AppError(
        'Daily AI query allowance reached for today. Resets at midnight UTC.',
        429
      );
    }

    // 2. Input Guardrails (Direct Injection Defense)
    const safetyAssessment = evaluatePromptSafety(message);
    if (!safetyAssessment.safe) {
      logger.warn('AI Gateway: Prompt injection blocked by input guardrail', {
        riskScore: safetyAssessment.riskScore,
        reasons: safetyAssessment.reasons,
        userId,
      });

      return {
        messageId,
        response:
          'I am your friendly Zipli grocery shopping assistant. How can I help you with fresh groceries, fruits, vegetables, or recipe planning today?',
        toolChip: '🛡️ Safety Guardrail Active',
        products: [],
        provider: 'GUARDRAILS_INTERCEPT',
        guardrailBlocked: true,
        conversationId: conversationId || conversationStore.generateId(),
      };
    }

    // 3. Outbound PII Redaction before sending to external model (P1)
    const piiRedacted = redactOutboundPII(safetyAssessment.sanitizedText);
    const sanitizedUserPrompt = piiRedacted.sanitizedText;

    // 4. Conversation History Hydration (Server-side priority)
    let turns = [];
    let resolvedConvId = conversationId;
    if (resolvedConvId) {
      turns = await conversationStore.getHistory(resolvedConvId);
    }
    if (
      turns.length === 0 &&
      Array.isArray(conversationHistory) &&
      conversationHistory.length > 0
    ) {
      turns = conversationHistory.slice(-10);
    }
    if (!resolvedConvId) {
      resolvedConvId = conversationStore.generateId();
    }

    // 5. Select Provider with Circuit Breaker Protection
    let provider = this.defaultProvider || getLLMProvider(providerName);
    if (provider.name === 'ANTHROPIC' && aiCircuitBreaker.isOpen()) {
      logger.warn('Circuit breaker OPEN: bypassing Anthropic and falling back to OFFLINE provider');
      provider = offlineFallbackProvider;
    }

    const systemPrompt =
      'You are Zipli AI, an ultra-fast quick-commerce grocery shopping assistant in India. ' +
      'Help shoppers discover groceries, plan meals, and choose fresh produce. ' +
      'CRITICAL: Only mention products, prices, and stock present in verified tool results. ' +
      'Never invent products or hallucinate prices. If an item is missing or out of stock, state it clearly. ' +
      'Be helpful, concise, and accurate.';

    const messages = [...turns, { role: 'user', content: sanitizedUserPrompt }];
    const allProducts = [];
    let activeProposedCart = null;
    let finalChip = null;
    let finalSynthesizedText = '';
    const toolResults = [];
    let totalTokensUsed = 0;

    // 6. Multi-Turn Agent Loop (max 4 iterations)
    let iteration = 0;
    while (iteration < this.maxLoopIterations) {
      iteration++;

      let llmResult;
      try {
        llmResult = await provider.generateChatResponse({
          messages,
          systemPrompt,
        });
        if (provider.name === 'ANTHROPIC') {
          aiCircuitBreaker.recordSuccess();
        }
      } catch (upstreamErr) {
        logger.error('Upstream LLM provider failed, falling back to offline provider', {
          error: upstreamErr.message,
          provider: provider.name,
        });
        if (provider.name === 'ANTHROPIC') {
          aiCircuitBreaker.recordFailure(upstreamErr);
        }
        provider = offlineFallbackProvider;
        llmResult = await offlineFallbackProvider.generateChatResponse({
          messages,
          systemPrompt,
        });
      }

      if (llmResult.usage && llmResult.usage.total_tokens) {
        totalTokensUsed += llmResult.usage.total_tokens;
      }

      const hasToolCalls = Array.isArray(llmResult.toolCalls) && llmResult.toolCalls.length > 0;

      // If no tool calls requested, we have reached the synthesized answer!
      if (!hasToolCalls) {
        finalSynthesizedText = llmResult.text;
        break;
      }

      // Execute each requested tool call
      for (const call of llmResult.toolCalls) {
        const validation = validateToolCall(call.name, call.args);
        if (!validation.valid) continue;

        if (onStreamEvent) {
          onStreamEvent('tool_start', { tool: call.name, chip: `Running ${call.name}` });
        }

        const execution = await this.executeTool(call.name, validation.parsedArgs, { userId });
        finalChip = execution.chip;

        if (execution.products.length > 0) {
          allProducts.push(...execution.products);
        }
        if (execution.proposedCart) {
          activeProposedCart = execution.proposedCart;
        }

        toolResults.push({ tool: call.name, result: execution.toolResult });

        if (onStreamEvent) {
          onStreamEvent('tool_result', { tool: call.name, items: execution.products.length });
        }

        // Append assistant tool request and tool response for the next loop turn
        messages.push({
          role: 'assistant',
          content: llmResult.text || `Invoking tool ${call.name}`,
        });
        messages.push({
          role: 'user',
          content: execution.safeDelimitedOutput,
        });
      }

      // If in offline fallback or fake mode, break after one tool execution iteration
      if (provider.name === 'FAKE' || provider.name === 'OFFLINE_FALLBACK') {
        finalSynthesizedText = llmResult.text;
        break;
      }
    }

    if (!finalSynthesizedText) {
      finalSynthesizedText =
        allProducts.length > 0
          ? `I found ${allProducts.length} matching items in your local dark store.`
          : 'How else can I help with your grocery shopping today?';
    }

    // 7. Output Guardrails & Redaction
    const outputAssessment = evaluateOutputSafety(finalSynthesizedText);

    // 8. Record Token Usage Budget
    await tokenBudgetManager.recordUsage(budgetId, Math.max(totalTokensUsed, 100));

    // 9. Persist Turns in Conversation Store
    await conversationStore.appendTurns(resolvedConvId, [
      { role: 'user', content: sanitizedUserPrompt },
      { role: 'assistant', content: outputAssessment.outputText },
    ]);

    const latencyMs = Date.now() - startTime;
    const toolNames = toolResults.map((t) => t.tool);
    await conversationStore.recordMessageMetadata(messageId, {
      conversationId: resolvedConvId,
      provider: provider.name,
      latencyMs,
      tokensUsed: totalTokensUsed,
      toolNames,
    });

    return {
      messageId,
      response: outputAssessment.outputText,
      toolChip: finalChip || '💬 Grocery Assistant',
      conversationId: resolvedConvId,
      ...(toolResults.length > 0 ? { toolResults } : {}),
      products: allProducts,
      ...(activeProposedCart ? { proposedCart: activeProposedCart } : {}),
      provider: provider.name,
      guardrailBlocked: false,
      tokensUsed: totalTokensUsed,
      latencyMs,
    };
  }
}

const aiGateway = new AIGateway();

module.exports = {
  AIGateway,
  aiGateway,
};
