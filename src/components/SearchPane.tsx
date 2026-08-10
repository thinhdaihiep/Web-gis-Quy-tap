import React, { useState, useMemo } from 'react';
import { Search, X, MapPin, Target, Landmark, ShieldAlert, Crosshair, ChevronRight } from 'lucide-react';
import { LayerConfig, GeoJsonFeatureItem } from '../types';
import { getFieldAlias } from '../fieldAlias';

interface SearchPaneProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerConfig[];
  features: GeoJsonFeatureItem[];
  selectedFeatureId?: string | null;
  onSingleClickFeature: (feature: GeoJsonFeatureItem) => void;
  onDoubleClickFeature: (feature: GeoJsonFeatureItem) => void;
}

function getFeatureDisplayName(feat: GeoJsonFeatureItem): string {
  const props = feat.properties || {};

  if (props['Ten'] !== undefined && props['Ten'] !== null && String(props['Ten']).trim() !== '') {
    return String(props['Ten']).trim();
  }
  if (props['ten'] !== undefined && props['ten'] !== null && String(props['ten']).trim() !== '') {
    return String(props['ten']).trim();
  }
  if (props['TEN'] !== undefined && props['TEN'] !== null && String(props['TEN']).trim() !== '') {
    return String(props['TEN']).trim();
  }

  for (const k of Object.keys(props)) {
    const val = props[k];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      const alias = getFieldAlias(k);
      if (alias === 'Tên' || k === 'name' || k === 'Name') {
        return String(val).trim();
      }
    }
  }

  if (feat.name && !['Feature', 'Polygon', 'Point', 'LineString'].includes(feat.name.trim())) {
    return feat.name.trim();
  }

  return feat.name || 'Đối tượng GIS';
}

function getLayerBadge(layerId?: string) {
  switch (layerId) {
    case 'layer1_mo_liet_si':
      return {
        label: 'Mộ Liệt sĩ',
        bg: 'bg-red-500/20 text-red-400 border-red-500/30',
        icon: Target,
      };
    case 'layer2_nghia_trang_ls':
      return {
        label: 'Nghĩa trang LS',
        bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        icon: Landmark,
      };
    case 'layer3_tran_danh':
      return {
        label: 'Trận đánh',
        bg: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
        icon: ShieldAlert,
      };
    case 'layer4_khu_vuc_quy_tap':
      return {
        label: 'Khu vực quy tập',
        bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        icon: Crosshair,
      };
    default:
      return {
        label: 'Dữ liệu GIS',
        bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        icon: MapPin,
      };
  }
}

