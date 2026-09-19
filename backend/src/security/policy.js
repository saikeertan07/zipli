/**
 * @file policy.js
 * @description Central Authorization Policy Engine (SEC-AZ-01, SEC-AZ-02, SEC-AZ-03).
 * Deny by default. Evaluates can(actor, action, resource, context).
 * Explicit permissions per role; four-eyes approval required for sensitive actions.
 */

const logger = require('../utils/logger');

/**
 * Standard Permission Codes
 */
const PERMISSIONS = Object.freeze({
  // Orders
  ORDERS_CREATE: 'orders:create',
  ORDERS_READ_OWN: 'orders:read:own',
  ORDERS_CANCEL_OWN: 'orders:cancel:own',
  ORDERS_READ_ALL: 'orders:read:all',
  ORDERS_UPDATE_STATUS: 'orders:update:status',
  ORDERS_REFUND_APPROVE: 'orders:refund:approve',

  // Cart
  CART_READ_OWN: 'cart:read:own',
  CART_WRITE_OWN: 'cart:write:own',

  // Catalog & Inventory
  PRODUCTS_READ: 'products:read',
  PRODUCTS_WRITE: 'products:write',
  PRODUCTS_DELETE: 'products:delete',
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_QUARANTINE: 'inventory:quarantine',

  // Pricing
  PRICING_READ: 'pricing:read',
  PRICING_WRITE: 'pricing:write',

  // Logistics & Dispatch
  DISPATCH_READ: 'dispatch:read',
  DISPATCH_ASSIGN: 'dispatch:assign',
  DISPATCH_LOCATION_PING: 'dispatch:location:ping',

  // User Accounts
  USERS_READ_OWN: 'users:read:own',
  USERS_WRITE_OWN: 'users:write:own',
  USERS_DELETE_OWN: 'users:delete:own',
  USERS_READ_ALL: 'users:read:all',

  // Admin, Platform & Governance
  ADMIN_ACCESS: 'admin:access',
  ADMIN_METRICS: 'admin:metrics',
  SECURITY_AUDIT: 'security:audit',
  QUEUES_MANAGE: 'queues:manage',

  // Sensitive Four-Eyes Actions
  CONFIG_WRITE: 'config:write',
  FEES_WRITE: 'fees:write',
  ROLES_GRANT: 'roles:grant',
  PAYOUTS_WRITE: 'payouts:write',
});

/**
 * Set of actions requiring four-eyes principle (mandatory second approver).
 * The second approver must be a distinct authenticated user.
 */
const FOUR_EYES_ACTIONS = new Set([
  PERMISSIONS.CONFIG_WRITE,
  PERMISSIONS.FEES_WRITE,
  PERMISSIONS.ROLES_GRANT,
  PERMISSIONS.PAYOUTS_WRITE,
]);

/**
 * Explicit permission sets per role (Principle of Least Privilege).
 */
const ROLE_PERMISSIONS = {
  admin: new Set(Object.values(PERMISSIONS)),

  store_manager: new Set([
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.PRODUCTS_WRITE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_QUARANTINE,
    PERMISSIONS.ORDERS_READ_ALL,
    PERMISSIONS.ORDERS_UPDATE_STATUS,
    PERMISSIONS.DISPATCH_READ,
    PERMISSIONS.DISPATCH_ASSIGN,
    PERMISSIONS.ADMIN_ACCESS,
  ]),

  support: new Set([
    PERMISSIONS.ORDERS_READ_ALL,
    PERMISSIONS.USERS_READ_ALL,
    PERMISSIONS.ORDERS_REFUND_APPROVE,
    PERMISSIONS.ADMIN_ACCESS,
  ]),

  finance: new Set([
    PERMISSIONS.ORDERS_READ_ALL,
    PERMISSIONS.PRICING_READ,
    PERMISSIONS.ORDERS_REFUND_APPROVE,
    PERMISSIONS.PAYOUTS_WRITE,
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.ADMIN_METRICS,
  ]),

  rider: new Set([
    PERMISSIONS.DISPATCH_LOCATION_PING,
    PERMISSIONS.ORDERS_READ_OWN,
    PERMISSIONS.ORDERS_UPDATE_STATUS,
  ]),

  customer: new Set([
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.CART_READ_OWN,
    PERMISSIONS.CART_WRITE_OWN,
    PERMISSIONS.ORDERS_READ_OWN,
    PERMISSIONS.ORDERS_CANCEL_OWN,
    PERMISSIONS.USERS_READ_OWN,
    PERMISSIONS.USERS_WRITE_OWN,
    PERMISSIONS.USERS_DELETE_OWN,
  ]),
};

