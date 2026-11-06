import express from 'express';
import crypto from 'crypto';
import { adminDb } from './firebaseAdmin';
import { requireEditorOrAdmin } from './auth';
import { bumpSyncVersion, getSyncRegistry } from './sync';

export function cleanShapePropertiesServer(props: Record<string, any> | undefined | null): Record<string, any> {
  if (!props || typeof props !== 'object') return {};
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(props)) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      norm === 'shapearea' ||
      norm === 'shapelength' ||
      norm === 'shapeleng' ||
      norm.startsWith('shapearea') ||
      norm.startsWith('shapelength') ||
      norm.startsWith('shapeleng')
    ) {
      continue;
    }
    cleaned[k] = v;
  }
  return cleaned;
}

export function getServerFeatureUniqueKey(feat: any): string {
  if (!feat) return 'default_unknown';
  const layerId = feat.layerId || 'default';

  // 1. Check OBJECTID in properties
  let objId: any = null;
  const props = feat.properties;
  if (props && typeof props === 'object') {
    for (const k of Object.keys(props)) {
      const lower = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lower === 'objectid' || lower === 'objectid1' || lower === 'objectid0' || lower === 'fid') {
        const val = props[k];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          objId = val;
          break;
        }
      }
    }
  }

  if (objId !== null && objId !== undefined) {
    return `${layerId}_objid_${String(objId).toLowerCase().trim()}`;
  }

  const idStr = feat.id !== undefined && feat.id !== null ? String(feat.id).toLowerCase().trim() : '';
  if (idStr !== '') {
    if (idStr.startsWith(String(layerId).toLowerCase() + '_')) {
      return idStr;
    }
    return `${layerId}_id_${idStr}`;
  }

  const codeStr = feat.code ? String(feat.code).toLowerCase().trim() : '';
  if (codeStr !== '') {
    return `${layerId}_code_${codeStr}`;
  }

  return `${layerId}_id_${String(feat.name || 'unknown').toLowerCase().trim()}`;
}

// ==========================================
// SERVER IN-MEMORY FEATURE STORE & DELTA SYNC ENGINE
// ==========================================
export const inMemoryFeatureMap = new Map<string, any>();
export const inMemoryDeletedKeys = new Set<string>();

interface FeatureChangeRecord {
  version: number;
  type: 'upsert' | 'delete';
  key: string;
  id?: string;
  feature?: any;
  timestamp: string;
}
const featureChangeHistory: FeatureChangeRecord[] = [];
const MAX_CHANGE_HISTORY = 1000;

let isFeatureStoreInitialized = false;
let featureStoreInitPromise: Promise<void> | null = null;
let cachedFeaturesAllPayload: { features: any[] } | null = null;
let cachedFeaturesAllEtag: string = '';

export function invalidateFeaturesResponseCache() {
  cachedFeaturesAllPayload = null;
  cachedFeaturesAllEtag = '';
}

function recordFeatureChange(type: 'upsert' | 'delete', key: string, feature?: any, currentVersion: number = 1) {
  featureChangeHistory.push({
    version: currentVersion,
    type,
    key: key.toLowerCase(),
    id: feature?.id ? String(feature.id) : undefined,
    feature: feature ? JSON.parse(JSON.stringify(feature)) : undefined,
    timestamp: new Date().toISOString(),
  });
  if (featureChangeHistory.length > MAX_CHANGE_HISTORY) {
    featureChangeHistory.shift();
  }
}

