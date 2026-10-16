import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgres://countwise:countwise_secret@localhost:5432/countwise_db'),
  JWT_SECRET: z.string().default('super_secret_jwt_access_key_change_in_production'),
  JWT_REFRESH_SECRET: z.string().default('super_secret_jwt_refresh_key_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
});

export const config = configSchema.parse(process.env);
