import React, { useState, useEffect } from 'react';
import { UserRole, GeoJsonFeatureItem, MapInteractionMode } from '../types';
import {
  MousePointer,
  Hand,
  Check,
  RotateCcw,
  Copy,
  Scissors,
  Clipboard,
  X,
  Trash2,
  Ruler,
  DraftingCompass,
  Target,
  AlertTriangle,
} from 'lucide-react';

interface MapEditorToolbarProps {
  currentRole: UserRole;
  interactionMode: MapInteractionMode;
  onInteractionModeChange: (mode: MapInteractionMode) => void;
  selectedFeature: GeoJsonFeatureItem | null;
  isUnsaved?: boolean;
  onSaveSelection?: () => void;
  onDiscardSelection?: () => void;
  onDeleteSelected?: () => void;
  // Pending Unsaved Changes Confirmation Props
  pendingNextFeature?: { feat: GeoJsonFeatureItem | null } | null;
  onConfirmPendingSave?: () => void;
  onConfirmPendingDiscard?: () => void;
  onCancelPendingNext?: () => void;
  // Clipboard & Ghost Paste Props
  hasClipboard?: boolean;
  hasTargetLocation?: boolean;
  pendingPasteFeature?: GeoJsonFeatureItem | null;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onConfirmPaste?: () => void;
  onCancelPaste?: () => void;
}

