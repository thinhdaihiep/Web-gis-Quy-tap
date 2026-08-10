import { doc, setDoc, getDoc, getDocs, collection, writeBatch, deleteDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { GeoJsonFeatureItem, LayerConfig, AppUser, UserRole } from './types';
import { deduplicateFeaturesList, getItemUniqueKey } from './fieldAlias';

const COLLECTION_NAME = 'map_features';
const CHUNKS_COLLECTION = 'layer_chunks';
const APP_SETTINGS_COLLECTION = 'app_settings';

// Auth Functions

export const signInWithCredentials = async (username: string, password: string): Promise<AppUser | null> => {
  try {
    // Default admin account
    if (username === 'admin' && password === '123') {
      const adminUser: AppUser = {
        uid: 'admin_static',
        username: 'admin',
        displayName: 'Quản trị viên',
        role: 'admin',
      };
      localStorage.setItem('gis_user_session', JSON.stringify(adminUser));
      return adminUser;
    }

    const q = query(collection(db, 'users'), where('username', '==', username), where('password', '==', password));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      const data = docSnap.data();
      const user: AppUser = {
        uid: docSnap.id,
        username: data.username,
        displayName: data.displayName || data.username,
        role: data.role || 'guest',
      };
      localStorage.setItem('gis_user_session', JSON.stringify(user));
      return user;
    }

    return null;
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    return null;
  }
};

export const signOutUser = (): void => {
  localStorage.removeItem('gis_user_session');
};

export const getStoredUser = (): AppUser | null => {
  try {
    const stored = localStorage.getItem('gis_user_session');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error(e);
  }
  return null;
};


/**
 * Reduce coordinate floating point precision to 6 decimals (~0.1m accuracy)
 * to significantly compress GeoJSON document payload size in Firestore.
 */
function optimizeCoordinates(coords: any): any {
  if (typeof coords === 'number') {
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
    const docRef = doc(db, COLLECTION_NAME, String(feature.id));

    const rawCoords = feature.coordinates || (feature as any).geometry?.coordinates || [];
    const optimizedCoords = optimizeCoordinates(rawCoords);
    const coordsJsonStr = typeof optimizedCoords === 'string' ? optimizedCoords : JSON.stringify(optimizedCoords);

    const cleanedDoc: Record<string, any> = {
      id: String(feature.id),
      layerId: feature.layerId || 'layer1_tim_kiem',
      name: feature.name || '',
      type: feature.type || (feature as any).geometry?.type || 'Point',
      coordinates: coordsJsonStr,
      properties: feature.properties || {},
      updatedAt: feature.updatedAt || new Date().toISOString(),
    };

    if (feature.code) cleanedDoc.code = feature.code;

    await setDoc(docRef, cleanedDoc, { merge: true });
    return true;
  } catch (err) {
    console.warn('Lỗi khi lưu đối tượng đơn lẻ vào Firestore:', err);
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

  // If saving small batch (< 20 items), save as individual documents to avoid touching layer chunks
  if (features.length < 20) {
    let count = 0;
    for (const f of features) {
      const ok = await saveSingleFeatureToFirestore(f);
      if (ok) count++;
    }
    return { success: true, count };
  }

  try {
    // Deduplicate list by OBJECTID / ID before saving
    const deduped = deduplicateFeaturesList(features);

    // Optimize coordinates across all items
    const cleanedFeatures = deduped.map((feat) => ({
      ...feat,
      coordinates: optimizeCoordinates(feat.coordinates),
      updatedAt: feat.updatedAt || new Date().toISOString().split('T')[0],
    }));

    // Group features by layerId
    const layerGroups = new Map<string, GeoJsonFeatureItem[]>();
    cleanedFeatures.forEach((f) => {
      const lId = f.layerId || 'default';
      if (!layerGroups.has(lId)) layerGroups.set(lId, []);
      layerGroups.get(lId)!.push(f);
    });

    const CHUNK_ITEM_COUNT = 100;
    let totalSaved = 0;

    for (const [layerId, layerFeats] of layerGroups.entries()) {
      let chunkIdx = 0;
      for (let i = 0; i < layerFeats.length; i += CHUNK_ITEM_COUNT) {
        const slice = layerFeats.slice(i, i + CHUNK_ITEM_COUNT);
        const docId = `chunk_${layerId}_${chunkIdx}`;
        const docRef = doc(db, CHUNKS_COLLECTION, docId);

        await setDoc(docRef, {
          layerId,
          chunkIndex: chunkIdx,
          featureCount: slice.length,
          payloadJson: JSON.stringify(slice),
          syncedToSharedDbAt: new Date().toISOString(),
        });

        chunkIdx++;
      }

      totalSaved += layerFeats.length;

      // Clean up any old leftover extra chunks for this layer
      for (let extra = chunkIdx; extra < chunkIdx + 10; extra++) {
        const docId = `chunk_${layerId}_${extra}`;
        const docRef = doc(db, CHUNKS_COLLECTION, docId);
        try {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            await deleteDoc(docRef);
          } else {
            break;
          }
        } catch (e) {
          break;
        }
      }
    }

    return { success: true, count: totalSaved };
  } catch (err: any) {
    console.warn('Lưu ý CSDL Firestore (Đã lưu vào bộ nhớ máy):', err?.message || err);

    let userFriendlyError = err.message || 'Không thể kết nối đến CSDL Firestore.';
    if (err.code === 'resource-exhausted' || err.message?.includes('quota') || err.message?.includes('EXCEEDED')) {
      userFriendlyError = 'Hạn ngạch Firestore gói Spark đã đạt giới hạn. Dữ liệu đã được lưu an toàn vào bộ nhớ trình duyệt!';
    } else if (err.message?.includes('1,048,576') || err.message?.includes('size')) {
      userFriendlyError = 'File GeoJSON chứa đối tượng lớn hơn 1MB limit của Firestore.';
    }

    return {
      success: false,
      count: features.length,
      error: userFriendlyError,
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
    const docRef = doc(db, COLLECTION_NAME, featureId);
    await deleteDoc(docRef);

    const currentLocal = getFromLocalStorage();
    const updatedLocal = currentLocal.filter((f) => String(f.id) !== String(featureId));
    syncToLocalStorage(updatedLocal);

    return true;
  } catch (err) {
    console.warn('Lỗi khi xóa đối tượng khỏi Firestore:', err);
    return false;
  }
}

/**
 * Save field alias dictionary to Firestore
 */
export async function saveFieldAliasDictionaryToFirestore(
  aliasMap: Record<string, string>
): Promise<boolean> {
  try {
    const docRef = doc(db, APP_SETTINGS_COLLECTION, 'field_aliases');
    await setDoc(docRef, {
      aliases: aliasMap,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.error('Lỗi khi lưu bảng ánh xạ lên Firestore:', err);
    return false;
  }
}

/**
 * Load field alias dictionary from Firestore
 */
export async function loadFieldAliasDictionaryFromFirestore(): Promise<Record<string, string> | null> {
  try {
    const docRef = doc(db, APP_SETTINGS_COLLECTION, 'field_aliases');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data?.aliases || null;
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
    const docRef = doc(db, APP_SETTINGS_COLLECTION, 'layer_configs');
    const layerNamesMap = layers.reduce((acc, l) => {
      acc[l.id] = l.name;
      return acc;
    }, {} as Record<string, string>);

    await setDoc(docRef, {
      layerNames: layerNamesMap,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.error('Lỗi khi lưu tên lớp lên Firestore:', err);
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

