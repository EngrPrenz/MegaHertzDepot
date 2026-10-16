import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, stores, storeMembers } from '../db/schema.js';
import { config } from '../config.js';
import { RegisterInput, LoginInput } from '@countwise/shared';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    createdAt: Date;
  };
  defaultStoreId?: string;
}

export class AuthService {
  public static async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (existing) {
      throw new Error('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);

    // Create user and a default store within a transaction
    const result = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          email: input.email.toLowerCase(),
          passwordHash,
        })
        .returning();

      // Automatically create a default store for the new user
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

      return { user: newUser, store: newStore };
    });

    const tokens = this.generateTokens(result.user.id, result.user.email);

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        createdAt: result.user.createdAt,
      },
      defaultStoreId: result.store.id,
    };
  }

  public static async login(input: LoginInput): Promise<AuthTokens> {
    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    // Find user's store
    const memberStore = await db.query.storeMembers.findFirst({
      where: eq(storeMembers.userId, user.id),
    });

    const tokens = this.generateTokens(user.id, user.email);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      defaultStoreId: memberStore?.storeId,
    };
  }

  public static async refreshToken(token: string): Promise<{ accessToken: string }> {
    try {
      const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as { id: string; email: string };
      const accessToken = jwt.sign(
        { id: decoded.id, email: decoded.email },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRES_IN as any }
      );
      return { accessToken };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  public static generateTokens(id: string, email: string) {
    const accessToken = jwt.sign(
      { id, email },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN as any }
    );

    const refreshToken = jwt.sign(
      { id, email },
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN as any }
    );

    return { accessToken, refreshToken };
  }
}
