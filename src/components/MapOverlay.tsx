import React from 'react';
import { BaseMapType } from '../types';
import { Map, Satellite, Plus, Minus, LocateFixed, Loader2, Mountain } from 'lucide-react';

interface MapOverlayProps {
  currentBaseMap: BaseMapType;
  onBaseMapChange: (baseMap: BaseMapType) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onLocateUser?: () => void;
  isLocating?: boolean;
}

export const MapOverlay: React.FC<MapOverlayProps> = ({
  currentBaseMap,
  onBaseMapChange,
  onZoomIn,
  onZoomOut,
  onLocateUser,
  isLocating = false,
}) => {
  return (
    <div className="absolute top-4 right-4 z-[500] flex flex-col items-end gap-2 pointer-events-auto">
      {/* Base Map Switcher (Top Right - Icons only with Tooltips) */}
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-xl border border-slate-200 backdrop-blur-sm">
        <button
          onClick={() => onBaseMapChange('street')}
          className={`p-2 rounded transition-colors cursor-pointer flex items-center justify-center ${
            currentBaseMap === 'street'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          title="OSM Việt Nam (Tiếng Việt đầy đủ cấp Thôn/Xóm/Xã)"
        >
          <Map className="w-4 h-4" />
        </button>

        <button
          onClick={() => onBaseMapChange('esri_topo')}
          className={`p-2 rounded transition-colors cursor-pointer flex items-center justify-center ${
            currentBaseMap === 'esri_topo'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          title="ESRI Địa hình (Độ cao & Đường đồng mức)"
        >
          <Mountain className="w-4 h-4" />
        </button>

        <button
          onClick={() => onBaseMapChange('satellite')}
          className={`p-2 rounded transition-colors cursor-pointer flex items-center justify-center ${
            currentBaseMap === 'satellite'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          title="ESRI Vệ tinh (Hình ảnh vệ tinh thực địa)"
        >
          <Satellite className="w-4 h-4" />
        </button>
      </div>

      {/* Map Zoom Controls & GPS Location Button */}
      <div className="bg-white p-1 rounded-lg shadow-xl border border-slate-200 flex flex-col items-center">
        <button
          onClick={onZoomIn}
          className="p-2 hover:bg-slate-100 rounded text-slate-700 font-bold transition-colors cursor-pointer flex items-center justify-center"
          title="Phóng to bản đồ (+)"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="w-full h-px bg-slate-200 my-0.5" />

        <button
          onClick={onZoomOut}
          className="p-2 hover:bg-slate-100 rounded text-slate-700 font-bold transition-colors cursor-pointer flex items-center justify-center"
          title="Thu nhỏ bản đồ (-)"
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
          title="Xác định vị trí hiện tại của thiết bị (GPS)"
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


