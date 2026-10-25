/**
 * ZIPLI — High-Fidelity Static Fallback Catalog
 * Ensures the storefront is immediately interactive, rich, and functional
 * when running on static hosting (GitHub Pages) or during backend cold-starts.
 */

export const FALLBACK_CATEGORIES = [
  {
    "id": "all",
    "name": "All",
    "emoji": "🏠"
  },
  {
    "id": "dairy",
    "name": "Dairy, Bread & Eggs",
    "emoji": "🥛"
  },
  {
    "id": "fruits",
    "name": "Fruits & Vegetables",
    "emoji": "🍎"
  },
  {
    "id": "drinks",
    "name": "Cold Drinks & Juices",
    "emoji": "🥤"
  },
  {
    "id": "snacks",
    "name": "Snacks & Munchies",
    "emoji": "🍿"
  },
  {
    "id": "breakfast",
    "name": "Breakfast & Instant Food",
    "emoji": "🥣"
  },
  {
    "id": "sweet",
    "name": "Sweet Tooth",
    "emoji": "🍫"
  },
  {
    "id": "bakery",
    "name": "Bakery & Biscuits",
    "emoji": "🍪"
  },
  {
    "id": "tea",
    "name": "Tea, Coffee & Milk Drinks",
    "emoji": "☕"
  },
  {
    "id": "staples",
    "name": "Atta, Rice & Dal",
    "emoji": "🌾"
  },
  {
    "id": "masala",
    "name": "Masala, Oil & More",
    "emoji": "🌶️"
  },
  {
    "id": "sauces",
    "name": "Sauces & Spreads",
    "emoji": "🫙"
  },
  {
    "id": "meat",
    "name": "Chicken, Meat & Fish",
    "emoji": "🍗"
  },
  {
    "id": "organic",
    "name": "Organic & Healthy Living",
    "emoji": "🥦"
  },
  {
    "id": "baby",
    "name": "Baby Care",
    "emoji": "👶"
  },
  {
    "id": "pharma",
    "name": "Pharma & Wellness",
    "emoji": "💊"
  },
  {
    "id": "cleaning",
    "name": "Cleaning Essentials",
    "emoji": "🧹"
  },
  {
    "id": "personal",
    "name": "Personal Care",
    "emoji": "🧴"
  },
  {
    "id": "pet",
    "name": "Pet Care",
    "emoji": "🐾"
  }
];

