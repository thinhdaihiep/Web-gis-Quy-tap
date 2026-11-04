import express from 'express';
import crypto from 'crypto';
import { adminDb } from './firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { requireEditorOrAdmin, requireAdmin, activeSessions, verifySignedToken } from './auth';
import { bumpSyncVersion } from './sync';
import { invalidateFeaturesResponseCache } from './features';
import { invalidateRasterLayersCache } from './rasters';
import { invalidateCommuneChunksCache } from './communes';

// In-memory rate limiter for user feedback submissions
export const feedbackRateLimiter = new Map<string, { count: number; resetAt: number }>();

// In-memory response caches
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

// In-memory cache for elevation queries (grid rounded to 4 decimals ~ 11m resolution)
const elevationCache = new Map<string, number>();

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

export function registerOtherRoutes(app: express.Express) {
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
        invalidateRasterLayersCache();
        await bumpSyncVersion('raster');
      }
      if (!target || target === 'all' || target === 'features') {
        invalidateFeaturesResponseCache();
      }
      if (!target || target === 'all' || target === 'layer_configs') {
        cachedLayerConfigsResponse = null;
      }
      if (!target || target === 'all' || target === 'field_aliases') {
        cachedAliasesResponse = null;
      }
      if (!target || target === 'all' || target === 'communes') {
        invalidateCommuneChunksCache();
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

  // GET notifications (latest 50) via Admin SDK (Editor/Admin only)
  app.get('/api/notifications', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.json({ notifications: [] });
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      const snap = await adminDb.collection('notifications').get();
      const notifications = snap.docs.map((docSnap: any) => {
        const data = docSnap.data();
        let createdAt = data.createdAt;
        let createdAtMillis = 0;
        if (createdAt && typeof createdAt.toMillis === 'function') {
          createdAtMillis = createdAt.toMillis();
          createdAt = createdAt.toDate().toISOString();
        } else if (createdAt && typeof createdAt.toDate === 'function') {
          createdAtMillis = createdAt.toDate().getTime();
          createdAt = createdAt.toDate().toISOString();
        } else if (typeof createdAt === 'string') {
          createdAtMillis = new Date(createdAt).getTime() || 0;
        }
        return {
          id: docSnap.id,
          ...data,
          createdAt,
          createdAtMillis,
        };
      });
      notifications.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
      res.json({ success: true, notifications: notifications.slice(0, 50) });
    } catch (err: any) {
      console.error('[API GET /api/notifications] Error:', err);
      res.status(500).json({ error: err.message || 'Lỗi tải danh sách thông báo' });
    }
  });

  // GET unread notifications count via Admin SDK (Editor/Admin only)
  app.get('/api/notifications/unread-count', requireEditorOrAdmin, async (req, res) => {
    try {
      if (!adminDb) return res.json({ count: 0 });
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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

  // Create user feedback via Admin SDK (and notify admins/editors)
  app.post('/api/feedback', async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ error: 'Admin SDK not initialized' });

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

  // GET feedback list via Admin SDK
  app.get('/api/feedback', async (req, res) => {
    try {
      if (!adminDb) return res.json({ items: [] });
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      const { objectId, layerId } = req.query;
      if (!layerId) return res.json({ items: [] });

      const targetObjId = objectId !== undefined && objectId !== null ? String(objectId).toLowerCase().trim() : null;

      const token = (req.headers['x-session-token'] || req.headers['x-admin-token']) as string;
      const session = token ? (activeSessions.get(token) || verifySignedToken(token)) : null;
      const isPrivileged = Boolean(session && (session.role === 'admin' || session.role === 'editor'));

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

  // Elevation API
  app.get('/api/elevation', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Toạ độ không hợp lệ' });
      }

      const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (elevationCache.has(cacheKey)) {
        return res.json({ success: true, elevation: elevationCache.get(cacheKey) });
      }

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

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
}
