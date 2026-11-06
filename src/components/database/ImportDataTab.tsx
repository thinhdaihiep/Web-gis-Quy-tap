import React, { useState, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  Loader2,
} from 'lucide-react';
import { LayerConfig, GeoJsonFeatureItem, DuplicateStrategy } from '../../types';
import { extractObjectId, getFeatureDisplayCode } from '../../fieldAlias';
import { saveCommuneChunksToFirestore } from '../../firebaseService';
import { invalidateCommuneCache } from '../../utils/communeLookup';
import { sanitizePropertiesForLayer } from '../../FieldSchema';

export interface ImportDataTabProps {
  layers: LayerConfig[];
  existingFeatures: GeoJsonFeatureItem[];
  onImportConfirm: (
    targetLayerId: string,
    importedFeatures: GeoJsonFeatureItem[],
    strategy: DuplicateStrategy
  ) => void;
  onClose: () => void;
  onFeaturesParsedChange?: (hasFeatures: boolean) => void;
}

export const ImportDataTab: React.FC<ImportDataTabProps> = ({
  layers,
  existingFeatures,
  onImportConfirm,
  onClose,
  onFeaturesParsedChange,
}) => {
  const [selectedLayerId, setSelectedLayerId] = useState<string>(
    layers[0]?.id || 'layer1_tim_kiem'
  );
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('overwrite');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedFeatures, setParsedFeatures] = useState<GeoJsonFeatureItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Commune import states
  const communeFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportingCommunes, setIsImportingCommunes] = useState<boolean>(false);
  const [communeImportProgress, setCommuneImportProgress] = useState<{ msg: string; percent: number } | null>(null);
  const [communeImportStatus, setCommuneImportStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const checkIsDuplicate = (feature: GeoJsonFeatureItem): boolean => {
    return existingFeatures.some((existing) => {
      if (existing.layerId !== selectedLayerId) return false;

      const featObjId = extractObjectId(feature);
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
        throw new Error('Định dạng tập tin không khớp với chuẩn GeoJSON.');
      }

      if (rawFeatures.length === 0) {
        throw new Error('Tập tin GeoJSON không chứa đối tượng hình học (Feature) nào.');
      }

      const targetLayer = layers.find((l) => l.id === selectedLayerId);
      const isPolygonLayer =
        targetLayer?.type === 'polygon' ||
        selectedLayerId === 'layer1_tim_kiem' ||
        selectedLayerId === 'layer4_khu_vuc_quy_tap' ||
        selectedLayerId.includes('tim_kiem') ||
        selectedLayerId.includes('quy_tap');

      const isPointLayer =
        targetLayer?.type === 'point' ||
        selectedLayerId === 'layer2_tran_danh' ||
        selectedLayerId === 'layer3_mo_chi' ||
        selectedLayerId === 'layer4_nghia_trang' ||
        selectedLayerId.includes('tran_danh') ||
        selectedLayerId.includes('mo_chi') ||
        selectedLayerId.includes('mo_liet_si') ||
        selectedLayerId.includes('nghia_trang');

      const formatted: GeoJsonFeatureItem[] = rawFeatures.map((f: any, idx: number) => {
        const rawProps = f.properties || {};
        const geom = f.geometry;

        if (!geom || !geom.coordinates || !Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
          throw new Error(`Đối tượng thứ ${idx + 1} không có tọa độ hình học (geometry.coordinates).`);
        }

        const rawGeomType = geom.type || 'Point';
        if (isPolygonLayer && rawGeomType !== 'Polygon' && rawGeomType !== 'MultiPolygon') {
          throw new Error(
            `Lớp "${targetLayer?.name || 'Vùng'}" yêu cầu hình học dạng Vùng (Polygon/MultiPolygon), nhưng đối tượng thứ ${idx + 1} có kiểu "${rawGeomType}".`
          );
        }
        if (isPointLayer && rawGeomType !== 'Point' && rawGeomType !== 'MultiPoint') {
          throw new Error(
            `Lớp "${targetLayer?.name || 'Điểm'}" yêu cầu hình học dạng Điểm (Point), nhưng đối tượng thứ ${idx + 1} có kiểu "${rawGeomType}".`
          );
        }

        // Lọc nghiêm ngặt theo Schema của lớp, chỉ giữ các trường trong schema, OBJECTID viết hoa
        const props: Record<string, any> = sanitizePropertiesForLayer(rawProps, selectedLayerId);

        // Gán tên đối tượng theo đúng từng lớp
        let featureName = props.Ten ? String(props.Ten).trim() : '';
        if (!featureName) {
          if (selectedLayerId.includes('tim_kiem') || selectedLayerId.includes('quy_tap')) {
            featureName = props.Xa || props.Tinh ? `Khu vực quy tập ${props.Xa ? props.Xa + ', ' : ''}${props.Tinh || ''}` : `Khu vực quy tập #${props.OBJECTID || idx + 1}`;
          } else if (selectedLayerId.includes('tran_danh')) {
            featureName = `Trận đánh #${props.OBJECTID || idx + 1}`;
          } else if (selectedLayerId.includes('mo_chi') || selectedLayerId.includes('mo_liet_si')) {
            featureName = `Mộ liệt sĩ #${props.OBJECTID || idx + 1}`;
          } else if (selectedLayerId.includes('nghia_trang')) {
            featureName = props.Xa || props.Tinh ? `Nghĩa trang ${props.Xa ? props.Xa + ', ' : ''}${props.Tinh || ''}` : `Nghĩa trang #${props.OBJECTID || idx + 1}`;
          } else {
            featureName = `Đối tượng #${props.OBJECTID || idx + 1}`;
          }
        }

        const rawId = f.id ?? props.OBJECTID ?? `IMP-${Date.now()}-${idx + 1}`;

        return {
          id: String(rawId),
          layerId: selectedLayerId,
          name: featureName,
          code: String(props.OBJECTID || rawId),
          type: rawGeomType as any,
          coordinates: geom.coordinates,
          properties: props,
          updatedAt: new Date().toISOString().split('T')[0],
        };
      });

      setFileName(name);
      setParsedFeatures(formatted);
      if (onFeaturesParsedChange) onFeaturesParsedChange(true);
    } catch (err: any) {
      setParseError(err.message || 'Lỗi đọc tập tin GeoJSON.');
      setParsedFeatures(null);
      if (onFeaturesParsedChange) onFeaturesParsedChange(false);
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

  const handleCommuneFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingCommunes(true);
    setCommuneImportStatus(null);
    setCommuneImportProgress({ msg: 'Đang đọc tệp tin...', percent: 5 });

    try {
      const text = await file.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Tệp không đúng định dạng JSON/GeoJSON hợp lệ.');
      }

      let features: any[] = [];
      if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
        features = json.features;
      } else if (Array.isArray(json)) {
        features = json;
      } else if (json.type === 'Feature') {
        features = [json];
      } else {
        throw new Error('Tệp không chứa danh sách FeatureCollection hợp lệ.');
      }

      if (features.length === 0) {
        throw new Error('Tệp không chứa đối tượng hình học xã nào.');
      }

      setCommuneImportProgress({ msg: `Đang xử lý ${features.length} đối tượng xã...`, percent: 15 });

      const res = await saveCommuneChunksToFirestore(features, (msg, percent) => {
        setCommuneImportProgress({ msg, percent });
      });

      if (res.success) {
        await invalidateCommuneCache();
        setCommuneImportStatus({
          type: 'success',
          text: `Đã nhập thành công ${res.count} xã vào CSDL Firebase.`,
        });
      } else {
        setCommuneImportStatus({
          type: 'error',
          text: res.error || 'Lỗi khi lưu dữ liệu xã lên Firebase.',
        });
      }
    } catch (err: any) {
      setCommuneImportStatus({
        type: 'error',
        text: err?.message || 'Có lỗi xảy ra khi xử lý tệp tin xã.',
      });
    } finally {
      setIsImportingCommunes(false);
      setCommuneImportProgress(null);
      if (communeFileInputRef.current) {
        communeFileInputRef.current.value = '';
      }
    }
  };

  const duplicateCount =
    parsedFeatures?.filter((f) => checkIsDuplicate(f)).length || 0;
  const newCount = (parsedFeatures?.length || 0) - duplicateCount;

  const handleConfirm = () => {
    if (!parsedFeatures || parsedFeatures.length === 0) return;
    const updatedWithLayer = parsedFeatures.map((f) => ({
      ...f,
      layerId: selectedLayerId,
    }));
    onImportConfirm(selectedLayerId, updatedWithLayer, duplicateStrategy);
    onClose();
  };

  return (
    <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 flex-1">
      {/* Target Layer Selector */}
      <div className="bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-200 space-y-2">
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Upload className="w-4 h-4 text-blue-600" />
          <span>Lớp dữ liệu tiếp nhận</span>
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

      {/* Upload Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/50 hover:bg-blue-50/30 rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".json,.geojson"
          className="hidden"
        />
        <div className="p-2.5 bg-blue-100 rounded-full text-blue-600">
          <Upload className="w-5 h-5" />
        </div>
        <div>
          <p className="font-bold text-slate-800 text-xs sm:text-sm">
            {fileName ? fileName : 'Bấm để chọn tập tin GeoJSON (.geojson, .json)'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tự động chuyển đổi toạ độ VN-2000 / UTM sang WGS-84
          </p>
        </div>
      </div>

      {/* Commune Shapefile Upload Section */}
      <div className="bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-200 space-y-2">
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <UploadCloud className="w-4 h-4 text-blue-600" />
            <span>Địa giới hành chính Cấp Xã</span>
          </div>
          <span className="text-[10px] font-normal text-slate-500 lowercase">
            (Xã mới / Xã cũ)
          </span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={communeFileInputRef}
            onChange={handleCommuneFileUpload}
            accept=".json,.geojson"
            className="hidden"
          />
          <button
            type="button"
            disabled={isImportingCommunes}
            onClick={() => communeFileInputRef.current?.click()}
            className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isImportingCommunes ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-blue-600" />
            )}
            <span>Chọn GeoJSON Xã</span>
          </button>
        </div>

        {isImportingCommunes && communeImportProgress && (
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[11px] text-slate-600 font-semibold">
              <span>{communeImportProgress.msg}</span>
              <span>{communeImportProgress.percent}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 transition-all duration-200"
                style={{ width: `${communeImportProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {communeImportStatus && (
          <p
            className={`text-xs font-bold pt-1 ${
              communeImportStatus.type === 'success' ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {communeImportStatus.text}
          </p>
        )}
      </div>

      {parseError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{parseError}</span>
        </div>
      )}

      {parsedFeatures && (
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white p-2 rounded border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-slate-400">Tổng</p>
              <p className="text-base font-extrabold text-slate-800">{parsedFeatures.length}</p>
            </div>
            <div className="bg-white p-2 rounded border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-emerald-600">Mới</p>
              <p className="text-base font-extrabold text-emerald-600">{newCount}</p>
            </div>
            <div className="bg-white p-2 rounded border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-amber-600">Trùng</p>
              <p className="text-base font-extrabold text-amber-600">{duplicateCount}</p>
            </div>
          </div>

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
                <span className="font-bold text-slate-800 text-xs">Ghi đè &amp; Cập nhật</span>
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
                <span className="font-bold text-slate-800 text-xs">Bỏ qua đối tượng trùng</span>
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
                <span className="font-bold text-slate-800 text-xs">Nhập tất cả (Tạo mã mới)</span>
              </label>
            </div>
          </div>

          {/* Action button in Tab */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Xác nhận nhập</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
