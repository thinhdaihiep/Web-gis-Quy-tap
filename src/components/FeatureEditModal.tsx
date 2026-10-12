import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GeoJsonFeatureItem, LayerConfig, PHAN_LOAI_COLORS, UserRole, AppUser } from '../types';
import {
  X,
  Clock,
  CheckCircle2,
  Plus,
  Trash2,
  Table,
  Layers,
  Calendar,
  FileText,
  Upload,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { getFieldAlias, sortPropertyRows, isFieldHidden } from '../fieldAlias';
import { isDateField, formatDateForDisplay, toHtmlDateInputValue, parseDateInputToStorageValue } from '../utils/dateFormatter';

interface FeatureEditModalProps {
  isOpen: boolean;
  feature: Partial<GeoJsonFeatureItem> | null;
  layers: LayerConfig[];
  currentRole: UserRole;
  currentUser?: AppUser | null;
  onSave: (feature: GeoJsonFeatureItem) => void;
  onDelete?: (featureId: string) => void;
  onOpenPdfViewer?: (url: string, title?: string) => void;
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
  currentUser,
  onSave,
  onDelete,
  onOpenPdfViewer,
  onClose,
}) => {
  const [name, setName] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [phanLoai, setPhanLoai] = useState<number>(1);
  const [thoiGian, setThoiGian] = useState<string>('');
  const [donVi, setDonVi] = useState<string>('');
  const [ghiChu, setGhiChu] = useState<string>('');
  const [editorNotes, setEditorNotes] = useState<string>('');
  const [isUploadingDossier, setIsUploadingDossier] = useState<boolean>(false);
  const [isDeletingDossier, setIsDeletingDossier] = useState<boolean>(false);
  const [confirmDeleteDossier, setConfirmDeleteDossier] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom attributes table rows
  const [customRows, setCustomRows] = useState<AttributeRow[]>([]);
  const [newKey, setNewKey] = useState<string>('');
  const [newValue, setNewValue] = useState<string>('');

  // Refs để theo dõi snapshot gốc của form và đường dẫn hồ sơ mới nhất
  const initialSnapshotRef = useRef<{
    name: string;
    selectedLayerId: string;
    phanLoai: number;
    thoiGian: string;
    donVi: string;
    ghiChu: string;
    customPropsJson: string;
  } | null>(null);
  const currentHoSoRef = useRef<string>('');
  const activeFeatureIdRef = useRef<string>('');

  useEffect(() => {
    if (feature) {
      const featId = String(feature.id || (feature as any).code || '');
      const isSameFeature = activeFeatureIdRef.current === featId && activeFeatureIdRef.current !== '';

      const rawHoSo = String(
        feature.properties?.HoSo ||
        feature.properties?.hoso ||
        feature.properties?.HOSO ||
        ''
      ).trim();

      // Luôn đồng bộ currentHoSoRef khi mở một đối tượng mới
      if (!isSameFeature) {
        currentHoSoRef.current = rawHoSo;
        activeFeatureIdRef.current = featId;
      }

      // Chỉ khởi tạo lại toàn bộ form nếu đối tượng mở ra là đối tượng mới
      if (!isSameFeature) {
        const initialName = feature.name || feature.properties?.Ten || feature.properties?.ten || '';
        const initialLayerId = feature.layerId || (layers.length > 0 ? layers[0].id : 'layer2_tran_danh');
        const pLoai = feature.properties?.PhanLoai ?? feature.properties?.phanLoai ?? 1;
        const initialPhanLoai = Number(pLoai) || 1;
        const initialThoiGian = feature.properties?.ThoiGian || feature.properties?.thoiGian || '';
        const initialDonVi = feature.properties?.DonVi || feature.properties?.donVi || '';
        const initialGhiChu = feature.properties?.GhiChu || feature.properties?.ghiChu || feature.properties?.MoTa || '';

        setName(initialName);
        setSelectedLayerId(initialLayerId);
        setPhanLoai(initialPhanLoai);
        setThoiGian(initialThoiGian);
        setDonVi(initialDonVi);
        setGhiChu(initialGhiChu);
        setEditorNotes(feature.editorNotes || '');

        // Parse custom dynamic properties
        const targetLayer = layers.find((l) => l.id === initialLayerId);
        const isBattleLayer =
          initialLayerId === 'layer2_tran_danh' ||
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

          const hasHoSo = Object.keys(existingProps).some((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'hoso');
          if (!hasHoSo) existingProps['HoSo'] = '';
        }

        // Chuẩn hóa tên trường HoSo tránh lỗi phân biệt hoa thường (hoso vs HoSo)
        const hoSoKey = Object.keys(existingProps).find((k) => k.toLowerCase() === 'hoso');
        if (hoSoKey && hoSoKey !== 'HoSo') {
          existingProps['HoSo'] = existingProps[hoSoKey];
          delete existingProps[hoSoKey];
        }

        const knownKeys = ['Ten', 'ten', 'PhanLoai', 'phanLoai', 'ThoiGian', 'thoiGian', 'DonVi', 'donVi', 'GhiChu', 'ghiChu', 'MoTa'];
        
        const rows: AttributeRow[] = [];
        const nonHoSoSnapshot: Record<string, string> = {};

        Object.entries(existingProps).forEach(([k, v]) => {
          if (!knownKeys.includes(k) && !isFieldHidden(k)) {
            const alias = getFieldAlias(k);
            const isDate = isDateField(k, alias || k);
            const displayVal = isDate
              ? formatDateForDisplay(v, k, alias || k)
              : v !== null && v !== undefined
              ? String(v)
              : '';

            rows.push({
              id: `row-${Math.random().toString(36).substr(2, 9)}`,
              key: k,
              value: displayVal,
            });

            if (k.toLowerCase() !== 'hoso') {
              nonHoSoSnapshot[k.trim()] = displayVal.trim();
            }
          }
        });

        const sortedRows = sortPropertyRows(rows);
        setCustomRows(sortedRows);

        // Lưu bản chụp ban đầu của các trường thông tin (không bao gồm HoSo)
        initialSnapshotRef.current = {
          name: initialName.trim(),
          selectedLayerId: initialLayerId,
          phanLoai: initialPhanLoai,
          thoiGian: initialThoiGian.trim(),
          donVi: initialDonVi.trim(),
          ghiChu: initialGhiChu.trim(),
          customPropsJson: JSON.stringify(nonHoSoSnapshot),
        };
      }
    }
  }, [feature, layers]);

  // Kiểm tra xem có bất kỳ thay đổi nào ở các trường thông tin không (Nút Lưu chỉ khả dụng khi isDirty === true)
  const isDirty = useMemo(() => {
    if (!initialSnapshotRef.current) return false;
    const init = initialSnapshotRef.current;
    if (name.trim() !== init.name) return true;
    if (selectedLayerId !== init.selectedLayerId) return true;
    if (phanLoai !== init.phanLoai) return true;
    if (thoiGian.trim() !== init.thoiGian) return true;
    if (donVi.trim() !== init.donVi) return true;
    if (ghiChu.trim() !== init.ghiChu) return true;

    // So sánh các thuộc tính tùy biến khác (bỏ qua HoSo vì hồ sơ lưu trực tiếp độc lập)
    const currentNonHoSoProps: Record<string, string> = {};
    customRows.forEach((r) => {
      const k = r.key.trim();
      if (k && k.toLowerCase() !== 'hoso') {
        currentNonHoSoProps[k] = r.value.trim();
      }
    });

    if (JSON.stringify(currentNonHoSoProps) !== init.customPropsJson) {
      return true;
    }

    return false;
  }, [name, selectedLayerId, phanLoai, thoiGian, donVi, ghiChu, customRows]);

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

  // Hàm đồng bộ và chuẩn hóa thuộc tính đối tượng khi bấm Lưu hoặc khi cập nhật hồ sơ
  const buildFeatureToSave = (hoSoOverride?: string | null): GeoJsonFeatureItem => {
    const currentUpdater = currentUser?.displayName || currentUser?.username || 'Bản đồ qk5';

    // Xây dựng danh sách thuộc tính sạch
    const properties: Record<string, any> = {
      ...(feature.properties || {}),
      Ten: name.trim() || feature.name || '',
      PhanLoai: phanLoai,
      ThoiGian: thoiGian.trim(),
      DonVi: donVi.trim(),
      GhiChu: ghiChu.trim(),
      NguoiSua: currentUpdater,
      CapNhat: new Date().toISOString(),
    };

    // Loại bỏ triệt để mọi biến thể tên trường cũ của HoSo
    delete properties['hoso'];
    delete properties['HOSO'];
    delete properties['ho_so'];
    delete properties['Ho_So'];

    customRows.forEach((row) => {
      const k = row.key.trim();
      if (!k || k.toLowerCase() === 'hoso') return;
      const origVal = feature.properties?.[k];
      if (isDateField(k)) {
        properties[k] = parseDateInputToStorageValue(row.value.trim(), origVal, k);
      } else {
        properties[k] = row.value.trim();
      }
    });

    // Luôn ưu tiên hoSoOverride nếu truyền vào, ngược lại luôn dùng currentHoSoRef.current (hồ sơ mới nhất)
    const effectiveHoSo = hoSoOverride !== undefined ? hoSoOverride : currentHoSoRef.current;
    if (effectiveHoSo && effectiveHoSo.trim()) {
      properties['HoSo'] = effectiveHoSo.trim();
    } else {
      delete properties['HoSo'];
    }

    properties['NguoiSua'] = currentUpdater;
    properties['CapNhat'] = new Date().toISOString();

    return {
      id: feature.id || `feat-${Date.now()}`,
      layerId: selectedLayerId,
      name: (name.trim() || feature.name || '').trim(),
      type: feature.type || 'Point',
      coordinates: feature.coordinates || [108.3, 14.5],
      properties,
      updatedAt: new Date().toISOString(),
    };
  };

  const handleRemoveRow = (id: string) => {
    const targetRow = customRows.find((r) => r.id === id);
    if (targetRow && targetRow.key.toLowerCase() === 'hoso' && targetRow.value) {
      handleDeleteDossier(id, targetRow.value);
      return;
    }
    setCustomRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: 'key' | 'value', val: string) => {
    setCustomRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Vui lòng chọn file định dạng PDF.');
      return;
    }

    setIsUploadingDossier(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const objectIdVal =
            feature.properties?.OBJECTID ??
            feature.properties?.objectid ??
            feature.code ??
            feature.id;

          const oldFileUrl = currentHoSoRef.current || feature.properties?.HoSo || feature.properties?.hoso || '';

          const res = await fetch('/api/battles/upload-hoso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              fileBase64: base64Data,
              objectId: objectIdVal,
              battleName: name || feature.name || 'TranDanh',
              oldFileUrl,
            }),
          });

          const data = await res.json();
          if (res.ok && data.url) {
            // 1. Cập nhật ref lưu giữ đường dẫn hồ sơ mới nhất (đảm bảo không bị ghi đè khi bấm Lưu)
            currentHoSoRef.current = data.url;

            // 2. Cập nhật state hiển thị bảng thuộc tính
            setCustomRows((prev) => {
              const existingIdx = prev.findIndex((r) => r.key.toLowerCase() === 'hoso');
              if (existingIdx !== -1) {
                return prev.map((r, i) => (i === existingIdx ? { ...r, key: 'HoSo', value: data.url } : r));
              } else {
                return [
                  ...prev,
                  {
                    id: `row-${Date.now()}`,
                    key: 'HoSo',
                    value: data.url,
                  },
                ];
              }
            });

            // 3. Tự động lưu trực tiếp và đồng bộ tức thì xuống CSDL Firestore & bản đồ
            const updatedFeature = buildFeatureToSave(data.url);
            onSave(updatedFeature);
          } else {
            alert(data.error || 'Tải hồ sơ lên thất bại.');
          }
        } catch (uploadErr: any) {
          alert('Lỗi kết nối khi tải hồ sơ: ' + (uploadErr?.message || uploadErr));
        } finally {
          setIsUploadingDossier(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert('Lỗi đọc file: ' + (err?.message || err));
      setIsUploadingDossier(false);
    }
  };

  const handleDeleteDossier = async (rowId: string, fileUrl: string) => {
    setConfirmDeleteDossier(false);
    setIsDeletingDossier(true);

    const objectIdVal =
      feature.properties?.OBJECTID ??
      feature.properties?.objectid ??
      feature.code ??
      feature.id;

    if (fileUrl || objectIdVal !== undefined) {
      try {
        await fetch('/api/battles/delete-hoso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileUrl, objectId: objectIdVal }),
        });
      } catch (e) {
        console.warn('Lỗi khi gọi API xóa file trên Server:', e);
      }
    }

    // 1. Cập nhật ref lưu giữ đường dẫn hồ sơ về rỗng
    currentHoSoRef.current = '';

    // 2. Cập nhật state hiển thị bảng thuộc tính cho mọi dòng chứa HoSo
    setCustomRows((prev) =>
      prev.map((r) =>
        r.id === rowId || r.key.toLowerCase() === 'hoso' ? { ...r, value: '' } : r
      )
    );

    // 3. Tự động lưu trực tiếp và xóa trên CSDL Firestore & bản đồ
    const updatedFeature = buildFeatureToSave('');
    onSave(updatedFeature);
    setIsDeletingDossier(false);
  };

  const handleSubmit = () => {
    if (!isDirty) return;

    if (!name.trim()) {
      alert('Vui lòng nhập Tên đối tượng');
      return;
    }

    // Luôn lấy hồ sơ từ currentHoSoRef.current để bảo toàn dữ liệu hồ sơ mới nhất vừa cập nhật
    const updatedFeature = buildFeatureToSave();
    onClose();
    onSave(updatedFeature);
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
                {!isFieldHidden('ThoiGian') && (
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
                )}

                {/* Row 5: Đơn vị liên quan */}
                {!isFieldHidden('DonVi') && (
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
                )}

                {/* Row 6: Mô tả / Lịch sử */}
                {!isFieldHidden('GhiChu') && !isFieldHidden('MoTa') && (
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
                )}

                {/* Dynamic Custom Attribute Rows */}
                {customRows.map((row) => {
                  const alias = getFieldAlias(row.key);
                  const isDate = isDateField(row.key, alias || row.key);
                  const isHoSo = row.key.toLowerCase() === 'hoso';
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition group">
                      <td className="py-1.5 px-3 border-r border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-1">
                          {isDate && <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                          {isHoSo && <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                          <input
                            type="text"
                            value={row.key}
                            readOnly={isHoSo}
                            onChange={(e) => handleUpdateRow(row.id, 'key', e.target.value)}
                            placeholder="Tên trường..."
                            className={`w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none ${
                              isHoSo ? 'bg-slate-100 cursor-not-allowed select-none' : ''
                            }`}
                          />
                        </div>
                        {alias && alias !== row.key && (
                          <span className="text-[10px] text-blue-600 font-semibold block truncate mt-0.5">
                            Ánh xạ: {alias}
                          </span>
                        )}
                      </td>

                      <td className="py-1.5 px-3 flex items-center gap-2">
                        {isHoSo ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="file"
                              ref={fileInputRef}
                              accept=".pdf,application/pdf"
                              onChange={handleFileUpload}
                              className="hidden"
                            />

                            {row.value && row.value.trim() !== '' ? (
                              <>
                                {/* 1. Icon Xem hồ sơ */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onOpenPdfViewer) {
                                      onOpenPdfViewer(row.value, name || feature.name || 'Hồ sơ trận đánh');
                                    } else {
                                      window.open(row.value, '_blank');
                                    }
                                  }}
                                  className="p-1.5 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg border border-blue-200 transition cursor-pointer shadow-2xs"
                                  title="Xem hồ sơ"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>

                                {/* 2. Icon Đổi hồ sơ */}
                                <button
                                  type="button"
                                  disabled={isUploadingDossier || isDeletingDossier}
                                  onClick={() => fileInputRef.current?.click()}
                                  className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-200 rounded-lg border border-slate-300 transition cursor-pointer disabled:opacity-50"
                                  title="Đổi file"
                                >
                                  {isUploadingDossier ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                  ) : (
                                    <Upload className="w-3.5 h-3.5 text-slate-600" />
                                  )}
                                </button>

                                {/* 3. Icon Xóa hồ sơ với inline confirm */}
                                <button
                                  type="button"
                                  disabled={isUploadingDossier || isDeletingDossier}
                                  onClick={() => {
                                    if (confirmDeleteDossier) {
                                      handleDeleteDossier(row.id, row.value);
                                    } else {
                                      setConfirmDeleteDossier(true);
                                      setTimeout(() => setConfirmDeleteDossier(false), 3500);
                                    }
                                  }}
                                  className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                                    confirmDeleteDossier
                                      ? 'text-white bg-rose-600 border-rose-600 animate-pulse'
                                      : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 border-transparent hover:border-rose-200'
                                  }`}
                                  title={confirmDeleteDossier ? 'Bấm lần nữa để xác nhận xóa' : 'Xóa hồ sơ'}
                                >
                                  {isDeletingDossier ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                                  ) : confirmDeleteDossier ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-white" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </>
                            ) : (
                              /* Icon Tải lên khi chưa có hồ sơ */
                              <button
                                type="button"
                                disabled={isUploadingDossier}
                                onClick={() => fileInputRef.current?.click()}
                                className="p-1.5 text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-300 hover:border-blue-400 transition cursor-pointer disabled:opacity-50"
                                title="Tải lên hồ sơ"
                              >
                                {isUploadingDossier ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                ) : (
                                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                                )}
                              </button>
                            )}
                          </div>
                        ) : isDate ? (
                          <div className="flex-1 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={row.value}
                              placeholder="DD/MM/YYYY"
                              onChange={(e) => handleUpdateRow(row.id, 'value', e.target.value)}
                              className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-medium text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <div className="relative shrink-0 flex items-center justify-center">
                              <input
                                type="date"
                                value={toHtmlDateInputValue(row.value, row.key, alias || row.key)}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    const [y, m, d] = e.target.value.split('-');
                                    handleUpdateRow(row.id, 'value', `${d}/${m}/${y}`);
                                  } else {
                                    handleUpdateRow(row.id, 'value', '');
                                  }
                                }}
                                className="w-7 h-7 opacity-0 absolute inset-0 cursor-pointer z-10"
                                title="Chọn ngày từ lịch"
                              />
                              <div className="w-7 h-7 rounded border border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-blue-600 flex items-center justify-center transition shadow-2xs">
                                <Calendar className="w-3.5 h-3.5" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={row.value}
                            onChange={(e) => handleUpdateRow(row.id, 'value', e.target.value)}
                            placeholder="Giá trị..."
                            className="flex-1 px-2 py-1 rounded border border-slate-300 text-xs font-medium text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        )}
                        {!isHoSo && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition shrink-0"
                            title="Xóa hàng này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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
              disabled={!isDirty}
              onClick={handleSubmit}
              className={`px-4 py-1.5 font-bold rounded-lg text-xs flex items-center gap-1.5 transition ${
                isDirty
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-sm'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
              title={isDirty ? 'Lưu thay đổi thuộc tính' : 'Chưa có thay đổi thuộc tính nào để lưu'}
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
