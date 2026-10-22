import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  ChevronRight,
  Database,
  Globe,
  Home,
  Mountain,
  Landmark,
  Copy,
  Check,
  MapPin,
  PlusCircle,
  AlertCircle,
  Loader2,
  Waves,
  Route,
} from 'lucide-react';
import { List } from 'react-window';
import L from 'leaflet';
import { LayerConfig, GeoJsonFeatureItem } from '../types';
import { getFieldAlias, isFeatureMatch } from '../fieldAlias';
import { formatDateForDisplay } from '../utils/dateFormatter';
import {
  OsmGroup,
  OsmItem,
  OsmError,
  searchOsm,
  filterOsm,
  makeBBoxKey,
  isZoomOk,
} from '../utils/osmService';

interface SearchPaneProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerConfig[];
  features: GeoJsonFeatureItem[];
  selectedFeatureId?: string | null;
  onSingleClickFeature: (feature: GeoJsonFeatureItem) => void;
  onDoubleClickFeature?: (feature: GeoJsonFeatureItem) => void;
  mapInstance?: L.Map | null;
  currentRole?: 'admin' | 'editor' | 'guest';
  onLocateOsmFeature?: (osmItem: OsmItem) => void;
  onAddFeatureFromOsm?: (osmItem: OsmItem) => void;
  onClearOsmMarker?: () => void;
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

  return feat.name || 'Đối tượng';
}

