import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { adminDb } from './firebaseAdmin';
import { requireEditorOrAdmin } from './auth';
import { bumpSyncVersion } from './sync';

// Server-side cache directory for commune spatial index snapshot
export const COMMUNES_CACHE_DIR = path.join('/tmp', 'communes_cache');
export const COMMUNES_SPATIAL_INDEX_FILE = path.join(COMMUNES_CACHE_DIR, 'spatial_index.json');
try {
  if (!fs.existsSync(COMMUNES_CACHE_DIR)) {
    fs.mkdirSync(COMMUNES_CACHE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Could not initialize /tmp/communes_cache:', err);
}

export interface IndexedCommuneServerFeature {
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  geometryType: 'Polygon' | 'MultiPolygon';
  coordinates: any;
  properties: {
    XaCu: string;
    Huyen: string;
    TinhCu: string;
    XaMoi: string;
    TinhMoi: string;
  };
}

let serverCommunesIndex: IndexedCommuneServerFeature[] | null = null;
let isIndexingCommunes = false;

export interface CommuneLookupResponse {
  XaCu: string | null;
  Huyen: string | null;
  TinhCu: string | null;
  XaMoi: string | null;
  TinhMoi: string | null;
}
export const serverCommuneLookupCache = new Map<string, CommuneLookupResponse>();

let cachedCommuneChunksResponse: {
  payload: { chunks: any[] };
  etag: string;
  updatedAt: number;
} | null = null;

export function invalidateCommuneChunksCache() {
  cachedCommuneChunksResponse = null;
}


function computeCommuneBoundingBox(type: string, coordinates: any): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const update = (lng: number, lat: number) => {
    if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };

  if (type === 'Polygon') {
    const rings = coordinates as number[][][];
    if (!rings || !rings[0]) return null;
    for (const pt of rings[0]) {
      update(pt[0], pt[1]);
    }
  } else if (type === 'MultiPolygon') {
    const polys = coordinates as number[][][][];
    if (!polys) return null;
    for (const poly of polys) {
      if (poly && poly[0]) {
        for (const pt of poly[0]) {
          update(pt[0], pt[1]);
        }
      }
    }
  } else {
    return null;
  }

  if (minLng === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}

function isPointInRing(point: [number, number], ring: number[][]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointInPolygon(point: [number, number], rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return false;
  if (!isPointInRing(point, rings[0])) {
    return false;
  }
  for (let i = 1; i < rings.length; i++) {
    if (isPointInRing(point, rings[i])) {
      return false;
    }
  }
  return true;
}

function isPointInMultiPolygon(point: [number, number], polygons: number[][][][]): boolean {
  if (!polygons) return false;
  for (const poly of polygons) {
    if (isPointInPolygon(point, poly)) {
      return true;
    }
  }
  return false;
}

function extractCommuneProperties(props: Record<string, any> | undefined | null) {
  if (!props) {
    return { XaCu: '', Huyen: '', TinhCu: '', XaMoi: '', TinhMoi: '' };
  }
  const getProp = (key1: string, key2: string) => {
    if (props[key1] != null && String(props[key1]).trim() !== '') return String(props[key1]).trim();
    if (props[key2] != null && String(props[key2]).trim() !== '') return String(props[key2]).trim();
    return '';
  };
  const ten = getProp('Ten', 'ten');
  const huyen = getProp('Huyen', 'huyen');
  const tinh = getProp('Tinh', 'tinh');
  const xaMoi = getProp('XaMoi', 'xaMoi');
  const tinhMoi = getProp('TinhMoi', 'tinhMoi');

  return {
    XaCu: ten || '',
    Huyen: huyen || '',
    TinhCu: tinh || '',
    XaMoi: xaMoi || ten || '',
    TinhMoi: tinhMoi || tinh || '',
  };
}

export async function ensureCommunesIndexInitialized(forceReload = false): Promise<IndexedCommuneServerFeature[]> {
  if (!forceReload && serverCommunesIndex && serverCommunesIndex.length > 0) {
    return serverCommunesIndex;
  }
  if (isIndexingCommunes) {
    let attempts = 0;
    while (isIndexingCommunes && attempts < 40) {
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }
    return serverCommunesIndex || [];
  }

  isIndexingCommunes = true;
  try {
    // 1. Tầng 1: Đọc nhanh từ file snapshot cục bộ tại /tmp (mất ~15ms, không tốn quota Firestore)
    if (!forceReload && fs.existsSync(COMMUNES_SPATIAL_INDEX_FILE)) {
      try {
        const raw = await fs.promises.readFile(COMMUNES_SPATIAL_INDEX_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          serverCommunesIndex = parsed;
          console.log(`[CommuneIndex] Đã nạp thành công ${parsed.length} polygon xã từ ổ đĩa tạm /tmp vào RAM`);
          return parsed;
        }
      } catch (readErr) {
        console.warn('[CommuneIndex] Lỗi đọc cache từ /tmp, chuyển sang nạp từ Firestore:', readErr);
      }
    }

    // 2. Tầng 2: Nạp từ Firestore nếu chưa có cache tại /tmp hoặc khi forceReload
    if (!adminDb) return [];
    const snap = await adminDb.collection('commune_chunks').get();
    const indexed: IndexedCommuneServerFeature[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.payloadJson) continue;
      try {
        const features = JSON.parse(data.payloadJson);
        if (!Array.isArray(features)) continue;
        for (const feat of features) {
          if (!feat) continue;
          const geom = feat.geometry || feat;
          if (!geom || !geom.type || !geom.coordinates) continue;
          const type = geom.type;
          if (type !== 'Polygon' && type !== 'MultiPolygon') continue;

          const bbox = computeCommuneBoundingBox(type, geom.coordinates);
          if (!bbox) continue;

          const vals = extractCommuneProperties(feat.properties || {});
          indexed.push({
            bbox,
            geometryType: type,
            coordinates: geom.coordinates,
            properties: vals,
          });
        }
      } catch (_) {}
    }

    serverCommunesIndex = indexed;
    console.log(`[CommuneIndex] Đã nạp ${indexed.length} polygon xã từ Firestore vào RAM`);

    // 3. Ghi snapshot ra file /tmp/communes_cache/spatial_index.json để các lần khởi động sau dùng ngay
    if (indexed.length > 0) {
      try {
        await fs.promises.writeFile(COMMUNES_SPATIAL_INDEX_FILE, JSON.stringify(indexed), 'utf-8');
        console.log(`[CommuneIndex] Đã lưu snapshot dữ liệu xã ra file đĩa tạm: ${COMMUNES_SPATIAL_INDEX_FILE}`);
      } catch (writeErr) {
        console.warn('[CommuneIndex] Không thể ghi snapshot vào /tmp:', writeErr);
      }
    }

    return indexed;
  } catch (err) {
    console.error('[CommuneIndex] Lỗi nạp dữ liệu polygon xã:', err);
    return [];
  } finally {
    isIndexingCommunes = false;
  }
}

export function registerCommuneRoutes(app: express.Express) {
  // Batch Upload via Admin SDK
  app.post('/api/communes/batch', express.json({ limit: '100mb' }), requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { chunks, meta, clearExisting } = req.body;

      if (clearExisting) {
        try {
          const oldChunks = await adminDb.collection('commune_chunks').get();
          for (const d of oldChunks.docs) {
            await adminDb.collection('commune_chunks').doc(d.id).delete();
          }
        } catch (e) {
          console.warn('[API /api/communes/batch] Clear old chunks warning:', e);
        }
      }

      if (Array.isArray(chunks) && chunks.length > 0) {
        const batch = adminDb.batch();
        for (const chunk of chunks) {
          if (chunk.id && chunk.payloadJson) {
            const ref = adminDb.collection('commune_chunks').doc(chunk.id);
            batch.set(ref, {
              chunkIndex: chunk.chunkIndex,
              itemCount: chunk.itemCount,
              payloadJson: chunk.payloadJson,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
        }
        await batch.commit();
      }

      if (meta) {
        await adminDb.collection('commune_meta').doc('config').set({
          ...meta,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      // Invalidate server in-memory cache and /tmp disk cache upon upload
      cachedCommuneChunksResponse = null;
      serverCommunesIndex = null;
      serverCommuneLookupCache.clear();
      try {
        if (fs.existsSync(COMMUNES_SPATIAL_INDEX_FILE)) {
          fs.unlinkSync(COMMUNES_SPATIAL_INDEX_FILE);
        }
      } catch (_) {}
      await bumpSyncVersion('communes');
      ensureCommunesIndexInitialized(true).catch(() => {});

      return res.json({ success: true, count: chunks?.length || 0 });
    } catch (err: any) {
      console.error('[API POST /api/communes/batch] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save commune chunks' });
    }
  });

  // Metadata
  app.get('/api/communes/meta', async (req, res) => {
    try {
      if (!adminDb) return res.json({ totalFeatures: 0, totalChunks: 0 });
      const metaDoc = await adminDb.collection('commune_meta').doc('config').get();
      if (metaDoc.exists) {
        return res.json(metaDoc.data());
      }
      return res.json({ totalFeatures: 0, totalChunks: 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Chunks
  app.get('/api/communes/chunks', async (req, res) => {
    try {
      if (cachedCommuneChunksResponse) {
        const clientEtag = req.headers['if-none-match'];
        if (clientEtag && clientEtag === cachedCommuneChunksResponse.etag) {
          return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'public, no-cache');
        res.setHeader('ETag', cachedCommuneChunksResponse.etag);
        return res.json(cachedCommuneChunksResponse.payload);
      }

      if (!adminDb) return res.json({ chunks: [] });
      const snap = await adminDb.collection('commune_chunks').get();
      const chunks = snap.docs.map((d: any) => ({
        id: d.id,
        chunkIndex: d.data().chunkIndex,
        itemCount: d.data().itemCount,
        payloadJson: d.data().payloadJson,
        updatedAt: d.data().updatedAt,
      }));
      chunks.sort((a: any, b: any) => (a.chunkIndex || 0) - (b.chunkIndex || 0));

      const payload = { chunks };
      const etag = `W/"communes-${chunks.length}-${crypto.createHash('md5').update(JSON.stringify(chunks)).digest('hex').slice(0, 16)}"`;

      cachedCommuneChunksResponse = {
        payload,
        etag,
        updatedAt: Date.now(),
      };

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && clientEtag === etag) {
        return res.status(304).end();
      }

      res.setHeader('Cache-Control', 'public, no-cache');
      res.setHeader('ETag', etag);
      return res.json(payload);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Direct Spatial Commune Lookup API: Returns 5 fields (XaCu, Huyen, TinhCu, XaMoi, TinhMoi)
  app.get('/api/communes/lookup', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Toạ độ lat, lng không hợp lệ' });
      }

      const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      const cached = serverCommuneLookupCache.get(cacheKey);
      if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.json(cached);
      }

      const index = await ensureCommunesIndexInitialized();
      if (!index || index.length === 0) {
        return res.json({
          XaCu: null,
          Huyen: null,
          TinhCu: null,
          XaMoi: null,
          TinhMoi: null,
        });
      }

      const pt: [number, number] = [lng, lat];
      let matchedFeature: IndexedCommuneServerFeature | null = null;

      for (const item of index) {
        const [minLng, minLat, maxLng, maxLat] = item.bbox;
        if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
          continue;
        }

        if (item.geometryType === 'Polygon') {
          if (isPointInPolygon(pt, item.coordinates)) {
            matchedFeature = item;
            break;
          }
        } else if (item.geometryType === 'MultiPolygon') {
          if (isPointInMultiPolygon(pt, item.coordinates)) {
            matchedFeature = item;
            break;
          }
        }
      }

      const responseData: CommuneLookupResponse = matchedFeature
        ? {
            XaCu: matchedFeature.properties.XaCu || null,
            Huyen: matchedFeature.properties.Huyen || null,
            TinhCu: matchedFeature.properties.TinhCu || null,
            XaMoi: matchedFeature.properties.XaMoi || null,
            TinhMoi: matchedFeature.properties.TinhMoi || null,
          }
        : {
            XaCu: null,
            Huyen: null,
            TinhCu: null,
            XaMoi: null,
            TinhMoi: null,
          };

      if (serverCommuneLookupCache.size > 10000) {
        const keysToDelete = Array.from(serverCommuneLookupCache.keys()).slice(0, 2000);
        keysToDelete.forEach((k) => serverCommuneLookupCache.delete(k));
      }
      serverCommuneLookupCache.set(cacheKey, responseData);

      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json(responseData);
    } catch (err: any) {
      console.error('[API /api/communes/lookup] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi tra cứu xã' });
    }
  });

  // Clear server disk cache & RAM cache for communes
  app.post('/api/communes/clear-cache', requireEditorOrAdmin, async (req, res) => {
    try {
      cachedCommuneChunksResponse = null;
      serverCommunesIndex = null;
      serverCommuneLookupCache.clear();
      if (fs.existsSync(COMMUNES_SPATIAL_INDEX_FILE)) {
        try {
          fs.unlinkSync(COMMUNES_SPATIAL_INDEX_FILE);
        } catch (_) {}
      }
      ensureCommunesIndexInitialized(true).catch(() => {});
      return res.json({ success: true, message: 'Đã xóa bộ đệm đĩa và RAM của dữ liệu xã' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Lỗi xóa cache xã' });
    }
  });
}
