import { z } from 'zod';

export const adjustmentReasonSchema = z.enum(['count', 'sale', 'restock', 'damage', 'other']);

export const productCreatePayloadSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string().min(1).max(255),
  sku: z.string().max(100).optional(),
  nameHlc: z.string(),
  skuHlc: z.string().optional(),
});

export const productUpdatePayloadSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  sku: z.string().max(100).optional().nullable(),
  nameHlc: z.string().optional(),
  skuHlc: z.string().optional(),
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

export const mutationTypeSchema = z.enum([
  'product.create',
  'product.update',
  'product.delete',
  'adjustment.create',
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
  entityType: z.enum(['product', 'adjustment']),
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
export type MutationType = z.infer<typeof mutationTypeSchema>;
export type MutationItem = z.infer<typeof mutationItemSchema>;
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;
export type MutationResult = z.infer<typeof mutationResultSchema>;
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;
export type ChangeLogItem = z.infer<typeof changeLogItemSchema>;
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;
