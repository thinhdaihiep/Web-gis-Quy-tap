import React, { useState, useRef, useEffect } from 'react';
import { BaseMapType, RasterLayer } from '../types';
import { Map, Satellite, Plus, Minus, LocateFixed, Loader2, Mountain, Layers, ListFilter, Check } from 'lucide-react';

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
  const [isRasterMenuOpen, setIsRasterMenuOpen] = useState(false);
  const rasterMenuRef = useRef<HTMLDivElement>(null);

  // Close raster menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (rasterMenuRef.current && !rasterMenuRef.current.contains(e.target as Node)) {
        setIsRasterMenuOpen(false);
      }
    };
    if (isRasterMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isRasterMenuOpen]);

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
      <div className="relative pointer-events-auto" ref={rasterMenuRef}>
        <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-200/90 flex items-center gap-1">
          {/* Checkbox bật/tắt hiển thị lớp Raster */}
          <label
            className="flex items-center gap-1 cursor-pointer select-none px-1.5 py-1 rounded-xl hover:bg-slate-100 transition shrink-0"
            title={isRasterVisible ? 'Ẩn lớp raster' : 'Hiện lớp raster'}
          >
            <input
              type="checkbox"
              checked={isRasterVisible}
              onChange={(e) => onToggleRasterVisibility(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
            />
            <Layers className={`w-4 h-4 ${isRasterVisible ? 'text-blue-600' : 'text-slate-500'}`} />
          </label>

          {/* Nút Icon chọn lớp Raster */}
          <button
            type="button"
            onClick={() => setIsRasterMenuOpen(!isRasterMenuOpen)}
            disabled={accessibleLayers.length === 0}
            className={`p-1.5 rounded-xl transition cursor-pointer flex items-center justify-center ${
              isRasterMenuOpen
                ? 'bg-blue-600 text-white shadow-xs'
                : accessibleLayers.length === 0
                ? 'text-slate-300 cursor-not-allowed'
                : isRasterVisible
                ? 'text-blue-600 hover:bg-slate-100'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Chọn lớp raster"
          >
            <ListFilter className="w-4 h-4" />
          </button>
        </div>

        {/* Dropdown Menu dạng popup nổi chọn lớp raster */}
        {isRasterMenuOpen && accessibleLayers.length > 0 && (
          <div className="absolute top-full right-0 mt-2 z-[600] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 py-1.5 px-1 min-w-[200px] max-w-[260px] flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 pointer-events-auto">
            {accessibleLayers.map((layer) => {
              const isSelected = activeRasterLayerId === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => {
                    if (onRasterChange) onRasterChange(layer.id);
                    setIsRasterMenuOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs rounded-xl flex items-center justify-between gap-2 transition cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title={layer.name}
                >
                  <span className="truncate">{layer.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
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
