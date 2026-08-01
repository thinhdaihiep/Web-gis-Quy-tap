import React from 'react';
import { Crosshair, MapPin } from 'lucide-react';

interface FooterProps {
  cursorLocation?: { lat: number; lng: number } | null;
  userLocation?: { lat: number; lng: number; accuracy?: number } | null;
}

export const Footer: React.FC<FooterProps> = ({ cursorLocation, userLocation }) => {
  return (
    <footer className="h-7 bg-slate-900 text-slate-200 border-t border-slate-800 flex items-center justify-between px-4 text-[11px] shrink-0 z-20 font-medium">
      {/* Left side: Coordinates */}
      <div className="flex items-center gap-4">
        {/* Cursor Coordinates */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
          <Crosshair className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-[10px] text-slate-400 uppercase font-semibold hidden xs:inline">
            Tọa độ:
          </span>
          {cursorLocation ? (
            <span className="font-mono text-emerald-400 font-bold">
              {cursorLocation.lat.toFixed(6)}° N, {cursorLocation.lng.toFixed(6)}° E
            </span>
          ) : userLocation ? (
            <span className="font-mono text-emerald-400 font-bold flex items-center gap-1">
              <MapPin className="w-3 h-3 text-red-400 inline" />
              {userLocation.lat.toFixed(6)}° N, {userLocation.lng.toFixed(6)}° E
              {userLocation.accuracy && (
                <span className="text-[10px] text-slate-400 font-normal ml-0.5 hidden md:inline">
                  (GPS ±{Math.round(userLocation.accuracy)}m)
                </span>
              )}
            </span>
          ) : (
            <span className="font-mono text-slate-400 font-medium text-[10px]">
              Kích chọn vị trí trên bản đồ...
            </span>
          )}
          <span className="text-[9px] font-mono text-slate-300 bg-slate-700 px-1 rounded ml-0.5">
            WGS 84
          </span>
        </div>
      </div>

      {/* Right side: Scale & Copyright */}
      <div className="flex gap-4 items-center text-[10px] text-slate-400">
        <span className="hidden md:inline">Quy mô: 1:5.000</span>
        <span className="hidden lg:inline">© 2026 Portal GIS Tìm Kiếm & Quy Tập Liệt Sĩ</span>
      </div>
    </footer>
  );
};
