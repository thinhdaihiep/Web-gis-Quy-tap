import { initializeApp as initAdminApp, cert, type App as AdminApp, getApps as getAdminApps, getApp as getAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';

export let adminApp: AdminApp | null = null;
export let adminDb: any = null;
export let adminStorage: any = null;
export let adminInitError: string | null = null;

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

try {
  const rawKey = process.env.FIREBASE_PRIVATE_KEY || process.env.firebase_private_key;
  if (rawKey && rawKey.trim()) {
    const formattedKey = formatFirebasePrivateKey(rawKey);
    const projectId = 'alien-repeater-wn50x';
    const clientEmail = 'firebase-adminsdk-fbsvc@alien-repeater-wn50x.iam.gserviceaccount.com';
    const databaseId = 'ai-studio-hthngwebgistmkim-aaf22399-a445-427d-9141-71aeb2891a9b';

    const existingApps = getAdminApps();
    adminApp = existingApps.length > 0 ? getAdminApp() : initAdminApp(
      {
        credential: cert({
          projectId,
          clientEmail,
          privateKey: formattedKey,
        }),
      }
    );

    adminDb = getAdminFirestore(adminApp, databaseId);
    try {
      adminStorage = getAdminStorage(adminApp);
    } catch (_) {}
    console.log('[Server] Firebase Admin SDK initialized successfully (100% Pure Admin SDK)');
  } else {
    console.warn('[Server] FIREBASE_PRIVATE_KEY is missing! Admin SDK cannot be initialized.');
  }
} catch (adminErr: any) {
  adminInitError = adminErr?.message || String(adminErr);
  console.error('[Server] Firebase Admin SDK initialization error:', adminErr);
}

export { FieldValue };
