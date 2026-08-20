import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Load config
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const rawConfig = fs.readFileSync(configPath, 'utf8');
const firebaseConfig = JSON.parse(rawConfig);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const TARGET_TIMESTAMP = 1782864000000; // 01/07/2026 UTC
const COLLECTION_NAME = 'map_features';
const CHUNKS_COLLECTION = 'layer_chunks';

function isBattleLayer(layerId?: string, featureName?: string): boolean {
  if (!layerId) return false;
  const l = layerId.toLowerCase();
  if (
    l === 'layer2_tran_danh' ||
    l === 'layer3_tran_danh' ||
    l === 'layer3_tran_danh_lich_su' ||
    l.includes('tran_danh') ||
    l.includes('trandanh')
  ) {
    return true;
  }
  return false;
}

async function runUpdate() {
  console.log('=== BẮT ĐẦU CẬP NHẬT TRƯỜNG CapNhat =', TARGET_TIMESTAMP, 'CHO LỚP TRẬN ĐÁNH ===');

  let updatedIndividualCount = 0;
  let updatedChunkFeatureCount = 0;

  // 1. Update individual documents in map_features
  console.log('1. Quét collection map_features...');
  try {
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    console.log(`Tìm thấy ${snap.size} documents trong ${COLLECTION_NAME}`);

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const layerId = data.layerId;

      if (isBattleLayer(layerId, data.name)) {
        const props = { ...(data.properties || {}) };
        props['CapNhat'] = TARGET_TIMESTAMP;

        await updateDoc(doc(db, COLLECTION_NAME, docSnap.id), {
          properties: props,
          updatedAt: new Date().toISOString(),
        });
        updatedIndividualCount++;
        console.log(`  -> Đã cập nhật doc: ${docSnap.id} (Tên: ${data.name || props.Ten || 'N/A'})`);
      }
    }
  } catch (err) {
    console.error('Lỗi khi cập nhật map_features:', err);
  }

  // 2. Update chunk documents in layer_chunks
  console.log('2. Quét collection layer_chunks...');
  try {
    const chunkSnap = await getDocs(collection(db, CHUNKS_COLLECTION));
    console.log(`Tìm thấy ${chunkSnap.size} chunks trong ${CHUNKS_COLLECTION}`);

    for (const chunkDoc of chunkSnap.docs) {
      const chunkData = chunkDoc.data();
      const chunkLayerId = chunkData.layerId;

      if (isBattleLayer(chunkLayerId) || chunkDoc.id.includes('tran_danh') || chunkDoc.id.includes('layer2_') || chunkDoc.id.includes('layer3_')) {
        if (chunkData.payloadJson) {
          try {
            const list = JSON.parse(chunkData.payloadJson);
            let modified = false;

            const updatedList = list.map((feat: any) => {
              if (isBattleLayer(feat.layerId || chunkLayerId, feat.name)) {
                modified = true;
                updatedChunkFeatureCount++;
                const props = { ...(feat.properties || {}) };
                props['CapNhat'] = TARGET_TIMESTAMP;
                return {
                  ...feat,
                  properties: props,
                  updatedAt: new Date().toISOString(),
                };
              }
              return feat;
            });

            if (modified) {
              await setDoc(doc(db, CHUNKS_COLLECTION, chunkDoc.id), {
                ...chunkData,
                payloadJson: JSON.stringify(updatedList),
                syncedToSharedDbAt: new Date().toISOString(),
              });
              console.log(`  -> Đã cập nhật chunk: ${chunkDoc.id} với ${updatedList.length} features`);
            }
          } catch (e) {
            console.error(`Lỗi parse chunk ${chunkDoc.id}:`, e);
          }
        }
      }
    }
  } catch (err) {
    console.error('Lỗi khi cập nhật layer_chunks:', err);
  }

  console.log('=== HOÀN TẤT CẬP NHẬT ===');
  console.log(`- Số feature đơn lẻ đã cập nhật: ${updatedIndividualCount}`);
  console.log(`- Số feature trong chunk đã cập nhật: ${updatedChunkFeatureCount}`);
  process.exit(0);
}

runUpdate().catch((e) => {
  console.error('Lỗi thực thi:', e);
  process.exit(1);
});
