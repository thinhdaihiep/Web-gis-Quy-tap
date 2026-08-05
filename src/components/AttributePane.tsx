import React, { useState, useEffect } from 'react';
import { GeoJsonFeatureItem, LayerConfig, UserRole, PHAN_LOAI_COLORS } from '../types';
import {
  X,
  Table,
  CheckCircle2,
  Clock,
  Trash2,
  Lock,
} from 'lucide-react';
import { getFieldAlias } from '../fieldAlias';

interface AttributePaneProps {
  feature: GeoJsonFeatureItem | null;
  layers: LayerConfig[];
  currentRole: UserRole;
  onSave: (feature: GeoJsonFeatureItem, status: 'xac_dinh' | 'cho_phe_duyet') => void;
  onDelete?: (featureId: string) => void;
  onClose: () => void;
}

interface EditablePropertyRow {
  rawKey: string;
  aliasLabel: string;
  value: string;
}

export const AttributePane: React.FC<AttributePaneProps> = ({
  feature,
  layers,
  currentRole,
  onSave,
  onDelete,
  onClose,
}) => {
  if (!feature) return null;

  const [name, setName] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [phanLoai, setPhanLoai] = useState<number>(1);
  const [propRows, setPropRows] = useState<EditablePropertyRow[]>([]);

  // Resizable pane width state
  const [paneWidth, setPaneWidth] = useState<number>(380);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 280 && newWidth <= Math.min(750, window.innerWidth * 0.7)) {
        setPaneWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const isLockedField = (rawKey: string, aliasLabel: string) => {
    const k = rawKey.toUpperCase();
    return (
      k === 'OBJECTID' ||
      k === 'OBJECTID_1' ||
      k === 'OBJECT_ID' ||
      k === 'MASO' ||
      k === 'MA_SO' ||
      k === 'CODE' ||
      aliasLabel === 'Mã số'
    );
  };

  useEffect(() => {
    if (feature) {
      setName(feature.name || feature.properties?.Ten || feature.properties?.ten || '');
      setSelectedLayerId(feature.layerId || (layers.length > 0 ? layers[0].id : 'layer2_tran_danh'));

      const pLoai = feature.properties?.PhanLoai ?? feature.properties?.phanLoai ?? 1;
      setPhanLoai(Number(pLoai) || 1);

      const existingProps = feature.properties || {};
      const handledKeys = new Set(['ten', 'Ten', 'name', 'Name', 'phanloai', 'PhanLoai', 'phanLoai']);

      const rows: EditablePropertyRow[] = [];

      Object.entries(existingProps).forEach(([k, v]) => {
        if (handledKeys.has(k) || v === null || v === undefined) return;

        const alias = getFieldAlias(k);
        // Only include fields that have a defined alias in fieldAlias dictionary
        if (alias) {
          rows.push({
            rawKey: k,
            aliasLabel: alias,
            value: String(v),
          });
        }
      });

      // Ensure OBJECTID is always present and placed at the top as a locked field
      const hasObjectIdRow = rows.some((r) => isLockedField(r.rawKey, r.aliasLabel));
      if (!hasObjectIdRow) {
        const objectIdValue =
          feature.properties?.OBJECTID ??
          feature.properties?.objectid ??
          feature.properties?.OBJECTID_1 ??
          feature.properties?.code ??
          feature.id;

        rows.unshift({
          rawKey: 'OBJECTID',
          aliasLabel: 'Mã số',
          value: String(objectIdValue),
        });
      }

      setPropRows(rows);
    }
  }, [feature, layers]);

  const handleValueChange = (rawKey: string, val: string) => {
    setPropRows((prev) =>
      prev.map((r) => (r.rawKey === rawKey ? { ...r, value: val } : r))
    );
  };

  const handleSubmit = (targetStatus: 'xac_dinh' | 'cho_phe_duyet') => {
    if (!name.trim()) {
      alert('Vui lòng nhập Tên đối tượng');
      return;
    }

    const properties: Record<string, any> = {
      ...(feature.properties || {}),
      Ten: name.trim(),
      PhanLoai: phanLoai,
    };

    propRows.forEach((row) => {
      properties[row.rawKey] = row.value;
    });

    const updatedFeature: GeoJsonFeatureItem = {
      ...feature,
      layerId: selectedLayerId,
      name: name.trim(),
      properties,
      status: targetStatus,
      updatedAt: new Date().toISOString(),
    };

    onSave(updatedFeature, targetStatus);
  };

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const isPolygonLayer =
    selectedLayer?.type === 'polygon' ||
    feature.type === 'Polygon' ||
    feature.type === 'MultiPolygon';

  return (
    <aside
      style={{ width: `${paneWidth}px` }}
      className="relative bg-white border-l border-slate-200 h-full shadow-2xl flex flex-col z-[1500] shrink-0 animate-in slide-in-from-right duration-200 select-none"
    >
      {/* Resizable handle on the left edge */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        className={`absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize hover:bg-blue-500/40 z-30 transition-colors flex items-center justify-center group ${
          isResizing ? 'bg-blue-600/60' : ''
        }`}
        title="Kéo để thay đổi chiều rộng bảng thuộc tính"
      >
        <div className="w-1 h-8 bg-slate-300 group-hover:bg-blue-500 rounded-full transition-colors" />
      </div>

      {/* Pane Header */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 shrink-0">
            <Table className="w-4 h-4" />
          </div>
          <div className="truncate">
            <h3 className="font-bold text-xs text-slate-100 leading-tight truncate">
              Bảng thuộc tính đối tượng
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              Kiểu: <span className="text-amber-300 font-bold">{feature.type}</span> | ID:{' '}
              <span className="font-mono">{feature.id}</span>
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0"
          title="Đóng Bảng thuộc tính"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Pane Body: 2-Column Table Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-slate-200 uppercase text-[10px] font-black tracking-wider">
                <th className="py-2 px-2.5 border-r border-slate-700 w-2/5">Tên trường (Alias)</th>
                <th className="py-2 px-2.5">Giá trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white font-medium text-slate-800">
              {/* Row: Tên đối tượng */}
              <tr className="hover:bg-slate-50 transition">
                <td className="py-2 px-2.5 border-r border-slate-200 font-bold bg-slate-50 text-slate-700 text-[11px]">
                  Tên đối tượng <span className="text-red-500">*</span>
                </td>
                <td className="py-1.5 px-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </td>
              </tr>

              {/* Row: Lớp dữ liệu (Khóa chỉnh sửa) */}
              <tr className="hover:bg-slate-50 transition">
                <td className="py-2 px-2.5 border-r border-slate-200 font-bold bg-slate-50 text-slate-700 text-[11px] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Lớp dữ liệu</span>
                </td>
                <td className="py-1.5 px-2">
                  <select
                    disabled
                    value={selectedLayerId}
                    className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-semibold text-slate-600 bg-slate-100 cursor-not-allowed opacity-90"
                    title="Lớp dữ liệu không thể thay đổi sau khi tạo đối tượng"
                  >
                    {layers.map((layer) => (
                      <option key={layer.id} value={layer.id}>
                        {layer.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>

              {/* Row: Phân loại (If Polygon) */}
              {isPolygonLayer && (
                <tr className="hover:bg-slate-50 transition">
                  <td className="py-2 px-2.5 border-r border-slate-200 font-bold bg-slate-50 text-slate-700 text-[11px]">
                    Phân loại
                  </td>
                  <td className="py-1.5 px-2">
                    <select
                      value={phanLoai}
                      onChange={(e) => setPhanLoai(Number(e.target.value))}
                      className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      {Object.entries(PHAN_LOAI_COLORS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )}

              {/* Dynamic Property Rows (Locked for OBJECTID / Mã số) */}
              {propRows.map((row) => {
                const locked = isLockedField(row.rawKey, row.aliasLabel);
                return (
                  <tr key={row.rawKey} className="hover:bg-slate-50 transition">
                    <td className="py-2 px-2.5 border-r border-slate-200 font-bold bg-slate-50 text-slate-700 text-[11px] flex items-center gap-1.5">
                      {locked && <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                      <span>{row.aliasLabel}</span>
                    </td>
                    <td className="py-1.5 px-2">
                      {locked ? (
                        <input
                          type="text"
                          disabled
                          value={row.value}
                          className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-mono font-semibold text-slate-600 bg-slate-100 cursor-not-allowed opacity-90 select-all"
                          title="Trường mã số (OBJECTID) bị khóa, không thể chỉnh sửa"
                        />
                      ) : row.value.length > 60 ? (
                        <textarea
                          rows={2}
                          value={row.value}
                          onChange={(e) => handleValueChange(row.rawKey, e.target.value)}
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => handleValueChange(row.rawKey, e.target.value)}
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pane Footer Actions */}
      <div className="bg-slate-50 border-t border-slate-200 p-3 flex items-center justify-between shrink-0 gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Bạn có chắc chắn muốn xóa đối tượng này?')) {
                onDelete(feature.id);
                onClose();
              }
            }}
            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa</span>
          </button>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          {currentRole === 'editor' ? (
            <button
              type="button"
              onClick={() => handleSubmit('cho_phe_duyet')}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Gửi duyệt</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit('xac_dinh')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Lưu thay đổi</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
