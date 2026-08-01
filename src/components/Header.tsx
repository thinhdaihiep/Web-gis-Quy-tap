import React from 'react';
import { Layers, Clock, FileSpreadsheet } from 'lucide-react';
import { UserRole } from '../types';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  isLeftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  onOpenFieldAliasModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  isRightSidebarOpen,
  onToggleRightSidebar,
  onOpenFieldAliasModal,
}) => {
  return (
    <header className="h-14 bg-[#1e293b] text-white flex items-center justify-between px-3 sm:px-4 border-b border-slate-700 shrink-0 z-20 shadow-sm">
      {/* Brand Title & Pane Toggles */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center font-bold text-lg text-white shadow-sm shrink-0">
          ★
        </div>
        <div>
          <h1 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-100 truncate max-w-[180px] xs:max-w-none">
            Hệ thống GIS Tìm kiếm & Quy tập Mộ Liệt sĩ
          </h1>
          <p className="text-[10px] text-slate-400 hidden lg:block">
            Bản Bản đồ/Phòng Tác chiến/Quân khu 5
          </p>
        </div>

        {/* Pane Toggle Buttons & Field Alias Manager for Mobile & Space Optimization */}
        <div className="flex items-center gap-1 ml-1 sm:ml-2">
          <button
            onClick={onToggleLeftSidebar}
            className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
              isLeftSidebarOpen
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
            title={isLeftSidebarOpen ? 'Ẩn bảng Quản lý lớp dữ liệu' : 'Hiện bảng Quản lý lớp dữ liệu'}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px] font-bold">Lớp dữ liệu</span>
          </button>

          {/* Field Alias Dictionary button (Admin only) */}
          {currentRole === 'admin' && onOpenFieldAliasModal && (
            <button
              onClick={onOpenFieldAliasModal}
              className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
              title="Mở Bảng Ánh Xạ Tên Trường Thuộc Tính (Chỉ dành cho Quản lý)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden lg:inline text-[11px] font-bold">Ánh xạ trường</span>
            </button>
          )}

          {/* Approval toggle button only visible for Admin */}
          {currentRole === 'admin' && (
            <button
              onClick={onToggleRightSidebar}
              className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                isRightSidebarOpen
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
              }`}
              title={isRightSidebarOpen ? 'Ẩn bảng Chờ phê duyệt' : 'Hiện bảng Chờ phê duyệt'}
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-[11px] font-bold">Phê duyệt</span>
              <span className="bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">3</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Switcher for Testing / Permissions */}
      <div className="flex items-center gap-2">
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
              Quản trị viên (Admin)
            </option>
            <option value="editor" className="bg-slate-800 text-amber-400 font-bold">
              Biên tập viên (Editor)
            </option>
            <option value="guest" className="bg-slate-800 text-emerald-400 font-bold">
              Khách (Guest)
            </option>
          </select>
        </div>

        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold uppercase shadow-sm">
          {currentRole === 'admin' ? 'AD' : currentRole === 'editor' ? 'ED' : 'GU'}
        </div>
      </div>
    </header>
  );
};


