import React, { useState, useRef } from 'react';
import { Upload, X, ShieldAlert, FileText, Sparkles, CheckCircle2, AlertTriangle, Layers, ArrowRight, RefreshCw, Eye } from 'lucide-react';
import proj4 from 'proj4';
import { LayerConfig, GeoJsonFeatureItem, DuplicateStrategy } from '../types';
import { extractObjectId } from '../fieldAlias';

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

interface GeoJsonImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerConfig[];
  existingFeatures: GeoJsonFeatureItem[];
  onImportConfirm: (
    targetLayerId: string,
    importedFeatures: GeoJsonFeatureItem[],
    strategy: DuplicateStrategy
  ) => void;
}

// Helper function to parse DMS string "13°58'23\"N - 109°3'6\"E" to WGS84 {lat, lng}
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

export const GeoJsonImportModal: React.FC<GeoJsonImportModalProps> = ({
  isOpen,
  onClose,
  layers,
  existingFeatures,
  onImportConfirm,
}) => {
  const [selectedLayerId, setSelectedLayerId] = useState<string>(
    layers[0]?.id || 'layer1_tim_kiem'
  );
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('overwrite');
  const [filterStrictFields, setFilterStrictFields] = useState<boolean>(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedFeatures, setParsedFeatures] = useState<GeoJsonFeatureItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const targetLayer = layers.find((l) => l.id === selectedLayerId) || layers[0];

  // Utility to check if a feature is duplicate in current existingFeatures
  const checkIsDuplicate = (feature: GeoJsonFeatureItem): boolean => {
    const featObjId = extractObjectId(feature);

    return existingFeatures.some((existing) => {
      if (existing.layerId !== selectedLayerId) return false;

      // Primary check: OBJECTID match
      const existObjId = extractObjectId(existing);
      if (featObjId && existObjId && featObjId.toLowerCase() === existObjId.toLowerCase()) {
        return true;
      }

      // Fallback check: ID or Code match
      const matchId = existing.id && feature.id && String(existing.id).toLowerCase() === String(feature.id).toLowerCase();
      const matchCode = existing.code && feature.code && String(existing.code).toLowerCase() === String(feature.code).toLowerCase();
      return Boolean(matchId || matchCode);
    });
  };

  // Process uploaded JSON/GeoJSON content
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
        const rawId = f.id ?? rawProps.OBJECTID ?? rawProps.objectID ?? rawProps.id ?? `IMP-${Date.now()}-${idx + 1}`;

        // STAGE 1: Filter ONLY user-specified core properties if strict filtering is active
        let props: Record<string, any> = {};
        if (filterStrictFields) {
          props = {
            OBJECTID: rawProps.OBJECTID ?? rawProps.objectID ?? rawProps.objectid ?? rawId,
            Ten: rawProps.Ten ?? rawProps.ten ?? null,
            PhanLoai: rawProps.PhanLoai ?? rawProps.phanLoai ?? null,
            HienTrang: rawProps.HienTrang ?? rawProps.hienTrang ?? null,
            Xa: rawProps.Xa ?? rawProps.xa ?? null,
            Tinh: rawProps.Tinh ?? rawProps.tinh ?? null,
            CapNhat: rawProps.CapNhat ?? rawProps.capNhat ?? null,
            Nguon: rawProps.Nguon ?? rawProps.nguon ?? null,
            TimDuoc: rawProps.TimDuoc ?? rawProps.timDuoc ?? null,
            ChuaThay: rawProps.ChuaThay ?? rawProps.chuaThay ?? null,
            ToaDo: rawProps.ToaDo ?? rawProps.toaDo ?? null,
            DiaDanh3C: rawProps.DiaDanh3C ?? rawProps.diaDanh3C ?? rawProps.diadanh3c ?? rawProps.DiaDanh_3C ?? rawProps.DIADANH3C ?? rawProps.dia_danh_3c ?? null,
          };
          
          // Optional fields for historical battles, graves, and cemeteries if present
          if (rawProps.ThoiGian) props.ThoiGian = rawProps.ThoiGian;
          if (rawProps.DiaDiem) props.DiaDiem = rawProps.DiaDiem;
          if (rawProps.DonVi) props.DonVi = rawProps.DonVi;
          if (rawProps.BenDich) props.BenDich = rawProps.BenDich;
          if (rawProps.BenTa) props.BenTa = rawProps.BenTa;
          if (rawProps.CongTrinh) props.CongTrinh = rawProps.CongTrinh;
          if (rawProps.QuyTap) props.QuyTap = rawProps.QuyTap;
          if (rawProps.GhiChu) props.GhiChu = rawProps.GhiChu;
          if (rawProps.ThongTin) props.ThongTin = rawProps.ThongTin;
          if (rawProps.NgaySinh ?? rawProps.ngaySinh ?? rawProps.ngay_sinh) props.NgaySinh = rawProps.NgaySinh ?? rawProps.ngaySinh ?? rawProps.ngay_sinh;
          if (rawProps.NgayMat ?? rawProps.ngayMat ?? rawProps.ngay_mat) props.NgayMat = rawProps.NgayMat ?? rawProps.ngayMat ?? rawProps.ngay_mat;
          if (rawProps.CapBac ?? rawProps.capBac ?? rawProps.cap_bac) props.CapBac = rawProps.CapBac ?? rawProps.capBac ?? rawProps.cap_bac;
          if (rawProps.ChucVu ?? rawProps.chucVu ?? rawProps.chuc_vu) props.ChucVu = rawProps.ChucVu ?? rawProps.chucVu ?? rawProps.chuc_vu;
          if (rawProps.NTID) props.NTID = rawProps.NTID;
          if (rawProps.DiaChi) props.DiaChi = rawProps.DiaChi;
          if (rawProps.DienThoai) props.DienThoai = rawProps.DienThoai;
          if (rawProps.SoMo) props.SoMo = rawProps.SoMo;
          if (rawProps.ThanhLap) props.ThanhLap = rawProps.ThanhLap;
          if (rawProps.MoCoTen) props.MoCoTen = rawProps.MoCoTen;
          if (rawProps.MoVoDanh) props.MoVoDanh = rawProps.MoVoDanh;
        } else {
          props = { ...rawProps };
        }

        delete props['TrangThaiMoi'];
        delete props['trang_thai_moi'];
        delete props['trangthaimoi'];
        delete props['ChiHuy'];
        delete props['chihuy'];
        delete props['chi_huy'];
        delete props['KetQua'];
        delete props['ketqua'];
        delete props['ket_qua'];

        const featureName =
          props.Ten ||
          (props.Xa || props.Tinh ? `Khu vực Quy tập ${props.Xa ? props.Xa + ', ' : ''}${props.Tinh || ''}` : null) ||
          rawProps.name ||
          rawProps.ten_khu_vuc ||
          `Khu vực Quy tập #${props.OBJECTID || idx + 1}`;

        // STAGE 2: Coordinate check & Transformation (Handle EPSG:3405 projected meters vs WGS84)
        let coords = geom.coordinates || [];
        let geomType = geom.type || 'Polygon';

        // Convert coordinates from EPSG:3405 / UTM Zone 48 meters to WGS84 [lng, lat] if needed
        if (coords && coords.length > 0) {
          coords = convertCoordinatesToWGS84(coords);
        }

        // Check if converted coordinates are now valid WGS84
        let firstCoord: any = Array.isArray(coords) && coords.length > 0 ? coords[0] : null;
        while (Array.isArray(firstCoord) && firstCoord.length > 0) {
          firstCoord = firstCoord[0];
        }

        const isValidWgs84 =
          typeof firstCoord === 'number' &&
          Math.abs(firstCoord) <= 180;

        // Fallback if no valid geometry was provided
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
          code: String(props.OBJECTID || rawId),
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

  // Sample GeoJSON Presets for testing Phase 2
  const loadSampleDataset = (type: 'battle' | 'search' | 'graves') => {
    let sampleData: any;
    let name = '';

    if (type === 'battle') {
      name = 'Sample_TranDanh_LichSu_QK5.geojson';
      sampleData = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'TD-001', // Duplicate ID to test overwrite
            properties: {
              Ten: 'Trận đánh Cao điểm 1489 (Bản đồ quân sự mới)',
              code: 'TD-001',
              ThoiGian: 'Tháng 5/1972',
              DonVi: 'Trung đoàn 1 & Sư đoàn 304',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.820, 15.220],
                  [107.855, 15.220],
                  [107.855, 15.185],
                  [107.820, 15.185],
                  [107.820, 15.220],
                ],
              ],
            },
          },
          {
            type: 'Feature',
            id: 'TD-002',
            properties: {
              Ten: 'Trận phục kích Thung lũng An Lao',
              code: 'TD-002',
              ThoiGian: '1965',
              DonVi: 'Sư đoàn 3 Sao Vàng',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [108.910, 14.580],
                  [108.930, 14.580],
                  [108.930, 14.560],
                  [108.910, 14.560],
                  [108.910, 14.580],
                ],
              ],
            },
          },
        ],
      };
      setSelectedLayerId('layer2_tran_danh');
    } else if (type === 'search') {
      name = 'Mau_QuyTap_EPSG3405_Chuan.geojson';
      sampleData = {
        type: 'FeatureCollection',
        crs: { type: 'name', properties: { name: 'EPSG:3405' } },
        features: [
          {
            type: 'Feature',
            id: 4926,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [938173.5755, 1548510.7383],
                  [937895.2309, 1548722.0719],
                  [937689.2259, 1548581.7723],
                  [937753.3599, 1548333.3515],
                  [938007.0513, 1548252.0697],
                  [938173.5755, 1548510.7383],
                ],
              ],
            },
            properties: {
              OBJECTID: 4926,
              Shape_Length: 0,
              Shape_Area: 0,
              Ten: 'Khu vực Tìm kiếm Phù Cát',
              PhanLoai: 4,
              HienTrang: 'Đã tìm kiếm nhưng chưa có kết quả',
              Xa: 'Xã Phù Cát',
              Tinh: 'Gia Lai',
              DiaDanh3C: 'Xã Phù Cát, Huyện Phù Cát, Tỉnh Gia Lai (Cũ)',
              CapNhat: null,
              Nguon: null,
              TimDuoc: 0,
              ChuaThay: 12,
              ToaDo: '13°58\'23"N - 109°3\'6"E',
            },
          },
          {
            type: 'Feature',
            id: 5180,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [834133.3595, 1433312.5579],
                  [834146.0279, 1433053.1261],
                  [834480.3671, 1432927.1823],
                  [834592.8599, 1433041.9257],
                  [834719.8873, 1433171.4949],
                  [834683.5417, 1433564.5671],
                  [834350.7559, 1433633.6537],
                  [834253.0587, 1433565.7163],
                  [834133.3595, 1433312.5579],
                ],
              ],
            },
            properties: {
              OBJECTID: 5180,
              Shape_Length: 0,
              Shape_Area: 0,
              Ten: 'Khu vực Đã quy tập xong Đăk Lăk',
              PhanLoai: 1,
              HienTrang: 'Đã quy tập xong',
              Xa: 'Thị trấn Ea Drăng',
              Tinh: 'Đăk Lăk',
              DiaDanh3C: 'Thị trấn Ea Drăng, Huyện Ea H\'Leo, Tỉnh Đăk Lăk (Cũ)',
              CapNhat: 1781481600000,
              Nguon: 'Bộ CHQS tỉnh Đăk Lăk',
              TimDuoc: 8,
              ChuaThay: 0,
              ToaDo: '13°12\'45"N - 108°15\'22"E',
            },
          },
          {
            type: 'Feature',
            id: 5256,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [838156.2831, 1442311.6581],
                  [838244.7011, 1441725.7347],
                  [838291.7161, 1441422.0273],
                  [838555.0075, 1441088.3583],
                  [838424.6589, 1440927.7459],
                  [838414.1503, 1440868.9597],
                  [838418.0833, 1440852.4925],
                  [838763.2635, 1441254.0339],
                  [838851.1865, 1441375.2671],
                  [838894.8483, 1441529.7985],
                  [838912.6937, 1441692.2315],
                  [839002.6891, 1441904.1147],
                  [839120.4579, 1442035.7539],
                  [838836.9767, 1442318.9047],
                  [838902.5965, 1442622.2095],
                  [838766.8625, 1442852.1905],
                  [838651.4339, 1442929.1873],
                  [838412.1965, 1443013.3983],
                  [838339.0591, 1442759.2865],
                  [838263.4769, 1442429.8161],
                  [838156.2831, 1442311.6581],
                ],
              ],
            },
            properties: {
              OBJECTID: 5256,
              Shape_Length: 0,
              Shape_Area: 0,
              Ten: 'Khu vực Quy tập Đang triển khai',
              PhanLoai: 2,
              HienTrang: 'Đã quy tập nhưng chưa xong',
              Xa: 'Xã Cư M\'gar',
              Tinh: 'Đăk Lăk',
              CapNhat: 1781481600000,
              Nguon: 'Bộ CHQS tỉnh Đăk Lăk',
              TimDuoc: 4,
              ChuaThay: 6,
              ToaDo: '13°18\'10"N - 108°19\'35"E',
            },
          },
        ],
      };
      setSelectedLayerId('layer1_tim_kiem');
    } else {
      name = 'Sample_MoChi_MoiXacDinh.geojson';
      sampleData = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'MC-002',
            properties: {
              name: 'Mộ Liệt sĩ Trần Văn B',
              code: 'MC-002',
              ho_ten: 'Trần Văn B',
              nam_sinh: '1950',
              que_quan: 'Hà Tĩnh',
              trang_thai: 'xac_dinh',
            },
            geometry: {
              type: 'Point',
              coordinates: [108.125, 15.542],
            },
          },
          {
            type: 'Feature',
            id: 'MC-003',
            properties: {
              name: 'Mộ 3 Liệt sĩ chưa rõ danh tính',
              code: 'MC-003',
              ho_ten: 'Chưa rõ tên',
              don_vi: 'c2 d5',
              trang_thai: 'chua_xac_dinh',
            },
            geometry: {
              type: 'Point',
              coordinates: [108.180, 15.420],
            },
          },
        ],
      };
      setSelectedLayerId('layer3_mo_chi');
    }

    processGeoJsonContent(JSON.stringify(sampleData), name);
  };

  // Metrics calculation
  const duplicateCount =
    parsedFeatures?.filter((f) => checkIsDuplicate(f)).length || 0;
  const newCount = (parsedFeatures?.length || 0) - duplicateCount;

  const handleConfirm = () => {
    if (!parsedFeatures || parsedFeatures.length === 0) return;

    // Attach targetLayerId
    const updatedWithLayer = parsedFeatures.map((f) => ({
      ...f,
      layerId: selectedLayerId,
    }));

    onImportConfirm(selectedLayerId, updatedWithLayer, duplicateStrategy);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-blue-600/30 rounded border border-blue-500/50">
              <Upload className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                Phase 2: Import & Chuẩn hóa Dữ liệu Không gian GeoJSON
              </h3>
              <p className="text-[10px] text-slate-400">
                Nạp dữ liệu bản đồ, kiểm tra đối chiếu & tự động xử lý trùng lặp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 flex-1">
          {/* STEP 1: Choose Target Layer Combo */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Bước 1: Chọn Loại Dữ liệu / Lớp Bản đồ Đích sẽ Import (*)</span>
            </label>
            <p className="text-[11px] text-slate-500">
              Tất cả các đối tượng GeoJSON từ tập tin sẽ được đồng bộ trực tiếp vào Lớp đã chọn:
            </p>
            <select
              value={selectedLayerId}
              onChange={(e) => setSelectedLayerId(e.target.value)}
              className="w-full bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
            >
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.description})
                </option>
              ))}
            </select>
          </div>

          {/* STEP 2: File Upload Dropzone or Sample Preset Buttons */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Bước 2: Tải lên Tập tin GeoJSON (.geojson, .json)
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
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-lg p-5 flex flex-col items-center justify-center text-center bg-slate-50/80 hover:bg-blue-50/50 transition cursor-pointer group shadow-inner"
            >
              <FileText className="w-9 h-9 text-slate-400 group-hover:text-blue-600 mb-1.5 transition" />
              <p className="font-bold text-slate-700 text-xs">
                {fileName ? `Tập tin đang chọn: ${fileName}` : 'Bấm để chọn file GeoJSON từ máy tính hoặc kéo thả vào đây'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Định dạng chuẩn WGS84 (.geojson, .json) với hệ tọa độ kinh/vĩ
              </p>
            </div>

            {/* Quick Presets for Demo */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Thử nhanh mẫu data:</span>
              <button
                type="button"
                onClick={() => loadSampleDataset('search')}
                className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-red-600" />
                Mẫu Quy tập (OBJECTID, Ten, PhanLoai, ToaDo)
              </button>
              <button
                type="button"
                onClick={() => loadSampleDataset('battle')}
                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
              >
                Mẫu Trận đánh
              </button>
              <button
                type="button"
                onClick={() => loadSampleDataset('graves')}
                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
              >
                Mẫu Mộ chí
              </button>
            </div>

            {/* Filter Fields Checkbox Option */}
            <div className="bg-blue-50/80 border border-blue-200 p-2.5 rounded-lg flex items-start gap-2.5 mt-2">
              <input
                type="checkbox"
                id="filterStrict"
                checked={filterStrictFields}
                onChange={(e) => setFilterStrictFields(e.target.checked)}
                className="mt-0.5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="filterStrict" className="cursor-pointer text-slate-800">
                <span className="font-bold text-xs text-blue-900">
                  Chuẩn hóa thuộc tính: Chỉ lọc & import các trường quy tập cốt lõi
                </span>
                <p className="text-[11px] font-mono text-blue-800 mt-0.5">
                  [OBJECTID, Ten, PhanLoai, TimDuoc, ChuaThay, Xa, Tinh, DiaDanh3C] (Tọa độ tự động lấy từ GeoJSON Geometry)
                </p>
              </label>
            </div>
          </div>

          {/* Error Message Display */}
          {parseError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* STEP 3: Analysis & Duplicate Handling Strategy */}
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
                  <p className="text-[10px] uppercase font-bold text-amber-600">Trùng mã / Tên</p>
                  <p className="text-base font-extrabold text-amber-600">{duplicateCount}</p>
                </div>
              </div>

              {/* Duplicate Strategy Radio Selector */}
              <div className="bg-amber-50/80 border border-amber-200 p-3 rounded-lg space-y-2">
                <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Bước 3: Phương án xử lý khi phát hiện trùng lặp dữ liệu (*)</span>
                </label>

                <div className="space-y-2 pt-1">
                  <label className="flex items-start gap-2.5 bg-white p-2 rounded border border-amber-200 cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="radio"
                      name="strategy"
                      value="overwrite"
                      checked={duplicateStrategy === 'overwrite'}
                      onChange={() => setDuplicateStrategy('overwrite')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-slate-800 text-xs">
                        1. Ghi đè & Cập nhật
                      </span>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Cập nhật lại tọa độ và thuộc tính mới nhất cho các đối tượng đã trùng trong lớp ({targetLayer.name}).
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 bg-white p-2 rounded border border-amber-200 cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="radio"
                      name="strategy"
                      value="skip"
                      checked={duplicateStrategy === 'skip'}
                      onChange={() => setDuplicateStrategy('skip')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-slate-800 text-xs">
                        2. Bỏ qua các đối tượng trùng
                      </span>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Giữ nguyên dữ liệu hiện có trên hệ thống, chỉ import thêm các đối tượng mới hoàn toàn.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 bg-white p-2 rounded border border-amber-200 cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="radio"
                      name="strategy"
                      value="append"
                      checked={duplicateStrategy === 'append'}
                      onChange={() => setDuplicateStrategy('append')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-slate-800 text-xs">
                        3. Nhập tất cả & Tạo mã bản sao
                      </span>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Tự động sinh ID mới cho các bản ghi trùng để lưu độc lập cả hai bản.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Preview Feature List */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Xem trước danh sách đối tượng sẽ Import ({parsedFeatures.length}):
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
                            {isDup ? 'Trùng mã' : 'Mới'}
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

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Phân quyền: Quyền Admin ghi dữ liệu không gian</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
            >
              Hủy bỏ
            </button>

            <button
              onClick={handleConfirm}
              disabled={!parsedFeatures || parsedFeatures.length === 0}
              className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition shadow-sm ${
                parsedFeatures && parsedFeatures.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-70'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Xác nhận Import vào {targetLayer.name.split(':')[0]}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
