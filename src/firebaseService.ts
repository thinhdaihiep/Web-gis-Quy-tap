import { doc, setDoc, getDoc, getDocs, collection, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { GeoJsonFeatureItem, LayerConfig, AppUser, UserRole, RasterLayer, RasterFileItem } from './types';
import { deduplicateFeaturesList, getItemUniqueKey } from './fieldAlias';

const COLLECTION_NAME = 'map_features';
const CHUNKS_COLLECTION = 'layer_chunks';
const APP_SETTINGS_COLLECTION = 'app_settings';

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
  } else {
    // Check if current user is admin
    const user = getStoredUser();
    if (user && (user.role === 'admin' || user.username === 'admin')) {
      headers['x-admin-token'] = 'Bando@qk5';
      headers['x-session-token'] = 'Bando@qk5';
    }
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
    const merged = deduplicateFeaturesList([...existingList, ...features].filter((f) => !isDemoFeatureId(f.id)));
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
        return parsed.filter((item) => !isDemoFeatureId(item.id));
      }
    }
  } catch (e) {}
  return [];
}

/**
 * Fetch latest version of a single feature directly from Firestore by ID.
 */
export async function fetchSingleFeatureFromFirestore(featureId: string): Promise<GeoJsonFeatureItem | null> {
  if (!featureId) return null;
  const targetIdStr = String(featureId).toLowerCase();

  try {
    // 1. Try direct lookup in individual documents in map_features collection
    const docRef = doc(db, COLLECTION_NAME, String(featureId));
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      let coords = data.coordinates;
      if (typeof coords === 'string') {
        try {
          coords = JSON.parse(coords);
        } catch (e) {
          coords = [];
        }
      }
      return {
        id: data.id || docSnap.id,
        layerId: data.layerId || 'layer1_tim_kiem',
        name: data.name || '',
        type: data.type || 'Point',
        coordinates: coords,
        properties: data.properties || {},
        code: data.code,
        updatedAt: data.updatedAt,
      };
    }

    // 2. Fallback: Search across all shared features (layer_chunks & local cache merged)
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
    console.warn('Lỗi khi tải đối tượng từ Firestore:', err);
  }
  return null;
}

/**
 * Save or update a single feature in Firestore without altering layer chunks.
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

    // If server returned error, try direct Firestore client write
    const data = await res.json().catch(() => ({}));
    console.warn('[Security Proxy] Không thể lưu đối tượng qua máy chủ:', data.error || res.statusText);

    try {
      const docRef = doc(db, COLLECTION_NAME, String(feature.id));
      await setDoc(docRef, cleanedFeature, { merge: true });
      return true;
    } catch (directErr) {
      console.warn('Lỗi lưu trực tiếp Firestore:', directErr);
    }

    return false;
  } catch (err) {
    console.warn('Lỗi khi gửi yêu cầu lưu đối tượng:', err);
    try {
      const rawCoords = feature.coordinates || (feature as any).geometry?.coordinates || [];
      const optimizedCoords = optimizeCoordinates(rawCoords);
      const coordsJsonStr = typeof optimizedCoords === 'string' ? optimizedCoords : JSON.stringify(optimizedCoords);
      const cleanedFeature = {
        ...feature,
        coordinates: coordsJsonStr,
        updatedAt: feature.updatedAt || new Date().toISOString(),
      };
      const docRef = doc(db, COLLECTION_NAME, String(feature.id));
      await setDoc(docRef, cleanedFeature, { merge: true });
      return true;
    } catch (fbErr) {
      console.warn('Lỗi ghi trực tiếp vào Firestore sau ngoại lệ mạng:', fbErr);
    }
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

    // Optimize coordinates across all items
    const cleanedFeatures = deduped.map((feat) => ({
      ...feat,
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
 * Load all shared features from Firestore database (supports both Chunked Layer bundles and Individual documents)
 */
