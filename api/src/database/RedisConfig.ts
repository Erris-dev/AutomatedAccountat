import Redis, { type RedisOptions } from "ioredis";

import { config } from "../config/env";

const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (attempt: number) => Math.min(attempt * 100, 2_000),
};

export const redis = new Redis(redisOptions);

export const connectRedis = async (): Promise<void> => {
  if (redis.status === "wait") {
    await redis.connect();
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redis.status === "wait") {
    redis.disconnect();
    return;
  }

  if (redis.status !== "end") {
    await redis.quit();
  }
};

export type RedisDatabaseClient = typeof redis;
