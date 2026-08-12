import React, { useState, useEffect } from 'react';
import { GeoJsonFeatureItem, LayerConfig, UserRole, PHAN_LOAI_COLORS } from '../types';
import {
  X,
  Table,
  CheckCircle2,
  Clock,
  Trash2,
  Lock,
  RotateCw,
} from 'lucide-react';
import { getFieldAlias, sortPropertyRows, isFieldHidden } from '../fieldAlias';

interface AttributePaneProps {
  feature: GeoJsonFeatureItem | null;
  layers: LayerConfig[];
  currentRole: UserRole;
  onSave: (feature: GeoJsonFeatureItem) => void;
  onDelete?: (featureId: string) => void;
  onReload?: (featureId: string) => Promise<void>;
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
  onReload,
  onClose,
}) => {
  const [name, setName] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [phanLoai, setPhanLoai] = useState<number>(1);
  const [propRows, setPropRows] = useState<EditablePropertyRow[]>([]);
  const [showRawFieldName, setShowRawFieldName] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState<boolean>(false);

  // Resizable pane width state
  const [paneWidth, setPaneWidth] = useState<number>(380);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const handleReloadClick = async () => {
    if (!onReload || !feature) return;
    setIsReloading(true);
    try {
      await onReload(String(feature.id));
    } finally {
      setIsReloading(false);
    }
  };

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
      const featLayerId = feature.layerId || (layers.length > 0 ? layers[0].id : 'layer2_tran_danh');
      setSelectedLayerId(featLayerId);

      const pLoai = feature.properties?.PhanLoai ?? feature.properties?.phanLoai ?? 1;
      setPhanLoai(Number(pLoai) || 1);

      const targetLayer = layers.find((l) => l.id === featLayerId);
      const isBattleLayer =
        featLayerId === 'layer2_tran_danh' ||
        targetLayer?.name.toLowerCase().includes('trận đánh') ||
        targetLayer?.name.toLowerCase().includes('tran danh') ||
        targetLayer?.name.toLowerCase().includes('chiến dịch') ||
        targetLayer?.name.toLowerCase().includes('chien dich');

      const existingProps: Record<string, any> = { ...(feature.properties || {}) };

      delete existingProps['TrangThaiMoi'];
      delete existingProps['trang_thai_moi'];
      delete existingProps['trangthaimoi'];
      delete existingProps['ChiHuy'];
      delete existingProps['chihuy'];
      delete existingProps['chi_huy'];
      delete existingProps['KetQua'];
      delete existingProps['ketqua'];
      delete existingProps['ket_qua'];

      if (isBattleLayer) {
        const hasBenTa = Object.keys(existingProps).some((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'benta');
        if (!hasBenTa) existingProps['BenTa'] = '';

        const hasBenDich = Object.keys(existingProps).some((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'bendich');
        if (!hasBenDich) existingProps['BenDich'] = '';

        const hasThoiGian = Object.keys(existingProps).some((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'thoigian');
        if (!hasThoiGian) existingProps['ThoiGian'] = '';

        const hasGhiChu = Object.keys(existingProps).some((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'ghichu');
        if (!hasGhiChu) existingProps['GhiChu'] = '';
      }

      const handledKeys = new Set(['ten', 'Ten', 'name', 'Name', 'phanloai', 'PhanLoai', 'phanLoai']);

      const rows: EditablePropertyRow[] = [];

      Object.entries(existingProps).forEach(([k, v]) => {
        if (handledKeys.has(k)) return;
        if (isFieldHidden(k)) return;

        const alias = getFieldAlias(k);

        rows.push({
          rawKey: k,
          aliasLabel: alias || k,
          value: v !== null && v !== undefined ? String(v) : '',
        });
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

      setPropRows(sortPropertyRows(rows));
    }
  }, [feature, layers]);

  if (!feature) return null;

  const handleValueChange = (rawKey: string, val: string) => {
    setPropRows((prev) =>
      prev.map((r) => (r.rawKey === rawKey ? { ...r, value: val } : r))
    );
  };

  const handleSubmit = () => {
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
      updatedAt: new Date().toISOString(),
    };

    onSave(updatedFeature);
  };

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const isPolygonLayer =
    selectedLayer?.type === 'polygon' ||
    feature.type === 'Polygon' ||
    feature.type === 'MultiPolygon';

  return (
    <aside
      style={{ width: `${paneWidth}px` }}
      className="relative bg-white border-l border-slate-200 h-full shadow-2xl flex flex-col z-[2000] shrink-0 animate-in slide-in-from-right duration-200"
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

        <div className="flex items-center gap-1 shrink-0">
          {onReload && (
            <button
              onClick={handleReloadClick}
              disabled={isReloading}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-1"
              title="Tải lại geometry & thuộc tính đối tượng này từ CSDL Firebase"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden sm:inline text-[10px] font-bold">Reload</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0"
            title="Đóng Bảng thuộc tính"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pane Body: 2-Column Table Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
        {/* Toggle show raw field name */}
        <div className="flex items-center justify-between px-1">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-700 font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showRawFieldName}
              onChange={(e) => setShowRawFieldName(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
            />
            <span>Hiện tên gốc</span>
          </label>
        </div>

        <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-slate-200 uppercase text-[10px] font-black tracking-wider">
                <th className="py-2 px-2.5 border-r border-slate-700 w-2/5">
                  {showRawFieldName ? 'Tên gốc' : 'Tên trường'}
                </th>
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
              {propRows
                .filter(
                  (row) =>
                    showRawFieldName ||
                    isLockedField(row.rawKey, row.aliasLabel) ||
                    !!getFieldAlias(row.rawKey)
                )
                .map((row) => {
                const locked = isLockedField(row.rawKey, row.aliasLabel);
                const displayKey = showRawFieldName ? row.rawKey : row.aliasLabel;
                return (
                  <tr key={row.rawKey} className="hover:bg-slate-50 transition">
                    <td className="py-2 px-2.5 border-r border-slate-200 font-bold bg-slate-50 text-slate-700 text-[11px] flex items-center gap-1.5">
                      {locked && <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                      <span className="truncate" title={displayKey}>{displayKey}</span>
                    </td>
                    <td className="py-1.5 px-2">
                      {locked || currentRole === 'guest' ? (
                        <input
                          type="text"
                          disabled
                          value={row.value}
                          className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-mono font-semibold text-slate-600 bg-slate-100 cursor-not-allowed opacity-90 select-all"
                          title={locked ? "Trường mã số (OBJECTID) bị khóa, không thể chỉnh sửa" : "Bạn không có quyền chỉnh sửa"}
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
      <div className="bg-slate-50 border-t border-slate-200 p-3 flex items-center justify-end shrink-0 gap-2">
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
            title="Hủy các thay đổi chưa lưu"
          >
            <X className="w-3.5 h-3.5" />
            <span>Đóng</span>
          </button>

          {currentRole !== 'guest' && (
            <button
              type="button"
              onClick={handleSubmit}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Lưu</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
