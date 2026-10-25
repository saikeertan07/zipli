/**
 * @file policy.test.js
 * @description Unit test matrix for the Central Policy Engine (SEC-AZ-01, SEC-AZ-02, SEC-AZ-03).
 */

const { can, PERMISSIONS } = require('../../src/security/policy');

describe('Central Authorization Policy Engine (SEC-AZ-01, SEC-AZ-02, SEC-AZ-03)', () => {
  describe('Deny by Default', () => {
    it('denies access when actor is null or undefined', () => {
      expect(can(null, PERMISSIONS.PRODUCTS_READ)).toBe(false);
      expect(can(undefined, PERMISSIONS.ORDERS_READ_ALL)).toBe(false);
    });

    it('denies access when actor role is missing or invalid', () => {
      expect(can({}, PERMISSIONS.PRODUCTS_READ)).toBe(false);
      expect(can({ id: 1, role: 'hacker' }, PERMISSIONS.PRODUCTS_READ)).toBe(false);
    });

    it('denies access when action is missing or unrecognized', () => {
      expect(can({ id: 1, role: 'customer' }, '')).toBe(false);
      expect(can({ id: 1, role: 'customer' }, 'unknown:action')).toBe(false);
    });
  });

  describe('Admin Role Matrix', () => {
    const admin = { id: 1, role: 'admin' };

    it('grants explicit access to defined system actions', () => {
      expect(can(admin, PERMISSIONS.ORDERS_READ_ALL)).toBe(true);
      expect(can(admin, PERMISSIONS.PRODUCTS_WRITE)).toBe(true);
      expect(can(admin, PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
      expect(can(admin, PERMISSIONS.SECURITY_AUDIT)).toBe(true);
      expect(can(admin, PERMISSIONS.ADMIN_ACCESS)).toBe(true);
    });

    it('denies arbitrary or undefined permissions (no wildcard true)', () => {
      expect(can(admin, 'any:arbitrary:permission')).toBe(false);
      expect(can(admin, 'system:root:override')).toBe(false);
    });

    it('enforces four-eyes approval on sensitive actions and blocks self-approval', () => {
      // Sensitive actions without second approver: DENIED
      expect(can(admin, PERMISSIONS.CONFIG_WRITE)).toBe(false);
      expect(can(admin, PERMISSIONS.FEES_WRITE)).toBe(false);
      expect(can(admin, PERMISSIONS.ROLES_GRANT)).toBe(false);
      expect(can(admin, PERMISSIONS.PAYOUTS_WRITE)).toBe(false);

      // Self-approval attempt: DENIED
      expect(can(admin, PERMISSIONS.CONFIG_WRITE, null, { secondApproverId: admin.id })).toBe(
        false
      );
      expect(can(admin, PERMISSIONS.FEES_WRITE, null, { secondApproverId: 1 })).toBe(false);

      // Distinct second approver: ALLOWED
      expect(can(admin, PERMISSIONS.CONFIG_WRITE, null, { secondApproverId: 99 })).toBe(true);
      expect(can(admin, PERMISSIONS.FEES_WRITE, null, { secondApproverId: 99 })).toBe(true);
      expect(can(admin, PERMISSIONS.ROLES_GRANT, null, { secondApproverId: 99 })).toBe(true);
      expect(can(admin, PERMISSIONS.PAYOUTS_WRITE, null, { secondApproverId: 99 })).toBe(true);
    });
  });

  describe('Store Manager Role Matrix', () => {
    const manager = { id: 2, role: 'store_manager' };

    it('allows inventory, catalog, dispatch and order management', () => {
      expect(can(manager, PERMISSIONS.PRODUCTS_READ)).toBe(true);
      expect(can(manager, PERMISSIONS.PRODUCTS_WRITE)).toBe(true);
      expect(can(manager, PERMISSIONS.INVENTORY_READ)).toBe(true);
      expect(can(manager, PERMISSIONS.INVENTORY_WRITE)).toBe(true);
      expect(can(manager, PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
      expect(can(manager, PERMISSIONS.INVENTORY_QUARANTINE)).toBe(true);
      expect(can(manager, PERMISSIONS.ORDERS_READ_ALL)).toBe(true);
      expect(can(manager, PERMISSIONS.ORDERS_UPDATE_STATUS)).toBe(true);
      expect(can(manager, PERMISSIONS.DISPATCH_READ)).toBe(true);
      expect(can(manager, PERMISSIONS.DISPATCH_ASSIGN)).toBe(true);
      expect(can(manager, PERMISSIONS.ADMIN_ACCESS)).toBe(true);
    });

    it('denies administrative security audit and pricing writes', () => {
      expect(can(manager, PERMISSIONS.SECURITY_AUDIT)).toBe(false);
      expect(can(manager, PERMISSIONS.PRICING_WRITE)).toBe(false);
      expect(can(manager, PERMISSIONS.PRODUCTS_DELETE)).toBe(false);
    });
  });

  describe('Support Role Matrix', () => {
    const support = { id: 3, role: 'support' };

    it('allows reading orders and users', () => {
      expect(can(support, PERMISSIONS.ORDERS_READ_ALL)).toBe(true);
      expect(can(support, PERMISSIONS.USERS_READ_ALL)).toBe(true);
    });

    it('allows approving refunds within standard threshold (<= INR 1000)', () => {
      expect(can(support, PERMISSIONS.ORDERS_REFUND_APPROVE, null, { amount: 500 })).toBe(true);
      expect(can(support, PERMISSIONS.ORDERS_REFUND_APPROVE, { grand_total: 1000 })).toBe(true);
    });

    it('denies approving refunds above threshold (> INR 1000) requiring four-eyes escalation', () => {
      expect(can(support, PERMISSIONS.ORDERS_REFUND_APPROVE, null, { amount: 1500 })).toBe(false);
      expect(can(support, PERMISSIONS.ORDERS_REFUND_APPROVE, { grand_total: 2500 })).toBe(false);
    });

    it('allows approving refunds above threshold (> INR 1000) when four-eyes second approver is provided', () => {
      expect(
        can(support, PERMISSIONS.ORDERS_REFUND_APPROVE, null, {
          amount: 1500,
          secondApproverId: 99,
        })
      ).toBe(true);
      expect(
        can(support, PERMISSIONS.ORDERS_REFUND_APPROVE, null, {
          amount: 1500,
          secondApproverId: support.id,
        })
      ).toBe(false);
    });

    it('denies inventory changes, pricing changes, or security audit', () => {
      expect(can(support, PERMISSIONS.INVENTORY_WRITE)).toBe(false);
      expect(can(support, PERMISSIONS.PRICING_WRITE)).toBe(false);
      expect(can(support, PERMISSIONS.SECURITY_AUDIT)).toBe(false);
    });
  });

  describe('Finance Role Matrix', () => {
    const finance = { id: 4, role: 'finance' };

    it('allows reading orders, pricing, admin metrics, and admin access', () => {
      expect(can(finance, PERMISSIONS.ORDERS_READ_ALL)).toBe(true);
      expect(can(finance, PERMISSIONS.PRICING_READ)).toBe(true);
      expect(can(finance, PERMISSIONS.ADMIN_METRICS)).toBe(true);
      expect(can(finance, PERMISSIONS.ADMIN_ACCESS)).toBe(true);
    });

    it('allows refunds within threshold and requires four-eyes above threshold', () => {
      expect(can(finance, PERMISSIONS.ORDERS_REFUND_APPROVE, null, { amount: 500 })).toBe(true);
      expect(can(finance, PERMISSIONS.ORDERS_REFUND_APPROVE, null, { amount: 2500 })).toBe(false);
      expect(
        can(finance, PERMISSIONS.ORDERS_REFUND_APPROVE, null, {
          amount: 2500,
          secondApproverId: 99,
        })
      ).toBe(true);
      expect(
        can(finance, PERMISSIONS.ORDERS_REFUND_APPROVE, null, {
          amount: 2500,
          secondApproverId: finance.id,
        })
      ).toBe(false);
    });

    it('requires four-eyes for payouts:write and blocks self-approval', () => {
      expect(can(finance, PERMISSIONS.PAYOUTS_WRITE)).toBe(false);
      expect(can(finance, PERMISSIONS.PAYOUTS_WRITE, null, { secondApproverId: finance.id })).toBe(
        false
      );
      expect(can(finance, PERMISSIONS.PAYOUTS_WRITE, null, { secondApproverId: 99 })).toBe(true);
    });

    it('denies inventory changes and catalog write', () => {
      expect(can(finance, PERMISSIONS.INVENTORY_WRITE)).toBe(false);
      expect(can(finance, PERMISSIONS.PRODUCTS_WRITE)).toBe(false);
    });
  });

  describe('Delivery Rider Role Matrix (SEC-AZ-02 Object Level)', () => {
    const rider = { id: 10, role: 'rider' };
    const assignedOrder = { id: 101, assigned_rider_id: 10, status: 'packed' };
    const unassignedOrder = { id: 102, assigned_rider_id: 99, status: 'packed' };

    it('allows dispatch location ping', () => {
      expect(can(rider, PERMISSIONS.DISPATCH_LOCATION_PING)).toBe(true);
    });

    it('allows reading and updating order status only for assigned orders', () => {
      expect(can(rider, PERMISSIONS.ORDERS_READ_OWN, assignedOrder)).toBe(true);
      expect(can(rider, PERMISSIONS.ORDERS_UPDATE_STATUS, assignedOrder)).toBe(true);
    });

    it('denies reading or updating orders assigned to other riders', () => {
      expect(can(rider, PERMISSIONS.ORDERS_READ_OWN, unassignedOrder)).toBe(false);
      expect(can(rider, PERMISSIONS.ORDERS_UPDATE_STATUS, unassignedOrder)).toBe(false);
    });

    it('denies access to admin, inventory, or cart actions', () => {
      expect(can(rider, PERMISSIONS.ADMIN_ACCESS)).toBe(false);
      expect(can(rider, PERMISSIONS.INVENTORY_WRITE)).toBe(false);
      expect(can(rider, PERMISSIONS.CART_READ_OWN)).toBe(false);
    });
  });

  describe('Customer Role Matrix & IDOR Prevention (SEC-AZ-02)', () => {
    const customer = { id: 50, role: 'customer' };
    const ownOrder = { id: 201, user_id: 50, grand_total: 450 };
    const otherOrder = { id: 202, user_id: 99, grand_total: 900 };

    it('allows browsing catalog and creating orders', () => {
      expect(can(customer, PERMISSIONS.PRODUCTS_READ)).toBe(true);
      expect(can(customer, PERMISSIONS.ORDERS_CREATE)).toBe(true);
    });

    it('allows reading and cancelling own orders', () => {
      expect(can(customer, PERMISSIONS.ORDERS_READ_OWN, ownOrder)).toBe(true);
      expect(can(customer, PERMISSIONS.ORDERS_CANCEL_OWN, ownOrder)).toBe(true);
    });

    it('strictly denies reading or cancelling other customers orders (IDOR prevention)', () => {
      expect(can(customer, PERMISSIONS.ORDERS_READ_OWN, otherOrder)).toBe(false);
      expect(can(customer, PERMISSIONS.ORDERS_CANCEL_OWN, otherOrder)).toBe(false);
    });

    it('allows managing own cart and denies other carts', () => {
      expect(can(customer, PERMISSIONS.CART_READ_OWN, { user_id: 50 })).toBe(true);
      expect(can(customer, PERMISSIONS.CART_READ_OWN, { user_id: 99 })).toBe(false);
    });

    it('allows managing own user profile and denies modifying other profiles', () => {
      expect(can(customer, PERMISSIONS.USERS_READ_OWN, { id: 50 })).toBe(true);
      expect(can(customer, PERMISSIONS.USERS_READ_OWN, { id: 99 })).toBe(false);
      expect(can(customer, PERMISSIONS.USERS_DELETE_OWN, { id: 50 })).toBe(true);
      expect(can(customer, PERMISSIONS.USERS_DELETE_OWN, { id: 99 })).toBe(false);
    });

    it('strictly denies any admin or staff actions', () => {
      expect(can(customer, PERMISSIONS.ORDERS_READ_ALL)).toBe(false);
      expect(can(customer, PERMISSIONS.ADMIN_ACCESS)).toBe(false);
      expect(can(customer, PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
      expect(can(customer, PERMISSIONS.SECURITY_AUDIT)).toBe(false);
    });
  });
});
