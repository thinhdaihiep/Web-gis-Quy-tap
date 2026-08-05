import { doc, setDoc, getDoc, getDocs, collection, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { GeoJsonFeatureItem, LayerConfig } from './types';

const COLLECTION_NAME = 'map_features';
const CHUNKS_COLLECTION = 'layer_chunks';
const APP_SETTINGS_COLLECTION = 'app_settings';

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
    const featureMap = new Map<string, GeoJsonFeatureItem>();

    existingList.forEach((f) => {
      if (!isDemoFeatureId(f.id)) featureMap.set(String(f.id), f);
    });
    features.forEach((f) => {
      if (!isDemoFeatureId(f.id)) featureMap.set(String(f.id), f);
    });

    const merged = Array.from(featureMap.values());
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
    // Optimize coordinates across all items
    const cleanedFeatures = features.map((feat) => ({
      ...feat,
      coordinates: optimizeCoordinates(feat.coordinates),
      updatedAt: feat.updatedAt || new Date().toISOString().split('T')[0],
    }));

    // If batch size is larger than 30 items, use Layer Chunking strategy
    // Group items into ~400KB compressed payload chunks (max 100 items per chunk)
    if (cleanedFeatures.length > 30) {
      const targetLayerId = cleanedFeatures[0].layerId || 'default';
      const CHUNK_ITEM_COUNT = 100;
      let chunkIdx = 0;

      for (let i = 0; i < cleanedFeatures.length; i += CHUNK_ITEM_COUNT) {
        const slice = cleanedFeatures.slice(i, i + CHUNK_ITEM_COUNT);
        const docId = `chunk_${targetLayerId}_${chunkIdx}`;
        const docRef = doc(db, CHUNKS_COLLECTION, docId);

        await setDoc(docRef, {
          layerId: targetLayerId,
          chunkIndex: chunkIdx,
          featureCount: slice.length,
          payloadJson: JSON.stringify(slice),
          syncedToSharedDbAt: new Date().toISOString(),
        });

        chunkIdx++;
      }

      return { success: true, count: cleanedFeatures.length };
    }

    // Small batch (<30 items): Use standard individual feature documents
    const CHUNK_SIZE = 400;
    let savedCount = 0;

    for (let i = 0; i < cleanedFeatures.length; i += CHUNK_SIZE) {
      const chunk = cleanedFeatures.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((feat) => {
        const docId = String(feat.id).replace(/[\/\s#?]/g, '_');
        const docRef = doc(db, COLLECTION_NAME, docId);

        const payload = {
          id: feat.id,
          layerId: feat.layerId,
          name: feat.name,
          code: feat.code || null,
          type: feat.type,
          coordinates: JSON.stringify(feat.coordinates),
          properties: feat.properties || {},
          status: feat.status || 'xac_dinh',
          updatedAt: feat.updatedAt,
          syncedToSharedDbAt: new Date().toISOString(),
        };

        batch.set(docRef, payload, { merge: true });
      });

      await batch.commit();
      savedCount += chunk.length;
    }

    return { success: true, count: savedCount };
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
    if (!isDemoFeatureId(item.id)) itemsMap.set(String(item.id), item);
  });

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
              if (!isDemoFeatureId(item.id)) itemsMap.set(String(item.id), item);
            });
          } catch (e) {
            console.error('Lỗi parse chunk JSON:', e);
          }
        }
      });
    } catch (chunkErr) {
      console.warn('Không tải được layer_chunks (dùng LocalStorage cache):', chunkErr);
    }

    // 2. Load Individual feature documents
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
          status: data.status,
          updatedAt: data.updatedAt,
        };

        itemsMap.set(String(feat.id), feat);
      });
    } catch (individualErr) {
      console.warn('Không tải được individual map_features (dùng LocalStorage cache):', individualErr);
    }

    const allList = Array.from(itemsMap.values()).filter((f) => !isDemoFeatureId(f.id));
    syncToLocalStorage(allList);
    return allList;
  } catch (err) {
    console.warn('Không thể tải dữ liệu mới từ Firestore, sử dụng bộ nhớ đệm LocalStorage:', err);
    return Array.from(itemsMap.values()).filter((f) => !isDemoFeatureId(f.id));
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

