import { pool } from './index.js';
import { Product, Adjustment, SaleOrder, ChangeLogItem } from '@countwise/shared';

export interface MemoryUser {
  id: string;
  email: string;
  passwordHash: string;
  role: 'staff' | 'customer';
  createdAt: Date;
}

export interface MemoryStore {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
}

export interface MemoryStoreMember {
  storeId: string;
  userId: string;
  role: 'owner' | 'member';
}

export interface MemoryAppliedMutation {
  mutationId: string;
  deviceId: string;
  appliedAt: Date;
}

export const DEMO_USER_ID = '11111111-1111-1111-1111-111111111111';
export const DEMO_STORE_ID = '22222222-2222-2222-2222-222222222222';

class InMemoryDatabase {
  public users = new Map<string, MemoryUser>();
  public stores = new Map<string, MemoryStore>();
  public storeMembers: MemoryStoreMember[] = [];
  public products = new Map<string, Product>();
  public adjustments = new Map<string, Adjustment>();
  public orders = new Map<string, SaleOrder>();
  public changeLog: ChangeLogItem[] = [];
  public appliedMutations = new Map<string, MemoryAppliedMutation>();
  private seqCounter = 0;

  constructor() {
    this.seedDemoWorkspace();
  }

  private seedDemoWorkspace(): void {
    const now = new Date();
    this.users.set(DEMO_USER_ID, {
      id: DEMO_USER_ID,
      email: 'demo@countwise.local',
      passwordHash: 'offline_demo_hash',
      role: 'staff',
      createdAt: now,
    });
    this.stores.set(DEMO_STORE_ID, {
      id: DEMO_STORE_ID,
      name: 'MegaHertz Depot — Flagship',
      ownerId: DEMO_USER_ID,
      createdAt: now,
    });
    this.storeMembers.push({
      storeId: DEMO_STORE_ID,
      userId: DEMO_USER_ID,
      role: 'owner',
    });
  }

  public nextSeq(): number {
    this.seqCounter += 1;
    return this.seqCounter;
  }

  public reset(): void {
    this.users.clear();
    this.stores.clear();
    this.storeMembers = [];
    this.products.clear();
    this.adjustments.clear();
    this.orders.clear();
    this.changeLog = [];
    this.appliedMutations.clear();
    this.seqCounter = 0;
    this.seedDemoWorkspace();
  }
}

export const memoryDb = new InMemoryDatabase();

let pgAvailable: boolean | null = null;
let lastCheckTime = 0;

export async function isPostgresAvailable(): Promise<boolean> {
  if (process.env.FORCE_IN_MEMORY_DB === 'true' || process.env.NODE_ENV === 'test') {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  const now = Date.now();
  if (pgAvailable !== null && now - lastCheckTime < 15000) {
    return pgAvailable;
  }
  lastCheckTime = now;
  try {
    const client = await pool.connect();
    client.release();
    pgAvailable = true;
    return true;
  } catch {
    pgAvailable = false;
    return false;
  }
}
