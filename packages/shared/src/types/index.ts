export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface Store {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface StoreMember {
  storeId: string;
  userId: string;
  role: 'owner' | 'member';
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  sku?: string | null;
  nameHlc: string;
  skuHlc?: string | null;
  deletedAt?: string | null;
  deletedHlc?: string | null;
  updatedSeq?: number;
}

export interface Adjustment {
  id: string;
  productId: string;
  storeId: string;
  delta: number;
  reason: 'count' | 'sale' | 'restock' | 'damage' | 'other';
  countedPhysical?: number | null;
  localStockAtCount?: number | null;
  createdAt: number;
  hlc: string;
  deviceId: string;
  userId: string;
}

export type SyncState = 'offline' | 'syncing' | 'synced' | 'error';
