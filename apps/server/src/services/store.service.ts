import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { stores, storeMembers, users } from '../db/schema.js';
import { isPostgresAvailable, memoryDb } from '../db/memory-fallback.js';

export interface StoreInfo {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'member';
  createdAt: string;
}

export class StoreService {
  public static async listUserStores(userId: string): Promise<StoreInfo[]> {
    const usePg = await isPostgresAvailable();
    if (!usePg) {
      const memberships = memoryDb.storeMembers.filter((m) => m.userId === userId);
      const result: StoreInfo[] = [];
      for (const m of memberships) {
        const s = memoryDb.stores.get(m.storeId);
        if (s) {
          result.push({
            id: s.id,
            name: s.name,
            ownerId: s.ownerId,
            role: m.role,
            createdAt: s.createdAt.toISOString(),
          });
        }
      }
      return result;
    }

    const memberships = await db
      .select({
        id: stores.id,
        name: stores.name,
        ownerId: stores.ownerId,
        role: storeMembers.role,
        createdAt: stores.createdAt,
      })
      .from(storeMembers)
      .innerJoin(stores, eq(storeMembers.storeId, stores.id))
      .where(eq(storeMembers.userId, userId));

    return memberships.map((m) => ({
      id: m.id,
      name: m.name,
      ownerId: m.ownerId,
      role: (m.role as 'owner' | 'member') || 'member',
      createdAt: m.createdAt.toISOString(),
    }));
  }

  public static async createStore(userId: string, name: string, customId?: string): Promise<StoreInfo> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Store name is required');
    }

    const usePg = await isPostgresAvailable();
    if (!usePg) {
      const id = customId || crypto.randomUUID();
      const existing = memoryDb.stores.get(id);
      if (existing) {
        const member = memoryDb.storeMembers.find((m) => m.storeId === id && m.userId === userId);
        if (member) {
          return {
            id: existing.id,
            name: existing.name,
            ownerId: existing.ownerId,
            role: member.role,
            createdAt: existing.createdAt.toISOString(),
          };
        }
      }

      const newStore = {
        id,
        name: trimmed,
        ownerId: userId,
        createdAt: new Date(),
      };
      memoryDb.stores.set(newStore.id, newStore);
      memoryDb.storeMembers.push({
        storeId: newStore.id,
        userId,
        role: 'owner',
      });

      return {
        id: newStore.id,
        name: newStore.name,
        ownerId: newStore.ownerId,
        role: 'owner',
        createdAt: newStore.createdAt.toISOString(),
      };
    }

    return await db.transaction(async (tx) => {
      const [newStore] = await tx
        .insert(stores)
        .values({
          ...(customId ? { id: customId } : {}),
          name: trimmed,
          ownerId: userId,
        })
        .returning();

      await tx.insert(storeMembers).values({
        storeId: newStore.id,
        userId,
        role: 'owner',
      });

      return {
        id: newStore.id,
        name: newStore.name,
        ownerId: newStore.ownerId,
        role: 'owner',
        createdAt: newStore.createdAt.toISOString(),
      };
    });
  }

  public static async addMemberByEmail(
    requesterId: string,
    storeId: string,
    memberEmail: string
  ): Promise<{ storeId: string; userId: string; email: string; role: string }> {
    const isMember = await this.isUserStoreMember(requesterId, storeId);
    if (!isMember) {
      throw new Error('Forbidden: you are not a member of this store');
    }

    const emailLower = memberEmail.trim().toLowerCase();
    const usePg = await isPostgresAvailable();

    if (!usePg) {
      const targetUser = Array.from(memoryDb.users.values()).find((u) => u.email === emailLower);
      if (!targetUser) {
        throw new Error('User with that email was not found');
      }
      const existing = memoryDb.storeMembers.find(
        (m) => m.storeId === storeId && m.userId === targetUser.id
      );
      if (!existing) {
        memoryDb.storeMembers.push({
          storeId,
          userId: targetUser.id,
          role: 'member',
        });
      }
      return { storeId, userId: targetUser.id, email: targetUser.email, role: 'member' };
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.email, emailLower),
    });

    if (!targetUser) {
      throw new Error('User with that email was not found');
    }

    await db
      .insert(storeMembers)
      .values({
        storeId,
        userId: targetUser.id,
        role: 'member',
      })
      .onConflictDoNothing();

    return { storeId, userId: targetUser.id, email: targetUser.email, role: 'member' };
  }

  public static async isUserStoreMember(userId: string, storeId: string): Promise<boolean> {
    const usePg = await isPostgresAvailable();
    if (!usePg) {
      return memoryDb.storeMembers.some((m) => m.storeId === storeId && m.userId === userId);
    }

    const membership = await db.query.storeMembers.findFirst({
      where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)),
    });
    return Boolean(membership);
  }
}