export async function ensureFeatureStoreInitialized(): Promise<void> {
  if (isFeatureStoreInitialized) return;
  if (featureStoreInitPromise) return featureStoreInitPromise;

  featureStoreInitPromise = (async () => {
    try {
      if (!adminDb) return;
      console.log('[FeatureStore] Đang khởi tạo In-Memory Store từ Firestore (Một lần duy nhất)...');

      // 1. Đọc danh sách đã xóa
      try {
        const delSnap = await adminDb.collection('app_settings').doc('deleted_features').get();
        if (delSnap.exists && Array.isArray(delSnap.data()?.keys)) {
          delSnap.data()?.keys.forEach((k: string) => inMemoryDeletedKeys.add(String(k).toLowerCase().trim()));
        }
      } catch (_) {}

      // 2. Đọc layer_chunks
      try {
        const chunksSnap = await adminDb.collection('layer_chunks').get();
        chunksSnap.docs.forEach((docSnap: any) => {
          const data = docSnap.data();
          if (data && data.payloadJson) {
            try {
              const list = JSON.parse(data.payloadJson);
              if (Array.isArray(list)) {
                list.forEach((item: any) => {
                  if (item) {
                    const uniqueKey = getServerFeatureUniqueKey(item);
                    const lowerKey = uniqueKey.toLowerCase();
                    const lowerId = String(item.id || '').toLowerCase();
                    const lowerObjId = String(item.properties?.OBJECTID || '').toLowerCase();
                    if (
                      !inMemoryDeletedKeys.has(lowerKey) &&
                      !inMemoryDeletedKeys.has(lowerId) &&
                      (!lowerObjId || !inMemoryDeletedKeys.has(lowerObjId))
                    ) {
                      let coords = item.coordinates;
                      if (typeof coords === 'string') {
                        try { coords = JSON.parse(coords); } catch (_) { coords = []; }
                      }
                      item.coordinates = coords;
                      inMemoryFeatureMap.set(uniqueKey, item);
                    }
                  }
                });
              }
            } catch (_) {}
          }
        });
      } catch (cErr) {
        console.warn('[FeatureStore] Lỗi đọc layer_chunks:', cErr);
      }

      // 3. Đọc map_features lẻ (ghi đè layer_chunks)
      try {
        const indivSnap = await adminDb.collection('map_features').get();
        indivSnap.docs.forEach((docSnap: any) => {
          const data = docSnap.data();
          const featId = data.id || docSnap.id;
          const uniqueKey = getServerFeatureUniqueKey(data);
          const lowerKey = uniqueKey.toLowerCase();
          const lowerId = String(featId).toLowerCase();
          const lowerDocId = docSnap.id.toLowerCase();
          const lowerObjId = String(data.properties?.OBJECTID || '').toLowerCase();

          if (
            inMemoryDeletedKeys.has(lowerKey) ||
            inMemoryDeletedKeys.has(lowerId) ||
            inMemoryDeletedKeys.has(lowerDocId) ||
            (lowerObjId && inMemoryDeletedKeys.has(lowerObjId))
          ) {
            return;
          }

          let coords = data.coordinates;
          if (typeof coords === 'string') {
            try { coords = JSON.parse(coords); } catch (_) { coords = []; }
          }
          const item = {
            id: featId,
            layerId: data.layerId || 'layer1_tim_kiem',
            name: data.name || '',
            code: data.code || undefined,
            type: data.type || 'Point',
            coordinates: coords,
            properties: data.properties || {},
            updatedAt: data.updatedAt,
          };
          inMemoryFeatureMap.set(uniqueKey, item);
        });
      } catch (iErr) {
        console.warn('[FeatureStore] Lỗi đọc map_features:', iErr);
      }

      isFeatureStoreInitialized = true;
      console.log(`[FeatureStore] Khởi tạo thành công! Tổng cộng: ${inMemoryFeatureMap.size} đối tượng trong RAM.`);
    } catch (err) {
      console.error('[FeatureStore] Khởi tạo thất bại:', err);
    } finally {
      featureStoreInitPromise = null;
    }
  })();

  return featureStoreInitPromise;
}

