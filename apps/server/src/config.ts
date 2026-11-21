import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEFAULT_DEV_JWT = 'super_secret_jwt_access_key_change_in_production';
const DEFAULT_DEV_REFRESH = 'super_secret_jwt_refresh_key_change_in_production';

const configSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CLIENT_URL: z
      .string()
      .default(process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173'),
    DATABASE_URL: z
      .string()
      .default('postgres://countwise:countwise_secret@localhost:5432/countwise_db'),
    JWT_SECRET: z.string().default(DEFAULT_DEV_JWT),
    JWT_REFRESH_SECRET: z.string().default(DEFAULT_DEV_REFRESH),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      if (val.JWT_SECRET === DEFAULT_DEV_JWT || val.JWT_SECRET.length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be set to a strong secret in production',
        });
      }
      if (val.JWT_REFRESH_SECRET === DEFAULT_DEV_REFRESH || val.JWT_REFRESH_SECRET.length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must be set to a strong secret in production',
        });
      }
    }
  });

export const config = configSchema.parse(process.env);
