import { GeoJsonFeatureItem, LayerConfig, AppUser, UserRole, RasterLayer, RasterFileItem } from './types';
import { deduplicateFeaturesList, getItemUniqueKey } from './fieldAlias';
import { cleanShapeProperties } from './utils/shapeFieldUtils';
import { getCachedData, setCachedData, deleteCachedData } from './utils/indexedDbCache';

const COLLECTION_NAME = 'map_features';
const CHUNKS_COLLECTION = 'layer_chunks';
const APP_SETTINGS_COLLECTION = 'app_settings';

export const CACHE_KEY_COMMUNES = 'gis_commune_chunks';
export const CACHE_KEY_RASTER_LAYERS = 'gis_cached_raster_layers';
export const CACHE_KEY_LAYER_CONFIGS = 'gis_layer_configs';
export const CACHE_KEY_ALIASES = 'gis_field_aliases';

/**
 * Notify server to invalidate its in-memory RAM cache for specific data
 */
export async function notifyServerCacheInvalidation(target: 'raster_layers' | 'layer_configs' | 'field_aliases' | 'communes' | 'all') {
  try {
    await fetch('/api/cache/invalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
  } catch (_) {}
}

export interface SyncVersions {
  featuresVersion: number;
  featuresUpdatedAt: string;
  rasterVersion: number;
  rasterUpdatedAt: string;
  communesVersion: number;
  communesUpdatedAt: string;
  configsVersion: number;
  configsUpdatedAt: string;
  aliasesVersion: number;
  aliasesUpdatedAt: string;
}

export const LOCAL_SYNC_VERSIONS_KEY = 'gis_local_sync_versions';

export function getLocalSyncVersions(): Partial<SyncVersions> {
  try {
    const raw = localStorage.getItem(LOCAL_SYNC_VERSIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

export function saveLocalSyncVersions(versions: Partial<SyncVersions>): void {
  try {
    const current = getLocalSyncVersions();
    localStorage.setItem(LOCAL_SYNC_VERSIONS_KEY, JSON.stringify({ ...current, ...versions }));
  } catch (_) {}
}

export async function fetchServerSyncVersions(): Promise<SyncVersions | null> {
  try {
    const res = await fetch('/api/sync/versions');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.versions) {
        return data.versions;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Intelligent selective background sync for all collections using Global Sync Registry
 */
export async function syncAllCachedDataIfOutdated(callbacks?: {
  onFeaturesUpdated?: (features: GeoJsonFeatureItem[]) => void;
  onRasterUpdated?: (layers: RasterLayer[]) => void;
  onConfigsUpdated?: (layerNames: Record<string, string>) => void;
  onAliasesUpdated?: (aliases: Record<string, string>) => void;
}) {
  try {
    const serverVersions = await fetchServerSyncVersions();
    if (!serverVersions) return;
    const localVersions = getLocalSyncVersions();

    // 1. Kiểm tra lớp bản đồ Raster
    const sRaster = Number(serverVersions.rasterVersion) || 1;
    const lRaster = Number(localVersions.rasterVersion) || 0;
    if (sRaster > lRaster || lRaster === 0) {
      try {
        const res = await fetch('/api/raster-layers?fresh=1');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.layers) && data.layers.length > 0) {
            saveCachedRasterLayers(data.layers);
            await setCachedData(CACHE_KEY_RASTER_LAYERS, data.layers);
            saveLocalSyncVersions({ rasterVersion: sRaster, rasterUpdatedAt: serverVersions.rasterUpdatedAt });
            if (callbacks?.onRasterUpdated) callbacks.onRasterUpdated(data.layers);
          }
        }
      } catch (rErr) {
        console.warn('[Sync] Cập nhật raster nền thất bại:', rErr);
      }
    }

    // 2. Kiểm tra lớp đối tượng bản đồ Map Features (Mộ chí, điểm quy tập)
    const sFeat = Number(serverVersions.featuresVersion) || 1;
    const lFeat = Number(localVersions.featuresVersion) || 0;
    if (sFeat > lFeat || lFeat === 0) {
      try {
        const freshFeatures = await loadSharedFeaturesFromFirestore();
        if (freshFeatures && freshFeatures.length > 0) {
          saveLocalSyncVersions({ featuresVersion: sFeat, featuresUpdatedAt: serverVersions.featuresUpdatedAt });
          if (callbacks?.onFeaturesUpdated) callbacks.onFeaturesUpdated(freshFeatures);
        }
      } catch (fErr) {
        console.warn('[Sync] Cập nhật map_features nền thất bại:', fErr);
      }
    }

    // 3. Kiểm tra cấu hình lớp Layer Configs
    const sConf = Number(serverVersions.configsVersion) || 1;
    const lConf = Number(localVersions.configsVersion) || 0;
    if (sConf > lConf || lConf === 0) {
      try {
        const res = await fetch('/api/layers/configs');
        if (res.ok) {
          const data = await res.json();
          if (data.layerNames) {
            await setCachedData(CACHE_KEY_LAYER_CONFIGS, data.layerNames);
            saveLocalSyncVersions({ configsVersion: sConf, configsUpdatedAt: serverVersions.configsUpdatedAt });
            if (callbacks?.onConfigsUpdated) callbacks.onConfigsUpdated(data.layerNames);
          }
        }
      } catch (cErr) {
        console.warn('[Sync] Cập nhật configs nền thất bại:', cErr);
      }
    }

    // 4. Kiểm tra từ điển bí danh Field Aliases
    const sAlias = Number(serverVersions.aliasesVersion) || 1;
    const lAlias = Number(localVersions.aliasesVersion) || 0;
    if (sAlias > lAlias || lAlias === 0) {
      try {
        const res = await fetch('/api/aliases');
        if (res.ok) {
          const data = await res.json();
          if (data.aliases) {
            await setCachedData(CACHE_KEY_ALIASES, data.aliases);
            saveLocalSyncVersions({ aliasesVersion: sAlias, aliasesUpdatedAt: serverVersions.aliasesUpdatedAt });
            if (callbacks?.onAliasesUpdated) callbacks.onAliasesUpdated(data.aliases);
          }
        }
      } catch (aErr) {
        console.warn('[Sync] Cập nhật aliases nền thất bại:', aErr);
      }
    }
  } catch (err) {
    console.warn('[Sync] Kiểm tra phiên bản nền gặp lỗi:', err);
  }
}


// Auth Functions

export const signInWithCredentials = async (username: string, password: string): Promise<AppUser | null> => {
  try {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) return null;

    // 1. Single secure path: Call server-side /api/login
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          const user: AppUser = {
            uid: data.user.uid || `user_${data.user.username}`,
            username: data.user.username,
            displayName: data.user.displayName || data.user.username,
            role: (data.user.role as UserRole) || 'editor',
            token: data.user.token,
          };
          localStorage.setItem('gis_user_session', JSON.stringify(user));
          return user;
        }
      }
    } catch (apiErr) {
      console.warn('Server login request failed (possible network issue):', apiErr);
      // Offline fallback: Check cached user session if network is completely down
      try {
        const cachedSession = localStorage.getItem('gis_user_session');
        if (cachedSession) {
          const sessionUser = JSON.parse(cachedSession) as AppUser;
          if (sessionUser && sessionUser.username.toLowerCase() === cleanUser) {
            return sessionUser;
          }
        }
      } catch (_) {}
    }

    return null;
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    return null;
  }
};

