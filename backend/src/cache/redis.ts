/**
 * Redis client singleton with graceful degradation.
 *
 * If Redis is unavailable, cacheGet returns null and the app falls through
 * to live FTB API calls. No crash, just uncached responses.
 */

import { Redis } from "ioredis";
import { logger } from "../lib/logger.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null, // don't keep retrying on initial connect failure
});

redis.on("connect", () => logger.info("cache.redis_connected", { url: REDIS_URL }));
redis.on("error",   (err: Error) => logger.warn("cache.redis_error", { error: String(err) }));

/**
 * Get a cached value by key.
 * Returns null if Redis is unavailable or the key doesn't exist.
 */
export async function cacheGet(key: string): Promise<unknown | null> {
  if (redis.status !== "ready") return null;
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/**
 * Store a value with an explicit TTL (in seconds).
 * Silently ignores Redis errors — cache writes are best-effort.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (redis.status !== "ready") return;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
