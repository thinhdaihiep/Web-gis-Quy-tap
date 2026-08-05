import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  console.error('Không tìm thấy firebase-applet-config.json!');
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

const CHUNKS_COLLECTION = 'layer_chunks';
const COLLECTION_NAME = 'map_features';

export function extractObjectId(feature: any): string | null {
  if (!feature) return null;
  const props = feature.properties || feature;
  const val =
    props.OBJECTID ??
    props.objectid ??
    props.ObjectId ??
    props.objectId ??
    props.OBJECT_ID ??
    props.Object_Id ??
    props.code ??
    feature.code;

  if (val !== undefined && val !== null && String(val).trim() !== '') {
    return String(val).trim();
  }
  return null;
}

async function runGlobalDeduplication() {
  console.log('=== BẮT ĐẦU TOÀN DIỆN: DỌN DẸP TRÙNG OBJECTID TRÊN TOÀN BỘ CSDL ===');

  const allFeatures: any[] = [];
  const chunkDocIds: string[] = [];

  // 1. Fetch all items from layer_chunks
  try {
    const chunksSnap = await getDocs(collection(db, CHUNKS_COLLECTION));
    console.log(`Đã tải ${chunksSnap.size} chunks từ Firestore.`);

    chunksSnap.forEach((docSnap) => {
      chunkDocIds.push(docSnap.id);
      const data = docSnap.data();
      if (data && data.payloadJson) {
        try {
          const list = JSON.parse(data.payloadJson);
          if (Array.isArray(list)) {
            allFeatures.push(...list);
          }
        } catch (e) {
          console.error(`Lỗi parse JSON chunk ${docSnap.id}:`, e);
        }
      }
    });
  } catch (err: any) {
    console.error('Lỗi khi tải layer_chunks:', err?.message || err);
  }

  // 2. Fetch all items from map_features
  try {
    const mapSnap = await getDocs(collection(db, COLLECTION_NAME));
    console.log(`Đã tải ${mapSnap.size} tài liệu từ map_features.`);
    mapSnap.forEach((docSnap) => {
      const data = docSnap.data();
      allFeatures.push(data);
    });
  } catch (err: any) {
    console.error('Lỗi khi tải map_features:', err?.message || err);
  }

  console.log(`\n-> Tổng số đối tượng thu thập được: ${allFeatures.length}`);

  // 3. Perform Global Deduplication
  const globalDedupMap = new Map<string, { feature: any; index: number }>();
  let duplicateCount = 0;
  const duplicateDetails: Array<{ layerId: string; objId: string; name: string }> = [];

  allFeatures.forEach((feat, idx) => {
    const objId = extractObjectId(feat);
    const layerId = feat.layerId || 'default';
    const key = objId
      ? `${layerId}_objid_${objId.toLowerCase()}`
      : `${layerId}_id_${String(feat.id).toLowerCase()}`;

    if (!globalDedupMap.has(key)) {
      globalDedupMap.set(key, { feature: feat, index: idx });
    } else {
      duplicateCount++;
      const existing = globalDedupMap.get(key)!;
      const existingTime = existing.feature.updatedAt ? new Date(existing.feature.updatedAt).getTime() : 0;
      const featTime = feat.updatedAt ? new Date(feat.updatedAt).getTime() : 0;

      duplicateDetails.push({
        layerId,
        objId: objId || String(feat.id),
        name: feat.name || feat.properties?.Ten || 'Không tên',
      });

      // Keep feature with newer updatedAt, or if equal, keep the one processed later
      if (featTime >= existingTime) {
        globalDedupMap.set(key, { feature: feat, index: idx });
      }
    }
  });

  const cleanedFeatures = Array.from(globalDedupMap.values()).map((v) => v.feature);

  console.log(`\n=== KẾT QUẢ ĐỐI CHIẾU TRÙNG LẶP GLOBAL ===`);
  console.log(`- Tổng ban đầu: ${allFeatures.length}`);
  console.log(`- Phát hiện đối tượng trùng [OBJECTID]: ${duplicateCount}`);
  console.log(`- Tổng số đối tượng duy nhất sau khi xóa trùng: ${cleanedFeatures.length}`);

  if (duplicateDetails.length > 0) {
    console.log('\nMẫu 10 đối tượng trùng đã được loại bỏ:');
    console.table(duplicateDetails.slice(0, 10));
  }

  if (duplicateCount === 0) {
    console.log('\nCSDL hiện tại đã hoàn toàn sạch, không phát hiện đối tượng trùng!');
    process.exit(0);
  }

  // 4. Group cleaned features by layerId and re-chunk back to layer_chunks
  console.log('\n--- Đang ghi lại dữ liệu đã xóa trùng vào Firestore ---');
  const layerGroups = new Map<string, any[]>();
  cleanedFeatures.forEach((feat) => {
    const lId = feat.layerId || 'default';
    if (!layerGroups.has(lId)) layerGroups.set(lId, []);
    layerGroups.get(lId)!.push(feat);
  });

  const CHUNK_SIZE = 100;
  const newChunkDocIds = new Set<string>();

  for (const [layerId, features] of layerGroups.entries()) {
    let chunkIdx = 0;
    for (let i = 0; i < features.length; i += CHUNK_SIZE) {
      const slice = features.slice(i, i + CHUNK_SIZE);
      const docId = `chunk_${layerId}_${chunkIdx}`;
      newChunkDocIds.add(docId);

      await setDoc(doc(db, CHUNKS_COLLECTION, docId), {
        layerId,
        chunkIndex: chunkIdx,
        featureCount: slice.length,
        payloadJson: JSON.stringify(slice),
        syncedToSharedDbAt: new Date().toISOString(),
      });

      chunkIdx++;
    }
    console.log(`-> Lớp [${layerId}]: Ghi ${features.length} đối tượng vào ${chunkIdx} chunks.`);
  }

  // Delete old unused chunks if any
  for (const oldDocId of chunkDocIds) {
    if (!newChunkDocIds.has(oldDocId)) {
      console.log(`-> Xóa chunk dư thừa cũ: ${oldDocId}`);
      await deleteDoc(doc(db, CHUNKS_COLLECTION, oldDocId));
    }
  }

  console.log('\n=== HOÀN TẤT DỌN DẸP TRÙNG OBJECTID TRÊN FIRESTORE ===');
  process.exit(0);
}

runGlobalDeduplication();
