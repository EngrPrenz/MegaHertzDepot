import { eq, and, gt, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  products,
  adjustments,
  saleOrders,
  changeLog,
  appliedMutations,
  storeMembers,
} from '../db/schema.js';
import { isPostgresAvailable, memoryDb } from '../db/memory-fallback.js';
import { config } from '../config.js';
import {
  SyncPushRequest,
  SyncPushResponse,
  MutationResult,
  SyncPullQuery,
  SyncPullResponse,
  productCreatePayloadSchema,
  productUpdatePayloadSchema,
  productDeletePayloadSchema,
  adjustmentCreatePayloadSchema,
  orderCreatePayloadSchema,
  orderUpdatePayloadSchema,
  mergeProductCreate,
  mergeProductUpdate,
  mergeProductDelete,
  clampHlc,
  HybridLogicalClock,
  Product,
  Adjustment,
  SaleOrder,
  PaymentMethod,
  HardwareCategory,
  HardwareSpecs,
} from '@countwise/shared';

function rowToProduct(existingRow: any): Product {
  return {
    id: existingRow.id,
    storeId: existingRow.storeId,
    name: existingRow.name,
    sku: existingRow.sku,
    category: (existingRow.category as HardwareCategory) || 'Peripheral',
    brand: existingRow.brand ?? null,
    price: Number(existingRow.price ?? 0),
    costPrice: existingRow.costPrice !== null && existingRow.costPrice !== undefined ? Number(existingRow.costPrice) : null,
    warranty: existingRow.warranty ?? null,
    specs: (existingRow.specs as HardwareSpecs) ?? null,
    imageUrl: existingRow.imageUrl ?? null,
    nameHlc: existingRow.nameHlc,
    skuHlc: existingRow.skuHlc,
    priceHlc: existingRow.priceHlc ?? existingRow.nameHlc,
    imageHlc: existingRow.imageHlc ?? null,
    deletedAt: existingRow.deletedAt ? existingRow.deletedAt.toISOString() : null,
    deletedHlc: existingRow.deletedHlc,
    updatedSeq: existingRow.updatedSeq ?? undefined,
  };
}

export class SyncService {
  /**
   * Processes a batch of client outbox mutations idempotently with per-field LWW,
   * tombstone delete precedence, append-only POS orders, and commutative stock delta adjustments.
   */
  public static async push(
    userId: string,
    request: SyncPushRequest,
    serverNow: number = Date.now()
  ): Promise<SyncPushResponse> {
    const usePg = await isPostgresAvailable();
    if (!usePg) {
      return this.pushMemory(userId, request, serverNow);
    }
    return this.pushPostgres(userId, request, serverNow);
  }

  /**
   * Cursor-based pull (`GET /sync/pull?storeId=...&since=<seq>&limit=500`).
   * Returns ordered changes with `seq > since`, `nextSeq`, and `hasMore`.
   */
  public static async pull(userId: string, query: SyncPullQuery): Promise<SyncPullResponse> {
    const usePg = await isPostgresAvailable();
    if (!usePg) {
      return this.pullMemory(userId, query);
    }
    return this.pullPostgres(userId, query);
  }

