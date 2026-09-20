// IndexedDB Cache for Raster files (GeoTIFF / COG)
// Ensures files are downloaded once and cached on client device

const DB_NAME = 'gis_raster_cache_db';
const STORE_NAME = 'raster_files';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getRasterProxyUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('/api/proxy-raster') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return `/api/proxy-raster?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export async function getCachedRaster(key: string): Promise<ArrayBuffer | null> {
  // Level 1: Browser Cache API (Fastest, handles HTTP responses natively)
  if ('caches' in window) {
    try {
      const cache = await caches.open('gis_raster_cache');
      const response = await cache.match(key);
      if (response) {
        return await response.arrayBuffer();
      }
    } catch (err) {
      console.warn('Cache API read error:', err);
    }
  }

  // Level 2: IndexedDB (Fallback for raw buffer storage)
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);

      getReq.onsuccess = () => {
        if (getReq.result instanceof ArrayBuffer) {
          resolve(getReq.result);
        } else if (getReq.result instanceof Blob) {
          getReq.result.arrayBuffer().then(resolve).catch(() => resolve(null));
        } else {
          resolve(null);
        }
      };

      getReq.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('IndexedDB read error:', err);
    return null;
  }
}

export async function saveCachedRaster(key: string, data: ArrayBuffer): Promise<void> {
  // Save to Cache API
  if ('caches' in window) {
    try {
      const cache = await caches.open('gis_raster_cache');
      const response = new Response(data, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': data.byteLength.toString() }
      });
      await cache.put(key, response);
    } catch (err) {
      console.warn('Cache API write error:', err);
    }
  }

  // Save to IndexedDB (as fallback)
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(data, key);

      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn('IndexedDB write error:', err);
  }
}

export async function removeCachedRaster(key: string): Promise<void> {
  if ('caches' in window) {
    try {
      const cache = await caches.open('gis_raster_cache');
      await cache.delete(key);
    } catch (err) {}
  }

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(key);

      delReq.onsuccess = () => resolve();
      delReq.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('IndexedDB delete error:', err);
  }
}

export async function removeCachedRasters(keys: string[]): Promise<void> {
  if (!keys || keys.length === 0) return;
  
  if ('caches' in window) {
    try {
      const cache = await caches.open('gis_raster_cache');
      for (const k of keys) {
        if (k) await cache.delete(k);
      }
    } catch (err) {}
  }

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      keys.forEach((k) => {
        if (k) store.delete(k);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('IndexedDB batch delete error:', err);
  }
}

export async function clearAllRasterCache(): Promise<void> {
  if ('caches' in window) {
    try {
      await caches.delete('gis_raster_cache');
    } catch (err) {}
  }

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const clearReq = store.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('IndexedDB clear error:', err);
  }
}

export async function fetchRasterWithCache(url: string, onProgress?: (percent: number) => void): Promise<ArrayBuffer> {
  // 1. Check local Cache API / IndexedDB cache first
  const cached = await getCachedRaster(url);
  if (cached && cached.byteLength > 0) {
    if (onProgress) onProgress(100);
    return cached;
  }

  // URLs to try in order: 1. Express backend proxy (Zero CORS issues + Range support) -> 2. Direct -> 3. Fallback CORS proxy
  const urlsToTry = [
    getRasterProxyUrl(url),
    url,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  let lastError: any = null;

  for (const targetUrl of urlsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout per attempt
    try {
      const response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body || totalBytes <= 0) {
        // Fallback if ReadableStream is not supported or Content-Length is missing
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
          saveCachedRaster(url, arrayBuffer).catch(() => {});
          if (onProgress) onProgress(100);
          return arrayBuffer;
        }
      } else {
        const reader = response.body.getReader();
        let receivedBytes = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            if (onProgress) {
              const percent = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
              onProgress(percent);
            }
          }
        }

        // Concatenate all chunks into a single ArrayBuffer
        const concatenated = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          concatenated.set(chunk, offset);
          offset += chunk.length;
        }

        const arrayBuffer = concatenated.buffer;
        if (arrayBuffer.byteLength > 0) {
          saveCachedRaster(url, arrayBuffer).catch(() => {});
          if (onProgress) onProgress(100);
          return arrayBuffer;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      console.warn(`Thử tải từ ${targetUrl} không thành công, đang thử nguồn tiếp theo...`, err);
    }
  }

  throw lastError || new Error('Không thể tải file raster từ tất cả các nguồn.');
}
