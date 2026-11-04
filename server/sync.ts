import express from 'express';
import { adminDb } from './firebaseAdmin';
import { requireEditorOrAdmin } from './auth';

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

export async function getSyncRegistry(): Promise<SyncRegistryData> {
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

export async function bumpSyncVersion(type: 'features' | 'raster' | 'configs' | 'aliases' | 'communes'): Promise<number> {
  if (!adminDb) return 1;
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
    return nextVersion;
  } catch (err) {
    console.error(`[SyncRegistry] Lỗi nhảy phiên bản ${type}:`, err);
    return 1;
  }
}


export function registerSyncRoutes(app: express.Express) {
  app.get('/api/sync/versions', async (req, res) => {
    try {
      const registry = await getSyncRegistry();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({ success: true, versions: registry });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Lỗi đọc sync_registry' });
    }
  });

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
}
