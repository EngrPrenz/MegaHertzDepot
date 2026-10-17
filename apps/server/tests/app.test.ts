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
});
