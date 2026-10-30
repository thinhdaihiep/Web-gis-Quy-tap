import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Readable } from 'stream';
import { createServer as createViteServer } from 'vite';
import { fromUrl, fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import bcrypt from 'bcryptjs';
import { initializeApp as initAdminApp, cert, type App as AdminApp, getApps as getAdminApps, getApp as getAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';

// Server-side cache directory for downloaded raster files
const RASTER_CACHE_DIR = path.join('/tmp', 'raster_cache');
try {
  if (!fs.existsSync(RASTER_CACHE_DIR)) {
    fs.mkdirSync(RASTER_CACHE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Could not initialize /tmp/raster_cache:', err);
}

// Register projection definitions
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32649', '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:3405', '+proj=utm +zone=48 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs');
proj4.defs('EPSG:3406', '+proj=utm +zone=49 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs');
proj4.defs('EPSG:5899', '+proj=tmerc +lat_0=0 +lon_0=105 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs');
proj4.defs('EPSG:5897', '+proj=tmerc +lat_0=0 +lon_0=108 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs');
proj4.defs('EPSG:4756', '+proj=longlat +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +no_defs');

function convertBBox(minX: number, minY: number, maxX: number, maxY: number, epsg?: number | string) {
  const west = Math.min(minX, maxX);
  const east = Math.max(minX, maxX);
  const south = Math.min(minY, maxY);
  const north = Math.max(minY, maxY);

  // If already degrees in EPSG:4326
  if (epsg === 4326 || (west >= -180 && east <= 180 && south >= -90 && north <= 90)) {
    return { south, west, north, east };
  }

  // Web Mercator EPSG:3857
  try {
    const sw = proj4('EPSG:3857', 'EPSG:4326', [west, south]);
    const ne = proj4('EPSG:3857', 'EPSG:4326', [east, north]);
    if (!isNaN(sw[0]) && !isNaN(sw[1]) && !isNaN(ne[0]) && !isNaN(ne[1]) && sw[1] >= -90 && ne[1] <= 90) {
      return {
        south: sw[1],
        west: sw[0],
        north: ne[1],
        east: ne[0],
      };
    }
  } catch (_) {}

  // Explicit CRS
  if (epsg && epsg !== 3857 && epsg !== 'EPSG:3857') {
    const code = typeof epsg === 'number' ? `EPSG:${epsg}` : epsg;
    try {
      const sw = proj4(code, 'EPSG:4326', [west, south]);
      const ne = proj4(code, 'EPSG:4326', [east, north]);
      if (!isNaN(sw[0]) && !isNaN(sw[1]) && !isNaN(ne[0]) && !isNaN(ne[1]) && sw[1] >= -90 && ne[1] <= 90) {
        return {
          south: sw[1],
          west: sw[0],
          north: ne[1],
          east: ne[0],
        };
      }
    } catch (_) {}
  }

  return { south, west, north, east };
}

// =========================================================================
// Pure Firebase Admin SDK Initialization (100% Server Administrative Access)
// =========================================================================
let adminApp: AdminApp | null = null;
let adminDb: any = null;
let adminInitError: string | null = null;

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
    console.log('[Server] Firebase Admin SDK initialized successfully (100% Pure Admin SDK)');
  } else {
    console.warn('[Server] FIREBASE_PRIVATE_KEY is missing! Admin SDK cannot be initialized.');
  }
} catch (adminErr: any) {
  adminInitError = adminErr?.message || String(adminErr);
  console.warn('[Server] Cannot initialize Firebase Admin SDK:', adminErr);
}

// Global Sync Registry Interface & State
export interface SyncRegistryData {
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

let cachedSyncRegistry: SyncRegistryData | null = null;
let lastSyncRegistryFetch = 0;

async function getSyncRegistry(): Promise<SyncRegistryData> {
  const now = Date.now();
  if (cachedSyncRegistry && now - lastSyncRegistryFetch < 3000) {
    return cachedSyncRegistry;
  }
  if (!adminDb) {
    return {
      featuresVersion: 1,
      featuresUpdatedAt: new Date().toISOString(),
      rasterVersion: 1,
      rasterUpdatedAt: new Date().toISOString(),
      communesVersion: 1,
      communesUpdatedAt: new Date().toISOString(),
      configsVersion: 1,
      configsUpdatedAt: new Date().toISOString(),
      aliasesVersion: 1,
      aliasesUpdatedAt: new Date().toISOString(),
    };
  }

  try {
    const docRef = adminDb.collection('app_settings').doc('sync_registry');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      cachedSyncRegistry = {
        featuresVersion: Number(data.featuresVersion) || 1,
        featuresUpdatedAt: data.featuresUpdatedAt || new Date().toISOString(),
        rasterVersion: Number(data.rasterVersion) || 1,
        rasterUpdatedAt: data.rasterUpdatedAt || new Date().toISOString(),
        communesVersion: Number(data.communesVersion) || 1,
        communesUpdatedAt: data.communesUpdatedAt || new Date().toISOString(),
        configsVersion: Number(data.configsVersion) || 1,
        configsUpdatedAt: data.configsUpdatedAt || new Date().toISOString(),
        aliasesVersion: Number(data.aliasesVersion) || 1,
        aliasesUpdatedAt: data.aliasesUpdatedAt || new Date().toISOString(),
      };
    } else {
      const initial: SyncRegistryData = {
        featuresVersion: 1,
        featuresUpdatedAt: new Date().toISOString(),
        rasterVersion: 1,
        rasterUpdatedAt: new Date().toISOString(),
        communesVersion: 1,
        communesUpdatedAt: new Date().toISOString(),
        configsVersion: 1,
        configsUpdatedAt: new Date().toISOString(),
        aliasesVersion: 1,
        aliasesUpdatedAt: new Date().toISOString(),
      };
      await docRef.set(initial);
      cachedSyncRegistry = initial;
    }
    lastSyncRegistryFetch = now;
    return cachedSyncRegistry;
  } catch (err) {
    console.warn('[SyncRegistry] Lỗi đọc sync_registry:', err);
    return cachedSyncRegistry || {
      featuresVersion: 1,
      featuresUpdatedAt: new Date().toISOString(),
      rasterVersion: 1,
      rasterUpdatedAt: new Date().toISOString(),
      communesVersion: 1,
      communesUpdatedAt: new Date().toISOString(),
      configsVersion: 1,
      configsUpdatedAt: new Date().toISOString(),
      aliasesVersion: 1,
      aliasesUpdatedAt: new Date().toISOString(),
    };
  }
}

async function bumpSyncVersion(type: 'features' | 'raster' | 'configs' | 'aliases' | 'communes') {
  if (!adminDb) return;
  const now = new Date().toISOString();
  try {
    const current = await getSyncRegistry();
    const versionKey = `${type}Version` as keyof SyncRegistryData;
    const updatedKey = `${type}UpdatedAt` as keyof SyncRegistryData;
    const nextVersion = ((current[versionKey] as number) || 1) + 1;

    const updates = {
      [versionKey]: nextVersion,
      [updatedKey]: now,
    };

    await adminDb.collection('app_settings').doc('sync_registry').set(updates, { merge: true });
    if (cachedSyncRegistry) {
      (cachedSyncRegistry as any)[versionKey] = nextVersion;
      (cachedSyncRegistry as any)[updatedKey] = now;
      lastSyncRegistryFetch = Date.now();
    }
    console.log(`[SyncRegistry] Đã nhảy phiên bản ${type} -> v${nextVersion}`);
  } catch (err) {
    console.error(`[SyncRegistry] Lỗi nhảy phiên bản ${type}:`, err);
  }
}

// Function to automatically seed initial Admin account if none exists using Admin SDK
async function seedDefaultAdmin() {
  if (!adminDb) return;
  try {
    const snap = await adminDb.collection('users').get();
    let hasAdmin = false;
    snap.docs.forEach((docSnap: any) => {
      const data = docSnap.data();
      if (data.role === 'admin' || (data.username && data.username.toLowerCase() === 'admin')) {
        hasAdmin = true;
      }
    });

    if (!hasAdmin) {
      const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'GisAdmin@2026';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      const adminDoc = {
        username: 'admin',
        displayName: 'Bản đồ qk5',
        role: 'admin',
        password: hashedPassword,
        createdAt: new Date().toISOString(),
      };
      await adminDb.collection('users').doc('user_admin').set(adminDoc);
      console.log('----------------------------------------------------');
      console.log('[Security Seed] Đã tự động tạo tài khoản admin mặc định: admin');
      console.log('----------------------------------------------------');
    }
  } catch (err: any) {
    console.error('[Security Seed] Lỗi khởi tạo admin mặc định:', err);
  }
}

// Helper to compute token SHA256 hash for storage/revocation lookup
const hashToken = (tok: string): string => crypto.createHash('sha256').update(tok).digest('hex');

// In-memory token revocation list (stores token hashes)
const revokedTokenHashes = new Set<string>();

const isTokenRevoked = (token: string): boolean => {
  if (!token) return true;
  const h = hashToken(token);
  return revokedTokenHashes.has(h);
};

// Revoke a token both in-memory and in Firestore for distributed instances
const revokeToken = async (token: string) => {
  if (!token) return;
  const h = hashToken(token);
  revokedTokenHashes.add(h);
  activeSessions.delete(token);
  activeAdminSessions.delete(token);
  if (adminDb) {
    try {
      await adminDb.collection('revoked_tokens').doc(h).set({
        revokedAt: new Date().toISOString(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
    } catch (_) {}
  }
};

// Sync revoked tokens from Firestore on startup and in real-time across instances
async function syncRevokedTokens() {
  if (!adminDb) return;
  try {
    const snap = await adminDb.collection('revoked_tokens').get();
    const now = Date.now();
    snap.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data.expiresAt && data.expiresAt > now) {
        revokedTokenHashes.add(doc.id);
      }
    });

    // Realtime listener for cross-instance token revocations
    adminDb.collection('revoked_tokens').onSnapshot((snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'added' || change.type === 'modified') {
          revokedTokenHashes.add(change.doc.id);
        }
      });
    }, () => {});
  } catch (_) {}
}

// In-memory login rate limiter (max 5 failed attempts per IP, 15 minutes lockout)
const loginRateLimiter = new Map<string, { count: number; lockedUntil: number }>();

// In-memory rate limiter for public feedback submissions (max 5 submissions per 60 seconds per IP)
const feedbackRateLimiter = new Map<string, { count: number; resetAt: number }>();

// Dynamic session tokens for active admin and editor sessions (Zero-Config authentication)
interface ActiveSession {
  username: string;
  role: 'admin' | 'editor';
}
const activeSessions = new Map<string, ActiveSession>();
const activeAdminSessions = new Set<string>();

let memorySecretFallback = '';
const getSecretToken = (): string => {
  const envSecret = process.env.SESSION_SECRET || process.env.session_secret;
  if (envSecret && envSecret.trim() !== '') {
    return envSecret.trim();
  }
  if (!memorySecretFallback) {
    memorySecretFallback = crypto.randomBytes(64).toString('hex');
    console.log('[Auth] Đang sử dụng khóa ký phiên mật mã an toàn được sinh ngẫu nhiên trong bộ nhớ.');
  }
  return memorySecretFallback;
};

