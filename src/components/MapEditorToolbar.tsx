import React from 'react';
import { DrawToolMode, UserRole, GeoJsonFeatureItem, MapInteractionMode } from '../types';
import {
  MousePointer,
  Hand,
  MapPin,
  Spline,
  Hexagon,
  Check,
  RotateCcw,
  X,
  Save,
} from 'lucide-react';

interface MapEditorToolbarProps {
  currentRole: UserRole;
  interactionMode: MapInteractionMode;
  onInteractionModeChange: (mode: MapInteractionMode) => void;
  activeDrawMode: DrawToolMode;
  onDrawModeChange: (mode: DrawToolMode) => void;
  selectedFeature: GeoJsonFeatureItem | null;
  isUnsaved?: boolean;
  onSaveSelection?: () => void;
  onDiscardSelection?: () => void;
  drawingPointsCount?: number;
  onFinishDrawing?: () => void;
  onCancelDrawing?: () => void;
}

export const MapEditorToolbar: React.FC<MapEditorToolbarProps> = ({
  currentRole,
  interactionMode,
  onInteractionModeChange,
  activeDrawMode,
  onDrawModeChange,
  selectedFeature,
  isUnsaved = false,
  onSaveSelection,
  onDiscardSelection,
  drawingPointsCount = 0,
  onFinishDrawing,
  onCancelDrawing,
}) => {
  if (currentRole === 'guest') return null;

  const isDrawingActive = activeDrawMode === 'line' || activeDrawMode === 'polygon';

  return (
    <div className="absolute top-4 left-4 z-[1400] flex items-center gap-1.5 pointer-events-auto">
      {/* Sleek, Ultra-Compact Floating Icon Toolbar */}
      <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-200/90 flex items-center gap-1 text-slate-800">
        {/* Mode 1: Kiểu Bàn Tay (Hand) */}
        <button
          onClick={() => {
            onInteractionModeChange('hand');
            onDrawModeChange(null);
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
          onClick={() => {
            onInteractionModeChange('pointer');
            if (!activeDrawMode) onDrawModeChange('select');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            interactionMode === 'pointer'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Kiểu Con trỏ: Chọn đối tượng, chỉnh sửa đỉnh hình học (Geometry) & mở Bảng thuộc tính"
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        {/* Draw Tools */}
        <button
          onClick={() => {
            onInteractionModeChange('pointer');
            onDrawModeChange('point');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            activeDrawMode === 'point'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
          }`}
          title="+ Tạo mới Điểm không gian"
        >
          <MapPin className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            onInteractionModeChange('pointer');
            onDrawModeChange('line');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            activeDrawMode === 'line'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
          }`}
          title="+ Vẽ Tuyến đường không gian"
        >
          <Spline className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            onInteractionModeChange('pointer');
            onDrawModeChange('polygon');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            activeDrawMode === 'polygon'
              ? 'bg-red-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-red-50 hover:text-red-700'
          }`}
          title="+ Vẽ Vùng không gian"
        >
          <Hexagon className="w-4 h-4" />
        </button>

        {/* Save & Discard Actions when drawing active OR selected feature has unsaved edits */}
        {(isDrawingActive || (selectedFeature && isUnsaved)) && (
          <>
            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            {/* Save Button */}
            <button
              onClick={() => {
                if (isDrawingActive && onFinishDrawing) {
                  onFinishDrawing();
                } else if (onSaveSelection) {
                  onSaveSelection();
                }
              }}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition cursor-pointer flex items-center gap-1"
              title="Lưu thay đổi"
            >
              <Check className="w-4 h-4" />
            </button>

            {/* Discard / Cancel Button */}
            <button
              onClick={() => {
                if (isDrawingActive && onCancelDrawing) {
                  onCancelDrawing();
                } else if (onDiscardSelection) {
                  onDiscardSelection();
                }
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-1"
              title="Hủy thay đổi"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Floating Vertex Count Pill during active line/polygon drawing */}
      {isDrawingActive && (
        <div className="bg-slate-900/90 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{drawingPointsCount} đỉnh</span>
        </div>
      )}
    </div>
  );
};
