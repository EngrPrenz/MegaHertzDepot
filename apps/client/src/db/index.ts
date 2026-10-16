import Dexie, { Table } from 'dexie';

export interface ProductLocal {
  id: string;
  storeId: string;
  name: string;
  sku?: string;
  nameHlc: string;
  skuHlc?: string;
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

export interface OutboxMutation {
  mutationId: string;
  storeId: string;
  type: 'product.create' | 'product.update' | 'product.delete' | 'adjustment.create';
  payload: any;
  hlc: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface ClientMeta {
  key: string;
  value: any;
}

export class CountwiseDatabase extends Dexie {
  products!: Table<ProductLocal, string>;
  adjustments!: Table<AdjustmentLocal, string>;
  outbox!: Table<OutboxMutation, string>;
  meta!: Table<ClientMeta, string>;

  constructor() {
    super('countwise_db');

    this.version(1).stores({
      products: 'id, storeId, name, sku, nameHlc, deletedAt, serverSeq',
      adjustments: 'id, productId, storeId, reason, createdAt, hlc, deviceId',
      outbox: 'mutationId, storeId, type, createdAt, attempts',
      meta: 'key',
    });
  }
}

export const localDb = new CountwiseDatabase();
