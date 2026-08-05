import React from 'react';
import { UserRole, GeoJsonFeatureItem, MapInteractionMode } from '../types';
import {
  MousePointer,
  Hand,
  Swords,
  Check,
  RotateCcw,
} from 'lucide-react';
import { ShovelIcon, GraveIcon, MonumentIcon, IconWithPlus } from './GisIcons';

interface MapEditorToolbarProps {
  currentRole: UserRole;
  interactionMode: MapInteractionMode;
  onInteractionModeChange: (mode: MapInteractionMode) => void;
  selectedFeature: GeoJsonFeatureItem | null;
  isUnsaved?: boolean;
  onSaveSelection?: () => void;
  onDiscardSelection?: () => void;
  onAddSearchArea?: () => void;
  onAddBattle?: () => void;
  onAddGrave?: () => void;
  onAddCemetery?: () => void;
}

export const MapEditorToolbar: React.FC<MapEditorToolbarProps> = ({
  currentRole,
  interactionMode,
  onInteractionModeChange,
  selectedFeature,
  isUnsaved = false,
  onSaveSelection,
  onDiscardSelection,
  onAddSearchArea,
  onAddBattle,
  onAddGrave,
  onAddCemetery,
}) => {
  if (currentRole === 'guest') return null;

  return (
    <div className="absolute top-4 left-4 z-[1400] flex items-center gap-1.5 pointer-events-auto">
      {/* Sleek, Ultra-Compact Floating Icon Toolbar */}
      <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-200/90 flex items-center gap-1 text-slate-800">
        {/* Mode 1: Kiểu Bàn Tay (Hand) */}
        <button
          type="button"
          onClick={() => {
            onInteractionModeChange('hand');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            interactionMode === 'hand'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Kiểu Bàn tay: Di chuyển bản đồ & xem Popup thông tin"
        >
          <Hand className="w-4 h-4" />
        </button>

        {/* Mode 2: Kiểu Con Trỏ (Pointer) */}
        <button
          type="button"
          onClick={() => {
            onInteractionModeChange('pointer');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            interactionMode === 'pointer'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Kiểu Con trỏ: Chọn đối tượng, chỉnh sửa đỉnh hình học & mở Bảng thuộc tính"
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        {/* 4 Nút Thêm Chuyên Dụng (Chỉ dùng biểu tượng, nội dung ở tooltip) */}

        {/* 1. Thêm khu vực tìm kiếm & quy tập (Shovel + Plus) */}
        <button
          type="button"
          onClick={() => {
            if (onAddSearchArea) onAddSearchArea();
          }}
          className="p-2 rounded-xl text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition cursor-pointer"
          title="Thêm khu vực tìm kiếm & quy tập"
        >
          <IconWithPlus>
            <ShovelIcon className="w-4 h-4 text-amber-700" />
          </IconWithPlus>
        </button>

        {/* 2. Thêm trận đánh (Swords + Plus) */}
        <button
          type="button"
          onClick={() => {
            if (onAddBattle) onAddBattle();
          }}
          className="p-2 rounded-xl text-slate-700 hover:bg-red-50 hover:text-red-700 transition cursor-pointer"
          title="Thêm trận đánh"
        >
          <IconWithPlus>
            <Swords className="w-4 h-4 text-red-600" />
          </IconWithPlus>
        </button>

        {/* 3. Thêm mộ liệt sĩ (Nấm mồ + Plus) */}
        <button
          type="button"
          onClick={() => {
            if (onAddGrave) onAddGrave();
          }}
          className="p-2 rounded-xl text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition cursor-pointer"
          title="Thêm mộ liệt sĩ"
        >
          <IconWithPlus>
            <GraveIcon className="w-4 h-4 text-emerald-600" />
          </IconWithPlus>
        </button>

        {/* 4. Thêm nghĩa trang (Tượng đài + Plus) */}
        <button
          type="button"
          onClick={() => {
            if (onAddCemetery) onAddCemetery();
          }}
          className="p-2 rounded-xl text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition cursor-pointer"
          title="Thêm nghĩa trang"
        >
          <IconWithPlus>
            <MonumentIcon className="w-4 h-4 text-purple-600" />
          </IconWithPlus>
        </button>

        {/* Save & Discard Actions when selected feature has unsaved edits */}
        {selectedFeature && isUnsaved && (
          <>
            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            {/* Save Button */}
            <button
              type="button"
              onClick={() => {
                if (onSaveSelection) onSaveSelection();
              }}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition cursor-pointer flex items-center gap-1"
              title="Lưu thay đổi"
            >
              <Check className="w-4 h-4" />
            </button>

            {/* Discard / Cancel Button */}
            <button
              type="button"
              onClick={() => {
                if (onDiscardSelection) onDiscardSelection();
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-1"
              title="Hủy thay đổi"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

