/**
 * Script nạp dữ liệu không gian hàng loạt (Bulk Import Features)
 * Sử dụng trực tiếp Firebase Admin SDK trên Dev Server
 *
 * Cách chạy trên terminal:
 * npx tsx scripts/bulk_import_features.ts <duong_dan_file_geojson_hoac_json> [layerId]
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function formatFirebasePrivateKey(key: string): string {
  let cleaned = key.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  cleaned = cleaned.replace(/\\n/g, '\n');
  if (!cleaned.includes('-----BEGIN PRIVATE KEY-----')) {
    cleaned = `-----BEGIN PRIVATE KEY-----\n${cleaned}\n-----END PRIVATE KEY-----\n`;
  }
  return cleaned;
}

const rawKey = process.env.FIREBASE_PRIVATE_KEY || process.env.firebase_private_key;
if (!rawKey) {
  console.error('[Bulk Import Error] Không tìm thấy biến môi trường FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

const projectId = 'alien-repeater-wn50x';
const clientEmail = 'firebase-adminsdk-fbsvc@alien-repeater-wn50x.iam.gserviceaccount.com';
const databaseId = 'ai-studio-hthngwebgistmkim-aaf22399-a445-427d-9141-71aeb2891a9b';

const app = getApps().length > 0
  ? getApp()
  : initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: formatFirebasePrivateKey(rawKey),
      }),
    });

const db = getFirestore(app, databaseId);

async function bumpFeaturesSyncVersion() {
  const docRef = db.collection('app_settings').doc('sync_registry');
  const snap = await docRef.get();
  const currentVersion = snap.exists ? Number(snap.data()?.featuresVersion) || 1 : 1;
  const nextVersion = currentVersion + 1;
  const now = new Date().toISOString();

  await docRef.set({
    featuresVersion: nextVersion,
    featuresUpdatedAt: now,
  }, { merge: true });

  console.log(`[Bulk Import] Đã tăng featuresVersion: v${currentVersion} -> v${nextVersion} (${now})`);
}

async function run() {
  const filePath = process.argv[2];
  const targetLayerId = process.argv[3] || 'layer1_tim_kiem';

  if (!filePath) {
    console.log('Sử dụng: npx tsx scripts/bulk_import_features.ts <duong_dan_file_geojson> [layerId]');
    console.log('Ví dụ: npx tsx scripts/bulk_import_features.ts data/mo_chi.geojson layer1_tim_kiem');
    process.exit(0);
  }

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Không tìm thấy file: ${resolved}`);
    process.exit(1);
  }

  console.log(`Đang đọc file: ${resolved}`);
  const rawData = fs.readFileSync(resolved, 'utf8');
  const json = JSON.parse(rawData);

  let featuresList: any[] = [];
  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
    featuresList = json.features;
  } else if (Array.isArray(json)) {
    featuresList = json;
  } else {
    console.error('Định dạng dữ liệu không hợp lệ. Phải là FeatureCollection hoặc mảng Feature.');
    process.exit(1);
  }

  console.log(`Tìm thấy ${featuresList.length} đối tượng. Bắt đầu ghi vào Firestore...`);

  const CHUNK_SIZE = 500;
  let savedCount = 0;

  for (let i = 0; i < featuresList.length; i += CHUNK_SIZE) {
    const chunk = featuresList.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    for (let j = 0; j < chunk.length; j++) {
      const item = chunk[j];
      const id = String(item.id || item.properties?.OBJECTID || item.properties?.id || `feat_${Date.now()}_${i + j}`);
      const docRef = db.collection('map_features').doc(id);

      const rawCoords = item.coordinates || item.geometry?.coordinates || [];
      const coordsJson = typeof rawCoords === 'string' ? rawCoords : JSON.stringify(rawCoords);

      const docData = {
        id,
        layerId: item.layerId || targetLayerId,
        name: item.name || item.properties?.Ten || item.properties?.name || '',
        type: item.type || item.geometry?.type || 'Point',
        coordinates: coordsJson,
        properties: item.properties || {},
        updatedAt: item.updatedAt || new Date().toISOString(),
      };

      batch.set(docRef, docData, { merge: true });
    }

    await batch.commit();
    savedCount += chunk.length;
    console.log(`Đã lưu ${savedCount}/${featuresList.length} đối tượng...`);
  }

  // Tăng phiên bản đồng bộ cho Client
  await bumpFeaturesSyncVersion();

  console.log('------------------------------------------------------------');
  console.log(`Thành công! Đã nạp ${savedCount} đối tượng vào CSDL.`);
  console.log('Toàn bộ máy khách sẽ tự động nhận biết và đồng bộ dữ liệu mới.');
  console.log('------------------------------------------------------------');
}

run().catch((err) => {
  console.error('[Bulk Import Error]:', err);
  process.exit(1);
});