export const MapEditorToolbar: React.FC<MapEditorToolbarProps> = ({
  currentRole,
  interactionMode,
  onInteractionModeChange,
  selectedFeature,
  isUnsaved = false,
  onSaveSelection,
  onDiscardSelection,
  onDeleteSelected,
  pendingNextFeature = null,
  onConfirmPendingSave,
  onConfirmPendingDiscard,
  onCancelPendingNext,
  hasClipboard = false,
  hasTargetLocation = false,
  pendingPasteFeature = null,
  onCopy,
  onCut,
  onPaste,
  onConfirmPaste,
  onCancelPaste,
}) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);

  // Reset delete confirmation when selection changes
  useEffect(() => {
    setIsConfirmingDelete(false);
  }, [selectedFeature?.id]);

  return (
    <div className="absolute top-4 left-4 z-[700] flex items-center gap-1.5 pointer-events-auto">
      {/* Sleek Floating Icon Toolbar */}
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
          title="Kiểu Bàn tay: Di chuyển bản đồ"
        >
          <Hand className="w-4 h-4" />
        </button>

        {/* Mode 2: Kiểu Con Trỏ (Pointer - Edit Mode) - Chỉ hiện khi đã đăng nhập (Editor/Admin) */}
        {currentRole !== 'guest' && (
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
            title="Kiểu Con trỏ (Edit Mode): Chọn đối tượng, Chỉnh sửa, Copy, Cut, Paste, Xóa"
          >
            <MousePointer className="w-4 h-4" />
          </button>
        )}

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        {/* Mode 3: Đo khoảng cách */}
        <button
          type="button"
          onClick={() => {
            onInteractionModeChange('measure_distance');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            interactionMode === 'measure_distance'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Đo khoảng cách (Tuyến tính)"
        >
          <Ruler className="w-4 h-4" />
        </button>

        {/* Mode 4: Đo diện tích tùy chọn */}
        <button
          type="button"
          onClick={() => {
            onInteractionModeChange('measure_area_custom');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            interactionMode === 'measure_area_custom'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Đo diện tích tùy chọn (Vẽ đa giác)"
        >
          <DraftingCompass className="w-4 h-4" />
        </button>

        {/* Mode 5: Đo diện tích đối tượng Polygon */}
        <button
          type="button"
          onClick={() => {
            onInteractionModeChange('measure_area_feature');
          }}
          className={`p-2 rounded-xl transition cursor-pointer ${
            interactionMode === 'measure_area_feature'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Đo diện tích đối tượng Polygon"
        >
          <Target className="w-4 h-4" />
        </button>

        {/* Chức năng Xóa, Copy, Cut, Paste chỉ hiển thị ở chế độ Pointer / Edit Mode */}
        {interactionMode === 'pointer' && currentRole !== 'guest' && (
          <>
            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            {/* Nút Xóa (Delete) */}
            <button
              type="button"
              onClick={() => {
                if (selectedFeature) setIsConfirmingDelete(true);
              }}
              disabled={!selectedFeature}
              className={`p-2 rounded-xl transition ${
                selectedFeature
                  ? 'text-slate-700 hover:bg-rose-50 hover:text-rose-600 cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
              title={
                selectedFeature
                  ? `Xóa đối tượng "${selectedFeature.name || 'GIS'}"`
                  : 'Hãy chọn đối tượng cần xóa'
              }
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Nút Copy (Sao chép) */}
            <button
              type="button"
              onClick={() => {
                if (selectedFeature && onCopy) onCopy();
              }}
              disabled={!selectedFeature}
              className={`p-2 rounded-xl transition ${
                selectedFeature
                  ? 'text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
              title={
                selectedFeature
                  ? `Sao chép đối tượng "${selectedFeature.name || 'GIS'}" (Ctrl+C)`
                  : 'Hãy chọn đối tượng cần sao chép'
              }
            >
              <Copy className="w-4 h-4" />
            </button>

            {/* Nút Cut (Cắt / Di chuyển) */}
            <button
              type="button"
              onClick={() => {
                if (selectedFeature && onCut) onCut();
              }}
              disabled={!selectedFeature}
              className={`p-2 rounded-xl transition ${
                selectedFeature
                  ? 'text-slate-700 hover:bg-amber-50 hover:text-amber-700 cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
              title={
                selectedFeature
                  ? `Cắt / Di chuyển đối tượng "${selectedFeature.name || 'GIS'}" (Ctrl+X)`
                  : 'Hãy chọn đối tượng cần cắt'
              }
            >
              <Scissors className="w-4 h-4" />
            </button>

            {/* Nút Paste (Dán) */}
            <button
              type="button"
              onClick={() => {
                if (hasClipboard && hasTargetLocation && onPaste) onPaste();
              }}
              disabled={!hasClipboard || !hasTargetLocation}
              className={`p-2 rounded-xl transition ${
                hasClipboard && hasTargetLocation
                  ? 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer animate-pulse'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
              title={
                !hasClipboard
                  ? 'Chưa sao chép hoặc cắt đối tượng nào'
                  : !hasTargetLocation
                  ? 'Kích chọn vị trí trên bản đồ để dán'
                  : 'Dán đối tượng vào vị trí đã chọn (Ctrl+V)'
              }
            >
              <Clipboard className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Save & Discard Actions when selected feature has unsaved edits */}
        {selectedFeature && isUnsaved && !pendingNextFeature && (
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

      {/* Delete Confirmation Badge */}
      {isConfirmingDelete && selectedFeature && (
        <div className="bg-slate-900/90 text-white backdrop-blur-md px-2 py-1.5 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-200">
          <Trash2 className="w-4 h-4 text-rose-400 shrink-0 ml-1" />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsConfirmingDelete(false);
                if (onDeleteSelected) onDeleteSelected();
              }}
              className="p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition cursor-pointer flex items-center justify-center"
              title="Xác nhận xóa"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsConfirmingDelete(false);
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer flex items-center justify-center"
              title="Hủy"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Pending Unsaved Changes Confirmation Floating Badge */}
      {pendingNextFeature && (
        <div className="bg-slate-900/90 text-white backdrop-blur-md px-2.5 py-1.5 rounded-2xl shadow-xl border border-amber-500/80 flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 ml-0.5" />
          <span className="text-xs text-slate-200 font-medium whitespace-nowrap">Lưu sửa đổi?</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onConfirmPendingSave) onConfirmPendingSave();
              }}
              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
              title="Lưu thay đổi và tiếp tục"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Có</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (onConfirmPendingDiscard) onConfirmPendingDiscard();
              }}
              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
              title="Bỏ thay đổi"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Không</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (onCancelPendingNext) onCancelPendingNext();
              }}
              className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
              title="Hủy bỏ (Quay lại sửa)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Ghost Paste Confirm / Cancel Actions Floating Badge */}
      {pendingPasteFeature && (
        <div className="bg-slate-900/90 text-white backdrop-blur-md px-2 py-1.5 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-200">
          <Clipboard className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onConfirmPaste) onConfirmPaste();
              }}
              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition cursor-pointer flex items-center justify-center"
              title="Xác nhận dán"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (onCancelPaste) onCancelPaste();
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer flex items-center justify-center"
              title="Hủy"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


