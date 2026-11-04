import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Readable } from 'stream';
import { fromUrl, fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import { adminApp, adminDb } from './firebaseAdmin';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { requireEditorOrAdmin } from './auth';
import { bumpSyncVersion } from './sync';

// Server-side cache directory for downloaded raster files
export const RASTER_CACHE_DIR = path.join('/tmp', 'raster_cache');
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

export function convertBBox(minX: number, minY: number, maxX: number, maxY: number, epsg?: number | string) {
  const west = Math.min(minX, maxX);
  const east = Math.max(minX, maxX);
  const south = Math.min(minY, maxY);
  const north = Math.max(minY, maxY);

  if (epsg === 4326 || (west >= -180 && east <= 180 && south >= -90 && north <= 90)) {
    return { south, west, north, east };
  }

  try {
    const sw = proj4('EPSG:3857', 'EPSG:4326', [west, south]);
    const ne = proj4('EPSG:3857', 'EPSG:4326', [east, north]);
    if (!isNaN(sw[0]) && !isNaN(sw[1]) && !isNaN(ne[0]) && !isNaN(ne[1]) && sw[1] >= -90 && ne[1] <= 90) {
      return { south: sw[1], west: sw[0], north: ne[1], east: ne[0] };
    }
  } catch (_) {}

  if (epsg && epsg !== 3857 && epsg !== 'EPSG:3857') {
    const code = typeof epsg === 'number' ? `EPSG:${epsg}` : epsg;
    try {
      const sw = proj4(code, 'EPSG:4326', [west, south]);
      const ne = proj4(code, 'EPSG:4326', [east, north]);
      if (!isNaN(sw[0]) && !isNaN(sw[1]) && !isNaN(ne[0]) && !isNaN(ne[1]) && sw[1] >= -90 && ne[1] <= 90) {
        return { south: sw[1], west: sw[0], north: ne[1], east: ne[0] };
      }
    } catch (_) {}
  }

  return { south, west, north, east };
}

export let cachedRasterLayersResponse: {
  payload: { layers: any[] };
  etag: string;
  updatedAt: number;
} | null = null;

export function invalidateRasterLayersCache() {
  cachedRasterLayersResponse = null;
}

export function registerRasterRoutes(app: express.Express) {
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
            version: typeof data.version === 'number' ? data.version : 1,
            uploadedAt: data.createdAt || new Date().toISOString(),
          }];
        }
        const mappedFiles = files.map((f: any, idx: number) => ({
          ...f,
          id: f.id || `${d.id}_file_${idx}`,
          version: typeof f.version === 'number' ? f.version : 1,
        }));
        layers.push({
          id: d.id,
          name: data.name || 'Bản đồ nền',
          type: data.type || 'COG',
          source: data.source || (data.githubReleaseUrl ? 'github' : data.storagePath ? 'firebase' : 'url'),
          storagePath: data.storagePath,
          githubReleaseUrl: data.githubReleaseUrl,
          bounds: data.bounds || null,
          files: mappedFiles,
          opacity: data.opacity ?? 1.0,
          version: typeof data.version === 'number' ? data.version : 1,
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
        files: Array.isArray(layer.files)
          ? layer.files.map((f: any, idx: number) => ({
              ...f,
              id: f.id || `file_${idx}_${Date.now()}`,
              version: typeof f.version === 'number' ? f.version : 1,
            }))
          : [],
        bounds: layer.bounds || null,
        opacity: layer.opacity ?? 1.0,
        version: typeof layer.version === 'number' ? layer.version : 1,
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

      const stream = Readable.fromWeb(upstreamRes.body as any);

      let fileWriteStream: fs.WriteStream | null = null;
      let tempFilePath = '';

      if (upstreamRes.status === 200 && !req.headers.range) {
        tempFilePath = `${cachedFilePath}.${Date.now()}.tmp`;
        try {
          fileWriteStream = fs.createWriteStream(tempFilePath);
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
        if (fileWriteStream && !isCompleted && !isStreamFinished && !res.writableEnded) {
          try {
            fileWriteStream.removeAllListeners();
            fileWriteStream.on('error', () => {});
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
}
