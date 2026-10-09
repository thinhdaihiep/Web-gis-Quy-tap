import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Readable } from 'stream';
import { createServer as createViteServer } from 'vite';
import { fromUrl, fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import bcrypt from 'bcryptjs';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

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

let serverDb: any = null;

// Function to automatically seed initial Admin account if none exists
async function seedDefaultAdmin() {
  if (!serverDb) return;
  try {
    const snap = await getDocs(collection(serverDb, 'users'));
    let hasAdmin = false;
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.role === 'admin' || (data.username && data.username.toLowerCase() === 'admin')) {
        hasAdmin = true;
      }
    });

    if (!hasAdmin) {
      const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || '123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      const adminDoc = {
        username: 'admin',
        displayName: 'Bản đồ qk5',
        role: 'admin',
        password: hashedPassword,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(serverDb, 'users', 'user_admin'), adminDoc);
      console.log('----------------------------------------------------');
      console.log('[Security Seed] Đã tự động tạo tài khoản admin mặc định:');
      console.log(`[Security Seed] Username: admin`);
      console.log(`[Security Seed] Mật khẩu ban đầu: ${defaultPassword}`);
      console.log('----------------------------------------------------');
    }
  } catch (err) {
    console.error('[Security Seed] Lỗi khởi tạo admin mặc định:', err);
  }
}

try {
  const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const fbApp = getApps().length > 0 ? getApp() : initializeApp(cfg);
    serverDb = getFirestore(fbApp, cfg.firestoreDatabaseId);
    console.log('[Server] Firebase Firestore initialized successfully');
    seedDefaultAdmin();
  }
} catch (e) {
  console.warn('[Server] Cannot initialize Firebase Firestore:', e);
}

// Dynamic session tokens for active admin and editor sessions (Zero-Config authentication)
interface ActiveSession {
  username: string;
  role: 'admin' | 'editor';
}
const activeSessions = new Map<string, ActiveSession>();
const activeAdminSessions = new Set<string>();

const getSecretToken = (): string => {
  return process.env.ADMIN_API_TOKEN || process.env.admin_api_token || 'Bando@qk5';
};

// Cryptographic token helper to ensure user session survives server restarts
const createSignedToken = (username: string, role: 'admin' | 'editor'): string => {
  const secret = getSecretToken();
  const timestamp = Date.now();
  const payload = `v1:${role}:${username}:${timestamp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return `${payload}:${sig}`;
};

const verifySignedToken = (token: string): ActiveSession | null => {
  if (!token || !token.startsWith('v1:')) return null;
  const parts = token.split(':');
  if (parts.length !== 5) return null;
  const [version, role, username, timestampStr, sig] = parts;
  if (version !== 'v1' || (role !== 'admin' && role !== 'editor')) return null;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return null;

  // Max session lifetime: 30 days
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - timestamp > MAX_AGE_MS) return null;

  const secret = getSecretToken();
  const payload = `v1:${role}:${username}:${timestampStr}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);

  if (sig === expectedSig) {
    return { username, role: role as 'admin' | 'editor' };
  }
  return null;
};

// Middleware to verify editor or admin session
const requireEditorOrAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = (req.headers['x-session-token'] || req.headers['x-admin-token']) as string;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Thiếu mã phiên đăng nhập' });
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

  // 3. Static admin token check (from secrets/env or Bando@qk5)
  const configuredToken = getSecretToken();
  if (token === configuredToken || token === 'Bando@qk5' || activeAdminSessions.has(token)) {
    (req as any).user = { username: 'admin', role: 'admin' };
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: Bạn không có quyền ghi dữ liệu' });
};

// Middleware to protect administrative user routes
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const adminTokenHeader = ((req.headers['x-admin-token'] || req.headers['x-session-token']) as string) || '';
  if (!adminTokenHeader) {
    return res.status(401).json({ error: 'Unauthorized: Thiếu token quản trị' });
  }

  // 1. In-memory session check
  const session = activeSessions.get(adminTokenHeader);
  if (session && session.role === 'admin') {
    return next();
  }

  // 2. Cryptographically signed token check
  const verified = verifySignedToken(adminTokenHeader);
  if (verified && verified.role === 'admin') {
    activeSessions.set(adminTokenHeader, verified);
    activeAdminSessions.add(adminTokenHeader);
    return next();
  }

  // 3. Static admin token check
  const configuredToken = getSecretToken();
  if (adminTokenHeader === configuredToken || adminTokenHeader === 'Bando@qk5' || activeAdminSessions.has(adminTokenHeader)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or missing admin session token' });
};

