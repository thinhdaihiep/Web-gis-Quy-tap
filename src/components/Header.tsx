import React from 'react';
import { Layers, FileSpreadsheet, Search, LogIn, LogOut, Users } from 'lucide-react';
import { UserRole, AppUser } from '../types';

interface HeaderProps {
  currentRole: UserRole;
  user: AppUser | null;
  onRoleChange?: (role: UserRole) => void;
  onLogin: () => void;
  onLogout: () => void;
  isLeftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  isSearchPaneOpen: boolean;
  onToggleSearchPane: () => void;
  onOpenFieldAliasModal?: () => void;
  onOpenUserManagementModal?: () => void;
  isMobile?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  user,
  onLogin,
  onLogout,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  isSearchPaneOpen,
  onToggleSearchPane,
  onOpenFieldAliasModal,
  onOpenUserManagementModal,
  isMobile = false,
}) => {
  return (
    <header className="h-14 bg-[#1e293b] text-white flex items-center justify-between px-2.5 sm:px-4 border-b border-slate-700 shrink-0 z-[3000] shadow-sm gap-1.5 sm:gap-3">
      {/* Brand Title & Pane Toggles */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-red-600 rounded flex items-center justify-center font-bold text-base sm:text-lg text-yellow-400 shadow-sm shrink-0">
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

          {/* Field Alias Dictionary button (Admin) */}
          {currentRole === 'admin' && onOpenFieldAliasModal && (
            <button
              onClick={onOpenFieldAliasModal}
              className="p-1.5 sm:px-2 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
              title="Bảng thuộc tính"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
            </button>
          )}

          {/* User Management button (Admin) */}
          {currentRole === 'admin' && onOpenUserManagementModal && (
            <button
              onClick={onOpenUserManagementModal}
              className="p-1.5 sm:px-2 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
              title="Quản lý người dùng"
            >
              <Users className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {user && (
          <div className="text-right hidden sm:block">
            <p className="text-[10px] uppercase text-slate-400 font-semibold leading-none">
              {user.displayName || user.email}
            </p>
            <p className={`text-xs font-bold ${currentRole === 'admin' ? 'text-red-400' : currentRole === 'editor' ? 'text-amber-400' : 'text-emerald-400'}`}>
              {currentRole === 'admin' ? 'Quản trị viên' : currentRole === 'editor' ? 'Biên tập viên' : 'Khách'}
            </p>
          </div>
        )}

        {user ? (
          <div className="flex items-center gap-2">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-600 shadow-sm object-cover" />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold uppercase shadow-sm">
                {currentRole === 'admin' ? 'AD' : currentRole === 'editor' ? 'ED' : 'GU'}
              </div>
            )}
            
            <button
              onClick={onLogout}
              className="p-1.5 sm:px-2 sm:py-1.5 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer bg-slate-800 text-slate-300 hover:bg-red-600 hover:text-white border border-slate-700 hover:border-red-600"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4 shrink-0" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLogin}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            <span>Đăng nhập</span>
          </button>
        )}
      </div>
    </header>
  );
};



