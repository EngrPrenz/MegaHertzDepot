import { z } from 'zod';

export const hardwareCategorySchema = z.enum([
  'CPU',
  'Motherboard',
  'GPU',
  'RAM',
  'Storage',
  'PSU',
  'Case',
  'Cooling',
  'Monitor',
  'Peripheral',
]);

export const paymentMethodSchema = z.enum(['Cash', 'GCash', 'Maya', 'Card', 'Split']);

export const hardwareSpecsSchema = z
  .object({
    socket: z.string().max(50).optional().nullable(),
    ramType: z.string().max(30).optional().nullable(),
    wattage: z.number().int().min(0).max(5000).optional().nullable(),
    formFactor: z.string().max(30).optional().nullable(),
  })
  .optional()
  .nullable();

export const adjustmentReasonSchema = z.enum(['count', 'sale', 'restock', 'damage', 'other']);

export const productCreatePayloadSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string().min(1).max(255),
  sku: z.string().max(100).optional(),
  category: hardwareCategorySchema.optional(),
  brand: z.string().max(100).optional().nullable(),
  price: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional().nullable(),
  warranty: z.string().max(120).optional().nullable(),
  specs: hardwareSpecsSchema,
  imageUrl: z.string().max(2000).optional().nullable(),
  nameHlc: z.string(),
  skuHlc: z.string().optional(),
  priceHlc: z.string().optional(),
  imageHlc: z.string().optional(),
});

export const productUpdatePayloadSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  sku: z.string().max(100).optional().nullable(),
  category: hardwareCategorySchema.optional(),
  brand: z.string().max(100).optional().nullable(),
  price: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional().nullable(),
  warranty: z.string().max(120).optional().nullable(),
  specs: hardwareSpecsSchema,
  imageUrl: z.string().max(2000).optional().nullable(),
  nameHlc: z.string().optional(),
  skuHlc: z.string().optional(),
  priceHlc: z.string().optional(),
  imageHlc: z.string().optional(),
});

export const productDeletePayloadSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  deletedAt: z.number(),
  deletedHlc: z.string(),
});

export const adjustmentCreatePayloadSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  storeId: z.string().uuid(),
  delta: z.number().int(),
  reason: adjustmentReasonSchema,
  countedPhysical: z.number().int().optional(),
  localStockAtCount: z.number().int().optional(),
  createdAt: z.number(),
  hlc: z.string(),
  deviceId: z.string(),
});

export const saleOrderItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string().min(1),
  sku: z.string().optional().nullable(),
  category: hardwareCategorySchema.optional(),
  warranty: z.string().optional().nullable(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  serialNumbers: z.array(z.string()).optional(),
});

export const orderCreatePayloadSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  receiptNumber: z.string().min(1).max(60),
  customerName: z.string().max(120).optional().nullable(),
  customerPhone: z.string().max(60).optional().nullable(),
  items: z.array(saleOrderItemSchema).min(1),
  subtotal: z.number().min(0),
  discountAmount: z.number().min(0),
  taxRate: z.number().min(0).max(100),
  taxInclusive: z.boolean(),
  taxAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  paymentMethod: paymentMethodSchema,
  amountTendered: z.number().min(0),
  changeDue: z.number().min(0),
  notes: z.string().max(500).optional().nullable(),
  createdAt: z.number(),
  hlc: z.string(),
  deviceId: z.string(),
});

export const mutationTypeSchema = z.enum([
  'product.create',
  'product.update',
  'product.delete',
  'adjustment.create',
  'order.create',
]);

export const mutationItemSchema = z.object({
  mutationId: z.string().uuid(),
  storeId: z.string().uuid(),
  type: mutationTypeSchema,
  payload: z.record(z.any()),
  hlc: z.string(),
  createdAt: z.number(),
});

export const syncPushRequestSchema = z.object({
  deviceId: z.string().min(1),
  mutations: z.array(mutationItemSchema).max(200),
});

export const mutationResultStatusSchema = z.enum(['applied', 'duplicate', 'rejected']);

export const mutationResultSchema = z.object({
  mutationId: z.string().uuid(),
  status: mutationResultStatusSchema,
  reason: z.string().optional(),
});

export const syncPushResponseSchema = z.object({
  results: z.array(mutationResultSchema),
});

export const syncPullQuerySchema = z.object({
  storeId: z.string().uuid(),
  since: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(1000).default(500),
});

export const changeLogItemSchema = z.object({
  seq: z.number(),
  storeId: z.string().uuid(),
  entityType: z.enum(['product', 'adjustment', 'order']),
  entityId: z.string().uuid(),
  op: z.enum(['upsert', 'delete']),
  payload: z.record(z.any()),
  createdAt: z.string(),
});

export const syncPullResponseSchema = z.object({
  changes: z.array(changeLogItemSchema),
  nextSeq: z.number(),
  hasMore: z.boolean(),
});

export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;
export type ProductCreatePayload = z.infer<typeof productCreatePayloadSchema>;
export type ProductUpdatePayload = z.infer<typeof productUpdatePayloadSchema>;
export type ProductDeletePayload = z.infer<typeof productDeletePayloadSchema>;
export type AdjustmentCreatePayload = z.infer<typeof adjustmentCreatePayloadSchema>;
export type OrderCreatePayload = z.infer<typeof orderCreatePayloadSchema>;
export type MutationType = z.infer<typeof mutationTypeSchema>;
export type MutationItem = z.infer<typeof mutationItemSchema>;
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;
export type MutationResult = z.infer<typeof mutationResultSchema>;
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;
export type ChangeLogItem = z.infer<typeof changeLogItemSchema>;
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;
