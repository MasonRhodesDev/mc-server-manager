/**
 * FTB API client with SQLite caching.
 * Cache TTL: 1 hour for pack lists, 30 minutes for individual packs.
 */

import { db } from "../db/index.js";

const FTB_API = "https://api.feed-the-beast.com/v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "mc-server-manager/1.0" },
  });
  if (!res.ok) throw new Error(`FTB API error ${res.status}: ${url}`);
  return res.json();
}

function isFresh(fetchedAt: string, ttlMs = CACHE_TTL_MS): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < ttlMs;
}

// ── Pack list ─────────────────────────────────────────────────────────────────

const PACK_LIST_CACHE_ID = -1; // sentinel ID for the list cache

export async function getPackList(limit = 50, offset = 0): Promise<{
  packs: { id: number; name: string; synopsis: string; art: any[] }[];
  total: number;
}> {
  // Check cache
  const cached = await db
    .selectFrom("ftb_cache")
    .selectAll()
    .where("pack_id", "=", PACK_LIST_CACHE_ID)
    .executeTakeFirst();

  if (cached && isFresh(cached.fetched_at)) {
    const all = JSON.parse(cached.data) as any[];
    return { packs: all.slice(offset, offset + limit), total: all.length };
  }

  // Fetch fresh
  const data = await fetchJson<{ packs: any[]; total: number }>(
    `${FTB_API}/modpacks/search/8000?limit=500`
  );

  await db
    .insertInto("ftb_cache")
    .values({
      pack_id: PACK_LIST_CACHE_ID,
      data: JSON.stringify(data.packs ?? []),
      fetched_at: new Date().toISOString(),
    })
    .onConflict(oc => oc.column("pack_id").doUpdateSet({
      data: JSON.stringify(data.packs ?? []),
      fetched_at: new Date().toISOString(),
    }))
    .execute();

  const all = data.packs ?? [];
  return { packs: all.slice(offset, offset + limit), total: all.length };
}

// ── Individual pack ───────────────────────────────────────────────────────────

export async function getPack(packId: number): Promise<any> {
  const cached = await db
    .selectFrom("ftb_cache")
    .selectAll()
    .where("pack_id", "=", packId)
    .executeTakeFirst();

  if (cached && isFresh(cached.fetched_at)) {
    return JSON.parse(cached.data);
  }

  const data = await fetchJson<any>(`${FTB_API}/modpacks/${packId}`);

  await db
    .insertInto("ftb_cache")
    .values({
      pack_id: packId,
      data: JSON.stringify(data),
      fetched_at: new Date().toISOString(),
    })
    .onConflict(oc => oc.column("pack_id").doUpdateSet({
      data: JSON.stringify(data),
      fetched_at: new Date().toISOString(),
    }))
    .execute();

  return data;
}

// ── Pack versions ─────────────────────────────────────────────────────────────

export async function getPackVersions(packId: number): Promise<any[]> {
  const pack = await getPack(packId);
  return pack.versions ?? [];
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchPacks(
  query: string,
  limit = 20,
  offset = 0
): Promise<{ packs: any[]; total: number }> {
  const { packs, total } = await getPackList(9999, 0);
  const q = query.toLowerCase();
  const filtered = packs.filter(
    p =>
      (p.name as string)?.toLowerCase().includes(q) ||
      (p.synopsis as string)?.toLowerCase().includes(q)
  );
  return {
    packs: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}
