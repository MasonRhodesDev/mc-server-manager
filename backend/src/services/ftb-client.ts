import { cacheGet, cacheSet } from "../cache/redis.js";
import { logger } from "../lib/logger.js";

const FTB_API = "https://api.modpacks.ch/public";

const TTL_PACK   = 60 * 60;
const TTL_SEARCH = 15 * 60;

const KEY_ALL_IDS          = "ftb:ids";
const packKey    = (id: number) => `ftb:pack:${id}`;
const versionKey = (id: number) => `ftb:version:${id}`;
const searchKey  = (q: string)  => `ftb:search:${q.toLowerCase().trim()}`;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "mc-server-manager/1.0" },
  });
  if (!res.ok) throw new Error(`FTB API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function getAllPackIds(): Promise<number[]> {
  const cached = await cacheGet(KEY_ALL_IDS) as number[] | null;
  if (cached) return cached;

  logger.info("ftb.fetch_all_ids");
  const data = await fetchJson<{ packs: number[] }>(`${FTB_API}/modpack/all`);
  const ids = data.packs ?? [];
  await cacheSet(KEY_ALL_IDS, ids, TTL_PACK);
  logger.info("ftb.fetched_all_ids", { count: ids.length });
  return ids;
}

export async function getPack(packId: number): Promise<any> {
  const cached = await cacheGet(packKey(packId));
  if (cached) return cached;

  const data = await fetchJson<any>(`${FTB_API}/modpack/${packId}`);
  if (data.status === "error") return null;

  await cacheSet(packKey(packId), data, TTL_PACK);
  return data;
}

export async function getPackVersions(packId: number): Promise<any[]> {
  const pack = await getPack(packId);
  return pack?.versions ?? [];
}

export async function getPackVersion(packId: number, versionId: number): Promise<any | null> {
  const cached = await cacheGet(versionKey(versionId));
  if (cached) return cached;

  const data = await fetchJson<any>(`${FTB_API}/modpack/${packId}/${versionId}`);
  if (!data || data.status === "error") return null;

  await cacheSet(versionKey(versionId), data, TTL_PACK);
  return data;
}

export async function getPackList(limit = 24, offset = 0): Promise<{
  packs: any[];
  total: number;
}> {
  const allIds = await getAllPackIds();
  const pageIds = allIds.slice(offset, offset + limit);

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

async function getSearchIds(query: string): Promise<number[]> {
  const key = searchKey(query);
  const cached = await cacheGet(key) as number[] | null;
  if (cached) return cached;

  logger.info("ftb.search_ids", { query });
  const data = await fetchJson<{ packs: number[]; total: number }>(
    `${FTB_API}/modpack/search/1000?term=${encodeURIComponent(query)}`
  );
  const ids = data.packs ?? [];
  await cacheSet(key, ids, TTL_SEARCH);
  return ids;
}

export async function searchPacks(
  query: string,
  limit = 24,
  offset = 0
): Promise<{ packs: any[]; total: number }> {
  if (!query.trim()) return getPackList(limit, offset);

  logger.info("ftb.search", { query, limit, offset });

  const allIds  = await getSearchIds(query);
  const pageIds = allIds.slice(offset, offset + limit);

  const results = await Promise.all(
    pageIds.map(id =>
      getPack(id).catch(() => null)
    )
  );

  return {
    packs: results.filter(Boolean),
    total: allIds.length,
  };
}
