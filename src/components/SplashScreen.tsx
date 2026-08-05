import React from 'react';
import { Loader2, ShieldCheck, MapPin, Database } from 'lucide-react';

interface SplashScreenProps {
  statusText?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ statusText = 'Đang tải dữ liệu không gian và CSDL Firestore...' }) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 select-none animate-in fade-in duration-300">
      {/* Top Ambient Glow / Military Decor */}
      <div className="w-full max-w-xl flex justify-between items-center text-[10px] uppercase font-mono tracking-widest text-slate-500 pt-2 border-b border-slate-800/80 pb-3">
        <span className="flex items-center gap-1 text-red-500 font-bold">
          <ShieldCheck className="w-3.5 h-3.5" />
          Hệ thống GIS Quân khu 5
        </span>
        <span className="text-slate-400">Bảo mật / Nội bộ</span>
      </div>

      {/* Main Content Card */}
      <div className="flex flex-col items-center text-center max-w-lg my-auto space-y-6 px-4">
        {/* Military Emblem Badge Logo */}
        <div className="relative group">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-red-600 via-amber-500 to-red-700 blur-sm opacity-60 animate-pulse"></div>
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-red-700 rounded-2xl border-2 border-amber-400/80 shadow-2xl flex items-center justify-center text-amber-300 font-black text-4xl sm:text-5xl shadow-red-900/50">
            ★
          </div>
        </div>

        {/* Titles */}
        <div className="space-y-2">
          <h1 className="text-lg sm:text-2xl font-black uppercase tracking-wider text-white drop-shadow-md leading-tight">
            BẢN ĐỒ TÌM KIẾM VÀ QUY TẬP MỘ LIỆT SĨ
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-amber-400/90 tracking-wide">
            Bản chỉ đạo tìm kiếm và quy tập mộ liệt sĩ Quân khu 5
          </p>
        </div>

        {/* Loading Bar & Dynamic Status Indicator */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-inner space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-300">
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            <span className="text-slate-200">
              Đang nạp dữ liệu: <span className="text-amber-300 font-mono font-bold">{statusText}</span>
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500 h-full rounded-full animate-pulse w-full"></div>
          </div>
        </div>
      </div>

      {/* Copyright Footer */}
      <div className="text-center space-y-1 pb-2">
        <p className="text-[11px] font-medium text-slate-400 tracking-wide">
          (C) 2026 Ban Bản đồ/Phòng Tác chiến Quân khu 5
        </p>
        <p className="text-[10px] text-slate-600 font-mono">
          Hệ thống Thông tin Địa lý (GIS) Chuyên ngành Tìm kiếm Quy tập Mộ Liệt sĩ
        </p>
      </div>
    </div>
  );
};
