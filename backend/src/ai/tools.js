/**
 * @file tools.js
 * @description Strict Zod schemas and tool definitions for the Zipli AI Gateway.
 * All tools are read-only or propose actions (e.g. proposed cart additions) requiring
 * explicit user confirmation.
 */

const { z } = require('zod');

// 1. Tool Schemas
const searchCatalogSchema = z.object({
  query: z.string().min(1).max(100),
  category: z.string().optional(),
  maxPrice: z.number().positive().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

const getRecipeIngredientsSchema = z.object({
  dishName: z.string().min(2).max(100),
  servings: z.number().int().min(1).max(12).default(2),
  dietaryRestrictions: z.array(z.string()).optional(),
});

const findSubstitutesSchema = z.object({
  productId: z.number().int().positive(),
  allergenRestrictions: z.array(z.string()).optional(),
});

const proposeCartAdditionsSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(10).default(1),
      })
    )
    .min(1)
    .max(20),
  rationale: z.string().max(200).optional(),
});

const getStoreInventoryStatusSchema = z.object({
  productIds: z.array(z.number().int().positive()).min(1).max(50),
  storeId: z.union([z.string(), z.number()]).optional(),
});

// 2. Tool Declarations (OpenAI / Anthropic Tool Calling Compatible Format)
const AI_TOOLS = [
  {
    name: 'searchCatalog',
    description:
      'Searches quick-commerce grocery products by keyword, category, price, and availability.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Product search term (e.g. "toned milk", "brown bread", "paneer")',
        },
        category: {
          type: 'string',
          description: 'Product category ID (e.g. "dairy", "bakery", "produce")',
        },
        maxPrice: { type: 'number', description: 'Maximum price ceiling in INR' },
        limit: { type: 'integer', description: 'Maximum number of items to return (1-20)' },
      },
      required: ['query'],
    },
    schema: searchCatalogSchema,
  },
  {
    name: 'getRecipeIngredients',
    description:
      'Retrieves standard grocery ingredients and quantities needed to cook a specific meal or dish.',
    parameters: {
      type: 'object',
      properties: {
        dishName: {
          type: 'string',
          description: 'Name of the dish or meal (e.g. "Dal Tadka", "Pasta Alfredo")',
        },
        servings: { type: 'integer', description: 'Number of people/servings (1-12)' },
        dietaryRestrictions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dietary constraints (e.g. ["vegetarian", "gluten-free"])',
        },
      },
      required: ['dishName'],
    },
    schema: getRecipeIngredientsSchema,
  },
  {
    name: 'findSubstitutes',
    description: 'Discovers suitable in-stock replacement products when an item is out of stock.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'integer', description: 'The product ID of the out-of-stock item' },
        allergenRestrictions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allergen tags to avoid in substitutes',
        },
      },
      required: ['productId'],
    },
    schema: findSubstitutesSchema,
  },
  {
    name: 'proposeCartAdditions',
    description:
      'Proposes grocery items to add to the customer cart. This does NOT execute cart changes automatically; it returns proposed additions for shopper confirmation.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'integer', description: 'Product ID' },
              quantity: { type: 'integer', description: 'Units to add' },
            },
            required: ['productId'],
          },
        },
        rationale: { type: 'string', description: 'Reason for the suggested items' },
      },
      required: ['items'],
    },
    schema: proposeCartAdditionsSchema,
  },
  {
    name: 'getStoreInventoryStatus',
    description: 'Checks real-time stock levels and availability in the shopper dark store.',
    parameters: {
      type: 'object',
      properties: {
        productIds: { type: 'array', items: { type: 'integer' } },
        storeId: { type: 'string' },
      },
      required: ['productIds'],
    },
    schema: getStoreInventoryStatusSchema,
  },
];

const TOOLS_BY_NAME = new Map(AI_TOOLS.map((t) => [t.name, t]));

/**
 * Validates tool call arguments against the tool's strict Zod schema.
 *
 * @param {string} toolName
 * @param {Object} args
 * @returns {{ valid: boolean, parsedArgs?: Object, error?: string }}
 */
function validateToolCall(toolName, args) {
  const tool = TOOLS_BY_NAME.get(toolName);
  if (!tool) {
    return { valid: false, error: `Unknown tool: "${toolName}"` };
  }

  const result = tool.schema.safeParse(args);
  if (!result.success) {
    return {
      valid: false,
      error: `Invalid tool arguments for "${toolName}": ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
    };
  }

  return { valid: true, parsedArgs: result.data };
}

module.exports = {
  AI_TOOLS,
  TOOLS_BY_NAME,
  searchCatalogSchema,
  getRecipeIngredientsSchema,
  findSubstitutesSchema,
  proposeCartAdditionsSchema,
  getStoreInventoryStatusSchema,
  validateToolCall,
};
