import React, { useState } from 'react';
import { LayerConfig, UserRole } from '../types';
import { Layers, ShieldAlert, Upload, Edit2, Check, X, Info, Focus } from 'lucide-react';

interface LeftSidebarProps {
  layers: LayerConfig[];
  onToggleVisibility: (layerId: string) => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  onZoomToLayer?: (layerId: string) => void;
  currentRole: UserRole;
  onImportClick: () => void;
  onClose?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  layers,
  onToggleVisibility,
  onRenameLayer,
  onZoomToLayer,
  currentRole,
  onImportClick,
  onClose,
}) => {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  // 1. Business layers on TOP
  const businessLayers = layers.filter((l) => !l.readOnlyForEditor);
  // 2. Administrative boundary layer BELOW
  const adminLayers = layers.filter((l) => l.readOnlyForEditor);

  const startEditing = (layer: LayerConfig) => {
    if (currentRole !== 'admin') return;
    setEditingLayerId(layer.id);
    setEditingName(layer.name);
  };

  const saveRename = (layerId: string) => {
    if (editingName.trim()) {
      onRenameLayer(layerId, editingName.trim());
    }
    setEditingLayerId(null);
  };

  const cancelRename = () => {
    setEditingLayerId(null);
  };

  const renderLayerItem = (layer: LayerConfig) => {
    const isEditing = editingLayerId === layer.id;

    return (
      <div
        key={layer.id}
        className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-100 rounded transition-colors group text-slate-800"
      >
        <div className="flex items-center min-w-0 flex-1 mr-1">
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={() => onToggleVisibility(layer.id)}
            className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
          />
          <span
            className="w-2.5 h-2.5 rounded-full ml-2 mr-1.5 shrink-0 border border-slate-300"
            style={{ backgroundColor: layer.color }}
          />

          {isEditing ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename(layer.id);
                  if (e.key === 'Escape') cancelRename();
                }}
                className="text-xs bg-white border border-blue-500 rounded px-1.5 py-0.5 text-slate-900 w-full focus:outline-none"
                autoFocus
              />
              <button
                onClick={() => saveRename(layer.id)}
                className="text-emerald-600 hover:bg-emerald-50 p-1 rounded cursor-pointer shrink-0"
                title="Lưu tên mới"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={cancelRename}
                className="text-slate-400 hover:bg-slate-200 p-1 rounded cursor-pointer shrink-0"
                title="Hủy"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-700 font-medium truncate group-hover:text-slate-900 flex-1">
              {layer.name}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          {onZoomToLayer && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onZoomToLayer(layer.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer shrink-0"
              title="Phóng tới phạm vi lớp này"
            >
              <Focus className="w-3 h-3" />
            </button>
          )}

          {/* Rename button for Admin */}
          {currentRole === 'admin' && !isEditing && (
            <button
              onClick={() => startEditing(layer)}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer shrink-0"
              title="Đổi tên lớp (Quyền Admin)"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-full text-slate-800 z-10 shadow-sm">
      {/* Sidebar Title */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>Quản lý lớp dữ liệu</span>
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition cursor-pointer"
            title="Ẩn bảng Quản lý lớp"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Layers List - Business Layers FIRST, Administrative Layer BELOW */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Group 1: Dữ liệu nghiệp vụ (TOP) */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
              Dữ liệu nghiệp vụ
            </p>
          </div>
          <div className="space-y-0.5">
            {businessLayers.map((layer) => renderLayerItem(layer))}
          </div>
        </div>

        {/* Group 2: Địa giới hành chính (BELOW) */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Địa giới hành chính
            </p>
          </div>
          <div className="space-y-0.5">
            {adminLayers.map((layer) => renderLayerItem(layer))}
          </div>
        </div>
      </div>

      {/* Legend Box - Positioned directly above the Import Button */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2">
        <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1">
            <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              Chú thích
            </h3>
          </div>
          <div className="grid gap-1 text-[11px] font-medium">
            <div className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 mr-2 shrink-0 border border-emerald-600/30" />
              <span className="text-slate-700 truncate">1. Đã tìm kiếm quy tập xong</span>
            </div>
            <div className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 mr-2 shrink-0 border border-amber-600/30" />
              <span className="text-slate-700 truncate">2. Đã tìm kiếm, quy tập nhưng chưa hết</span>
            </div>
            <div className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 mr-2 shrink-0 border border-blue-600/30" />
              <span className="text-slate-700 truncate">3. Có thông tin nhưng chưa tìm kiếm</span>
            </div>
            <div className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500 mr-2 shrink-0 border border-red-600/30" />
              <span className="text-slate-700 truncate">4. Đã tìm kiếm nhưng không có kết quả</span>
            </div>
            <div className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 mr-2 shrink-0 border border-slate-500/30" />
              <span className="text-slate-700 truncate">5. Đã quy tập nhưng chưa rõ thông tin </span>
            </div>
          </div>
        </div>

        {/* GeoJSON Import Button Area */}
        <div>
          <button
            onClick={onImportClick}
            disabled={currentRole !== 'admin'}
            className={`w-full py-2 px-3 rounded text-xs font-bold uppercase tracking-wider shadow-sm flex items-center justify-center space-x-1.5 transition-all ${
              currentRole === 'admin'
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-[0.99]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-80'
            }`}
            title={
              currentRole !== 'admin'
                ? 'Chỉ Quản trị viên (Admin) mới có quyền Import dữ liệu GeoJSON gốc'
                : 'Import tập tin GeoJSON lên hệ thống Firestore'
            }
          >
            <Upload className="w-3.5 h-3.5" />
            <span>+ Import Dữ liệu GeoJSON</span>
          </button>
        </div>

        {currentRole !== 'admin' && (
          <div className="flex items-center space-x-1 text-[10px] text-amber-600 bg-amber-50 p-1.5 rounded border border-amber-200">
            <ShieldAlert className="w-3 h-3 shrink-0" />
            <span>Chỉ Admin được import GeoJSON gốc</span>
          </div>
        )}
      </div>
    </aside>
  );
};
