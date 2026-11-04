import React, { useState } from 'react';
import { Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import proj4 from 'proj4';
import { LayerConfig, GeoJsonFeatureItem } from '../../types';
import { cleanShapeProperties, isShapeProperty } from '../../utils/shapeFieldUtils';

proj4.defs('EPSG:3405', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');

function convertCoordinatesToWGS84(coords: any): any {
  if (!Array.isArray(coords) || coords.length === 0) return coords;

  if (typeof coords[0] === 'number' && !isNaN(coords[0]) && typeof coords[1] === 'number' && !isNaN(coords[1])) {
    const [x, y] = coords;
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

export interface ExportDataTabProps {
  layers: LayerConfig[];
  existingFeatures: GeoJsonFeatureItem[];
}

export const ExportDataTab: React.FC<ExportDataTabProps> = ({
  layers,
  existingFeatures,
}) => {
  const [selectedExportLayer, setSelectedExportLayer] = useState<string>('all');
  const [prettyPrint, setPrettyPrint] = useState<boolean>(true);
  const [exportFileName, setExportFileName] = useState<string>('CSDL_MoLietSi_QK5');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

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
      features: exportFeatures.map((f) => {
        let parsedCoordinates = f.coordinates;
        if (typeof parsedCoordinates === 'string') {
          try {
            parsedCoordinates = JSON.parse(parsedCoordinates);
          } catch (err) {
            console.warn(`[Export GeoJSON] Lỗi parse tọa độ đối tượng ${f.id}:`, err);
          }
        }
        parsedCoordinates = convertCoordinatesToWGS84(parsedCoordinates);

        const cleanedRawProps = cleanShapeProperties(f.properties || {});
        const IGNORED_EXPORT_KEYS = new Set([
          'layerid',
          'updatedat',
          '__deleted__',
          'trangthaimoi',
          'trang_thai_moi',
          'trang_thai',
          '_id',
          'selected',
          'highlighted',
        ]);

        const sanitizedProps: Record<string, any> = {};
        for (const [key, val] of Object.entries(cleanedRawProps)) {
          const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!IGNORED_EXPORT_KEYS.has(normKey) && !isShapeProperty(key)) {
            sanitizedProps[key] = val;
          }
        }

        const objectId = sanitizedProps.OBJECTID ?? f.code ?? f.id;
        sanitizedProps.OBJECTID = objectId;

        const ten = sanitizedProps.Ten ?? f.name;
        if (ten !== undefined && ten !== null) {
          sanitizedProps.Ten = ten;
        }

        if (sanitizedProps.PhanLoai !== undefined && sanitizedProps.PhanLoai !== null && sanitizedProps.PhanLoai !== '') {
          const num = Number(sanitizedProps.PhanLoai);
          sanitizedProps.PhanLoai = isNaN(num) ? sanitizedProps.PhanLoai : num;
        }

        const priorityKeys = [
          'OBJECTID',
          'Ten',
          'PhanLoai',
          'HienTrang',
          'Xa',
          'Huyen',
          'Tinh',
          'DiaDanh3C',
          'TimDuoc',
          'ChuaThay',
          'QuyTap',
          'ThoiGian',
          'CapNhat',
          'Nguon',
          'NguoiSua',
          'HoSo',
          'DonVi',
          'BenTa',
          'BenDich',
          'CongTrinh',
          'GhiChu',
          'ToaDo',
          'DiaDiem',
          'DiaChi',
          'SoMo',
          'MoCoTen',
          'MoVoDanh',
          'ThanhLap',
          'DienThoai',
        ];

        const orderedProps: Record<string, any> = {};
        for (const key of priorityKeys) {
          if (key in sanitizedProps) {
            orderedProps[key] = sanitizedProps[key];
          }
        }
        for (const [key, val] of Object.entries(sanitizedProps)) {
          if (!(key in orderedProps)) {
            orderedProps[key] = val;
          }
        }

        return {
          type: 'Feature' as const,
          id: f.id,
          geometry: {
            type: f.type,
            coordinates: parsedCoordinates,
          },
          properties: orderedProps,
        };
      }),
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

  return (
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

      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Tên tệp tin xuất</span>
        </label>
        <input
          type="text"
          value={exportFileName}
          onChange={(e) => setExportFileName(e.target.value)}
          placeholder="Nhập tên tệp tin xuất..."
          className="w-full bg-white border border-slate-300 text-slate-800 text-xs font-medium rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
        />

        <div className="pt-1">
          <label className="flex items-center space-x-2 text-slate-700 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={prettyPrint}
              onChange={(e) => setPrettyPrint(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Định dạng tệp JSON dễ đọc (Pretty Print)</span>
          </label>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{exportNotice}</span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleExportGeoJson}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Tải tệp tin GeoJSON</span>
        </button>
      </div>
    </div>
  );
};
