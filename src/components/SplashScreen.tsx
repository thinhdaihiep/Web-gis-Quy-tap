import React from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

interface SplashScreenProps {
  statusText?: string;
  isFadingOut?: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ statusText = 'Đang tải dữ liệu không gian...', isFadingOut = false }) => {
  return (
    <div
      className={`fixed inset-0 z-[9999] bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 select-none transition-opacity duration-500 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Top Ambient Glow / Military Decor */}
      <div className="w-full max-w-xl flex justify-between items-center text-[9px] sm:text-[10px] uppercase font-mono tracking-widest text-slate-500 pt-2 border-b border-slate-800/80 pb-3">
        <span className="flex items-center gap-1.5 text-red-500 font-bold whitespace-nowrap">
          <ShieldCheck className="w-3.5 h-3.5" />
          Hệ thống GIS QK5
        </span>
        <span className="text-slate-400 whitespace-nowrap">Bảo mật / Nội bộ</span>
      </div>

      {/* Main Content Card */}
      <div className="flex flex-col items-center text-center w-full max-w-lg my-auto space-y-6 sm:space-y-8 px-2">
        {/* Military Emblem Badge Logo */}
        <div className="relative group mt-[-20px]">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-red-600 via-amber-500 to-red-700 blur-md opacity-60 animate-pulse"></div>
          <div className="relative w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-b from-red-600 to-red-800 rounded-2xl border-[3px] border-amber-400/90 shadow-2xl flex items-center justify-center text-amber-300 font-black text-4xl sm:text-6xl shadow-red-900/50">
            ★
          </div>
        </div>

        {/* Titles */}
        <div className="space-y-2 w-full px-1">
          <h1 
            className="font-black uppercase tracking-widest text-white drop-shadow-lg leading-tight whitespace-nowrap"
            style={{ fontSize: 'clamp(11px, 3.5vw, 24px)' }}
          >
            Bản đồ tìm kiếm & quy tập mộ liệt sĩ
          </h1>
          <p 
            className="font-semibold text-amber-400/90 tracking-wider whitespace-nowrap"
            style={{ fontSize: 'clamp(9px, 2.5vw, 14px)' }}
          >
            Ban chỉ đạo tìm kiếm và quy tập mộ liệt sĩ Quân khu 5
          </p>
        </div>

        {/* Loading Bar & Dynamic Status Indicator */}
        <div className="w-full max-w-sm bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-2xl space-y-3 relative overflow-hidden">
          {/* Subtle top glare */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
          
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-2 text-[10px] sm:text-xs font-medium text-slate-300 w-full">
            <div className="flex items-center gap-1.5 shrink-0">
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 animate-spin" />
              <span className="text-slate-200 whitespace-nowrap uppercase tracking-wider">Tiến trình:</span>
            </div>
            <span className="text-amber-300 font-mono font-bold text-center sm:text-left w-full truncate">
              {statusText}
            </span>
          </div>

          <div className="w-full bg-slate-950/50 rounded-full h-1.5 sm:h-2 overflow-hidden border border-slate-800">
            <div className="bg-gradient-to-r from-red-600 via-amber-500 to-emerald-400 h-full rounded-full animate-pulse w-full"></div>
          </div>
        </div>
      </div>

      {/* Copyright Footer */}
      <div className="text-center space-y-1 pb-2 w-full flex flex-col items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
        <p className="text-[9px] sm:text-[11px] font-medium text-slate-500 tracking-widest uppercase whitespace-nowrap">
          &copy; 2026 Ban Bản đồ / Phòng Tác chiến Quân khu 5
        </p>
        <p className="text-[8px] sm:text-[10px] text-slate-600 font-mono whitespace-nowrap uppercase tracking-widest">
          Hệ thống GIS Chuyên ngành
        </p>
      </div>
    </div>
  );
};
