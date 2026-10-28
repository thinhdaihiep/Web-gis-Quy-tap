import React from 'react';
import { BaseMapType, RasterLayer } from '../types';
import { Map, Satellite, Plus, Minus, LocateFixed, Loader2, Mountain } from 'lucide-react';

interface MapOverlayProps {
  currentBaseMap: BaseMapType;
  onBaseMapChange: (baseMap: BaseMapType) => void;
  isRasterVisible: boolean;
  onToggleRasterVisibility: (visible: boolean) => void;
  rasterLayers?: RasterLayer[];
  activeRasterLayerId?: string | null;
  onRasterChange?: (id: string) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onLocateUser?: () => void;
  isLocating?: boolean;
  zoomLevel?: number | null;
  currentRole?: 'admin' | 'editor' | 'guest';
}

export const MapOverlay: React.FC<MapOverlayProps> = ({
  currentBaseMap,
  onBaseMapChange,
  isRasterVisible,
  onToggleRasterVisibility,
  rasterLayers = [],
  activeRasterLayerId = null,
  onRasterChange,
  onZoomIn,
  onZoomOut,
  onLocateUser,
  isLocating = false,
  currentRole = 'guest',
}) => {
  const canAccessFirebase = currentRole === 'admin' || currentRole === 'editor';
  const accessibleLayers = rasterLayers.filter((l) => {
    if (l.enabled === false) return false;
    const isFirebase = l.source === 'firebase' || (!l.githubReleaseUrl && !!l.storagePath);
    if (isFirebase && !canAccessFirebase) return false;
    return true;
  });

  return (
    <div className="absolute top-4 right-4 z-[500] flex items-start gap-2 pointer-events-none">
      {/* 1. Điều khiển lớp Raster: Nằm bên trái thanh bản đồ nền */}
      <div className="pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-2xl shadow-xl border border-slate-200/90 flex items-center gap-2">
          {/* Checkbox bật/tắt hiển thị lớp Raster */}
          <label
            className="flex items-center cursor-pointer select-none"
            title={isRasterVisible ? 'Ẩn lớp raster' : 'Hiện lớp raster'}
          >
            <input
              type="checkbox"
              checked={isRasterVisible}
              onChange={(e) => onToggleRasterVisibility(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
            />
          </label>

          {/* Combobox chọn lớp Raster trực tiếp trên bản đồ */}
          <select
            value={activeRasterLayerId || (accessibleLayers.length > 0 ? accessibleLayers[0].id : '')}
            onChange={(e) => {
              if (onRasterChange) onRasterChange(e.target.value);
              if (!isRasterVisible) onToggleRasterVisibility(true);
            }}
            disabled={accessibleLayers.length === 0}
            className="text-xs bg-transparent border-none text-slate-800 font-semibold focus:outline-hidden cursor-pointer py-0.5 pl-0 pr-4 max-w-[130px] sm:max-w-[200px] truncate"
            title="Chọn lớp bản đồ Raster"
          >
            {accessibleLayers.length === 0 ? (
              <option value="">(Chưa có raster)</option>
            ) : (
              accessibleLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* 2. Cột bên phải: Thanh chọn Bản đồ nền dọc và Nút Zoom/GPS ở dưới */}
      <div className="flex flex-col items-center gap-2 pointer-events-auto">
        {/* 3 Lớp bản đồ nền chính theo chiều DỌC: Phố, Địa hình, Vệ tinh */}
        <div className="flex flex-col gap-1 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-200/90 text-slate-800">
          {/* 1. Xem phố */}
          <button
            type="button"
            onClick={() => onBaseMapChange('street')}
            className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center ${
              currentBaseMap === 'street'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Xem phố (OpenStreetMap)"
          >
            <Map className="w-4 h-4" />
          </button>

          {/* 2. Xem địa hình */}
          <button
            type="button"
            onClick={() => onBaseMapChange('esri_topo')}
            className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center ${
              currentBaseMap === 'esri_topo'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Xem địa hình (ESRI Topo)"
          >
            <Mountain className="w-4 h-4" />
          </button>

          {/* 3. Xem vệ tinh */}
          <button
            type="button"
            onClick={() => onBaseMapChange('satellite')}
            className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center ${
              currentBaseMap === 'satellite'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Xem vệ tinh (ESRI World Imagery)"
          >
            <Satellite className="w-4 h-4" />
          </button>
        </div>

        {/* Map Zoom Controls & GPS Location Button */}
        <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-200/90 flex flex-col items-center">
          <button
            type="button"
            onClick={onZoomIn}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-700 font-bold transition cursor-pointer flex items-center justify-center"
            title="Phóng to (+)"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="w-5 h-px bg-slate-200 my-0.5" />
          <button
            type="button"
            onClick={onZoomOut}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-700 font-bold transition cursor-pointer flex items-center justify-center"
            title="Thu nhỏ (-)"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="w-5 h-px bg-slate-200 my-0.5" />
          {/* GPS Locate User Device */}
          <button
            type="button"
            onClick={onLocateUser}
            disabled={isLocating}
            className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center ${
              isLocating
                ? 'bg-blue-50 text-blue-600'
                : 'hover:bg-slate-100 text-blue-600'
            }`}
            title="Vị trí thiết bị (GPS)"
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            ) : (
              <LocateFixed className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