  private static pushMemory(
    userId: string,
    request: SyncPushRequest,
    serverNow: number
  ): SyncPushResponse {
    const results: MutationResult[] = [];

    for (const mutation of request.mutations) {
      // 1. Idempotency check
      if (memoryDb.appliedMutations.has(mutation.mutationId)) {
        results.push({
          mutationId: mutation.mutationId,
          status: 'duplicate',
        });
        continue;
      }

      // 2. Authorize store membership (auto-provision in development only)
      let isMember = memoryDb.storeMembers.some(
        (m) => m.storeId === mutation.storeId && m.userId === userId
      );
      if (
        config.NODE_ENV === 'development' &&
        !isMember &&
        !memoryDb.stores.has(mutation.storeId)
      ) {
        memoryDb.stores.set(mutation.storeId, {
          id: mutation.storeId,
          name: 'MegaHertz Depot — Branch',
          ownerId: userId,
          createdAt: new Date(serverNow),
        });
        memoryDb.storeMembers.push({
          storeId: mutation.storeId,
          userId,
          role: 'owner',
        });
        isMember = true;
      }
      if (!isMember) {
        results.push({
          mutationId: mutation.mutationId,
          status: 'rejected',
          reason: 'Forbidden: user does not belong to target store',
        });
        continue;
      }

      // 3. Validate & apply mutation with conflict rules
      try {
        if (mutation.type === 'product.create') {
          const parsed = productCreatePayloadSchema.safeParse(mutation.payload);
          if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Invalid product.create payload',
            });
            continue;
          }

          const existing = memoryDb.products.get(parsed.data.id);
          if (existing && existing.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Product ID belongs to a different store',
            });
            continue;
          }

          const merged = mergeProductCreate(existing, parsed.data, serverNow);
          const seq = memoryDb.nextSeq();
          const finalProduct: Product = {
            ...merged.product,
            updatedSeq: seq,
          };
          memoryDb.products.set(finalProduct.id, finalProduct);

          memoryDb.changeLog.push({
            seq,
            storeId: mutation.storeId,
            entityType: 'product',
            entityId: finalProduct.id,
            op: finalProduct.deletedAt ? 'delete' : 'upsert',
            payload: finalProduct as any,
            createdAt: new Date(serverNow).toISOString(),
          });

          memoryDb.appliedMutations.set(mutation.mutationId, {
            mutationId: mutation.mutationId,
            deviceId: request.deviceId,
            appliedAt: new Date(serverNow),
          });

          results.push({ mutationId: mutation.mutationId, status: 'applied' });
        } else if (mutation.type === 'product.update') {
          const parsed = productUpdatePayloadSchema.safeParse(mutation.payload);
          if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Invalid product.update payload',
            });
            continue;
          }

          const existing = memoryDb.products.get(parsed.data.id);
          if (!existing || existing.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Product not found in store',
            });
            continue;
          }

          const merged = mergeProductUpdate(existing, parsed.data, mutation.hlc, serverNow);
          const seq = memoryDb.nextSeq();
          const finalProduct: Product = {
            ...merged.product,
            updatedSeq: seq,
          };
          memoryDb.products.set(finalProduct.id, finalProduct);

          memoryDb.changeLog.push({
            seq,
            storeId: mutation.storeId,
            entityType: 'product',
            entityId: finalProduct.id,
            op: finalProduct.deletedAt ? 'delete' : 'upsert',
            payload: finalProduct as any,
            createdAt: new Date(serverNow).toISOString(),
          });

          memoryDb.appliedMutations.set(mutation.mutationId, {
            mutationId: mutation.mutationId,
            deviceId: request.deviceId,
            appliedAt: new Date(serverNow),
          });

          results.push({ mutationId: mutation.mutationId, status: 'applied' });
        } else if (mutation.type === 'product.delete') {
          const parsed = productDeletePayloadSchema.safeParse(mutation.payload);
          if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Invalid product.delete payload',
            });
            continue;
          }

          const existing = memoryDb.products.get(parsed.data.id);
          if (!existing || existing.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Product not found in store',
            });
            continue;
          }

          const merged = mergeProductDelete(existing, parsed.data, serverNow);
          const seq = memoryDb.nextSeq();
          const finalProduct: Product = {
            ...merged.product,
            updatedSeq: seq,
          };
          memoryDb.products.set(finalProduct.id, finalProduct);

          memoryDb.changeLog.push({
            seq,
            storeId: mutation.storeId,
            entityType: 'product',
            entityId: finalProduct.id,
            op: 'delete',
            payload: finalProduct as any,
            createdAt: new Date(serverNow).toISOString(),
          });

          memoryDb.appliedMutations.set(mutation.mutationId, {
            mutationId: mutation.mutationId,
            deviceId: request.deviceId,
            appliedAt: new Date(serverNow),
          });

          results.push({ mutationId: mutation.mutationId, status: 'applied' });
        } else if (mutation.type === 'adjustment.create') {
          const parsed = adjustmentCreatePayloadSchema.safeParse(mutation.payload);
          if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Invalid adjustment.create payload',
            });
            continue;
          }

          const product = memoryDb.products.get(parsed.data.productId);
          if (!product || product.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Target product not found in store',
            });
            continue;
          }

          if (!memoryDb.adjustments.has(parsed.data.id)) {
            const clampedHlc = clampHlc(parsed.data.hlc, serverNow);
            const adj: Adjustment = {
              id: parsed.data.id,
              productId: parsed.data.productId,
              storeId: parsed.data.storeId,
              delta: parsed.data.delta,
              reason: parsed.data.reason,
              countedPhysical: parsed.data.countedPhysical ?? null,
              localStockAtCount: parsed.data.localStockAtCount ?? null,
              createdAt: parsed.data.createdAt,
              hlc: clampedHlc,
              deviceId: parsed.data.deviceId,
              userId,
            };
            memoryDb.adjustments.set(adj.id, adj);

            const seq = memoryDb.nextSeq();
            memoryDb.changeLog.push({
              seq,
              storeId: mutation.storeId,
              entityType: 'adjustment',
              entityId: adj.id,
              op: 'upsert',
              payload: adj as any,
              createdAt: new Date(serverNow).toISOString(),
            });
          }

          memoryDb.appliedMutations.set(mutation.mutationId, {
            mutationId: mutation.mutationId,
            deviceId: request.deviceId,
            appliedAt: new Date(serverNow),
          });

          results.push({ mutationId: mutation.mutationId, status: 'applied' });
        } else if (mutation.type === 'order.create') {
          const parsed = orderCreatePayloadSchema.safeParse(mutation.payload);
          if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Invalid order.create payload',
            });
            continue;
          }

          const computedSubtotal = parsed.data.items.reduce(
            (sum, item) => sum + item.quantity * item.unitPrice,
            0
          );
          if (
            parsed.data.discountAmount > parsed.data.subtotal + 0.01 ||
            Math.abs(computedSubtotal - parsed.data.subtotal) > 1 ||
            parsed.data.totalAmount < 0 ||
            parsed.data.totalAmount > parsed.data.subtotal + parsed.data.taxAmount + 500
          ) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Order subtotal or discount validation failed',
            });
            continue;
          }

          if (!memoryDb.orders.has(parsed.data.id)) {
            const clampedHlc = clampHlc(parsed.data.hlc, serverNow);
            const seq = memoryDb.nextSeq();
            const order: SaleOrder = {
              id: parsed.data.id,
              storeId: parsed.data.storeId,
              receiptNumber: parsed.data.receiptNumber,
              customerName: parsed.data.customerName ?? null,
              customerPhone: parsed.data.customerPhone ?? null,
              items: parsed.data.items,
              subtotal: parsed.data.subtotal,
              discountAmount: parsed.data.discountAmount,
              taxRate: parsed.data.taxRate,
              taxInclusive: parsed.data.taxInclusive,
              taxAmount: parsed.data.taxAmount,
              totalAmount: parsed.data.totalAmount,
              paymentMethod: parsed.data.paymentMethod,
              amountTendered: parsed.data.amountTendered,
              changeDue: parsed.data.changeDue,
              notes: parsed.data.notes ?? null,
              createdAt: parsed.data.createdAt,
              hlc: clampedHlc,
              deviceId: parsed.data.deviceId,
              userId,
              serverSeq: seq,
            };
            memoryDb.orders.set(order.id, order);

            memoryDb.changeLog.push({
              seq,
              storeId: mutation.storeId,
              entityType: 'order',
              entityId: order.id,
              op: 'upsert',
              payload: order as any,
              createdAt: new Date(serverNow).toISOString(),
            });
          }

          memoryDb.appliedMutations.set(mutation.mutationId, {
            mutationId: mutation.mutationId,
            deviceId: request.deviceId,
            appliedAt: new Date(serverNow),
          });

          results.push({ mutationId: mutation.mutationId, status: 'applied' });
        } else if (mutation.type === 'order.update') {
          const parsed = orderUpdatePayloadSchema.safeParse(mutation.payload);
          if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Invalid order.update payload',
            });
            continue;
          }

          const existing = memoryDb.orders.get(parsed.data.id);
          if (!existing || existing.storeId !== mutation.storeId) {
            results.push({
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Order not found in store',
            });
            continue;
          }

          const clampedHlc = clampHlc(parsed.data.hlc, serverNow);
          if (HybridLogicalClock.compare(clampedHlc, existing.hlc) >= 0) {
            const seq = memoryDb.nextSeq();
            const updatedOrder: SaleOrder = {
              ...existing,
              ...(parsed.data.items !== undefined ? { items: parsed.data.items } : {}),
              ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
              hlc: clampedHlc,
              serverSeq: seq,
            };
            memoryDb.orders.set(updatedOrder.id, updatedOrder);

            memoryDb.changeLog.push({
              seq,
              storeId: mutation.storeId,
              entityType: 'order',
              entityId: updatedOrder.id,
              op: 'upsert',
              payload: updatedOrder as any,
              createdAt: new Date(serverNow).toISOString(),
            });
          }

          memoryDb.appliedMutations.set(mutation.mutationId, {
            mutationId: mutation.mutationId,
            deviceId: request.deviceId,
            appliedAt: new Date(serverNow),
          });

          results.push({ mutationId: mutation.mutationId, status: 'applied' });
        }
      } catch (err: any) {
        results.push({
          mutationId: mutation.mutationId,
          status: 'rejected',
          reason: err.message || 'Mutation application failed',
        });
      }
    }

    return { results };
  }

  private static pullMemory(userId: string, query: SyncPullQuery): SyncPullResponse {
    let isMember = memoryDb.storeMembers.some(
      (m) => m.storeId === query.storeId && m.userId === userId
    );
    if (
      config.NODE_ENV === 'development' &&
      !isMember &&
      !memoryDb.stores.has(query.storeId)
    ) {
      memoryDb.stores.set(query.storeId, {
        id: query.storeId,
        name: 'MegaHertz Depot — Branch',
        ownerId: userId,
        createdAt: new Date(),
      });
      memoryDb.storeMembers.push({
        storeId: query.storeId,
        userId,
        role: 'owner',
      });
      isMember = true;
    }
    if (!isMember) {
      const err: any = new Error('Forbidden: user is not a member of this store');
      err.status = 403;
      throw err;
    }

    const matching = memoryDb.changeLog
      .filter((c) => c.storeId === query.storeId && c.seq > query.since)
      .sort((a, b) => a.seq - b.seq);

    const hasMore = matching.length > query.limit;
    const changes = matching.slice(0, query.limit);
    const nextSeq = changes.length > 0 ? changes[changes.length - 1].seq : query.since;

    return {
      changes,
      nextSeq,
      hasMore,
    };
  }

  private static async pushPostgres(
    userId: string,
    request: SyncPushRequest,
    serverNow: number
  ): Promise<SyncPushResponse> {
    const results: MutationResult[] = [];

    for (const mutation of request.mutations) {
      try {
        const mutationResult = await db.transaction(async (tx): Promise<MutationResult> => {
          // 1. Idempotency check
          const existingMutation = await tx.query.appliedMutations.findFirst({
            where: eq(appliedMutations.mutationId, mutation.mutationId),
          });
          if (existingMutation) {
            return { mutationId: mutation.mutationId, status: 'duplicate' };
          }

          // 2. Authorize store membership
          const membership = await tx.query.storeMembers.findFirst({
            where: and(
              eq(storeMembers.storeId, mutation.storeId),
              eq(storeMembers.userId, userId)
            ),
          });
          if (!membership) {
            return {
              mutationId: mutation.mutationId,
              status: 'rejected',
              reason: 'Forbidden: user does not belong to target store',
            };
          }

          // 3. Apply mutation
          if (mutation.type === 'product.create') {
            const parsed = productCreatePayloadSchema.safeParse(mutation.payload);
            if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Invalid product.create payload',
              };
            }

            const existingRow = await tx.query.products.findFirst({
              where: eq(products.id, parsed.data.id),
            });
            if (existingRow && existingRow.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Product ID belongs to a different store',
              };
            }

            const existingProduct = existingRow ? rowToProduct(existingRow) : undefined;
            const merged = mergeProductCreate(existingProduct, parsed.data, serverNow);

            const [logEntry] = await tx
              .insert(changeLog)
              .values({
                storeId: mutation.storeId,
                entityType: 'product',
                entityId: merged.product.id,
                op: merged.product.deletedAt ? 'delete' : 'upsert',
                payload: merged.product,
              })
              .returning();

            const finalProduct = { ...merged.product, updatedSeq: logEntry.seq };

            await tx
              .insert(products)
              .values({
                id: finalProduct.id,
                storeId: finalProduct.storeId,
                name: finalProduct.name,
                sku: finalProduct.sku ?? null,
                category: finalProduct.category ?? 'Peripheral',
                brand: finalProduct.brand ?? null,
                price: finalProduct.price ?? 0,
                costPrice: finalProduct.costPrice ?? null,
                warranty: finalProduct.warranty ?? null,
                specs: finalProduct.specs ?? null,
                imageUrl: finalProduct.imageUrl ?? null,
                nameHlc: finalProduct.nameHlc,
                skuHlc: finalProduct.skuHlc ?? null,
                priceHlc: finalProduct.priceHlc ?? finalProduct.nameHlc,
                imageHlc: finalProduct.imageHlc ?? null,
                deletedAt: finalProduct.deletedAt ? new Date(finalProduct.deletedAt) : null,
                deletedHlc: finalProduct.deletedHlc ?? null,
                updatedSeq: logEntry.seq,
              })
              .onConflictDoUpdate({
                target: products.id,
                set: {
                  name: finalProduct.name,
                  sku: finalProduct.sku ?? null,
                  category: finalProduct.category ?? 'Peripheral',
                  brand: finalProduct.brand ?? null,
                  price: finalProduct.price ?? 0,
                  costPrice: finalProduct.costPrice ?? null,
                  warranty: finalProduct.warranty ?? null,
                  specs: finalProduct.specs ?? null,
                  imageUrl: finalProduct.imageUrl ?? null,
                  nameHlc: finalProduct.nameHlc,
                  skuHlc: finalProduct.skuHlc ?? null,
                  priceHlc: finalProduct.priceHlc ?? finalProduct.nameHlc,
                  imageHlc: finalProduct.imageHlc ?? null,
                  deletedAt: finalProduct.deletedAt ? new Date(finalProduct.deletedAt) : null,
                  deletedHlc: finalProduct.deletedHlc ?? null,
                  updatedSeq: logEntry.seq,
                },
              });

            await tx
              .update(changeLog)
              .set({ payload: finalProduct })
              .where(eq(changeLog.seq, logEntry.seq));

            await tx.insert(appliedMutations).values({
              mutationId: mutation.mutationId,
              deviceId: request.deviceId,
            });

            return { mutationId: mutation.mutationId, status: 'applied' };
          }

          if (mutation.type === 'product.update') {
            const parsed = productUpdatePayloadSchema.safeParse(mutation.payload);
            if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Invalid product.update payload',
              };
            }

            const existingRow = await tx.query.products.findFirst({
              where: eq(products.id, parsed.data.id),
            });
            if (!existingRow || existingRow.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Product not found in store',
              };
            }

            const existingProduct = rowToProduct(existingRow);
            const merged = mergeProductUpdate(
              existingProduct,
              parsed.data,
              mutation.hlc,
              serverNow
            );

            const [logEntry] = await tx
              .insert(changeLog)
              .values({
                storeId: mutation.storeId,
                entityType: 'product',
                entityId: merged.product.id,
                op: merged.product.deletedAt ? 'delete' : 'upsert',
                payload: merged.product,
              })
              .returning();

            const finalProduct = { ...merged.product, updatedSeq: logEntry.seq };

            await tx
              .update(products)
              .set({
                name: finalProduct.name,
                sku: finalProduct.sku ?? null,
                category: finalProduct.category ?? 'Peripheral',
                brand: finalProduct.brand ?? null,
                price: finalProduct.price ?? 0,
                costPrice: finalProduct.costPrice ?? null,
                warranty: finalProduct.warranty ?? null,
                specs: finalProduct.specs ?? null,
                imageUrl: finalProduct.imageUrl ?? null,
                nameHlc: finalProduct.nameHlc,
                skuHlc: finalProduct.skuHlc ?? null,
                priceHlc: finalProduct.priceHlc ?? finalProduct.nameHlc,
                imageHlc: finalProduct.imageHlc ?? null,
                updatedSeq: logEntry.seq,
              })
              .where(eq(products.id, finalProduct.id));

            await tx
              .update(changeLog)
              .set({ payload: finalProduct })
              .where(eq(changeLog.seq, logEntry.seq));

            await tx.insert(appliedMutations).values({
              mutationId: mutation.mutationId,
              deviceId: request.deviceId,
            });

            return { mutationId: mutation.mutationId, status: 'applied' };
          }

          if (mutation.type === 'product.delete') {
            const parsed = productDeletePayloadSchema.safeParse(mutation.payload);
            if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Invalid product.delete payload',
              };
            }

            const existingRow = await tx.query.products.findFirst({
              where: eq(products.id, parsed.data.id),
            });
            if (!existingRow || existingRow.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Product not found in store',
              };
            }

            const existingProduct = rowToProduct(existingRow);
            const merged = mergeProductDelete(existingProduct, parsed.data, serverNow);

            const [logEntry] = await tx
              .insert(changeLog)
              .values({
                storeId: mutation.storeId,
                entityType: 'product',
                entityId: merged.product.id,
                op: 'delete',
                payload: merged.product,
              })
              .returning();

            const finalProduct = { ...merged.product, updatedSeq: logEntry.seq };

            await tx
              .update(products)
              .set({
                deletedAt: finalProduct.deletedAt ? new Date(finalProduct.deletedAt) : new Date(),
                deletedHlc: finalProduct.deletedHlc ?? null,
                updatedSeq: logEntry.seq,
              })
              .where(eq(products.id, finalProduct.id));

            await tx
              .update(changeLog)
              .set({ payload: finalProduct })
              .where(eq(changeLog.seq, logEntry.seq));

            await tx.insert(appliedMutations).values({
              mutationId: mutation.mutationId,
              deviceId: request.deviceId,
            });

            return { mutationId: mutation.mutationId, status: 'applied' };
          }

          if (mutation.type === 'adjustment.create') {
            const parsed = adjustmentCreatePayloadSchema.safeParse(mutation.payload);
            if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Invalid adjustment.create payload',
              };
            }

            const productRow = await tx.query.products.findFirst({
              where: eq(products.id, parsed.data.productId),
            });
            if (!productRow || productRow.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Target product not found in store',
              };
            }

            const existingAdj = await tx.query.adjustments.findFirst({
              where: eq(adjustments.id, parsed.data.id),
            });

            if (!existingAdj) {
              const clampedHlc = clampHlc(parsed.data.hlc, serverNow);
              const adjPayload: Adjustment = {
                id: parsed.data.id,
                productId: parsed.data.productId,
                storeId: parsed.data.storeId,
                delta: parsed.data.delta,
                reason: parsed.data.reason,
                countedPhysical: parsed.data.countedPhysical ?? null,
                localStockAtCount: parsed.data.localStockAtCount ?? null,
                createdAt: parsed.data.createdAt,
                hlc: clampedHlc,
                deviceId: parsed.data.deviceId,
                userId,
              };

              await tx.insert(adjustments).values({
                id: adjPayload.id,
                productId: adjPayload.productId,
                storeId: adjPayload.storeId,
                delta: adjPayload.delta,
                reason: adjPayload.reason,
                countedPhysical: adjPayload.countedPhysical,
                localStockAtCount: adjPayload.localStockAtCount,
                createdAt: adjPayload.createdAt,
                hlc: adjPayload.hlc,
                deviceId: adjPayload.deviceId,
                userId: adjPayload.userId,
              });

              await tx.insert(changeLog).values({
                storeId: mutation.storeId,
                entityType: 'adjustment',
                entityId: adjPayload.id,
                op: 'upsert',
                payload: adjPayload,
              });
            }

            await tx.insert(appliedMutations).values({
              mutationId: mutation.mutationId,
              deviceId: request.deviceId,
            });

            return { mutationId: mutation.mutationId, status: 'applied' };
          }

          if (mutation.type === 'order.create') {
            const parsed = orderCreatePayloadSchema.safeParse(mutation.payload);
            if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Invalid order.create payload',
              };
            }

            const computedSubtotal = parsed.data.items.reduce(
              (sum, item) => sum + item.quantity * item.unitPrice,
              0
            );
            if (
              parsed.data.discountAmount > parsed.data.subtotal + 0.01 ||
              Math.abs(computedSubtotal - parsed.data.subtotal) > 1 ||
              parsed.data.totalAmount < 0 ||
              parsed.data.totalAmount > parsed.data.subtotal + parsed.data.taxAmount + 500
            ) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Order subtotal or discount validation failed',
              };
            }

            const existingOrder = await tx.query.saleOrders.findFirst({
              where: eq(saleOrders.id, parsed.data.id),
            });

            if (!existingOrder) {
              const clampedHlc = clampHlc(parsed.data.hlc, serverNow);
              const orderPayload: SaleOrder = {
                id: parsed.data.id,
                storeId: parsed.data.storeId,
                receiptNumber: parsed.data.receiptNumber,
                customerName: parsed.data.customerName ?? null,
                customerPhone: parsed.data.customerPhone ?? null,
                items: parsed.data.items,
                subtotal: parsed.data.subtotal,
                discountAmount: parsed.data.discountAmount,
                taxRate: parsed.data.taxRate,
                taxInclusive: parsed.data.taxInclusive,
                taxAmount: parsed.data.taxAmount,
                totalAmount: parsed.data.totalAmount,
                paymentMethod: parsed.data.paymentMethod,
                amountTendered: parsed.data.amountTendered,
                changeDue: parsed.data.changeDue,
                notes: parsed.data.notes ?? null,
                createdAt: parsed.data.createdAt,
                hlc: clampedHlc,
                deviceId: parsed.data.deviceId,
                userId,
              };

              await tx.insert(saleOrders).values({
                id: orderPayload.id,
                storeId: orderPayload.storeId,
                receiptNumber: orderPayload.receiptNumber,
                customerName: orderPayload.customerName,
                customerPhone: orderPayload.customerPhone,
                items: orderPayload.items,
                subtotal: orderPayload.subtotal,
                discountAmount: orderPayload.discountAmount,
                taxRate: orderPayload.taxRate,
                taxInclusive: orderPayload.taxInclusive,
                taxAmount: orderPayload.taxAmount,
                totalAmount: orderPayload.totalAmount,
                paymentMethod: orderPayload.paymentMethod,
                amountTendered: orderPayload.amountTendered,
                changeDue: orderPayload.changeDue,
                notes: orderPayload.notes,
                createdAt: orderPayload.createdAt,
                hlc: orderPayload.hlc,
                deviceId: orderPayload.deviceId,
                userId: orderPayload.userId,
              });

              await tx.insert(changeLog).values({
                storeId: mutation.storeId,
                entityType: 'order',
                entityId: orderPayload.id,
                op: 'upsert',
                payload: orderPayload,
              });
            }

            await tx.insert(appliedMutations).values({
              mutationId: mutation.mutationId,
              deviceId: request.deviceId,
            });

            return { mutationId: mutation.mutationId, status: 'applied' };
          }

          if (mutation.type === 'order.update') {
            const parsed = orderUpdatePayloadSchema.safeParse(mutation.payload);
            if (!parsed.success || parsed.data.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Invalid order.update payload',
              };
            }

            const existingRow = await tx.query.saleOrders.findFirst({
              where: eq(saleOrders.id, parsed.data.id),
            });
            if (!existingRow || existingRow.storeId !== mutation.storeId) {
              return {
                mutationId: mutation.mutationId,
                status: 'rejected',
                reason: 'Order not found in store',
              };
            }

            const clampedHlc = clampHlc(parsed.data.hlc, serverNow);
            if (HybridLogicalClock.compare(clampedHlc, existingRow.hlc) >= 0) {
              const updatedItems =
                parsed.data.items ?? (existingRow.items as SaleOrder['items']);
              const updatedNotes =
                parsed.data.notes !== undefined ? parsed.data.notes ?? null : existingRow.notes;

              await tx
                .update(saleOrders)
                .set({
                  items: updatedItems,
                  notes: updatedNotes,
                  hlc: clampedHlc,
                })
                .where(eq(saleOrders.id, existingRow.id));

              const orderPayload: SaleOrder = {
                id: existingRow.id,
                storeId: existingRow.storeId,
                receiptNumber: existingRow.receiptNumber,
                customerName: existingRow.customerName ?? null,
                customerPhone: existingRow.customerPhone ?? null,
                items: updatedItems,
                subtotal: Number(existingRow.subtotal),
                discountAmount: Number(existingRow.discountAmount),
                taxRate: Number(existingRow.taxRate),
                taxInclusive: Boolean(existingRow.taxInclusive),
                taxAmount: Number(existingRow.taxAmount),
                totalAmount: Number(existingRow.totalAmount),
                paymentMethod: existingRow.paymentMethod as PaymentMethod,
                amountTendered: Number(existingRow.amountTendered),
                changeDue: Number(existingRow.changeDue),
                notes: updatedNotes,
                createdAt: Number(existingRow.createdAt),
                hlc: clampedHlc,
                deviceId: existingRow.deviceId,
                userId: existingRow.userId,
              };

              await tx.insert(changeLog).values({
                storeId: mutation.storeId,
                entityType: 'order',
                entityId: orderPayload.id,
                op: 'upsert',
                payload: orderPayload,
              });
            }

            await tx.insert(appliedMutations).values({
              mutationId: mutation.mutationId,
              deviceId: request.deviceId,
            });

            return { mutationId: mutation.mutationId, status: 'applied' };
          }

          return {
            mutationId: mutation.mutationId,
            status: 'rejected',
            reason: 'Unsupported mutation type',
          };
        });

        results.push(mutationResult);
      } catch (err: any) {
        results.push({
          mutationId: mutation.mutationId,
          status: 'rejected',
          reason: err.message || 'Transaction error',
        });
      }
    }

    return { results };
  }

  private static async pullPostgres(
    userId: string,
    query: SyncPullQuery
  ): Promise<SyncPullResponse> {
    const membership = await db.query.storeMembers.findFirst({
      where: and(
        eq(storeMembers.storeId, query.storeId),
        eq(storeMembers.userId, userId)
      ),
    });

    if (!membership) {
      const err: any = new Error('Forbidden: user is not a member of this store');
      err.status = 403;
      throw err;
    }

    const rows = await db
      .select()
      .from(changeLog)
      .where(and(eq(changeLog.storeId, query.storeId), gt(changeLog.seq, query.since)))
      .orderBy(asc(changeLog.seq))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const sliced = rows.slice(0, query.limit);
    const changes = sliced.map((r) => ({
      seq: r.seq,
      storeId: r.storeId,
      entityType: r.entityType as 'product' | 'adjustment' | 'order',
      entityId: r.entityId,
      op: r.op as 'upsert' | 'delete',
      payload: r.payload as Record<string, any>,
      createdAt: r.createdAt.toISOString(),
    }));

    const nextSeq = changes.length > 0 ? changes[changes.length - 1].seq : query.since;

    return {
      changes,
      nextSeq,
      hasMore,
    };
  }
}