async function startServer() {
  const app = express();
  const PORT = process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '50mb' }));

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
      throw new Error(`Không thể khởi tạo GitHub Release: ${createRes.status} ${errText}`);
    }

    const errText = await getRes.text();
    throw new Error(`Không thể truy cập GitHub Release: ${getRes.status} ${errText}`);
  }

  // Upload battle dossier PDF to GitHub Release
  app.post('/api/battles/upload-hoso', async (req, res) => {
    try {
      const token = getEffectiveGitHubToken();
      if (!token) {
        return res.status(500).json({
          error: 'Chưa cấu hình mã GitHub_Access trong biến môi trường / Secrets của máy chủ.',
        });
      }

      const { fileName, fileBase64, objectId, battleName, oldFileUrl } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: 'Thiếu nội dung file base64' });
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

      // Convert base64 to Buffer
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

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
          error: `Tải file lên GitHub Release thất bại: ${uploadRes.status} ${errText}`,
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
      res.status(500).json({ error: err.message || 'Lỗi khi upload hồ sơ trận đánh lên GitHub' });
    }
  });

  // Delete battle dossier PDF from GitHub Release
  app.post('/api/battles/delete-hoso', async (req, res) => {
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

  // Proxy endpoint to stream PDF for in-app viewer (prevents cross-origin download forcing)
  app.get('/api/battles/proxy-pdf', async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: 'Missing url query parameter' });
      }

      const token = getEffectiveGitHubToken();
      let currentUrl = url;
      let hops = 0;
      let upstreamRes: Response | null = null;

      // Handle redirect chain (GitHub releases redirect to AWS S3/CDN)
      while (hops < 6) {
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebGIS/1.0',
        };
        // Only attach GitHub token to github.com / api.github.com, NOT AWS S3 redirected URLs!
        if (token && (currentUrl.includes('github.com') || currentUrl.includes('api.github.com'))) {
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

  // User Management APIs (Direct Server-side Firestore Access)
  app.get('/api/users', async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const snap = await getDocs(collection(serverDb, 'users'));
      const userList: any[] = [];
      const seenUsernames = new Set<string>();

      snap.forEach((docSnap) => {
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

  // Secure Server-side Login endpoint using bcrypt
  app.post('/api/login', async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      const cleanUser = String(username).trim().toLowerCase();
      const cleanPass = String(password).trim();

      const snap = await getDocs(collection(serverDb, 'users'));
      let matchedUser: any = null;

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const uname = (data.username || data.email || '').trim().toLowerCase();
        if (uname === cleanUser || docSnap.id === `user_${cleanUser}`) {
          const storedHash = String(data.password || '');
          let isValid = false;

          if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
            isValid = await bcrypt.compare(cleanPass, storedHash);
          } else {
            // Support transition for initial plain text password if any
            isValid = storedHash === cleanPass;
            if (isValid) {
              const newHash = await bcrypt.hash(cleanPass, 10);
              await updateDoc(doc(serverDb, 'users', docSnap.id), { password: newHash });
            }
          }

          if (isValid) {
            const role = (data.role as 'admin' | 'editor') || 'editor';
            const token = createSignedToken(data.username || cleanUser, role);

            activeSessions.set(token, {
              username: data.username || cleanUser,
              role,
            });

            if (role === 'admin' || cleanUser === 'admin') {
              activeAdminSessions.add(token);
            }

            matchedUser = {
              uid: docSnap.id,
              username: data.username || cleanUser,
              displayName: data.displayName || data.username || cleanUser,
              role,
              token,
            };
            break;
          }
        }
      }

      if (matchedUser) {
        return res.json({ success: true, user: matchedUser });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    } catch (err: any) {
      console.error('[API /api/login] Error:', err);
      res.status(500).json({ error: err.message || 'Login failed' });
    }
  });

  // Logout endpoint to revoke dynamic session token
  app.post('/api/logout', (req, res) => {
    const token = (req.headers['x-session-token'] || req.headers['x-admin-token']) as string;
    if (token) {
      activeSessions.delete(token);
      activeAdminSessions.delete(token);
    }
    res.json({ success: true });
  });

  // Create user (protected by requireAdmin, passwords hashed with bcrypt)
  app.post('/api/users', requireAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
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
      await setDoc(doc(serverDb, 'users', docId), newUserDoc);
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

  // Update user role (protected by requireAdmin)
  app.patch('/api/users/:uid/role', requireAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { uid } = req.params;
      const { role } = req.body;
      if (!role) {
        return res.status(400).json({ error: 'Role is required' });
      }
      await updateDoc(doc(serverDb, 'users', uid), { role });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API PATCH /api/users/:uid/role] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to update role' });
    }
  });

  // Reset user password (protected by requireAdmin, hashed with bcrypt)
  app.patch('/api/users/:uid/password', requireAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { uid } = req.params;
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }
      const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
      await updateDoc(doc(serverDb, 'users', uid), { password: hashedPassword });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API PATCH /api/users/:uid/password] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to update password' });
    }
  });

  // Delete user (protected by requireAdmin)
  app.delete('/api/users/:uid', requireAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { uid } = req.params;
      if (uid === 'admin_static' || uid === 'user_admin') {
        return res.status(400).json({ error: 'Cannot delete default admin user' });
      }
      await deleteDoc(doc(serverDb, 'users', uid));
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API DELETE /api/users/:uid] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete user' });
    }
  });

  // ==========================================
  // SERVER-SIDE FIRESTORE WRITE APIS (Editor & Admin only)
  // ==========================================

  // Save/Update a single map feature
  app.post('/api/features/save', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { feature } = req.body;
      if (!feature || !feature.id) {
        return res.status(400).json({ error: 'Missing feature or feature id' });
      }

      const docRef = doc(serverDb, 'map_features', String(feature.id));
      const rawCoords = feature.coordinates || feature.geometry?.coordinates || [];
      const coordsJsonStr = typeof rawCoords === 'string' ? rawCoords : JSON.stringify(rawCoords);

      const cleanedDoc: Record<string, any> = {
        id: String(feature.id),
        layerId: feature.layerId || 'layer1_tim_kiem',
        name: feature.name || '',
        type: feature.type || feature.geometry?.type || 'Point',
        coordinates: coordsJsonStr,
        properties: feature.properties || {},
        updatedAt: feature.updatedAt || new Date().toISOString(),
      };
      if (feature.code) cleanedDoc.code = feature.code;

      await setDoc(docRef, cleanedDoc, { merge: true });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/features/save] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save feature' });
    }
  });

  // Delete a feature
  app.post('/api/features/delete', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing feature id' });
      }

      await deleteDoc(doc(serverDb, 'map_features', String(id)));
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/features/delete] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete feature' });
    }
  });

  // Batch save / layer chunks save
  app.post('/api/features/batch', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { features, chunks } = req.body;

      if (Array.isArray(chunks) && chunks.length > 0) {
        // Save as pre-bundled chunks
        for (const chunk of chunks) {
          if (chunk.id && chunk.payloadJson) {
            await setDoc(doc(serverDb, 'layer_chunks', chunk.id), {
              chunkIndex: chunk.chunkIndex,
              itemCount: chunk.itemCount,
              payloadJson: chunk.payloadJson,
              updatedAt: new Date().toISOString(),
            });
          }
        }
        return res.json({ success: true, count: features?.length || 0 });
      }

      if (Array.isArray(features)) {
        for (const feat of features) {
          if (feat && feat.id) {
            const docRef = doc(serverDb, 'map_features', String(feat.id));
            const rawCoords = feat.coordinates || feat.geometry?.coordinates || [];
            const coordsJsonStr = typeof rawCoords === 'string' ? rawCoords : JSON.stringify(rawCoords);
            await setDoc(
              docRef,
              {
                id: String(feat.id),
                layerId: feat.layerId || 'layer1_tim_kiem',
                name: feat.name || '',
                type: feat.type || feat.geometry?.type || 'Point',
                coordinates: coordsJsonStr,
                properties: feat.properties || {},
                updatedAt: feat.updatedAt || new Date().toISOString(),
              },
              { merge: true }
            );
          }
        }
        return res.json({ success: true, count: features.length });
      }

      res.status(400).json({ error: 'Invalid features or chunks array' });
    } catch (err: any) {
      console.error('[API POST /api/features/batch] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save batch' });
    }
  });

  // Commune Administrative Boundaries Batch Upload
  app.post('/api/communes/batch', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { chunks, meta, isLastBatch, clearExisting } = req.body;

      if (clearExisting) {
        try {
          const oldChunks = await getDocs(collection(serverDb, 'commune_chunks'));
          for (const d of oldChunks.docs) {
            await deleteDoc(doc(serverDb, 'commune_chunks', d.id));
          }
        } catch (e) {
          console.warn('[API /api/communes/batch] Clear old chunks warning:', e);
        }
      }

      if (Array.isArray(chunks) && chunks.length > 0) {
        for (const chunk of chunks) {
          if (chunk.id && chunk.payloadJson) {
            await setDoc(doc(serverDb, 'commune_chunks', chunk.id), {
              chunkIndex: chunk.chunkIndex,
              itemCount: chunk.itemCount,
              payloadJson: chunk.payloadJson,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }

      if (meta) {
        await setDoc(doc(serverDb, 'commune_meta', 'config'), {
          ...meta,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      return res.json({ success: true, count: chunks?.length || 0 });
    } catch (err: any) {
      console.error('[API POST /api/communes/batch] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save commune chunks' });
    }
  });

  // Commune Public Metadata and Chunks
  app.get('/api/communes/meta', async (req, res) => {
    try {
      if (!serverDb) return res.json({ totalFeatures: 0, totalChunks: 0 });
      const metaDoc = await getDoc(doc(serverDb, 'commune_meta', 'config'));
      if (metaDoc.exists()) {
        return res.json(metaDoc.data());
      }
      return res.json({ totalFeatures: 0, totalChunks: 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/communes/chunks', async (req, res) => {
    try {
      if (!serverDb) return res.json({ chunks: [] });
      const snap = await getDocs(collection(serverDb, 'commune_chunks'));
      const chunks = snap.docs.map((d) => ({
        id: d.id,
        chunkIndex: d.data().chunkIndex,
        itemCount: d.data().itemCount,
        payloadJson: d.data().payloadJson,
        updatedAt: d.data().updatedAt,
      }));
      chunks.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
      return res.json({ chunks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save layer configs (custom layer names)
  app.post('/api/layers/save', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { layerNames } = req.body;
      if (!layerNames) {
        return res.status(400).json({ error: 'Missing layerNames' });
      }

      await setDoc(doc(serverDb, 'app_settings', 'layer_configs'), {
        layerNames,
        updatedAt: new Date().toISOString(),
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/layers/save] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save layer configs' });
    }
  });

  // Save field aliases
  app.post('/api/aliases/save', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { aliases, hiddenFields } = req.body;
      await setDoc(doc(serverDb, 'app_settings', 'field_aliases'), {
        aliases: aliases || {},
        hiddenFields: hiddenFields || {},
        updatedAt: new Date().toISOString(),
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/aliases/save] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to save field aliases' });
    }
  });

  // Update raster layer enabled state
  app.post('/api/raster-layers/update-enabled', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { layerId, enabled } = req.body;
      if (!layerId) {
        return res.status(400).json({ error: 'Missing layerId' });
      }

      await updateDoc(doc(serverDb, 'raster_layers', layerId), {
        enabled: enabled !== false,
        updatedAt: new Date().toISOString(),
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API POST /api/raster-layers/update-enabled] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to update raster layer status' });
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
