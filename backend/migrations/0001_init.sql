-- Migration: 0001_init.sql
-- Initial Zipli database schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(160)  NOT NULL UNIQUE,
  password_hash VARCHAR(200)  NOT NULL,
  phone         VARCHAR(20),
  address       VARCHAR(255),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id    VARCHAR(40) PRIMARY KEY,
  name  VARCHAR(120) NOT NULL,
  emoji VARCHAR(10)  NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(160) NOT NULL,
  qty_label   VARCHAR(40)  NOT NULL,
  price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  mrp         NUMERIC(10,2) NOT NULL CHECK (mrp >= 0),
  emoji       VARCHAR(10),
  category_id VARCHAR(40)  NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  badge       VARCHAR(20),
  image_url   VARCHAR(255) NOT NULL DEFAULT '/images/placeholder.jpg',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(LOWER(name));

CREATE TABLE IF NOT EXISTS cart_items (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_total    NUMERIC(10,2) NOT NULL,
  delivery_fee  NUMERIC(10,2) NOT NULL DEFAULT 0,
  grand_total   NUMERIC(10,2) NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'placed',
  delivery_address VARCHAR(255),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name        VARCHAR(160) NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0)
);
