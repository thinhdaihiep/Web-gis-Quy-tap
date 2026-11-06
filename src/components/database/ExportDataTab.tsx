import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { LayerConfig, GeoJsonFeatureItem } from '../../types';
import { sanitizePropertiesForLayer, getSchemaForLayer } from '../../FieldSchema';

function getTimestampString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}`;
}

function generateBackupFileName(layerId: string, layers: LayerConfig[]): string {
  const timeStr = getTimestampString();
  if (layerId === 'all') {
    return `SaoLuu_ToanBoCSDL_${timeStr}`;
  }
  const targetLayer = layers.find((l) => l.id === layerId);
  const safeName = (targetLayer?.name || layerId)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `SaoLuu_${safeName}_${timeStr}`;
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
  const [exportFileName, setExportFileName] = useState<string>(() =>
    generateBackupFileName('all', layers)
  );
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Cập nhật tên tệp đề xuất khi người dùng đổi lớp chọn
  useEffect(() => {
    setExportFileName(generateBackupFileName(selectedExportLayer, layers));
  }, [selectedExportLayer, layers]);

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
      features: exportFeatures.map((f, idx) => {
        let parsedCoordinates = f.coordinates;
        if (typeof parsedCoordinates === 'string') {
          try {
            parsedCoordinates = JSON.parse(parsedCoordinates);
          } catch (err) {
            console.warn(`[Export GeoJSON] Lỗi parse tọa độ đối tượng ${f.id}:`, err);
          }
        }

        // Lọc nghiêm ngặt theo đúng Schema Geodatabase của lớp
        const sanitizedProps = sanitizePropertiesForLayer(f.properties || {}, f.layerId);

        // Đảm bảo trường OBJECTID luôn hiện diện và viết hoa
        if (
          sanitizedProps.OBJECTID === undefined ||
          sanitizedProps.OBJECTID === null ||
          sanitizedProps.OBJECTID === ''
        ) {
          const rawId = f.code || f.id || idx + 1;
          const numVal = parseInt(String(rawId).replace(/[^0-9]/g, ''), 10);
          sanitizedProps.OBJECTID = !isNaN(numVal) ? numVal : rawId;
        }

        // Đảm bảo trường Ten luôn hiện diện
        if (!sanitizedProps.Ten && f.name) {
          sanitizedProps.Ten = f.name;
        }

        // Sắp xếp thứ tự các trường chuẩn theo Schema của lớp đó
        const schema = getSchemaForLayer(f.layerId);
        const orderedProps: Record<string, any> = {};

        // Đưa OBJECTID lên vị trí đầu tiên
        if ('OBJECTID' in sanitizedProps) {
          orderedProps['OBJECTID'] = sanitizedProps['OBJECTID'];
        }

        schema.forEach((fieldDef) => {
          if (fieldDef.name !== 'OBJECTID' && fieldDef.name in sanitizedProps) {
            orderedProps[fieldDef.name] = sanitizedProps[fieldDef.name];
          }
        });

        // Nếu xuất tất cả các lớp, lưu thêm layerId để khi khôi phục tự động phân bổ đúng lớp
        if (selectedExportLayer === 'all') {
          orderedProps['layerId'] = f.layerId;
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

    const blob = new Blob([jsonString], { type: 'application/geo+json;charset=utf-8;' });
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

    setExportNotice(`Đã sao lưu thành công ${exportFeatures.length} đối tượng ra tệp ${finalName}`);
    setTimeout(() => setExportNotice(null), 5000);
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