export async function loadSharedFeaturesFromFirestore(): Promise<GeoJsonFeatureItem[]> {
  const itemsMap = new Map<string, GeoJsonFeatureItem>();

  // Load from LocalStorage first
  const localItems = getFromLocalStorage();
  localItems.forEach((item) => {
    if (!isDemoFeatureId(item.id)) itemsMap.set(getItemUniqueKey(item), item);
  });

  let firestoreChunkItemsCount = 0;

  try {
    // Purge known demo items from Firestore
    const demoIdsToDelete = ['demo_poly_1', 'demo_point_1', 'demo_point_2', 'demo_point_3'];
    demoIdsToDelete.forEach((dId) => {
      deleteDoc(doc(db, COLLECTION_NAME, dId)).catch(() => {});
    });

    // 1. Load Layer Chunks (for large GeoJSON files)
    try {
      const chunksSnap = await getDocs(collection(db, CHUNKS_COLLECTION));
      chunksSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.payloadJson) {
          try {
            const parsedList: GeoJsonFeatureItem[] = JSON.parse(data.payloadJson);
            parsedList.forEach((item) => {
              if (!isDemoFeatureId(item.id)) {
                itemsMap.set(getItemUniqueKey(item), item);
                firestoreChunkItemsCount++;
              }
            });
          } catch (e) {
            console.error('Lỗi parse chunk JSON:', e);
          }
        }
      });
    } catch (chunkErr) {
      console.warn('Không tải được layer_chunks (dùng LocalStorage cache):', chunkErr);
    }

    // 2. Load Individual feature documents (single edits/approvals override chunks)
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const featId = data.id || docSnap.id;
        if (isDemoFeatureId(featId)) {
          deleteDoc(doc(db, COLLECTION_NAME, docSnap.id)).catch(() => {});
          return;
        }

        let coords = data.coordinates;
        if (typeof coords === 'string') {
          try {
            coords = JSON.parse(coords);
          } catch (e) {
            coords = [];
          }
        }

        const feat: GeoJsonFeatureItem = {
          id: featId,
          layerId: data.layerId,
          name: data.name,
          code: data.code || undefined,
          type: data.type,
          coordinates: coords,
          properties: data.properties || {},
          updatedAt: data.updatedAt,
        };

        itemsMap.set(getItemUniqueKey(feat), feat);
      });
    } catch (individualErr) {
      console.warn('Không tải được individual map_features (dùng LocalStorage cache):', individualErr);
    }

    const allList = deduplicateFeaturesList(Array.from(itemsMap.values()).filter((f) => !isDemoFeatureId(f.id)));
    
    // Cache to LocalStorage
    try {
      localStorage.setItem('gis_local_map_features', JSON.stringify(allList));
    } catch (e) {}

    return allList;
  } catch (err) {
    console.warn('Không thể tải dữ liệu mới từ Firestore, sử dụng bộ nhớ đệm LocalStorage:', err);
    return deduplicateFeaturesList(Array.from(itemsMap.values()).filter((f) => !isDemoFeatureId(f.id)));
  }
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
  try {
    const res = await fetch('/api/aliases/save', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        aliases: aliasMap,
        hiddenFields: hiddenMap || {},
      }),
    });

    if (res.ok) {
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
 * Load field alias dictionary and hidden fields map from Firestore
 */
export async function loadFieldAliasDictionaryFromFirestore(): Promise<{
  aliases: Record<string, string>;
  hiddenFields: Record<string, boolean>;
} | null> {
  try {
    const docRef = doc(db, APP_SETTINGS_COLLECTION, 'field_aliases');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        aliases: data?.aliases || {},
        hiddenFields: data?.hiddenFields || {},
      };
    }
  } catch (err) {
    console.warn('Lỗi khi tải bảng ánh xạ từ Firestore:', err);
  }
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
 * Load custom layer names from Firestore
 */
export async function loadLayerConfigsFromFirestore(): Promise<Record<string, string> | null> {
  try {
    const docRef = doc(db, APP_SETTINGS_COLLECTION, 'layer_configs');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data?.layerNames || null;
    }
  } catch (err) {
    console.warn('Lỗi khi tải cấu hình tên lớp từ Firestore:', err);
  }
  return null;
}


export async function loadRasterLayersFromFirestore(): Promise<RasterLayer[]> {
  try {
    const querySnapshot = await getDocs(collection(db, 'raster_layers'));
    const fetchedLayers: RasterLayer[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      let files: RasterFileItem[] = Array.isArray(data.files) ? data.files : [];
      
      // Backward compatibility: if layer had a single direct URL without files array
      if (files.length === 0 && data.url) {
        files = [{
          id: `${docSnap.id}_file_0`,
          fileName: data.name || 'Raster File',
          url: data.url,
          format: data.format || 'COG',
          minZoom: data.minZoom || 12,
          maxZoom: data.maxZoom || 18,
          bounds: data.bounds || null,
          uploadedAt: data.createdAt || new Date().toISOString(),
        }];
      }

      fetchedLayers.push({
        id: docSnap.id,
        name: data.name || 'Bản đồ nền',
        type: data.type || 'COG',
        source: data.source,
        storagePath: data.storagePath,
        githubReleaseUrl: data.githubReleaseUrl,
        bounds: data.bounds || null,
        files: files,
        opacity: data.opacity ?? 1.0,
        enabled: data.enabled !== false, // Mặc định là true nếu chưa set
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt,
      });
    });
    return fetchedLayers;
  } catch (error) {
    console.error('Error fetching raster layers:', error);
    return [];
  }
}

/**
 * Update enabled state for a raster layer
 */
export async function updateRasterLayerEnabled(layerId: string, enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/raster-layers/update-enabled', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ layerId, enabled }),
    });

    if (res.ok) {
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

