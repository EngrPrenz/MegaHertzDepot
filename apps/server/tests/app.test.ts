import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { memoryDb } from '../src/db/memory-fallback.js';

describe('API Server & Sync Protocol Integration Tests', () => {
  beforeEach(() => {
    memoryDb.reset();
  });

  it('GET / should return online server status', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Countwise Offline-First Sync API');
    expect(res.body).toHaveProperty('status', 'online');
  });

  it('GET /health should return ok uptime status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('uptime');
  });

  it('POST /auth/login with invalid payload should return 400 validation error', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'not-an-email',
      password: '',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('GET /auth/me without token should return 401 unauthorized', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('should register, login, refresh token, and list default store', async () => {
    const reg = await request(app).post('/auth/register').send({
      email: 'owner@countwise.dev',
      password: 'password123',
      name: 'Main Downtown',
    });

    expect(reg.status).toBe(201);
    expect(reg.body).toHaveProperty('accessToken');
    expect(reg.body).toHaveProperty('refreshToken');
    expect(reg.body).toHaveProperty('defaultStoreId');

    const { accessToken, refreshToken, defaultStoreId } = reg.body;

    // Refresh token flow (Section 9 offline-tolerant auth)
    const refreshed = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toHaveProperty('accessToken');

    // List stores
    const storesRes = await request(app)
      .get('/stores')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(storesRes.status).toBe(200);
    expect(storesRes.body.stores).toHaveLength(1);
    expect(storesRes.body.stores[0].id).toBe(defaultStoreId);
  });

  it('should enforce idempotency, conflict rules, and cursor pagination across /sync/push and /sync/pull', async () => {
    // Register User A
    const regA = await request(app).post('/auth/register').send({
      email: 'staffA@store.com',
      password: 'password123',
      name: 'Store Alpha',
    });
    const tokenA = regA.body.accessToken as string;
    const storeId = regA.body.defaultStoreId as string;

    // Register User B (unauthorized for Store Alpha initially)
    const regB = await request(app).post('/auth/register').send({
      email: 'outsider@other.com',
      password: 'password123',
      name: 'Store Beta',
    });
    const tokenB = regB.body.accessToken as string;

    const productId = crypto.randomUUID();
    const createMutationId = crypto.randomUUID();
    const adj1MutationId = crypto.randomUUID();
    const adj1Id = crypto.randomUUID();

    // 1. Push product creation and initial stock adjustment from Device A
    const pushRes1 = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deviceId: 'dev-A',
        mutations: [
          {
            mutationId: createMutationId,
            storeId,
            type: 'product.create',
            hlc: '001700000001000:000000:dev-A',
            createdAt: 1700000001000,
            payload: {
              id: productId,
              storeId,
              name: 'Arabica Beans 1kg',
              sku: 'COF-ARA-01',
              nameHlc: '001700000001000:000000:dev-A',
              skuHlc: '001700000001000:000000:dev-A',
            },
          },
          {
            mutationId: adj1MutationId,
            storeId,
            type: 'adjustment.create',
            hlc: '001700000001100:000000:dev-A',
            createdAt: 1700000001100,
            payload: {
              id: adj1Id,
              productId,
              storeId,
              delta: 15,
              reason: 'restock',
              createdAt: 1700000001100,
              hlc: '001700000001100:000000:dev-A',
              deviceId: 'dev-A',
            },
          },
        ],
      });

    expect(pushRes1.status).toBe(200);
    expect(pushRes1.body.results).toEqual([
      { mutationId: createMutationId, status: 'applied' },
      { mutationId: adj1MutationId, status: 'applied' },
    ]);

    // 2. Duplicate push of the same mutationIds must return 'duplicate' and not double-apply
    const dupPush = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deviceId: 'dev-A',
        mutations: [
          {
            mutationId: adj1MutationId,
            storeId,
            type: 'adjustment.create',
            hlc: '001700000001100:000000:dev-A',
            createdAt: 1700000001100,
            payload: {
              id: adj1Id,
              productId,
              storeId,
              delta: 15,
              reason: 'restock',
              createdAt: 1700000001100,
              hlc: '001700000001100:000000:dev-A',
              deviceId: 'dev-A',
            },
          },
        ],
      });

    expect(dupPush.status).toBe(200);
    expect(dupPush.body.results).toEqual([
      { mutationId: adj1MutationId, status: 'duplicate' },
    ]);

    // 3. Unauthorized user B trying to push or pull from Store Alpha is rejected
    const unauthPush = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        deviceId: 'dev-B',
        mutations: [
          {
            mutationId: crypto.randomUUID(),
            storeId,
            type: 'product.delete',
            hlc: '001700000002000:000000:dev-B',
            createdAt: 1700000002000,
            payload: {
              id: productId,
              storeId,
              deletedAt: 1700000002000,
              deletedHlc: '001700000002000:000000:dev-B',
            },
          },
        ],
      });
    expect(unauthPush.body.results[0].status).toBe('rejected');

    const unauthPull = await request(app)
      .get(`/sync/pull?storeId=${storeId}&since=0`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(unauthPull.status).toBe(403);

    // 4. Pull with pagination (limit=1)
    const pullPage1 = await request(app)
      .get(`/sync/pull?storeId=${storeId}&since=0&limit=1`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(pullPage1.status).toBe(200);
    expect(pullPage1.body.changes).toHaveLength(1);
    expect(pullPage1.body.hasMore).toBe(true);
    expect(pullPage1.body.changes[0].entityType).toBe('product');

    const pullPage2 = await request(app)
      .get(`/sync/pull?storeId=${storeId}&since=${pullPage1.body.nextSeq}&limit=10`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(pullPage2.status).toBe(200);
    expect(pullPage2.body.changes).toHaveLength(1);
    expect(pullPage2.body.hasMore).toBe(false);
    expect(pullPage2.body.changes[0].entityType).toBe('adjustment');
    expect(pullPage2.body.changes[0].payload.delta).toBe(15);

    // 5. Push a PC Hardware Sale Order (order.create) with serial numbers & warranty
    const orderId = crypto.randomUUID();
    const orderMutationId = crypto.randomUUID();
    const pushOrderRes = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deviceId: 'dev-A',
        mutations: [
          {
            mutationId: orderMutationId,
            storeId,
            type: 'order.create',
            hlc: '001700000003000:000000:dev-A',
            createdAt: 1700000003000,
            payload: {
              id: orderId,
              storeId,
              receiptNumber: 'MHD-261016-9901',
              customerName: 'Alex Builder',
              customerPhone: '09171234567',
              items: [
                {
                  productId,
                  productName: 'AMD Ryzen 7 7800X3D',
                  sku: 'CPU-AMD-7800X3D',
                  category: 'CPU',
                  unitPrice: 23950,
                  quantity: 1,
                  serialNumbers: ['SN-7800X3D-00918'],
                  warranty: '3 Years Manufacturer Warranty',
                },
              ],
              subtotal: 23950,
              discountAmount: 950,
              taxRate: 12,
              taxInclusive: true,
              taxAmount: 2464.29,
              totalAmount: 23000,
              paymentMethod: 'GCash',
              amountTendered: 23000,
              changeDue: 0,
              notes: 'AM5 Gaming Rig Checkout',
              createdAt: 1700000003000,
              hlc: '001700000003000:000000:dev-A',
              deviceId: 'dev-A',
            },
          },
        ],
      });

    expect(pushOrderRes.status).toBe(200);
    expect(pushOrderRes.body.results).toEqual([
      { mutationId: orderMutationId, status: 'applied' },
    ]);

    const pullPage3 = await request(app)
      .get(`/sync/pull?storeId=${storeId}&since=${pullPage2.body.nextSeq}&limit=10`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(pullPage3.status).toBe(200);
    expect(pullPage3.body.changes).toHaveLength(1);
    expect(pullPage3.body.changes[0].entityType).toBe('order');
    expect(pullPage3.body.changes[0].payload.receiptNumber).toBe('MHD-261016-9901');
    expect(pullPage3.body.changes[0].payload.items[0].serialNumbers).toEqual([
      'SN-7800X3D-00918',
    ]);
  });

  it('POST /upload should require auth and save image to local uploads directory', async () => {
    // 1. Without auth
    const unauth = await request(app).post('/upload');
    expect(unauth.status).toBe(401);

    // 2. Register user to get token
    const reg = await request(app).post('/auth/register').send({
      email: 'uploader@countwise.dev',
      password: 'password123',
      name: 'MegaHertz Admin',
    });
    const token = reg.body.accessToken;

    // 3. Upload valid image buffer
    const dummyWebpBuffer = Buffer.from('RIFF....WEBPVP8 ...fake image data...');
    const uploadRes = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', dummyWebpBuffer, {
        filename: 'rtx4070.webp',
        contentType: 'image/webp',
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.url).toMatch(/^\/uploads\/products\/prod-.*\.webp$/);

    // 4. Test serving static uploaded file
    const staticRes = await request(app).get(uploadRes.body.url);
    expect(staticRes.status).toBe(200);

    // 5. Test invalid file rejection
    const textBuffer = Buffer.from('this is not an image');
    const rejectRes = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', textBuffer, {
        filename: 'malicious.txt',
        contentType: 'text/plain',
      });

    expect(rejectRes.status).toBe(400);
    expect(rejectRes.body.error).toContain('Only JPEG, PNG, WebP, and GIF');
  });

  it('should isolate customer portal tokens from staff routes and staff login', async () => {
    const custReg = await request(app).post('/auth/customer/register').send({
      email: 'shopper@countwise.dev',
      password: 'password123',
      name: 'PC Buyer',
    });

    expect(custReg.status).toBe(201);
    expect(custReg.body.user.role).toBe('customer');
    const customerToken = custReg.body.accessToken;

    // Customer accounts must not log in through the staff portal
    const staffLoginAttempt = await request(app).post('/auth/login').send({
      email: 'shopper@countwise.dev',
      password: 'password123',
    });
    expect(staffLoginAttempt.status).toBe(401);

    // Customer bearer token must be rejected (403) on staff endpoints
    const storesRes = await request(app)
      .get('/stores')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(storesRes.status).toBe(403);

    const pullRes = await request(app)
      .get(`/sync/pull?storeId=${crypto.randomUUID()}&since=0`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(pullRes.status).toBe(403);

    const uploadRes = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('image', Buffer.from('RIFF....WEBPVP8 '), {
        filename: 'test.webp',
        contentType: 'image/webp',
      });
    expect(uploadRes.status).toBe(403);
  });

  it('should restrict store member invitations to the store owner and hide unknown emails', async () => {
    const ownerReg = await request(app).post('/auth/register').send({
      email: 'store-owner@countwise.dev',
      password: 'password123',
      name: 'Flagship Store',
    });
    const staffBReg = await request(app).post('/auth/register').send({
      email: 'cashier-b@countwise.dev',
      password: 'password123',
      name: 'Cashier B',
    });

    const ownerToken = ownerReg.body.accessToken;
    const staffBToken = staffBReg.body.accessToken;
    const storeId = ownerReg.body.defaultStoreId;

    // Owner successfully adds existing staff B
    const addOk = await request(app)
      .post(`/stores/${storeId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'cashier-b@countwise.dev' });
    expect(addOk.status).toBe(200);

    // Unknown email returns generic non-enumerating error
    const unknownRes = await request(app)
      .post(`/stores/${storeId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'does-not-exist@countwise.dev' });
    expect(unknownRes.status).toBe(400);
    expect(unknownRes.body.error).toBe('Unable to add member for that email address');

    // Non-owner member B cannot invite additional staff
    const nonOwnerAttempt = await request(app)
      .post(`/stores/${storeId}/members`)
      .set('Authorization', `Bearer ${staffBToken}`)
      .send({ email: 'another@countwise.dev' });
    expect(nonOwnerAttempt.status).toBe(403);
  });

  it('POST /upload should reject spoofed image MIME types whose magic bytes do not match', async () => {
    const reg = await request(app).post('/auth/register').send({
      email: 'magiccheck@countwise.dev',
      password: 'password123',
      name: 'Magic Check Store',
    });
    const token = reg.body.accessToken;

    const spoofedRes = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('not a real png payload'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });

    expect(spoofedRes.status).toBe(400);
  });

  it('POST /sync/push should reject malformed HLC strings', async () => {
    const reg = await request(app).post('/auth/register').send({
      email: 'hlcvalidator@countwise.dev',
      password: 'password123',
      name: 'HLC Store',
    });
    const token = reg.body.accessToken;
    const storeId = reg.body.defaultStoreId;

    const pushRes = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'dev-bad',
        mutations: [
          {
            mutationId: crypto.randomUUID(),
            storeId,
            type: 'product.create',
            hlc: 'not-a-valid-hlc',
            createdAt: Date.now(),
            payload: {
              id: crypto.randomUUID(),
              storeId,
              name: 'Bad HLC Item',
              price: 100,
              nameHlc: 'not-a-valid-hlc',
            },
          },
        ],
      });

    expect(pushRes.status).toBe(400);
  });

  it('should sync order.update mutations so voided receipts propagate to other terminals', async () => {
    const reg = await request(app).post('/auth/register').send({
      email: 'voidsync@countwise.dev',
      password: 'password123',
      name: 'Void Sync Store',
    });
    const token = reg.body.accessToken;
    const storeId = reg.body.defaultStoreId;
    const productId = crypto.randomUUID();
    const orderId = crypto.randomUUID();

    const createRes = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'pos-1',
        mutations: [
          {
            mutationId: crypto.randomUUID(),
            storeId,
            type: 'product.create',
            hlc: '001700000001000:000000:pos-1',
            createdAt: 1700000001000,
            payload: {
              id: productId,
              storeId,
              name: 'RTX 4070 Super',
              price: 38000,
              nameHlc: '001700000001000:000000:pos-1',
            },
          },
          {
            mutationId: crypto.randomUUID(),
            storeId,
            type: 'order.create',
            hlc: '001700000002000:000000:pos-1',
            createdAt: 1700000002000,
            payload: {
              id: orderId,
              storeId,
              receiptNumber: 'MHD-261121-1001',
              items: [
                {
                  productId,
                  productName: 'RTX 4070 Super',
                  quantity: 1,
                  unitPrice: 38000,
                },
              ],
              subtotal: 38000,
              discountAmount: 0,
              taxRate: 12,
              taxInclusive: true,
              taxAmount: 4071.43,
              totalAmount: 38000,
              paymentMethod: 'Cash',
              amountTendered: 38000,
              changeDue: 0,
              notes: 'Walk-in sale',
              createdAt: 1700000002000,
              hlc: '001700000002000:000000:pos-1',
              deviceId: 'pos-1',
            },
          },
        ],
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body.results.every((r: any) => r.status === 'applied')).toBe(true);

    const updateMutationId = crypto.randomUUID();
    const updateRes = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'pos-1',
        mutations: [
          {
            mutationId: updateMutationId,
            storeId,
            type: 'order.update',
            hlc: '001700000003000:000000:pos-1',
            createdAt: 1700000003000,
            payload: {
              id: orderId,
              storeId,
              notes: 'Walk-in sale | [VOIDED] Customer changed mind',
              hlc: '001700000003000:000000:pos-1',
            },
          },
        ],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.results).toEqual([
      { mutationId: updateMutationId, status: 'applied' },
    ]);

    const pullRes = await request(app)
      .get(`/sync/pull?storeId=${storeId}&since=0&limit=10`)
      .set('Authorization', `Bearer ${token}`);

    expect(pullRes.status).toBe(200);
    const orderChanges = pullRes.body.changes.filter(
      (c: any) => c.entityType === 'order' && c.entityId === orderId
    );
    const latestOrderChange = orderChanges[orderChanges.length - 1];
    expect(latestOrderChange).toBeDefined();
    expect(latestOrderChange.payload.notes).toContain('[VOIDED]');
  });

  it('should serve GET /public/catalog without costPrice and compute authoritative totals on POST /public/orders', async () => {
    const reg = await request(app).post('/auth/register').send({
      email: 'storefront-owner@countwise.dev',
      password: 'password123',
      name: 'Public Storefront Depot',
    });
    const token = reg.body.accessToken;
    const storeId = reg.body.defaultStoreId;
    const productId = crypto.randomUUID();

    const seedRes = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'admin-1',
        mutations: [
          {
            mutationId: crypto.randomUUID(),
            storeId,
            type: 'product.create',
            hlc: '001700000001000:000000:admin-1',
            createdAt: 1700000001000,
            payload: {
              id: productId,
              storeId,
              name: 'Ryzen 5 7600',
              category: 'CPU',
              price: 15000,
              costPrice: 11000,
              nameHlc: '001700000001000:000000:admin-1',
              priceHlc: '001700000001000:000000:admin-1',
            },
          },
          {
            mutationId: crypto.randomUUID(),
            storeId,
            type: 'adjustment.create',
            hlc: '001700000001001:000000:admin-1',
            createdAt: 1700000001001,
            payload: {
              id: crypto.randomUUID(),
              productId,
              storeId,
              delta: 5,
              reason: 'restock',
              createdAt: 1700000001001,
              hlc: '001700000001001:000000:admin-1',
              deviceId: 'admin-1',
            },
          },
        ],
      });

    expect(seedRes.status).toBe(200);

    const baselinePull = await request(app)
      .get(`/sync/pull?storeId=${storeId}&since=0&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    const sinceSeq = baselinePull.body.nextSeq;

    // 1. Public catalog must omit wholesale costPrice and report live stock
    const catalogRes = await request(app).get(`/public/catalog?storeId=${storeId}`);
    expect(catalogRes.status).toBe(200);
    expect(catalogRes.body.products).toHaveLength(1);
    expect(catalogRes.body.products[0]).not.toHaveProperty('costPrice');
    expect(catalogRes.body.products[0].price).toBe(15000);
    expect(catalogRes.body.products[0].stock).toBe(5);

    // 2. Public order computes authoritative prices & delivery fee server-side and logs sync changes
    const orderRes = await request(app).post('/public/orders').send({
      storeId,
      customerName: 'Juan Dela Cruz',
      customerPhone: '09171234567',
      fulfillment: 'delivery',
      address: '123 Katipunan Ave',
      city: 'Quezon City',
      paymentMethod: 'Cash',
      items: [{ productId, quantity: 2 }],
    });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.order.subtotal).toBe(30000);
    expect(orderRes.body.order.totalAmount).toBe(30150);

    const postOrderPull = await request(app)
      .get(`/sync/pull?storeId=${storeId}&since=${sinceSeq}&limit=10`)
      .set('Authorization', `Bearer ${token}`);

    expect(postOrderPull.status).toBe(200);
    const pulledOrder = postOrderPull.body.changes.find((c: any) => c.entityType === 'order');
    const pulledAdj = postOrderPull.body.changes.find((c: any) => c.entityType === 'adjustment');
    expect(pulledOrder).toBeDefined();
    expect(pulledOrder.payload.totalAmount).toBe(30150);
    expect(pulledAdj).toBeDefined();
    expect(pulledAdj.payload.delta).toBe(-2);
  });
});
