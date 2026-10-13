/**
 * Lightweight native IndexedDB cache utility for web client
 * Provides offline-capable, high-capacity key-value storage with TTL support.
 * Automatically falls back to in-memory cache if IndexedDB is unavailable (e.g. private mode).
 */

const DB_NAME = 'gis_client_cache_v1';
const STORE_NAME = 'key_val_store';
const DB_VERSION = 1;

interface CacheEntry<T = any> {
  key: string;
  data: T;
  savedAt: number;
}

// Memory fallback in case IndexedDB is restricted by browser security policies
const memoryStore = new Map<string, CacheEntry>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (err) => {
        console.warn('[IndexedDB] Cannot open database, fallback to memory:', err);
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('[IndexedDB] Database open blocked');
        resolve(null);
      };
    } catch (e) {
      console.warn('[IndexedDB] Exception opening database, fallback to memory:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Retrieve cached data by key.
 * @param key Cache identifier
 * @param maxAgeMs Maximum age in milliseconds (optional). If expired, returns null.
 */
export async function getCachedData<T = any>(key: string, maxAgeMs?: number): Promise<T | null> {
  try {
    const db = await getDb();
    if (!db) {
      const memEntry = memoryStore.get(key);
      if (!memEntry) return null;
      if (maxAgeMs && Date.now() - memEntry.savedAt > maxAgeMs) {
        memoryStore.delete(key);
        return null;
      }
      return memEntry.data as T;
    }

    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          const entry: CacheEntry<T> | undefined = req.result;
          if (!entry) {
            resolve(null);
            return;
          }

          if (maxAgeMs && Date.now() - entry.savedAt > maxAgeMs) {
            // Expired - clean it up in background
            deleteCachedData(key).catch(() => {});
            resolve(null);
            return;
          }

          resolve(entry.data);
        };

        req.onerror = () => {
          resolve(null);
        };
      } catch (err) {
        console.warn('[IndexedDB] Error reading key', key, err);
        resolve(null);
      }
    });
  } catch (err) {
    console.warn('[IndexedDB] getCachedData error:', err);
    return null;
  }
}

/**
 * Store data into cache with current timestamp.
 */
export async function setCachedData<T = any>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = {
    key,
    data,
    savedAt: Date.now(),
  };

  // Always keep in memory fallback as well
  memoryStore.set(key, entry);

  try {
    const db = await getDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(entry);

        req.onsuccess = () => resolve();
        req.onerror = (err) => {
          console.warn('[IndexedDB] Put error for key', key, err);
          resolve();
        };
      } catch (err) {
        console.warn('[IndexedDB] Transaction error for key', key, err);
        resolve();
      }
    });
  } catch (err) {
    console.warn('[IndexedDB] setCachedData error:', err);
  }
}

/**
 * Delete a specific key from cache.
 */
export async function deleteCachedData(key: string): Promise<void> {
  memoryStore.delete(key);

  try {
    const db = await getDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  } catch (_) {}
}

/**
 * Clear all cached entries.
 */
export async function clearAllCachedData(): Promise<void> {
  memoryStore.clear();

  try {
    const db = await getDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  } catch (_) {}
}
