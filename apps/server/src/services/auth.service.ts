import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, stores, storeMembers } from '../db/schema.js';
import { isPostgresAvailable, memoryDb } from '../db/memory-fallback.js';
import { config } from '../config.js';
import { RegisterInput, LoginInput } from '@countwise/shared';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: 'staff' | 'customer';
    createdAt: Date;
  };
  defaultStoreId?: string;
}

export class AuthService {
  public static async register(
    input: RegisterInput,
    role: 'staff' | 'customer' = 'staff'
  ): Promise<AuthTokens> {
    const emailLower = input.email.toLowerCase();
    const usePg = await isPostgresAvailable();

    if (!usePg) {
      for (const u of memoryDb.users.values()) {
        if (u.email === emailLower) {
          throw new Error('User with this email already exists');
        }
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(input.password, salt);

      const newUser = {
        id: crypto.randomUUID(),
        email: emailLower,
        passwordHash,
        role,
        createdAt: new Date(),
      };
      memoryDb.users.set(newUser.id, newUser);

      let defaultStoreId: string | undefined;
      if (role === 'staff') {
        const newStore = {
          id: crypto.randomUUID(),
          name: `${input.name || 'My'} Store`,
          ownerId: newUser.id,
          createdAt: new Date(),
        };
        memoryDb.stores.set(newStore.id, newStore);
        memoryDb.storeMembers.push({
          storeId: newStore.id,
          userId: newUser.id,
          role: 'owner',
        });
        defaultStoreId = newStore.id;
      }

      const tokens = this.generateTokens(newUser.id, newUser.email, role);
      return {
        ...tokens,
        user: {
          id: newUser.id,
          email: newUser.email,
          role,
          createdAt: newUser.createdAt,
        },
        ...(defaultStoreId ? { defaultStoreId } : {}),
      };
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.email, emailLower),
    });

    if (existing) {
      throw new Error('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);

    // Create user (and default store for staff accounts) within a transaction
    const result = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          email: emailLower,
          passwordHash,
          role,
        })
        .returning();

      let defaultStoreId: string | undefined;
      if (role === 'staff') {
        const [newStore] = await tx
          .insert(stores)
          .values({
            name: `${input.name || 'My'} Store`,
            ownerId: newUser.id,
          })
          .returning();

        await tx.insert(storeMembers).values({
          storeId: newStore.id,
          userId: newUser.id,
          role: 'owner',
        });
        defaultStoreId = newStore.id;
      }

      return { user: newUser, defaultStoreId };
    });

    const tokens = this.generateTokens(result.user.id, result.user.email, role);

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        role,
        createdAt: result.user.createdAt,
      },
      ...(result.defaultStoreId ? { defaultStoreId: result.defaultStoreId } : {}),
    };
  }

  public static async login(
    input: LoginInput,
    portal: 'staff' | 'customer' = 'staff'
  ): Promise<AuthTokens> {
    const emailLower = input.email.toLowerCase();
    const usePg = await isPostgresAvailable();

    if (!usePg) {
      const user = Array.from(memoryDb.users.values()).find((u) => u.email === emailLower);
      if (!user) {
        throw new Error('Invalid email or password');
      }
      const isMatch = await bcrypt.compare(input.password, user.passwordHash);
      if (!isMatch) {
        throw new Error('Invalid email or password');
      }
      if (portal === 'staff' && user.role === 'customer') {
        throw new Error('Customer accounts cannot access staff portals.');
      }

      const issuedRole: 'staff' | 'customer' = portal === 'customer' ? 'customer' : 'staff';
      const memberStore =
        issuedRole === 'staff'
          ? memoryDb.storeMembers.find((m) => m.userId === user.id)
          : undefined;
      const tokens = this.generateTokens(user.id, user.email, issuedRole);
      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          role: issuedRole,
          createdAt: user.createdAt,
        },
        ...(memberStore?.storeId ? { defaultStoreId: memberStore.storeId } : {}),
      };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, emailLower),
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    const userRole = user.role === 'customer' ? 'customer' : 'staff';
    if (portal === 'staff' && userRole === 'customer') {
      throw new Error('Customer accounts cannot access staff portals.');
    }

    const issuedRole: 'staff' | 'customer' = portal === 'customer' ? 'customer' : 'staff';
    const memberStore =
      issuedRole === 'staff'
        ? await db.query.storeMembers.findFirst({
            where: eq(storeMembers.userId, user.id),
          })
        : undefined;

    const tokens = this.generateTokens(user.id, user.email, issuedRole);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: issuedRole,
        createdAt: user.createdAt,
      },
      ...(memberStore?.storeId ? { defaultStoreId: memberStore.storeId } : {}),
    };
  }

  public static async refreshToken(token: string): Promise<{ accessToken: string }> {
    let decoded: { id: string; email: string; role?: 'staff' | 'customer' };
    try {
      decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as {
        id: string;
        email: string;
        role?: 'staff' | 'customer';
      };
    } catch {
      throw new Error('Invalid or expired refresh token');
    }

    let role: 'staff' | 'customer' = decoded.role === 'customer' ? 'customer' : 'staff';
    const usePg = await isPostgresAvailable();
    if (usePg) {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, decoded.id),
      });
      if (!dbUser) {
        throw new Error('Account no longer exists');
      }
      role = dbUser.role === 'customer' ? 'customer' : 'staff';
    }

    const accessToken = jwt.sign(
      { id: decoded.id, email: decoded.email, role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN as any }
    );
    return { accessToken };
  }

  public static generateTokens(id: string, email: string, role: 'staff' | 'customer' = 'staff') {
    const accessToken = jwt.sign(
      { id, email, role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN as any }
    );

    const refreshToken = jwt.sign(
      { id, email, role },
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN as any }
    );

    return { accessToken, refreshToken };
  }
}