export const signOutUser = (): void => {
  try {
    const stored = localStorage.getItem('gis_user_session');
    if (stored) {
      const parsed: AppUser = JSON.parse(stored);
      if (parsed.token) {
        fetch('/api/logout', {
          method: 'POST',
          headers: { 'x-admin-token': parsed.token },
        }).catch(() => {});
      }
    }
  } catch (_) {}
  localStorage.removeItem('gis_user_session');
};

export const getStoredUser = (): AppUser | null => {
  try {
    const stored = localStorage.getItem('gis_user_session');
    if (stored) {
      const parsed: AppUser = JSON.parse(stored);
      if (parsed.username === 'admin' && (parsed.displayName === 'Quản trị viên' || !parsed.displayName)) {
        parsed.displayName = 'Bản đồ qk5';
        localStorage.setItem('gis_user_session', JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
};

export const getSessionToken = (): string | null => {
  const user = getStoredUser();
  return user?.token || null;
};

/**
 * Get headers for server-side authenticated requests
 */
function getAuthHeaders(): Record<string, string> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['x-session-token'] = token;
    headers['x-admin-token'] = token;
  }
  return headers;
}


/**
 * Reduce coordinate floating point precision to 6 decimals (~0.1m accuracy)
 * to significantly compress GeoJSON document payload size in Firestore.
 */
function optimizeCoordinates(coords: any): any {
  if (typeof coords === 'number' && !isNaN(coords)) {
    return Math.round(coords * 1000000) / 1000000;
  }
  if (Array.isArray(coords)) {
    return coords.map(optimizeCoordinates);
  }
  return coords;
}

export function isDemoFeatureId(id: string | number): boolean {
  const s = String(id || '').toLowerCase();
  return s.startsWith('demo_') || s.includes('demo_poly') || s.includes('demo_point');
}

// Helper to save features to LocalStorage cache
function syncToLocalStorage(features: GeoJsonFeatureItem[]) {
  try {
    const existingRaw = localStorage.getItem('gis_local_map_features');
    const existingList: GeoJsonFeatureItem[] = existingRaw ? JSON.parse(existingRaw) : [];
    const cleanedIncoming = features.map((f) => ({
      ...f,
      properties: cleanShapeProperties(f.properties || {}),
    }));
    const merged = deduplicateFeaturesList([...existingList, ...cleanedIncoming].filter((f) => !isDemoFeatureId(f.id)));
    localStorage.setItem('gis_local_map_features', JSON.stringify(merged));
  } catch (e) {
    console.warn('Lỗi ghi LocalStorage cache:', e);
  }
}


function getFromLocalStorage(): GeoJsonFeatureItem[] {
  try {
    const raw = localStorage.getItem('gis_local_map_features');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => !isDemoFeatureId(item.id))
          .map((item) => ({
            ...item,
            properties: cleanShapeProperties(item.properties || {}),
          }));
      }
    }
  } catch (e) {}
  return [];
}

