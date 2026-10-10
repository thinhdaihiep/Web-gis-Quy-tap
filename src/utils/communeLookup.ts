/**
 * Utility for Point-in-Polygon administrative commune lookup (Xã Mới / Xã Cũ)
 * Loads data from Firebase Firestore (commune_chunks) with fast client IndexedDB caching.
 * Schema: Ten, Huyen, Tinh, XaMoi, TinhMoi (plus optional OBJECTID, PhanLoai)
 * - Xã cũ: [Ten], [Huyen], [Tinh]
 * - Xã mới: [XaMoi], [TinhMoi]
 * Performs fast spatial ray-casting queries with bounding-box pre-filtering.
 */

import { loadCommuneChunksFromFirestore } from '../firebaseService';

export interface CommuneInfo {
  ten: string;
  huyen?: string;
  tinh?: string;
  xaMoi?: string;
  tinhMoi?: string;
  formattedText: string;
  rawProps: Record<string, any>;
}

export interface CommuneLookupResult {
  newCommune: CommuneInfo | null;
  oldCommune: CommuneInfo | null;
}

interface IndexedFeature {
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  geometryType: 'Polygon' | 'MultiPolygon';
  coordinates: any;
  properties: Record<string, any>;
}

let cachedCommunes: IndexedFeature[] | null = null;
let isLoading = false;
let loadPromise: Promise<IndexedFeature[] | null> | null = null;

// Retry cooldown to prevent infinite spamming when fetch fails (10 seconds)
const RETRY_COOLDOWN_MS = 10000;
let lastFailedTimestamp = 0;

// IndexedDB Caching configuration with lightweight versioning
const IDB_NAME = 'gis_administrative_cache_db';
const IDB_VERSION = 1;
const IDB_STORE_NAME = 'commune_features';
const COMMUNE_CACHE_VERSION = 1;

interface CachedCommunesRecord {
  version: number;
  features: IndexedFeature[];
  savedAt: number;
}

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedCommunesFromIDB(): Promise<IndexedFeature[] | null> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.get('indexed_communes');
      req.onsuccess = () => {
        const val = req.result;
        // Verify lightweight cache version
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const record = val as CachedCommunesRecord;
          if (record.version === COMMUNE_CACHE_VERSION && Array.isArray(record.features) && record.features.length > 0) {
            resolve(record.features);
            return;
          }
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCachedCommunesToIDB(data: IndexedFeature[]): Promise<void> {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const record: CachedCommunesRecord = {
      version: COMMUNE_CACHE_VERSION,
      features: data,
      savedAt: Date.now(),
    };
    store.put(record, 'indexed_communes');
  } catch (e) {
    console.warn('Không thể ghi cache địa giới xã vào IndexedDB:', e);
  }
}

export async function invalidateCommuneCache(): Promise<void> {
  cachedCommunes = null;
  loadPromise = null;
  lastFailedTimestamp = 0;
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    store.delete('indexed_communes');
  } catch {}
}

/**
 * Compute 2D bounding box [minLng, minLat, maxLng, maxLat] for geometry coordinates
 */