export const SearchPane: React.FC<SearchPaneProps> = ({
  isOpen,
  onClose,
  layers,
  features,
  selectedFeatureId,
  onSingleClickFeature,
  mapInstance,
  currentRole = 'guest',
  onLocateOsmFeature,
  onAddFeatureFromOsm,
  onClearOsmMarker,
}) => {
  // Tab state: 'data' (Dữ liệu GIS) | 'map' (OpenStreetMap)
  const [activeTab, setActiveTab] = useState<'data' | 'map'>('data');

  // Shared Search Input
  const [inputText, setInputText] = useState<string>('');

  // Tab 1 (Dữ liệu) States
  const [appliedDataQuery, setAppliedDataQuery] = useState<string>('');
  const [hasDataSearched, setHasDataSearched] = useState<boolean>(false);
  const [selectedLayerFilter, setSelectedLayerFilter] = useState<string>('all');
  const [isSearchingData, setIsSearchingData] = useState<boolean>(false);

  // Tab 2 (Bản đồ OSM) States
  const [cachedOsmData, setCachedOsmData] = useState<{
    bboxKey: string;
    keyword: string;
    allElements: OsmItem[];
  } | null>(null);
  const [osmFilterGroup, setOsmFilterGroup] = useState<OsmGroup>('all');
  const [isSearchingOsm, setIsSearchingOsm] = useState<boolean>(false);
  const [osmError, setOsmError] = useState<string | null>(null);
  const [copiedOsmId, setCopiedOsmId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 1. Thực thi tìm kiếm cho Tab Dữ liệu GIS
  const executeDataSearch = useCallback(
    (queryToSearch?: string) => {
      const q = (queryToSearch !== undefined ? queryToSearch : inputText).trim();
      if (!q) return;

      setIsSearchingData(true);
      setTimeout(() => {
        setAppliedDataQuery(q);
        setHasDataSearched(true);
        setIsSearchingData(false);
      }, 150);
    },
    [inputText]
  );

  // 2. Thực thi tìm kiếm cho Tab Bản đồ OSM
  const executeOsmSearch = useCallback(
    async (keywordToSearch?: string) => {
      if (!mapInstance) {
        setOsmError('Bản đồ chưa sẵn sàng.');
        return;
      }

      if (!isZoomOk(mapInstance)) {
        setOsmError('Vui lòng phóng to bản đồ (Zoom ≥ 11) để quét địa danh.');
        return;
      }

      const q = (keywordToSearch !== undefined ? keywordToSearch : inputText).trim();

      // Nếu để trống ô nhập liệu thì không truy vấn bản đồ (tránh truy vấn quá nhiều)
      if (!q) {
        setOsmError('Vui lòng nhập từ khóa tìm kiếm (tên xã, sông núi, hồ, tên đường...).');
        return;
      }

      // Hủy request đang chạy nếu có
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsSearchingOsm(true);
      setOsmError(null);

      try {
        const bounds = mapInstance.getBounds();
        const bboxKey = makeBBoxKey(bounds);

        const items = await searchOsm(
          {
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast(),
          },
          q,
          controller.signal
        );

        setCachedOsmData({
          bboxKey,
          keyword: q,
          allElements: items,
        });
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        setOsmError(err.message || 'Lỗi khi truy vấn dữ liệu OpenStreetMap.');
      } finally {
        setIsSearchingOsm(false);
      }
    },
    [mapInstance, inputText]
  );

  // 3. Nút Search hoặc Enter chung
  const handleExecuteSearch = () => {
    if (activeTab === 'data') {
      executeDataSearch();
    } else {
      executeOsmSearch();
    }
  };

  // 4. Xóa ô tìm kiếm
  const handleClearSearch = () => {
    setInputText('');
    if (activeTab === 'data') {
      setAppliedDataQuery('');
      setHasDataSearched(false);
      setIsSearchingData(false);
    } else {
      // Ở tab Bản đồ: xóa kết quả và xóa marker, không tự động quét lại khi ô trống
      setCachedOsmData(null);
      setOsmError(null);
      setIsSearchingOsm(false);
      onClearOsmMarker?.();
    }
  };

  // 5. Chuyển Tab có xử lý tự động tìm kiếm & dọn dẹp marker
  const handleTabChange = (newTab: 'data' | 'map') => {
    if (newTab === activeTab) return;

    setActiveTab(newTab);
    onClearOsmMarker?.();

    if (newTab === 'map') {
      // Chỉ tìm kiếm khi ô nhập đã có sẵn từ khóa
      const trimmed = inputText.trim();
      if (trimmed && (!cachedOsmData || cachedOsmData.keyword !== trimmed) && mapInstance && isZoomOk(mapInstance)) {
        executeOsmSearch(trimmed);
      }
    } else {
      // Nếu tab Dữ liệu chưa có kết quả và ô nhập có từ khóa, tự động lọc
      if (!hasDataSearched && inputText.trim()) {
        executeDataSearch(inputText.trim());
      }
    }
  };

  // 6. Khi đổi ComboBox lọc lớp ở Tab Dữ liệu: Lọc lại ngay
  const handleDataLayerFilterChange = (layerId: string) => {
    setSelectedLayerFilter(layerId);
    if (inputText.trim()) {
      executeDataSearch(inputText.trim());
    }
  };

  // 7. Khi đổi ComboBox lọc nhóm ở Tab Bản đồ: Lọc Client-side tức thì (không gọi mạng)
  const handleOsmGroupFilterChange = (group: OsmGroup) => {
    setOsmFilterGroup(group);
  };

  // 8. Đóng panel: Ẩn panel, giữ nguyên kết quả tìm kiếm và marker
  const handleClose = () => {
    onClose();
  };

  // Lọc danh sách Tab 1 (Dữ liệu GIS)
  const filteredFeatures = useMemo(() => {
    if (!hasDataSearched || !appliedDataQuery) return [];

    return features.filter((feat) => {
      if (selectedLayerFilter !== 'all' && feat.layerId !== selectedLayerFilter) {
        return false;
      }

      const q = appliedDataQuery.toLowerCase();
      const displayName = getFeatureDisplayName(feat).toLowerCase();
      if (displayName.includes(q)) return true;
      if (feat.code && feat.code.toLowerCase().includes(q)) return true;
      if (feat.id && feat.id.toLowerCase().includes(q)) return true;

      const props = feat.properties || {};
      for (const [k, v] of Object.entries(props)) {
        if (v !== null && v !== undefined) {
          const valStr = String(v).toLowerCase();
          if (valStr.includes(q)) return true;
          const alias = getFieldAlias(k);
          if (alias && alias.toLowerCase().includes(q)) return true;
          const formattedDate = formatDateForDisplay(v, k, alias || k).toLowerCase();
          if (formattedDate && formattedDate.includes(q)) return true;
        }
      }

      return false;
    });
  }, [features, appliedDataQuery, hasDataSearched, selectedLayerFilter]);

  // Lọc danh sách Tab 2 (OpenStreetMap) Client-side tức thì
  const filteredOsmItems = useMemo(() => {
    if (!cachedOsmData) return [];
    return filterOsm(cachedOsmData.allElements, osmFilterGroup);
  }, [cachedOsmData, osmFilterGroup]);

  // Sao chép tên + tọa độ địa danh OSM
  const handleCopyOsm = (item: OsmItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${item.name}, ${item.lat}, ${item.lon}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedOsmId(item.id);
      setTimeout(() => setCopiedOsmId(null), 2000);
    });
  };

  // Mở Google Maps
  const handleOpenGoogleMaps = (item: OsmItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://www.google.com/maps?q=${item.lat},${item.lon}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Thêm đối tượng GIS từ địa danh OSM (chỉ Admin/Biên tập viên)
  const handleAddFromOsm = (item: OsmItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddFeatureFromOsm) {
      onAddFeatureFromOsm(item);
    }
  };

  // Virtualized List container dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [listDimensions, setListDimensions] = useState<{ width: number; height: number }>({
    width: 320,
    height: 400,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setListDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isOpen, hasDataSearched, activeTab, filteredFeatures.length, filteredOsmItems.length]);

  return (
    <div className="w-80 sm:w-96 bg-slate-900 border-r border-slate-700/80 flex flex-col h-full shadow-2xl z-[2000]">
      {/* 1. Header: Tiêu đề + Nút Đóng */}
      <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            TÌM KIẾM
          </h2>
        </div>
        <button
          onClick={handleClose}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Đóng bảng tìm kiếm"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Đầu bảng DÙNG CHUNG: Ô nhập liệu + Nút Search */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-900/50 flex flex-col gap-2.5 shrink-0">
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
              placeholder={
                activeTab === 'data'
                  ? 'Nhập tên, quê quán, nghĩa trang, mã số...'
                  : 'Nhập tên xã, sông núi, hồ, tên đường...'
              }
              className="w-full bg-slate-800 text-xs text-slate-100 placeholder-slate-400 pl-3 pr-8 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              autoFocus
            />
            {inputText && (
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
            disabled={activeTab === 'data' ? isSearchingData : isSearchingOsm}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-80 text-white rounded-lg flex items-center justify-center transition cursor-pointer shrink-0 shadow-xs active:scale-95"
            title="Nhấn để tìm kiếm"
          >
            {isSearchingData || isSearchingOsm ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* 3. Thanh 2 TAB (Dữ liệu & Bản đồ) */}
        <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950/80 rounded-lg border border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => handleTabChange('data')}
            className={`py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'data'
                ? 'bg-blue-600 text-white shadow-xs border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Tìm kiếm trong 4 lớp dữ liệu CSDL"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Dữ liệu</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('map')}
            className={`py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'map'
                ? 'bg-blue-600 text-white shadow-xs border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Truy vấn địa danh thực địa từ OpenStreetMap"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Bản đồ</span>
          </button>
        </div>

        {/* 4. ComboBox LỌC (Thay đổi theo Tab đang chọn) */}
        <div>
          {activeTab === 'data' ? (
            <select
              value={selectedLayerFilter}
              onChange={(e) => handleDataLayerFilterChange(e.target.value)}
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
          ) : (
            <select
              value={osmFilterGroup}
              onChange={(e) => handleOsmGroupFilterChange(e.target.value as OsmGroup)}
              className="w-full bg-slate-800 text-xs font-medium text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">
                -- Tất cả địa danh {cachedOsmData ? `(${cachedOsmData.allElements.length})` : ''} --
              </option>
              <option value="hanh_chinh">Hành chính & Dân cư</option>
              <option value="song_nui">Sông núi & Thủy văn</option>
              <option value="di_tich">Nghĩa trang & Di tích</option>
              <option value="giao_thong">Giao thông & Đường sá</option>
            </select>
          )}
        </div>
      </div>

      {/* 5. Dòng Tóm tắt Kết quả (Summary Bar) */}
      {activeTab === 'data' && hasDataSearched && (
        <div className="px-3 py-1.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>
            Kết quả: <strong className="text-blue-400">{filteredFeatures.length}</strong> đối tượng
          </span>
          <button
            onClick={handleClearSearch}
            className="text-[10px] text-red-400 hover:text-red-300 font-medium flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3 h-3" /> Xóa
          </button>
        </div>
      )}

      {activeTab === 'map' && cachedOsmData && (
        <div className="px-3 py-1.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>
            Địa danh OSM: <strong className="text-sky-400">{filteredOsmItems.length}</strong> điểm
          </span>
          <span className="text-[10px] text-slate-500 italic">Trong khung nhìn</span>
        </div>
      )}

      {/* 6. Danh sách Kết quả / Thông báo Trạng thái */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-2 custom-scrollbar">
        {/* TAB 1: DỮ LIỆU GIS */}
        {activeTab === 'data' && (
          <>
            {!hasDataSearched ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Search className="w-8 h-8 stroke-1 text-slate-500 opacity-50" />
                <p className="text-slate-300 font-medium">Nhập từ khóa và nhấn nút Tìm kiếm (hoặc Enter)</p>
                <p className="text-[11px] text-slate-500">Tra cứu tên liệt sĩ, quê quán, nghĩa trang, mã số...</p>
              </div>
            ) : filteredFeatures.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <Search className="w-8 h-8 stroke-1 text-slate-600 opacity-60" />
                <p>Không tìm thấy đối tượng nào phù hợp với từ khóa "{appliedDataQuery}".</p>
                <button
                  onClick={handleClearSearch}
                  className="mt-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded border border-slate-700 transition cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              </div>
            ) : (
              <List
                className="custom-scrollbar"
                defaultHeight={Math.max(listDimensions.height - 16, 120)}
                overscanCount={80}
                rowCount={filteredFeatures.length}
                rowHeight={74}
                rowProps={{
                  features: filteredFeatures,
                  selectedFeatureId,
                  layers,
                  onSingleClickFeature,
                }}
                rowComponent={({ index, style, features, selectedFeatureId, layers, onSingleClickFeature }) => {
                  const feat = features[index];
                  if (!feat) return null;

                  const displayName = getFeatureDisplayName(feat);
                  const isSelected = isFeatureMatch(feat, selectedFeatureId);
                  const layerObj = layers.find((l: any) => l.id === feat.layerId);
                  const layerName = layerObj?.name || 'Lớp dữ liệu';

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
                      style={{
                        ...style,
                        top: (typeof style.top === 'number' ? style.top : parseFloat(String(style.top))) + 'px',
                        height:
                          (typeof style.height === 'number' ? style.height - 6 : parseFloat(String(style.height)) - 6) +
                          'px',
                      }}
                      className="pr-1"
                    >
                      <div
                        onClick={() => onSingleClickFeature(feat)}
                        className={`h-full p-2.5 rounded-xl border transition cursor-pointer select-none flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-900/50 border-blue-500 text-white shadow-md shadow-blue-950/40'
                            : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600 text-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            className={`text-xs font-bold truncate ${
                              isSelected ? 'text-blue-300' : 'text-slate-100'
                            }`}
                          >
                            {displayName}
                          </h3>
                          <ChevronRight
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isSelected ? 'text-blue-400' : 'text-slate-500'
                            }`}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-700/40 pt-1">
                          <span className="text-[10px] text-blue-400 font-medium truncate max-w-[130px]">
                            {layerName}
                          </span>
                          {subInfo && (
                            <span className="truncate max-w-[150px] text-slate-300 italic">
                              {String(subInfo)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </>
        )}

        {/* TAB 2: BẢN ĐỒ OPENSTREETMAP */}
        {activeTab === 'map' && (
          <div className="h-full flex flex-col">
            {/* Hiển thị lỗi OSM nếu có */}
            {osmError && (
              <div className="p-3 mb-2 bg-red-950/70 border border-red-800 text-red-200 text-xs rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{osmError}</div>
              </div>
            )}

            {isSearchingOsm ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2 flex-1">
                <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
                <p className="text-slate-300 font-medium">Đang truy vấn OpenStreetMap...</p>
                <p className="text-[11px] text-slate-500">Quét các địa danh trong khung nhìn hiện tại</p>
              </div>
            ) : !cachedOsmData ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2 flex-1">
                <Globe className="w-8 h-8 stroke-1 text-slate-500 opacity-50" />
                <p className="text-slate-300 font-medium">Nhập từ khóa và nhấn Tìm kiếm (hoặc Enter)</p>
                <p className="text-[11px] text-slate-500">
                  Tìm kiếm thôn xã, sông núi, hồ nước, tên đường... trong khung nhìn hiện tại (Zoom ≥ 11).
                </p>
              </div>
            ) : filteredOsmItems.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2 flex-1">
                <Search className="w-8 h-8 stroke-1 text-slate-600 opacity-60" />
                <p>Không tìm thấy địa danh nào phù hợp với từ khóa "{cachedOsmData.keyword}".</p>
                <button
                  type="button"
                  onClick={() => executeOsmSearch()}
                  className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition cursor-pointer"
                >
                  Tìm lại
                </button>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 custom-scrollbar pr-1">
                {filteredOsmItems.map((item) => {
                  const isHanhChinh = item.group === 'hanh_chinh';
                  const isSongNui = item.group === 'song_nui';
                  const isGiaoThong = item.group === 'giao_thong';

                  return (
                    <div
                      key={item.id}
                      onClick={() => onLocateOsmFeature?.(item)}
                      className="p-2.5 rounded-xl border border-slate-700/60 bg-slate-800/70 hover:bg-slate-800 hover:border-sky-500/70 active:scale-[0.99] transition flex flex-col gap-1.5 cursor-pointer select-none"
                    >
                      {/* Hàng 1: Icon nhóm + Tên đậm + Độ cao (nếu có) + Badge kind */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {isHanhChinh ? (
                            <Home className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : isSongNui ? (
                            item.kind === 'lake' || item.kind === 'river' || item.kind === 'stream' ? (
                              <Waves className="w-4 h-4 text-cyan-400 shrink-0" />
                            ) : (
                              <Mountain className="w-4 h-4 text-amber-400 shrink-0" />
                            )
                          ) : isGiaoThong ? (
                            <Route className="w-4 h-4 text-orange-400 shrink-0" />
                          ) : (
                            <Landmark className="w-4 h-4 text-purple-400 shrink-0" />
                          )}
                          <span className="font-bold text-xs text-slate-100 truncate" title={item.name}>
                            {item.name}
                          </span>
                          {item.ele && (
                            <span className="text-[10px] text-amber-300 font-mono shrink-0">
                              ({item.ele}m)
                            </span>
                          )}
                        </div>

                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700 shrink-0">
                          {item.kindLabel}
                        </span>
                      </div>

                      {/* Hàng 2: Tọa độ WGS84 + Cụm Nút tác vụ (chỉ Icon) */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/40">
                        {/* Tọa độ font monospace (Không có khoảng cách đến tâm) */}
                        <span className="font-mono text-[10px] text-slate-400">
                          {item.lat.toFixed(5)}, {item.lon.toFixed(5)}
                        </span>

                        {/* Cụm nút tác vụ (toàn bộ là Icon) */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* 1. Nút Copy: Sao chép tên, lat, lng */}
                          <button
                            type="button"
                            onClick={(e) => handleCopyOsm(item, e)}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition cursor-pointer"
                            title="Sao chép tên và tọa độ"
                          >
                            {copiedOsmId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* 3. Nút MapPin: Mở trên Google Maps */}
                          <button
                            type="button"
                            onClick={(e) => handleOpenGoogleMaps(item, e)}
                            className="p-1 text-red-400 hover:text-white hover:bg-red-600/30 rounded transition cursor-pointer"
                            title="Mở trong Google Maps"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>

                          {/* 4. Nút PlusCircle: Thêm vào CSDL (Chỉ Admin / Biên tập viên) */}
                          {(currentRole === 'admin' || currentRole === 'editor') && (
                            <button
                              type="button"
                              onClick={(e) => handleAddFromOsm(item, e)}
                              className="p-1 text-emerald-400 hover:text-white hover:bg-emerald-600/30 rounded transition cursor-pointer"
                              title="Thêm vào lớp dữ liệu GIS"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
