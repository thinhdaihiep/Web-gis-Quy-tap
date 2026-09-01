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
}) => {
  return (
    <div className="absolute top-4 right-4 z-[500] flex flex-col items-end gap-2 pointer-events-auto">
      {/* 3 Lớp bản đồ nền chính: Phố, Địa hình, Vệ tinh */}
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-xl border border-slate-200 backdrop-blur-sm">
        {/* 1. Xem phố */}
        <button
          onClick={() => onBaseMapChange('street')}
          className={`p-2 rounded transition-colors cursor-pointer flex items-center justify-center ${
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
          onClick={() => onBaseMapChange('esri_topo')}
          className={`p-2 rounded transition-colors cursor-pointer flex items-center justify-center ${
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
          onClick={() => onBaseMapChange('satellite')}
          className={`p-2 rounded transition-colors cursor-pointer flex items-center justify-center ${
            currentBaseMap === 'satellite'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          title="Xem vệ tinh (ESRI World Imagery)"
        >
          <Satellite className="w-4 h-4" />
        </button>
      </div>

      {/* Điều khiển lớp Raster: Checkbox ẩn/hiện + Combobox chọn lớp */}
      <div className="flex flex-col items-end max-w-[270px]">
        <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg shadow-xl border border-slate-200 backdrop-blur-sm w-full justify-between">
          {/* Checkbox bật/tắt hiển thị lớp Raster */}
          <label
            className="flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-1 rounded hover:bg-slate-100 transition shrink-0"
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
            {rasterLayers.length > 0 ? (
              <select
                value={activeRasterLayerId || ''}
                onChange={(e) => onRasterChange && onRasterChange(e.target.value)}
                disabled={!isRasterVisible && rasterLayers.length === 0}
                className={`text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium w-full truncate cursor-pointer transition ${
                  isRasterVisible
                    ? 'bg-slate-50 text-slate-800 border-slate-300'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
                title="Chọn lớp bản đồ raster"
              >
                {rasterLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name} ({layer.files?.length || (layer.url ? 1 : 0)} ảnh)
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-slate-400 px-2 py-1 bg-slate-50 rounded font-medium truncate w-full text-center">
                Chưa có lớp raster
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Map Zoom Controls & GPS Location Button */}
      <div className="bg-white p-1 rounded-lg shadow-xl border border-slate-200 flex flex-col items-center">
        <button
          onClick={onZoomIn}
          className="p-2 hover:bg-slate-100 rounded text-slate-700 font-bold transition-colors cursor-pointer flex items-center justify-center"
          title="Phóng to (+)"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="w-full h-px bg-slate-200 my-0.5" />
        <button
          onClick={onZoomOut}
          className="p-2 hover:bg-slate-100 rounded text-slate-700 font-bold transition-colors cursor-pointer flex items-center justify-center"
          title="Thu nhỏ (-)"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="w-full h-px bg-slate-200 my-0.5" />
        {/* GPS Locate User Device */}
        <button
          onClick={onLocateUser}
          disabled={isLocating}
          className={`p-2 rounded transition-colors cursor-pointer flex items-center justify-center ${
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
  );
};