function computeBoundingBox(type: string, coordinates: any): [number, number, number, number] | null {
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

/**
 * Ray-casting algorithm to test if [px, py] is inside a single ring
 */
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

/**
 * Test if point is inside a Polygon (accounting for outer boundary and interior holes)
 */
function isPointInPolygon(point: [number, number], rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return false;

  // Must be inside exterior ring (ring 0)
  if (!isPointInRing(point, rings[0])) {
    return false;
  }

  // Must NOT be inside any interior ring (holes)
  for (let i = 1; i < rings.length; i++) {
    if (isPointInRing(point, rings[i])) {
      return false; // Point is inside a hole
    }
  }

  return true;
}

/**
 * Test if point is inside a MultiPolygon
 */
function isPointInMultiPolygon(point: [number, number], polygons: number[][][][]): boolean {
  if (!polygons) return false;
  for (const poly of polygons) {
    if (isPointInPolygon(point, poly)) {
      return true;
    }
  }
  return false;
}

/**
 * Convert raw GeoJSON Feature list to IndexedFeature array with bounding boxes
 */
function indexRawFeatures(features: any[]): IndexedFeature[] {
  const indexed: IndexedFeature[] = [];

  for (const feat of features) {
    if (!feat) continue;
    const geom = feat.geometry || feat;
    if (!geom || !geom.type || !geom.coordinates) continue;

    const type = geom.type;
    if (type !== 'Polygon' && type !== 'MultiPolygon') continue;

    const bbox = computeBoundingBox(type, geom.coordinates);
    if (!bbox) continue;

    indexed.push({
      bbox,
      geometryType: type,
      coordinates: geom.coordinates,
      properties: feat.properties || {},
    });
  }

  return indexed;
}

/**
 * Load & index CapXa administrative features from Firebase Firestore with IndexedDB cache
 */
export async function loadCapXa(): Promise<IndexedFeature[] | null> {
  if (cachedCommunes && cachedCommunes.length > 0) {
    return cachedCommunes;
  }
  // Cooldown check if last attempt failed within RETRY_COOLDOWN_MS (10s)
  if (lastFailedTimestamp > 0 && Date.now() - lastFailedTimestamp < RETRY_COOLDOWN_MS) {
    return null;
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    isLoading = true;
    try {
      // 1. Check local IndexedDB fast cache first (instant response)
      const cached = await getCachedCommunesFromIDB();
      if (cached && cached.length > 0) {
        cachedCommunes = cached;
        lastFailedTimestamp = 0;
        return cached;
      }

      // 2. Load commune chunks from Firebase Firestore
      const rawFeatures = await loadCommuneChunksFromFirestore();
      if (rawFeatures && rawFeatures.length > 0) {
        const indexed = indexRawFeatures(rawFeatures);
        if (indexed.length > 0) {
          cachedCommunes = indexed;
          lastFailedTimestamp = 0;
          // Store in IndexedDB for subsequent instant access
          setCachedCommunesToIDB(indexed).catch(() => {});
          return indexed;
        }
      }

      lastFailedTimestamp = Date.now();
      return null;
    } catch (err) {
      lastFailedTimestamp = Date.now();
      console.warn('Lỗi tải dữ liệu xã từ Firebase:', err);
      return null;
    } finally {
      isLoading = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

// Backward compatibility aliases
export const loadCapXaMoi = loadCapXa;
export const loadCapXaCu = loadCapXa;

/**
 * Extract clean string values for Ten, Huyen, Tinh, XaMoi, TinhMoi from feature properties
 * Schema: Ten, Huyen, Tinh, XaMoi, TinhMoi
 * - Xã cũ: [Ten], [Huyen], [Tinh]
 * - Xã mới: [XaMoi], [TinhMoi]
 */
export function extractCommuneProperties(
  props: Record<string, any> | undefined | null
): CommuneLookupResult {
  if (!props) {
    return { newCommune: null, oldCommune: null };
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

  // Xã cũ: [Ten], [Huyen], [Tinh]
  const oldParts = [ten, huyen, tinh].filter((p) => Boolean(p));
  const oldText = oldParts.join(', ');

  // Xã mới: [XaMoi], [TinhMoi]
  const newParts = [xaMoi, tinhMoi].filter((p) => Boolean(p));
  const newText = newParts.join(', ');

  const oldCommune: CommuneInfo | null = oldText
    ? {
        ten,
        huyen: huyen || undefined,
        tinh,
        formattedText: oldText,
        rawProps: props,
      }
    : null;

  const newCommune: CommuneInfo | null = newText
    ? {
        ten: xaMoi || ten,
        xaMoi,
        tinhMoi,
        tinh: tinhMoi || tinh,
        formattedText: newText,
        rawProps: props,
      }
    : null;

  return {
    newCommune,
    oldCommune,
  };
}

/**
 * Point-in-polygon lookup in an indexed feature collection
 */
function queryPointInFeatures(
  lng: number,
  lat: number,
  features: IndexedFeature[]
): IndexedFeature | null {
  for (const item of features) {
    const [minLng, minLat, maxLng, maxLat] = item.bbox;

    // Quick bounding box rejection
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
      continue;
    }

    const pt: [number, number] = [lng, lat];
    if (item.geometryType === 'Polygon') {
      if (isPointInPolygon(pt, item.coordinates)) {
        return item;
      }
    } else if (item.geometryType === 'MultiPolygon') {
      if (isPointInMultiPolygon(pt, item.coordinates)) {
        return item;
      }
    }
  }

  return null;
}

/**
 * Main query function to get commune info at (lat, lng) from Firebase
 */
export async function findCommunesAtLatLng(
  lat: number,
  lng: number
): Promise<CommuneLookupResult> {
  const features = cachedCommunes || (await loadCapXa());

  if (!features || features.length === 0) {
    return {
      newCommune: null,
      oldCommune: null,
    };
  }

  const matched = queryPointInFeatures(lng, lat, features);
  if (matched) {
    return extractCommuneProperties(matched.properties);
  }

  return {
    newCommune: null,
    oldCommune: null,
  };
}
