import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('API Server Endpoints', () => {
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
});