/**
 * Fetch latest version of a single feature by ID.
 */
export async function fetchSingleFeatureFromFirestore(featureId: string): Promise<GeoJsonFeatureItem | null> {
  if (!featureId) return null;
  const targetIdStr = String(featureId).toLowerCase();

  try {
    // 1. Try server endpoint
    try {
      const res = await fetch(`/api/features/${encodeURIComponent(featureId)}`);
      if (res.ok) {
        const item = await res.json();
        if (item && item.id) return item;
      }
    } catch (_) {}

    // 2. Search across shared features and local cache
    const allShared = await loadSharedFeaturesFromFirestore();
    const foundInShared = allShared.find(
      (f) =>
        String(f.id).toLowerCase() === targetIdStr ||
        (f.code && String(f.code).toLowerCase() === targetIdStr) ||
        getItemUniqueKey(f).toLowerCase() === targetIdStr
    );

    if (foundInShared) {
      return foundInShared;
    }
  } catch (err) {
    console.warn('Lỗi khi tải đối tượng:', err);
  }
  return null;
}

/**
 * Save or update a single feature without altering layer chunks.
 */
export async function saveSingleFeatureToFirestore(
  feature: GeoJsonFeatureItem
): Promise<boolean> {
  if (!feature) return false;

  // 1. Always update LocalStorage cache first
  syncToLocalStorage([feature]);

  try {
    const rawCoords = feature.coordinates || (feature as any).geometry?.coordinates || [];
    const optimizedCoords = optimizeCoordinates(rawCoords);
    const coordsJsonStr = typeof optimizedCoords === 'string' ? optimizedCoords : JSON.stringify(optimizedCoords);

    const cleanedFeature = {
      ...feature,
      properties: cleanShapeProperties(feature.properties || {}),
      coordinates: coordsJsonStr,
      updatedAt: feature.updatedAt || new Date().toISOString(),
    };

    const res = await fetch('/api/features/save', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ feature: cleanedFeature }),
    });

    if (res.ok) {
      return true;
    }

    const data = await res.json().catch(() => ({}));
    console.warn('[Security Proxy] Không thể lưu đối tượng qua máy chủ:', data.error || res.statusText);
    return false;
  } catch (err) {
    console.warn('Lỗi khi gửi yêu cầu lưu đối tượng:', err);
    return false;
  }
}

