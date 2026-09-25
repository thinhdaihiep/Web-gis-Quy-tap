import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { RasterLayer, RasterFileItem, LatLngBoundsBox, normalizeBoundsBox, RasterLoadingStatus } from '../types';
import {
  Layers,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  Pencil,
  Check,
  X,
  File,
  HardDrive,
  Trash2,
  FolderPlus,
  Compass,
  Link,
  RefreshCw,
  Scan,
  ExternalLink,
  MapPin,
  Upload,
  Eye,
} from 'lucide-react';
import { parseGeoTiffMetadata } from '../utils/geotiffLoader';
import { fetchGitHubReleaseAssets, parseGitHubUrl } from '../utils/githubRelease';
import { removeCachedRasters, clearAllRasterCache } from '../utils/rasterCache';

interface RasterManagementTabProps {
  onLayersChange?: (layers: RasterLayer[]) => void;
  onSelectAndFlyToRaster?: (layerId: string, bounds?: LatLngBoundsBox | null) => void;
  rasterStatus?: RasterLoadingStatus;
}

export const RasterManagementTab: React.FC<RasterManagementTabProps> = ({
  onLayersChange,
  onSelectAndFlyToRaster,
  rasterStatus,
}) => {
  const [layers, setLayers] = useState<RasterLayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New layer input state
  const [newLayerName, setNewLayerName] = useState('');
  const [newGithubUrl, setNewGithubUrl] = useState('');
  const [isCreatingLayer, setIsCreatingLayer] = useState(false);
  const [isScanningGithub, setIsScanningGithub] = useState(false);

  // Editing layer state
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingGithubUrl, setEditingGithubUrl] = useState('');

  // Indexing state
  const [indexingLayerId, setIndexingLayerId] = useState<string | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);

  // Upload/Manual URL state
  const [uploadingLayerId, setUploadingLayerId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [customUrlInput, setCustomUrlInput] = useState<{ layerId: string; url: string; fileName: string } | null>(null);

  // Notifications
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    fetchLayers();
  }, []);

  useEffect(() => {
    if (rasterStatus?.state === 'error' && rasterStatus?.error && rasterStatus.error !== errorMessage) {
      setErrorMessage(rasterStatus.error);
    }
  }, [rasterStatus?.state, rasterStatus?.error, errorMessage]);

  const fetchLayers = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'raster_layers'));
      const fetchedLayers: RasterLayer[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let files: RasterFileItem[] = Array.isArray(data.files) ? data.files : [];

        // Backward compatibility
        if (files.length === 0 && data.url) {
          files = [
            {
              id: `${docSnap.id}_legacy_file`,
              fileName: data.name || 'GeoTIFF / COG File',
              url: data.url,
              format: 'COG',
              minZoom: data.minZoom || 12,
              maxZoom: data.maxZoom || 18,
              bounds: data.bounds || null,
              uploadedAt: data.createdAt || new Date().toISOString(),
              source: 'url',
            },
          ];
        }

        fetchedLayers.push({
          id: docSnap.id,
          name: data.name || 'Bản đồ nền Raster',
          type: data.type || 'COG',
          files: files,
          opacity: data.opacity ?? 1.0,
          githubReleaseUrl: data.githubReleaseUrl || '',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt,
        });
      });

      // Sort by creation date descending
      fetchedLayers.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setLayers(fetchedLayers);
      if (onLayersChange) {
        onLayersChange(fetchedLayers);
      }
    } catch (error: any) {
      console.error('Error fetching raster layers:', error);
      const msg = 'Không thể tải danh sách lớp bản đồ nền.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Tạo lớp bản đồ mới (kèm tùy chọn quét tự động link GitHub Release)
  const handleCreateLayer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = newLayerName.trim();
    const trimmedUrl = newGithubUrl.trim();

    if (!trimmedName && !trimmedUrl) {
      setErrorMessage('Vui lòng nhập tên lớp bản đồ hoặc dán đường link GitHub Release.');
      return;
    }

    setIsCreatingLayer(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let layerName = trimmedName;
      let files: RasterFileItem[] = [];

      // Nếu có link GitHub Release, tự động quét danh sách assets
      if (trimmedUrl) {
        setIsScanningGithub(true);
        try {
          const releaseInfo = await fetchGitHubReleaseAssets(trimmedUrl);
          if (!layerName) {
            layerName = `${releaseInfo.repo} (${releaseInfo.tag})`;
          }

          // Lọc các file raster .tif / .geotiff
          const rasterAssets = releaseInfo.assets.filter((a) => {
            const lower = a.name.toLowerCase();
            return lower.endsWith('.tif') || lower.endsWith('.tiff') || lower.endsWith('.geotiff');
          });

          files = (rasterAssets.length > 0 ? rasterAssets : releaseInfo.assets).map((asset) => ({
            id: `gh_${asset.id}_${Date.now()}`,
            fileName: asset.name,
            url: asset.downloadUrl,
            format: 'COG',
            minZoom: 12,
            maxZoom: 18,
            fileSize: asset.size,
            uploadedAt: asset.updatedAt || asset.createdAt || new Date().toISOString(),
            source: 'github',
          }));
        } catch (ghErr: any) {
          console.warn('GitHub Scan Error:', ghErr);
          const msg = `Lỗi quét GitHub: ${ghErr.message}`;
          setErrorMessage(msg);
          setIsCreatingLayer(false);
          setIsScanningGithub(false);
          return;
        }
        setIsScanningGithub(false);
      }

      if (!layerName) {
        layerName = 'Lớp bản đồ Raster mới';
      }

      const newLayerData = {
        name: layerName,
        type: 'COG' as const,
        files: files,
        opacity: 1.0,
        githubReleaseUrl: trimmedUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'raster_layers'), newLayerData);
      const createdLayer: RasterLayer = {
        id: docRef.id,
        ...newLayerData,
      };

      const updatedLayers = [createdLayer, ...layers];
      setLayers(updatedLayers);
      setNewLayerName('');
      setNewGithubUrl('');
      setSuccessMessage(
        `Đã tạo lớp "${layerName}" ${files.length > 0 ? `với ${files.length} file COG từ GitHub Release. Hãy bấm "Cập nhật chỉ mục" để xác định phạm vi tọa độ.` : ''}`
      );
      if (onLayersChange) {
        onLayersChange(updatedLayers);
      }
    } catch (error: any) {
      console.error('Error creating layer:', error);
      const msg = `Lỗi tạo lớp: ${error.message}`;
      setErrorMessage(msg);
    } finally {
      setIsCreatingLayer(false);
      setIsScanningGithub(false);
    }
  };

  // 2. Quét lại / Đồng bộ lại danh sách Assets từ link GitHub Release của lớp
  const handleSyncAndIndexLayer = async (layer: RasterLayer) => {
    setIndexingLayerId(layer.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. Tạm dừng và reset hoàn toàn việc tải raster trên bản đồ trong khi đang quét và cập nhật Bounding Box
    window.dispatchEvent(
      new CustomEvent('pause-raster-loading', {
        detail: {
          layerId: layer.id,
          message: `Đang tạm dừng tải để cập nhật chỉ mục Bounding Box cho "${layer.name}"...`,
        },
      })
    );

    // Tự động xóa bộ nhớ đệm (IndexedDB & in-memory) của các file trong lớp để nạp file mới nhất
    const oldUrls = (layer.files || []).map((f) => f.url).filter(Boolean);
    if (oldUrls.length > 0) {
      await removeCachedRasters(oldUrls);
      window.dispatchEvent(
        new CustomEvent('clear-raster-cache', {
          detail: { layerId: layer.id, urls: oldUrls },
        })
      );
    }

    try {
      let targetFiles: RasterFileItem[] = [];

      // Nếu lớp có link GitHub Release, lấy lại danh sách assets mới nhất từ GitHub
      if (layer.githubReleaseUrl) {
        setIndexingProgress({
          current: 0,
          total: 1,
          fileName: 'Đang kết nối GitHub để lấy danh sách file mới nhất...',
        });

        try {
          const releaseInfo = await fetchGitHubReleaseAssets(layer.githubReleaseUrl);
          const rasterAssets = releaseInfo.assets.filter((a) => {
            const lower = a.name.toLowerCase();
            return lower.endsWith('.tif') || lower.endsWith('.tiff') || lower.endsWith('.geotiff');
          });

          const assetsToUse = rasterAssets.length > 0 ? rasterAssets : releaseInfo.assets;

          targetFiles = assetsToUse.map((asset) => {
            const existingFile = layer.files?.find((f) => f.fileName === asset.name || f.url === asset.downloadUrl);
            return {
              id: existingFile?.id || `gh_${asset.id}_${Date.now()}`,
              fileName: asset.name,
              url: asset.downloadUrl,
              format: 'COG',
              minZoom: 12,
              maxZoom: 18,
              fileSize: asset.size,
              bounds: existingFile?.bounds || null, // Bảo toàn bounds cũ nếu đã có, không xóa sạch
              uploadedAt: asset.updatedAt || asset.createdAt || new Date().toISOString(),
              source: 'github',
            };
          });
        } catch (ghErr: any) {
          console.warn('Lỗi lấy assets GitHub:', ghErr);
          // Nếu lỗi gọi GitHub, sử dụng danh sách file hiện có và bảo toàn bounds cũ
          targetFiles = layer.files.map((f) => ({ ...f }));
        }
      } else {
        // Bảo toàn bounds cũ của file
        targetFiles = layer.files.map((f) => ({ ...f }));
      }

      if (targetFiles.length === 0) {
        const msg = 'Không tìm thấy file raster nào trong lớp này để cập nhật chỉ mục.';
        setErrorMessage(msg);
        setIndexingLayerId(null);
        setIndexingProgress(null);
        return;
      }

      const updatedFiles: RasterFileItem[] = [...targetFiles];
      let indexedCount = 0;
      let failedCount = 0;
      const errorsList: string[] = [];

      // Quét từng file để trích xuất Bounding Box trực tiếp từ Header của file COG (HTTP Range Request)
      for (let i = 0; i < updatedFiles.length; i++) {
        const item = updatedFiles[i];
        setIndexingProgress({
          current: i + 1,
          total: updatedFiles.length,
          fileName: item.fileName,
        });

        try {
          const parsed = await parseGeoTiffMetadata(item.url);
          const box = normalizeBoundsBox(parsed?.bounds);
          if (box) {
            updatedFiles[i] = {
              ...item,
              bounds: box,
              format: 'COG',
            };
            indexedCount++;
          } else {
            console.warn(`File ${item.fileName} không trích xuất được tọa độ từ Header. Chi tiết:`, parsed);
            errorsList.push(`${item.fileName}: Không tìm thấy thông tin toạ độ trong Header`);
            failedCount++;
          }
        } catch (itemErr: any) {
          console.warn(`Lỗi đọc header file ${item.fileName}:`, itemErr);
          const msg = `${item.fileName}: ${itemErr?.message || 'Lỗi đọc Header'}`;
          errorsList.push(msg);
          failedCount++;
        }
      }

      // Lưu danh sách mới và toàn bộ chỉ mục mới vào Firestore
      await updateDoc(doc(db, 'raster_layers', layer.id), {
        files: updatedFiles,
        updatedAt: new Date().toISOString(),
      });

      const updatedLayers = layers.map((l) =>
        l.id === layer.id ? { ...l, files: updatedFiles, updatedAt: new Date().toISOString() } : l
      );

      setLayers(updatedLayers);
      if (indexedCount > 0) {
        setSuccessMessage(
          `Hoàn tất cập nhật chỉ mục từ Header COG! Đã định vị Bounding Box thành công cho ${indexedCount}/${updatedFiles.length} file.`
        );
      } else if (failedCount > 0) {
        setErrorMessage(
          `Chưa trích xuất được BBox (${failedCount} file). Chi tiết lỗi: ${errorsList.slice(0, 2).join(' | ')}`
        );
      }
      if (onLayersChange) {
        onLayersChange(updatedLayers);
      }
    } catch (err: any) {
      console.error('Error indexing bounds:', err);
      const msg = `Lỗi cập nhật chỉ mục: ${err.message}`;
      setErrorMessage(msg);
    } finally {
      setIndexingLayerId(null);
      setIndexingProgress(null);
      // 2. Khôi phục và bắt đầu tải lại raster trên bản đồ với toạ độ Bounding Box mới nhất
      window.dispatchEvent(
        new CustomEvent('resume-raster-loading', {
          detail: { layerId: layer.id },
        })
      );
    }
  };

  // 4. Bắt đầu sửa thông tin lớp
  const handleStartEdit = (layer: RasterLayer) => {
    setEditingLayerId(layer.id);
    setEditingName(layer.name);
    setEditingGithubUrl(layer.githubReleaseUrl || '');
  };

  // Lưu thông tin lớp đã sửa
  const handleSaveEdit = async (layerId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setErrorMessage('Tên lớp không được để trống.');
      return;
    }

    try {
      await updateDoc(doc(db, 'raster_layers', layerId), {
        name: trimmed,
        githubReleaseUrl: editingGithubUrl.trim(),
        updatedAt: new Date().toISOString(),
      });

      const updatedLayers = layers.map((l) =>
        l.id === layerId
          ? { ...l, name: trimmed, githubReleaseUrl: editingGithubUrl.trim(), updatedAt: new Date().toISOString() }
          : l
      );
      setLayers(updatedLayers);
      setEditingLayerId(null);
      setEditingName('');
      setEditingGithubUrl('');
      setSuccessMessage('Đã cập nhật thông tin lớp thành công.');
      if (onLayersChange) {
        onLayersChange(updatedLayers);
      }
    } catch (error: any) {
      console.error('Error renaming layer:', error);
      const msg = `Lỗi sửa lớp: ${error.message}`;
      setErrorMessage(msg);
    }
  };

  // 5. Xóa lớp bản đồ
  const handleDeleteLayer = async (layer: RasterLayer) => {
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa lớp "${layer.name}" và toàn bộ ${layer.files.length} file raster bên trong?`
      )
    ) {
      return;
    }

    try {
      // Xóa cache client
      const urlsToClear = (layer.files || []).map((f) => f.url).filter(Boolean);
      if (urlsToClear.length > 0) {
        await removeCachedRasters(urlsToClear);
        window.dispatchEvent(
          new CustomEvent('clear-raster-cache', {
            detail: { layerId: layer.id, urls: urlsToClear },
          })
        );
      }

      await deleteDoc(doc(db, 'raster_layers', layer.id));

      // Xóa file trên Firebase Storage nếu có
      for (const f of layer.files) {
        if (f.url && f.url.includes('firebasestorage.googleapis.com')) {
          try {
            const urlObj = new URL(f.url);
            let path = decodeURIComponent(urlObj.pathname.split('/o/')[1]).split('?')[0];
            const fileRef = ref(storage, path);
            await deleteObject(fileRef);
          } catch (storageErr) {
            console.warn('Could not delete storage file:', storageErr);
          }
        }
      }

      const updatedLayers = layers.filter((l) => l.id !== layer.id);
      setLayers(updatedLayers);
      setSuccessMessage(`Đã xóa lớp "${layer.name}".`);
      if (onLayersChange) {
        onLayersChange(updatedLayers);
      }
    } catch (error: any) {
      console.error('Error deleting layer:', error);
      const msg = `Lỗi khi xóa lớp: ${error.message}`;
      setErrorMessage(msg);
    }
  };

  // 6. Thêm file trực tiếp bằng đường link URL
  const handleAddCustomUrlFile = async (layerId: string) => {
    if (!customUrlInput || !customUrlInput.url.trim()) return;
    const targetLayer = layers.find((l) => l.id === layerId);
    if (!targetLayer) return;

    const url = customUrlInput.url.trim();
    let fileName = customUrlInput.fileName.trim();
    if (!fileName) {
      try {
        const parts = new URL(url).pathname.split('/');
        fileName = parts[parts.length - 1] || 'raster_file.tif';
      } catch {
        fileName = 'raster_file.tif';
      }
    }

    try {
      let bounds: LatLngBoundsBox | null = null;
      try {
        const parsed = await parseGeoTiffMetadata(url);
        bounds = normalizeBoundsBox(parsed.bounds);
      } catch (err) {
        console.warn('Could not parse metadata from URL:', err);
      }

      const newFileItem: RasterFileItem = {
        id: `url_${Date.now()}`,
        fileName,
        url,
        format: 'COG',
        minZoom: 12,
        maxZoom: 18,
        bounds,
        uploadedAt: new Date().toISOString(),
        source: 'url',
      };

      const updatedFiles = [...targetLayer.files, newFileItem];
      await updateDoc(doc(db, 'raster_layers', layerId), {
        files: updatedFiles,
        updatedAt: new Date().toISOString(),
      });

      const updatedLayers = layers.map((l) =>
        l.id === layerId ? { ...l, files: updatedFiles, updatedAt: new Date().toISOString() } : l
      );

      setLayers(updatedLayers);
      setCustomUrlInput(null);
      setSuccessMessage(`Đã thêm file "${fileName}" vào lớp.`);
      if (onLayersChange) {
        onLayersChange(updatedLayers);
      }
    } catch (err: any) {
      const msg = `Lỗi thêm URL: ${err.message}`;
      setErrorMessage(msg);
    }
  };

  // 7. Xóa 1 file khỏi lớp
  const handleDeleteFile = async (layer: RasterLayer, fileItem: RasterFileItem) => {
    if (!window.confirm(`Xác nhận xóa file "${fileItem.fileName}" khỏi lớp "${layer.name}"?`)) {
      return;
    }

    try {
      if (fileItem.url) {
        await removeCachedRasters([fileItem.url]);
        window.dispatchEvent(
          new CustomEvent('clear-raster-cache', {
            detail: { urls: [fileItem.url] },
          })
        );
      }

      if (fileItem.url && fileItem.url.includes('firebasestorage.googleapis.com')) {
        try {
          const urlObj = new URL(fileItem.url);
          let path = decodeURIComponent(urlObj.pathname.split('/o/')[1]).split('?')[0];
          const fileRef = ref(storage, path);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn('Could not delete file from storage:', storageErr);
        }
      }

      const updatedFiles = layer.files.filter((f) => f.id !== fileItem.id);
      await updateDoc(doc(db, 'raster_layers', layer.id), {
        files: updatedFiles,
        updatedAt: new Date().toISOString(),
      });

      const updatedLayers = layers.map((l) =>
        l.id === layer.id ? { ...l, files: updatedFiles, updatedAt: new Date().toISOString() } : l
      );

      setLayers(updatedLayers);
      setSuccessMessage(`Đã xóa file "${fileItem.fileName}".`);
      if (onLayersChange) {
        onLayersChange(updatedLayers);
      }
    } catch (error: any) {
      console.error('Error deleting file:', error);
      const msg = `Lỗi xóa file: ${error.message}`;
      setErrorMessage(msg);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Alert Messages */}
      {errorMessage && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center justify-between text-xs border border-red-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-red-100 rounded text-red-600 cursor-pointer"
            title="Đóng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-between text-xs border border-emerald-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 hover:bg-emerald-100 rounded text-emerald-600 cursor-pointer"
            title="Đóng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Box: Thêm lớp từ GitHub Releases hoặc tạo lớp mới */}
      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
        <form onSubmit={handleCreateLayer} className="space-y-2.5">
          <div className="flex items-center gap-2">
            {/* Input Link GitHub Release */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Link className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={newGithubUrl}
                onChange={(e) => {
                  setNewGithubUrl(e.target.value);
                  const parsed = parseGitHubUrl(e.target.value);
                  if (parsed && !newLayerName) {
                    setNewLayerName(`Bản đồ ${parsed.repo} (${parsed.tag || 'Release'})`);
                  }
                }}
                placeholder="Dán link GitHub Release (VD: https://github.com/thinhdaihiep/Web-gis-Quy-tap/releases/tag/map1975)..."
                disabled={isCreatingLayer}
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
              />
            </div>

            {/* Input Tên lớp (Tùy chọn) */}
            <div className="relative w-1/3 min-w-[160px]">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                <FolderPlus className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                placeholder="Tên lớp (tự động điền nếu để trống)..."
                disabled={isCreatingLayer}
                className="w-full pl-8 pr-2.5 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
              />
            </div>

            {/* Nút Tạo lớp & Tự động quét */}
            <button
              type="submit"
              disabled={(!newLayerName.trim() && !newGithubUrl.trim()) || isCreatingLayer}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed shrink-0"
              title="Tạo lớp và quét danh sách file từ GitHub Release"
            >
              {isCreatingLayer || isScanningGithub ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Tạo & Quét GitHub</span>
            </button>
          </div>
        </form>
      </div>

      {/* Layers List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Danh sách lớp Raster (Cloud-Optimized GeoTIFF - EPSG:4326)</span>
            <span className="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full text-[11px]">
              {layers.length}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-12 bg-white rounded-lg border border-slate-200">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : layers.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-lg border border-dashed border-slate-300 text-slate-500">
            <Layers className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-xs">Chưa có lớp bản đồ nền raster nào.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Dán link GitHub Release ở trên và bấm <strong>"Tạo & Quét GitHub"</strong> để bắt đầu.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {layers.map((layer) => {
              const isIndexingThis = indexingLayerId === layer.id;
              const files = layer.files || [];
              const indexedCount = files.filter((f) => !!f.bounds).length;
              const allIndexed = files.length > 0 && indexedCount === files.length;

              return (
                <div
                  key={layer.id}
                  className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden transition hover:border-slate-300"
                >
                  {/* Layer Header */}
                  <div className="p-3 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                      {editingLayerId === layer.id ? (
                        <div className="flex flex-col gap-1.5 flex-1 max-w-lg">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            placeholder="Tên lớp..."
                            className="px-2 py-1 text-xs border border-blue-400 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingGithubUrl}
                              onChange={(e) => setEditingGithubUrl(e.target.value)}
                              placeholder="Link GitHub Release..."
                              className="px-2 py-1 text-[11px] border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1"
                            />
                            <button
                              onClick={() => handleSaveEdit(layer.id)}
                              className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                              title="Lưu thay đổi"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingLayerId(null)}
                              className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer"
                              title="Hủy"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-semibold text-slate-800 text-xs truncate">
                            {layer.name}
                          </span>
                          <span className="text-[11px] text-slate-500 font-normal shrink-0">
                            ({files.length} file)
                          </span>
                          {layer.githubReleaseUrl && (
                            <a
                              href={layer.githubReleaseUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 hover:text-blue-600 transition shrink-0"
                              title="Mở GitHub Release"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {files.length > 0 && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                                allIndexed
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                              title={allIndexed ? 'Đã lập chỉ mục 100%' : 'Chưa lập chỉ mục Bounding Box'}
                            >
                              {allIndexed
                                ? '✓ Chỉ mục 100%'
                                : `Chỉ mục: ${indexedCount}/${files.length}`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Layer Actions (Icons) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Nút Xem / Phóng tới lớp trên bản đồ */}
                      {onSelectAndFlyToRaster && (
                        <button
                          onClick={() => onSelectAndFlyToRaster(layer.id, layer.bounds || files[0]?.bounds)}
                          className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded transition cursor-pointer flex items-center justify-center shadow-xs"
                          title="Bật và phóng bản đồ tới phạm vi lớp này"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Nút Tải lại danh sách (Đồng bộ + Chỉ mục) */}
                      <button
                        onClick={() => handleSyncAndIndexLayer(layer)}
                        disabled={isIndexingThis || (files.length === 0 && !layer.githubReleaseUrl)}
                        className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:bg-slate-100 disabled:text-slate-300 rounded transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center shadow-xs"
                        title="Tải lại danh sách file từ GitHub Release và cập nhật lại toàn bộ chỉ mục"
                      >
                        {isIndexingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Nút Thêm link URL đơn lẻ */}
                      <button
                        onClick={() =>
                          setCustomUrlInput(
                            customUrlInput?.layerId === layer.id
                              ? null
                              : { layerId: layer.id, url: '', fileName: '' }
                          )
                        }
                        className="p-1.5 text-slate-600 hover:bg-slate-200 rounded transition cursor-pointer"
                        title="Thêm file bằng đường dẫn URL trực tiếp"
                      >
                        <Link className="w-3.5 h-3.5" />
                      </button>

                      {/* Sửa tên lớp */}
                      {editingLayerId !== layer.id && (
                        <button
                          onClick={() => handleStartEdit(layer)}
                          className="p-1.5 text-slate-600 hover:bg-slate-200 rounded transition cursor-pointer"
                          title="Sửa thông tin lớp"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Xóa lớp */}
                      <button
                        onClick={() => handleDeleteLayer(layer)}
                        className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded transition cursor-pointer"
                        title="Xóa toàn bộ lớp"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Indexing Progress Indicator */}
                  {isIndexingThis && indexingProgress && (
                    <div className="p-2.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
                        <span className="truncate">
                          Đang quét tọa độ Bounding Box ({indexingProgress.current}/{indexingProgress.total}):{' '}
                          <strong>{indexingProgress.fileName}</strong>
                        </span>
                      </div>
                      <span className="font-mono font-bold shrink-0 ml-2">
                        {Math.round((indexingProgress.current / indexingProgress.total) * 100)}%
                      </span>
                    </div>
                  )}

                  {/* Form thêm URL đơn lẻ cho lớp này */}
                  {customUrlInput?.layerId === layer.id && (
                    <div className="p-3 bg-blue-50/60 border-b border-blue-100 flex items-center gap-2 animate-in fade-in">
                      <input
                        type="text"
                        value={customUrlInput.url}
                        onChange={(e) =>
                          setCustomUrlInput({ ...customUrlInput, url: e.target.value })
                        }
                        placeholder="Dán link trực tiếp file .tif / .geotiff..."
                        className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={customUrlInput.fileName}
                        onChange={(e) =>
                          setCustomUrlInput({ ...customUrlInput, fileName: e.target.value })
                        }
                        placeholder="Tên file (tùy chọn)..."
                        className="w-1/3 px-2.5 py-1.5 text-xs bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => handleAddCustomUrlFile(layer.id)}
                        disabled={!customUrlInput.url.trim()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded text-xs font-semibold cursor-pointer shrink-0"
                      >
                        Thêm
                      </button>
                      <button
                        onClick={() => setCustomUrlInput(null)}
                        className="p-1.5 text-slate-500 hover:bg-slate-200 rounded cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Files inside Layer */}
                  <div className="p-3">
                    {files.length === 0 ? (
                      <div className="py-4 px-3 border border-dashed border-slate-200 rounded-md text-center bg-slate-50/50">
                        <Scan className="w-5 h-5 mx-auto text-slate-400 mb-1" />
                        <p className="text-[11px] text-slate-600 font-medium">
                          Chưa có file raster nào trong lớp này
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Bấm nút <strong>"Đồng bộ GitHub"</strong> hoặc biểu tượng <strong>Liên kết URL</strong> ở trên để nạp file.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1">
                        {files.map((file) => {
                          const isLoaded = rasterStatus?.fileStatuses?.some(
                            (fs) => fs.name === file.fileName && fs.state === 'loaded'
                          );
                          const isCurrentlyLoading =
                            rasterStatus?.currentLoadingName === file.fileName ||
                            rasterStatus?.fileStatuses?.some(
                              (fs) => fs.name === file.fileName && fs.state === 'loading'
                            );
                          const isError = !isLoaded && !isCurrentlyLoading && rasterStatus?.fileStatuses?.some(
                            (fs) => fs.name === file.fileName && fs.state === 'error'
                          );
                          const isInViewport = rasterStatus?.fileStatuses?.some(
                            (fs) => fs.name === file.fileName && fs.inViewport
                          );

                          return (
                            <div
                              key={file.id}
                              className={`py-2 px-1.5 flex items-center justify-between gap-2 rounded transition ${
                                isError
                                  ? 'bg-rose-50/80 border border-rose-200'
                                  : isLoaded
                                  ? 'bg-emerald-50/50 border border-emerald-100'
                                  : isCurrentlyLoading
                                  ? 'bg-amber-50/70 border border-amber-200'
                                  : isInViewport
                                  ? 'bg-amber-50/40 border border-amber-100'
                                  : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <File
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isError
                                      ? 'text-rose-500'
                                      : isLoaded
                                      ? 'text-emerald-500'
                                      : isCurrentlyLoading || isInViewport
                                      ? 'text-amber-500'
                                      : 'text-blue-600'
                                  }`}
                                />
                                <div className="truncate min-w-0">
                                  <div className="flex items-center gap-2 truncate">
                                    <p
                                      className={`text-xs truncate ${
                                        isError
                                          ? 'font-bold text-rose-700'
                                          : isLoaded
                                          ? 'font-bold text-emerald-700'
                                          : isCurrentlyLoading
                                          ? 'font-bold text-amber-600'
                                          : isInViewport
                                          ? 'font-bold text-amber-700'
                                          : 'font-medium text-slate-700'
                                      }`}
                                      title={file.fileName}
                                    >
                                      {file.fileName}
                                    </p>
                                    {isError && (
                                      <span
                                        className="text-rose-700 bg-rose-100/90 px-1.5 py-0.2 rounded text-[9px] font-bold border border-rose-300 flex items-center gap-1 shrink-0 shadow-2xs"
                                        title="Lỗi tải file raster (HTTP 404 / Không tìm thấy file trên GitHub hoặc URL hỏng)"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                        Lỗi tải (404/Không tìm thấy)
                                      </span>
                                    )}
                                    {isCurrentlyLoading && !isLoaded && (
                                      <span
                                        className="text-amber-700 bg-amber-100/90 px-1.5 py-0.2 rounded text-[9px] font-bold border border-amber-300 flex items-center gap-1 shrink-0 shadow-2xs"
                                        title="Raster này đang được tải xuống và nạp lên bản đồ"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        Đang tải
                                      </span>
                                    )}
                                    {!isCurrentlyLoading && isInViewport && !isLoaded && !isError && (
                                      <span
                                        className="text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded text-[9px] font-bold border border-amber-300 flex items-center gap-1 shrink-0 shadow-2xs"
                                        title="Raster này nằm trong khung hình và đang chờ tải"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        Trong khung hình
                                      </span>
                                    )}
                                    {isLoaded && (
                                      <span
                                        className="text-emerald-700 bg-emerald-100/80 px-1.5 py-0.2 rounded text-[9px] font-bold border border-emerald-300 flex items-center gap-1 shrink-0 shadow-2xs"
                                        title="Raster này đã tải xong"
                                      >
                                        <CheckCircle className="w-3 h-3" />
                                        Đã tải
                                      </span>
                                    )}
                                    {file.url && (
                                      <a
                                        href={file.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-slate-400 hover:text-blue-600 transition shrink-0"
                                        title="Tải / Mở link gốc"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                    {file.format && (
                                      <span className="text-blue-700 bg-blue-50 px-1 rounded text-[9px] font-semibold">
                                        {file.format}
                                      </span>
                                    )}
                                    {file.fileSize && (
                                      <span className="flex items-center gap-0.5">
                                        <HardDrive className="w-2.5 h-2.5" />
                                        {formatFileSize(file.fileSize)}
                                      </span>
                                    )}
                                    {(() => {
                                      const box = normalizeBoundsBox(file.bounds);
                                      return box ? (
                                        <span
                                          className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded text-[9px] font-mono border border-emerald-200"
                                          title={`Phạm vi EPSG:4326: [${box.south.toFixed(3)}, ${box.west.toFixed(3)}] đến [${box.north.toFixed(3)}, ${box.east.toFixed(3)}]`}
                                        >
                                          BBox: [{box.south.toFixed(2)}, {box.west.toFixed(2)}]
                                        </span>
                                      ) : (
                                        <span className="text-amber-600 bg-amber-50 px-1 rounded text-[9px]">
                                          Chưa có BBox
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Xem / Phóng tới file này */}
                                {onSelectAndFlyToRaster && (
                                  <button
                                    onClick={() => onSelectAndFlyToRaster(layer.id, file.bounds || layer.bounds)}
                                    className={`p-1.5 rounded transition cursor-pointer ${
                                      isInViewport
                                        ? 'text-amber-600 hover:bg-amber-100/70'
                                        : 'text-blue-600 hover:bg-blue-50'
                                    }`}
                                    title="Phóng bản đồ tới phạm vi file này"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Delete File Button */}
                                <button
                                  onClick={() => handleDeleteFile(layer, file)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                  title="Xóa file này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
