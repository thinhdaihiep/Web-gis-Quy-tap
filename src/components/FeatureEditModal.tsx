import React, { useState, useEffect } from 'react';
import { GeoJsonFeatureItem, LayerConfig, PHAN_LOAI_COLORS, UserRole } from '../types';
import {
  X,
  Clock,
  CheckCircle2,
  Plus,
  Trash2,
  Table,
  Layers,
} from 'lucide-react';
import { getFieldAlias, sortPropertyRows } from '../fieldAlias';

interface FeatureEditModalProps {
  isOpen: boolean;
  feature: Partial<GeoJsonFeatureItem> | null;
  layers: LayerConfig[];
  currentRole: UserRole;
  onSave: (feature: GeoJsonFeatureItem) => void;
  onDelete?: (featureId: string) => void;
  onClose: () => void;
}

interface AttributeRow {
  id: string;
  key: string;
  value: string;
}

export const FeatureEditModal: React.FC<FeatureEditModalProps> = ({
  isOpen,
  feature,
  layers,
  currentRole,
  onSave,
  onDelete,
  onClose,
}) => {
  const [name, setName] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [phanLoai, setPhanLoai] = useState<number>(1);
  const [thoiGian, setThoiGian] = useState<string>('');
  const [donVi, setDonVi] = useState<string>('');
  const [ghiChu, setGhiChu] = useState<string>('');
  const [editorNotes, setEditorNotes] = useState<string>('');

  // Custom attributes table rows
  const [customRows, setCustomRows] = useState<AttributeRow[]>([]);
  const [newKey, setNewKey] = useState<string>('');
  const [newValue, setNewValue] = useState<string>('');

  useEffect(() => {
    if (feature) {
      setName(feature.name || feature.properties?.Ten || feature.properties?.ten || '');
      setSelectedLayerId(feature.layerId || (layers.length > 0 ? layers[0].id : 'layer2_tran_danh'));

      const pLoai = feature.properties?.PhanLoai ?? feature.properties?.phanLoai ?? 1;
      setPhanLoai(Number(pLoai) || 1);

      setThoiGian(feature.properties?.ThoiGian || feature.properties?.thoiGian || '');
      setDonVi(feature.properties?.DonVi || feature.properties?.donVi || '');
      setGhiChu(
        feature.properties?.GhiChu || feature.properties?.ghiChu || feature.properties?.MoTa || ''
      );
      setEditorNotes(feature.editorNotes || '');

      // Parse custom dynamic properties
      const targetLayer = layers.find((l) => l.id === (feature.layerId || 'layer2_tran_danh'));
      const isBattleLayer =
        feature.layerId === 'layer2_tran_danh' ||
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
      }

      const knownKeys = ['Ten', 'ten', 'PhanLoai', 'phanLoai', 'ThoiGian', 'thoiGian', 'DonVi', 'donVi', 'GhiChu', 'ghiChu', 'MoTa'];
      
      const rows: AttributeRow[] = [];
      Object.entries(existingProps).forEach(([k, v]) => {
        if (!knownKeys.includes(k)) {
          rows.push({
            id: `row-${Math.random().toString(36).substr(2, 9)}`,
            key: k,
            value: v !== null && v !== undefined ? String(v) : '',
          });
        }
      });
      setCustomRows(sortPropertyRows(rows));
    }
  }, [feature, layers]);

  if (!isOpen || !feature) return null;

  const handleAddRow = () => {
    if (!newKey.trim()) return;
    setCustomRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        key: newKey.trim(),
        value: newValue.trim(),
      },
    ]);
    setNewKey('');
    setNewValue('');
  };

  const handleRemoveRow = (id: string) => {
    setCustomRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: 'key' | 'value', val: string) => {
    setCustomRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      alert('Vui lòng nhập Tên đối tượng');
      return;
    }

    // Build merged properties dictionary
    const properties: Record<string, any> = {
      ...(feature.properties || {}),
      Ten: name.trim(),
      PhanLoai: phanLoai,
      ThoiGian: thoiGian.trim(),
      DonVi: donVi.trim(),
      GhiChu: ghiChu.trim(),
    };

    customRows.forEach((row) => {
      if (row.key.trim()) {
        properties[row.key.trim()] = row.value.trim();
      }
    });

    const updatedFeature: GeoJsonFeatureItem = {
      id: feature.id || `feat-${Date.now()}`,
      layerId: selectedLayerId,
      name: name.trim(),
      type: feature.type || 'Point',
      coordinates: feature.coordinates || [108.3, 14.5],
      properties,
      updatedAt: new Date().toISOString(),
    };

    onSave(updatedFeature);
    onClose();
  };

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const isPolygonLayer =
    selectedLayer?.type === 'polygon' ||
    feature.type === 'Polygon' ||
    feature.type === 'MultiPolygon';

  return (
    <div className="fixed inset-0 z-[2500] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
              <Table className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 leading-tight flex items-center gap-2">
                <span>Bảng cập nhật Thuộc tính đối tượng</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Hình học: <span className="font-bold text-amber-300">{feature.type}</span> | ID:{' '}
                <span className="font-mono text-slate-300">{feature.id || 'Tạo mới'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content - Structured 2-Column Table Grid */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Main Attribute Form Table Grid */}
          <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800 text-slate-200 uppercase text-[10px] font-black tracking-wider">
                  <th className="py-2.5 px-3 border-r border-slate-700 w-2/5">Tên trường</th>
                  <th className="py-2.5 px-3">Giá trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium text-slate-800">
                {/* Row 1: Tên đối tượng */}
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-2 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700">
                    Tên đối tượng <span className="text-red-500">*</span>
                  </td>
                  <td className="py-1.5 px-3">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nhập tên đối tượng..."
                      className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </td>
                </tr>

                {/* Row 2: Lớp dữ liệu không gian */}
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-2 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      <span>Lớp dữ liệu không gian</span>
                    </span>
                  </td>
                  <td className="py-1.5 px-3">
                    <select
                      value={selectedLayerId}
                      onChange={(e) => setSelectedLayerId(e.target.value)}
                      className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      {layers.map((layer) => (
                        <option key={layer.id} value={layer.id}>
                          {layer.name} ({layer.type})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>

                {/* Row 3 (Optional): Phân loại quy tập */}
                {isPolygonLayer && (
                  <tr className="hover:bg-slate-50/80 transition">
                    <td className="py-2 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700">
                      Phân loại tiến độ
                    </td>
                    <td className="py-1.5 px-3">
                      <select
                        value={phanLoai}
                        onChange={(e) => setPhanLoai(Number(e.target.value))}
                        className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
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

                {/* Row 4: Thời gian / Niên đại */}
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-2 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700">
                    Thời gian / Niên đại
                  </td>
                  <td className="py-1.5 px-3">
                    <input
                      type="text"
                      value={thoiGian}
                      onChange={(e) => setThoiGian(e.target.value)}
                      placeholder="VD: 1968, Tháng 3/1975"
                      className="w-full px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </td>
                </tr>

                {/* Row 5: Đơn vị liên quan */}
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-2 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700">
                    Đơn vị liên quan
                  </td>
                  <td className="py-1.5 px-3">
                    <input
                      type="text"
                      value={donVi}
                      onChange={(e) => setDonVi(e.target.value)}
                      placeholder="VD: Sư đoàn 2, Trung đoàn 1..."
                      className="w-full px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </td>
                </tr>

                {/* Row 6: Mô tả / Lịch sử */}
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-2 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700 align-top">
                    Mô tả chi tiết / Lịch sử
                  </td>
                  <td className="py-1.5 px-3">
                    <textarea
                      rows={2}
                      value={ghiChu}
                      onChange={(e) => setGhiChu(e.target.value)}
                      placeholder="Nhập ghi chú hoặc mô tả chi tiết..."
                      className="w-full px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    ></textarea>
                  </td>
                </tr>

                {/* Dynamic Custom Attribute Rows */}
                {customRows.map((row) => {
                  const alias = getFieldAlias(row.key);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition group">
                      <td className="py-1.5 px-3 border-r border-slate-200 bg-slate-50">
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) => handleUpdateRow(row.id, 'key', e.target.value)}
                          placeholder="Tên trường..."
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        {alias && alias !== row.key && (
                          <span className="text-[10px] text-blue-600 font-semibold block truncate mt-0.5">
                            Ánh xạ: {alias}
                          </span>
                        )}
                      </td>

                      <td className="py-1.5 px-3 flex items-center gap-2">
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => handleUpdateRow(row.id, 'value', e.target.value)}
                          placeholder="Giá trị..."
                          className="flex-1 px-2 py-1 rounded border border-slate-300 text-xs font-medium text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition shrink-0"
                          title="Xóa hàng này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Row Controls */}
          <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Tên trường mới (VD: MaSo, DiaChi)..."
              className="w-2/5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Giá trị trường mới..."
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              type="button"
              onClick={handleAddRow}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm hàng</span>
            </button>
          </div>


        </div>

        {/* Modal Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
          <div>
            {feature.id && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Bạn có chắc chắn muốn xóa đối tượng này?')) {
                    onDelete(feature.id!);
                    onClose();
                  }
                }}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg font-bold text-xs cursor-pointer transition"
              >
                Xóa đối tượng
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition"
            >
              Hủy
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs cursor-pointer transition shadow-sm flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
