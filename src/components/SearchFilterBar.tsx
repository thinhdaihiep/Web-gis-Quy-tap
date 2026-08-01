import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="bg-[#0f172a] text-slate-200 border-b border-slate-800 px-3 py-2 z-20 shadow-md">
      <div className="max-w-7xl mx-auto">
        {/* Search Box Only */}
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4 text-blue-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm kiếm thông tin, tọa độ, liệt sĩ, nghĩa trang..."
            className="w-full bg-slate-800/90 border border-slate-700 text-slate-100 placeholder-slate-400 text-xs sm:text-sm rounded-lg pl-9 pr-9 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
              title="Xóa từ khóa"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