// Cryptographic token helper to ensure user session survives server restarts
// Format: v1.<role>.<base64url(username)>.<timestamp>.<full-64-char-hex-hmac>
const createSignedToken = (username: string, role: 'admin' | 'editor'): string => {
  const secret = getSecretToken();
  const timestamp = Date.now();
  const usernameB64 = Buffer.from(username, 'utf8').toString('base64url');
  const payload = `v1.${role}.${usernameB64}.${timestamp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
};

const verifySignedToken = (token: string): ActiveSession | null => {
  if (!token || isTokenRevoked(token)) return null;

  // New format: v1.<role>.<usernameB64>.<timestamp>.<sig64>
  if (token.startsWith('v1.')) {
    const parts = token.split('.');
    if (parts.length !== 5) return null;
    const [version, role, usernameB64, timestampStr, sig] = parts;
    if (version !== 'v1' || (role !== 'admin' && role !== 'editor')) return null;

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return null;

    // Max session lifetime: 30 days
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > MAX_AGE_MS) return null;

    const secret = getSecretToken();
    const payload = `v1.${role}.${usernameB64}.${timestampStr}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      try {
        const decodedUser = Buffer.from(usernameB64, 'base64url').toString('utf8');
        return { username: decodedUser, role: role as 'admin' | 'editor' };
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  // Legacy format fallback during migration: v1:role:user:timestamp:sig32
  if (token.startsWith('v1:')) {
    const parts = token.split(':');
    if (parts.length !== 5) return null;
    const [version, role, username, timestampStr, sig] = parts;
    if (version !== 'v1' || (role !== 'admin' && role !== 'editor')) return null;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return null;
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > MAX_AGE_MS) return null;

    const secret = getSecretToken();
    const payload = `v1:${role}:${username}:${timestampStr}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { username, role: role as 'admin' | 'editor' };
    }
  }

  return null;
};

// Middleware to verify editor or admin session
const requireEditorOrAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = (req.headers['x-session-token'] || req.headers['x-admin-token']) as string;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Thiếu mã phiên đăng nhập' });
  }

  if (isTokenRevoked(token)) {
    return res.status(401).json({ error: 'Unauthorized: Phiên đăng nhập đã kết thúc' });
  }

  // 1. In-memory session check
  const session = activeSessions.get(token);
  if (session && (session.role === 'admin' || session.role === 'editor')) {
    (req as any).user = session;
    return next();
  }

  // 2. Cryptographically signed token check (survives server reboots)
  const verified = verifySignedToken(token);
  if (verified) {
    activeSessions.set(token, verified);
    if (verified.role === 'admin') activeAdminSessions.add(token);
    (req as any).user = verified;
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: Bạn không có quyền truy cập chức năng này' });
};

// Middleware to protect administrative user routes
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = ((req.headers['x-admin-token'] || req.headers['x-session-token']) as string) || '';
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Thiếu token quản trị' });
  }

  if (isTokenRevoked(token)) {
    return res.status(401).json({ error: 'Unauthorized: Phiên đăng nhập đã kết thúc' });
  }

  // 1. In-memory session check
  const session = activeSessions.get(token);
  if (session && session.role === 'admin') {
    return next();
  }

  // 2. Cryptographically signed token check
  const verified = verifySignedToken(token);
  if (verified && verified.role === 'admin') {
    activeSessions.set(token, verified);
    activeAdminSessions.add(token);
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Phiên làm việc không có quyền quản trị' });
};

// Execute seedDefaultAdmin and syncRevokedTokens
seedDefaultAdmin();
syncRevokedTokens();

async function startServer() {
  const app = express();
  const PORT = process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Security Headers
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Default body limit for standard endpoints to prevent memory exhaustion
  app.use(express.json({ limit: '2mb' }));

  // Status endpoint for Pure Firebase Admin SDK
  app.get('/api/admin/firebase-status', (req, res) => {
    res.json({
      adminSdkActive: Boolean(adminDb),
      keyDetected: Boolean(process.env.FIREBASE_PRIVATE_KEY || process.env.firebase_private_key),
      error: adminInitError,
      projectId: 'alien-repeater-wn50x',
      databaseId: 'ai-studio-hthngwebgistmkim-aaf22399-a445-427d-9141-71aeb2891a9b',
      serverMode: '100% Pure Firebase Admin SDK',
    });
  });

  // Global Sync Registry endpoint (Client checks versions to sync selectively)
  app.get('/api/sync/versions', async (req, res) => {
    try {
      const registry = await getSyncRegistry();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({ success: true, versions: registry });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Lỗi đọc sync_registry' });
    }
  });

  // Bump sync version manually (usable by dev server scripts or admin actions)
  app.post('/api/sync/bump', requireEditorOrAdmin, async (req, res) => {
    try {
      const { type } = req.body || {};
      if (!type || !['features', 'raster', 'configs', 'aliases', 'communes'].includes(type)) {
        return res.status(400).json({ error: 'Loại dữ liệu không hợp lệ (features, raster, configs, aliases, communes)' });
      }
      await bumpSyncVersion(type as any);
      const updated = await getSyncRegistry();
      res.json({ success: true, updatedVersions: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Lỗi cập nhật phiên bản' });
    }
  });

  // ==========================================
  // OPENSTREETMAP SERVER PROXY & CACHE API
  // ==========================================
  const osmSearchCache = new Map<string, { timestamp: number; items: any[] }>();

  function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function classifyServerOsmItem(
    name: string,
    tags: Record<string, string> = {},
    osmKey?: string,
    osmValue?: string
  ): { group: 'hanh_chinh' | 'song_nui' | 'di_tich' | 'giao_thong'; kind: string; kindLabel: string } {
    const lowerName = name.toLowerCase();

    // 1. Nhóm Nghĩa trang & Di tích
    if (
      tags.landuse === 'cemetery' ||
      tags.amenity === 'grave_yard' ||
      (osmKey === 'landuse' && osmValue === 'cemetery') ||
      (osmKey === 'amenity' && osmValue === 'grave_yard') ||
      lowerName.includes('nghĩa trang') ||
      lowerName.includes('liệt sĩ') ||
      lowerName.includes('mộ')
    ) {
      return { group: 'di_tich', kind: 'cemetery', kindLabel: 'Nghĩa trang' };
    }

    if (
      tags.historic === 'battlefield' ||
      (osmKey === 'historic' && osmValue === 'battlefield') ||
      lowerName.includes('chiến trường') ||
      lowerName.includes('trận')
    ) {
      return { group: 'di_tich', kind: 'battlefield', kindLabel: 'Chiến trường' };
    }

    if (
      tags.historic === 'memorial' ||
      tags.historic === 'monument' ||
      osmKey === 'historic' ||
      lowerName.includes('tưởng niệm') ||
      lowerName.includes('đài tưởng niệm') ||
      lowerName.includes('di tích') ||
      lowerName.includes('chùa') ||
      lowerName.includes('đền') ||
      lowerName.includes('miếu')
    ) {
      return { group: 'di_tich', kind: 'memorial', kindLabel: 'Di tích/Tưởng niệm' };
    }

    // 2. Nhóm Sông núi & Thủy văn
    // 2.1. Hồ nước, đầm, bàu, hồ chứa nước
    if (
      tags.natural === 'water' ||
      tags.water === 'lake' ||
      tags.water === 'reservoir' ||
      tags.water === 'pond' ||
      tags.landuse === 'reservoir' ||
      (osmKey === 'natural' && osmValue === 'water') ||
      (osmKey === 'water' && (osmValue === 'lake' || osmValue === 'reservoir' || osmValue === 'pond')) ||
      (osmKey === 'landuse' && osmValue === 'reservoir') ||
      lowerName.startsWith('hồ ') ||
      lowerName.includes('hồ chứa nước') ||
      lowerName.startsWith('đầm ') ||
      lowerName.startsWith('bàu ') ||
      lowerName.startsWith('vực ')
    ) {
      return { group: 'song_nui', kind: 'lake', kindLabel: 'Hồ nước' };
    }

    // 2.2. Sông
    if (
      tags.waterway === 'river' ||
      osmValue === 'river' ||
      (osmKey === 'waterway' && osmValue === 'river') ||
      lowerName.startsWith('sông ') ||
      lowerName.includes('sông ')
    ) {
      return { group: 'song_nui', kind: 'river', kindLabel: 'Sông' };
    }

    // 2.3. Suối, kênh, mương
    if (
      tags.waterway === 'stream' ||
      tags.waterway === 'canal' ||
      tags.waterway === 'drain' ||
      tags.waterway === 'ditch' ||
      osmValue === 'stream' ||
      osmValue === 'canal' ||
      lowerName.startsWith('suối ') ||
      lowerName.includes('suối ') ||
      lowerName.startsWith('kênh ') ||
      lowerName.startsWith('mương ')
    ) {
      return { group: 'song_nui', kind: 'stream', kindLabel: 'Suối' };
    }

    // 2.4. Đỉnh núi, đồi, địa hình
    if (
      tags.natural === 'peak' ||
      osmValue === 'peak' ||
      lowerName.startsWith('núi ') ||
      lowerName.includes('đỉnh ') ||
      lowerName.includes('cao điểm')
    ) {
      return { group: 'song_nui', kind: 'peak', kindLabel: 'Đỉnh núi' };
    }

    if (
      tags.natural === 'hill' ||
      osmValue === 'hill' ||
      lowerName.startsWith('đồi ')
    ) {
      return { group: 'song_nui', kind: 'hill', kindLabel: 'Đồi' };
    }

    if (
      tags.natural === 'ridge' ||
      tags.natural === 'valley' ||
      osmValue === 'ridge' ||
      osmValue === 'valley' ||
      lowerName.includes('dãy núi') ||
      lowerName.includes('thung lũng')
    ) {
      return { group: 'song_nui', kind: 'ridge', kindLabel: 'Dãy núi/Thung lũng' };
    }

    // 3. Nhóm Giao thông & Đường sá
    if (
      osmKey === 'highway' ||
      tags.highway ||
      osmKey === 'bridge' ||
      tags.bridge ||
      osmValue === 'bridge' ||
      lowerName.startsWith('đường ') ||
      lowerName.startsWith('phố ') ||
      lowerName.startsWith('quốc lộ ') ||
      lowerName.startsWith('ql ') ||
      lowerName.startsWith('tỉnh lộ ') ||
      lowerName.startsWith('đt ') ||
      lowerName.startsWith('đại lộ ') ||
      lowerName.startsWith('cầu ') ||
      lowerName.startsWith('ngõ ') ||
      lowerName.startsWith('kiệt ') ||
      lowerName.startsWith('hẻm ') ||
      lowerName.startsWith('hầm ')
    ) {
      if (lowerName.startsWith('cầu ') || tags.bridge || osmValue === 'bridge') {
        return { group: 'giao_thong', kind: 'bridge', kindLabel: 'Cầu' };
      }
      if (
        osmValue === 'motorway' ||
        osmValue === 'trunk' ||
        tags.highway === 'motorway' ||
        tags.highway === 'trunk' ||
        lowerName.startsWith('quốc lộ ') ||
        lowerName.startsWith('ql ') ||
        lowerName.startsWith('cao tốc ')
      ) {
        return { group: 'giao_thong', kind: 'trunk', kindLabel: 'Quốc lộ/Cao tốc' };
      }
      if (
        osmValue === 'primary' ||
        osmValue === 'secondary' ||
        tags.highway === 'primary' ||
        tags.highway === 'secondary' ||
        lowerName.startsWith('tỉnh lộ ') ||
        lowerName.startsWith('đt ')
      ) {
        return { group: 'giao_thong', kind: 'primary', kindLabel: 'Tỉnh lộ/Đường chính' };
      }
      if (
        lowerName.startsWith('kiệt ') ||
        lowerName.startsWith('ngõ ') ||
        lowerName.startsWith('hẻm ')
      ) {
        return { group: 'giao_thong', kind: 'alley', kindLabel: 'Ngõ/Kiệt' };
      }
      return { group: 'giao_thong', kind: 'street', kindLabel: 'Đường phố' };
    }

    // 4. Nhóm Hành chính & Dân cư
    if (
      tags.place === 'hamlet' ||
      osmValue === 'hamlet' ||
      lowerName.startsWith('thôn ') ||
      lowerName.startsWith('bản ') ||
      lowerName.startsWith('ấp ')
    ) {
      return { group: 'hanh_chinh', kind: 'hamlet', kindLabel: 'Thôn/Bản' };
    }

    if (
      tags.place === 'village' ||
      osmValue === 'village' ||
      lowerName.startsWith('xã ') ||
      lowerName.startsWith('làng ')
    ) {
      return { group: 'hanh_chinh', kind: 'village', kindLabel: 'Làng/Xã' };
    }

    if (
      tags.place === 'town' ||
      osmValue === 'town' ||
      lowerName.startsWith('thị trấn ')
    ) {
      return { group: 'hanh_chinh', kind: 'town', kindLabel: 'Thị trấn' };
    }

    if (
      tags.place === 'suburb' ||
      osmValue === 'suburb' ||
      lowerName.startsWith('phường ') ||
      lowerName.startsWith('khu phố ')
    ) {
      return { group: 'hanh_chinh', kind: 'suburb', kindLabel: 'Phường/Khu' };
    }

    return { group: 'hanh_chinh', kind: 'locality', kindLabel: 'Địa danh' };
  }

  app.post('/api/osm/search', async (req, res) => {
    try {
      const { bounds, keyword } = req.body || {};
      if (!bounds) {
        return res.status(400).json({ error: 'bounds is required' });
      }

      const south = Number(bounds.south);
      const west = Number(bounds.west);
      const north = Number(bounds.north);
      const east = Number(bounds.east);

      if (isNaN(south) || isNaN(west) || isNaN(north) || isNaN(east)) {
        return res.status(400).json({ error: 'invalid bounds' });
      }

      const trimmedKeyword = keyword ? String(keyword).trim() : '';
      // Nếu từ khóa rỗng thì không truy vấn OSM, trả về mảng rỗng để bảo vệ tài nguyên
      if (!trimmedKeyword) {
        return res.json({ success: true, items: [] });
      }

      const cacheKey = `${south.toFixed(3)}_${west.toFixed(3)}_${north.toFixed(3)}_${east.toFixed(3)}_${trimmedKeyword.toLowerCase()}`;

      // Kiểm tra cache server (TTL 5 phút)
      const cached = osmSearchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) {
        return res.json({ success: true, items: cached.items, cached: true });
      }

      const items: any[] = [];
      const bboxStr = `${west},${south},${east},${north}`;

      if (trimmedKeyword) {
        const lowerKw = trimmedKeyword.toLowerCase();
        // Mode 1: Tìm kiếm theo từ khóa kết hợp Photon và Nominatim
        const photonFetches: Promise<any>[] = [
          fetch(
            `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&bbox=${bboxStr}&limit=50`,
            { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
          )
            .then((r) => r.json())
            .catch(() => ({ features: [] })),
        ];

        // Nếu từ khóa chứa 'hồ', 'đầm', 'nước': bổ sung truy vấn với thẻ thủy văn
        if (lowerKw.includes('hồ') || lowerKw.includes('đầm') || lowerKw.includes('bàu')) {
          photonFetches.push(
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&osm_tag=natural:water&bbox=${bboxStr}&limit=30`,
              { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
            )
              .then((r) => r.json())
              .catch(() => ({ features: [] })),
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&osm_tag=water&bbox=${bboxStr}&limit=30`,
              { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
            )
              .then((r) => r.json())
              .catch(() => ({ features: [] }))
          );
        }

        // Nếu từ khóa chứa 'sông', 'suối', 'kênh': bổ sung truy vấn với waterway
        if (lowerKw.includes('sông') || lowerKw.includes('suối') || lowerKw.includes('kênh')) {
          photonFetches.push(
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&osm_tag=waterway&bbox=${bboxStr}&limit=30`,
              { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
            )
              .then((r) => r.json())
              .catch(() => ({ features: [] }))
          );
        }

        // Nếu từ khóa chứa 'đường', 'phố', 'quốc lộ', 'ql', 'cầu', 'đại lộ', 'kiệt', 'ngõ', 'hẻm': bổ sung truy vấn với highway
        if (
          lowerKw.includes('đường') ||
          lowerKw.includes('phố') ||
          lowerKw.includes('quốc lộ') ||
          lowerKw.includes('ql') ||
          lowerKw.includes('cầu') ||
          lowerKw.includes('đại lộ') ||
          lowerKw.includes('kiệt') ||
          lowerKw.includes('ngõ') ||
          lowerKw.includes('hẻm')
        ) {
          photonFetches.push(
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedKeyword)}&osm_tag=highway&bbox=${bboxStr}&limit=35`,
              { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
            )
              .then((r) => r.json())
              .catch(() => ({ features: [] }))
          );
        }

        const nominatimPromise = fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmedKeyword)}&format=json&viewbox=${west},${north},${east},${south}&bounded=1&limit=40&addressdetails=1&extratags=1`,
          { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0 (contact: admin@webgis.vn)' } }
        )
          .then((r) => r.json())
          .catch(() => []);

        const [photonResults, nominatimData] = await Promise.all([
          Promise.all(photonFetches),
          nominatimPromise,
        ]);

        // Xử lý dữ liệu từ tất cả kết quả Photon
        for (const pData of photonResults) {
          for (const f of pData.features || []) {
            const p = f.properties || {};
            const geom = f.geometry || {};
            const name = p.name || p.street || p.locality || p.city;
            if (!name || !geom.coordinates || geom.coordinates.length < 2) continue;

            const lon = geom.coordinates[0];
            const lat = geom.coordinates[1];
            if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) continue;

            const { group, kind, kindLabel } = classifyServerOsmItem(name, {}, p.osm_key, p.osm_value);
            items.push({
              id: `photon/${p.osm_type || 'N'}/${p.osm_id || Math.random()}`,
              name: String(name).trim(),
              group,
              kind,
              kindLabel,
              lat: Number(lat.toFixed(6)),
              lon: Number(lon.toFixed(6)),
              ele: p.ele || p.extratags?.ele || undefined,
            });
          }
        }

        // Xử lý dữ liệu từ Nominatim
        if (Array.isArray(nominatimData)) {
          for (const n of nominatimData) {
            const name = n.name || (n.display_name ? n.display_name.split(',')[0] : '');
            const lat = parseFloat(n.lat);
            const lon = parseFloat(n.lon);
            if (!name || isNaN(lat) || isNaN(lon)) continue;

            const extra = n.extratags || {};
            const { group, kind, kindLabel } = classifyServerOsmItem(name, extra, n.class, n.type);
            items.push({
              id: `nominatim/${n.osm_type || 'node'}/${n.osm_id || Math.random()}`,
              name: String(name).trim(),
              group,
              kind,
              kindLabel,
              lat: Number(lat.toFixed(6)),
              lon: Number(lon.toFixed(6)),
              ele: extra.ele || undefined,
            });
          }
        }
      } else {
        // Mode 2: Ô tìm kiếm để trống => quét các danh mục địa danh trong khung nhìn
        const queryConfigs = [
          { q: 'xã', extra: '' },
          { q: 'thôn', extra: '' },
          { q: 'núi', extra: '' },
          { q: 'hồ', extra: '&osm_tag=natural:water' },
          { q: 'hồ', extra: '&osm_tag=water' },
          { q: 'sông', extra: '&osm_tag=waterway' },
          { q: 'suối', extra: '&osm_tag=waterway' },
          { q: 'đường', extra: '&osm_tag=highway' },
          { q: 'cầu', extra: '' },
          { q: 'nghĩa trang', extra: '' },
          { q: 'di tích', extra: '' },
        ];

        const photonPromises = queryConfigs.map((cfg) =>
          fetch(
            `https://photon.komoot.io/api/?q=${encodeURIComponent(cfg.q)}${cfg.extra}&bbox=${bboxStr}&limit=18`,
            { headers: { 'User-Agent': 'WebGIS-QK5-App/1.0' } }
          )
            .then((r) => r.json())
            .catch(() => ({ features: [] }))
        );

        const results = await Promise.all(photonPromises);
        for (const data of results) {
          for (const f of data.features || []) {
            const p = f.properties || {};
            const geom = f.geometry || {};
            const name = p.name || p.street || p.locality || p.city;
            if (!name || !geom.coordinates || geom.coordinates.length < 2) continue;

            const lon = geom.coordinates[0];
            const lat = geom.coordinates[1];
            if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) continue;

            if (lat < south - 0.005 || lat > north + 0.005 || lon < west - 0.005 || lon > east + 0.005) {
              continue;
            }

            const { group, kind, kindLabel } = classifyServerOsmItem(name, {}, p.osm_key, p.osm_value);
            items.push({
              id: `photon/${p.osm_type || 'N'}/${p.osm_id || Math.random()}`,
              name: String(name).trim(),
              group,
              kind,
              kindLabel,
              lat: Number(lat.toFixed(6)),
              lon: Number(lon.toFixed(6)),
              ele: p.ele || p.extratags?.ele || undefined,
            });
          }
        }
      }

      // Khử trùng lặp (< 50m và cùng tên)
      const deduped: any[] = [];
      for (const item of items) {
        const exists = deduped.some((existing) => {
          if (existing.name.toLowerCase() !== item.name.toLowerCase()) return false;
          const dist = calculateDistanceMeters(existing.lat, existing.lon, item.lat, item.lon);
          return dist < 50;
        });
        if (!exists) {
          deduped.push(item);
        }
      }

      // Giới hạn kích thước cache bộ nhớ
      if (osmSearchCache.size > 150) {
        const firstKey = osmSearchCache.keys().next().value;
        if (firstKey) osmSearchCache.delete(firstKey);
      }
      osmSearchCache.set(cacheKey, { timestamp: Date.now(), items: deduped });

      return res.json({ success: true, items: deduped });
    } catch (err: any) {
      console.error('Lỗi khi truy vấn OSM trên Server:', err);
      return res.status(500).json({ error: err.message || 'Lỗi khi xử lý truy vấn OpenStreetMap' });
    }
  });

  // ==========================================
  // GITHUB RELEASE BATTLE DOSSIER (HỒ SƠ TRẬN ĐÁNH) APIS
  // ==========================================
  const GITHUB_REPO_OWNER = 'thinhdaihiep';
  const GITHUB_REPO_NAME = 'Web-gis-Quy-tap';
  const GITHUB_RELEASE_TAG = 'TranDanh';

  const getEffectiveGitHubToken = () => {
    return (
      process.env.GitHub_Access ||
      process.env.GITHUB_ACCESS ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      ''
    ).trim();
  };

  // Helper to get or create GitHub release by tag
  async function getOrCreateGitHubRelease(token: string) {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'WebGIS-App/1.0',
    };

    // 1. Try to get release
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/tags/${GITHUB_RELEASE_TAG}`,
      { headers }
    );

    if (getRes.ok) {
      return await getRes.json();
    }

    // 2. If 404, create the release
    if (getRes.status === 404) {
      const createRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`,
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tag_name: GITHUB_RELEASE_TAG,
            name: 'Hồ sơ tài liệu các trận đánh lịch sử',
            body: 'Kho lưu trữ tài liệu hồ sơ trận đánh (PDF) tự động tải lên từ hệ thống WebGIS.',
            draft: false,
            prerelease: false,
          }),
        }
      );

      if (createRes.ok) {
        return await createRes.json();
      }
      const errText = await createRes.text();
      throw new Error(`Không thể khởi tạo Server lưu trữ: ${createRes.status} ${errText}`);
    }

    const errText = await getRes.text();
    throw new Error(`Không thể truy cập Server lưu trữ: ${getRes.status} ${errText}`);
  }

  // Upload battle dossier PDF to Server
  app.post('/api/battles/upload-hoso', express.json({ limit: '50mb' }), requireEditorOrAdmin, async (req, res) => {
    try {
      const token = getEffectiveGitHubToken();
      if (!token) {
        return res.status(500).json({
          error: 'Chưa cấu hình khóa truy cập Server trong biến môi trường / Secrets.',
        });
      }

      const { fileName, fileBase64, objectId, battleName, oldFileUrl } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: 'Thiếu nội dung file base64' });
      }

      // Convert base64 to Buffer
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

      // Validate PDF Magic bytes: must start with %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
      if (fileBuffer.length < 5 || fileBuffer.toString('utf8', 0, 5) !== '%PDF-') {
        return res.status(400).json({ error: 'Tệp tải lên không phải là định dạng PDF hợp lệ (thiếu tiêu đề %PDF-).' });
      }

      // Format standard filename: [OBJECTID].[tên file upload]
      let uploadedName = (fileName || 'hoso.pdf')
        .replace(/[\\/:*?"<>|#]/g, '_')
        .trim();

      if (!uploadedName.toLowerCase().endsWith('.pdf')) {
        uploadedName += '.pdf';
      }

      let targetFileName = uploadedName;
      if (objectId !== undefined && objectId !== null && String(objectId).trim() !== '') {
        const prefix = `${objectId}.`;
        if (uploadedName.startsWith(prefix)) {
          targetFileName = uploadedName;
        } else {
          targetFileName = `${prefix}${uploadedName}`;
        }
      }

      // 1. Get or create release
      const release = await getOrCreateGitHubRelease(token);
      const releaseId = release.id;
      const uploadUrlTemplate = release.upload_url; // e.g. "https://uploads.github.com/repos/.../assets{?name,label}"
      const uploadBaseUrl = uploadUrlTemplate.replace(/\{.*?\}$/, '');

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'WebGIS-App/1.0',
      };

      // 2. Identify and delete all old asset(s) belonging to this battle to ensure complete overwrite:
      // - Match targetFileName exactly
      // - Match filename extracted from oldFileUrl (if provided)
      // - Match any asset starting with `${objectId}.` (e.g. previous accented or renamed battle file)
      if (Array.isArray(release.assets)) {
        let oldTargetName = '';
        if (oldFileUrl && typeof oldFileUrl === 'string') {
          const parts = oldFileUrl.split('/');
          oldTargetName = decodeURIComponent(parts[parts.length - 1]).toLowerCase();
        }

        const objectIdPrefix =
          objectId !== undefined && objectId !== null ? `${objectId}.`.toLowerCase() : null;
        const targetLower = targetFileName.toLowerCase();

        const assetsToDelete = release.assets.filter((a: any) => {
          if (!a || !a.name) return false;
          const aName = a.name.toLowerCase();
          if (aName === targetLower) return true;
          if (oldTargetName && aName === oldTargetName) return true;
          if (objectIdPrefix && aName.startsWith(objectIdPrefix) && aName.endsWith('.pdf')) return true;
          return false;
        });

        for (const oldAsset of assetsToDelete) {
          if (oldAsset && oldAsset.id) {
            try {
              await fetch(
                `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/assets/${oldAsset.id}`,
                {
                  method: 'DELETE',
                  headers,
                }
              );
            } catch (delErr) {
              console.warn(`Lỗi khi xóa asset cũ (${oldAsset.name}) trước khi ghi đè:`, delErr);
            }
          }
        }
      }

      // 3. Upload new asset
      const uploadUrl = `${uploadBaseUrl}?name=${encodeURIComponent(targetFileName)}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'Content-Length': String(fileBuffer.length),
        },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return res.status(uploadRes.status).json({
          error: `Tải file lên Server thất bại: ${uploadRes.status} ${errText}`,
        });
      }

      const assetData = await uploadRes.json();
      const directDownloadUrl =
        assetData.browser_download_url ||
        `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/download/${GITHUB_RELEASE_TAG}/${encodeURIComponent(targetFileName)}`;

      res.json({
        success: true,
        fileName: targetFileName,
        url: directDownloadUrl,
        assetId: assetData.id,
      });
    } catch (err: any) {
      console.error('[API POST /api/battles/upload-hoso] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi khi upload hồ sơ trận đánh lên Server' });
    }
  });

  // Delete battle dossier PDF from GitHub Release
  app.post('/api/battles/delete-hoso', requireEditorOrAdmin, async (req, res) => {
    try {
      const token = getEffectiveGitHubToken();
      const { fileUrl, fileName, objectId } = req.body;

      if (!fileUrl && !fileName && objectId === undefined) {
        return res.status(400).json({ error: 'Thiếu thông tin URL, tên file hoặc objectId cần xóa' });
      }

      // If token not provided, simply acknowledge so client can clear HoSo property
      if (!token) {
        return res.json({ success: true, message: 'Đã xóa liên kết hồ sơ trên hệ thống' });
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'WebGIS-App/1.0',
      };

      // Extract target file name
      let targetName = fileName;
      if (!targetName && fileUrl) {
        const parts = fileUrl.split('/');
        targetName = decodeURIComponent(parts[parts.length - 1]);
      }

      const releaseRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/tags/${GITHUB_RELEASE_TAG}`,
        { headers }
      );

      if (releaseRes.ok) {
        const release = await releaseRes.json();
        if (Array.isArray(release.assets)) {
          const targetLower = (targetName || '').toLowerCase();
          const objectIdPrefix =
            objectId !== undefined && objectId !== null ? `${objectId}.`.toLowerCase() : null;

          const matchedAssets = release.assets.filter((a: any) => {
            if (!a || !a.name) return false;
            const aName = a.name.toLowerCase();
            if (targetLower && aName === targetLower) return true;
            if (objectIdPrefix && aName.startsWith(objectIdPrefix) && aName.endsWith('.pdf')) return true;
            return false;
          });

          for (const matched of matchedAssets) {
            if (matched && matched.id) {
              await fetch(
                `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/assets/${matched.id}`,
                {
                  method: 'DELETE',
                  headers,
                }
              );
            }
          }
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/battles/delete-hoso] Error:', err);
      // Even if GitHub asset delete has error, allow user to clear the HoSo property
      res.json({ success: true, warning: err.message });
    }
  });

  // Helper to validate PDF proxy URLs and avoid SSRF attacks
  function isSafePdfUpstream(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      // Block loopback, link-local, and private IP ranges
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '169.254.169.254' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
      ) {
        return false;
      }
      // Only allow GitHub releases of the specific repo or verified GitHub / AWS release assets
      const isAllowedRepoRelease =
        (host === 'github.com' && parsed.pathname.startsWith(`/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`)) ||
        (host === 'api.github.com' && parsed.pathname.startsWith(`/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`));

      const isAllowedCdn =
        host === 'objects.githubusercontent.com' ||
        host === 'github-releases.githubusercontent.com' ||
        host.endsWith('.githubusercontent.com') ||
        host.endsWith('.amazonaws.com');

      if (isAllowedRepoRelease || isAllowedCdn) {
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  // Proxy endpoint to stream PDF for in-app viewer (prevents cross-origin download forcing)
  app.get('/api/battles/proxy-pdf', async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: 'Missing url query parameter' });
      }

      if (!isSafePdfUpstream(url)) {
        return res.status(403).json({ error: 'Forbidden: Địa chỉ PDF không hợp lệ hoặc không thuộc kho lưu trữ cho phép' });
      }

      const token = getEffectiveGitHubToken();
      let currentUrl = url;
      let hops = 0;
      let upstreamRes: Response | null = null;

      // Handle redirect chain (GitHub releases redirect to AWS S3/CDN)
      while (hops < 6) {
        if (!isSafePdfUpstream(currentUrl)) {
          return res.status(403).json({ error: 'Forbidden: Địa chỉ chuyển hướng không an toàn' });
        }

        const parsedUrl = new URL(currentUrl);
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebGIS/1.0',
        };

        // ONLY attach GitHub token to github.com / api.github.com, NEVER AWS S3 or third parties!
        if (token && (parsedUrl.hostname === 'github.com' || parsedUrl.hostname === 'api.github.com')) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response: Response = await fetch(currentUrl, {
          headers,
          redirect: 'manual',
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const loc = response.headers.get('location');
          if (loc) {
            currentUrl = new URL(loc, currentUrl).toString();
            hops++;
            continue;
          }
        }

        upstreamRes = response;
        break;
      }

      if (!upstreamRes || !upstreamRes.ok) {
        const status = upstreamRes ? upstreamRes.status : 502;
        return res.status(status).send(`Failed to fetch PDF upstream: ${upstreamRes?.statusText || 'Error'}`);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="hoso.pdf"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.removeHeader('X-Frame-Options');

      const arrayBuffer = await upstreamRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error('[API GET /api/battles/proxy-pdf] Error:', err);
      res.status(500).json({ error: err.message || 'Cannot stream PDF file' });
    }
  });

  // User Management APIs (100% Pure Firebase Admin SDK Access - Admin Only)
  app.get('/api/users', requireAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const snap = await adminDb.collection('users').get();
      const userList: any[] = [];
      const seenUsernames = new Set<string>();

      snap.docs.forEach((docSnap: any) => {
        const data = docSnap.data();
        const uname = (data.username || data.email || '').trim();
        const unameLower = uname.toLowerCase();
        if (unameLower && !seenUsernames.has(unameLower)) {
          seenUsernames.add(unameLower);
          userList.push({
            uid: docSnap.id,
            username: uname,
            email: data.email || '',
            displayName:
              unameLower === 'admin' && (data.displayName === 'Quản trị viên' || !data.displayName)
                ? 'Bản đồ qk5'
                : data.displayName || uname,
            photoURL: data.photoURL || '',
            role: data.role || 'editor',
            createdAt: data.createdAt || '',
          });
        }
      });

      if (!seenUsernames.has('admin')) {
        userList.unshift({
          uid: 'user_admin',
          username: 'admin',
          displayName: 'Bản đồ qk5',
          role: 'admin',
        });
      }

      res.json({ users: userList });
    } catch (err: any) {
      console.error('[API /api/users] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch users' });
    }
  });

  // Secure Server-side Login endpoint using bcrypt & Admin SDK with rate limiting and direct query
  app.post('/api/login', async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }

      // Rate limit check: max 5 failed attempts per IP, 15 min lockout
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      const now = Date.now();
      const rateInfo = loginRateLimiter.get(ip);
      if (rateInfo && rateInfo.lockedUntil > now) {
        const remainingMinutes = Math.ceil((rateInfo.lockedUntil - now) / 60000);
        return res.status(429).json({
          error: `Quá nhiều lần thử sai. Tài khoản tạm khóa, vui lòng thử lại sau ${remainingMinutes} phút.`,
        });
      }

      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      const cleanUser = String(username).trim().toLowerCase();
      const cleanPass = String(password).trim();

      // Direct document lookup first, followed by indexed limit(1) query (avoids reading entire collection)
      let docSnap: any = null;
      const directRef = adminDb.collection('users').doc(`user_${cleanUser}`);
      const directSnap = await directRef.get();
      if (directSnap.exists) {
        docSnap = directSnap;
      } else {
        const querySnap = await adminDb.collection('users').where('username', '==', cleanUser).limit(1).get();
        if (!querySnap.empty) {
          docSnap = querySnap.docs[0];
        }
      }

      if (docSnap && docSnap.exists) {
        const data = docSnap.data();
        const storedHash = String(data.password || '');
        let isValid = false;

        if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
          isValid = await bcrypt.compare(cleanPass, storedHash);
        }

        if (isValid) {
          // Reset rate limiter on successful login
          loginRateLimiter.delete(ip);

          const role = (data.role as 'admin' | 'editor') || 'editor';
          const token = createSignedToken(data.username || cleanUser, role);

          activeSessions.set(token, {
            username: data.username || cleanUser,
            role,
          });

          if (role === 'admin' || cleanUser === 'admin') {
            activeAdminSessions.add(token);
          }

          return res.json({
            success: true,
            user: {
              uid: docSnap.id,
              username: data.username || cleanUser,
              displayName: data.displayName || data.username || cleanUser,
              role,
              token,
            },
          });
        }
      }

      // Record failed attempt
      const attempts = (rateInfo?.count || 0) + 1;
      if (attempts >= 5) {
        loginRateLimiter.set(ip, { count: attempts, lockedUntil: now + 15 * 60 * 1000 });
      } else {
        loginRateLimiter.set(ip, { count: attempts, lockedUntil: 0 });
      }

      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
    } catch (err: any) {
      console.error('[API /api/login] Error:', err);
      res.status(500).json({ error: err.message || 'Login failed' });
    }
  });

  // Logout endpoint to revoke dynamic session token
  app.post('/api/logout', async (req, res) => {
    const token = (req.headers['x-session-token'] || req.headers['x-admin-token']) as string;
    if (token) {
      await revokeToken(token);
    }
    res.json({ success: true });
  });

  // Create user (protected by requireAdmin, passwords hashed with bcrypt, via Admin SDK)
  app.post('/api/users', requireAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { username, password, displayName, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      const cleanUser = String(username).trim().toLowerCase();
      const docId = `user_${cleanUser}`;
      const hashedPassword = await bcrypt.hash(String(password).trim(), 10);

      const newUserDoc = {
        username: cleanUser,
        password: hashedPassword,
        displayName: displayName ? String(displayName).trim() : cleanUser,
        role: role || 'editor',
        createdAt: new Date().toISOString(),
      };
      await adminDb.collection('users').doc(docId).set(newUserDoc);
      res.json({
        success: true,
        user: {
          uid: docId,
          username: cleanUser,
          displayName: newUserDoc.displayName,
          role: newUserDoc.role,
          createdAt: newUserDoc.createdAt,
        },
      });
    } catch (err: any) {
      console.error('[API POST /api/users] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to add user' });
    }
  });

  // Update user role (protected by requireAdmin, via Admin SDK)
  app.patch('/api/users/:uid/role', requireAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { uid } = req.params;
      const { role } = req.body;
      if (!role) {
        return res.status(400).json({ error: 'Role is required' });
      }
      await adminDb.collection('users').doc(uid).update({ role });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API PATCH /api/users/:uid/role] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to update role' });
    }
  });

  // Reset user password (protected by requireAdmin, hashed with bcrypt, via Admin SDK)
  app.patch('/api/users/:uid/password', requireAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { uid } = req.params;
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }
      const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
      await adminDb.collection('users').doc(uid).update({ password: hashedPassword });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API PATCH /api/users/:uid/password] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to update password' });
    }
  });

  // Delete user (protected by requireAdmin, via Admin SDK)
  app.delete('/api/users/:uid', requireAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { uid } = req.params;
      if (uid === 'admin_static' || uid === 'user_admin') {
        return res.status(400).json({ error: 'Cannot delete default admin user' });
      }
      await adminDb.collection('users').doc(uid).delete();
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API DELETE /api/users/:uid] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete user' });
    }
  });

  // ==========================================
  // SERVER-SIDE FIRESTORE WRITE APIS (Admin SDK - Editor & Admin only)
  // ==========================================

  function cleanShapePropertiesServer(props: Record<string, any> | undefined | null): Record<string, any> {
    if (!props || typeof props !== 'object') return {};
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(props)) {
      const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        norm === 'shapearea' ||
        norm === 'shapelength' ||
        norm === 'shapeleng' ||
        norm.startsWith('shapearea') ||
        norm.startsWith('shapelength') ||
        norm.startsWith('shapeleng')
      ) {
        continue;
      }
      cleaned[k] = v;
    }
    return cleaned;
  }

  function getServerFeatureUniqueKey(feat: any): string {
    if (!feat) return 'default_unknown';
    const layerId = feat.layerId || 'default';

    // 1. Check OBJECTID in properties
    let objId: any = null;
    const props = feat.properties;
    if (props && typeof props === 'object') {
      for (const k of Object.keys(props)) {
        const lower = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (lower === 'objectid' || lower === 'objectid1' || lower === 'objectid0' || lower === 'fid') {
          const val = props[k];
          if (val !== null && val !== undefined && String(val).trim() !== '') {
            objId = val;
            break;
          }
        }
      }
    }

    if (objId !== null && objId !== undefined) {
      return `${layerId}_objid_${String(objId).toLowerCase().trim()}`;
    }

    const idStr = feat.id !== undefined && feat.id !== null ? String(feat.id).toLowerCase().trim() : '';
    if (idStr !== '') {
      if (idStr.startsWith(String(layerId).toLowerCase() + '_')) {
        return idStr;
      }
      return `${layerId}_id_${idStr}`;
    }

    const codeStr = feat.code ? String(feat.code).toLowerCase().trim() : '';
    if (codeStr !== '') {
      return `${layerId}_code_${codeStr}`;
    }

    return `${layerId}_id_${String(feat.name || 'unknown').toLowerCase().trim()}`;
  }

  // Save/Update a single map feature via Admin SDK
  app.post('/api/features/save', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { feature } = req.body;
      if (!feature || !feature.id) {
        return res.status(400).json({ error: 'Missing feature or feature id' });
      }

      const rawCoords = feature.coordinates || feature.geometry?.coordinates || [];
      const coordsJsonStr = typeof rawCoords === 'string' ? rawCoords : JSON.stringify(rawCoords);

      const cleanedDoc: Record<string, any> = {
        id: String(feature.id),
        layerId: feature.layerId || 'layer1_tim_kiem',
        name: feature.name || '',
        type: feature.type || feature.geometry?.type || 'Point',
        coordinates: coordsJsonStr,
        properties: cleanShapePropertiesServer(feature.properties || {}),
        updatedAt: feature.updatedAt || new Date().toISOString(),
      };
      if (feature.code) cleanedDoc.code = feature.code;

      const docId = getServerFeatureUniqueKey(feature);
      await adminDb.collection('map_features').doc(docId).set(cleanedDoc, { merge: true });
      cachedFeaturesResponse = null;
      await bumpSyncVersion('features');
      res.json({ success: true, docId });
    } catch (err: any) {
      console.error('[API POST /api/features/save] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save feature' });
    }
  });

  // Delete a feature via Admin SDK
  app.post('/api/features/delete', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { id, layerId } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing feature id' });
      }

      await adminDb.collection('map_features').doc(String(id)).delete().catch(() => {});
      if (layerId && !String(id).startsWith(String(layerId) + '_')) {
        await adminDb.collection('map_features').doc(`${layerId}_id_${id}`).delete().catch(() => {});
        await adminDb.collection('map_features').doc(`${layerId}_objid_${id}`).delete().catch(() => {});
      }
      cachedFeaturesResponse = null;
      await bumpSyncVersion('features');
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/features/delete] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete feature' });
    }
  });

  // Batch save / layer chunks save via Admin SDK (with dedicated 50mb limit for shapefile layers)
  app.post('/api/features/batch', express.json({ limit: '50mb' }), requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { features, chunks } = req.body;

      if (Array.isArray(chunks) && chunks.length > 0) {
        const batch = adminDb.batch();
        for (const chunk of chunks) {
          if (chunk.id && chunk.payloadJson) {
            let sanitizedPayload = chunk.payloadJson;
            try {
              const list: any[] = JSON.parse(chunk.payloadJson);
              if (Array.isArray(list)) {
                const cleanedList = list.map((item) => ({
                  ...item,
                  properties: cleanShapePropertiesServer(item.properties || {}),
                }));
                sanitizedPayload = JSON.stringify(cleanedList);
              }
            } catch (_) {}

            const chunkRef = adminDb.collection('layer_chunks').doc(chunk.id);
            batch.set(chunkRef, {
              chunkIndex: chunk.chunkIndex,
              itemCount: chunk.itemCount,
              payloadJson: sanitizedPayload,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
        }
        await batch.commit();
        cachedFeaturesResponse = null;
        await bumpSyncVersion('features');
        return res.json({ success: true, count: features?.length || 0 });
      }

      if (Array.isArray(features)) {
        // Chunk into 500 documents per batch commit
        const CHUNK_SIZE = 500;
        for (let i = 0; i < features.length; i += CHUNK_SIZE) {
          const slice = features.slice(i, i + CHUNK_SIZE);
          const batch = adminDb.batch();
          for (const feat of slice) {
            if (feat && feat.id) {
              const docRef = adminDb.collection('map_features').doc(String(feat.id));
              const rawCoords = feat.coordinates || feat.geometry?.coordinates || [];
              const coordsJsonStr = typeof rawCoords === 'string' ? rawCoords : JSON.stringify(rawCoords);
              batch.set(
                docRef,
                {
                  id: String(feat.id),
                  layerId: feat.layerId || 'layer1_tim_kiem',
                  name: feat.name || '',
                  type: feat.type || feat.geometry?.type || 'Point',
                  coordinates: coordsJsonStr,
                  properties: cleanShapePropertiesServer(feat.properties || {}),
                  updatedAt: feat.updatedAt || new Date().toISOString(),
                },
                { merge: true }
              );
            }
          }
          await batch.commit();
        }
        cachedFeaturesResponse = null;
        await bumpSyncVersion('features');
        return res.json({ success: true, count: features.length });
      }

      res.status(400).json({ error: 'Invalid features or chunks array' });
    } catch (err: any) {
      console.error('[API POST /api/features/batch] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save batch' });
    }
  });

  // Server-side cache for map_features all
  let cachedFeaturesResponse: {
    payload: { features: any[] };
    etag: string;
    updatedAt: number;
  } | null = null;

  // GET all shared map features (layer_chunks and individual map_features merged) via Admin SDK
  app.get('/api/features/all', async (req, res) => {
    try {
      if (cachedFeaturesResponse) {
        const clientEtag = req.headers['if-none-match'];
        if (clientEtag && clientEtag === cachedFeaturesResponse.etag) {
          return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'public, no-cache');
        res.setHeader('ETag', cachedFeaturesResponse.etag);
        return res.json(cachedFeaturesResponse.payload);
      }

      if (!adminDb) return res.json({ features: [] });

      const itemsMap = new Map<string, any>();

      // 1. Read layer_chunks
      try {
        const chunksSnap = await adminDb.collection('layer_chunks').get();
        chunksSnap.docs.forEach((docSnap: any) => {
          const data = docSnap.data();
          if (data && data.payloadJson) {
            try {
              const list = JSON.parse(data.payloadJson);
              if (Array.isArray(list)) {
                list.forEach((item: any) => {
                  if (item) {
                    const uniqueKey = getServerFeatureUniqueKey(item);
                    itemsMap.set(uniqueKey, item);
                  }
                });
              }
            } catch (_) {}
          }
        });
      } catch (cErr) {
        console.warn('[API /api/features/all] Read layer_chunks warning:', cErr);
      }

      // 2. Read individual map_features (single edits override chunks)
      try {
        const indivSnap = await adminDb.collection('map_features').get();
        indivSnap.docs.forEach((docSnap: any) => {
          const data = docSnap.data();
          const featId = data.id || docSnap.id;
          let coords = data.coordinates;
          if (typeof coords === 'string') {
            try {
              coords = JSON.parse(coords);
            } catch (_) {
              coords = [];
            }
          }
          const item = {
            id: featId,
            layerId: data.layerId || 'layer1_tim_kiem',
            name: data.name || '',
            code: data.code || undefined,
            type: data.type || 'Point',
            coordinates: coords,
            properties: data.properties || {},
            updatedAt: data.updatedAt,
          };
          const uniqueKey = getServerFeatureUniqueKey(item);
          itemsMap.set(uniqueKey, item);
        });
      } catch (iErr) {
        console.warn('[API /api/features/all] Read map_features warning:', iErr);
      }

      const features = Array.from(itemsMap.values());
      const payload = { features };
      const etag = `W/"features-${features.length}-${crypto.createHash('md5').update(JSON.stringify(features)).digest('hex').slice(0, 16)}"`;
      cachedFeaturesResponse = { payload, etag, updatedAt: Date.now() };

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && clientEtag === etag) {
        return res.status(304).end();
      }

      res.setHeader('Cache-Control', 'public, no-cache');
      res.setHeader('ETag', etag);
      return res.json(payload);
    } catch (err: any) {
      console.error('[API GET /api/features/all] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to load features' });
    }
  });

  // GET single feature by ID via Admin SDK
  app.get('/api/features/:id', async (req, res) => {
    try {
      if (!adminDb) return res.status(404).json({ error: 'Database not initialized' });
      const { id } = req.params;
      const docSnap = await adminDb.collection('map_features').doc(String(id)).get();
      if (docSnap.exists) {
        const data = docSnap.data();
        let coords = data.coordinates;
        if (typeof coords === 'string') {
          try { coords = JSON.parse(coords); } catch (_) { coords = []; }
        }
        return res.json({
          id: data.id || docSnap.id,
          layerId: data.layerId || 'layer1_tim_kiem',
          name: data.name || '',
          code: data.code,
          type: data.type || 'Point',
          coordinates: coords,
          properties: data.properties || {},
          updatedAt: data.updatedAt,
        });
      }
      return res.status(404).json({ error: 'Feature not found' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Server in-memory cache for commune administrative boundaries chunks
  let cachedCommuneChunksResponse: {
    payload: { chunks: any[] };
    etag: string;
    updatedAt: number;
  } | null = null;

  // Commune Administrative Boundaries Batch Upload via Admin SDK (with dedicated 50mb limit)
  app.post('/api/communes/batch', express.json({ limit: '50mb' }), requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { chunks, meta, isLastBatch, clearExisting } = req.body;

      if (clearExisting) {
        try {
          const oldChunks = await adminDb.collection('commune_chunks').get();
          for (const d of oldChunks.docs) {
            await adminDb.collection('commune_chunks').doc(d.id).delete();
          }
        } catch (e) {
          console.warn('[API /api/communes/batch] Clear old chunks warning:', e);
        }
      }

      if (Array.isArray(chunks) && chunks.length > 0) {
        const batch = adminDb.batch();
        for (const chunk of chunks) {
          if (chunk.id && chunk.payloadJson) {
            const ref = adminDb.collection('commune_chunks').doc(chunk.id);
            batch.set(ref, {
              chunkIndex: chunk.chunkIndex,
              itemCount: chunk.itemCount,
              payloadJson: chunk.payloadJson,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
        }
        await batch.commit();
      }

      if (meta) {
        await adminDb.collection('commune_meta').doc('config').set({
          ...meta,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      // Invalidate server in-memory cache upon upload so fresh data will be read
      cachedCommuneChunksResponse = null;
      await bumpSyncVersion('communes');

      return res.json({ success: true, count: chunks?.length || 0 });
    } catch (err: any) {
      console.error('[API POST /api/communes/batch] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save commune chunks' });
    }
  });

  // Commune Public Metadata and Chunks via Admin SDK
  app.get('/api/communes/meta', async (req, res) => {
    try {
      if (!adminDb) return res.json({ totalFeatures: 0, totalChunks: 0 });
      const metaDoc = await adminDb.collection('commune_meta').doc('config').get();
      if (metaDoc.exists) {
        return res.json(metaDoc.data());
      }
      return res.json({ totalFeatures: 0, totalChunks: 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/communes/chunks', async (req, res) => {
    try {
      // 1. Return from server in-memory cache if available
      if (cachedCommuneChunksResponse) {
        const clientEtag = req.headers['if-none-match'];
        if (clientEtag && clientEtag === cachedCommuneChunksResponse.etag) {
          return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'public, no-cache');
        res.setHeader('ETag', cachedCommuneChunksResponse.etag);
        return res.json(cachedCommuneChunksResponse.payload);
      }

      if (!adminDb) return res.json({ chunks: [] });
      const snap = await adminDb.collection('commune_chunks').get();
      const chunks = snap.docs.map((d: any) => ({
        id: d.id,
        chunkIndex: d.data().chunkIndex,
        itemCount: d.data().itemCount,
        payloadJson: d.data().payloadJson,
        updatedAt: d.data().updatedAt,
      }));
      chunks.sort((a: any, b: any) => (a.chunkIndex || 0) - (b.chunkIndex || 0));

      const payload = { chunks };
      const etag = `W/"communes-${chunks.length}-${crypto.createHash('md5').update(JSON.stringify(chunks)).digest('hex').slice(0, 16)}"`;

      // Cache in server memory
      cachedCommuneChunksResponse = {
        payload,
        etag,
        updatedAt: Date.now(),
      };

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && clientEtag === etag) {
        return res.status(304).end();
      }

      res.setHeader('Cache-Control', 'public, no-cache');
      res.setHeader('ETag', etag);
      return res.json(payload);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Server in-memory caches for frequently read collections
  let cachedRasterLayersResponse: {
    payload: { layers: any[] };
    etag: string;
    updatedAt: number;
  } | null = null;

  let cachedLayerConfigsResponse: {
    payload: { layerNames: Record<string, string> | null };
    etag: string;
    updatedAt: number;
  } | null = null;

  let cachedAliasesResponse: {
    payload: { aliases: Record<string, string>; hiddenFields: Record<string, boolean> };
    etag: string;
    updatedAt: number;
  } | null = null;

  // GET cached raster layers (Read-through server RAM cache with ETag & 304 support via Admin SDK)
  app.get('/api/raster-layers', async (req, res) => {
    try {
      const isFresh = req.query.fresh === '1' || req.query.fresh === 'true';
      if (!isFresh && cachedRasterLayersResponse) {
        const clientEtag = req.headers['if-none-match'];
        if (clientEtag && clientEtag === cachedRasterLayersResponse.etag) {
          return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'public, no-cache');
        res.setHeader('ETag', cachedRasterLayersResponse.etag);
        return res.json(cachedRasterLayersResponse.payload);
      }

      if (!adminDb) return res.json({ layers: [] });
      const snap = await adminDb.collection('raster_layers').get();
      const layers: any[] = [];
      snap.docs.forEach((d: any) => {
        const data = d.data();
        let files = Array.isArray(data.files) ? data.files : [];
        if (files.length === 0 && data.url) {
          files = [{
            id: `${d.id}_file_0`,
            fileName: data.name || 'Raster File',
            url: data.url,
            format: data.format || 'COG',
            minZoom: data.minZoom || 12,
            maxZoom: data.maxZoom || 18,
            bounds: data.bounds || null,
            uploadedAt: data.createdAt || new Date().toISOString(),
          }];
        }
        layers.push({
          id: d.id,
          name: data.name || 'Bản đồ nền',
          type: data.type || 'COG',
          source: data.source || (data.githubReleaseUrl ? 'github' : data.storagePath ? 'firebase' : 'url'),
          storagePath: data.storagePath,
          githubReleaseUrl: data.githubReleaseUrl,
          bounds: data.bounds || null,
          files,
          opacity: data.opacity ?? 1.0,
          enabled: data.enabled !== false,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt,
        });
      });

      layers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const payload = { layers };
      const etag = `W/"raster-${layers.length}-${crypto.createHash('md5').update(JSON.stringify(layers)).digest('hex').slice(0, 16)}"`;
      cachedRasterLayersResponse = {
        payload,
        etag,
        updatedAt: Date.now(),
      };

      const clientEtag = req.headers['if-none-match'];
      if (!isFresh && clientEtag && clientEtag === etag) {
        return res.status(304).end();
      }

      res.setHeader('Cache-Control', 'public, no-cache');
      res.setHeader('ETag', etag);
      return res.json(payload);
    } catch (e: any) {
      console.warn('[API /api/raster-layers] Error:', e);
      return res.status(500).json({ error: e.message || 'Failed to load raster layers' });
    }
  });

  // GET cached layer configurations via Admin SDK
  app.get('/api/layers/configs', async (req, res) => {
    try {
      if (cachedLayerConfigsResponse) {
        const clientEtag = req.headers['if-none-match'];
        if (clientEtag && clientEtag === cachedLayerConfigsResponse.etag) {
          return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'public, no-cache');
        res.setHeader('ETag', cachedLayerConfigsResponse.etag);
        return res.json(cachedLayerConfigsResponse.payload);
      }

      if (!adminDb) return res.json({ layerNames: null });
      const docSnap = await adminDb.collection('app_settings').doc('layer_configs').get();
      const layerNames = docSnap.exists ? (docSnap.data()?.layerNames || null) : null;
      const payload = { layerNames };
      const etag = `W/"layer-configs-${crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex').slice(0, 16)}"`;
      cachedLayerConfigsResponse = { payload, etag, updatedAt: Date.now() };

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && clientEtag === etag) {
        return res.status(304).end();
      }

      res.setHeader('Cache-Control', 'public, no-cache');
      res.setHeader('ETag', etag);
      return res.json(payload);
    } catch (e: any) {
      console.warn('[API /api/layers/configs] Error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // GET cached field aliases via Admin SDK
  app.get('/api/aliases', async (req, res) => {
    try {
      if (cachedAliasesResponse) {
        const clientEtag = req.headers['if-none-match'];
        if (clientEtag && clientEtag === cachedAliasesResponse.etag) {
          return res.status(304).end();
        }
        res.setHeader('Cache-Control', 'public, no-cache');
        res.setHeader('ETag', cachedAliasesResponse.etag);
        return res.json(cachedAliasesResponse.payload);
      }

      if (!adminDb) return res.json({ aliases: {}, hiddenFields: {} });
      const docSnap = await adminDb.collection('app_settings').doc('field_aliases').get();
      const data = docSnap.exists ? docSnap.data() : null;
      const payload = {
        aliases: data?.aliases || {},
        hiddenFields: data?.hiddenFields || {},
      };
      const etag = `W/"aliases-${crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex').slice(0, 16)}"`;
      cachedAliasesResponse = { payload, etag, updatedAt: Date.now() };

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && clientEtag === etag) {
        return res.status(304).end();
      }

      res.setHeader('Cache-Control', 'public, no-cache');
      res.setHeader('ETag', etag);
      return res.json(payload);
    } catch (e: any) {
      console.warn('[API /api/aliases] Error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Invalidate server-side memory caches
  app.post('/api/cache/invalidate', requireEditorOrAdmin, async (req, res) => {
    try {
      const { target } = req.body || {};
      if (!target || target === 'all' || target === 'raster_layers') {
        cachedRasterLayersResponse = null;
      }
      if (!target || target === 'all' || target === 'features') {
        cachedFeaturesResponse = null;
      }
      if (!target || target === 'all' || target === 'layer_configs') {
        cachedLayerConfigsResponse = null;
      }
      if (!target || target === 'all' || target === 'field_aliases') {
        cachedAliasesResponse = null;
      }
      if (!target || target === 'all' || target === 'communes') {
        cachedCommuneChunksResponse = null;
      }
      return res.json({ success: true, target: target || 'all' });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Save layer configs (custom layer names) via Admin SDK
  app.post('/api/layers/save', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { layerNames } = req.body;
      if (!layerNames) {
        return res.status(400).json({ error: 'Missing layerNames' });
      }

      await adminDb.collection('app_settings').doc('layer_configs').set({
        layerNames,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      cachedLayerConfigsResponse = null;
      await bumpSyncVersion('configs');
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/layers/save] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save layer configs' });
    }
  });

  // Save field aliases via Admin SDK
  app.post('/api/aliases/save', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { aliases, hiddenFields } = req.body;
      await adminDb.collection('app_settings').doc('field_aliases').set({
        aliases: aliases || {},
        hiddenFields: hiddenFields || {},
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      cachedAliasesResponse = null;
      await bumpSyncVersion('aliases');
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/aliases/save] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save field aliases' });
    }
  });

  // Update raster layer enabled state via Admin SDK
  app.post('/api/raster-layers/update-enabled', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { layerId, enabled } = req.body;
      if (!layerId) {
        return res.status(400).json({ error: 'Missing layerId' });
      }

      await adminDb.collection('raster_layers').doc(layerId).update({
        enabled: enabled !== false,
        updatedAt: new Date().toISOString(),
      });
      cachedRasterLayersResponse = null;
      await bumpSyncVersion('raster');
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/raster-layers/update-enabled] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to update raster layer status' });
    }
  });

  // Clear server disk cache for specific raster URLs (Editor/Admin only)
  app.post('/api/raster-layers/clear-file-cache', requireEditorOrAdmin, async (req, res) => {
    try {
      const { urls } = req.body;
      let deletedCount = 0;
      if (Array.isArray(urls)) {
        for (const url of urls) {
          if (typeof url === 'string' && url.trim()) {
            const urlHash = crypto.createHash('sha256').update(url.trim()).digest('hex');
            const cachedFilePath = path.join(RASTER_CACHE_DIR, `${urlHash}.tif`);
            if (fs.existsSync(cachedFilePath)) {
              try {
                fs.unlinkSync(cachedFilePath);
                deletedCount++;
              } catch (_) {}
            }
          }
        }
      }
      cachedRasterLayersResponse = null;
      return res.json({ success: true, deletedCount });
    } catch (err: any) {
      console.warn('[API /api/raster-layers/clear-file-cache] Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to clear raster cache' });
    }
  });

  // Save / Update raster layer via Admin SDK
  app.post('/api/raster-layers/save', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { layer } = req.body;
      if (!layer) {
        return res.status(400).json({ error: 'Missing layer payload' });
      }

      const layerData: Record<string, any> = {
        name: layer.name || 'Bản đồ Raster',
        type: layer.type || 'COG',
        source: layer.source || 'github',
        storagePath: layer.storagePath || '',
        githubReleaseUrl: layer.githubReleaseUrl || '',
        files: Array.isArray(layer.files) ? layer.files : [],
        bounds: layer.bounds || null,
        opacity: layer.opacity ?? 1.0,
        enabled: layer.enabled !== false,
        updatedAt: new Date().toISOString(),
      };

      let layerId = layer.id;
      if (layerId) {
        await adminDb.collection('raster_layers').doc(String(layerId)).set(layerData, { merge: true });
      } else {
        layerData.createdAt = new Date().toISOString();
        const docRef = await adminDb.collection('raster_layers').add(layerData);
        layerId = docRef.id;
      }

      cachedRasterLayersResponse = null;
      await bumpSyncVersion('raster');
      res.json({ success: true, layerId });
    } catch (err: any) {
      console.error('[API POST /api/raster-layers/save] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save raster layer' });
    }
  });

  // Delete raster layer via Admin SDK
  app.post('/api/raster-layers/delete', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing raster layer id' });
      }

      await adminDb.collection('raster_layers').doc(String(id)).delete();
      cachedRasterLayersResponse = null;
      await bumpSyncVersion('raster');
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/raster-layers/delete] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete raster layer' });
    }
  });

  // Scan Firebase Storage folder for GeoTIFF files via Admin Storage SDK (Editor/Admin only)
  app.post('/api/storage/scan-firebase', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminApp) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }
      let rawPath = (req.body?.path || '').trim();
      if (rawPath.startsWith('gs://')) {
        rawPath = rawPath.replace(/^gs:\/\/[^/]+\/?/, '');
      } else if (rawPath.includes('firebasestorage.googleapis.com')) {
        const match = rawPath.match(/\/o\/([^?#]+)/);
        if (match) {
          rawPath = decodeURIComponent(match[1]);
        }
      }
      const cleanPath = rawPath.replace(/^\/+|\/+$/g, '');
      if (!cleanPath) {
        return res.status(400).json({ error: 'Vui lòng cung cấp đường dẫn thư mục' });
      }

      const bucket = getAdminStorage(adminApp).bucket('alien-repeater-wn50x.firebasestorage.app');
      const [allFiles] = await bucket.getFiles({ prefix: cleanPath });

      const rasterFiles = allFiles.filter((file: any) => {
        const n = file.name.toLowerCase();
        return n.endsWith('.tif') || n.endsWith('.tiff') || n.endsWith('.geotiff');
      });

      if (rasterFiles.length === 0) {
        return res.status(404).json({ error: `Không tìm thấy file GeoTIFF/COG (.tif, .tiff) trong "${cleanPath}".` });
      }

      const files = rasterFiles.map((file: any) => {
        const fileName = path.basename(file.name);
        const encodedName = encodeURIComponent(file.name);
        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedName}?alt=media`;
        return {
          fileName,
          url: downloadUrl,
          fileSize: Number(file.metadata?.size) || 0,
          updatedAt: file.metadata?.updated || new Date().toISOString(),
        };
      });

      res.json({ success: true, cleanPath, files });
    } catch (err: any) {
      console.error('[API POST /api/storage/scan-firebase] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi quét Firebase Storage' });
    }
  });

  // GET notifications (latest 50) via Admin SDK (Editor/Admin only)
  app.get('/api/notifications', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.json({ notifications: [] });
      const snap = await adminDb.collection('notifications').orderBy('createdAt', 'desc').limit(50).get();
      const notifications = snap.docs.map((docSnap: any) => {
        const data = docSnap.data();
        let createdAt = data.createdAt;
        if (createdAt && typeof createdAt.toDate === 'function') {
          createdAt = createdAt.toDate().toISOString();
        }
        return {
          id: docSnap.id,
          ...data,
          createdAt,
        };
      });
      res.json({ success: true, notifications });
    } catch (err: any) {
      console.error('[API GET /api/notifications] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi tải danh sách thông báo' });
    }
  });

  // GET unread notifications count via Admin SDK (Editor/Admin only)
  app.get('/api/notifications/unread-count', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.json({ count: 0 });
      const snap = await adminDb.collection('notifications').where('read', '==', false).get();
      res.json({ success: true, count: snap.size });
    } catch (err: any) {
      console.warn('[API GET /api/notifications/unread-count] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi đếm thông báo chưa đọc' });
    }
  });

  // Mark notification as read via Admin SDK (Editor/Admin only)
  app.post('/api/notifications/mark-read', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'Admin SDK not initialized' });
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing notification id' });
      await adminDb.collection('notifications').doc(String(id)).update({ read: true });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/notifications/mark-read] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi cập nhật thông báo' });
    }
  });

  // Delete notification via Admin SDK (Admin only)
  app.post('/api/notifications/delete', requireAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'Admin SDK not initialized' });
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing notification id' });
      await adminDb.collection('notifications').doc(String(id)).delete();
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/notifications/delete] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi xóa thông báo' });
    }
  });

  // Add notification via Admin SDK (Editor/Admin only)
  app.post('/api/notifications/add', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'Admin SDK not initialized' });
      const { message, type = 'info', title, objectId, layerId, feedbackId } = req.body;
      if (!message) return res.status(400).json({ error: 'Missing notification message' });

      const docData: Record<string, any> = {
        message,
        type,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      };
      if (title) docData.title = title;
      if (objectId !== undefined && objectId !== null) docData.objectId = objectId;
      if (layerId) docData.layerId = layerId;
      if (feedbackId) docData.feedbackId = feedbackId;

      const docRef = await adminDb.collection('notifications').add(docData);
      res.json({ success: true, id: docRef.id });
    } catch (err: any) {
      console.error('[API POST /api/notifications/add] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi thêm thông báo' });
    }
  });

  function sanitizeInputText(str: any, maxLen: number = 1000): string {
    if (typeof str !== 'string') return '';
    return str
      .slice(0, maxLen)
      .replace(/[<>]/g, '')
      .trim();
  }

  function maskPhoneNumber(phone?: string): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    if (trimmed.length <= 4) return '***';
    if (trimmed.length <= 7) return trimmed.slice(0, 2) + '***' + trimmed.slice(-2);
    return trimmed.slice(0, 3) + '****' + trimmed.slice(-3);
  }

  // Create user feedback via Admin SDK (and notify admins/editors) - Publicly accessible for guest feedback
  app.post('/api/feedback', async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'Admin SDK not initialized' });

      // Rate limiting: max 5 feedback submissions per 60 seconds per IP
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      const nowTs = Date.now();
      const clientRate = feedbackRateLimiter.get(ip);
      if (clientRate && clientRate.resetAt > nowTs) {
        if (clientRate.count >= 5) {
          return res.status(429).json({ error: 'Bạn gửi góp ý quá nhanh. Vui lòng thử lại sau 1 phút.' });
        }
        clientRate.count++;
      } else {
        feedbackRateLimiter.set(ip, { count: 1, resetAt: nowTs + 60000 });
      }

      const { OBJECTID, Lop, TenLop, TenDoiTuong, Ten, DienThoai, NoiDung } = req.body;
      if (!OBJECTID || !Lop || !NoiDung) {
        return res.status(400).json({ error: 'Thiếu dữ liệu góp ý cần thiết' });
      }

      const cleanObjectId = sanitizeInputText(String(OBJECTID || ''), 100);
      const cleanLop = sanitizeInputText(String(Lop || ''), 100);
      const cleanTenLop = sanitizeInputText(String(TenLop || ''), 150);
      const cleanTenDoiTuong = sanitizeInputText(String(TenDoiTuong || ''), 200);
      const cleanTen = sanitizeInputText(String(Ten || ''), 100);
      const cleanDienThoai = sanitizeInputText(String(DienThoai || ''), 30);
      const cleanNoiDung = sanitizeInputText(String(NoiDung || ''), 2000);

      const now = new Date();
      const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

      const feedbackData = {
        OBJECTID: cleanObjectId,
        Lop: cleanLop,
        TenLop: cleanTenLop,
        TenDoiTuong: cleanTenDoiTuong,
        Ten: cleanTen,
        DienThoai: cleanDienThoai,
        NoiDung: cleanNoiDung,
        ThoiGian: timeFormatted,
        TrangThai: 'moi',
        createdAt: FieldValue.serverTimestamp(),
      };

      const docRef = await adminDb.collection('PhanAnh').add(feedbackData);

      // Add notification automatically
      try {
        await adminDb.collection('notifications').add({
          message: `[${cleanTen || 'Người dùng'}] góp ý trên "${cleanTenDoiTuong || 'Đối tượng'}" (${cleanTenLop || cleanLop})`,
          type: 'feedback',
          title: 'Góp ý mới',
          objectId: cleanObjectId,
          layerId: cleanLop,
          feedbackId: docRef.id,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (nErr) {
        console.warn('Could not create notification for feedback:', nErr);
      }

      res.json({ success: true, id: docRef.id });
    } catch (err: any) {
      console.error('[API POST /api/feedback] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi gửi góp ý' });
    }
  });

  // GET feedback list via Admin SDK:
  // - Public when filtered by objectId (view feedback for a map feature; masks phone number)
  // - Restricted to Editor/Admin when listing all feedback (full details)
  app.get('/api/feedback', async (req, res) => {
    try {
      if (!adminDb) return res.json({ items: [] });
      const { objectId, layerId } = req.query;
      if (!layerId) return res.json({ items: [] });

      const targetObjId = objectId !== undefined && objectId !== null ? String(objectId).toLowerCase().trim() : null;

      const token = (req.headers['x-session-token'] || req.headers['x-admin-token']) as string;
      const session = token ? (activeSessions.get(token) || verifySignedToken(token)) : null;
      const isPrivileged = Boolean(session && (session.role === 'admin' || session.role === 'editor'));

      // Full feedback list requires Editor or Admin session
      if (!targetObjId && !isPrivileged) {
        return res.status(403).json({ error: 'Forbidden: Bạn cần quyền Quản trị hoặc Biên tập để xem toàn bộ góp ý' });
      }

      const snap = await adminDb.collection('PhanAnh').where('Lop', '==', String(layerId)).get();
      const items: any[] = [];

      snap.docs.forEach((docSnap: any) => {
        const d = docSnap.data();
        if (targetObjId && String(d.OBJECTID).toLowerCase().trim() !== targetObjId) {
          return;
        }
        let createdAt = d.createdAt;
        let createdAtMillis = 0;
        if (createdAt && typeof createdAt.toMillis === 'function') {
          createdAtMillis = createdAt.toMillis();
          createdAt = createdAt.toDate().toISOString();
        } else if (createdAt && typeof createdAt.toDate === 'function') {
          createdAtMillis = createdAt.toDate().getTime();
          createdAt = createdAt.toDate().toISOString();
        }

        const rawPhone = String(d.DienThoai || '').trim();
        const displayPhone = isPrivileged ? rawPhone : maskPhoneNumber(rawPhone);

        items.push({
          id: docSnap.id,
          OBJECTID: d.OBJECTID,
          Lop: d.Lop,
          TenLop: d.TenLop || '',
          TenDoiTuong: d.TenDoiTuong || '',
          Ten: d.Ten || '',
          DienThoai: displayPhone,
          NoiDung: d.NoiDung || '',
          ThoiGian: d.ThoiGian || '',
          TrangThai: d.TrangThai || 'moi',
          createdAt,
          createdAtMillis,
        });
      });

      items.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
      res.json({ success: true, items });
    } catch (err: any) {
      console.error('[API GET /api/feedback] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi tải danh sách góp ý' });
    }
  });


  // Update feedback status via Admin SDK
  app.post('/api/feedback/update-status', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'Admin SDK not initialized' });
      const { feedbackId, status } = req.body;
      if (!feedbackId || !status) return res.status(400).json({ error: 'Thiếu thông tin cập nhật' });

      await adminDb.collection('PhanAnh').doc(String(feedbackId)).update({ TrangThai: status });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/feedback/update-status] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi cập nhật trạng thái góp ý' });
    }
  });

  // Delete feedback via Admin SDK
  app.post('/api/feedback/delete', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'Admin SDK not initialized' });
      const { feedbackId } = req.body;
      if (!feedbackId) return res.status(400).json({ error: 'Thiếu ID góp ý' });

      await adminDb.collection('PhanAnh').doc(String(feedbackId)).delete();
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/feedback/delete] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi xóa góp ý' });
    }
  });

  // API endpoint to parse COG Header directly in milliseconds via HTTP Range Request
  app.get('/api/cog-bounds', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      const urlHash = crypto.createHash('sha256').update(targetUrl).digest('hex');
      const cachedFilePath = path.join(RASTER_CACHE_DIR, `${urlHash}.tif`);

      let tiff: any = null;

      // 1. Fast path: check local disk cache first
      if (fs.existsSync(cachedFilePath)) {
        try {
          const buf = fs.readFileSync(cachedFilePath);
          tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        } catch (readErr) {
          console.warn('Could not read from cached raster file:', readErr);
        }
      }

      // 2. Network path if not cached
      if (!tiff) {
        let effectiveUrl = targetUrl;
        const boundsHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebGIS-COG-Reader/1.0',
        };

        let cur = targetUrl;
        let hops = 0;
        while (hops < 6) {
          try {
            const headRes = await fetch(cur, {
              method: 'HEAD',
              redirect: 'manual',
              headers: boundsHeaders,
            });
            if ([301, 302, 303, 307, 308].includes(headRes.status)) {
              const loc = headRes.headers.get('location');
              if (loc) {
                cur = new URL(loc, cur).toString();
                effectiveUrl = cur;
                hops++;
                continue;
              }
            }
          } catch (_) {
            break;
          }
          break;
        }

        try {
          tiff = await fromUrl(effectiveUrl);
        } catch (fromUrlErr) {
          const rangeHeaders: Record<string, string> = {
            Range: 'bytes=0-131071',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebGIS-COG-Reader/1.0',
          };
          const rangeRes = await fetch(effectiveUrl, {
            headers: rangeHeaders,
          });
          if (rangeRes.ok || rangeRes.status === 206) {
            const buf = await rangeRes.arrayBuffer();
            if (buf.byteLength >= 4) {
              const view = new DataView(buf);
              const m = view.getUint16(0);
              if (m === 0x4949 || m === 0x4d4d) {
                tiff = await fromArrayBuffer(buf);
              } else {
                throw new Error('Not a valid TIFF format');
              }
            } else {
              throw new Error('Buffer too small for TIFF');
            }
          } else {
            const status = rangeRes.status;
            if (status === 404) {
              throw new Error('HTTP 404: Tệp raster không tồn tại (404)');
            } else if (status === 401 || status === 403) {
              throw new Error(`HTTP ${status}: Liên kết tải đã hết hạn hoặc không có quyền truy cập`);
            }
            throw fromUrlErr || new Error(`HTTP ${status}: ${rangeRes.statusText}`);
          }
        }
      }

      const image = await tiff.getImage(0);
      const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
      const width = image.getWidth();
      const height = image.getHeight();
      const geoKeys = image.getGeoKeys ? image.getGeoKeys() : {};

      const [minX, minY, maxX, maxY] = bbox;
      let epsg = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey;
      const bounds = convertBBox(minX, minY, maxX, maxY, epsg);

      return res.json({
        success: true,
        bounds,
        rawBbox: bbox,
        width,
        height,
        epsg: epsg || 4326,
        geoKeys
      });
    } catch (err: any) {
      const errMsg = err?.message || '';
      const is404 = errMsg.includes('404') || err?.status === 404;
      const isExpiredOrAuth = errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('hết hạn') || errMsg.includes('expired');
      const statusCode = is404 ? 404 : isExpiredOrAuth ? 410 : 500;
      
      return res.status(statusCode).json({
        success: false,
        status: statusCode,
        error: is404
          ? 'Tệp raster không tồn tại (404)'
          : isExpiredOrAuth
          ? 'Liên kết tải đã hết hạn, vui lòng nhấn Tải lại danh sách từ GitHub Release'
          : errMsg || 'Không thể trích xuất Header COG'
      });
    }
  });

  // OPTIONS and CORS for proxy-raster
  app.options('/api/proxy-raster', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type, X-Raster-Cache');
    res.setHeader('Accept-Ranges', 'bytes');
    return res.sendStatus(200);
  });

  // API route for proxying raster / GeoTIFF / COG with Range support, Server Disk Cache & CORS
  app.get('/api/proxy-raster', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type, X-Raster-Cache');
    res.setHeader('Accept-Ranges', 'bytes');

    const abortController = new AbortController();
    const onClose = () => {
      abortController.abort();
    };
    req.on('close', onClose);

    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      const urlHash = crypto.createHash('sha256').update(targetUrl).digest('hex');
      const cachedFilePath = path.join(RASTER_CACHE_DIR, `${urlHash}.tif`);

      // 1. FAST PATH: Serve directly from server disk cache if available
      if (fs.existsSync(cachedFilePath)) {
        try {
          const stats = fs.statSync(cachedFilePath);
          if (stats.size > 0) {
            const total = stats.size;
            res.setHeader('Content-Type', 'image/tiff');
            res.setHeader('X-Raster-Cache', 'HIT');

            if (req.method === 'HEAD') {
              res.setHeader('Content-Length', total);
              return res.status(200).end();
            }

            if (req.headers.range) {
              const range = req.headers.range;
              const parts = range.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

              if (isNaN(start) || start >= total || end >= total || start > end) {
                res.setHeader('Content-Range', `bytes */${total}`);
                return res.status(416).end();
              }

              const chunkSize = end - start + 1;
              res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
              res.setHeader('Content-Length', chunkSize);
              res.status(206);
              return fs.createReadStream(cachedFilePath, { start, end }).pipe(res);
            } else {
              res.setHeader('Content-Length', total);
              res.status(200);
              return fs.createReadStream(cachedFilePath).pipe(res);
            }
          }
        } catch (cacheErr) {
          console.warn('Cache read error, falling back to upstream:', cacheErr);
        }
      }

      // 2. UPSTREAM PATH: Fetch from GitHub / S3
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebGIS-Raster-Proxy/1.0',
        Accept: '*/*',
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      let currentUrl = targetUrl;
      let hops = 0;
      let upstreamRes: any = null;

      while (hops < 6) {
        // ALWAYS strip Authorization for all hosts to prevent S3 conflicts and maintain public access
        delete headers['Authorization'];

        upstreamRes = await fetch(currentUrl, {
          method: req.method === 'HEAD' ? 'HEAD' : 'GET',
          headers,
          redirect: 'manual',
          signal: abortController.signal,
        });

        if ([301, 302, 303, 307, 308].includes(upstreamRes.status)) {
          const loc = upstreamRes.headers.get('location');
          if (upstreamRes.body) {
            try {
              await upstreamRes.body.cancel();
            } catch (_) {}
          }
          if (!loc) break;
          currentUrl = new URL(loc, currentUrl).toString();
          hops++;
          continue;
        }
        break;
      }

      if (!upstreamRes) {
        throw new Error('No response from upstream raster URL');
      }

      if (req.destroyed || abortController.signal.aborted) {
        if (upstreamRes.body) {
          try {
            await upstreamRes.body.cancel();
          } catch (_) {}
        }
        return;
      }

      // If upstream failed with an error status, do NOT stream error HTML as TIFF
      if (upstreamRes.status >= 400) {
        let errBody = '';
        try {
          errBody = await upstreamRes.text();
        } catch (_) {}
        return res.status(upstreamRes.status).json({
          error: `Upstream returned ${upstreamRes.status}: ${errBody.slice(0, 200)}`,
        });
      }

      res.setHeader('X-Raster-Cache', 'MISS');

      const contentType = upstreamRes.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      } else {
        res.setHeader('Content-Type', 'image/tiff');
      }

      const contentRange = upstreamRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      const contentLength = upstreamRes.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      res.status(upstreamRes.status);

      if (req.method === 'HEAD' || !upstreamRes.body) {
        if (upstreamRes.body) {
          try {
            await upstreamRes.body.cancel();
          } catch (_) {}
        }
        return res.end();
      }

      // Stream response to client and cache to disk if this is a complete GET download
      const stream = Readable.fromWeb(upstreamRes.body as any);

      // If full 200 response (not partial range), tee-stream to local disk cache
      let fileWriteStream: fs.WriteStream | null = null;
      let tempFilePath = '';

      if (upstreamRes.status === 200 && !req.headers.range) {
        tempFilePath = `${cachedFilePath}.${Date.now()}.tmp`;
        try {
          fileWriteStream = fs.createWriteStream(tempFilePath);
          // Explicitly handle and swallow errors on write stream to prevent unhandled 'error' crash
          fileWriteStream.on('error', (wsErr) => {
            console.warn('Raster cache file write error handled:', wsErr?.message);
          });
        } catch (wsErr) {
          console.warn('Could not open write stream for raster cache:', wsErr);
          fileWriteStream = null;
        }
      }

      let isCompleted = false;
      let isStreamFinished = false;

      if (fileWriteStream) {
        const ws = fileWriteStream;
        stream.on('data', (chunk) => {
          if (!ws.destroyed && !ws.closed && !isCompleted) {
            try {
              ws.write(chunk);
            } catch (_) {}
          }
        });

        stream.on('end', () => {
          isStreamFinished = true;
          if (!ws.destroyed && !ws.closed) {
            ws.end(() => {
              isCompleted = true;
              try {
                if (fs.existsSync(tempFilePath)) {
                  const stats = fs.statSync(tempFilePath);
                  if (stats.size > 1024) {
                    const fd = fs.openSync(tempFilePath, 'r');
                    const head = Buffer.alloc(2);
                    fs.readSync(fd, head, 0, 2, 0);
                    fs.closeSync(fd);
                    const isTiff = (head[0] === 0x49 && head[1] === 0x49) || (head[0] === 0x4D && head[1] === 0x4D);
                    if (isTiff) {
                      fs.renameSync(tempFilePath, cachedFilePath);
                      console.log('Raster cached to server disk:', cachedFilePath);
                    } else {
                      fs.unlinkSync(tempFilePath);
                    }
                  } else {
                    fs.unlinkSync(tempFilePath);
                  }
                }
              } catch (rErr) {
                console.warn('Could not validate/rename temp cached raster:', rErr);
              }
            });
          }
        });
      } else {
        stream.on('end', () => {
          isStreamFinished = true;
        });
      }

      const cleanupTempFile = () => {
        // Only cleanup if connection was truly aborted before completion
        if (fileWriteStream && !isCompleted && !isStreamFinished && !res.writableEnded) {
          try {
            fileWriteStream.removeAllListeners();
            fileWriteStream.on('error', () => {}); // swallow any remaining destroy events
            fileWriteStream.destroy();
          } catch (_) {}
          try {
            if (tempFilePath && fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          } catch (_) {}
        }
      };

      stream.on('error', (err: any) => {
        cleanupTempFile();
        if (!abortController.signal.aborted && !req.destroyed && err?.message !== 'terminated' && err?.name !== 'AbortError') {
          console.warn('Raster proxy stream error:', err?.message);
        }
      });

      req.on('close', () => {
        cleanupTempFile();
        try {
          if (!stream.destroyed) {
            stream.destroy();
          }
        } catch (_) {}
      });

      stream.pipe(res);
    } catch (err: any) {
      if (
        abortController.signal.aborted ||
        req.destroyed ||
        err?.name === 'AbortError' ||
        err?.code === 'ECONNRESET' ||
        err?.message?.includes('terminated')
      ) {
        return;
      }
      console.error('Raster proxy error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Failed to proxy raster' });
      }
    } finally {
      req.off('close', onClose);
    }
  });

  // In-memory cache for elevation queries (grid rounded to 4 decimals ~ 11m resolution)
  const elevationCache = new Map<string, number>();

  app.get('/api/elevation', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Toạ độ không hợp lệ' });
      }

      // Round to 4 decimal places (~11 meters grid)
      const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (elevationCache.has(cacheKey)) {
        return res.json({ success: true, elevation: elevationCache.get(cacheKey) });
      }

      // Query Open-Meteo elevation API (free, global Copernicus / SRTM)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const apiUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}`;
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'WebGIS-Elevation/1.0' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Elevation API returned status ${response.status}`);
      }

      const data = (await response.json()) as any;
      const elevationVal = Array.isArray(data?.elevation) ? data.elevation[0] : data?.elevation;

      if (typeof elevationVal === 'number' && !isNaN(elevationVal)) {
        const roundedElevation = Math.round(elevationVal);
        elevationCache.set(cacheKey, roundedElevation);
        // Keep cache bounded
        if (elevationCache.size > 3000) {
          const firstKey = elevationCache.keys().next().value;
          if (firstKey) elevationCache.delete(firstKey);
        }
        return res.json({ success: true, elevation: roundedElevation });
      }

      return res.status(502).json({ error: 'Không lấy được dữ liệu độ cao' });
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi tra cứu độ cao', message: err.message });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
