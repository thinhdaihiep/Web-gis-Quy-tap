import React, { useState } from 'react';
import { LayerConfig, UserRole, GeoJsonFeatureItem } from '../types';
import { Layers, Upload, X, Info, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { SearchAreaShapeBadge, BattleShapeBadge, GraveShapeBadge, CemeteryShapeBadge } from './GisIcons';

interface LeftSidebarProps {
  layers: LayerConfig[];
  features?: GeoJsonFeatureItem[];
  onToggleVisibility: (layerId: string) => void;
  onToggleGroupVisibility?: (layerIds: string[], visible: boolean) => void;
  onRenameLayer?: (layerId: string, newName: string) => void;
  onZoomToLayer?: (layerId: string) => void;
  currentRole: UserRole;
  onImportClick: () => void;
  onClose?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  layers,
  features = [],
  onToggleVisibility,
  onToggleGroupVisibility,
  currentRole,
  onImportClick,
  onClose,
}) => {
  const [activeInfoLayerId, setActiveInfoLayerId] = useState<string | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    business: true,
  });

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const getLayerFeatures = (layer: LayerConfig) => {
    if (!features || features.length === 0) return [];
    const layerNameLower = layer.name.toLowerCase();
    const isSearchArea =
      layer.id === 'layer1_tim_kiem' ||
      layer.id === 'layer4_khu_vuc_quy_tap' ||
      layerNameLower.includes('tìm kiếm') ||
      layerNameLower.includes('quy tập') ||
      layerNameLower.includes('khu vực');

    const isBattle =
      layer.id === 'layer2_tran_danh' ||
      layerNameLower.includes('trận đánh') ||
      layerNameLower.includes('tran danh');

    const isGrave =
      layer.id === 'layer3_mo_chi' ||
      layer.id === 'layer1_mo_liet_si' ||
      layerNameLower.includes('mộ liệt sĩ') ||
      layerNameLower.includes('mo liet si') ||
      (layerNameLower.includes('mộ') && !layerNameLower.includes('nghĩa trang'));

    const isCemetery =
      layer.id === 'layer4_nghia_trang' ||
      layer.id === 'layer3_nghia_trang' ||
      layerNameLower.includes('nghĩa trang') ||
      layerNameLower.includes('nghia trang');

    return features.filter((f) => {
      if (f.layerId === layer.id) return true;
      const fLayerLower = (f.layerId || '').toLowerCase();
      if (
        isSearchArea &&
        (fLayerLower.includes('tim_kiem') ||
          fLayerLower.includes('quy_tap') ||
          f.type === 'Polygon' ||
          f.type === 'MultiPolygon')
      )
        return true;
      if (isBattle && fLayerLower.includes('tran_danh')) return true;
      if (isGrave && (fLayerLower.includes('mo_chi') || fLayerLower.includes('mo_liet_si'))) return true;
      if (isCemetery && fLayerLower.includes('nghia_trang')) return true;
      return false;
    });
  };

  const renderLayerItem = (layer: LayerConfig) => {
    const layerNameLower = layer.name.toLowerCase();
    const isSearchArea =
      layer.id === 'layer1_tim_kiem' ||
      layer.id === 'layer4_khu_vuc_quy_tap' ||
      layerNameLower.includes('tìm kiếm') ||
      layerNameLower.includes('quy tập') ||
      layerNameLower.includes('khu vực');
    const isBattle =
      layer.id === 'layer2_tran_danh' ||
      layerNameLower.includes('trận đánh') ||
      layerNameLower.includes('tran danh');
    const isGrave =
      layer.id === 'layer3_mo_chi' ||
      layer.id === 'layer1_mo_liet_si' ||
      layerNameLower.includes('mộ liệt sĩ') ||
      layerNameLower.includes('mo liet si') ||
      (layerNameLower.includes('mộ') && !layerNameLower.includes('nghĩa trang'));
    const isCemetery =
      layer.id === 'layer4_nghia_trang' ||
      layer.id === 'layer3_nghia_trang' ||
      layerNameLower.includes('nghĩa trang') ||
      layerNameLower.includes('nghia trang');

    const isInfoActive = activeInfoLayerId === layer.id;

    return (
      <div key={layer.id} className="space-y-1">
        <div className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-100 rounded transition-colors group text-slate-800">
          <div className="flex items-center min-w-0 flex-1 mr-1">
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={() => onToggleVisibility(layer.id)}
              className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
            />
            <div className="ml-1.5 mr-1 shrink-0">
              {isSearchArea ? (
                <SearchAreaShapeBadge className="w-4 h-4" />
              ) : isBattle ? (
                <BattleShapeBadge className="w-4 h-4" />
              ) : isGrave ? (
                <GraveShapeBadge className="w-4 h-4" />
              ) : isCemetery ? (
                <CemeteryShapeBadge className="w-4 h-4" />
              ) : (
                <span
                  className="w-2.5 h-2.5 rounded-full block border border-slate-300"
                  style={{ backgroundColor: layer.color }}
                />
              )}
            </div>

            <span className="text-xs text-slate-700 font-medium truncate group-hover:text-slate-900 flex-1">
              {layer.name}
            </span>
          </div>

          {/* Action button: Info only (no text label) */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveInfoLayerId((prev) => (prev === layer.id ? null : layer.id));
              }}
              className={`p-1 rounded transition cursor-pointer shrink-0 ${
                isInfoActive
                  ? 'text-blue-600 bg-blue-100'
                  : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
              }`}
              title="Thông tin thống kê lớp"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Info statistics panel */}
        {isInfoActive && (() => {
          const layerFeats = getLayerFeatures(layer);
          const totalCount = layerFeats.length;

          const phanLoaiCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
          if (isSearchArea) {
            layerFeats.forEach((f) => {
              const p = f.properties || {};
              const val = p.PhanLoai ?? p.phan_loai ?? p.phanLoai ?? p['Phân loại'] ?? p.Phanloai;
              const num = val !== undefined && val !== null ? parseInt(String(val).replace(/[^0-9]/g, ''), 10) : NaN;
              if (!isNaN(num) && num >= 1 && num <= 5) {
                phanLoaiCounts[num] = (phanLoaiCounts[num] || 0) + 1;
              } else {
                phanLoaiCounts[5] = (phanLoaiCounts[5] || 0) + 1;
              }
            });
          }

          return (
            <div className="ml-5 my-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5 shadow-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-medium text-[11px]">Tổng số lượng:</span>
                <span className="font-bold text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded text-[11px]">
                  {totalCount} đối tượng
                </span>
              </div>

              {isSearchArea && (
                <div className="pt-1 border-t border-slate-200/80 space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Chi tiết theo Phân loại:
                  </div>
                  <div className="space-y-1 text-[10.5px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate text-slate-600">1. Đã tìm kiếm quy tập xong</span>
                      </div>
                      <span className="font-bold text-slate-800 ml-1">{phanLoaiCounts[1]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span className="truncate text-slate-600">2. Đã quy tập chưa xong</span>
                      </div>
                      <span className="font-bold text-slate-800 ml-1">{phanLoaiCounts[2]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
                        <span className="truncate text-slate-600">3. Chưa tổ chức tìm kiếm</span>
                      </div>
                      <span className="font-bold text-slate-800 ml-1">{phanLoaiCounts[3]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <span className="truncate text-slate-600">4. Đã tìm chưa có kết quả</span>
                      </div>
                      <span className="font-bold text-slate-800 ml-1">{phanLoaiCounts[4]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                        <span className="truncate text-slate-600">5. Tìm kiếm, quy tập không rõ thông tin</span>
                      </div>
                      <span className="font-bold text-slate-800 ml-1">{phanLoaiCounts[5]}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
              <span className="w-2.5 h-2.5 rounded-sm bg-pink-500 mr-2 shrink-0 border border-pink-600/30" />
              <span className="text-slate-700 truncate">3. Có thông tin nhưng chưa tìm kiếm</span>
            </div>
            <div className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500 mr-2 shrink-0 border border-red-600/30" />
              <span className="text-slate-700 truncate">4. Đã tìm kiếm nhưng không có kết quả</span>
            </div>
            <div className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 mr-2 shrink-0 border border-slate-500/30" />
              <span className="text-slate-700 truncate">5. Tìm kiếm, quy tập không rõ thông tin</span>
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
