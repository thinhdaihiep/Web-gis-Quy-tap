import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { adminDb } from './firebaseAdmin';

// Dynamic session tokens for active admin and editor sessions (Zero-Config authentication)
export interface ActiveSession {
  username: string;
  role: 'admin' | 'editor';
}

export const activeSessions = new Map<string, ActiveSession>();
export const activeAdminSessions = new Set<string>();

// In-memory token revocation list (stores token hashes)
const revokedTokenHashes = new Set<string>();

const hashToken = (tok: string): string => crypto.createHash('sha256').update(tok).digest('hex');

export const isTokenRevoked = (token: string): boolean => {
  if (!token) return true;
  const h = hashToken(token);
  return revokedTokenHashes.has(h);
};

export const revokeToken = async (token: string) => {
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

export async function syncRevokedTokens() {
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

    adminDb.collection('revoked_tokens').onSnapshot((snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'added' || change.type === 'modified') {
          revokedTokenHashes.add(change.doc.id);
        }
      });
    }, () => {});
  } catch (_) {}
}

let memorySecretFallback = '';
export const getSecretToken = (): string => {
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

export const createSignedToken = (username: string, role: 'admin' | 'editor'): string => {
  const secret = getSecretToken();
  const timestamp = Date.now();
  const usernameB64 = Buffer.from(username, 'utf8').toString('base64url');
  const payload = `v1.${role}.${usernameB64}.${timestamp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
};

export const verifySignedToken = (token: string): ActiveSession | null => {
  if (!token || isTokenRevoked(token)) return null;

  if (token.startsWith('v1.')) {
    const parts = token.split('.');
    if (parts.length !== 5) return null;
    const [version, role, usernameB64, timestampStr, sig] = parts;
    if (version !== 'v1' || (role !== 'admin' && role !== 'editor')) return null;

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return null;

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
export const requireEditorOrAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = (req.headers['x-session-token'] || req.headers['x-admin-token']) as string;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Thiếu mã phiên đăng nhập' });
  }

  if (isTokenRevoked(token)) {
    return res.status(401).json({ error: 'Unauthorized: Phiên đăng nhập đã kết thúc' });
  }

  const session = activeSessions.get(token);
  if (session && (session.role === 'admin' || session.role === 'editor')) {
    (req as any).user = session;
    return next();
  }

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
export const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = ((req.headers['x-admin-token'] || req.headers['x-session-token']) as string) || '';
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Thiếu token quản trị' });
  }

  if (isTokenRevoked(token)) {
    return res.status(401).json({ error: 'Unauthorized: Phiên đăng nhập đã kết thúc' });
  }

  const session = activeSessions.get(token);
  if (session && session.role === 'admin') {
    return next();
  }

  const verified = verifySignedToken(token);
  if (verified && verified.role === 'admin') {
    activeSessions.set(token, verified);
    activeAdminSessions.add(token);
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Phiên làm việc không có quyền quản trị' });
};

// Seed initial Admin account
export async function seedDefaultAdmin() {
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
      const configuredPassword = (process.env.ADMIN_DEFAULT_PASSWORD || '').trim();
      if (configuredPassword) {
        const hashedPassword = await bcrypt.hash(configuredPassword, 10);
        const adminDoc = {
          username: 'admin',
          displayName: 'Bản đồ qk5',
          role: 'admin',
          password: hashedPassword,
          createdAt: new Date().toISOString(),
        };
        await adminDb.collection('users').doc('user_admin').set(adminDoc);
        console.log('[Security Seed] Đã khởi tạo tài khoản admin từ biến môi trường ADMIN_DEFAULT_PASSWORD.');
      }
    }
  } catch (err: any) {
    console.error('[Security Seed] Lỗi kiểm tra/khởi tạo admin:', err);
  }
}

const loginRateLimiter = new Map<string, { count: number; lockedUntil: number }>();

export function registerAuthRoutes(app: express.Express) {
  // User Management APIs
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

  // Login endpoint
  app.post('/api/login', async (req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });
      }

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

  // Logout endpoint
  app.post('/api/logout', async (req, res) => {
    const token = (req.headers['x-session-token'] || req.headers['x-admin-token']) as string;
    if (token) {
      await revokeToken(token);
    }
    res.json({ success: true });
  });

  // Create user
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

  // Update user role
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

  // Reset user password
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

  // Delete user
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
}
