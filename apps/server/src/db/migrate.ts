import { pool } from './index.js';

export async function runMigrations() {
  console.log('Running database migrations/table verification...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Enable pgcrypto extension for gen_random_uuid
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    // Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff';
    `);

    // Stores
    await client.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Store Members
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_members (
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        PRIMARY KEY (store_id, user_id)
      );
    `);

    // Products
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sku TEXT,
        category TEXT NOT NULL DEFAULT 'Peripheral',
        brand TEXT,
        price DOUBLE PRECISION NOT NULL DEFAULT 0,
        cost_price DOUBLE PRECISION,
        warranty TEXT,
        specs JSONB,
        image_url TEXT,
        name_hlc TEXT NOT NULL,
        sku_hlc TEXT,
        price_hlc TEXT,
        image_hlc TEXT,
        deleted_at TIMESTAMPTZ,
        deleted_hlc TEXT,
        updated_seq BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);

      ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Peripheral';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DOUBLE PRECISION;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS specs JSONB;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS price_hlc TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_hlc TEXT;
    `);

    // Adjustments
    await client.query(`
      CREATE TABLE IF NOT EXISTS adjustments (
        id UUID PRIMARY KEY,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        counted_physical INTEGER,
        local_stock_at_count INTEGER,
        created_at BIGINT NOT NULL,
        hlc TEXT NOT NULL,
        device_id TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_adjustments_product_id ON adjustments(product_id);
      CREATE INDEX IF NOT EXISTS idx_adjustments_store_id ON adjustments(store_id);
    `);

    // Sale Orders
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_orders (
        id UUID PRIMARY KEY,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        receipt_number TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        items JSONB NOT NULL,
        subtotal DOUBLE PRECISION NOT NULL,
        discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        tax_rate DOUBLE PRECISION NOT NULL DEFAULT 12,
        tax_inclusive BOOLEAN NOT NULL DEFAULT true,
        tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        total_amount DOUBLE PRECISION NOT NULL,
        payment_method TEXT NOT NULL,
        amount_tendered DOUBLE PRECISION NOT NULL,
        change_due DOUBLE PRECISION NOT NULL DEFAULT 0,
        notes TEXT,
        created_at BIGINT NOT NULL,
        hlc TEXT NOT NULL,
        device_id TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sale_orders_store_id ON sale_orders(store_id);
    `);

    // Change Log
    await client.query(`
      CREATE TABLE IF NOT EXISTS change_log (
        seq BIGSERIAL PRIMARY KEY,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id UUID NOT NULL,
        op TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_change_log_store_seq ON change_log(store_id, seq);
    `);

    // Applied Mutations
    await client.query(`
      CREATE TABLE IF NOT EXISTS applied_mutations (
        mutation_id UUID PRIMARY KEY,
        device_id TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query('COMMIT');
    console.log('Database tables and indexes verified successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => {
      console.log('Migration completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
