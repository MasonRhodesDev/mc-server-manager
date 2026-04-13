/**
 * FTB API client (api.modpacks.ch) with SQLite caching.
 *
 * Endpoints used:
 *   GET /public/modpack/all              → { packs: number[] }  (all pack IDs, ~92)
 *   GET /public/modpack/{id}             → pack detail object
 *   GET /public/modpack/search/{n}?term= → { packs: number[], total: number }  (IDs only)
 */

import { db } from "../db/index.js";
import { logger } from "../lib/logger.js";

const FTB_API = "https://api.modpacks.ch/public";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Sentinel cache IDs (pack IDs are always positive integers)
const CACHE_ID_ALL_IDS = -1; // stores the JSON array of all IDs

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "mc-server-manager/1.0" },
  });
  if (!res.ok) throw new Error(`FTB API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

function isFresh(fetchedAt: string, ttlMs = CACHE_TTL_MS): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < ttlMs;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function cacheGet(packId: number): Promise<any | null> {
  const row = await db
    .selectFrom("ftb_cache")
    .selectAll()
    .where("pack_id", "=", packId)
    .executeTakeFirst();
  if (!row || !isFresh(row.fetched_at)) return null;
  return JSON.parse(row.data);
}

async function cacheSet(packId: number, data: unknown): Promise<void> {
  await db
    .insertInto("ftb_cache")
    .values({
      pack_id: packId,
      data: JSON.stringify(data),
      fetched_at: new Date().toISOString(),
    })
    .onConflict(oc =>
      oc.column("pack_id").doUpdateSet({
        data: JSON.stringify(data),
        fetched_at: new Date().toISOString(),
      })
    )
    .execute();
}

// ── All pack IDs ──────────────────────────────────────────────────────────────

async function getAllPackIds(): Promise<number[]> {
  const cached = await cacheGet(CACHE_ID_ALL_IDS);
  if (cached) return cached as number[];

  logger.info("ftb.fetch_all_ids");
  const data = await fetchJson<{ packs: number[] }>(`${FTB_API}/modpack/all`);
  const ids = data.packs ?? [];
  await cacheSet(CACHE_ID_ALL_IDS, ids);
  logger.info("ftb.fetched_all_ids", { count: ids.length });
  return ids;
}

// ── Individual pack ───────────────────────────────────────────────────────────

export async function getPack(packId: number): Promise<any> {
  const cached = await cacheGet(packId);
  if (cached) return cached;

  const data = await fetchJson<any>(`${FTB_API}/modpack/${packId}`);
  // API returns { status: "error" } for invalid IDs
  if (data.status === "error") return null;

  await cacheSet(packId, data);
  return data;
}

// ── Pack versions ─────────────────────────────────────────────────────────────

export async function getPackVersions(packId: number): Promise<any[]> {
  const pack = await getPack(packId);
  return pack?.versions ?? [];
}

// ── Pack list (paginated) ─────────────────────────────────────────────────────

export async function getPackList(limit = 24, offset = 0): Promise<{
  packs: any[];
  total: number;
}> {
  const allIds = await getAllPackIds();
  const pageIds = allIds.slice(offset, offset + limit);

  // Fetch each pack (hits cache when warm; first load does N requests in parallel)
  const results = await Promise.all(
    pageIds.map(id =>
      getPack(id).catch(err => {
        logger.warn("ftb.pack_fetch_failed", { packId: id, error: String(err) });
        return null;
      })
    )
  );

  return {
    packs: results.filter(Boolean),
    total: allIds.length,
  };
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchPacks(
  query: string,
  limit = 24,
  offset = 0
): Promise<{ packs: any[]; total: number }> {
  if (!query.trim()) return getPackList(limit, offset);

  logger.info("ftb.search", { query, limit, offset });

  // API returns IDs only; request enough to cover the offset+limit window
  const data = await fetchJson<{ packs: number[]; total: number }>(
    `${FTB_API}/modpack/search/${limit + offset}?term=${encodeURIComponent(query)}`
  );

  const pageIds = (data.packs ?? []).slice(offset, offset + limit);
  const results = await Promise.all(
    pageIds.map(id =>
      getPack(id).catch(() => null)
    )
  );

  return {
    packs: results.filter(Boolean),
    total: data.total ?? results.length,
  };
}
