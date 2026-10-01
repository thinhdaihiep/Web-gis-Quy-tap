import React from 'react';
import { BaseMapType, RasterLayer } from '../types';
import { Map, Satellite, Plus, Minus, LocateFixed, Loader2, Mountain, Layers } from 'lucide-react';

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
  return (
    <div className="absolute top-4 right-4 z-[500] flex items-start gap-2 pointer-events-auto">
      {/* 1. Điều khiển lớp Raster: Nằm bên trái thanh bản đồ nền, ép sát bên phải theo hướng nhìn từ ngoài vào */}
      <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-200/90 flex items-center gap-1.5 max-w-[270px]">
        {/* Checkbox bật/tắt hiển thị lớp Raster */}
        <label
          className="flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-1 rounded-xl hover:bg-slate-100 transition shrink-0"
          title={isRasterVisible ? 'Ẩn lớp raster' : 'Hiện lớp raster đè lên bản đồ nền'}
        >
          <input
            type="checkbox"
            checked={isRasterVisible}
            onChange={(e) => onToggleRasterVisibility(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
          />
          <Layers className={`w-4 h-4 ${isRasterVisible ? 'text-blue-600' : 'text-slate-500'}`} />
        </label>

        {/* Combobox chọn lớp Raster */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {(() => {
            const canAccessFirebase = currentRole === 'admin' || currentRole === 'editor';
            const accessibleLayers = rasterLayers.filter((l) => {
              if (l.enabled === false) return false;
              const isFirebase = l.source === 'firebase' || (!l.githubReleaseUrl && !!l.storagePath);
              if (isFirebase && !canAccessFirebase) return false;
              return true;
            });

            if (accessibleLayers.length > 0) {
              return (
                <select
                  value={activeRasterLayerId || ''}
                  onChange={(e) => onRasterChange && onRasterChange(e.target.value)}
                  disabled={!isRasterVisible && accessibleLayers.length === 0}
                  className={`text-xs border rounded-xl px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium w-full truncate cursor-pointer transition ${
                    isRasterVisible
                      ? 'bg-slate-50 text-slate-800 border-slate-300'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                  title="Chọn lớp bản đồ raster"
                >
                  {accessibleLayers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>
              );
            }
            return (
              <span className="text-[11px] text-slate-400 px-2 py-1.5 bg-slate-50 rounded-xl font-medium truncate w-full text-center">
                Chưa có lớp raster
              </span>
            );
          })()}
        </div>
      </div>

      {/* 2. Cột bên phải: Thanh chọn Bản đồ nền dọc và Nút Zoom/GPS ở dưới */}
      <div className="flex flex-col items-center gap-2">
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
