export type HardwareCategory =
  | 'CPU'
  | 'Motherboard'
  | 'GPU'
  | 'RAM'
  | 'Storage'
  | 'PSU'
  | 'Case'
  | 'Cooling'
  | 'Monitor'
  | 'Peripheral'
  | 'Laptop';

export type PaymentMethod = 'Cash' | 'GCash' | 'Maya' | 'Card' | 'Split';

export interface HardwareSpecs {
  socket?: string | null; // e.g., 'AM5', 'AM4', 'LGA1700'
  ramType?: string | null; // e.g., 'DDR5', 'DDR4'
  wattage?: number | null; // TDP watts for components, or capacity watts for PSU
  formFactor?: string | null; // e.g., 'ATX', 'mATX', 'ITX'
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: 'staff' | 'customer';
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
  category?: HardwareCategory;
  brand?: string | null;
  price?: number; // PHP unit price
  costPrice?: number | null;
  warranty?: string | null; // e.g. '3 Years Supplier Warranty'
  specs?: HardwareSpecs | null;
  imageUrl?: string | null;
  nameHlc: string;
  skuHlc?: string | null;
  priceHlc?: string | null;
  imageHlc?: string | null;
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

export interface SaleOrderItem {
  productId: string;
  productName: string;
  sku?: string | null;
  category?: HardwareCategory;
  warranty?: string | null;
  quantity: number;
  unitPrice: number; // Locked-in snapshot price at time of sale
  serialNumbers?: string[]; // Optional S/N recorded at register for warranty/RMA
}

export interface SaleOrder {
  id: string;
  storeId: string;
  receiptNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  items: SaleOrderItem[];
  subtotal: number;
  discountAmount: number;
  taxRate: number; // e.g. 12 for 12% VAT
  taxInclusive: boolean;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  amountTendered: number;
  changeDue: number;
  notes?: string | null;
  createdAt: number;
  hlc: string;
  deviceId: string;
  userId: string;
  serverSeq?: number;
}

export type SyncState = 'offline' | 'syncing' | 'synced' | 'error';
