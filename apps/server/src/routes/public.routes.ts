import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { stores, products, adjustments, saleOrders, changeLog } from '../db/schema.js';
import { isPostgresAvailable, memoryDb, DEMO_STORE_ID, DEMO_USER_ID } from '../db/memory-fallback.js';
import { config } from '../config.js';
import { createRateLimiter } from '../middlewares/rateLimit.middleware.js';
import {
  paymentMethodSchema,
  HybridLogicalClock,
  SaleOrder,
  SaleOrderItem,
  Adjustment,
  HardwareCategory,
  HardwareSpecs,
  getDefaultCatalogImageUrl,
} from '@countwise/shared';

function resolvePublicImageUrl(
  imageUrl?: string | null,
  sku?: string | null,
  name?: string | null
): string | null {
  if (imageUrl && !imageUrl.startsWith('local-img://')) {
    return imageUrl;
  }
  return getDefaultCatalogImageUrl(sku, name) ?? imageUrl ?? null;
}

const router = Router();

const publicOrderRequestSchema = z.object({
  storeId: z.string().uuid().optional(),
  customerName: z.string().trim().min(1, 'Customer name is required').max(120),
  customerEmail: z.string().trim().email().max(255).optional(),
  customerPhone: z.string().trim().max(60).optional(),
  fulfillment: z.enum(['pickup', 'delivery']).default('pickup'),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: paymentMethodSchema.default('Cash'),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1, 'Order must contain at least one item')
    .max(50),
});

async function resolvePublicStore(requestedStoreId?: string): Promise<{
  storeId: string;
  ownerId: string;
} | null> {
  const usePg = await isPostgresAvailable();
  if (!usePg) {
    if (requestedStoreId) {
      const store = memoryDb.stores.get(requestedStoreId);
      return store ? { storeId: store.id, ownerId: store.ownerId } : null;
    }
    // Prefer the first store that has active products, then any non-demo store, else DEMO_STORE_ID
    for (const p of memoryDb.products.values()) {
      if (!p.deletedAt) {
        const s = memoryDb.stores.get(p.storeId);
        if (s) return { storeId: s.id, ownerId: s.ownerId };
      }
    }
    const nonDemo = Array.from(memoryDb.stores.values()).find((s) => s.id !== DEMO_STORE_ID);
    if (nonDemo) return { storeId: nonDemo.id, ownerId: nonDemo.ownerId };
    const demo = memoryDb.stores.get(DEMO_STORE_ID);
    return demo ? { storeId: demo.id, ownerId: demo.ownerId } : { storeId: DEMO_STORE_ID, ownerId: DEMO_USER_ID };
  }

  if (requestedStoreId) {
    const storeRow = await db.query.stores.findFirst({
      where: eq(stores.id, requestedStoreId),
    });
    return storeRow ? { storeId: storeRow.id, ownerId: storeRow.ownerId } : null;
  }

  const productStore = await db
    .select({ storeId: products.storeId })
    .from(products)
    .where(isNull(products.deletedAt))
    .limit(1);

  if (productStore.length > 0) {
    const storeRow = await db.query.stores.findFirst({
      where: eq(stores.id, productStore[0].storeId),
    });
    if (storeRow) return { storeId: storeRow.id, ownerId: storeRow.ownerId };
  }

  const firstStore = await db.select().from(stores).limit(1);
  if (firstStore.length > 0) {
    return { storeId: firstStore[0].id, ownerId: firstStore[0].ownerId };
  }

  return null;
}

/**
 * GET /public/catalog?storeId=<uuid>
 * Public consumer catalog feed (explicitly omits wholesale `costPrice`).
 */
