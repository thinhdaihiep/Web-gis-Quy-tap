import React from 'react';
import { Layers, Clock, FileSpreadsheet, Search } from 'lucide-react';
import { UserRole } from '../types';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  isLeftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  isSearchPaneOpen: boolean;
  onToggleSearchPane: () => void;
  onOpenFieldAliasModal?: () => void;
  isMobile?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  isRightSidebarOpen,
  onToggleRightSidebar,
  isSearchPaneOpen,
  onToggleSearchPane,
  onOpenFieldAliasModal,
  isMobile = false,
}) => {
  return (
    <header className="h-14 bg-[#1e293b] text-white flex items-center justify-between px-2.5 sm:px-4 border-b border-slate-700 shrink-0 z-[3000] shadow-sm gap-1.5 sm:gap-3">
      {/* Brand Title & Pane Toggles */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-red-600 rounded flex items-center justify-center font-bold text-base sm:text-lg text-white shadow-sm shrink-0">
          ★
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[11px] sm:text-xs md:text-sm font-bold uppercase tracking-wide text-slate-100 truncate">
            Bản đồ tìm kiếm & quy tập mộ Liệt sĩ
          </h1>
          <p className="text-[10px] text-slate-400 hidden lg:block">
            Ban chỉ đạo tìm kiếm và quy tập mộ liệt sĩ Quân khu 5
          </p>
        </div>

        {/* Pane Toggle Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleLeftSidebar}
            className={`p-1.5 sm:px-2 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer ${
              isLeftSidebarOpen
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
            title="Quản lý lớp dữ liệu"
          >
            <Layers className="w-4 h-4 shrink-0" />
          </button>

          {/* Search Pane toggle button (Kính lúp) */}
          <button
            onClick={onToggleSearchPane}
            className={`p-1.5 sm:px-2 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer ${
              isSearchPaneOpen
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
            title="Tìm kiếm không gian & thuộc tính"
          >
            <Search className="w-4 h-4 shrink-0" />
          </button>

          {/* Field Alias Dictionary button (Admin & Desktop only) */}
          {!isMobile && currentRole === 'admin' && onOpenFieldAliasModal && (
            <button
              onClick={onOpenFieldAliasModal}
              className="p-1.5 sm:px-2 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
              title="Ánh xạ trường thuộc tính"
            >
              <FileSpreadsheet className="w-4 h-4 text-blue-400 shrink-0" />
            </button>
          )}

          {/* Approval toggle button (Admin & Desktop only) */}
          {!isMobile && currentRole === 'admin' && (
            <button
              onClick={onToggleRightSidebar}
              className={`p-1.5 sm:px-2 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer ${
                isRightSidebarOpen
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
              }`}
              title="Chờ phê duyệt"
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span className="bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">3</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Switcher (Desktop) / Guest Indicator (Mobile) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {!isMobile ? (
          <>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] uppercase text-slate-400 font-semibold leading-none">
                Vai trò
              </p>

              <select
                value={currentRole}
                onChange={(e) => onRoleChange(e.target.value as UserRole)}
                className="bg-transparent text-xs font-bold text-red-400 focus:outline-none cursor-pointer border-b border-dashed border-red-500/50 py-0.5"
              >
                <option value="admin" className="bg-slate-800 text-red-400 font-bold">
                  Quản trị viên
                </option>
                <option value="editor" className="bg-slate-800 text-amber-400 font-bold">
                  Biên tập viên
                </option>
                <option value="guest" className="bg-slate-800 text-emerald-400 font-bold">
                  Khách
                </option>
              </select>
            </div>

            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold uppercase shadow-sm">
              {currentRole === 'admin' ? 'AD' : currentRole === 'editor' ? 'ED' : 'GU'}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2 py-1 rounded-md border border-slate-700 text-[10px] font-bold text-emerald-400 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Khách</span>
          </div>
        )}
      </div>
    </header>
  );
};


