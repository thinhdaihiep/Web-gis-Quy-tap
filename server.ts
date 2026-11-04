import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { adminDb, adminInitError } from './server/firebaseAdmin';
import { registerAuthRoutes, seedDefaultAdmin, syncRevokedTokens } from './server/auth';
import { registerSyncRoutes } from './server/sync';
import { registerCommuneRoutes, ensureCommunesIndexInitialized } from './server/communes';
import { registerFeatureRoutes, ensureFeatureStoreInitialized } from './server/features';
import { registerRasterRoutes } from './server/rasters';
import { registerBattleRoutes } from './server/battles';
import { registerOtherRoutes } from './server/other';

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

  // Default body limit for standard endpoints
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

  // Register modularized API routes
  registerAuthRoutes(app);
  registerSyncRoutes(app);
  registerCommuneRoutes(app);
  registerFeatureRoutes(app);
  registerRasterRoutes(app);
  registerBattleRoutes(app);
  registerOtherRoutes(app);

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