export const SearchPane: React.FC<SearchPaneProps> = ({
  isOpen,
  onClose,
  layers,
  features,
  selectedFeatureId,
  onSingleClickFeature,
  onDoubleClickFeature,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [appliedQuery, setAppliedQuery] = useState<string>('');
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [selectedLayerFilter, setSelectedLayerFilter] = useState<string>('all');

  const handleExecuteSearch = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setAppliedQuery(trimmed);
    setHasSearched(true);
  };

  const handleClearSearch = () => {
    setInputText('');
    setAppliedQuery('');
    setHasSearched(false);
  };

  const filteredFeatures = useMemo(() => {
    if (!hasSearched || !appliedQuery) return [];

    return features.filter((feat) => {
      // 1. Layer Filter
      if (selectedLayerFilter !== 'all' && feat.layerId !== selectedLayerFilter) {
        return false;
      }

      // 2. Query Text Filter
      const q = appliedQuery.toLowerCase();

      // Check name / code / id
      const displayName = getFeatureDisplayName(feat).toLowerCase();
      if (displayName.includes(q)) return true;
      if (feat.code && feat.code.toLowerCase().includes(q)) return true;
      if (feat.id && feat.id.toLowerCase().includes(q)) return true;

      // Check all properties values
      const props = feat.properties || {};
      for (const [k, v] of Object.entries(props)) {
        if (v !== null && v !== undefined) {
          const valStr = String(v).toLowerCase();
          if (valStr.includes(q)) return true;
          const alias = getFieldAlias(k);
          if (alias && alias.toLowerCase().includes(q)) return true;
        }
      }

      return false;
    });
  }, [features, appliedQuery, hasSearched, selectedLayerFilter]);

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-slate-900 text-slate-100 border-r border-slate-700/80 h-full flex flex-col backdrop-blur-md">
      {/* Pane Header */}
      <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-400 shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            TÌM KIẾM
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Đóng bảng tìm kiếm"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Controls: Search Input & Layer Selector */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-900/50 flex flex-col gap-2.5 shrink-0">
        {/* Search Text Input & Search Button */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleExecuteSearch();
                }
              }}
              placeholder="Nhập tên, quê quán, nghĩa trang, mã số..."
              className="w-full bg-slate-800 text-xs text-slate-100 placeholder-slate-400 pl-3 pr-8 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              autoFocus
            />
            {(inputText || hasSearched) && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleExecuteSearch}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg flex items-center justify-center transition cursor-pointer shrink-0 shadow-xs"
            title="Nhấn để tìm kiếm"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Layer ComboBox Selector (No label text) */}
        <div>
          <select
            value={selectedLayerFilter}
            onChange={(e) => setSelectedLayerFilter(e.target.value)}
            className="w-full bg-slate-800 text-xs font-medium text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">-- Tất cả các lớp ({features.length}) --</option>
            {layers.map((l) => {
              const layerCount = features.filter((f) => f.layerId === l.id).length;
              return (
                <option key={l.id} value={l.id} className="bg-slate-800 text-slate-200">
                  {l.name} ({layerCount})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Summary Bar (Only shown when a search has been executed) */}
      {hasSearched && (
        <div className="px-3 py-1.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>
            Kết quả tìm kiếm: <strong className="text-blue-400">{filteredFeatures.length}</strong> đối tượng
          </span>
          <button
            onClick={handleClearSearch}
            className="text-[10px] text-red-400 hover:text-red-300 font-medium flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3 h-3" /> Xóa tìm kiếm
          </button>
        </div>
      )}

      {/* Results List or Empty Prompt */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {!hasSearched ? (
          <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <Search className="w-8 h-8 stroke-1 text-slate-500 opacity-50" />
            <p className="text-slate-300 font-medium">Nhập từ khóa và nhấn nút Tìm kiếm (hoặc phím Enter)</p>
            <p className="text-[11px] text-slate-500">Tra cứu nhanh tên liệt sĩ, quê quán, nghĩa trang, mã số...</p>
          </div>
        ) : filteredFeatures.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
            <Search className="w-8 h-8 stroke-1 text-slate-600 opacity-60" />
            <p>Không tìm thấy đối tượng nào phù hợp với từ khóa "{appliedQuery}".</p>
            <button
              onClick={handleClearSearch}
              className="mt-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded border border-slate-700 transition cursor-pointer"
            >
              Xóa bộ lọc tìm kiếm
            </button>
          </div>
        ) : (
          filteredFeatures.map((feat, idx) => {
            const displayName = getFeatureDisplayName(feat);
            const badge = getLayerBadge(feat.layerId);
            const Icon = badge.icon;
            const isSelected = String(selectedFeatureId) === String(feat.id);

            // Extract a few summary details from properties
            const props = feat.properties || {};
            const subInfo =
              props['QueQuan'] ||
              props['que_quan'] ||
              props['DiaDanh'] ||
              props['DonVi'] ||
              props['NghiaTrang'] ||
              props['Huyen'] ||
              props['Tinh'] ||
              null;

            return (
              <div
                key={`${feat.layerId || 'layer'}_${feat.id}_${idx}`}
                onClick={() => onSingleClickFeature(feat)}
                onDoubleClick={() => onDoubleClickFeature(feat)}
                className={`p-2.5 rounded-xl border transition cursor-pointer select-none flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-blue-900/40 border-blue-500/80 shadow-md shadow-blue-950/50 text-white'
                    : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600 text-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 shrink-0 ${badge.bg}`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{badge.label}</span>
                    </span>
                    <h3 className="text-xs font-bold truncate text-slate-100">
                      {displayName}
                    </h3>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition ${isSelected ? 'text-blue-400 translate-x-0.5' : 'text-slate-500'}`} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-700/40 pt-1">
                  <span className="font-mono text-[10px] text-slate-400">
                    Mã: <b className="text-slate-300">{feat.code || feat.id}</b>
                  </span>
                  {subInfo && (
                    <span className="truncate max-w-[180px] text-slate-300 italic">
                      {String(subInfo)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
