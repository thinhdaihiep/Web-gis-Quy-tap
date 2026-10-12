import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

function isShapeProperty(key: string): boolean {
  if (!key) return false;
  const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    norm === 'shapearea' ||
    norm === 'shapelength' ||
    norm === 'shapeleng' ||
    norm.startsWith('shapearea') ||
    norm.startsWith('shapelength') ||
    norm.startsWith('shapeleng')
  );
}

function cleanProps(props: Record<string, any> | undefined | null) {
  if (!props) return { cleaned: {}, changed: false };
  let changed = false;
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(props)) {
    if (isShapeProperty(k)) {
      changed = true;
    } else {
      cleaned[k] = v;
    }
  }
  return { cleaned, changed };
}

async function main() {
  const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(cfgPath)) {
    console.error('firebase-applet-config.json not found');
    process.exit(1);
  }

  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const fbApp = getApps().length > 0 ? getApp() : initializeApp(cfg);
  const db = getFirestore(fbApp, cfg.firestoreDatabaseId);

  console.log('--- Đang quét và làm sạch Shape_Area & Shape_Length trong Firestore ---');

  // 1. Quét layer_chunks
  console.log('1. Quét collection layer_chunks...');
  const chunksSnap = await getDocs(collection(db, 'layer_chunks'));
  let updatedChunks = 0;
  let cleanedFeaturesInChunks = 0;

  for (const chunkDoc of chunksSnap.docs) {
    const data = chunkDoc.data();
    if (!data.payloadJson) continue;

    try {
      const features: any[] = JSON.parse(data.payloadJson);
      let chunkChanged = false;

      const newFeatures = features.map((feat) => {
        if (!feat || !feat.properties) return feat;
        const { cleaned, changed } = cleanProps(feat.properties);
        if (changed) {
          chunkChanged = true;
          cleanedFeaturesInChunks++;
          return { ...feat, properties: cleaned };
        }
        return feat;
      });

      if (chunkChanged) {
        await updateDoc(doc(db, 'layer_chunks', chunkDoc.id), {
          payloadJson: JSON.stringify(newFeatures),
        });
        updatedChunks++;
        console.log(`  -> Đã cập nhật chunk: ${chunkDoc.id}`);
      }
    } catch (err: any) {
      console.error(`  Lỗi xử lý chunk ${chunkDoc.id}:`, err.message);
    }
  }
  console.log(`Hoàn thành layer_chunks: đã sửa ${updatedChunks} chunks (${cleanedFeaturesInChunks} features).`);

  // 2. Quét map_features
  console.log('2. Quét collection map_features...');
  const featSnap = await getDocs(collection(db, 'map_features'));
  let updatedFeatures = 0;

  for (const featDoc of featSnap.docs) {
    const data = featDoc.data();
    if (!data.properties) continue;

    const { cleaned, changed } = cleanProps(data.properties);
    if (changed) {
      await updateDoc(doc(db, 'map_features', featDoc.id), {
        properties: cleaned,
      });
      updatedFeatures++;
    }
  }
  console.log(`Hoàn thành map_features: đã sửa ${updatedFeatures} features.`);

  // 3. Quét commune_chunks (CapXa)
  console.log('3. Quét collection commune_chunks...');
  const communeSnap = await getDocs(collection(db, 'commune_chunks'));
  let updatedCommuneChunks = 0;

  for (const cDoc of communeSnap.docs) {
    const data = cDoc.data();
    if (!data.payloadJson) continue;

    try {
      const features: any[] = JSON.parse(data.payloadJson);
      let changed = false;

      const newFeatures = features.map((feat) => {
        if (!feat || !feat.properties) return feat;
        const res = cleanProps(feat.properties);
        if (res.changed) {
          changed = true;
          return { ...feat, properties: res.cleaned };
        }
        return feat;
      });

      if (changed) {
        await updateDoc(doc(db, 'commune_chunks', cDoc.id), {
          payloadJson: JSON.stringify(newFeatures),
        });
        updatedCommuneChunks++;
      }
    } catch (e: any) {
      console.error(`  Lỗi xử lý commune chunk ${cDoc.id}:`, e.message);
    }
  }
  console.log(`Hoàn thành commune_chunks: đã sửa ${updatedCommuneChunks} chunks.`);

  console.log('--- Hoàn tất quá trình làm sạch dữ liệu trong CSDL! ---');
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