/**
 * Save / Update a batch of imported features into the shared Firestore database.
 * Automatically uses Layer Chunking for large datasets (>50 items or >500KB)
 * to reduce Firestore write operations by 99% (preventing Quota / Resource Exhausted limits).
 */
export async function saveImportedFeaturesToFirestore(
  features: GeoJsonFeatureItem[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!features || features.length === 0) {
    return { success: true, count: 0 };
  }

  // 1. Always save to LocalStorage first to guarantee zero data loss
  syncToLocalStorage(features);

  try {
    // Deduplicate list by OBJECTID / ID before saving
    const deduped = deduplicateFeaturesList(features);

    // Optimize coordinates and sanitize properties across all items
    const cleanedFeatures = deduped.map((feat) => ({
      ...feat,
      properties: cleanShapeProperties(feat.properties || {}),
      coordinates: optimizeCoordinates(feat.coordinates),
      updatedAt: feat.updatedAt || new Date().toISOString().split('T')[0],
    }));

    // If saving small batch (< 20 items), save directly as features array
    if (cleanedFeatures.length < 20) {
      const res = await fetch('/api/features/batch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ features: cleanedFeatures }),
      });

      if (res.ok) {
        return { success: true, count: cleanedFeatures.length };
      }
      const data = await res.json().catch(() => ({}));
      return { success: false, count: cleanedFeatures.length, error: data.error || 'Lỗi lưu qua máy chủ' };
    }

    // Group features by layerId and bundle chunks
    const layerGroups = new Map<string, GeoJsonFeatureItem[]>();
    cleanedFeatures.forEach((f) => {
      const lId = f.layerId || 'default';
      if (!layerGroups.has(lId)) layerGroups.set(lId, []);
      layerGroups.get(lId)!.push(f);
    });

    const CHUNK_ITEM_COUNT = 100;
    const chunks: Array<{ id: string; layerId: string; chunkIndex: number; itemCount: number; payloadJson: string }> = [];

    for (const [layerId, layerFeats] of layerGroups.entries()) {
      let chunkIdx = 0;
      for (let i = 0; i < layerFeats.length; i += CHUNK_ITEM_COUNT) {
        const slice = layerFeats.slice(i, i + CHUNK_ITEM_COUNT);
        const docId = `chunk_${layerId}_${chunkIdx}`;
        chunks.push({
          id: docId,
          layerId,
          chunkIndex: chunkIdx,
          itemCount: slice.length,
          payloadJson: JSON.stringify(slice),
        });
        chunkIdx++;
      }
    }

    const res = await fetch('/api/features/batch', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ chunks }),
    });

    if (res.ok) {
      return { success: true, count: cleanedFeatures.length };
    }

    const data = await res.json().catch(() => ({}));
    return { success: false, count: cleanedFeatures.length, error: data.error || 'Lỗi lưu theo đợt qua máy chủ' };
  } catch (err: any) {
    console.warn('Lưu ý CSDL Firestore (Đã lưu vào bộ nhớ máy):', err?.message || err);
    return {
      success: false,
      count: features.length,
      error: err?.message || 'Không thể kết nối đến máy chủ CSDL.',
    };
  }
}

/**
 * Load all shared features (supports both Chunked Layer bundles and Individual documents via server)
 */
export async function loadSharedFeaturesFromFirestore(): Promise<GeoJsonFeatureItem[]> {
  const itemsMap = new Map<string, GeoJsonFeatureItem>();

  // Load from LocalStorage first
  const localItems = getFromLocalStorage();
  localItems.forEach((item) => {
    if (!isDemoFeatureId(item.id)) itemsMap.set(getItemUniqueKey(item), item);
  });

  try {
    const res = await fetch('/api/features/all');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features)) {
        data.features.forEach((feat: any) => {
          if (!isDemoFeatureId(feat.id)) {
            feat.properties = cleanShapeProperties(feat.properties || {});
            itemsMap.set(getItemUniqueKey(feat), feat);
          }
        });
      }
    }
  } catch (err) {
    console.warn('Lỗi tải /api/features/all (sử dụng LocalStorage cache):', err);
  }

  const allList = deduplicateFeaturesList(Array.from(itemsMap.values()).filter((f) => !isDemoFeatureId(f.id)));

  // Cache to LocalStorage
  try {
    localStorage.setItem('gis_local_map_features', JSON.stringify(allList));
  } catch (e) {}

  return allList;
}

