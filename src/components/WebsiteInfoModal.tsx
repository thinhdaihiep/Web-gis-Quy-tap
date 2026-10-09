import React from 'react';
import { Info, X, ShieldCheck, UserCheck, Mail, Phone } from 'lucide-react';

interface WebsiteInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WebsiteInfoModal: React.FC<WebsiteInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Close Icon */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-slate-800/80">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            Thông tin hệ thống
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Đóng (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Logo in top center */}
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3 group">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-red-600/30 via-amber-500/30 to-blue-600/30 blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-950/90 border border-slate-700/80 p-2 shadow-xl flex items-center justify-center backdrop-blur-md">
                <img
                  src="/Logo.png"
                  alt="Logo Quân khu 5"
                  className="w-full h-full object-contain filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.endsWith('/logo.png')) {
                      target.src = '/logo.png';
                    }
                  }}
                />
              </div>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-red-500 tracking-wide leading-snug">
              Bản đồ tìm kiếm & Quy tập mộ liệt sĩ
            </h3>
            <p className="text-xs sm:text-sm font-semibold text-amber-400/90 mt-0.5">
              Ban Bản đồ / Phòng Tác chiến / Quân khu 5
            </p>
          </div>

          {/* Responsibilities & System Management */}
          <div className="space-y-3 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 text-xs sm:text-sm">
            {/* Content & Publishing */}
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Chịu trách nhiệm nội dung và xuất bản:
                </div>
                <div className="font-semibold text-slate-100">
                  Thượng tá Nguyễn Bá Long
                  <span className="text-slate-400 font-normal ml-1">- Trưởng Ban Bản đồ</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800/60" />

            {/* Development & Administration */}
            <div className="flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Phát triển và quản trị hệ thống:
                </div>
                <div className="font-semibold text-slate-100">
                  Trung tá CN Ngô Văn Thịnh
                  <span className="text-slate-400 font-normal ml-1">- Nhân viên Bản đồ</span>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 space-y-2.5">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Thông tin liên hệ
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
              {/* Email */}
              <a
                href="mailto:thinhqk5@gmail.com"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700/60 text-slate-300 hover:text-white hover:border-blue-500/80 hover:bg-blue-950/30 transition-colors group cursor-pointer"
                title="Gửi Email"
              >
                <Mail className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
                <span className="truncate font-mono text-[11px] sm:text-xs">thinhqk5@gmail.com</span>
              </a>

              {/* Phone */}
              <a
                href="tel:0905178114"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700/60 text-slate-300 hover:text-white hover:border-emerald-500/80 hover:bg-emerald-950/30 transition-colors group cursor-pointer"
                title="Gọi điện thoại"
              >
                <Phone className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                <span className="truncate font-mono text-[11px] sm:text-xs">0905 178 114</span>
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-950/80 border-t border-slate-800/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            title="Đóng"
          >
            <X className="w-3.5 h-3.5" />
            <span>Đóng</span>
          </button>
        </div>
      </div>
    </div>
  );
};