// ==========================================
// OPENSTREETMAP SERVER PROXY & CACHE API
// ==========================================
const osmSearchCache = new Map<string, { timestamp: number; items: any[] }>();

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function classifyServerOsmItem(
  name: string,
  tags: Record<string, string> = {},
  osmKey?: string,
  osmValue?: string
): { group: 'hanh_chinh' | 'song_nui' | 'di_tich' | 'giao_thong'; kind: string; kindLabel: string } {
  const lowerName = name.toLowerCase();

  // 1. Nhóm Nghĩa trang & Di tích
  if (
    tags.landuse === 'cemetery' ||
    tags.amenity === 'grave_yard' ||
    (osmKey === 'landuse' && osmValue === 'cemetery') ||
    (osmKey === 'amenity' && osmValue === 'grave_yard') ||
    lowerName.includes('nghĩa trang') ||
    lowerName.includes('liệt sĩ') ||
    lowerName.includes('mộ')
  ) {
    return { group: 'di_tich', kind: 'cemetery', kindLabel: 'Nghĩa trang' };
  }

  if (
    tags.historic === 'battlefield' ||
    (osmKey === 'historic' && osmValue === 'battlefield') ||
    lowerName.includes('chiến trường') ||
    lowerName.includes('trận')
  ) {
    return { group: 'di_tich', kind: 'battlefield', kindLabel: 'Chiến trường' };
  }

  if (
    tags.historic === 'memorial' ||
    tags.historic === 'monument' ||
    osmKey === 'historic' ||
    lowerName.includes('tưởng niệm') ||
    lowerName.includes('đài tưởng niệm') ||
    lowerName.includes('di tích') ||
    lowerName.includes('chùa') ||
    lowerName.includes('đền') ||
    lowerName.includes('miếu')
  ) {
    return { group: 'di_tich', kind: 'memorial', kindLabel: 'Di tích/Tưởng niệm' };
  }

  // 2. Nhóm Sông núi & Thủy văn
  if (
    tags.natural === 'water' ||
    tags.water === 'lake' ||
    tags.water === 'reservoir' ||
    tags.water === 'pond' ||
    tags.landuse === 'reservoir' ||
    (osmKey === 'natural' && osmValue === 'water') ||
    (osmKey === 'water' && (osmValue === 'lake' || osmValue === 'reservoir' || osmValue === 'pond')) ||
    (osmKey === 'landuse' && osmValue === 'reservoir') ||
    lowerName.startsWith('hồ ') ||
    lowerName.includes('hồ chứa nước') ||
    lowerName.startsWith('đầm ') ||
    lowerName.startsWith('bàu ') ||
    lowerName.startsWith('vực ')
  ) {
    return { group: 'song_nui', kind: 'lake', kindLabel: 'Hồ nước' };
  }

  if (
    tags.waterway === 'river' ||
    osmValue === 'river' ||
    (osmKey === 'waterway' && osmValue === 'river') ||
    lowerName.startsWith('sông ') ||
    lowerName.includes('sông ')
  ) {
    return { group: 'song_nui', kind: 'river', kindLabel: 'Sông' };
  }

  if (
    tags.waterway === 'stream' ||
    tags.waterway === 'canal' ||
    tags.waterway === 'drain' ||
    tags.waterway === 'ditch' ||
    osmValue === 'stream' ||
    osmValue === 'canal' ||
    lowerName.startsWith('suối ') ||
    lowerName.includes('suối ') ||
    lowerName.startsWith('kênh ') ||
    lowerName.startsWith('mương ')
  ) {
    return { group: 'song_nui', kind: 'stream', kindLabel: 'Suối' };
  }

  if (
    tags.natural === 'peak' ||
    osmValue === 'peak' ||
    lowerName.startsWith('núi ') ||
    lowerName.includes('đỉnh ') ||
    lowerName.includes('cao điểm')
  ) {
    return { group: 'song_nui', kind: 'peak', kindLabel: 'Đỉnh núi' };
  }

  if (
    tags.natural === 'hill' ||
    osmValue === 'hill' ||
    lowerName.startsWith('đồi ')
  ) {
    return { group: 'song_nui', kind: 'hill', kindLabel: 'Đồi' };
  }

  if (
    tags.natural === 'ridge' ||
    tags.natural === 'valley' ||
    osmValue === 'ridge' ||
    osmValue === 'valley' ||
    lowerName.includes('dãy núi') ||
    lowerName.includes('thung lũng')
  ) {
    return { group: 'song_nui', kind: 'ridge', kindLabel: 'Dãy núi/Thung lũng' };
  }

  // 3. Nhóm Giao thông & Đường sá
  if (
    osmKey === 'highway' ||
    tags.highway ||
    osmKey === 'bridge' ||
    tags.bridge ||
    osmValue === 'bridge' ||
    lowerName.startsWith('đường ') ||
    lowerName.startsWith('phố ') ||
    lowerName.startsWith('quốc lộ ') ||
    lowerName.startsWith('ql ') ||
    lowerName.startsWith('tỉnh lộ ') ||
    lowerName.startsWith('đt ') ||
    lowerName.startsWith('đại lộ ') ||
    lowerName.startsWith('cầu ') ||
    lowerName.startsWith('ngõ ') ||
    lowerName.startsWith('kiệt ') ||
    lowerName.startsWith('hẻm ') ||
    lowerName.startsWith('hầm ')
  ) {
    if (lowerName.startsWith('cầu ') || tags.bridge || osmValue === 'bridge') {
      return { group: 'giao_thong', kind: 'bridge', kindLabel: 'Cầu' };
    }
    if (
      osmValue === 'motorway' ||
      osmValue === 'trunk' ||
      tags.highway === 'motorway' ||
      tags.highway === 'trunk' ||
      lowerName.startsWith('quốc lộ ') ||
      lowerName.startsWith('ql ') ||
      lowerName.startsWith('cao tốc ')
    ) {
      return { group: 'giao_thong', kind: 'trunk', kindLabel: 'Quốc lộ/Cao tốc' };
    }
    if (
      osmValue === 'primary' ||
      osmValue === 'secondary' ||
      tags.highway === 'primary' ||
      tags.highway === 'secondary' ||
      lowerName.startsWith('tỉnh lộ ') ||
      lowerName.startsWith('đt ')
    ) {
      return { group: 'giao_thong', kind: 'primary', kindLabel: 'Tỉnh lộ/Đường chính' };
    }
    if (
      lowerName.startsWith('kiệt ') ||
      lowerName.startsWith('ngõ ') ||
      lowerName.startsWith('hẻm ')
    ) {
      return { group: 'giao_thong', kind: 'alley', kindLabel: 'Ngõ/Kiệt' };
    }
    return { group: 'giao_thong', kind: 'street', kindLabel: 'Đường phố' };
  }

  // 4. Nhóm Hành chính & Dân cư
  if (
    tags.place === 'hamlet' ||
    osmValue === 'hamlet' ||
    lowerName.startsWith('thôn ') ||
    lowerName.startsWith('bản ') ||
    lowerName.startsWith('ấp ')
  ) {
    return { group: 'hanh_chinh', kind: 'hamlet', kindLabel: 'Thôn/Bản' };
  }

  if (
    tags.place === 'village' ||
    osmValue === 'village' ||
    lowerName.startsWith('xã ') ||
    lowerName.startsWith('làng ')
  ) {
    return { group: 'hanh_chinh', kind: 'village', kindLabel: 'Làng/Xã' };
  }

  if (
    tags.place === 'town' ||
    osmValue === 'town' ||
    lowerName.startsWith('thị trấn ')
  ) {
    return { group: 'hanh_chinh', kind: 'town', kindLabel: 'Thị trấn' };
  }

  if (
    tags.place === 'suburb' ||
    osmValue === 'suburb' ||
    lowerName.startsWith('phường ') ||
    lowerName.startsWith('khu phố ')
  ) {
    return { group: 'hanh_chinh', kind: 'suburb', kindLabel: 'Phường/Khu' };
  }

  return { group: 'hanh_chinh', kind: 'locality', kindLabel: 'Địa danh' };
}