/**
 * Delete a feature from Firestore database and update local storage cache
 */
export async function deleteFeatureFromFirestore(featureId: string): Promise<boolean> {
  try {
    const currentLocal = getFromLocalStorage();
    const updatedLocal = currentLocal.filter((f) => String(f.id) !== String(featureId));
    syncToLocalStorage(updatedLocal);

    const res = await fetch('/api/features/delete', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: featureId }),
    });

    if (res.ok) {
      return true;
    }
    const data = await res.json().catch(() => ({}));
    console.warn('[Security Proxy] Lỗi khi xóa đối tượng qua máy chủ:', data.error || res.statusText);
    return false;
  } catch (err) {
    console.warn('Lỗi khi gửi yêu cầu xóa đối tượng:', err);
    return false;
  }
}

/**
 * Save field alias dictionary to Firestore
 */
export async function saveFieldAliasDictionaryToFirestore(
  aliasMap: Record<string, string>,
  hiddenMap?: Record<string, boolean>
): Promise<boolean> {
  const resultData = {
    aliases: aliasMap,
    hiddenFields: hiddenMap || {},
  };
  try {
    const res = await fetch('/api/aliases/save', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(resultData),
    });

    if (res.ok) {
      // Làm mới bộ nhớ đệm client IndexedDB và server RAM ngay khi lưu thành công
      await setCachedData(CACHE_KEY_ALIASES, resultData);
      await notifyServerCacheInvalidation('field_aliases');
      return true;
    }
    const data = await res.json().catch(() => ({}));
    console.warn('[Security Proxy] Lỗi khi lưu bảng ánh xạ qua máy chủ:', data.error || res.statusText);
    return false;
  } catch (err) {
    console.error('Lỗi khi gửi yêu cầu lưu bảng ánh xạ:', err);
    return false;
  }
}

/**
 * Load field alias dictionary and hidden fields map from Firestore (IndexedDB -> Server Cache -> Firestore fallback)
 * Bộ nhớ đệm không thời hạn (vĩnh viễn), chỉ làm mới khi có thay đổi từ tab alias field.
 */
