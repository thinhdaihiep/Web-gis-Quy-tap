import React, { useState } from 'react';
import { LayerConfig, UserRole } from '../types';
import { Layers, ShieldAlert, Upload, Edit2, Check, X, Info, Focus, ChevronDown, ChevronRight, Folder } from 'lucide-react';

interface LeftSidebarProps {
  layers: LayerConfig[];
  onToggleVisibility: (layerId: string) => void;
  onToggleGroupVisibility?: (layerIds: string[], visible: boolean) => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  onZoomToLayer?: (layerId: string) => void;
  currentRole: UserRole;
  onImportClick: () => void;
  onClose?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  layers,
  onToggleVisibility,
  onToggleGroupVisibility,
  onRenameLayer,
  onZoomToLayer,
  currentRole,
  onImportClick,
  onClose,
}) => {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'business': true,
  });

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

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

    const layerNameLower = layer.name.toLowerCase();
    const isBattle = layer.id === 'layer2_tran_danh' || layerNameLower.includes('trận đánh') || layerNameLower.includes('tran danh');
    const isGrave = layer.id === 'layer1_mo_liet_si' || layerNameLower.includes('mộ liệt sĩ') || layerNameLower.includes('mo liet si') || layerNameLower.includes('mộ');
    const isCemetery = layer.id === 'layer3_nghia_trang' || layerNameLower.includes('nghĩa trang') || layerNameLower.includes('nghia trang');

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
          {isBattle ? (
            <span className="w-3.5 h-3.5 rounded-full ml-1.5 mr-1 shrink-0 bg-white border border-red-500 flex items-center justify-center shadow-2xs" title="Trận đánh">
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="#ef4444">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </span>
          ) : isGrave ? (
            <span className="w-3.5 h-3.5 rounded-full ml-1.5 mr-1 shrink-0 bg-white border border-emerald-600 flex items-center justify-center shadow-2xs" title="Mộ liệt sĩ">
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="#16a34a">
                <path d="M12 3c-3.86 0-7 3.14-7 7v9h14v-9c0-3.86-3.14-7-7-7zm-1 3.5h2v2.5h2.5v2H13V15h-2v-4H8.5v-2H11V6.5z"/>
              </svg>
            </span>
          ) : isCemetery ? (
            <span className="w-3.5 h-3.5 rounded-[3px] ml-1.5 mr-1 shrink-0 bg-white border border-purple-600 flex items-center justify-center shadow-2xs" title="Nghĩa trang liệt sĩ">
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="#9333ea">
                <path d="M4 20h16v2H4v-2zm2-2h12V10c0-3.31-2.69-6-6-6s-6 2.69-6 6v8zm5-11h2v2.5h2.5v2H13V15h-2v-3.5H8.5v-2H11V7z"/>
              </svg>
            </span>
          ) : (
            <span
              className="w-2.5 h-2.5 rounded-full ml-2 mr-1.5 shrink-0 border border-slate-300"
              style={{ backgroundColor: layer.color }}
            />
          )}

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

  const renderGroup = (
    groupId: string,
    title: string,
    groupLayers: LayerConfig[],
    titleColorClass: string = "text-slate-700"
  ) => {
    if (groupLayers.length === 0) return null;
    
    const isExpanded = expandedGroups[groupId];
    const isAllVisible = groupLayers.length > 0 && groupLayers.every(l => l.visible);
    const isSomeVisible = groupLayers.some(l => l.visible);

    return (
      <div className="mb-2">
        <div
          className="flex items-center justify-between px-2 py-1 mb-1 hover:bg-slate-100 rounded cursor-pointer transition-colors"
          onClick={() => toggleGroupExpand(groupId)}
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
            <Folder className={`w-3.5 h-3.5 ${titleColorClass} shrink-0`} />
            <span className={`text-[11px] font-bold ${titleColorClass} uppercase tracking-wider truncate`}>
              {title}
            </span>
          </div>
          
          <div className="flex items-center ml-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isAllVisible}
              ref={el => {
                if (el) el.indeterminate = isSomeVisible && !isAllVisible;
              }}
              onChange={(e) => {
                if (onToggleGroupVisibility) {
                  onToggleGroupVisibility(groupLayers.map(l => l.id), e.target.checked);
                }
              }}
              className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              title="Bật/tắt toàn bộ thư mục"
            />
          </div>
        </div>
        
        {isExpanded && (
          <div className="pl-4 space-y-0.5 border-l border-slate-100 ml-3.5 mt-1">
            {groupLayers.map((layer) => renderLayerItem(layer))}
          </div>
        )}
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

      {/* Layers List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {layers.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-4 italic">Chưa có lớp dữ liệu nào</div>
        ) : (
          layers.map((layer) => renderLayerItem(layer))
        )}
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
        {currentRole === 'admin' && (
          <div>
            <button
              onClick={onImportClick}
              className="w-full py-2 px-3 rounded text-xs font-bold uppercase tracking-wider shadow-sm flex items-center justify-center space-x-1.5 transition-all bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-[0.99]"
              title="Import tập tin GeoJSON lên hệ thống Firestore"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>+ Import Dữ liệu GeoJSON</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
