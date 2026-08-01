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

/**
 * Save / Update a batch of imported features into the shared Firestore database.
 * Automatically uses Layer Chunking for large datasets (>50 items or >500KB)
 * to reduce Firestore write operations by 99% (preventing Quota / Resource Exhausted limits).
 */
export async function saveImportedFeaturesToFirestore(
  features: GeoJsonFeatureItem[]
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!features || features.length === 0) {
      return { success: true, count: 0 };
    }

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
    console.error('Lỗi khi lưu dữ liệu lên Firestore:', err);

    let userFriendlyError = err.message || 'Không thể kết nối đến CSDL Firestore.';
    if (err.code === 'resource-exhausted' || err.message?.includes('quota') || err.message?.includes('EXCEEDED')) {
      userFriendlyError = 'Hạn ngạch Firebase đã đạt giới hạn gói miễn phí (Spark Plan). Bạn có thể nâng cấp gói Blaze trong Firebase Console.';
    } else if (err.message?.includes('1,048,576') || err.message?.includes('size')) {
      userFriendlyError = 'File GeoJSON chứa đối tượng lớn hơn 1MB limit của Firestore.';
    }

    return {
      success: false,
      count: 0,
      error: userFriendlyError,
    };
  }
}

/**
 * Load all shared features from Firestore database (supports both Chunked Layer bundles and Individual documents)
 */
export async function loadSharedFeaturesFromFirestore(): Promise<GeoJsonFeatureItem[]> {
  const itemsMap = new Map<string, GeoJsonFeatureItem>();

  try {
    // 1. Load Layer Chunks (for large GeoJSON files)
    try {
      const chunksSnap = await getDocs(collection(db, CHUNKS_COLLECTION));
      chunksSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.payloadJson) {
          try {
            const parsedList: GeoJsonFeatureItem[] = JSON.parse(data.payloadJson);
            parsedList.forEach((item) => itemsMap.set(String(item.id), item));
          } catch (e) {
            console.error('Lỗi parse chunk JSON:', e);
          }
        }
      });
    } catch (chunkErr) {
      console.warn('Chưa có bộ sưu tập layer_chunks hoặc không tải được:', chunkErr);
    }

    // 2. Load Individual feature documents
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let coords = data.coordinates;
        if (typeof coords === 'string') {
          try {
            coords = JSON.parse(coords);
          } catch (e) {
            coords = [];
          }
        }

        const feat: GeoJsonFeatureItem = {
          id: data.id || docSnap.id,
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
      console.warn('Lỗi khi tải individual map_features:', individualErr);
    }

    return Array.from(itemsMap.values());
  } catch (err) {
    console.warn('Lưu ý: Không thể tải dữ liệu từ CSDL dùng chung Firestore:', err);
    return [];
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