export async function loadFieldAliasDictionaryFromFirestore(forceRefresh = false): Promise<{
  aliases: Record<string, string>;
  hiddenFields: Record<string, boolean>;
} | null> {
  // 1. Kiểm tra bộ nhớ đệm client IndexedDB trước (vĩnh viễn, 0 Firestore read)
  if (!forceRefresh) {
    try {
      const cached = await getCachedData<{ aliases: Record<string, string>; hiddenFields: Record<string, boolean> }>(
        CACHE_KEY_ALIASES
      );
      if (cached) return cached;
    } catch (_) {}
  }

  // 2. Thử endpoint cache trên RAM máy chủ (/api/aliases)
  try {
    const res = await fetch('/api/aliases');
    if (res.ok) {
      const data = await res.json();
      if (data && (data.aliases || data.hiddenFields)) {
        await setCachedData(CACHE_KEY_ALIASES, data);
        return data;
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Save layer configurations (custom names) to Firestore
 */
export async function saveLayerConfigsToFirestore(
  layers: LayerConfig[]
): Promise<boolean> {
  try {
    const layerNamesMap = layers.reduce((acc, l) => {
      acc[l.id] = l.name;
      return acc;
    }, {} as Record<string, string>);

    const res = await fetch('/api/layers/save', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ layerNames: layerNamesMap }),
    });

    if (res.ok) {
      // Làm mới bộ nhớ đệm client IndexedDB và server RAM ngay khi lưu thành công
      await setCachedData(CACHE_KEY_LAYER_CONFIGS, layerNamesMap);
      await notifyServerCacheInvalidation('layer_configs');
      return true;
    }
    const data = await res.json().catch(() => ({}));
    console.warn('[Security Proxy] Lỗi khi lưu tên lớp qua máy chủ:', data.error || res.statusText);
    return false;
  } catch (err) {
    console.error('Lỗi khi gửi yêu cầu lưu tên lớp:', err);
    return false;
  }
}

/**
 * Load custom layer names from Firestore (IndexedDB -> Server Cache -> Firestore fallback)
 * Bộ nhớ đệm không thời hạn (vĩnh viễn), chỉ làm mới khi người dùng đổi tên lớp.
 */
export async function loadLayerConfigsFromFirestore(forceRefresh = false): Promise<Record<string, string> | null> {
  // 1. Kiểm tra bộ nhớ đệm client IndexedDB trước (vĩnh viễn, 0 Firestore read)
  if (!forceRefresh) {
    try {
      const cached = await getCachedData<Record<string, string>>(CACHE_KEY_LAYER_CONFIGS);
      if (cached) return cached;
    } catch (_) {}
  }

  // 2. Thử endpoint cache trên RAM máy chủ (/api/layers/configs)
  try {
    const res = await fetch('/api/layers/configs');
    if (res.ok) {
      const data = await res.json();
      if (data && data.layerNames) {
        await setCachedData(CACHE_KEY_LAYER_CONFIGS, data.layerNames);
        return data.layerNames;
      }
    }
  } catch (_) {}

  return null;
}

export const RASTER_LAYERS_CACHE_KEY = 'gis_cached_raster_layers';

/**
 * Retrieve cached raster layers from local storage
 */
export function getCachedRasterLayers(): RasterLayer[] {
  try {
    const raw = localStorage.getItem(RASTER_LAYERS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc cache raster layers từ localStorage:', e);
  }
  return [];
}

/**
 * Save raster layers to local storage cache
 */
export function saveCachedRasterLayers(layers: RasterLayer[]): void {
  try {
    localStorage.setItem(RASTER_LAYERS_CACHE_KEY, JSON.stringify(layers));
  } catch (e) {
    console.warn('Lỗi lưu cache raster layers vào localStorage:', e);
  }
}

/**
 * Load raster layers with tiered cache:
 * Tier 1: Client IndexedDB (0 network, 0 read)
 * Tier 2: Server-side RAM cache proxy (/api/raster-layers, 0 Firestore read)
 * Tier 3: Direct Firestore SDK read fallback
 */
export async function loadRasterLayersFromFirestore(
  forceRefresh = false,
  onBackgroundUpdate?: (layers: RasterLayer[]) => void
): Promise<RasterLayer[]> {
  const cachedLayers = getCachedRasterLayers();

  // Helper function to fetch latest raster layers from server
  const fetchFromServer = async (fresh = false): Promise<RasterLayer[] | null> => {
    try {
      const url = fresh ? '/api/raster-layers?fresh=1' : '/api/raster-layers';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.layers)) {
          saveCachedRasterLayers(data.layers);
          await setCachedData(CACHE_KEY_RASTER_LAYERS, data.layers);
          return data.layers;
        }
      }
    } catch (err) {
      console.warn('Không thể kết nối /api/raster-layers:', err);
    }
    return null;
  };

  // 1. Kiểm tra bộ nhớ đệm client IndexedDB trước để trả về ngay cho UI (0ms latency)
  if (!forceRefresh) {
    try {
      const idbCached = await getCachedData<RasterLayer[]>(CACHE_KEY_RASTER_LAYERS);
      if (idbCached && idbCached.length > 0) {
        // Kích hoạt đối soát ngầm với Server Sync Registry
        (async () => {
          try {
            const serverVersions = await fetchServerSyncVersions();
            const localVersions = getLocalSyncVersions();
            const sRaster = Number(serverVersions?.rasterVersion) || 1;
            const lRaster = Number(localVersions.rasterVersion) || 0;

            if (sRaster > lRaster || lRaster === 0) {
              const freshLayers = await fetchFromServer(true);
              if (freshLayers && freshLayers.length > 0) {
                saveLocalSyncVersions({ rasterVersion: sRaster, rasterUpdatedAt: serverVersions?.rasterUpdatedAt });
                if (onBackgroundUpdate) {
                  onBackgroundUpdate(freshLayers);
                }
                window.dispatchEvent(new CustomEvent('webgis:raster-layers-updated', { detail: freshLayers }));
              }
            }
          } catch (_) {}
        })();

        return idbCached;
      }
    } catch (_) {}
  }

  // 2. Nạp từ Server endpoint (sử dụng Admin SDK)
  const serverLayers = await fetchFromServer(forceRefresh);
  if (serverLayers && serverLayers.length > 0) {
    try {
      const serverVersions = await fetchServerSyncVersions();
      if (serverVersions?.rasterVersion) {
        saveLocalSyncVersions({ rasterVersion: serverVersions.rasterVersion });
      }
    } catch (_) {}
    return serverLayers;
  }

  if (cachedLayers.length > 0) {
    return cachedLayers;
  }
  return [];
}

