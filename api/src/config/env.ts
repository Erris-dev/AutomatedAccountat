import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DUMMY_HASH: z.string().min(1, "DUMMY_HASH is required"),
  PORT: z.coerce.number().int().positive().default(3000),
  REDIS_HOST: z.string().min(1).default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  ACCESS_TOKEN_SECRET: z.string().min(32, "ACCESS_TOKEN_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_SECRET: z.string().min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_EXPIRATION: z.string().min(1).default("15m"),
  REFRESH_TOKEN_EXPIRATION: z.string().min(1).default("7d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const errors = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid environment configuration:\n${errors}`);
}

const env = parsedEnv.data;

export const config = Object.freeze({
  database: {
    url: env.DATABASE_URL,
  },
  security: {
    dummyHash: env.DUMMY_HASH,
  },
  server: {
    port: env.PORT,
  },
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
  jwt: {
    accessSecret: env.ACCESS_TOKEN_SECRET,
    refreshSecret: env.REFRESH_TOKEN_SECRET,
    accessExpiry: env.ACCESS_TOKEN_EXPIRATION,
    refreshExpiry: env.REFRESH_TOKEN_EXPIRATION,
  },
  bcrypt: {
    saltRounds: env.BCRYPT_SALT_ROUNDS,
  },
  cors: {
    origin: env.CORS_ORIGIN,
  },
});

export type Config = typeof config;