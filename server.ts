import express from 'express';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { createServer as createViteServer } from 'vite';
import { fromUrl, fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

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
try {
  const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const fbApp = getApps().length > 0 ? getApp() : initializeApp(cfg);
    serverDb = getFirestore(fbApp, cfg.firestoreDatabaseId);
    console.log('[Server] Firebase Firestore initialized successfully');
  }
} catch (e) {
  console.warn('[Server] Cannot initialize Firebase Firestore:', e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
            password: data.password || '',
            photoURL: data.photoURL || '',
            role: data.role || 'editor',
            createdAt: data.createdAt || '',
          });
        }
      });

      if (!seenUsernames.has('admin')) {
        userList.unshift({
          uid: 'admin_static',
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

  app.post('/api/users', async (req, res) => {
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
      const newUserDoc = {
        username: cleanUser,
        password: String(password),
        displayName: displayName ? String(displayName).trim() : cleanUser,
        role: role || 'editor',
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(serverDb, 'users', docId), newUserDoc);
      res.json({ success: true, user: { uid: docId, ...newUserDoc } });
    } catch (err: any) {
      console.error('[API POST /api/users] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to add user' });
    }
  });

  app.patch('/api/users/:uid/role', async (req, res) => {
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

  app.delete('/api/users/:uid', async (req, res) => {
    try {
      if (!serverDb) {
        return res.status(500).json({ error: 'Firestore server not initialized' });
      }
      const { uid } = req.params;
      if (uid === 'admin_static') {
        return res.status(400).json({ error: 'Cannot delete default admin user' });
      }
      await deleteDoc(doc(serverDb, 'users', uid));
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API DELETE /api/users/:uid] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete user' });
    }
  });

  // API endpoint to parse COG Header directly in milliseconds via HTTP Range Request
  app.get('/api/cog-bounds', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      // Follow redirect to get final direct download URL (AWS S3 / raw asset)
      let effectiveUrl = targetUrl;
      try {
        const headRes = await fetch(targetUrl, {
          method: 'HEAD',
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 WebGIS-COG-Reader' }
        });
        if (headRes.url) {
          effectiveUrl = headRes.url;
        }
      } catch (headErr) {
        // Proceed with original url
      }

      let tiff: any = null;
      try {
        tiff = await fromUrl(effectiveUrl);
      } catch (fromUrlErr) {
        // Fallback: Read first 128KB header range
        const rangeRes = await fetch(effectiveUrl, {
          headers: {
            'Range': 'bytes=0-131071',
            'User-Agent': 'Mozilla/5.0 WebGIS-COG-Reader'
          }
        });
        if (rangeRes.ok || rangeRes.status === 206) {
          const buf = await rangeRes.arrayBuffer();
          tiff = await fromArrayBuffer(buf);
        } else {
          throw fromUrlErr;
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
      console.error('API cog-bounds error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Không thể trích xuất Header COG'
      });
    }
  });

  // OPTIONS and CORS for proxy-raster
  app.options('/api/proxy-raster', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    res.setHeader('Accept-Ranges', 'bytes');
    return res.sendStatus(200);
  });

  // API route for proxying raster / GeoTIFF / COG with Range support & CORS
  app.get('/api/proxy-raster', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
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

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebGIS-Raster-Proxy/1.0',
        Accept: '*/*',
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      // Manually follow redirects so that Range header is preserved across GitHub / S3 redirects
      let currentUrl = targetUrl;
      let hops = 0;
      let upstreamRes: any = null;

      while (hops < 6) {
        upstreamRes = await fetch(currentUrl, {
          method: req.method === 'HEAD' ? 'HEAD' : 'GET',
          headers,
          redirect: 'manual',
          signal: abortController.signal,
        });

        if ([301, 302, 303, 307, 308].includes(upstreamRes.status)) {
          const loc = upstreamRes.headers.get('location');
          // Important: Cancel redirect response body to release Undici connection back to pool
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

      // If client closed connection while we were resolving upstream, exit cleanly
      if (req.destroyed || abortController.signal.aborted) {
        if (upstreamRes.body) {
          try {
            await upstreamRes.body.cancel();
          } catch (_) {}
        }
        return;
      }

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

      // Stream response to client instead of buffering whole raster in RAM
      const stream = Readable.fromWeb(upstreamRes.body as any);
      stream.on('error', (err: any) => {
        if (!abortController.signal.aborted && !req.destroyed && err?.message !== 'terminated' && err?.name !== 'AbortError') {
          console.warn('Raster proxy stream error:', err?.message);
        }
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
        // Normal client abort / socket cancellation when navigating or zooming map
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
