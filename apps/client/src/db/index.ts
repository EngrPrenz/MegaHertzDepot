import Dexie, { Table } from 'dexie';
import {
  HardwareCategory,
  HardwareSpecs,
  PaymentMethod,
  SaleOrderItem,
} from '@countwise/shared';

export interface ProductLocal {
  id: string;
  storeId: string;
  name: string;
  sku?: string;
  category?: HardwareCategory;
  brand?: string;
  price?: number;
  costPrice?: number;
  warranty?: string;
  specs?: HardwareSpecs;
  imageUrl?: string;
  nameHlc: string;
  skuHlc?: string;
  priceHlc?: string;
  imageHlc?: string;
  deletedAt?: number;
  deletedHlc?: string;
  serverSeq?: number;
}

export interface AdjustmentLocal {
  id: string;
  productId: string;
  storeId: string;
  delta: number;
  reason: 'count' | 'sale' | 'restock' | 'damage' | 'other';
  countedPhysical?: number;
  localStockAtCount?: number;
  createdAt: number;
  hlc: string;
  deviceId: string;
  userId: string;
}

export interface SaleOrderLocal {
  id: string;
  storeId: string;
  receiptNumber: string;
  customerName?: string;
  customerPhone?: string;
  items: SaleOrderItem[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxInclusive: boolean;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  amountTendered: number;
  changeDue: number;
  notes?: string;
  createdAt: number;
  hlc: string;
  deviceId: string;
  userId: string;
  serverSeq?: number;
}

export interface OutboxMutation {
  mutationId: string;
  storeId: string;
  type:
    | 'product.create'
    | 'product.update'
    | 'product.delete'
    | 'adjustment.create'
    | 'order.create';
  entityId?: string;
  payload: any;
  hlc: string;
  createdAt: number;
  attempts: number;
  status?: 'pending' | 'rejected';
  lastError?: string;
}

export interface LocalStoreRecord {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'member';
  createdAt: string;
}

export interface ClientMeta {
  key: string;
  value: any;
}

export class CountwiseDatabase extends Dexie {
  products!: Table<ProductLocal, string>;
  adjustments!: Table<AdjustmentLocal, string>;
  orders!: Table<SaleOrderLocal, string>;
  outbox!: Table<OutboxMutation, string>;
  storesTable!: Table<LocalStoreRecord, string>;
  meta!: Table<ClientMeta, string>;

  constructor(dbName: string = 'countwise_db') {
    super(dbName);

    this.version(1).stores({
      products: 'id, storeId, name, sku, nameHlc, deletedAt, serverSeq',
      adjustments: 'id, productId, storeId, reason, createdAt, hlc, deviceId',
      outbox: 'mutationId, storeId, type, createdAt, attempts',
      meta: 'key',
    });

    this.version(2)
      .stores({
        products: 'id, storeId, name, sku, nameHlc, deletedAt, serverSeq',
        adjustments: 'id, productId, storeId, reason, createdAt, hlc, deviceId',
        outbox: 'mutationId, storeId, entityId, type, status, createdAt, attempts',
        storesTable: 'id, name',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('outbox')
          .toCollection()
          .modify((item: OutboxMutation) => {
            if (!item.status) {
              item.status = 'pending';
            }
            if (!item.entityId && item.payload) {
              item.entityId = item.payload.productId || item.payload.id;
            }
          });

        await tx
          .table('products')
          .toCollection()
          .modify((product: ProductLocal) => {
            if (!product.skuHlc) {
              product.skuHlc = product.nameHlc;
            }
          });
      });

    // Version 3: MegaHertz Depot PC Hardware POS upgrade (orders table + hardware fields)
    this.version(3)
      .stores({
        products: 'id, storeId, category, brand, name, sku, nameHlc, deletedAt, serverSeq',
        adjustments: 'id, productId, storeId, reason, createdAt, hlc, deviceId',
        orders: 'id, storeId, receiptNumber, paymentMethod, createdAt, hlc, deviceId',
        outbox: 'mutationId, storeId, entityId, type, status, createdAt, attempts',
        storesTable: 'id, name',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('products')
          .toCollection()
          .modify((product: ProductLocal) => {
            if (!product.category) {
              product.category = 'Peripheral';
            }
            if (product.price === undefined) {
              product.price = 0;
            }
            if (!product.priceHlc) {
              product.priceHlc = product.nameHlc;
            }
          });
      });
  }
}

export const localDb = new CountwiseDatabase();
