import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, listAll, getDownloadURL, getMetadata } from 'firebase/storage';
import { db, storage } from '../firebase';
import { RasterLayer, RasterFileItem, LatLngBoundsBox, RasterLoadingStatus, computeCombinedBounds } from '../types';
import {
  Cloud,
  Cat,
  Plus,
  RefreshCw,
  RotateCcw,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';
import { parseGeoTiffMetadata } from '../utils/geotiffLoader';
import { fetchGitHubReleaseAssets } from '../utils/githubRelease';
import { removeCachedRasters } from '../utils/rasterCache';

// Official GitHub Octocat Icon
const GithubCat: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

interface RasterManagementTabProps {
  onLayersChange?: (layers: RasterLayer[]) => void;
  onSelectAndFlyToRaster?: (layerId: string, bounds?: LatLngBoundsBox | null) => void;
  rasterStatus?: RasterLoadingStatus;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export const RasterManagementTab: React.FC<RasterManagementTabProps> = ({
  onLayersChange,
}) => {
  const [layers, setLayers] = useState<RasterLayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form input state
  const [sourceType, setSourceType] = useState<'firebase' | 'github'>('firebase');
  const [layerName, setLayerName] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Layer editing state
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Layer refreshing / deleting state
  const [refreshingLayerId, setRefreshingLayerId] = useState<string | null>(null);
  const [deletingLayerId, setDeletingLayerId] = useState<string | null>(null);

  // Notification state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchLayers();
  }, []);

  const fetchLayers = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'raster_layers'));
      const list: RasterLayer[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const files: RasterFileItem[] = Array.isArray(data.files) ? data.files : [];
        list.push({
          id: d.id,
          name: data.name || 'Bản đồ Raster',
          type: data.type || 'COG',
          source: data.source || (data.githubReleaseUrl ? 'github' : data.storagePath ? 'firebase' : 'url'),
          files,
          bounds: data.bounds || null,
          opacity: data.opacity ?? 1.0,
          enabled: data.enabled !== false,
          githubReleaseUrl: data.githubReleaseUrl || '',
          storagePath: data.storagePath || '',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt,
        });
      });

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setLayers(list);
      if (onLayersChange) {
        onLayersChange(list);
      }
    } catch (err: any) {
      console.error('Error fetching raster layers:', err);
      setErrorMessage('Không thể tải danh sách lớp raster.');
    } finally {
      setIsLoading(false);
    }
  };

  // Scan files and extract bounding boxes from Firebase Storage
  const scanFirebaseStorage = async (rawPath: string, existingFiles?: RasterFileItem[]) => {
    let cleanPath = rawPath.trim();
    // Support gs://bucket/path or https://... URLs seamlessly
    if (cleanPath.startsWith('gs://')) {
      cleanPath = cleanPath.replace(/^gs:\/\/[^/]+\/?/, '');
    } else if (cleanPath.includes('firebasestorage.googleapis.com')) {
      const match = cleanPath.match(/\/o\/([^?#]+)/);
      if (match) {
        cleanPath = decodeURIComponent(match[1]);
      }
    }
    cleanPath = cleanPath.replace(/^\/+|\/+$/g, '');
    if (!cleanPath) {
      throw new Error('Vui lòng nhập đường dẫn thư mục trên Firebase Storage.');
    }

    const folderRef = ref(storage, cleanPath);
    const result = await listAll(folderRef);
    const rasterItems = result.items.filter((item) => {
      const n = item.name.toLowerCase();
      return n.endsWith('.tif') || n.endsWith('.tiff') || n.endsWith('.geotiff');
    });

    if (rasterItems.length === 0) {
      throw new Error(`Không tìm thấy file GeoTIFF/COG (.tif, .tiff) trong thư mục "${cleanPath}".`);
    }

    const existingBoundsMap = new Map((existingFiles || []).map((f) => [f.fileName, f.bounds]));
    const files: RasterFileItem[] = [];
    const boundsList: (LatLngBoundsBox | null)[] = [];

    for (const itemRef of rasterItems) {
      const url = await getDownloadURL(itemRef);
      const meta = await getMetadata(itemRef).catch(() => null);
      const fileSize = meta?.size || 0;

      let bounds: LatLngBoundsBox | null = null;
      try {
        const info = await parseGeoTiffMetadata(url);
        if (info && info.bounds) {
          bounds = info.bounds;
        }
      } catch (e) {
        console.warn(`Không thể trích xuất BBox cho ${itemRef.name}:`, e);
      }

      // Preserve previously verified bounds if new scan could not read
      if (!bounds && existingBoundsMap.has(itemRef.name)) {
        bounds = (existingBoundsMap.get(itemRef.name) as LatLngBoundsBox) || null;
      }

      if (bounds) {
        boundsList.push(bounds);
      }

      files.push({
        id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        fileName: itemRef.name,
        url,
        fileSize,
        bounds,
        format: 'COG',
        uploadedAt: meta?.timeCreated || new Date().toISOString(),
        source: 'firebase',
      });
    }

    const combinedBounds = computeCombinedBounds(boundsList);
    return { cleanPath, files, combinedBounds };
  };

  // Scan files and extract bounding boxes from GitHub Release
  const scanGithubRelease = async (url: string, existingFiles?: RasterFileItem[]) => {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error('Vui lòng nhập đường link GitHub Release.');
    }

    const releaseInfo = await fetchGitHubReleaseAssets(trimmed);
    const validAssets = releaseInfo.assets.filter((asset) => {
      const n = asset.name.toLowerCase();
      return n.endsWith('.tif') || n.endsWith('.tiff') || n.endsWith('.geotiff');
    });

    if (validAssets.length === 0) {
      throw new Error('Không tìm thấy file GeoTIFF/COG (.tif, .tiff) nào trong Release này.');
    }

    const existingBoundsMap = new Map((existingFiles || []).map((f) => [f.fileName, f.bounds]));
    const files: RasterFileItem[] = [];
    const boundsList: (LatLngBoundsBox | null)[] = [];

    for (const asset of validAssets) {
      let bounds: LatLngBoundsBox | null = null;
      try {
        const info = await parseGeoTiffMetadata(asset.downloadUrl);
        if (info && info.bounds) {
          bounds = info.bounds;
        }
      } catch (e) {
        console.warn(`Không thể trích xuất BBox cho asset ${asset.name}:`, e);
      }

      // Preserve previously verified bounds if new scan could not read
      if (!bounds && existingBoundsMap.has(asset.name)) {
        bounds = (existingBoundsMap.get(asset.name) as LatLngBoundsBox) || null;
      }

      if (bounds) {
        boundsList.push(bounds);
      }

      files.push({
        id: `gh_${asset.id || Date.now()}`,
        fileName: asset.name,
        url: asset.downloadUrl,
        fileSize: asset.size,
        bounds,
        format: 'COG',
        uploadedAt: asset.updatedAt || new Date().toISOString(),
        source: 'github',
      });
    }

    const combinedBounds = computeCombinedBounds(boundsList);
    return {
      releaseName: releaseInfo.releaseName,
      files,
      combinedBounds,
      url: releaseInfo.htmlUrl || trimmed,
    };
  };

  // Handle adding new layer
  const handleAddLayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const name = layerName.trim();
    const path = sourcePath.trim();

    if (!path) {
      setErrorMessage(
        sourceType === 'firebase'
          ? 'Vui lòng nhập đường dẫn thư mục Firebase Storage.'
          : 'Vui lòng nhập link GitHub Release.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      let files: RasterFileItem[] = [];
      let combinedBounds: LatLngBoundsBox | null = null;
      let finalName = name;
      let storagePath = '';
      let githubReleaseUrl = '';

      if (sourceType === 'firebase') {
        const result = await scanFirebaseStorage(path);
        files = result.files;
        combinedBounds = result.combinedBounds;
        storagePath = result.cleanPath;
        if (!finalName) {
          finalName = storagePath.split('/').pop() || 'Bản đồ Raster';
        }
      } else {
        const result = await scanGithubRelease(path);
        files = result.files;
        combinedBounds = result.combinedBounds;
        githubReleaseUrl = result.url;
        if (!finalName) {
          finalName = result.releaseName || 'Bản đồ Raster';
        }
      }

      const docRef = await addDoc(collection(db, 'raster_layers'), {
        name: finalName,
        type: 'COG',
        source: sourceType,
        storagePath,
        githubReleaseUrl,
        files,
        bounds: combinedBounds,
        opacity: 1.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const newLayer: RasterLayer = {
        id: docRef.id,
        name: finalName,
        type: 'COG',
        source: sourceType,
        storagePath,
        githubReleaseUrl,
        files,
        bounds: combinedBounds,
        opacity: 1.0,
        createdAt: new Date().toISOString(),
      };

      const updated = [newLayer, ...layers];
      setLayers(updated);
      if (onLayersChange) onLayersChange(updated);

      setLayerName('');
      setSourcePath('');
      setSuccessMessage(`Đã thêm lớp "${finalName}" (${files.length} tệp)`);
    } catch (err: any) {
      console.error('Error adding raster layer:', err);
      setErrorMessage(err.message || 'Không thể thêm lớp raster.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle rescan & reindex bounding boxes for a layer
  const handleRescanLayer = async (layer: RasterLayer, fullScan: boolean = false) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setRefreshingLayerId(layer.id);

    try {
      let updatedFiles: RasterFileItem[] = [];
      let combinedBounds: LatLngBoundsBox | null = null;

      if (layer.source === 'firebase' || (!layer.githubReleaseUrl && layer.storagePath)) {
        const targetPath = layer.storagePath || layer.name;
        const result = await scanFirebaseStorage(targetPath, fullScan ? [] : layer.files);
        updatedFiles = result.files;
        combinedBounds = result.combinedBounds || (layer.bounds as LatLngBoundsBox) || null;
      } else if (layer.githubReleaseUrl) {
        const result = await scanGithubRelease(layer.githubReleaseUrl, fullScan ? [] : layer.files);
        updatedFiles = result.files;
        combinedBounds = result.combinedBounds || (layer.bounds as LatLngBoundsBox) || null;
      } else {
        // Fallback for custom files: re-inspect BBoxes
        const boundsList: (LatLngBoundsBox | null)[] = [];
        for (const file of layer.files) {
          let b = fullScan ? null : (file.bounds as LatLngBoundsBox | null);
          try {
            const info = await parseGeoTiffMetadata(file.url);
            if (info && info.bounds) {
              b = info.bounds;
              boundsList.push(b);
            }
          } catch (_) {}
          updatedFiles.push({ ...file, bounds: b });
        }
        combinedBounds = computeCombinedBounds(boundsList);
      }

      // Invalidate cache for refreshed files
      removeCachedRasters(layer.files.map((f) => f.url));

      await updateDoc(doc(db, 'raster_layers', layer.id), {
        files: updatedFiles,
        bounds: combinedBounds,
        updatedAt: new Date().toISOString(),
      });

      const updated = layers.map((l) =>
        l.id === layer.id
          ? {
              ...l,
              files: updatedFiles,
              bounds: combinedBounds,
              updatedAt: new Date().toISOString(),
            }
          : l
      );

      setLayers(updated);
      if (onLayersChange) onLayersChange(updated);
      setSuccessMessage(`Đã quét lại lớp "${layer.name}" (${updatedFiles.length} tệp)`);
    } catch (err: any) {
      console.error('Error rescanning layer:', err);
      setErrorMessage(err.message || 'Không thể quét lại lớp raster.');
    } finally {
      setRefreshingLayerId(null);
    }
  };

  // Handle Toggle Enabled/Disabled Layer
  const handleToggleEnabled = async (layer: RasterLayer) => {
    const nextState = layer.enabled === false ? true : false;
    try {
      await updateDoc(doc(db, 'raster_layers', layer.id), {
        enabled: nextState,
        updatedAt: new Date().toISOString(),
      });

      const updated = layers.map((l) => (l.id === layer.id ? { ...l, enabled: nextState } : l));
      setLayers(updated);
      if (onLayersChange) onLayersChange(updated);
    } catch (err: any) {
      console.error('Error toggling raster layer visibility:', err);
      setErrorMessage('Không thể cập nhật trạng thái hiển thị lớp raster.');
    }
  };

  // Handle Rename Layer
  const handleSaveRename = async (layerId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingLayerId(null);
      return;
    }

    try {
      await updateDoc(doc(db, 'raster_layers', layerId), {
        name: trimmed,
        updatedAt: new Date().toISOString(),
      });

      const updated = layers.map((l) => (l.id === layerId ? { ...l, name: trimmed } : l));
      setLayers(updated);
      if (onLayersChange) onLayersChange(updated);
      setEditingLayerId(null);
    } catch (err: any) {
      console.error('Error renaming layer:', err);
      setErrorMessage('Không thể đổi tên lớp raster.');
    }
  };

  // Handle Delete Layer
  const handleDeleteLayer = async (layer: RasterLayer) => {
    if (!window.confirm(`Xác nhận xóa lớp "${layer.name}"?`)) {
      return;
    }

    setDeletingLayerId(layer.id);
    try {
      await deleteDoc(doc(db, 'raster_layers', layer.id));
      removeCachedRasters(layer.files.map((f) => f.url));

      const updated = layers.filter((l) => l.id !== layer.id);
      setLayers(updated);
      if (onLayersChange) onLayersChange(updated);
      setSuccessMessage(`Đã xóa lớp "${layer.name}"`);
    } catch (err: any) {
      console.error('Error deleting layer:', err);
      setErrorMessage('Không thể xóa lớp raster.');
    } finally {
      setDeletingLayerId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {errorMessage && (
        <div className="flex items-center justify-between gap-2 p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg animate-fadeIn">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-red-100 rounded text-red-500"
            title="Đóng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center justify-between gap-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg animate-fadeIn">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 hover:bg-emerald-100 rounded text-emerald-500"
            title="Đóng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Unified Add Layer Form */}
      <form onSubmit={handleAddLayer} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Source Toggle Buttons */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shrink-0 shadow-sm">
            <button
              type="button"
              onClick={() => setSourceType('firebase')}
              className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${
                sourceType === 'firebase'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Firebase Storage"
            >
              <Cloud className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setSourceType('github')}
              className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${
                sourceType === 'github'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="GitHub Release"
            >
              <GithubCat className="w-4 h-4" />
            </button>
          </div>

          {/* Layer Name Input */}
          <input
            type="text"
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            placeholder="Tên lớp..."
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-44"
          />

          {/* Path or URL Input */}
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder={
                sourceType === 'firebase'
                  ? 'Thư mục Storage (vd: rasters/tapban1975)...'
                  : 'https://github.com/.../releases/tag/...'
              }
              className="text-xs border border-slate-300 rounded-lg pl-7 pr-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
            />
            <div className="absolute left-2 top-2 text-slate-400 pointer-events-none">
              {sourceType === 'firebase' ? <Cloud className="w-3.5 h-3.5" /> : <GithubCat className="w-3.5 h-3.5" />}
            </div>
          </div>

          {/* Add Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
            title="Thêm lớp"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </form>

      {/* Layers List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-xs gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span>Đang tải...</span>
          </div>
        ) : layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg gap-1.5">
            <Layers className="w-6 h-6 text-slate-300" />
            <span>Chưa có lớp raster nào</span>
          </div>
        ) : (
          layers.map((layer) => {
            const isEditing = editingLayerId === layer.id;
            const isRefreshing = refreshingLayerId === layer.id;
            const isDeleting = deletingLayerId === layer.id;

            const totalSize = (layer.files || []).reduce((acc, f) => acc + (f.fileSize || 0), 0);
            const isFirebase = layer.source === 'firebase' || (!layer.githubReleaseUrl && !!layer.storagePath);
            const hasBounds = !!layer.bounds;
            const isEnabled = layer.enabled !== false;

            return (
              <div
                key={layer.id}
                className={`bg-white border rounded-lg p-2.5 flex items-center justify-between gap-3 hover:border-slate-300 transition-colors shadow-2xs ${
                  isEnabled ? 'border-slate-200' : 'border-slate-200 bg-slate-50/60 opacity-75'
                }`}
              >
                {/* Left: Source Icon & Info */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      !isEnabled
                        ? 'bg-slate-100 text-slate-400'
                        : isFirebase
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                    title={isFirebase ? 'Firebase Storage' : 'GitHub Release'}
                  >
                    {isFirebase ? <Cloud className="w-4 h-4" /> : <GithubCat className="w-4 h-4" />}
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(layer.id);
                          if (e.key === 'Escape') setEditingLayerId(null);
                        }}
                        autoFocus
                        className="text-xs border border-blue-400 rounded px-2 py-1 bg-white focus:outline-none w-full"
                      />
                      <button
                        onClick={() => handleSaveRename(layer.id)}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        title="Lưu"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingLayerId(null)}
                        className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        title="Hủy"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold truncate ${
                          isEnabled ? 'text-slate-800' : 'text-slate-500 line-through decoration-slate-400'
                        }`}
                        title={layer.name.startsWith('.') ? layer.name.substring(1) : layer.name}
                      >
                        {layer.name.startsWith('.') ? layer.name.substring(1) : layer.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span>{layer.files?.length || 0} tệp</span>
                        <span>•</span>
                        <span>{formatBytes(totalSize)}</span>
                        <span>•</span>
                        <span className={hasBounds ? 'text-emerald-600' : 'text-amber-500'}>
                          {hasBounds ? 'Đã có BBox' : 'Chưa có BBox'}
                        </span>
                        {!isEnabled && (
                          <>
                            <span>•</span>
                            <span className="text-red-500 font-medium">Đã ẩn</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                {!isEditing && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleEnabled(layer)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isEnabled
                          ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                      title={isEnabled ? 'Hiện trên bản đồ (Bấm để ẩn)' : 'Đang ẩn trên bản đồ (Bấm để hiện)'}
                    >
                      {isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleRescanLayer(layer, false)}
                      disabled={isRefreshing}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Quét cập nhật (Giữ nguyên BBox hiện có)"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Xác nhận quét lại toàn bộ (Reset)? Thao tác này sẽ xóa mọi BBox cũ và quét lại từ đầu.')) {
                          handleRescanLayer(layer, true);
                        }
                      }}
                      disabled={isRefreshing}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Quét mới toàn bộ (Reset BBox)"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingLayerId(layer.id);
                        setEditingName(layer.name);
                      }}
                      className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                      title="Đổi tên"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteLayer(layer)}
                      disabled={isDeleting}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Xóa"
                    >
                      {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
