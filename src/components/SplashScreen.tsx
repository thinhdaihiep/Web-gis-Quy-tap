import React from 'react';
import { Loader2, Compass } from 'lucide-react';

interface SplashScreenProps {
  statusText?: string;
  isFadingOut?: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusText = 'Đang tải dữ liệu không gian...',
  isFadingOut = false,
}) => {
  return (
    <div
      className={`fixed inset-0 z-[9999] bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-8 select-none transition-opacity duration-500 ease-out overflow-hidden ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Ambience: Deep Military GIS Grid & Radial Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.18)_0%,rgba(15,23,42,0.8)_60%,rgba(2,6,23,1)_100%)]" />
        <div 
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-xl flex items-center justify-center text-center font-sans pt-1 pb-3 border-b border-slate-800/80 px-2">
        <div className="flex items-center text-red-500 font-bold tracking-tight sm:tracking-wide text-[11px] sm:text-xs md:text-sm">
          <span className="whitespace-normal leading-tight text-center">Ban chỉ đạo tìm kiếm và quy tập mộ liệt sĩ Quân khu 5</span>
        </div>
      </header>

      {/* Main Center Section */}
      <main className="relative z-10 flex flex-col items-center text-center w-full max-w-lg my-auto space-y-6 sm:space-y-7 px-4">
        {/* Custom Logo Container with Elegant Glow */}
        <div className="relative group">
          {/* Subtle Outer Glow */}
          <div className="absolute -inset-2 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-blue-500/20 to-red-500/20 blur-xl opacity-70 group-hover:opacity-100 transition-opacity" />
          
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl p-2 bg-gradient-to-b from-slate-900/90 to-slate-950/95 border border-slate-700/60 shadow-2xl shadow-black/80 flex items-center justify-center backdrop-blur-md">
            <img
              src="/logo.png"
              alt="Logo Hệ thống GIS"
              className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
              onError={(e) => {
                // Fallback nếu cần
                const target = e.currentTarget;
                if (!target.src.endsWith('/Logo.png')) {
                  target.src = '/Logo.png';
                }
              }}
            />
          </div>
        </div>

        {/* Titles */}
        <div className="space-y-2.5 w-full">
          <h1
            className="font-black uppercase tracking-wider text-slate-100 drop-shadow-md leading-tight whitespace-nowrap"
            style={{ fontSize: 'clamp(14px, 4vw, 22px)' }}
          >
            Bản đồ tìm kiếm & quy tập mộ liệt sĩ
          </h1>
          <p
            className="font-semibold text-amber-400 tracking-wide leading-relaxed"
            style={{ fontSize: 'clamp(11px, 2.8vw, 14px)' }}
          >
            Ban Bản đồ/Phòng Tác chiến/Bộ Tham mưu/Quân khu 5
          </p>
        </div>

        {/* Loading Progress Box */}
        <div className="w-full max-w-md bg-slate-900/75 border border-slate-800/90 backdrop-blur-md rounded-xl p-3.5 sm:p-4 shadow-2xl space-y-3">
          {/* Status Text Indicator */}
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-300 w-full px-1">
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
            <span className="text-slate-400 shrink-0 tracking-wider">Tiến trình:</span>
            <span className="text-amber-300 font-mono font-medium truncate max-w-[260px] sm:max-w-xs text-left">
              {statusText}
            </span>
          </div>

          {/* Minimalist Tech Loading Line */}
          <div className="w-full bg-slate-950/80 rounded-full h-1.5 overflow-hidden border border-slate-800/80 p-[1px]">
            <div className="bg-gradient-to-r from-blue-600 via-amber-400 to-emerald-400 h-full rounded-full animate-pulse w-full shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
          </div>
        </div>
      </main>

      {/* Footer Copyright */}
      <footer className="relative z-10 text-center pb-2 w-full flex flex-col items-center justify-center opacity-75 hover:opacity-100 transition-opacity">
        <p className="text-[10px] sm:text-xs font-medium text-slate-400 tracking-wider">
          Hệ thống CSDL GIS Quân khu 5 - Copyright © 2026
        </p>
      </footer>
    </div>
  );
};
