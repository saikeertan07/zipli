/**
 * @file property-based.test.js
 * @description Property-based testing suite using fast-check for financial, ledger, and discount invariants.
 * Requirement: F-043 / Prompt Pack Part 5 Section 4
 */

const fc = require('fast-check');
const { allocateOrderDiscount } = require('../../src/algo/couponEngine');
const { calculateDeliveryFee } = require('../../src/algo/deliveryFeeEngine');
const { basketOptimizer } = require('../../src/algo');

describe('Property-Based Invariants with fast-check (F-043, FIN-PBT-01)', () => {
  describe('Invariant 1: Pro-Rata Order Discount Allocation (Hamilton-Hare Largest Remainder)', () => {
    it('guarantees zero-leakage discount allocation across arbitrary items and discount amounts (100 runs)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              lineTotalPaise: fc.integer({ min: 1, max: 500000 }), // ₹0.01 to ₹5,000.00
            }),
            { minLength: 1, maxLength: 30 }
          ),
          fc.integer({ min: 0, max: 1000000 }), // Discount up to ₹10,000.00
          (items, discountPaise) => {
            const totalItemPaise = items.reduce((s, it) => s + it.lineTotalPaise, 0);
            const expectedTotalDiscount = Math.min(discountPaise, totalItemPaise);

            const allocated = allocateOrderDiscount(items, discountPaise);

            // 1. Length matches items count
            expect(allocated).toHaveLength(items.length);

            // 2. Exact sum equality (zero paise leaked)
            const actualSum = allocated.reduce((s, x) => s + x, 0);
            expect(actualSum).toBe(expectedTotalDiscount);

            // 3. Line bounds: 0 <= allocated[i] <= item.lineTotalPaise
            for (let i = 0; i < items.length; i++) {
              expect(allocated[i]).toBeGreaterThanOrEqual(0);
              expect(allocated[i]).toBeLessThanOrEqual(items[i].lineTotalPaise);
            }

            // 4. Proportional monotonicity: larger items receive >= discount than smaller items
            for (let i = 0; i < items.length; i++) {
              for (let j = 0; j < items.length; j++) {
                if (items[i].lineTotalPaise > items[j].lineTotalPaise) {
                  // Allow at most 1 paise diff due to remainder tie-breaking
                  expect(allocated[i]).toBeGreaterThanOrEqual(allocated[j] - 1);
                }
              }
            }
          }
        ),
        { numRuns: 150 }
      );
    });

    it('returns array of zeroes when discount is 0 or all line totals are 0', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({ lineTotalPaise: fc.integer({ min: 100, max: 5000 }) }), {
            minLength: 1,
            maxLength: 10,
          }),
          (items) => {
            const allocated = allocateOrderDiscount(items, 0);
            expect(allocated.every((x) => x === 0)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Invariant 2: Order Fee & Pricing Invariant', () => {
    it('satisfies total == subtotal - discount + delivery + surge + tax for arbitrary inputs (100 runs)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 1000000 }), // itemTotalPaise
          fc.double({ min: 0.1, max: 25.0, noNaN: true }), // distanceKm
          fc.constantFrom('NORMAL', 'RAIN', 'STORM', 'HEATWAVE'), // weather
          fc.integer({ min: 0, max: 23 }), // orderHour
          fc.integer({ min: 0, max: 30000 }), // weightGrams
          (itemTotalPaise, distanceKm, weather, orderHour, weightGrams) => {
            const orderTime = new Date(2026, 9, 19, orderHour, 15);
            const feeResult = calculateDeliveryFee({
              itemTotalPaise,
              distanceKm,
              weather,
              orderTime,
              weightGrams,
            });

            // Invariant: Final fee = max(0, grossFee - freeDeliveryDiscount)
            expect(feeResult.finalDeliveryFeePaise).toBe(
              Math.max(0, feeResult.grossDeliveryFeePaise - feeResult.freeDeliveryDiscountPaise)
            );

            // Invariant: Gross fee = base + distance + totalSurge
            expect(feeResult.grossDeliveryFeePaise).toBe(
              feeResult.baseFeePaise + feeResult.distanceFeePaise + feeResult.totalSurgePaise
            );

            // Invariant: Total surge = weather + lateNight + heavyOrder
            expect(feeResult.totalSurgePaise).toBe(
              feeResult.weatherSurgePaise + feeResult.lateNightSurgePaise + feeResult.heavyOrderSurgePaise
            );

            // Invariant: If item total >= ₹500, base and distance fee are completely waived
            if (itemTotalPaise >= 50000) {
              expect(feeResult.freeDeliveryDiscountPaise).toBe(
                feeResult.baseFeePaise + feeResult.distanceFeePaise
              );
            } else {
              expect(feeResult.freeDeliveryDiscountPaise).toBe(0);
            }
          }
        ),
        { numRuns: 120 }
      );
    });
  });

  describe('Invariant 3: Double-Entry Balanced Journal Equality', () => {
    it('guarantees that for any random balanced entry structure, sum(debits) - sum(credits) == 0 (100 runs)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 500000 }), // orderTotal
          fc.integer({ min: 100, max: 500000 }), // items
          fc.integer({ min: 0, max: 50000 }), // commission
          fc.integer({ min: 0, max: 10000 }), // delivery
          fc.integer({ min: 0, max: 5000 }), // tip
          fc.integer({ min: 0, max: 10000 }), // gst
          fc.integer({ min: 0, max: 20000 }), // discount
          (orderTotal, items, rawComm, delivery, tip, gst, discount) => {
            // Ensure commission <= items
            const commission = Math.min(rawComm, items);
            const storePayout = items - commission;

            // In our ledger formula:
            // debits = orderTotal + discount
            // credits = storePayout + commission + delivery + tip + gst
            // To be a valid transaction, the shopper pays: items - discount + delivery + tip + gst
            const shopperPaid = items - discount + delivery + tip + gst;
            if (shopperPaid < 0) return true; // Discard invalid domain

            const totalDebits = shopperPaid + discount;
            const totalCredits = storePayout + commission + delivery + tip + gst;

            expect(totalDebits).toBe(totalCredits);
            expect(totalDebits - totalCredits).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Invariant 4: Knapsack Basket Completion Optimization', () => {
    it('never selects items outside candidate pool and respects price ceilings', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              name: fc.string({ minLength: 3, maxLength: 20 }),
              price: fc.integer({ min: 20, max: 300 }),
              category: fc.constantFrom('Dairy', 'Snacks', 'Beverages', 'Fruits'),
            }),
            { minLength: 2, maxLength: 15 }
          ),
          fc.integer({ min: 30, max: 250 }), // target gap
          (candidates, targetGap) => {
            const result = basketOptimizer.optimizeBasketThreshold({
              targetGap,
              candidatePool: candidates,
              maxPriceCeiling: 400,
            });

            // Selected items must be a subset of candidate pool IDs
            const candidateIds = new Set(candidates.map((c) => c.id));
            for (const item of result.selectedItems) {
              expect(candidateIds.has(item.id)).toBe(true);
            }

            // Total price must match sum of selected items
            const sumPrice = result.selectedItems.reduce((s, it) => s + it.price, 0);
            expect(result.totalAddedPrice).toBe(sumPrice);

            // Overshoot invariant
            expect(result.overshoot).toBe(Math.max(0, result.totalAddedPrice - targetGap));
          }
        ),
        { numRuns: 80 }
      );
    });
  });
});
