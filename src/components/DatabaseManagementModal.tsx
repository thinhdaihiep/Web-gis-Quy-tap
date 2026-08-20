import React, { useState, useRef, useEffect } from 'react';
import {
  Database,
  Upload,
  Download,
  FileSpreadsheet,
  X,
  ShieldAlert,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Plus,
  Trash2,
  Search,
  Eye,
  Save,
  Check
} from 'lucide-react';
import proj4 from 'proj4';
import { LayerConfig, GeoJsonFeatureItem, DuplicateStrategy } from '../types';
import {
  extractObjectId,
  getCustomAliasMap,
  getHiddenFieldsMap,
  saveCustomAliasMap,
  getAllAliasRules,
  FieldAliasRule
} from '../fieldAlias';

proj4.defs('EPSG:3405', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');

function convertCoordinatesToWGS84(coords: any): any {
  if (!Array.isArray(coords) || coords.length === 0) return coords;

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    let [x, y] = coords;
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      try {
        const [lng, lat] = proj4('EPSG:3405', 'EPSG:4326', [x, y]);
        return [lng, lat];
      } catch (err) {
        console.warn('Proj4 convert error:', err);
      }
    }
    return [x, y];
  }

  return coords.map((c) => convertCoordinatesToWGS84(c));
}

function parseDmsToLatLng(toaDoStr: string): { lat: number; lng: number } | null {
  if (!toaDoStr || typeof toaDoStr !== 'string') return null;
  const latMatch = toaDoStr.match(/(\d+)°(?:(\d+)'|′)?(?:(\d+)(?:\.\d+)?"|″)?\s*([NSns])/);
  const lngMatch = toaDoStr.match(/(\d+)°(?:(\d+)'|′)?(?:(\d+)(?:\.\d+)?"|″)?\s*([EWew])/);

  if (latMatch && lngMatch) {
    const latDeg = parseFloat(latMatch[1]) || 0;
    const latMin = parseFloat(latMatch[2]) || 0;
    const latSec = parseFloat(latMatch[3]) || 0;
    const latDir = latMatch[4].toUpperCase();
    let lat = latDeg + latMin / 60 + latSec / 3600;
    if (latDir === 'S') lat = -lat;

    const lngDeg = parseFloat(lngMatch[1]) || 0;
    const lngMin = parseFloat(lngMatch[2]) || 0;
    const lngSec = parseFloat(lngMatch[3]) || 0;
    const lngDir = lngMatch[4].toUpperCase();
    let lng = lngDeg + lngMin / 60 + lngSec / 3600;
    if (lngDir === 'W') lng = -lng;

    return { lat, lng };
  }
  return null;
}

export interface DatabaseManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'import' | 'export' | 'attributes';
  layers: LayerConfig[];
  existingFeatures: GeoJsonFeatureItem[];
  onImportConfirm: (
    targetLayerId: string,
    importedFeatures: GeoJsonFeatureItem[],
    strategy: DuplicateStrategy
  ) => void;
  onAliasesUpdated?: () => void;
}

export const DatabaseManagementModal: React.FC<DatabaseManagementModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'import',
  layers,
  existingFeatures,
  onImportConfirm,
  onAliasesUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'attributes'>(defaultTab);

  // Sync activeTab when defaultTab changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  // --- TAB 1: IMPORT STATE ---
  const [selectedLayerId, setSelectedLayerId] = useState<string>(
    layers[0]?.id || 'layer1_tim_kiem'
  );
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('overwrite');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedFeatures, setParsedFeatures] = useState<GeoJsonFeatureItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- TAB 2: EXPORT STATE ---
  const [selectedExportLayer, setSelectedExportLayer] = useState<string>('all');
  const [prettyPrint, setPrettyPrint] = useState<boolean>(true);
  const [exportFileName, setExportFileName] = useState<string>('CSDL_MoLietSi_QK5');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // --- TAB 3: ATTRIBUTES STATE ---
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [draftHiddenMap, setDraftHiddenMap] = useState<Record<string, boolean>>({});
  const [rules, setRules] = useState<FieldAliasRule[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newKey, setNewKey] = useState<string>('');
  const [newAlias, setNewAlias] = useState<string>('');
  const [aliasSavedSuccess, setAliasSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && activeTab === 'attributes') {
      const initialMap = getCustomAliasMap();
      const initialHiddenMap = getHiddenFieldsMap();
      setDraftMap(initialMap);
      setDraftHiddenMap(initialHiddenMap);
      setRules(getAllAliasRules(initialMap, initialHiddenMap));
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const targetLayer = layers.find((l) => l.id === selectedLayerId) || layers[0];

  // Helper check if duplicate in existingFeatures
  const checkIsDuplicate = (feature: GeoJsonFeatureItem): boolean => {
    const featObjId = extractObjectId(feature);

    return existingFeatures.some((existing) => {
      if (existing.layerId !== selectedLayerId) return false;

      const existObjId = extractObjectId(existing);
      if (featObjId && existObjId && featObjId.toLowerCase() === existObjId.toLowerCase()) {
        return true;
      }

      const matchId =
        existing.id &&
        feature.id &&
        String(existing.id).toLowerCase() === String(feature.id).toLowerCase();
      const matchCode =
        existing.code &&
        feature.code &&
        String(existing.code).toLowerCase() === String(feature.code).toLowerCase();
      return Boolean(matchId || matchCode);
    });
  };

  // Process uploaded JSON/GeoJSON
  const processGeoJsonContent = (jsonString: string, name: string) => {
    try {
      setParseError(null);
      const geojson = JSON.parse(jsonString);

      let rawFeatures: any[] = [];
      if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        rawFeatures = geojson.features;
      } else if (geojson.type === 'Feature') {
        rawFeatures = [geojson];
      } else if (Array.isArray(geojson)) {
        rawFeatures = geojson;
      } else {
        throw new Error('Định dạng tập tin không khớp với chuẩn GeoJSON (cần chứa FeatureCollection hoặc Feature).');
      }

      if (rawFeatures.length === 0) {
        throw new Error('Tập tin GeoJSON không chứa đối tượng hình học (Feature) nào.');
      }

      const formatted: GeoJsonFeatureItem[] = rawFeatures.map((f: any, idx: number) => {
        const rawProps = f.properties || {};
        const geom = f.geometry || {};
        const rawId =
          f.id ?? rawProps.OBJECTID ?? rawProps.objectID ?? rawProps.id ?? `IMP-${Date.now()}-${idx + 1}`;

        const props: Record<string, any> = { ...rawProps };

        // Remove temporary state props
        delete props['TrangThaiMoi'];
        delete props['trang_thai_moi'];
        delete props['trangthaimoi'];

        const featureName =
          props.Ten ||
          props.ten ||
          (props.Xa || props.Tinh ? `Khu vực Quy tập ${props.Xa ? props.Xa + ', ' : ''}${props.Tinh || ''}` : null) ||
          rawProps.name ||
          rawProps.ten_khu_vuc ||
          `Khu vực Quy tập #${props.OBJECTID || idx + 1}`;

        let coords = geom.coordinates || [];
        let geomType = geom.type || 'Polygon';

        if (coords && coords.length > 0) {
          coords = convertCoordinatesToWGS84(coords);
        }

        let firstCoord: any = Array.isArray(coords) && coords.length > 0 ? coords[0] : null;
        while (Array.isArray(firstCoord) && firstCoord.length > 0) {
          firstCoord = firstCoord[0];
        }

        const isValidWgs84 = typeof firstCoord === 'number' && Math.abs(firstCoord) <= 180;

        if (!coords || coords.length === 0 || !isValidWgs84) {
          if (props.ToaDo) {
            const parsedDms = parseDmsToLatLng(props.ToaDo);
            if (parsedDms) {
              const { lat, lng } = parsedDms;
              const delta = 0.008;
              geomType = 'Polygon';
              coords = [
                [
                  [lng - delta, lat + delta],
                  [lng + delta, lat + delta],
                  [lng + delta, lat - delta],
                  [lng - delta, lat - delta],
                  [lng - delta, lat + delta],
                ],
              ];
            }
          } else {
            const baseLat = 13.9 + (idx % 5) * 0.2;
            const baseLng = 108.0 + (idx % 4) * 0.2;
            const delta = 0.01;
            geomType = 'Polygon';
            coords = [
              [
                [baseLng - delta, baseLat + delta],
                [baseLng + delta, baseLat + delta],
                [baseLng + delta, baseLat - delta],
                [baseLng - delta, baseLat - delta],
                [baseLng - delta, baseLat + delta],
              ],
            ];
          }
        }

        return {
          id: String(rawId),
          layerId: selectedLayerId,
          name: String(featureName),
          code: String(props.OBJECTID || props.code || rawId),
          type: geomType,
          coordinates: coords,
          properties: props,
          status: props.PhanLoai === 1 ? 'xac_dinh' : 'chua_xac_dinh',
          updatedAt: new Date().toISOString().split('T')[0],
        };
      });

      setFileName(name);
      setParsedFeatures(formatted);
    } catch (err: any) {
      setParseError(err.message || 'Lỗi đọc tập tin GeoJSON.');
      setParsedFeatures(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      processGeoJsonContent(content, file.name);
    };
    reader.readAsText(file);
  };

  const duplicateCount =
    parsedFeatures?.filter((f) => checkIsDuplicate(f)).length || 0;
  const newCount = (parsedFeatures?.length || 0) - duplicateCount;

  const handleConfirmImport = () => {
    if (!parsedFeatures || parsedFeatures.length === 0) return;

    const updatedWithLayer = parsedFeatures.map((f) => ({
      ...f,
      layerId: selectedLayerId,
    }));

    onImportConfirm(selectedLayerId, updatedWithLayer, duplicateStrategy);
    onClose();
  };

  // --- TAB 2: EXPORT HANDLER ---
  const handleExportGeoJson = () => {
    const exportFeatures =
      selectedExportLayer === 'all'
        ? existingFeatures
        : existingFeatures.filter((f) => f.layerId === selectedExportLayer);

    if (exportFeatures.length === 0) {
      setExportNotice('Không có đối tượng nào để xuất.');
      return;
    }

    const exportLayerObj = layers.find((l) => l.id === selectedExportLayer);
    const layerName = exportLayerObj ? exportLayerObj.name : 'TatCaCacLop';

    const featureCollection = {
      type: 'FeatureCollection',
      name: `CSDL_GIS_${layerName}`,
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
      },
      features: exportFeatures.map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: {
          type: f.type,
          coordinates: f.coordinates,
        },
        properties: {
          ...f.properties,
          OBJECTID: f.code || f.properties?.OBJECTID || f.id,
          Ten: f.name || f.properties?.Ten,
          PhanLoai: f.status === 'xac_dinh' ? 1 : 2,
          layerId: f.layerId,
          updatedAt: f.updatedAt,
        },
      })),
    };

    const jsonString = prettyPrint
      ? JSON.stringify(featureCollection, null, 2)
      : JSON.stringify(featureCollection);

    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    const finalName = exportFileName.toLowerCase().endsWith('.geojson')
      ? exportFileName
      : `${exportFileName}.geojson`;

    downloadLink.href = url;
    downloadLink.download = finalName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);

    setExportNotice(`Đã xuất thành công ${exportFeatures.length} đối tượng ra tệp ${finalName}`);
    setTimeout(() => setExportNotice(null), 4000);
  };

  // --- TAB 3: ATTRIBUTES HANDLERS ---
  const updateDraft = (newMap: Record<string, string>, newHiddenMap: Record<string, boolean>) => {
    setDraftMap(newMap);
    setDraftHiddenMap(newHiddenMap);
    setRules(getAllAliasRules(newMap, newHiddenMap));
  };

  const handleToggleVisibility = (key: string, currentlyVisible: boolean) => {
    const nextHiddenMap = { ...draftHiddenMap, [key]: currentlyVisible };
    updateDraft(draftMap, nextHiddenMap);
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newAlias.trim()) return;

    const trimmedKey = newKey.trim();
    const trimmedAlias = newAlias.trim();

    const nextMap = { ...draftMap, [trimmedKey]: trimmedAlias };
    const nextHiddenMap = { ...draftHiddenMap, [trimmedKey]: false };
    updateDraft(nextMap, nextHiddenMap);

    setNewKey('');
    setNewAlias('');
  };

  const handleDeleteRule = (keyToDelete: string) => {
    const nextMap = { ...draftMap, [keyToDelete]: '__DELETED__' };
    const nextHiddenMap = { ...draftHiddenMap };
    delete nextHiddenMap[keyToDelete];
    updateDraft(nextMap, nextHiddenMap);
  };

  const handleSaveAttributes = () => {
    saveCustomAliasMap(draftMap, draftHiddenMap);
    if (onAliasesUpdated) onAliasesUpdated();
    setAliasSavedSuccess(true);
    setTimeout(() => setAliasSavedSuccess(false), 2500);
  };

  const filteredRules = rules.filter(
    (r) =>
      r.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.alias.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/30 rounded-lg border border-blue-500/50 text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-100">
                Quản lý Cơ sở Dữ liệu (CSDL)
              </h3>
              <p className="text-[11px] text-slate-400">
                Nhập/Xuất dữ liệu không gian &amp; Cấu hình bảng thuộc tính hệ thống
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
            title="Đóng bảng quản lý CSDL"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 pt-2 flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'import'
                ? 'bg-white text-blue-700 border-slate-300 border-b-transparent -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập dữ liệu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'export'
                ? 'bg-white text-blue-700 border-slate-300 border-b-transparent -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất dữ liệu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attributes')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'attributes'
                ? 'bg-white text-blue-700 border-slate-300 border-b-transparent -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Bảng thuộc tính</span>
          </button>
        </div>

        {/* TAB 1: NHẬP DỮ LIỆU */}
        {activeTab === 'import' && (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 flex-1">
            {/* Lớp dữ liệu đích */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Lớp dữ liệu đích</span>
              </label>
              <select
                value={selectedLayerId}
                onChange={(e) => setSelectedLayerId(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
              >
                {layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tải lên Tập tin GeoJSON */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Tập tin GeoJSON (.geojson, .json)
              </label>

              <input
                type="file"
                ref={fileInputRef}
                accept=".geojson,.json"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-lg p-4 flex flex-col items-center justify-center text-center bg-slate-50/80 hover:bg-blue-50/50 transition cursor-pointer group shadow-inner"
              >
                <FileText className="w-8 h-8 text-slate-400 group-hover:text-blue-600 mb-1 transition" />
                <p className="font-bold text-slate-700 text-xs">
                  {fileName ? fileName : 'Chọn hoặc kéo thả tập tin'}
                </p>
              </div>
            </div>

            {/* Error Message */}
            {parseError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Analysis & Duplicate Handling */}
            {parsedFeatures && (
              <div className="space-y-4 border-t border-slate-200 pt-3 animate-in fade-in">
                {/* Metrics Summary */}
                <div className="bg-blue-900/5 border border-blue-200 p-3 rounded-lg grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Tổng đối tượng</p>
                    <p className="text-base font-extrabold text-slate-800">{parsedFeatures.length}</p>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-emerald-600">Đối tượng mới</p>
                    <p className="text-base font-extrabold text-emerald-600">{newCount}</p>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-amber-600">Trùng</p>
                    <p className="text-base font-extrabold text-amber-600">{duplicateCount}</p>
                  </div>
                </div>

                {/* Duplicate Strategy Radio Selector */}
                <div className="bg-amber-50/80 border border-amber-200 p-3 rounded-lg space-y-2">
                  <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Xử lý trùng lặp</span>
                  </label>

                  <div className="space-y-1.5 pt-0.5">
                    <label className="flex items-center gap-2 bg-white p-2 rounded border border-amber-200 cursor-pointer hover:border-amber-400 transition">
                      <input
                        type="radio"
                        name="strategy"
                        value="overwrite"
                        checked={duplicateStrategy === 'overwrite'}
                        onChange={() => setDuplicateStrategy('overwrite')}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="font-bold text-slate-800 text-xs">
                        Ghi đè &amp; Cập nhật
                      </span>
                    </label>

                    <label className="flex items-center gap-2 bg-white p-2 rounded border border-amber-200 cursor-pointer hover:border-amber-400 transition">
                      <input
                        type="radio"
                        name="strategy"
                        value="skip"
                        checked={duplicateStrategy === 'skip'}
                        onChange={() => setDuplicateStrategy('skip')}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="font-bold text-slate-800 text-xs">
                        Bỏ qua các đối tượng trùng
                      </span>
                    </label>

                    <label className="flex items-center gap-2 bg-white p-2 rounded border border-amber-200 cursor-pointer hover:border-amber-400 transition">
                      <input
                        type="radio"
                        name="strategy"
                        value="append"
                        checked={duplicateStrategy === 'append'}
                        onChange={() => setDuplicateStrategy('append')}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="font-bold text-slate-800 text-xs">
                        Nhập tất cả (Tạo mã mới)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Preview Feature List */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Xem trước ({parsedFeatures.length}):
                  </p>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                    {parsedFeatures.map((feat, i) => {
                      const isDup = checkIsDuplicate(feat);
                      return (
                        <div
                          key={i}
                          className="p-2 flex items-center justify-between text-[11px] hover:bg-slate-50"
                        >
                          <div className="flex items-center space-x-2 truncate pr-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                                isDup
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              }`}
                            >
                              {isDup ? 'Trùng' : 'Mới'}
                            </span>
                            <span className="font-semibold text-slate-800 truncate">
                              {feat.name}
                            </span>
                            <span className="font-mono text-slate-400 text-[10px]">
                              ({feat.code || feat.id})
                            </span>
                          </div>
                          <span className="text-slate-500 text-[10px] font-mono shrink-0">
                            {feat.type}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: XUẤT DỮ LIỆU */}
        {activeTab === 'export' && (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 flex-1">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Download className="w-4 h-4 text-blue-600" />
                <span>Chọn Lớp dữ liệu cần Xuất</span>
              </label>
              <select
                value={selectedExportLayer}
                onChange={(e) => setSelectedExportLayer(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
              >
                <option value="all">
                  Tất cả các lớp dữ liệu ({existingFeatures.length} đối tượng)
                </option>
                {layers.map((l) => {
                  const layerCount = existingFeatures.filter((f) => f.layerId === l.id).length;
                  return (
                    <option key={l.id} value={l.id}>
                      {l.name} ({layerCount} đối tượng)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-3 bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-bold text-slate-800 uppercase text-xs tracking-wider">
                Tùy chọn Xuất tập tin GeoJSON
              </h4>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Tên tập tin khi tải về:
                  </label>
                  <input
                    type="text"
                    value={exportFileName}
                    onChange={(e) => setExportFileName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="prettyPrintJson"
                    checked={prettyPrint}
                    onChange={(e) => setPrettyPrint(e.target.checked)}
                    className="text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="prettyPrintJson" className="text-xs font-medium text-slate-700 cursor-pointer">
                    Định dạng JSON đẹp mắt (Pretty-print format)
                  </label>
                </div>
              </div>
            </div>

            {/* Notice / Toast */}
            {exportNotice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs flex items-center space-x-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{exportNotice}</span>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-[11px] text-blue-900 space-y-1">
              <p className="font-bold">Thông tin định dạng:</p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                <li>Chuẩn dữ liệu: GeoJSON FeatureCollection (WGS84)</li>
                <li>Tọa độ chuẩn quốc tế [Kinh độ, Vĩ độ]</li>
                <li>Lưu giữ đầy đủ thuộc tính địa giới, tên, phân loại và kết quả quy tập.</li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 3: BẢNG THUỘC TÍNH (FIELD ALIAS & VISIBILITY) */}
        {activeTab === 'attributes' && (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 flex-1">
            {/* Add New Rule Form */}
            <form onSubmit={handleAddRule} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>Thêm tên hiển thị mới</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <input
                  type="text"
                  placeholder="Tên trường gốc (vd: TimDuoc)"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="sm:col-span-2 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
                <input
                  type="text"
                  placeholder="Tên hiển thị (vd: Đã quy tập)"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  className="sm:col-span-2 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-800"
                />
                <button
                  type="submit"
                  disabled={!newKey.trim() || !newAlias.trim()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm</span>
                </button>
              </div>
            </form>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên trường gốc hoặc tên hiển thị..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Success notification */}
            {aliasSavedSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg text-xs flex items-center space-x-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">Đã lưu thành công tên thuộc tính &amp; cấu hình hiển thị!</span>
              </div>
            )}

            {/* Mapping Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-2.5 w-5/12">Tên trường dữ liệu gốc</th>
                    <th className="p-2.5 w-5/12">Tên hiển thị tiếng Việt</th>
                    <th className="p-2.5 w-12 text-center" title="Hiển thị ở Popup & Bảng thuộc tính">
                      <Eye className="w-3.5 h-3.5 text-slate-600 mx-auto" />
                    </th>
                    <th className="p-2.5 w-10 text-center">
                      <Trash2 className="w-3.5 h-3.5 text-slate-600 mx-auto" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                  {filteredRules.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400 italic">
                        Không tìm thấy tên trường phù hợp
                      </td>
                    </tr>
                  ) : (
                    filteredRules.map((rule, idx) => (
                      <tr key={`rule_row_${idx}_${rule.key}`} className="hover:bg-blue-50/50 transition">
                        <td className="p-2.5 font-mono text-blue-700 font-bold text-xs select-text">
                          {rule.key}
                        </td>
                        <td className="p-2.5 text-slate-900 font-bold text-xs select-text">
                          {rule.alias}
                        </td>
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={rule.visible}
                            onChange={() => handleToggleVisibility(rule.key, rule.visible)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer accent-blue-600"
                            title={rule.visible ? 'Đang hiển thị ở Popup & Bảng thuộc tính' : 'Đang ẩn ở Popup & Bảng thuộc tính'}
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.key)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition cursor-pointer"
                            title="Xóa tên hiển thị này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Phân quyền: Quản trị viên CSDL hệ thống</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
            >
              Đóng
            </button>

            {activeTab === 'import' && (
              <button
                onClick={handleConfirmImport}
                disabled={!parsedFeatures || parsedFeatures.length === 0}
                className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition shadow-sm ${
                  parsedFeatures && parsedFeatures.length > 0
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-70'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Xác nhận</span>
              </button>
            )}

            {activeTab === 'export' && (
              <button
                onClick={handleExportGeoJson}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition shadow-sm bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Tải về</span>
              </button>
            )}

            {activeTab === 'attributes' && (
              <button
                onClick={handleSaveAttributes}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Lưu</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
