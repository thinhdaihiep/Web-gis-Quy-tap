import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { adminDb, adminInitError } from './server/firebaseAdmin';
import { registerAuthRoutes, seedDefaultAdmin, syncRevokedTokens, validateSessionSecretConfig } from './server/auth';
import { registerSyncRoutes } from './server/sync';
import { registerCommuneRoutes, ensureCommunesIndexInitialized } from './server/communes';
import { registerFeatureRoutes, ensureFeatureStoreInitialized } from './server/features';
import { registerRasterRoutes } from './server/rasters';
import { registerBattleRoutes } from './server/battles';
import { registerOtherRoutes } from './server/other';

// Validate security session secret configuration
validateSessionSecretConfig();

// Execute initial background tasks
seedDefaultAdmin();
syncRevokedTokens();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10) || 3000;

  // Security Headers
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Body parser limits up to 100MB to support large GeoJSON, commune boundaries, and dossier uploads
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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

  // Register modularized API routes
  registerAuthRoutes(app);
  registerSyncRoutes(app);
  registerCommuneRoutes(app);
  registerFeatureRoutes(app);
  registerRasterRoutes(app);
  registerBattleRoutes(app);
  registerOtherRoutes(app);

  // Global error handler middleware for Express (handles PayloadTooLargeError, JSON syntax errors)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err) {
      if (err.type === 'entity.too.large' || err.status === 413) {
        return res.status(413).json({
          error: 'Kích thước dữ liệu quá lớn (vượt quá giới hạn cho phép 100MB). Vui lòng chia nhỏ tệp để tải lên.',
        });
      }
      if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
        return res.status(400).json({
          error: 'Dữ liệu JSON gửi lên máy chủ không hợp lệ.',
        });
      }
      console.error('[Express Error]', err);
      return res.status(err.status || 500).json({
        error: err.message || 'Lỗi xử lý yêu cầu máy chủ',
      });
    }
    next();
  });

  // Vite middleware for development / Static files for production
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
      },
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
    ensureFeatureStoreInitialized().catch((err) => {
      console.warn('[Server] Pre-warm feature store warning:', err?.message || err);
    });
    ensureCommunesIndexInitialized().catch((err) => {
      console.warn('[Server] Pre-warm communes index warning:', err?.message || err);
    });
  });
}

startServer();