export const FALLBACK_PRODUCTS = [
  {
    "id": 2,
    "name": "Amul Gold Full Cream Milk",
    "qty": "1 L",
    "price": 69,
    "mrp": 69,
    "emoji": "🥛",
    "cat": "dairy",
    "badge": null
  },
  {
    "id": 3,
    "name": "Amul Butter",
    "qty": "100 g",
    "price": 56,
    "mrp": 57,
    "emoji": "🧈",
    "cat": "dairy",
    "badge": null
  },
  {
    "id": 4,
    "name": "Country Delight White Eggs",
    "qty": "6 pcs",
    "price": 42,
    "mrp": 48,
    "emoji": "🥚",
    "cat": "dairy",
    "badge": "hot"
  },
  {
    "id": 5,
    "name": "Amul Masti Dahi",
    "qty": "400 g",
    "price": 38,
    "mrp": 40,
    "emoji": "🥛",
    "cat": "dairy",
    "badge": null
  },
  {
    "id": 6,
    "name": "Amul Malai Paneer",
    "qty": "200 g",
    "price": 72,
    "mrp": 85,
    "emoji": "🧀",
    "cat": "dairy",
    "badge": "fresh"
  },
  {
    "id": 7,
    "name": "Britannia Bread",
    "qty": "400 g",
    "price": 45,
    "mrp": 50,
    "emoji": "🍞",
    "cat": "dairy",
    "badge": "fresh"
  },
  {
    "id": 8,
    "name": "Amul Fresh Cream",
    "qty": "200 ml",
    "price": 36,
    "mrp": 38,
    "emoji": "🥛",
    "cat": "dairy",
    "badge": null
  },
  {
    "id": 9,
    "name": "Tomatoes",
    "qty": "500 g",
    "price": 29,
    "mrp": 39,
    "emoji": "🍅",
    "cat": "fruits",
    "badge": "fresh"
  },
  {
    "id": 10,
    "name": "Onions",
    "qty": "1 kg",
    "price": 35,
    "mrp": 45,
    "emoji": "🧅",
    "cat": "fruits",
    "badge": null
  },
  {
    "id": 11,
    "name": "Banana Cavendish",
    "qty": "6 pcs",
    "price": 45,
    "mrp": 55,
    "emoji": "🍌",
    "cat": "fruits",
    "badge": null
  },
  {
    "id": 12,
    "name": "Apple Shimla",
    "qty": "4 pcs",
    "price": 129,
    "mrp": 149,
    "emoji": "🍎",
    "cat": "fruits",
    "badge": "fresh"
  },
  {
    "id": 13,
    "name": "Spinach (Palak)",
    "qty": "250 g",
    "price": 18,
    "mrp": 25,
    "emoji": "🥬",
    "cat": "fruits",
    "badge": "fresh"
  },
  {
    "id": 14,
    "name": "Carrot",
    "qty": "500 g",
    "price": 32,
    "mrp": 40,
    "emoji": "🥕",
    "cat": "fruits",
    "badge": null
  },
  {
    "id": 15,
    "name": "Green Capsicum",
    "qty": "250 g",
    "price": 22,
    "mrp": 30,
    "emoji": "🫑",
    "cat": "fruits",
    "badge": null
  },
  {
    "id": 16,
    "name": "Potato",
    "qty": "1 kg",
    "price": 28,
    "mrp": 35,
    "emoji": "🥔",
    "cat": "fruits",
    "badge": null
  },
  {
    "id": 17,
    "name": "Watermelon",
    "qty": "~2 kg",
    "price": 79,
    "mrp": 99,
    "emoji": "🍉",
    "cat": "fruits",
    "badge": "sale"
  },
  {
    "id": 18,
    "name": "Coriander (Dhaniya)",
    "qty": "100 g",
    "price": 12,
    "mrp": 15,
    "emoji": "🌿",
    "cat": "fruits",
    "badge": "fresh"
  },
  {
    "id": 19,
    "name": "Coca-Cola",
    "qty": "750 ml",
    "price": 45,
    "mrp": 50,
    "emoji": "🥤",
    "cat": "drinks",
    "badge": null
  },
  {
    "id": 20,
    "name": "Pepsi",
    "qty": "750 ml",
    "price": 42,
    "mrp": 48,
    "emoji": "🥤",
    "cat": "drinks",
    "badge": null
  },
  {
    "id": 21,
    "name": "Sprite",
    "qty": "750 ml",
    "price": 42,
    "mrp": 48,
    "emoji": "🫧",
    "cat": "drinks",
    "badge": null
  },
  {
    "id": 22,
    "name": "Real Fruit Juice Orange",
    "qty": "1 L",
    "price": 110,
    "mrp": 130,
    "emoji": "🧃",
    "cat": "drinks",
    "badge": "sale"
  },
  {
    "id": 23,
    "name": "Bisleri Mineral Water",
    "qty": "1 L",
    "price": 20,
    "mrp": 20,
    "emoji": "💧",
    "cat": "drinks",
    "badge": null
  },
  {
    "id": 24,
    "name": "Red Bull Energy Drink",
    "qty": "250 ml",
    "price": 125,
    "mrp": 130,
    "emoji": "⚡",
    "cat": "drinks",
    "badge": "hot"
  },
  {
    "id": 25,
    "name": "Maaza Mango Drink",
    "qty": "600 ml",
    "price": 35,
    "mrp": 40,
    "emoji": "🥭",
    "cat": "drinks",
    "badge": null
  },
  {
    "id": 26,
    "name": "Lay's Classic Salted",
    "qty": "52 g",
    "price": 20,
    "mrp": 20,
    "emoji": "🥔",
    "cat": "snacks",
    "badge": null
  },
  {
    "id": 27,
    "name": "Lay's Magic Masala",
    "qty": "52 g",
    "price": 20,
    "mrp": 20,
    "emoji": "🔶",
    "cat": "snacks",
    "badge": "hot"
  },
  {
    "id": 28,
    "name": "Kurkure Masala Munch",
    "qty": "90 g",
    "price": 25,
    "mrp": 30,
    "emoji": "🌽",
    "cat": "snacks",
    "badge": "hot"
  },
  {
    "id": 29,
    "name": "Haldiram's Bhujia",
    "qty": "200 g",
    "price": 75,
    "mrp": 80,
    "emoji": "🌾",
    "cat": "snacks",
    "badge": null
  },
  {
    "id": 30,
    "name": "Uncle Chipps Spicy Treat",
    "qty": "53 g",
    "price": 20,
    "mrp": 20,
    "emoji": "🥔",
    "cat": "snacks",
    "badge": null
  },
  {
    "id": 31,
    "name": "Maggi Masala Noodles",
    "qty": "70 g",
    "price": 14,
    "mrp": 14,
    "emoji": "🍜",
    "cat": "breakfast",
    "badge": "hot"
  },
  {
    "id": 32,
    "name": "Kellogg's Corn Flakes",
    "qty": "250 g",
    "price": 110,
    "mrp": 130,
    "emoji": "🥣",
    "cat": "breakfast",
    "badge": null
  },
  {
    "id": 33,
    "name": "Quaker Oats",
    "qty": "500 g",
    "price": 120,
    "mrp": 140,
    "emoji": "🌾",
    "cat": "breakfast",
    "badge": null
  },
  {
    "id": 34,
    "name": "Sunfeast Yippee Noodles",
    "qty": "70 g",
    "price": 12,
    "mrp": 14,
    "emoji": "🍜",
    "cat": "breakfast",
    "badge": null
  },
  {
    "id": 35,
    "name": "MTR Upma Mix",
    "qty": "200 g",
    "price": 45,
    "mrp": 55,
    "emoji": "🍚",
    "cat": "breakfast",
    "badge": null
  },
  {
    "id": 36,
    "name": "Cadbury Dairy Milk",
    "qty": "38 g",
    "price": 20,
    "mrp": 20,
    "emoji": "🍫",
    "cat": "sweet",
    "badge": "hot"
  },
  {
    "id": 37,
    "name": "Dairy Milk Silk",
    "qty": "60 g",
    "price": 85,
    "mrp": 95,
    "emoji": "🍫",
    "cat": "sweet",
    "badge": null
  },
  {
    "id": 38,
    "name": "KitKat",
    "qty": "37 g",
    "price": 30,
    "mrp": 35,
    "emoji": "🍫",
    "cat": "sweet",
    "badge": null
  },
  {
    "id": 39,
    "name": "5 Star",
    "qty": "40 g",
    "price": 20,
    "mrp": 20,
    "emoji": "⭐",
    "cat": "sweet",
    "badge": null
  },
  {
    "id": 40,
    "name": "Britannia Good Day",
    "qty": "120 g",
    "price": 20,
    "mrp": 20,
    "emoji": "🍪",
    "cat": "bakery",
    "badge": null
  },
  {
    "id": 41,
    "name": "Oreo Original Cookies",
    "qty": "120 g",
    "price": 55,
    "mrp": 60,
    "emoji": "🍪",
    "cat": "bakery",
    "badge": null
  },
  {
    "id": 42,
    "name": "Parle-G Biscuits",
    "qty": "250 g",
    "price": 15,
    "mrp": 15,
    "emoji": "🍪",
    "cat": "bakery",
    "badge": null
  },
  {
    "id": 43,
    "name": "Monaco Salty Biscuits",
    "qty": "200 g",
    "price": 30,
    "mrp": 35,
    "emoji": "🥐",
    "cat": "bakery",
    "badge": null
  },
  {
    "id": 44,
    "name": "Tata Tea Premium",
    "qty": "250 g",
    "price": 130,
    "mrp": 145,
    "emoji": "🍵",
    "cat": "tea",
    "badge": null
  },
  {
    "id": 45,
    "name": "Nescafé Classic Coffee",
    "qty": "100 g",
    "price": 210,
    "mrp": 240,
    "emoji": "☕",
    "cat": "tea",
    "badge": "sale"
  },
  {
    "id": 46,
    "name": "Bournvita Health Drink",
    "qty": "500 g",
    "price": 245,
    "mrp": 280,
    "emoji": "🥛",
    "cat": "tea",
    "badge": null
  },
  {
    "id": 47,
    "name": "Horlicks Classic Malt",
    "qty": "500 g",
    "price": 235,
    "mrp": 270,
    "emoji": "🥛",
    "cat": "tea",
    "badge": null
  },
  {
    "id": 48,
    "name": "Aashirvaad Atta",
    "qty": "5 kg",
    "price": 275,
    "mrp": 310,
    "emoji": "🌾",
    "cat": "staples",
    "badge": null
  },
  {
    "id": 49,
    "name": "India Gate Basmati Rice",
    "qty": "1 kg",
    "price": 99,
    "mrp": 120,
    "emoji": "🍚",
    "cat": "staples",
    "badge": "sale"
  },
  {
    "id": 50,
    "name": "Tata Sampann Toor Dal",
    "qty": "1 kg",
    "price": 145,
    "mrp": 165,
    "emoji": "🫘",
    "cat": "staples",
    "badge": null
  },
  {
    "id": 51,
    "name": "Tata Sampann Chana Dal",
    "qty": "500 g",
    "price": 72,
    "mrp": 85,
    "emoji": "🫘",
    "cat": "staples",
    "badge": null
  },
  {
    "id": 52,
    "name": "Fortune Sunflower Oil",
    "qty": "1 L",
    "price": 140,
    "mrp": 165,
    "emoji": "🫙",
    "cat": "masala",
    "badge": null
  },
  {
    "id": 53,
    "name": "MDH Garam Masala",
    "qty": "100 g",
    "price": 75,
    "mrp": 90,
    "emoji": "🌶️",
    "cat": "masala",
    "badge": null
  },
  {
    "id": 54,
    "name": "Everest Chilli Powder",
    "qty": "100 g",
    "price": 55,
    "mrp": 65,
    "emoji": "🌶️",
    "cat": "masala",
    "badge": null
  },
  {
    "id": 55,
    "name": "Kissan Mixed Fruit Jam",
    "qty": "500 g",
    "price": 135,
    "mrp": 155,
    "emoji": "🍓",
    "cat": "sauces",
    "badge": null
  },
  {
    "id": 56,
    "name": "Maggi Tomato Ketchup",
    "qty": "900 g",
    "price": 150,
    "mrp": 175,
    "emoji": "🍅",
    "cat": "sauces",
    "badge": null
  },
  {
    "id": 57,
    "name": "Nutella",
    "qty": "180 g",
    "price": 269,
    "mrp": 310,
    "emoji": "🍫",
    "cat": "sauces",
    "badge": "hot"
  },
  {
    "id": 58,
    "name": "Amul Peanut Butter",
    "qty": "300 g",
    "price": 149,
    "mrp": 175,
    "emoji": "🥜",
    "cat": "sauces",
    "badge": null
  },
  {
    "id": 59,
    "name": "Chicken Breast Boneless",
    "qty": "500 g",
    "price": 179,
    "mrp": 210,
    "emoji": "🍗",
    "cat": "meat",
    "badge": "fresh"
  },
  {
    "id": 60,
    "name": "Country Delight Brown Eggs",
    "qty": "6 pcs",
    "price": 58,
    "mrp": 65,
    "emoji": "🥚",
    "cat": "meat",
    "badge": "fresh"
  },
  {
    "id": 61,
    "name": "Rohu Fish Curry Cut",
    "qty": "500 g",
    "price": 149,
    "mrp": 180,
    "emoji": "🐟",
    "cat": "meat",
    "badge": null
  },
  {
    "id": 62,
    "name": "Dabur Honey",
    "qty": "250 g",
    "price": 175,
    "mrp": 200,
    "emoji": "🍯",
    "cat": "organic",
    "badge": "fresh"
  },
  {
    "id": 63,
    "name": "Saffola Gold Oil",
    "qty": "1 L",
    "price": 200,
    "mrp": 230,
    "emoji": "🌻",
    "cat": "organic",
    "badge": null
  },
  {
    "id": 64,
    "name": "Pampers Pants (S)",
    "qty": "40 pcs",
    "price": 549,
    "mrp": 640,
    "emoji": "🍼",
    "cat": "baby",
    "badge": null
  },
  {
    "id": 65,
    "name": "Johnson's Baby Powder",
    "qty": "200 g",
    "price": 155,
    "mrp": 175,
    "emoji": "👶",
    "cat": "baby",
    "badge": null
  },
  {
    "id": 66,
    "name": "Dettol Antiseptic Liquid",
    "qty": "50 ml",
    "price": 55,
    "mrp": 65,
    "emoji": "💊",
    "cat": "pharma",
    "badge": null
  },
  {
    "id": 67,
    "name": "Vicks VapoRub",
    "qty": "25 g",
    "price": 55,
    "mrp": 65,
    "emoji": "💊",
    "cat": "pharma",
    "badge": null
  },
  {
    "id": 68,
    "name": "Surf Excel Easy Wash",
    "qty": "1 kg",
    "price": 185,
    "mrp": 220,
    "emoji": "🧺",
    "cat": "cleaning",
    "badge": "sale"
  },
  {
    "id": 69,
    "name": "Harpic Toilet Cleaner",
    "qty": "500 ml",
    "price": 95,
    "mrp": 115,
    "emoji": "🚿",
    "cat": "cleaning",
    "badge": null
  },
  {
    "id": 70,
    "name": "Vim Dishwash Bar",
    "qty": "200 g",
    "price": 25,
    "mrp": 28,
    "emoji": "🧹",
    "cat": "cleaning",
    "badge": null
  },
  {
    "id": 71,
    "name": "Dove Moisturising Bar",
    "qty": "100 g",
    "price": 45,
    "mrp": 55,
    "emoji": "🧼",
    "cat": "personal",
    "badge": null
  },
  {
    "id": 72,
    "name": "Colgate MaxFresh",
    "qty": "150 g",
    "price": 89,
    "mrp": 100,
    "emoji": "🪥",
    "cat": "personal",
    "badge": null
  },
  {
    "id": 73,
    "name": "Head & Shoulders",
    "qty": "180 ml",
    "price": 189,
    "mrp": 220,
    "emoji": "🧴",
    "cat": "personal",
    "badge": "sale"
  },
  {
    "id": 74,
    "name": "Pedigree Adult Dog Food",
    "qty": "400 g",
    "price": 115,
    "mrp": 135,
    "emoji": "🐕",
    "cat": "pet",
    "badge": null
  },
  {
    "id": 75,
    "name": "Whiskas Cat Food",
    "qty": "85 g",
    "price": 45,
    "mrp": 55,
    "emoji": "🐱",
    "cat": "pet",
    "badge": null
  }
];

// Ensure each product carries its explicit product image path
FALLBACK_PRODUCTS.forEach((p) => {
  if (!p.img && p.id) {
    p.img = `images/products/${p.id}.jpg`;
  }
});