export function registerFeatureRoutes(app: express.Express) {
  // OSM Search API
  app.post('/api/osm/search', async (req, res) => {
    try {
      const { bounds, keyword } = req.body || {};
      if (!bounds) {
        return res.status(400).json({ error: 'bounds is required' });
      }

      const south = Number(bounds.south);
      const west = Number(bounds.west);
      const north = Number(bounds.north);
      const east = Number(bounds.east);

      if (isNaN(south) || isNaN(west) || isNaN(north) || isNaN(east)) {
        return res.status(400).json({ error: 'invalid bounds' });
      }

      const trimmedKeyword = keyword ? String(keyword).trim() : '';
      if (!trimmedKeyword) {
        return res.json({ success: true, items: [] });
      }

      const cacheKey = `${south.toFixed(3)}_${west.toFixed(3)}_${north.toFixed(3)}_${east.toFixed(3)}_${trimmedKeyword.toLowerCase()}`;

      const cached = osmSearchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) {
        return res.json({ success: true, items: cached.items, cached: true });
      }

      const items: any[] = [];
      const bboxStr = `${west},${south},${east},${north}`;

      if (trimmedKeyword) {
        const lowerKw = trimmedKeyword.toLowerCase();
        const photonFetches: Promise<any>[] = [
          fetch(
            `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&bbox=${bboxStr}&limit=50`,
            { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
          )
            .then((r) => r.json())
            .catch(() => ({ features: [] })),
        ];

        if (lowerKw.includes('hồ') || lowerKw.includes('đầm') || lowerKw.includes('bàu')) {
          photonFetches.push(
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&osm_tag=natural:water&bbox=${bboxStr}&limit=30`,
              { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
            )
              .then((r) => r.json())
              .catch(() => ({ features: [] })),
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&osm_tag=water&bbox=${bboxStr}&limit=30`,
              { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
            )
              .then((r) => r.json())
              .catch(() => ({ features: [] }))
          );
        }

        if (lowerKw.includes('sông') || lowerKw.includes('suối') || lowerKw.includes('kênh')) {
          photonFetches.push(
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&osm_tag=waterway&bbox=${bboxStr}&limit=30`,
              { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
            )
              .then((r) => r.json())
              .catch(() => ({ features: [] }))
          );
        }

        if (
          lowerKw.includes('đường') ||
          lowerKw.includes('phố') ||
          lowerKw.includes('quốc lộ') ||
          lowerKw.includes('ql') ||
          lowerKw.includes('cầu') ||
          lowerKw.includes('đại lộ') ||
          lowerKw.includes('kiệt') ||
          lowerKw.includes('ngõ') ||
          lowerKw.includes('hẻm')
        ) {
          photonFetches.push(
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&osm_tag=highway&bbox=${bboxStr}&limit=35`,
              { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
            )
              .then((r) => r.json())
              .catch(() => ({ features: [] }))
          );
        }

        const nominatimPromise = fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmedKeyword)}&format=json&viewbox=${west},${north},${east},${south}&bounded=1&limit=40&addressdetails=1&extratags=1`,
          { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0 (contact: admin@webgis.vn)' } }
        )
          .then((r) => r.json())
          .catch(() => []);

        const [photonResults, nominatimData] = await Promise.all([
          Promise.all(photonFetches),
          nominatimPromise,
        ]);

        for (const pData of photonResults) {
          for (const f of pData.features || []) {
            const p = f.properties || {};
            const geom = f.geometry || {};
            const name = p.name || p.street || p.locality || p.city;
            if (!name || !geom.coordinates || geom.coordinates.length < 2) continue;

            const lon = geom.coordinates[0];
            const lat = geom.coordinates[1];
            if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) continue;

            if (lat < south - 0.005 || lat > north + 0.005 || lon < west - 0.005 || lon > east + 0.005) {
              continue;
            }

            const { group, kind, kindLabel } = classifyServerOsmItem(name, {}, p.osm_key, p.osm_value);
            items.push({
              id: `photon/${p.osm_type || 'N'}/${p.osm_id || Math.random()}`,
              name: String(name).trim(),
              group,
              kind,
              kindLabel,
              lat: Number(lat.toFixed(6)),
              lon: Number(lon.toFixed(6)),
              ele: p.ele || p.extratags?.ele || undefined,
            });
          }
        }

        if (Array.isArray(nominatimData)) {
          for (const n of nominatimData) {
            const name = n.name || (n.display_name ? n.display_name.split(',')[0] : '');
            const lat = parseFloat(n.lat);
            const lon = parseFloat(n.lon);
            if (!name || isNaN(lat) || isNaN(lon)) continue;

            const extra = n.extratags || {};
            const { group, kind, kindLabel } = classifyServerOsmItem(name, extra, n.class, n.type);
            items.push({
              id: `nominatim/${n.osm_type || 'node'}/${n.osm_id || Math.random()}`,
              name: String(name).trim(),
              group,
              kind,
              kindLabel,
              lat: Number(lat.toFixed(6)),
              lon: Number(lon.toFixed(6)),
              ele: extra.ele || undefined,
            });
          }
        }
      }

      // Khử trùng lặp (< 50m và cùng tên)
      const deduped: any[] = [];
      for (const item of items) {
        const exists = deduped.some((existing) => {
          if (existing.name.toLowerCase() !== item.name.toLowerCase()) return false;
          const dist = calculateDistanceMeters(existing.lat, existing.lon, item.lat, item.lon);
          return dist < 50;
        });
        if (!exists) {
          deduped.push(item);
        }
      }

      if (osmSearchCache.size > 150) {
        const firstKey = osmSearchCache.keys().next().value;
        if (firstKey) osmSearchCache.delete(firstKey);
      }
      osmSearchCache.set(cacheKey, { timestamp: Date.now(), items: deduped });

      return res.json({ success: true, items: deduped });
    } catch (err: any) {
      console.error('Lỗi khi truy vấn OSM trên Server:', err);
      return res.status(500).json({ error: err.message || 'Lỗi khi xử lý truy vấn OpenStreetMap' });
    }
  });

  // Save/Update a single map feature via Admin SDK
  app.post('/api/features/save', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { feature } = req.body;
      if (!feature || !feature.id) {
        return res.status(400).json({ error: 'Missing feature or feature id' });
      }

      await ensureFeatureStoreInitialized();

      const rawCoords = feature.coordinates || feature.geometry?.coordinates || [];
      const parsedCoords = typeof rawCoords === 'string' ? JSON.parse(rawCoords || '[]') : rawCoords;
      const coordsJsonStr = typeof rawCoords === 'string' ? rawCoords : JSON.stringify(rawCoords);

      const cleanedDoc: Record<string, any> = {
        id: String(feature.id),
        layerId: feature.layerId || 'layer1_tim_kiem',
        name: feature.name || '',
        type: feature.type || feature.geometry?.type || 'Point',
        coordinates: coordsJsonStr,
        properties: cleanShapePropertiesServer(feature.properties || {}),
        updatedAt: feature.updatedAt || new Date().toISOString(),
      };
      if (feature.code) cleanedDoc.code = feature.code;

      const docId = getServerFeatureUniqueKey(feature);
      await adminDb.collection('map_features').doc(docId).set(cleanedDoc, { merge: true });

      // Remove from tombstones if previously marked as deleted
      try {
        const delRef = adminDb.collection('app_settings').doc('deleted_features');
        const delSnap = await delRef.get();
        if (delSnap.exists && Array.isArray(delSnap.data()?.keys)) {
          const keys: string[] = delSnap.data().keys;
          const targetKey = docId.toLowerCase();
          const targetId = String(feature.id).toLowerCase();
          const filtered = keys.filter(
            (k) => k.toLowerCase() !== targetKey && k.toLowerCase() !== targetId
          );
          if (filtered.length !== keys.length) {
            await delRef.set({ keys: filtered, updatedAt: new Date().toISOString() });
          }
        }
      } catch (_) {}

      // Update in-memory feature store immediately (0ms propagation)
      const cachedItem = {
        id: String(feature.id),
        layerId: cleanedDoc.layerId,
        name: cleanedDoc.name,
        code: cleanedDoc.code,
        type: cleanedDoc.type,
        coordinates: parsedCoords,
        properties: cleanedDoc.properties,
        updatedAt: cleanedDoc.updatedAt,
      };
      inMemoryDeletedKeys.delete(docId.toLowerCase());
      inMemoryDeletedKeys.delete(String(feature.id).toLowerCase());
      inMemoryFeatureMap.set(docId, cachedItem);
      invalidateFeaturesResponseCache();

      const newVer = await bumpSyncVersion('features');
      recordFeatureChange('upsert', docId, cachedItem, newVer);

      res.json({ success: true, docId });
    } catch (err: any) {
      console.error('[API POST /api/features/save] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save feature' });
    }
  });

  // Delete a feature via Admin SDK with comprehensive cross-collection cleanup
  app.post('/api/features/delete', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { id, layerId, objectId, uniqueKey } = req.body;
      if (!id && !objectId && !uniqueKey) {
        return res.status(400).json({ error: 'Missing feature identifiers' });
      }

      const strId = id ? String(id).trim() : '';
      const strObjId = objectId !== undefined && objectId !== null ? String(objectId).trim() : '';
      const strUniqueKey = uniqueKey ? String(uniqueKey).trim() : '';
      const strLayerId = layerId ? String(layerId).trim() : '';

      // 1. Candidate document IDs to delete directly in map_features
      const candidateDocIds = new Set<string>();
      if (strId) candidateDocIds.add(strId);
      if (strUniqueKey) candidateDocIds.add(strUniqueKey);
      if (strLayerId && strObjId) {
        candidateDocIds.add(`${strLayerId}_objid_${strObjId.toLowerCase()}`);
        candidateDocIds.add(`${strLayerId}_id_${strObjId.toLowerCase()}`);
      }
      if (strLayerId && strId) {
        candidateDocIds.add(`${strLayerId}_id_${strId.toLowerCase()}`);
        candidateDocIds.add(`${strLayerId}_objid_${strId.toLowerCase()}`);
      }

      for (const candId of candidateDocIds) {
        await adminDb.collection('map_features').doc(candId).delete().catch(() => {});
      }

      // 2. Query map_features to catch any documents matching id, code, or OBJECTID
      try {
        const matchesSnap = await adminDb.collection('map_features').get();
        const batch = adminDb.batch();
        let matchCount = 0;

        matchesSnap.docs.forEach((docSnap: any) => {
          const d = docSnap.data();
          const docDocId = docSnap.id.toLowerCase();
          const dId = String(d.id || '').toLowerCase();
          const dCode = String(d.code || '').toLowerCase();
          const dObjId = String(
            d.properties?.OBJECTID ||
            d.properties?.objectid ||
            d.properties?.fid ||
            ''
          ).toLowerCase();

          const isMatch =
            (strId && (docDocId === strId.toLowerCase() || dId === strId.toLowerCase() || dCode === strId.toLowerCase())) ||
            (strObjId && (dObjId === strObjId.toLowerCase() || dCode.includes(strObjId.toLowerCase()))) ||
            (strUniqueKey && docDocId === strUniqueKey.toLowerCase());

          if (isMatch) {
            batch.delete(docSnap.ref);
            matchCount++;
          }
        });

        if (matchCount > 0) {
          await batch.commit();
        }
      } catch (qErr) {
        console.warn('[API /api/features/delete] Query map_features warning:', qErr);
      }

      // 3. Scan and remove from layer_chunks if present
      try {
        const chunksSnap = await adminDb.collection('layer_chunks').get();
        for (const chunkDoc of chunksSnap.docs) {
          const cData = chunkDoc.data();
          if (cData && cData.payloadJson) {
            let chunkList: any[] = [];
            try { chunkList = JSON.parse(cData.payloadJson); } catch (_) {}

            if (Array.isArray(chunkList) && chunkList.length > 0) {
              const originalLen = chunkList.length;
              const filteredList = chunkList.filter((item: any) => {
                if (!item) return false;
                const itemId = String(item.id || '').toLowerCase();
                const itemCode = String(item.code || '').toLowerCase();
                const itemObjId = String(
                  item.properties?.OBJECTID ||
                  item.properties?.objectid ||
                  item.properties?.fid ||
                  ''
                ).toLowerCase();
                const itemKey = getServerFeatureUniqueKey(item).toLowerCase();

                if (strId && (itemId === strId.toLowerCase() || itemKey === strId.toLowerCase())) return false;
                if (strUniqueKey && itemKey === strUniqueKey.toLowerCase()) return false;
                if (strObjId && itemObjId === strObjId.toLowerCase()) return false;
                return true;
              });

              if (filteredList.length !== originalLen) {
                await chunkDoc.ref.update({
                  payloadJson: JSON.stringify(filteredList),
                  itemCount: filteredList.length,
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          }
        }
      } catch (chunkErr) {
        console.warn('[API /api/features/delete] layer_chunks cleanup warning:', chunkErr);
      }

      // 4. Save tombstone in app_settings/deleted_features
      try {
        const delRef = adminDb.collection('app_settings').doc('deleted_features');
        const delSnap = await delRef.get();
        const existingKeys: string[] = delSnap.exists && Array.isArray(delSnap.data()?.keys) ? delSnap.data().keys : [];
        const toAdd = [strId, strObjId, strUniqueKey].filter(Boolean);
        const updatedKeys = Array.from(new Set([...existingKeys, ...toAdd])).slice(-1000);
        await delRef.set({ keys: updatedKeys, updatedAt: new Date().toISOString() });
      } catch (_) {}

      // Update in-memory feature store immediately (0ms propagation)
      for (const candId of candidateDocIds) {
        inMemoryFeatureMap.delete(candId);
        inMemoryDeletedKeys.add(candId.toLowerCase());
      }
      if (strId) {
        inMemoryFeatureMap.delete(strId);
        inMemoryDeletedKeys.add(strId.toLowerCase());
      }
      if (strUniqueKey) {
        inMemoryFeatureMap.delete(strUniqueKey);
        inMemoryDeletedKeys.add(strUniqueKey.toLowerCase());
      }
      if (strObjId) {
        inMemoryDeletedKeys.add(strObjId.toLowerCase());
      }
      for (const [key, item] of Array.from(inMemoryFeatureMap.entries())) {
        const itemId = String(item.id || '').toLowerCase();
        const itemCode = String(item.code || '').toLowerCase();
        const itemObjId = String(
          item.properties?.OBJECTID ||
          item.properties?.objectid ||
          item.properties?.fid ||
          ''
        ).toLowerCase();
        const isMatch =
          (strId && (key.toLowerCase() === strId.toLowerCase() || itemId === strId.toLowerCase() || itemCode === strId.toLowerCase())) ||
          (strObjId && (itemObjId === strObjId.toLowerCase() || itemCode.includes(strObjId.toLowerCase()))) ||
          (strUniqueKey && key.toLowerCase() === strUniqueKey.toLowerCase());
        if (isMatch) {
          inMemoryFeatureMap.delete(key);
          inMemoryDeletedKeys.add(key.toLowerCase());
          inMemoryDeletedKeys.add(itemId);
        }
      }

      invalidateFeaturesResponseCache();
      const newVersion = await bumpSyncVersion('features');
      const tombstoneKey = strUniqueKey || strId || (candidateDocIds.size > 0 ? Array.from(candidateDocIds)[0] : 'unknown');
      recordFeatureChange('delete', tombstoneKey, undefined, newVersion);

      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/features/delete] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete feature' });
    }
  });

  // Batch save / layer chunks save via Admin SDK
  app.post('/api/features/batch', express.json({ limit: '100mb' }), requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { features, chunks } = req.body;

      if (Array.isArray(chunks) && chunks.length > 0) {
        const BATCH_LIMIT = 400;
        for (let b = 0; b < chunks.length; b += BATCH_LIMIT) {
          const sliceChunks = chunks.slice(b, b + BATCH_LIMIT);
          const batch = adminDb.batch();
          for (const chunk of sliceChunks) {
            if (chunk.id && chunk.payloadJson) {
              let sanitizedPayload = chunk.payloadJson;
              try {
                const list: any[] = JSON.parse(chunk.payloadJson);
                if (Array.isArray(list)) {
                  const cleanedList = list.map((item) => ({
                    ...item,
                    properties: cleanShapePropertiesServer(item.properties || {}),
                  }));
                  sanitizedPayload = JSON.stringify(cleanedList);
                }
              } catch (_) {}

              const chunkRef = adminDb.collection('layer_chunks').doc(chunk.id);
              batch.set(chunkRef, {
                chunkIndex: chunk.chunkIndex,
                itemCount: chunk.itemCount,
                payloadJson: sanitizedPayload,
                updatedAt: new Date().toISOString(),
              }, { merge: true });

              try {
                const list: any[] = JSON.parse(sanitizedPayload);
                if (Array.isArray(list)) {
                  for (const item of list) {
                    if (item) {
                      const uniqueKey = getServerFeatureUniqueKey(item);
                      inMemoryFeatureMap.set(uniqueKey, item);
                      inMemoryDeletedKeys.delete(uniqueKey.toLowerCase());
                      if (item.id) inMemoryDeletedKeys.delete(String(item.id).toLowerCase());
                    }
                  }
                }
              } catch (_) {}
            }
          }
          await batch.commit();
        }
        invalidateFeaturesResponseCache();
        await bumpSyncVersion('features');
        return res.json({ success: true, count: features?.length || 0 });
      }

      if (Array.isArray(features)) {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < features.length; i += CHUNK_SIZE) {
          const slice = features.slice(i, i + CHUNK_SIZE);
          const batch = adminDb.batch();
          for (const feat of slice) {
            if (feat && feat.id) {
              const docRef = adminDb.collection('map_features').doc(String(feat.id));
              const rawCoords = feat.coordinates || feat.geometry?.coordinates || [];
              const coordsJsonStr = typeof rawCoords === 'string' ? rawCoords : JSON.stringify(rawCoords);
              const cleanedProps = cleanShapePropertiesServer(feat.properties || {});
              batch.set(
                docRef,
                {
                  id: String(feat.id),
                  layerId: feat.layerId || 'layer1_tim_kiem',
                  name: feat.name || '',
                  type: feat.type || feat.geometry?.type || 'Point',
                  coordinates: coordsJsonStr,
                  properties: cleanedProps,
                  updatedAt: feat.updatedAt || new Date().toISOString(),
                },
                { merge: true }
              );

              let parsedCoords = rawCoords;
              if (typeof rawCoords === 'string') {
                try { parsedCoords = JSON.parse(rawCoords); } catch (_) { parsedCoords = []; }
              }
              const cachedItem = {
                id: String(feat.id),
                layerId: feat.layerId || 'layer1_tim_kiem',
                name: feat.name || '',
                code: feat.code || undefined,
                type: feat.type || feat.geometry?.type || 'Point',
                coordinates: parsedCoords,
                properties: cleanedProps,
                updatedAt: feat.updatedAt || new Date().toISOString(),
              };
              const uniqueKey = getServerFeatureUniqueKey(cachedItem);
              inMemoryFeatureMap.set(uniqueKey, cachedItem);
              inMemoryDeletedKeys.delete(uniqueKey.toLowerCase());
              inMemoryDeletedKeys.delete(String(feat.id).toLowerCase());
            }
          }
          await batch.commit();
        }
        invalidateFeaturesResponseCache();
        await bumpSyncVersion('features');
        return res.json({ success: true, count: features.length });
      }

      res.status(400).json({ error: 'Invalid features or chunks array' });
    } catch (err: any) {
      console.error('[API POST /api/features/batch] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save batch' });
    }
  });

  // GET all shared map features directly from in-memory store
  app.get('/api/features/all', async (req, res) => {
    try {
      if (!adminDb) return res.json({ features: [] });

      const isFresh = req.query.fresh === '1';
      if (isFresh) {
        isFeatureStoreInitialized = false;
        featureStoreInitPromise = null;
      }
      await ensureFeatureStoreInitialized();

      const { layerId, bbox } = req.query;

      if (!layerId && !bbox) {
        if (!cachedFeaturesAllPayload || !cachedFeaturesAllEtag) {
          const features = Array.from(inMemoryFeatureMap.values());
          cachedFeaturesAllPayload = { features };
          cachedFeaturesAllEtag = `W/"features-${features.length}-${crypto.createHash('md5').update(JSON.stringify(features)).digest('hex').slice(0, 16)}"`;
        }

        const clientEtag = req.headers['if-none-match'];
        if (clientEtag && clientEtag === cachedFeaturesAllEtag && !isFresh) {
          return res.status(304).end();
        }

        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
        res.setHeader('ETag', cachedFeaturesAllEtag);
        return res.json(cachedFeaturesAllPayload);
      }

      let filtered = Array.from(inMemoryFeatureMap.values());
      if (layerId && typeof layerId === 'string') {
        filtered = filtered.filter((f) => f.layerId === layerId);
      }

      if (bbox && typeof bbox === 'string') {
        const parts = bbox.split(',').map(Number);
        if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
          const [minLng, minLat, maxLng, maxLat] = parts;
          filtered = filtered.filter((f) => {
            const coords = f.coordinates;
            if (!coords) return true;
            if (f.type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
              const [lng, lat] = coords;
              return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
            }
            return true;
          });
        }
      }

      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json({ features: filtered });
    } catch (err: any) {
      console.error('[API GET /api/features/all] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to load features' });
    }
  });

  // GET incremental delta of shared map features
  app.get('/api/features/delta', async (req, res) => {
    try {
      if (!adminDb) return res.json({ status: 'full', currentVersion: 0, features: [] });

      await ensureFeatureStoreInitialized();
      const sinceVersion = parseInt(String(req.query.sinceVersion || '0'), 10);
      const registry = await getSyncRegistry();
      const currentVersion = (registry?.featuresVersion as number) || 1;

      if (sinceVersion > 0 && sinceVersion === currentVersion) {
        return res.json({ status: 'up_to_date', currentVersion });
      }

      const minRecordedVer = featureChangeHistory.length > 0 ? featureChangeHistory[0].version : currentVersion;
      if (sinceVersion > 0 && sinceVersion >= minRecordedVer) {
        const upserted: any[] = [];
        const deletedKeys: string[] = [];
        const seenUpsertKeys = new Set<string>();

        for (const change of featureChangeHistory) {
          if (change.version > sinceVersion) {
            if (change.type === 'delete') {
              deletedKeys.push(change.key);
            } else if (change.type === 'upsert' && change.feature) {
              if (!seenUpsertKeys.has(change.key)) {
                seenUpsertKeys.add(change.key);
                upserted.push(change.feature);
              }
            }
          }
        }

        return res.json({
          status: 'delta',
          currentVersion,
          sinceVersion,
          upserted,
          deletedKeys,
        });
      }

      const features = Array.from(inMemoryFeatureMap.values());
      return res.json({
        status: 'full',
        currentVersion,
        features,
      });
    } catch (err: any) {
      console.error('[API GET /api/features/delta] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to load feature delta' });
    }
  });

  // GET single feature by ID via Admin SDK
  app.get('/api/features/:id', async (req, res) => {
    try {
      if (!adminDb) return res.status(404).json({ error: 'Database not initialized' });
      const { id } = req.params;
      const docSnap = await adminDb.collection('map_features').doc(String(id)).get();
      if (docSnap.exists) {
        const data = docSnap.data();
        let coords = data.coordinates;
        if (typeof coords === 'string') {
          try { coords = JSON.parse(coords); } catch (_) { coords = []; }
        }
        return res.json({
          id: data.id || docSnap.id,
          layerId: data.layerId || 'layer1_tim_kiem',
          name: data.name || '',
          code: data.code,
          type: data.type || 'Point',
          coordinates: coords,
          properties: data.properties || {},
          updatedAt: data.updatedAt,
        });
      }
      return res.status(404).json({ error: 'Feature not found' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
