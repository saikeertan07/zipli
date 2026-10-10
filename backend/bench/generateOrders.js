/**
 * @file generateOrders.js
 * @description Synthetic order generator for Zipli Pro recommendation benchmarks and evaluation.
 * Generates 50,000 realistic grocery orders over 90 days with planted co-occurrence clusters
 * and natural user inter-purchase intervals using deterministic seeded PRNG.
 */

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLANTED_CLUSTERS = [
  { name: 'breakfast_essentials', items: [1, 2, 3, 4], prob: 0.28 }, // Bread, Butter, Milk, Eggs
  { name: 'movie_night_snack', items: [51, 52, 53], prob: 0.22 }, // Chips, Cola, Biscuits
  { name: 'baby_care_bundle', items: [201, 202, 203], prob: 0.15 }, // Diaper, Wipes, Lotion
  { name: 'evening_chai', items: [351, 125, 3], prob: 0.24 }, // Chai Patti, Sugar, Milk
  { name: 'daily_staples', items: [121, 122, 123, 7], prob: 0.18 }, // Atta, Rice, Dal, Ghee
];

// Product catalog metadata
const SYNTHETIC_PRODUCTS = [
  { id: 1, name: 'White Bread 400g', category: 'bakery', price: 45 },
  { id: 2, name: 'Amul Butter 100g', category: 'dairy', price: 56 },
  { id: 3, name: 'Cow Milk 1L', category: 'dairy', price: 60 },
  { id: 4, name: 'Farm Eggs 6pk', category: 'dairy', price: 48 },
  { id: 7, name: 'Pure Desi Ghee 500ml', category: 'dairy', price: 340 },
  { id: 51, name: "Lay's Potato Chips 50g", category: 'snacks', price: 20 },
  { id: 52, name: 'Coca-Cola 750ml', category: 'beverages', price: 40 },
  { id: 53, name: 'Parle-G Gold Biscuits', category: 'snacks', price: 25 },
  { id: 121, name: 'Aashirvaad Shudh Atta 5kg', category: 'staples', price: 245 },
  { id: 122, name: 'India Gate Basmati Rice 1kg', category: 'staples', price: 130 },
  { id: 123, name: 'Tata Sampann Toor Dal 1kg', category: 'staples', price: 165 },
  { id: 125, name: 'Madhur Pure Sugar 1kg', category: 'staples', price: 52 },
  { id: 201, name: 'Pampers Baby Diapers M', category: 'baby', price: 499 },
  { id: 202, name: 'Himalaya Baby Wipes 72s', category: 'baby', price: 175 },
  { id: 203, name: "Johnson's Baby Lotion 200ml", category: 'baby', price: 190 },
  { id: 251, name: 'Fresh Onion 1kg', category: 'vegetables', price: 35 },
  { id: 252, name: 'Fresh Potato 1kg', category: 'vegetables', price: 30 },
  { id: 253, name: 'Fresh Tomato 1kg', category: 'vegetables', price: 40 },
  { id: 254, name: 'Kashmir Apples 1kg', category: 'fruits', price: 180 },
  { id: 255, name: 'Robusta Bananas 1kg', category: 'fruits', price: 60 },
  { id: 351, name: 'Tata Tea Gold 500g', category: 'beverages', price: 280 },
  { id: 352, name: 'Nescafe Classic Coffee 50g', category: 'beverages', price: 160 },
];

// Fill up to 200 synthetic product IDs
for (let i = 23; i <= 200; i++) {
  SYNTHETIC_PRODUCTS.push({
    id: 400 + i,
    name: `Grocery Item ${400 + i}`,
    category:
      i % 4 === 0 ? 'dairy' : i % 4 === 1 ? 'snacks' : i % 4 === 2 ? 'staples' : 'vegetables',
    price: 30 + ((i * 7) % 200),
  });
}

/**
 * Generates N realistic synthetic grocery orders.
 *
 * @param {number} [totalOrders=50000]
 * @param {number} [seed=42]
 * @returns {{ orders: Array<Object>, products: Array<Object>, userCount: number, plantedClusters: Array<Object> }}
 */
function generateSyntheticOrders(totalOrders = 50000, seed = 42) {
  const rand = mulberry32(seed);
  const userCount = 3500;
  const startTime = new Date('2026-01-01T00:00:00Z').getTime();
  const endTime = new Date('2026-03-31T23:59:59Z').getTime();
  const timeSpan = endTime - startTime;

  // Segment users: 15% are high-frequency milk repeaters
  const milkRepeaterUsers = new Set();
  for (let u = 1; u <= Math.floor(userCount * 0.15); u++) {
    milkRepeaterUsers.add(u);
  }

  const orders = [];
  const userLastOrderTime = new Map();

  for (let orderId = 1; orderId <= totalOrders; orderId++) {
    const userId = 1 + Math.floor(rand() * userCount);

    // Compute order timestamp
    let orderTime;
    if (milkRepeaterUsers.has(userId) && userLastOrderTime.has(userId)) {
      // Repeat purchase interval: ~3.5 days +/- 1 day
      const last = userLastOrderTime.get(userId);
      const gapMs = (2.5 + rand() * 2.0) * 24 * 60 * 60 * 1000;
      orderTime = Math.min(endTime, last + gapMs);
    } else {
      orderTime = startTime + Math.floor(rand() * timeSpan);
    }
    userLastOrderTime.set(userId, orderTime);

    const items = new Set();

    // If milk repeater, guarantee milk in cart with 85% probability
    if (milkRepeaterUsers.has(userId) && rand() < 0.85) {
      items.add(3); // Milk
    }

    // Planted co-occurrence clusters
    for (const cluster of PLANTED_CLUSTERS) {
      if (rand() < cluster.prob) {
        // Pick 2 to all items from cluster
        const count = 2 + Math.floor(rand() * (cluster.items.length - 1));
        const shuffled = [...cluster.items].sort(() => rand() - 0.5);
        for (let i = 0; i < count; i++) {
          items.add(shuffled[i]);
        }
      }
    }

    // Add 1-3 random catalog items (long-tail background noise)
    const noiseCount = 1 + Math.floor(rand() * 3);
    for (let n = 0; n < noiseCount; n++) {
      const idx = Math.floor(rand() * SYNTHETIC_PRODUCTS.length);
      items.add(SYNTHETIC_PRODUCTS[idx].id);
    }

    // Ensure order is not empty
    if (items.size === 0) {
      items.add(1);
      items.add(2);
    }

    orders.push({
      order_id: orderId,
      user_id: userId,
      items: Array.from(items),
      created_at: new Date(orderTime).toISOString(),
    });
  }

  // Sort orders chronologically
  orders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return {
    orders,
    products: SYNTHETIC_PRODUCTS,
    userCount,
    plantedClusters: PLANTED_CLUSTERS,
  };
}

if (require.main === module) {
  console.log('Generating 50,000 synthetic orders with seeded PRNG (seed=42)...');
  const t0 = Date.now();
  const dataset = generateSyntheticOrders(50000);
  const elapsed = Date.now() - t0;
  console.log(`Generated ${dataset.orders.length} orders in ${elapsed}ms.`);
  console.log(`Total unique products: ${dataset.products.length}`);
  console.log(`First order:`, dataset.orders[0]);
  console.log(`Last order:`, dataset.orders[dataset.orders.length - 1]);
}

module.exports = {
  generateSyntheticOrders,
  mulberry32,
  SYNTHETIC_PRODUCTS,
  PLANTED_CLUSTERS,
};