router.get('/catalog', async (req: Request, res: Response) => {
  const rawStoreId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : undefined;
  if (rawStoreId && !z.string().uuid().safeParse(rawStoreId).success) {
    res.status(400).json({ error: 'Invalid storeId parameter' });
    return;
  }

  try {
    const resolved = await resolvePublicStore(rawStoreId);
    if (!resolved) {
      res.status(200).json({ storeId: rawStoreId || DEMO_STORE_ID, products: [] });
      return;
    }

    const usePg = await isPostgresAvailable();
    if (!usePg) {
      const storeProducts = Array.from(memoryDb.products.values()).filter(
        (p) => p.storeId === resolved.storeId && !p.deletedAt
      );
      const stockMap = new Map<string, number>();
      for (const adj of memoryDb.adjustments.values()) {
        if (adj.storeId === resolved.storeId) {
          stockMap.set(adj.productId, (stockMap.get(adj.productId) || 0) + adj.delta);
        }
      }

      const publicProducts = storeProducts.map((p) => ({
        id: p.id,
        storeId: p.storeId,
        name: p.name,
        sku: p.sku ?? null,
        category: (p.category as HardwareCategory) || 'Peripheral',
        brand: p.brand ?? null,
        price: p.price ?? 0,
        warranty: p.warranty ?? null,
        specs: (p.specs as HardwareSpecs) ?? null,
        imageUrl: resolvePublicImageUrl(p.imageUrl, p.sku, p.name),
        nameHlc: p.nameHlc,
        skuHlc: p.skuHlc ?? null,
        priceHlc: p.priceHlc ?? null,
        imageHlc: p.imageHlc ?? null,
        stock: stockMap.get(p.id) ?? 0,
      }));

      res.status(200).json({ storeId: resolved.storeId, products: publicProducts });
      return;
    }

    const storeProducts = await db
      .select()
      .from(products)
      .where(and(eq(products.storeId, resolved.storeId), isNull(products.deletedAt)));

    const storeAdjustments = await db
      .select({ productId: adjustments.productId, delta: adjustments.delta })
      .from(adjustments)
      .where(eq(adjustments.storeId, resolved.storeId));

    const stockMap = new Map<string, number>();
    for (const adj of storeAdjustments) {
      stockMap.set(adj.productId, (stockMap.get(adj.productId) || 0) + adj.delta);
    }

    const publicProducts = storeProducts.map((p) => ({
      id: p.id,
      storeId: p.storeId,
      name: p.name,
      sku: p.sku ?? null,
      category: (p.category as HardwareCategory) || 'Peripheral',
      brand: p.brand ?? null,
      price: Number(p.price ?? 0),
      warranty: p.warranty ?? null,
      specs: (p.specs as HardwareSpecs) ?? null,
      imageUrl: resolvePublicImageUrl(p.imageUrl, p.sku, p.name),
      nameHlc: p.nameHlc,
      skuHlc: p.skuHlc ?? null,
      priceHlc: p.priceHlc ?? null,
      imageHlc: p.imageHlc ?? null,
      stock: stockMap.get(p.id) ?? 0,
    }));

    res.status(200).json({ storeId: resolved.storeId, products: publicProducts });
  } catch (error: any) {
    console.error('Public catalog error:', error);
    res.status(500).json({
      error:
        config.NODE_ENV === 'production'
          ? 'Internal Server Error'
          : error?.message || 'Failed to fetch public catalog',
    });
  }
});

const publicOrderRateLimiter = createRateLimiter({
  windowMs: 5 * 60_000,
  max: 5,
  keyPrefix: 'public-orders',
});

/**
 * POST /public/orders
 * Authoritative public storefront checkout: computes unit prices, VAT, and delivery fee server-side,
 * enforces transactional stock availability, and appends order + stock deductions to `changeLog`.
 */