/**
 * Update enabled state for a raster layer
 */
export async function updateRasterLayerEnabled(layerId: string, enabled: boolean): Promise<boolean> {
  // Cập nhật ngay trong cache cục bộ
  try {
    const cached = getCachedRasterLayers();
    if (cached.length > 0) {
      const updated = cached.map(l => l.id === layerId ? { ...l, enabled } : l);
      saveCachedRasterLayers(updated);
      await setCachedData(CACHE_KEY_RASTER_LAYERS, updated);
    }
  } catch (_) {}

  try {
    const res = await fetch('/api/raster-layers/update-enabled', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ layerId, enabled }),
    });

    if (res.ok) {
      await deleteCachedData(CACHE_KEY_RASTER_LAYERS);
      await notifyServerCacheInvalidation('raster_layers');
      return true;
    }
    const data = await res.json().catch(() => ({}));
    console.warn('[Security Proxy] Lỗi khi cập nhật trạng thái raster qua máy chủ:', data.error || res.statusText);
    return false;
  } catch (error) {
    console.error('Lỗi khi gửi yêu cầu cập nhật trạng thái hiển thị raster layer:', error);
    return false;
  }
}

/**
 * Save Administrative Commune (CapXa) features to Firestore in chunks
 */
export async function saveCommuneChunksToFirestore(
  features: any[],
  onProgress?: (message: string, percent: number) => void
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!Array.isArray(features) || features.length === 0) {
      return { success: false, count: 0, error: 'Không có dữ liệu đối tượng xã để nhập.' };
    }

    onProgress?.('Đang tối ưu dữ liệu tọa độ và phân loại...', 10);

    const validFeatures: any[] = [];
    for (const f of features) {
      if (!f) continue;
      const geom = f.geometry || (f.type && f.coordinates ? f : null);
      if (!geom || !geom.coordinates) continue;

      const props = f.properties || {};
      validFeatures.push({
        type: 'Feature',
        geometry: {
          type: geom.type,
          coordinates: optimizeCoordinates(geom.coordinates),
        },
        properties: {
          Ten: props.Ten || props.ten || '',
          Huyen: props.Huyen || props.huyen || '',
          Tinh: props.Tinh || props.tinh || '',
          XaMoi: props.XaMoi || props.xaMoi || '',
          TinhMoi: props.TinhMoi || props.tinhMoi || '',
          PhanLoai: props.PhanLoai || props.phanLoai || '',
          OBJECTID: props.OBJECTID != null ? props.OBJECTID : props.objectid,
        },
      });
    }

    if (validFeatures.length === 0) {
      return { success: false, count: 0, error: 'Không tìm thấy hình học Polygon/MultiPolygon hợp lệ trong tệp.' };
    }

    onProgress?.('Đang phân chia thành các chunk (phân mảnh)...', 25);

    // Split into chunks: max 60 items per chunk or max 650KB payload
    const MAX_ITEMS_PER_CHUNK = 60;
    const MAX_CHUNK_PAYLOAD_SIZE = 650000; // ~650KB
    const chunks: Array<{ id: string; chunkIndex: number; itemCount: number; payloadJson: string }> = [];

    let currentSlice: any[] = [];
    let currentPayload = '';

    for (let i = 0; i < validFeatures.length; i++) {
      const feat = validFeatures[i];
      currentSlice.push(feat);
      const testJson = JSON.stringify(currentSlice);

      if (currentSlice.length >= MAX_ITEMS_PER_CHUNK || testJson.length >= MAX_CHUNK_PAYLOAD_SIZE || i === validFeatures.length - 1) {
        const chunkIndex = chunks.length;
        chunks.push({
          id: `commune_chunk_${chunkIndex}`,
          chunkIndex,
          itemCount: currentSlice.length,
          payloadJson: testJson,
        });
        currentSlice = [];
      }
    }

    const totalChunks = chunks.length;
    onProgress?.(`Đã tạo ${totalChunks} chunks. Bắt đầu tải lên Firebase...`, 35);

    // Upload in batches of 4 chunks
    const BATCH_SIZE = 4;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchSlice = chunks.slice(i, i + BATCH_SIZE);
      const isFirst = i === 0;
      const isLast = i + BATCH_SIZE >= chunks.length;

      const pct = Math.round(35 + (i / chunks.length) * 55);
      onProgress?.(`Đang lưu đợt ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(chunks.length / BATCH_SIZE)} (${pct}%)...`, pct);

      const res = await fetch('/api/communes/batch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          chunks: batchSlice,
          clearExisting: isFirst,
          meta: isLast ? { totalFeatures: validFeatures.length, totalChunks } : undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Lỗi khi lưu đợt phân mảnh xã lên máy chủ');
      }
    }

    // Invalidate client and server caches, đồng thời nạp dữ liệu mới vào IndexedDB ngay lập tức
    await deleteCachedData(CACHE_KEY_COMMUNES);
    await notifyServerCacheInvalidation('communes');
    await setCachedData(CACHE_KEY_COMMUNES, validFeatures);

    onProgress?.('Hoàn tất lưu trữ CSDL Firebase!', 100);
    return { success: true, count: validFeatures.length };
  } catch (err: any) {
    console.error('Lỗi lưu commune chunks lên Firebase:', err);
    return { success: false, count: 0, error: err?.message || 'Lỗi khi lưu dữ liệu lên Firebase' };
  }
}

