/**
 * Dictionary auto-update for offline mode.
 *
 * On startup, if the network is available, compare the local cached version.json
 * against the server's version.json. If the dictHash differs, invalidate all
 * cached dictionary files in the service-worker cache so they are re-fetched
 * on next access — without requiring a full app reload.
 *
 * This module is a no-op when called outside a browser or when the Cache API
 * is unavailable.
 */

const VERSION_URL = '/version.json';
const CACHE_NAME = 'polywordlot-v1';
const DICT_UPDATE_KEY = 'polywordlot-dict-hash';

interface VersionInfo {
  sha: string;
  buildTime: string;
  dictHash: string;
}

async function fetchVersionInfo(bustCache: boolean): Promise<VersionInfo | null> {
  try {
    const res = await fetch(VERSION_URL, bustCache ? { cache: 'no-store' } : undefined);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Evicts dictionary files from the SW cache whose URLs match /dict/.
 */
async function evictDictCache(): Promise<number> {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const dictKeys = keys.filter((req) => new URL(req.url).pathname.startsWith('/dict/'));
  await Promise.all(dictKeys.map((k) => cache.delete(k)));
  return dictKeys.length;
}

/**
 * Call once at app startup (after SW is registered).
 * Silently skips everything when offline.
 */
export async function checkAndUpdateDictionaries(): Promise<void> {
  if (!navigator.onLine) return;

  const remote = await fetchVersionInfo(true);
  if (!remote) return; // network request failed — skip

  const localHash = localStorage.getItem(DICT_UPDATE_KEY);

  if (localHash !== remote.dictHash) {
    const evicted = await evictDictCache();
    localStorage.setItem(DICT_UPDATE_KEY, remote.dictHash);
    if (evicted > 0) {
      console.log(
        `[dictUpdate] Dict hash changed (${localHash?.slice(0, 8) ?? 'none'} → ${remote.dictHash.slice(0, 8)}). Evicted ${evicted} cached dict files — they will be re-fetched on next use.`
      );
    }
  }
}