router.post('/orders', publicOrderRateLimiter, async (req: Request, res: Response) => {
  const parsed = publicOrderRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid order payload',
      details: parsed.error.errors,
    });
    return;
  }

  const input = parsed.data;
  if (input.fulfillment === 'delivery' && (!input.address || !input.customerPhone)) {
    res.status(400).json({
      error: 'Delivery address and contact phone are required for door-to-door delivery.',
    });
    return;
  }

  try {
    const resolved = await resolvePublicStore(input.storeId);
    if (!resolved) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    const now = Date.now();
    const orderId = crypto.randomUUID();
    const dateCode = new Date(now).toISOString().slice(2, 10).replace(/-/g, '');
    const receiptNumber = `MHD-${dateCode}-${orderId.slice(0, 4).toUpperCase()}`;
    const deviceId = 'storefront-web';
    const orderHlc = HybridLogicalClock.format({
      millis: now,
      counter: 0,
      nodeId: deviceId,
    });

    const fullNotes = [
      `[ONLINE ORDER - ${input.fulfillment.toUpperCase()}]`,
      input.fulfillment === 'delivery'
        ? `Delivery Address: ${input.address}, ${input.city || 'Metro Manila'}`
        : 'In-Store Pickup',
      input.customerEmail ? `Email: ${input.customerEmail}` : null,
      input.notes ? `Customer Notes: ${input.notes}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const requestedByProductId = new Map<string, number>();
    for (const reqItem of input.items) {
      requestedByProductId.set(
        reqItem.productId,
        (requestedByProductId.get(reqItem.productId) || 0) + reqItem.quantity
      );
    }

    const usePg = await isPostgresAvailable();

    if (!usePg) {
      const stockMap = new Map<string, number>();
      for (const adj of memoryDb.adjustments.values()) {
        if (adj.storeId === resolved.storeId && requestedByProductId.has(adj.productId)) {
          stockMap.set(adj.productId, (stockMap.get(adj.productId) || 0) + adj.delta);
        }
      }

      for (const [productId, requestedQty] of requestedByProductId.entries()) {
        const prod = memoryDb.products.get(productId);
        if (!prod || prod.storeId !== resolved.storeId || prod.deletedAt) {
          res.status(400).json({ error: `Product not found or unavailable: ${productId}` });
          return;
        }
        const available = stockMap.get(productId) ?? 0;
        if (available < requestedQty) {
          res.status(409).json({
            error: `Insufficient stock for ${prod.name}. Only ${Math.max(0, available)} available.`,
          });
          return;
        }
      }

      const orderItems: SaleOrderItem[] = [];
      let subtotal = 0;

      for (const reqItem of input.items) {
        const prod = memoryDb.products.get(reqItem.productId)!;
        const unitPrice = Number(prod.price ?? 0);
        subtotal += unitPrice * reqItem.quantity;
        orderItems.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku ?? null,
          category: (prod.category as HardwareCategory) || 'Peripheral',
          warranty: prod.warranty ?? null,
          quantity: reqItem.quantity,
          unitPrice,
          serialNumbers: [],
        });
      }

      const deliveryFee = input.fulfillment === 'delivery' ? 150 : 0;
      const totalAmount = subtotal + deliveryFee;
      const taxRate = 12;
      const taxInclusive = true;
      const taxAmount = Number((subtotal - subtotal / (1 + taxRate / 100)).toFixed(2));

      const orderSeq = memoryDb.nextSeq();
      const order: SaleOrder = {
        id: orderId,
        storeId: resolved.storeId,
        receiptNumber,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        items: orderItems,
        subtotal,
        discountAmount: 0,
        taxRate,
        taxInclusive,
        taxAmount,
        totalAmount,
        paymentMethod: input.paymentMethod,
        amountTendered: totalAmount,
        changeDue: 0,
        notes: fullNotes,
        createdAt: now,
        hlc: orderHlc,
        deviceId,
        userId: resolved.ownerId,
        serverSeq: orderSeq,
      };

      memoryDb.orders.set(order.id, order);
      memoryDb.changeLog.push({
        seq: orderSeq,
        storeId: resolved.storeId,
        entityType: 'order',
        entityId: order.id,
        op: 'upsert',
        payload: order as any,
        createdAt: new Date(now).toISOString(),
      });

      let counter = 1;
      for (const item of orderItems) {
        const adjId = crypto.randomUUID();
        const adjHlc = HybridLogicalClock.format({
          millis: now,
          counter: counter++,
          nodeId: deviceId,
        });
        const adj: Adjustment = {
          id: adjId,
          productId: item.productId,
          storeId: resolved.storeId,
          delta: -Math.abs(item.quantity),
          reason: 'sale',
          countedPhysical: null,
          localStockAtCount: null,
          createdAt: now + counter,
          hlc: adjHlc,
          deviceId,
          userId: resolved.ownerId,
        };
        memoryDb.adjustments.set(adj.id, adj);
        const adjSeq = memoryDb.nextSeq();
        memoryDb.changeLog.push({
          seq: adjSeq,
          storeId: resolved.storeId,
          entityType: 'adjustment',
          entityId: adj.id,
          op: 'upsert',
          payload: adj as any,
          createdAt: new Date(now).toISOString(),
        });
      }

      res.status(201).json({ order });
      return;
    }

    const createdOrder = await db.transaction(async (tx) => {
      const sortedProductIds = Array.from(requestedByProductId.keys()).sort();
      const lockedProducts = await tx
        .select()
        .from(products)
        .where(
          and(
            inArray(products.id, sortedProductIds),
            eq(products.storeId, resolved.storeId),
            isNull(products.deletedAt)
          )
        )
        .orderBy(products.id)
        .for('update');

      const productById = new Map(lockedProducts.map((p) => [p.id, p]));
      for (const productId of sortedProductIds) {
        if (!productById.has(productId)) {
          const err: any = new Error(`Product not found or unavailable: ${productId}`);
          err.status = 400;
          throw err;
        }
      }

      const relevantAdjustments = await tx
        .select({ productId: adjustments.productId, delta: adjustments.delta })
        .from(adjustments)
        .where(
          and(
            eq(adjustments.storeId, resolved.storeId),
            inArray(adjustments.productId, sortedProductIds)
          )
        );

      const stockMap = new Map<string, number>();
      for (const adj of relevantAdjustments) {
        stockMap.set(adj.productId, (stockMap.get(adj.productId) || 0) + adj.delta);
      }

      for (const [productId, requestedQty] of requestedByProductId.entries()) {
        const prodRow = productById.get(productId)!;
        const available = stockMap.get(productId) ?? 0;
        if (available < requestedQty) {
          const err: any = new Error(
            `Insufficient stock for ${prodRow.name}. Only ${Math.max(0, available)} available.`
          );
          err.status = 409;
          throw err;
        }
      }

      const orderItems: SaleOrderItem[] = [];
      let subtotal = 0;

      for (const reqItem of input.items) {
        const prodRow = productById.get(reqItem.productId)!;
        const unitPrice = Number(prodRow.price ?? 0);
        subtotal += unitPrice * reqItem.quantity;
        orderItems.push({
          productId: prodRow.id,
          productName: prodRow.name,
          sku: prodRow.sku ?? null,
          category: (prodRow.category as HardwareCategory) || 'Peripheral',
          warranty: prodRow.warranty ?? null,
          quantity: reqItem.quantity,
          unitPrice,
          serialNumbers: [],
        });
      }

      const deliveryFee = input.fulfillment === 'delivery' ? 150 : 0;
      const totalAmount = subtotal + deliveryFee;
      const taxRate = 12;
      const taxInclusive = true;
      const taxAmount = Number((subtotal - subtotal / (1 + taxRate / 100)).toFixed(2));

      const orderPayload: SaleOrder = {
        id: orderId,
        storeId: resolved.storeId,
        receiptNumber,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        items: orderItems,
        subtotal,
        discountAmount: 0,
        taxRate,
        taxInclusive,
        taxAmount,
        totalAmount,
        paymentMethod: input.paymentMethod,
        amountTendered: totalAmount,
        changeDue: 0,
        notes: fullNotes,
        createdAt: now,
        hlc: orderHlc,
        deviceId,
        userId: resolved.ownerId,
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

      const [orderLog] = await tx
        .insert(changeLog)
        .values({
          storeId: resolved.storeId,
          entityType: 'order',
          entityId: orderPayload.id,
          op: 'upsert',
          payload: orderPayload,
        })
        .returning();

      let counter = 1;
      for (const item of orderItems) {
        const adjId = crypto.randomUUID();
        const adjHlc = HybridLogicalClock.format({
          millis: now,
          counter: counter++,
          nodeId: deviceId,
        });
        const adjPayload: Adjustment = {
          id: adjId,
          productId: item.productId,
          storeId: resolved.storeId,
          delta: -Math.abs(item.quantity),
          reason: 'sale',
          countedPhysical: null,
          localStockAtCount: null,
          createdAt: now + counter,
          hlc: adjHlc,
          deviceId,
          userId: resolved.ownerId,
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
          storeId: resolved.storeId,
          entityType: 'adjustment',
          entityId: adjPayload.id,
          op: 'upsert',
          payload: adjPayload,
        });
      }

      return { ...orderPayload, serverSeq: orderLog.seq };
    });

    res.status(201).json({ order: createdOrder });
  } catch (error: any) {
    const status = error?.status || 500;
    if (status >= 500) {
      console.error('Public order error:', error);
    }
    res.status(status).json({
      error:
        config.NODE_ENV === 'production' && status >= 500
          ? 'Internal Server Error'
          : error?.message || 'Failed to place storefront order',
    });
  }
});

export default router;
