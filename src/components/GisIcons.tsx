import React from 'react';
import { Swords, Plus } from 'lucide-react';

// 1. Shovel Icon (Cái xẻng)
export const ShovelIcon: React.FC<{ className?: string; color?: string }> = ({
  className = "w-4 h-4",
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M17 3l4 4" />
    <path d="M19 5l-8 8" />
    <path d="M13 11l-2-2" />
    <path d="M10 12l-6 6a3 3 0 0 0 0 4.24l.76.76a3 3 0 0 0 4.24 0l6-6" />
    <path d="M12 10l2 2" />
  </svg>
);

// 2. Grave Mound Icon (Nấm mồ liệt sĩ)
export const GraveIcon: React.FC<{ className?: string; color?: string }> = ({
  className = "w-4 h-4",
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2 20h20" />
    <path d="M4 20c0-4.5 3.58-8 8-8s8 3.5 8 8" />
    <path d="M9 12V6a3 3 0 0 1 6 0v6" />
    <path d="M12 7.5v3M10.5 9h3" />
  </svg>
);

// 3. Monument Icon (Tượng đài nghĩa trang liệt sĩ)
export const MonumentIcon: React.FC<{ className?: string; color?: string }> = ({
  className = "w-4 h-4",
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 21h18" />
    <path d="M5 21v-2h14v2" />
    <path d="M7 19v-2h10v2" />
    <path d="M9 17l1.5-12h3L15 17" />
    <polygon
      points="12 2 12.8 3.8 14.8 3.8 13.2 5 13.8 6.8 12 5.6 10.2 6.8 10.8 5 9.2 3.8 11.2 3.8"
      fill={color}
      stroke="none"
    />
  </svg>
);

// Plus badge wrapper helper for Toolbar buttons (Circle with green border, white background, green plus)
export const IconWithPlus: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => (
  <div className="relative inline-flex items-center justify-center">
    {children}
    <div className="absolute -bottom-1.5 -right-2 w-3.5 h-3.5 rounded-full bg-white border border-emerald-600 flex items-center justify-center shadow-2xs z-10">
      <Plus className="w-2.5 h-2.5 text-emerald-600 stroke-[3]" />
    </div>
  </div>
);

// Shape Badges for Layer Panel & Sidebar
// 1. Khu vực tìm kiếm quy tập: Hexagon (lục giác), viền cam, nền trắng
export const SearchAreaShapeBadge: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <div className={`relative ${className} flex items-center justify-center shrink-0`}>
    <svg
      className="absolute inset-0 w-full h-full text-amber-500"
      viewBox="0 0 24 24"
      fill="white"
      stroke="currentColor"
      strokeWidth="2.2"
    >
      <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" />
    </svg>
    <ShovelIcon className="w-2.5 h-2.5 text-amber-600 z-10" />
  </div>
);

// 2. Trận đánh: Circle (hình tròn), viền đỏ, nền trắng
export const BattleShapeBadge: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <div
    className={`${className} rounded-full bg-white border-2 border-red-600 flex items-center justify-center shrink-0 shadow-2xs`}
  >
    <Swords className="w-2.5 h-2.5 text-red-600" />
  </div>
);

// 3. Mộ liệt sĩ: Triangle (hình tam giác), viền xanh, nền trắng
export const GraveShapeBadge: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <div className={`relative ${className} flex items-center justify-center shrink-0`}>
    <svg
      className="absolute inset-0 w-full h-full text-emerald-600"
      viewBox="0 0 24 24"
      fill="white"
      stroke="currentColor"
      strokeWidth="2.2"
    >
      <polygon points="12 2 22 20 2 20" />
    </svg>
    <GraveIcon className="w-2.5 h-2.5 text-emerald-600 z-10 mt-0.5" />
  </div>
);

// 4. Nghĩa trang: Square (hình vuông), viền tím, nền trắng
export const CemeteryShapeBadge: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <div
    className={`${className} rounded-xs bg-white border-2 border-purple-600 flex items-center justify-center shrink-0 shadow-2xs`}
  >
    <MonumentIcon className="w-2.5 h-2.5 text-purple-600" />
  </div>
);