/**
 * Load all commune features from Firebase Firestore with tiered caching:
 * Tier 1: Client IndexedDB (0 network, 0 read, lưu vĩnh viễn không thời hạn)
 * Tier 2: Server-side RAM cache proxy (/api/communes/chunks, 0 Firestore read)
 * Tier 3: Direct Firestore SDK read fallback
 */
export async function loadCommuneChunksFromFirestore(forceRefresh = false): Promise<any[]> {
  // 1. Kiểm tra IndexedDB cache trước (vĩnh viễn không thời hạn, chỉ làm mới khi import Cấp Xã mới)
  if (!forceRefresh) {
    try {
      const cached = await getCachedData<any[]>(CACHE_KEY_COMMUNES);
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch (_) {}
  }

  try {
    // 2. Try server endpoint first (fastest, utilizes HTTP browser cache & server RAM)
    try {
      const res = await fetch('/api/communes/chunks');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.chunks) && data.chunks.length > 0) {
          const allFeatures: any[] = [];
          for (const chunk of data.chunks) {
            if (chunk.payloadJson) {
              try {
                const parsed = JSON.parse(chunk.payloadJson);
                if (Array.isArray(parsed)) allFeatures.push(...parsed);
              } catch (_) {}
            }
          }
          if (allFeatures.length > 0) {
            await setCachedData(CACHE_KEY_COMMUNES, allFeatures);
            return allFeatures;
          }
        }
      }
    } catch (_) {}

    return [];
  } catch (err) {
    console.warn('Lỗi tải dữ liệu commune_chunks từ Firebase:', err);
    // Return stale IndexedDB cache if available
    try {
      const stale = await getCachedData<any[]>(CACHE_KEY_COMMUNES);
      if (Array.isArray(stale) && stale.length > 0) return stale;
    } catch (_) {}
    return [];
  }
}

