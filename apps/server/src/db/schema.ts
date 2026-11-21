import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  doublePrecision,
  boolean,
  bigserial,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('staff'), // 'staff' | 'customer'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Stores
export const stores = pgTable('stores', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Store Members
export const storeMembers = pgTable(
  'store_members',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'), // 'owner' | 'member'
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.userId] }),
  ]
);

// Products (Computer Hardware Catalog)
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(), // Client-generated UUID
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sku: text('sku'),
    category: text('category').notNull().default('Peripheral'),
    brand: text('brand'),
    price: doublePrecision('price').notNull().default(0),
    costPrice: doublePrecision('cost_price'),
    warranty: text('warranty'),
    specs: jsonb('specs'),
    imageUrl: text('image_url'),
    nameHlc: text('name_hlc').notNull(),
    skuHlc: text('sku_hlc'),
    priceHlc: text('price_hlc'),
    imageHlc: text('image_hlc'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedHlc: text('deleted_hlc'),
    updatedSeq: bigint('updated_seq', { mode: 'number' }),
  },
  (table) => [
    index('idx_products_store_id').on(table.storeId),
  ]
);

// Adjustments (Append-only stock movements)
export const adjustments = pgTable(
  'adjustments',
  {
    id: uuid('id').primaryKey(), // Client-generated UUID
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(), // 'count' | 'sale' | 'restock' | 'damage' | 'other'
    countedPhysical: integer('counted_physical'),
    localStockAtCount: integer('local_stock_at_count'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    hlc: text('hlc').notNull(),
    deviceId: text('device_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('idx_adjustments_product_id').on(table.productId),
    index('idx_adjustments_store_id').on(table.storeId),
  ]
);

// Sale Orders (Append-only POS receipts & warranty records)
export const saleOrders = pgTable(
  'sale_orders',
  {
    id: uuid('id').primaryKey(), // Client-generated UUID
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    receiptNumber: text('receipt_number').notNull(),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    items: jsonb('items').notNull(), // SaleOrderItem[] with serialNumbers
    subtotal: doublePrecision('subtotal').notNull(),
    discountAmount: doublePrecision('discount_amount').notNull().default(0),
    taxRate: doublePrecision('tax_rate').notNull().default(12),
    taxInclusive: boolean('tax_inclusive').notNull().default(true),
    taxAmount: doublePrecision('tax_amount').notNull().default(0),
    totalAmount: doublePrecision('total_amount').notNull(),
    paymentMethod: text('payment_method').notNull(),
    amountTendered: doublePrecision('amount_tendered').notNull(),
    changeDue: doublePrecision('change_due').notNull().default(0),
    notes: text('notes'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    hlc: text('hlc').notNull(),
    deviceId: text('device_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('idx_sale_orders_store_id').on(table.storeId),
  ]
);

// Change Log (Monotonic seq sequence authority)
export const changeLog = pgTable(
  'change_log',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // 'product' | 'adjustment' | 'order'
    entityId: uuid('entity_id').notNull(),
    op: text('op').notNull(), // 'upsert' | 'delete'
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_change_log_store_seq').on(table.storeId, table.seq),
  ]
);

// Applied Mutations (Idempotency ledger)
export const appliedMutations = pgTable('applied_mutations', {
  mutationId: uuid('mutation_id').primaryKey(),
  deviceId: text('device_id').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedStores: many(stores),
  memberships: many(storeMembers),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  owner: one(users, {
    fields: [stores.ownerId],
    references: [users.id],
  }),
  members: many(storeMembers),
  products: many(products),
  adjustments: many(adjustments),
  saleOrders: many(saleOrders),
  changeLogs: many(changeLog),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  store: one(stores, {
    fields: [products.storeId],
    references: [stores.id],
  }),
  adjustments: many(adjustments),
}));

export const adjustmentsRelations = relations(adjustments, ({ one }) => ({
  product: one(products, {
    fields: [adjustments.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [adjustments.storeId],
    references: [stores.id],
  }),
  user: one(users, {
    fields: [adjustments.userId],
    references: [users.id],
  }),
}));
