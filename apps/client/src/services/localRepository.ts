import {
  HybridLogicalClock,
  AdjustmentReason,
  HardwareCategory,
  HardwareSpecs,
  PaymentMethod,
  SaleOrderItem,
  ProductCreatePayload,
  ProductUpdatePayload,
  ProductDeletePayload,
  AdjustmentCreatePayload,
  OrderCreatePayload,
  OrderUpdatePayload,
  SAMPLE_PC_HARDWARE_CATALOG,
  getDefaultCatalogImageUrl,
  computeDerivedStock,
  analyzeStockCountSemantics,
  CountDiscrepancyInfo,
} from '@countwise/shared';
import {
  CountwiseDatabase,
  localDb,
  ProductLocal,
  AdjustmentLocal,
  SaleOrderLocal,
  OutboxMutation,
} from '../db/index.js';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class LocalFirstRepository {
  private db: CountwiseDatabase;
  private hlc: HybridLogicalClock | null = null;

  constructor(dbInstance: CountwiseDatabase = localDb) {
    this.db = dbInstance;
  }

  public async getDeviceId(): Promise<string> {
    const existing = await this.db.meta.get('deviceId');
    if (existing?.value && typeof existing.value === 'string') {
      return existing.value;
    }
    const newDeviceId = `pos_${generateUuid().slice(0, 8)}`;
    await this.db.meta.put({ key: 'deviceId', value: newDeviceId });
    return newDeviceId;
  }

  public async setDeviceName(name: string): Promise<void> {
    await this.db.meta.put({ key: 'deviceName', value: name.trim() });
  }

  public async getDeviceName(): Promise<string> {
    const meta = await this.db.meta.get('deviceName');
    if (meta?.value) return meta.value;
    return this.getDeviceId();
  }

  public async nextHlc(physicalTime: number = Date.now()): Promise<string> {
    const deviceId = await this.getDeviceId();
    if (!this.hlc || this.hlc.nodeId !== deviceId) {
      const saved = await this.db.meta.get('lastHlc');
      if (saved?.value && typeof saved.value === 'string') {
        try {
          const parsed = HybridLogicalClock.parse(saved.value);
          this.hlc = new HybridLogicalClock(deviceId, parsed.millis, parsed.counter);
        } catch {
          this.hlc = new HybridLogicalClock(deviceId);
        }
      } else {
        this.hlc = new HybridLogicalClock(deviceId);
      }
    }

    const ts = this.hlc.now(physicalTime);
    const formatted = HybridLogicalClock.format(ts);
    await this.db.meta.put({ key: 'lastHlc', value: formatted });
    return formatted;
  }

  public async receiveRemoteHlc(
    remoteHlc: string,
    physicalTime: number = Date.now()
  ): Promise<string> {
    const deviceId = await this.getDeviceId();
    if (!this.hlc || this.hlc.nodeId !== deviceId) {
      const saved = await this.db.meta.get('lastHlc');
      if (saved?.value && typeof saved.value === 'string') {
        try {
          const parsed = HybridLogicalClock.parse(saved.value);
          this.hlc = new HybridLogicalClock(deviceId, parsed.millis, parsed.counter);
        } catch {
          this.hlc = new HybridLogicalClock(deviceId);
        }
      } else {
        this.hlc = new HybridLogicalClock(deviceId);
      }
    }

    const ts = this.hlc.receive(remoteHlc, physicalTime);
    const formatted = HybridLogicalClock.format(ts);
    await this.db.meta.put({ key: 'lastHlc', value: formatted });
    return formatted;
  }

  /**
   * Creates a PC hardware product locally and atomically enqueues `product.create` in outbox.
   */
  public async createProduct(params: {
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
    initialStock?: number;
    userId: string;
    id?: string;
    now?: number;
  }): Promise<ProductLocal> {
    const now = params.now ?? Date.now();
    const hlc = await this.nextHlc(now);
    const productId = params.id ?? generateUuid();
    const trimmedSku = params.sku?.trim() || undefined;
    const category = params.category ?? 'Peripheral';
    const brand = params.brand?.trim() || undefined;
    const price = params.price ?? 0;
    const costPrice = params.costPrice;
    const warranty = params.warranty?.trim() || '1 Year Store Warranty';
    const specs = params.specs;
    const imageUrl =
      params.imageUrl?.trim() || getDefaultCatalogImageUrl(trimmedSku, params.name) || undefined;

    const product: ProductLocal = {
      id: productId,
      storeId: params.storeId,
      name: params.name.trim(),
      sku: trimmedSku,
      category,
      brand,
      price,
      costPrice,
      warranty,
      specs,
      imageUrl,
      nameHlc: hlc,
      skuHlc: hlc,
      priceHlc: hlc,
      imageHlc: hlc,
    };

    const payload: ProductCreatePayload = {
      id: product.id,
      storeId: product.storeId,
      name: product.name,
      ...(trimmedSku ? { sku: trimmedSku } : {}),
      category,
      brand: brand ?? null,
      price,
      costPrice: costPrice ?? null,
      warranty,
      specs: specs ?? null,
      imageUrl: imageUrl ?? null,
      nameHlc: hlc,
      skuHlc: hlc,
      priceHlc: hlc,
      imageHlc: hlc,
    };

    const outboxEntry: OutboxMutation = {
      mutationId: generateUuid(),
      storeId: params.storeId,
      entityId: product.id,
      type: 'product.create',
      payload,
      hlc,
      createdAt: now,
      attempts: 0,
      status: 'pending',
    };

    await this.db.transaction('rw', [this.db.products, this.db.outbox, this.db.meta], async () => {
      await this.db.products.put(product);
      await this.db.outbox.add(outboxEntry);
    });

    if (params.initialStock !== undefined && params.initialStock !== 0) {
      await this.recordAdjustment({
        productId: product.id,
        storeId: params.storeId,
        delta: params.initialStock,
        reason: 'count',
        countedPhysical: params.initialStock,
        localStockAtCount: 0,
        userId: params.userId,
        now: now + 1,
      });
    }

    return product;
  }

  /**
   * Updates product metadata, SKU, or PHP price locally using per-field HLC LWW.
   */
  public async updateProduct(params: {
    id: string;
    storeId: string;
    name?: string;
    sku?: string;
    category?: HardwareCategory;
    brand?: string;
    price?: number;
    costPrice?: number;
    warranty?: string;
    specs?: HardwareSpecs;
    imageUrl?: string | null;
    now?: number;
  }): Promise<ProductLocal> {
    const now = params.now ?? Date.now();
    const hlc = await this.nextHlc(now);

    return await this.db.transaction('rw', [this.db.products, this.db.outbox], async () => {
      const existing = await this.db.products.get(params.id);
      if (!existing) {
        throw new Error('Product not found locally');
      }
      if (existing.deletedAt) {
        throw new Error('Cannot update a deleted product');
      }

      const updated: ProductLocal = { ...existing };
      const payload: ProductUpdatePayload = {
        id: params.id,
        storeId: params.storeId,
      };
      let changed = false;

      if (params.name !== undefined && params.name.trim() !== existing.name) {
        updated.name = params.name.trim();
        updated.nameHlc = hlc;
        payload.name = updated.name;
        payload.nameHlc = hlc;
        changed = true;
      }

      if (params.category !== undefined && params.category !== existing.category) {
        updated.category = params.category;
        updated.nameHlc = hlc;
        payload.category = params.category;
        payload.nameHlc = hlc;
        changed = true;
      }

      if (params.brand !== undefined && params.brand.trim() !== (existing.brand || '')) {
        updated.brand = params.brand.trim() || undefined;
        updated.nameHlc = hlc;
        payload.brand = updated.brand ?? null;
        payload.nameHlc = hlc;
        changed = true;
      }

      if (params.warranty !== undefined && params.warranty.trim() !== (existing.warranty || '')) {
        updated.warranty = params.warranty.trim() || undefined;
        updated.nameHlc = hlc;
        payload.warranty = updated.warranty ?? null;
        payload.nameHlc = hlc;
        changed = true;
      }

      if (params.specs !== undefined) {
        updated.specs = params.specs;
        updated.nameHlc = hlc;
        payload.specs = params.specs;
        payload.nameHlc = hlc;
        changed = true;
      }

      if (params.sku !== undefined) {
        const nextSku = params.sku.trim() || undefined;
        if (nextSku !== existing.sku) {
          updated.sku = nextSku;
          updated.skuHlc = hlc;
          payload.sku = nextSku ?? null;
          payload.skuHlc = hlc;
          changed = true;
        }
      }

      if (params.price !== undefined && params.price !== existing.price) {
        updated.price = params.price;
        updated.priceHlc = hlc;
        payload.price = params.price;
        payload.priceHlc = hlc;
        changed = true;
      }

      if (params.costPrice !== undefined && params.costPrice !== existing.costPrice) {
        updated.costPrice = params.costPrice;
        updated.priceHlc = hlc;
        payload.costPrice = params.costPrice ?? null;
        payload.priceHlc = hlc;
        changed = true;
      }

      if (params.imageUrl !== undefined) {
        const nextImage = params.imageUrl ? params.imageUrl.trim() : null;
        if (nextImage !== (existing.imageUrl || null)) {
          updated.imageUrl = nextImage || undefined;
          updated.imageHlc = hlc;
          payload.imageUrl = nextImage;
          payload.imageHlc = hlc;
          changed = true;
        }
      }

      if (!changed) {
        return existing;
      }

      await this.db.products.put(updated);
      await this.db.outbox.add({
        mutationId: generateUuid(),
        storeId: params.storeId,
        entityId: params.id,
        type: 'product.update',
        payload,
        hlc,
        createdAt: now,
        attempts: 0,
        status: 'pending',
      });

      return updated;
    });
  }

  public async deleteProduct(params: {
    id: string;
    storeId: string;
    now?: number;
  }): Promise<ProductLocal> {
    const now = params.now ?? Date.now();
    const hlc = await this.nextHlc(now);

    return await this.db.transaction('rw', [this.db.products, this.db.outbox], async () => {
      const existing = await this.db.products.get(params.id);
      if (!existing) {
        throw new Error('Product not found locally');
      }

      const updated: ProductLocal = {
        ...existing,
        deletedAt: now,
        deletedHlc: hlc,
      };

      const payload: ProductDeletePayload = {
        id: params.id,
        storeId: params.storeId,
        deletedAt: now,
        deletedHlc: hlc,
      };

      await this.db.products.put(updated);
      await this.db.outbox.add({
        mutationId: generateUuid(),
        storeId: params.storeId,
        entityId: params.id,
        type: 'product.delete',
        payload,
        hlc,
        createdAt: now,
        attempts: 0,
        status: 'pending',
      });

      return updated;
    });
  }

  public async recordAdjustment(params: {
    productId: string;
    storeId: string;
    delta: number;
    reason: AdjustmentReason;
    countedPhysical?: number;
    localStockAtCount?: number;
    userId: string;
    id?: string;
    now?: number;
  }): Promise<AdjustmentLocal> {
    const now = params.now ?? Date.now();
    const hlc = await this.nextHlc(now);
    const deviceId = await this.getDeviceId();
    const adjId = params.id ?? generateUuid();

    const adjustment: AdjustmentLocal = {
      id: adjId,
      productId: params.productId,
      storeId: params.storeId,
      delta: params.delta,
      reason: params.reason,
      countedPhysical: params.countedPhysical,
      localStockAtCount: params.localStockAtCount,
      createdAt: now,
      hlc,
      deviceId,
      userId: params.userId,
    };

    const payload: AdjustmentCreatePayload = {
      id: adjustment.id,
      productId: adjustment.productId,
      storeId: adjustment.storeId,
      delta: adjustment.delta,
      reason: adjustment.reason,
      ...(params.countedPhysical !== undefined ? { countedPhysical: params.countedPhysical } : {}),
      ...(params.localStockAtCount !== undefined
        ? { localStockAtCount: params.localStockAtCount }
        : {}),
      createdAt: adjustment.createdAt,
      hlc: adjustment.hlc,
      deviceId: adjustment.deviceId,
    };

    await this.db.transaction('rw', [this.db.adjustments, this.db.outbox], async () => {
      await this.db.adjustments.put(adjustment);
      await this.db.outbox.add({
        mutationId: generateUuid(),
        storeId: params.storeId,
        entityId: params.productId,
        type: 'adjustment.create',
        payload,
        hlc,
        createdAt: now,
        attempts: 0,
        status: 'pending',
      });
    });

    return adjustment;
  }

  public async recordPhysicalCount(params: {
    productId: string;
    storeId: string;
    countedPhysical: number;
    userId: string;
    now?: number;
  }): Promise<AdjustmentLocal> {
    const currentAdjustments = await this.db.adjustments
      .where('productId')
      .equals(params.productId)
      .toArray();
    const currentLocalStock = computeDerivedStock(currentAdjustments);
    const delta = params.countedPhysical - currentLocalStock;

    return this.recordAdjustment({
      productId: params.productId,
      storeId: params.storeId,
      delta,
      reason: 'count',
      countedPhysical: params.countedPhysical,
      localStockAtCount: currentLocalStock,
      userId: params.userId,
      now: params.now,
    });
  }

  /**
   * Completes an offline-tolerant POS checkout sale:
   * - Never blocks a customer at the register (even if local stock is slightly stale).
   * - Locks in snapshot unit prices, VAT, discounts, payment method, and optional Serial Numbers (S/N).
   * - Atomically writes the `SaleOrderLocal` (`order.create`) AND negative stock deltas (`adjustment.create`)
   *   for every sold hardware component into IndexedDB and the outbox.
   */
  public async createSaleOrder(params: {
    storeId: string;
    userId: string;
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
    now?: number;
  }): Promise<SaleOrderLocal> {
    if (
      !Number.isFinite(params.amountTendered) ||
      params.amountTendered < 0 ||
      Math.round(params.amountTendered * 100) < Math.round(params.totalAmount * 100)
    ) {
      throw new Error('Amount tendered must be greater than or equal to the total amount due.');
    }

    const now = params.now ?? Date.now();
    const deviceId = await this.getDeviceId();
    const orderHlc = await this.nextHlc(now);
    const orderId = generateUuid();

    const dateCode = new Date(now).toISOString().slice(2, 10).replace(/-/g, '');
    const shortRand = orderId.slice(0, 4).toUpperCase();
    const receiptNumber = `MHD-${dateCode}-${shortRand}`;

    const order: SaleOrderLocal = {
      id: orderId,
      storeId: params.storeId,
      receiptNumber,
      customerName: params.customerName?.trim() || undefined,
      customerPhone: params.customerPhone?.trim() || undefined,
      items: params.items,
      subtotal: params.subtotal,
      discountAmount: params.discountAmount,
      taxRate: params.taxRate,
      taxInclusive: params.taxInclusive,
      taxAmount: params.taxAmount,
      totalAmount: params.totalAmount,
      paymentMethod: params.paymentMethod,
      amountTendered: params.amountTendered,
      changeDue: params.changeDue,
      notes: params.notes?.trim() || undefined,
      createdAt: now,
      hlc: orderHlc,
      deviceId,
      userId: params.userId,
    };

    const orderPayload: OrderCreatePayload = {
      id: order.id,
      storeId: order.storeId,
      receiptNumber: order.receiptNumber,
      customerName: order.customerName ?? null,
      customerPhone: order.customerPhone ?? null,
      items: order.items,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      taxRate: order.taxRate,
      taxInclusive: order.taxInclusive,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      amountTendered: order.amountTendered,
      changeDue: order.changeDue,
      notes: order.notes ?? null,
      createdAt: order.createdAt,
      hlc: order.hlc,
      deviceId: order.deviceId,
    };

    // Pre-generate HLCs for each item's stock deduction
    const itemAdjustments: Array<{ adj: AdjustmentLocal; outbox: OutboxMutation }> = [];
    let tickOffset = 1;
    for (const item of params.items) {
      const adjNow = now + tickOffset++;
      const adjHlc = await this.nextHlc(adjNow);
      const adjId = generateUuid();
      const delta = -Math.abs(item.quantity);

      const adj: AdjustmentLocal = {
        id: adjId,
        productId: item.productId,
        storeId: params.storeId,
        delta,
        reason: 'sale',
        createdAt: adjNow,
        hlc: adjHlc,
        deviceId,
        userId: params.userId,
      };

      const adjPayload: AdjustmentCreatePayload = {
        id: adj.id,
        productId: adj.productId,
        storeId: adj.storeId,
        delta: adj.delta,
        reason: 'sale',
        createdAt: adj.createdAt,
        hlc: adj.hlc,
        deviceId: adj.deviceId,
      };

      itemAdjustments.push({
        adj,
        outbox: {
          mutationId: generateUuid(),
          storeId: params.storeId,
          entityId: item.productId,
          type: 'adjustment.create',
          payload: adjPayload,
          hlc: adjHlc,
          createdAt: adjNow,
          attempts: 0,
          status: 'pending',
        },
      });
    }

    await this.db.transaction(
      'rw',
      [this.db.orders, this.db.adjustments, this.db.outbox],
      async () => {
        await this.db.orders.put(order);
        await this.db.outbox.add({
          mutationId: generateUuid(),
          storeId: params.storeId,
          entityId: order.id,
          type: 'order.create',
          payload: orderPayload,
          hlc: orderHlc,
          createdAt: now,
          attempts: 0,
          status: 'pending',
        });

        for (const entry of itemAdjustments) {
          await this.db.adjustments.put(entry.adj);
          await this.db.outbox.add(entry.outbox);
        }
      }
    );

    return order;
  }

  /**
   * 1-Click Seeder for the MegaHertz Depot Sample PC Hardware Catalog.
   * Skips any SKU already present in the current store so it is idempotent.
   */
  public async seedSampleHardwareCatalog(storeId: string, userId: string): Promise<number> {
    const existingProducts = await this.db.products
      .where('storeId')
      .equals(storeId)
      .filter((p) => !p.deletedAt)
      .toArray();
    const existingSkus = new Set(
      existingProducts.map((p) => p.sku?.trim().toUpperCase()).filter(Boolean)
    );
    const existingNames = new Set(
      existingProducts.map((p) => p.name.trim().toLowerCase()).filter(Boolean)
    );

    let seededCount = 0;
    let baseNow = Date.now();

    for (const sample of SAMPLE_PC_HARDWARE_CATALOG) {
      if (
        existingSkus.has(sample.sku.trim().toUpperCase()) ||
        existingNames.has(sample.name.trim().toLowerCase())
      ) {
        continue;
      }
      baseNow += 5;
      await this.createProduct({
        storeId,
        userId,
        name: sample.name,
        sku: sample.sku,
        category: sample.category,
        brand: sample.brand,
        price: sample.price,
        costPrice: sample.costPrice,
        warranty: sample.warranty,
        specs: sample.specs,
        imageUrl: sample.imageUrl,
        initialStock: sample.initialStock,
        now: baseNow,
      });
      seededCount += 1;
    }

    return seededCount;
  }

  public async getProductStockInfo(productId: string): Promise<CountDiscrepancyInfo> {
    const rows = await this.db.adjustments.where('productId').equals(productId).toArray();
    return analyzeStockCountSemantics(
      rows.map((r) => ({
        ...r,
        countedPhysical: r.countedPhysical ?? null,
        localStockAtCount: r.localStockAtCount ?? null,
      }))
    );
  }

  public async dismissRejectedMutation(mutationId: string): Promise<void> {
    await this.db.outbox.delete(mutationId);
  }

  public async dismissAllRejectedMutations(): Promise<number> {
    const rejected = await this.db.outbox.filter((m) => m.status === 'rejected').toArray();
    if (rejected.length === 0) return 0;
    await this.db.outbox.bulkDelete(rejected.map((m) => m.mutationId));
    return rejected.length;
  }

  public async retryRejectedMutation(mutationId: string, targetStoreId?: string): Promise<void> {
    const existing = await this.db.outbox.get(mutationId);
    if (!existing) return;

    const nextPayload =
      targetStoreId &&
      existing.payload &&
      typeof existing.payload === 'object' &&
      'storeId' in existing.payload
        ? { ...existing.payload, storeId: targetStoreId }
        : existing.payload;

    await this.db.outbox.update(mutationId, {
      ...(targetStoreId ? { storeId: targetStoreId, payload: nextPayload } : {}),
      status: 'pending',
      attempts: 0,
      lastError: undefined,
    });
  }

  public async retryAllRejectedMutations(targetStoreId?: string): Promise<number> {
    const rejected = await this.db.outbox.filter((m) => m.status === 'rejected').toArray();
    if (rejected.length === 0) return 0;

    const oldStoreIds = Array.from(
      new Set(
        rejected
          .map((m) => m.storeId)
          .filter((id): id is string => Boolean(id) && Boolean(targetStoreId) && id !== targetStoreId)
      )
    );

    await this.db.transaction(
      'rw',
      [this.db.products, this.db.adjustments, this.db.orders, this.db.outbox],
      async () => {
        if (targetStoreId && oldStoreIds.length > 0) {
          for (const oldId of oldStoreIds) {
            await this.db.products
              .where('storeId')
              .equals(oldId)
              .modify({ storeId: targetStoreId });
            await this.db.adjustments
              .where('storeId')
              .equals(oldId)
              .modify({ storeId: targetStoreId });
            await this.db.orders
              .where('storeId')
              .equals(oldId)
              .modify({ storeId: targetStoreId });
          }
        }

        for (const item of rejected) {
          const nextPayload =
            targetStoreId &&
            item.payload &&
            typeof item.payload === 'object' &&
            'storeId' in item.payload
              ? { ...item.payload, storeId: targetStoreId }
              : item.payload;

          await this.db.outbox.put({
            ...item,
            storeId: targetStoreId || item.storeId,
            payload: nextPayload,
            status: 'pending',
            attempts: 0,
            lastError: undefined,
          });
        }
      }
    );

    return rejected.length;
  }

  /**
   * Voids / refunds an existing sale order and restocks all items back into inventory
   * via commutative `restock` adjustments (or `damage` if returned defective).
   */
  public async voidSaleOrder(params: {
    orderId: string;
    storeId: string;
    userId: string;
    reason: string;
    restockAsDamaged?: boolean;
  }): Promise<SaleOrderLocal> {
    const existing = await this.db.orders.get(params.orderId);
    if (!existing) {
      throw new Error('Sale order receipt not found');
    }
    if (existing.notes && existing.notes.includes('[VOIDED]')) {
      throw new Error('This receipt has already been voided/refunded.');
    }

    const now = Date.now();
    const adjReason: AdjustmentReason = params.restockAsDamaged ? 'damage' : 'restock';

    // Record stock return adjustments for each line item (only restock positive delta if not damaged)
    if (!params.restockAsDamaged) {
      let offset = 1;
      for (const item of existing.items) {
        await this.recordAdjustment({
          productId: item.productId,
          storeId: params.storeId,
          delta: Math.abs(item.quantity),
          reason: adjReason,
          userId: params.userId,
          now: now + offset++,
        });
      }
    }

    const voidTag = `[VOIDED] ${params.reason.trim() || 'Customer Refund'} (${new Date(now).toLocaleDateString()})`;
    const updatedNotes = existing.notes ? `${existing.notes} | ${voidTag}` : voidTag;
    const hlcNow = now + (existing.items.length || 0) + 1;
    const orderHlc = await this.nextHlc(hlcNow);

    const updatedOrder: SaleOrderLocal = {
      ...existing,
      notes: updatedNotes,
      hlc: orderHlc,
    };

    const orderUpdatePayload: OrderUpdatePayload = {
      id: updatedOrder.id,
      storeId: updatedOrder.storeId,
      notes: updatedOrder.notes ?? null,
      hlc: orderHlc,
    };

    await this.db.transaction('rw', [this.db.orders, this.db.outbox], async () => {
      await this.db.orders.put(updatedOrder);
      await this.db.outbox.add({
        mutationId: generateUuid(),
        storeId: params.storeId,
        entityId: updatedOrder.id,
        type: 'order.update',
        payload: orderUpdatePayload,
        hlc: orderHlc,
        createdAt: hlcNow,
        attempts: 0,
        status: 'pending',
      });
    });

    return updatedOrder;
  }

  /**
   * Processes an RMA Warranty Replacement on a specific hardware component in a receipt:
   * - Deducts 1 replacement unit from inventory (`reason: 'damage'`, `delta: -1`)
   * - Updates the receipt's recorded serial number and appends an RMA audit trail note.
   */
  public async processRmaReplacement(params: {
    orderId: string;
    storeId: string;
    userId: string;
    productId: string;
    defectiveSerial: string;
    replacementSerial: string;
    issueDescription: string;
  }): Promise<SaleOrderLocal> {
    const existing = await this.db.orders.get(params.orderId);
    if (!existing) {
      throw new Error('Sale order receipt not found');
    }
    if (existing.notes && existing.notes.includes('[VOIDED]')) {
      throw new Error('Cannot process RMA on a voided receipt.');
    }

    const targetItem = existing.items.find((i) => i.productId === params.productId);
    if (!targetItem) {
      throw new Error('Component not found on this receipt');
    }

    const now = Date.now();

    // Deduct 1 replacement unit from good inventory as an RMA/damage write-off
    await this.recordAdjustment({
      productId: params.productId,
      storeId: params.storeId,
      delta: -1,
      reason: 'damage',
      userId: params.userId,
      now,
    });

    const oldSn = params.defectiveSerial.trim() || 'UNSPECIFIED-SN';
    const newSn = params.replacementSerial.trim() || 'NEW-RMA-SN';

    const updatedItems = existing.items.map((item) => {
      if (item.productId !== params.productId) return item;
      const existingSerials = (item.serialNumbers || []).filter(Boolean);
      let nextSerials: string[];
      if (existingSerials.includes(oldSn)) {
        nextSerials = existingSerials.map((sn) =>
          sn === oldSn ? `${newSn} (RMA Replaced: ${oldSn})` : sn
        );
      } else {
        nextSerials = [...existingSerials, `${newSn} (RMA Replaced: ${oldSn})`];
      }
      return {
        ...item,
        serialNumbers: nextSerials,
      };
    });

    const rmaTag = `[RMA REPLACED] ${targetItem.productName}: S/N ${oldSn} -> ${newSn} (${params.issueDescription.trim() || 'Defective under warranty'} • ${new Date(now).toLocaleDateString()})`;
    const updatedNotes = existing.notes ? `${existing.notes} | ${rmaTag}` : rmaTag;
    const hlcNow = now + 1;
    const orderHlc = await this.nextHlc(hlcNow);

    const updatedOrder: SaleOrderLocal = {
      ...existing,
      items: updatedItems,
      notes: updatedNotes,
      hlc: orderHlc,
    };

    const orderUpdatePayload: OrderUpdatePayload = {
      id: updatedOrder.id,
      storeId: updatedOrder.storeId,
      items: updatedItems,
      notes: updatedOrder.notes ?? null,
      hlc: orderHlc,
    };

    await this.db.transaction('rw', [this.db.orders, this.db.outbox], async () => {
      await this.db.orders.put(updatedOrder);
      await this.db.outbox.add({
        mutationId: generateUuid(),
        storeId: params.storeId,
        entityId: updatedOrder.id,
        type: 'order.update',
        payload: orderUpdatePayload,
        hlc: orderHlc,
        createdAt: hlcNow,
        attempts: 0,
        status: 'pending',
      });
    });

    return updatedOrder;
  }
}

export const localRepository = new LocalFirstRepository(localDb);
