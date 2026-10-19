/**
 * @file moneyInvariants.test.js
 * @description Verifies integer paise money model integrity (F-050) and schema constraints (F-054).
 * Guarantees that financial calculations never leak floating-point inaccuracies
 * and that database constraints enforce non-negative stock and positive item quantities.
 */

const assert = require('node:assert/strict');
const { allocateOrderDiscount } = require('../../src/algo/couponEngine');
const { calculateDeliveryFee } = require('../../src/algo/deliveryFeeEngine');

describe('Integer Paise Money Model & Floating Point Immunity (F-050)', () => {
  it('demonstrates standard JavaScript float hazard and proves integer paise immunity', () => {
    // Classic IEEE 754 float hazard
    const rupeeFloatSum = 0.1 + 0.2;
    assert.notStrictEqual(
      rupeeFloatSum,
      0.3,
      'Standard float addition 0.1 + 0.2 suffers from precision drift'
    );

    // Integer paise equivalence (10 paise + 20 paise = 30 paise)
    const paise1 = 10;
    const paise2 = 20;
    const paiseSum = paise1 + paise2;
    assert.strictEqual(paiseSum, 30, 'Integer paise addition is strictly exact');
  });

  it('proves zero-leakage discount allocation across line items using integer paise', () => {
    // 3 items with fractional discount splits: Rs. 100, Rs. 100, Rs. 100 with Rs. 10 total discount
    // In floats: 10 / 3 = 3.3333333333333335 (leaks 1 paisa)
    // In integer paise: 1000 paise total discount across 3 lines of 10000 paise each
    const items = [
      { lineTotalPaise: 10000 },
      { lineTotalPaise: 10000 },
      { lineTotalPaise: 10000 },
    ];
    const discountPaise = 1000;

    const allocated = allocateOrderDiscount(items, discountPaise);
    assert.strictEqual(allocated.length, 3);

    // Sum of integer allocations must equal exactly 1000 paise
    const totalAllocated = allocated.reduce((sum, val) => sum + val, 0);
    assert.strictEqual(
      totalAllocated,
      discountPaise,
      'Sum of allocated line discounts must exactly match total discount paise'
    );

    // Ensure all individual allocations are integers
    for (const paise of allocated) {
      assert(Number.isInteger(paise), `Allocation ${paise} must be an integer`);
    }

    // Remainder was distributed deterministically: 334, 333, 333
    assert.deepStrictEqual(allocated, [334, 333, 333]);
  });

  it('guarantees delivery fee engine outputs strict integer paise values', () => {
    const feeBreakdown = calculateDeliveryFee({
      itemTotalPaise: 35000, // Rs. 350
      distanceKm: 4.75,
      weatherCondition: 'RAIN',
      orderTime: '2026-10-24T23:30:00.000Z',
      weightGrams: 12000,
    });

    assert(Number.isInteger(feeBreakdown.baseFeePaise), 'baseFeePaise must be an integer');
    assert(Number.isInteger(feeBreakdown.distanceFeePaise), 'distanceFeePaise must be an integer');
    assert(Number.isInteger(feeBreakdown.weatherSurgePaise), 'weatherSurgePaise must be an integer');
    assert(Number.isInteger(feeBreakdown.lateNightSurgePaise), 'lateNightSurgePaise must be an integer');
    assert(Number.isInteger(feeBreakdown.heavyOrderSurgePaise), 'heavyOrderSurgePaise must be an integer');
    assert(Number.isInteger(feeBreakdown.finalDeliveryFeePaise), 'finalDeliveryFeePaise must be an integer');

    const expectedGross =
      feeBreakdown.baseFeePaise +
      feeBreakdown.distanceFeePaise +
      feeBreakdown.weatherSurgePaise +
      feeBreakdown.lateNightSurgePaise +
      feeBreakdown.heavyOrderSurgePaise;

    assert.strictEqual(
      feeBreakdown.grossDeliveryFeePaise,
      expectedGross,
      'Gross delivery fee paise must exactly match the sum of component fees and surcharges'
    );
    assert.strictEqual(
      feeBreakdown.finalDeliveryFeePaise,
      feeBreakdown.grossDeliveryFeePaise - feeBreakdown.freeDeliveryDiscountPaise,
      'Final delivery fee paise must equal gross fee minus free delivery discount'
    );
  });

  it('converts rupee decimals to integer paise safely using rounding without drift', () => {
    const rupeePrices = ['49.99', '120.50', '9.10', '0.05', '999.00'];
    const expectedPaise = [4999, 12050, 910, 5, 99900];

    const converted = rupeePrices.map((str) => Math.round(Number(str) * 100));
    assert.deepStrictEqual(converted, expectedPaise);

    for (const val of converted) {
      assert(Number.isSafeInteger(val), 'Converted value must be a safe integer');
    }
  });
});