// Aliases
ROLE_PERMISSIONS.manager = ROLE_PERMISSIONS.store_manager;

/**
 * Validates four-eyes approval constraint.
 *
 * @param {Object} actor - The primary actor
 * @param {Object} context - Operational context containing secondApproverId
 * @returns {boolean} - true if second approver is valid and distinct from actor
 */
function validateFourEyes(actor, context = {}) {
  const secondApproverId =
    context.secondApproverId ||
    context.second_approver_id ||
    (context.req && context.req.body && (context.req.body.secondApproverId || context.req.body.second_approver_id));
  if (!secondApproverId) {
    return false;
  }
  // Admin / Staff cannot self-approve
  return Number(secondApproverId) !== Number(actor.id);
}

/**
 * Evaluates whether an actor is authorized to perform an action on a resource.
 *
 * @param {Object} actor - The user object { id, role }
 * @param {string} action - The permission string or action code
 * @param {Object|string} [resource] - Target resource instance or entity type
 * @param {Object} [context={}] - Operational context (e.g. refund amount, secondApproverId)
 * @returns {boolean} - true if permitted, false otherwise (deny by default)
 */
function can(actor, action, resource = null, context = {}) {
  // 1. Deny by default if actor or action is missing
  if (!actor || !actor.role || !action) {
    return false;
  }

  const role = String(actor.role).toLowerCase();
  const allowedSet = ROLE_PERMISSIONS[role];

  // 2. Deny if role is unknown or does not have this permission explicitly
  if (!allowedSet || !allowedSet.has(action)) {
    return false;
  }

  // 3. Four-eyes checks for sensitive actions
  if (FOUR_EYES_ACTIONS.has(action)) {
    const hasFourEyes = validateFourEyes(actor, context);
    if (!hasFourEyes) {
      logger.warn({
        message: 'Sensitive action blocked: requires distinct second approver (four-eyes)',
        actorId: actor.id,
        role,
        action,
      });
      return false;
    }
  }

  // 4. Special policy rule for refunds:
  // Refunds above INR 1,000 (100,000 paise) require four-eyes approval across all roles (including admin & support)
  if (action === PERMISSIONS.ORDERS_REFUND_APPROVE) {
    const amount = Number(
      context.amount ||
        (context.req &&
          context.req.body &&
          (context.req.body.amount ||
            (context.req.body.amountPaise ? context.req.body.amountPaise / 100 : 0))) ||
        (resource && (resource.grand_total || resource.amount)) ||
        0
    );

    if (amount > 1000) {
      const hasFourEyes = validateFourEyes(actor, context);
      if (!hasFourEyes) {
        // High-value refund denied without four-eyes second approver
        return false;
      }
    } else if (role === 'support') {
      // Support can approve <= 1000 on their own
      return true;
    }
  }

  // 5. Object-level ownership checks for Rider
  if (role === 'rider') {
    if (action === PERMISSIONS.ORDERS_READ_OWN || action === PERMISSIONS.ORDERS_UPDATE_STATUS) {
      if (!resource) return true;
      const assignedId = resource.assigned_rider_id || resource.rider_id || resource.riderId;
      return Number(assignedId) === Number(actor.id);
    }
    return true;
  }

  // 6. Object-level ownership checks for Customer
  if (role === 'customer') {
    switch (action) {
      case PERMISSIONS.PRODUCTS_READ:
      case PERMISSIONS.ORDERS_CREATE:
        return true;

      case PERMISSIONS.CART_READ_OWN:
      case PERMISSIONS.CART_WRITE_OWN:
        if (!resource) return true;
        return Number(resource.user_id || resource.userId) === Number(actor.id);

      case PERMISSIONS.ORDERS_READ_OWN:
      case PERMISSIONS.ORDERS_CANCEL_OWN:
        if (!resource) return true;
        return Number(resource.user_id || resource.userId) === Number(actor.id);

      case PERMISSIONS.USERS_READ_OWN:
      case PERMISSIONS.USERS_WRITE_OWN:
      case PERMISSIONS.USERS_DELETE_OWN:
        if (!resource) return true;
        return Number(resource.id || resource.userId || resource.user_id) === Number(actor.id);

      default:
        return false;
    }
  }

  return true;
}

module.exports = {
  PERMISSIONS,
  FOUR_EYES_ACTIONS,
  ROLE_PERMISSIONS,
  can,
};
