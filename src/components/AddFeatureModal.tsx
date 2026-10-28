import React, { useState, useEffect, useRef } from 'react';
import {
  GeoJsonFeatureItem,
  LayerConfig,
  PHAN_LOAI_COLORS,
  AppUser,
} from '../types';
import { Plus, X, Check, Layers, AlertCircle } from 'lucide-react';
import { getSchemaForLayer, FieldDefinition } from '../FieldSchema';
import { generateRegularPolygonCoordinates } from '../utils/geoMeasure';
import { findCommunesAtLatLng } from '../utils/communeLookup';
import { getLayerCodePrefix } from '../fieldAlias';

interface AddFeatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerConfig[];
  mapFeatures: GeoJsonFeatureItem[];
  markerLocation: { lat: number; lng: number } | null;
  currentUser?: AppUser | null;
  initialName?: string;
  initialLayerId?: string;
  onSave: (newFeature: GeoJsonFeatureItem) => void;
}

export const AddFeatureModal: React.FC<AddFeatureModalProps> = ({
  isOpen,
  onClose,
  layers,
  mapFeatures,
  markerLocation,
  currentUser,
  initialName,
  initialLayerId,
  onSave,
}) => {
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [objectId, setObjectId] = useState<string>('1');
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [errorMessage, setErrorMessage] = useState<string>('');

  const adminLocationRef = useRef<{ DiaDanh3C: string; Xa: string; Tinh: string }>({
    DiaDanh3C: '',
    Xa: '',
    Tinh: '',
  });

  // Query administrative location (DiaDanh3C, Xa, Tinh) whenever markerLocation changes or modal opens
  useEffect(() => {
    if (!isOpen) {
      adminLocationRef.current = { DiaDanh3C: '', Xa: '', Tinh: '' };
      return;
    }

    if (!markerLocation) return;

    let isCancelled = false;
    findCommunesAtLatLng(markerLocation.lat, markerLocation.lng)
      .then((res) => {
        if (isCancelled) return;
        const diaDanh3C = res.oldCommune?.formattedText || '';
        const xa = res.newCommune?.xaMoi || '';
        const tinh = res.newCommune?.tinhMoi || '';

        adminLocationRef.current = { DiaDanh3C: diaDanh3C, Xa: xa, Tinh: tinh };

        setFormValues((prev) => {
          const updated = { ...prev };
          let changed = false;
          if (diaDanh3C && (!updated['DiaDanh3C'] || updated['DiaDanh3C'] === '')) {
            updated['DiaDanh3C'] = diaDanh3C;
            changed = true;
          }
          if (xa && (!updated['Xa'] || updated['Xa'] === '')) {
            updated['Xa'] = xa;
            changed = true;
          }
          if (tinh && (!updated['Tinh'] || updated['Tinh'] === '')) {
            updated['Tinh'] = tinh;
            changed = true;
          }
          return changed ? updated : prev;
        });
      })
      .catch((err) => {
        console.warn('Tra cứu địa danh cho feature thất bại:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, markerLocation]);

  // Find next sequential OBJECTID for a layer
  const getNextObjectIdForLayer = (layerId: string) => {
    let maxId = 0;
    mapFeatures
      .filter((f) => f.layerId === layerId)
      .forEach((f) => {
        const idVal =
          f.properties?.OBJECTID ??
          f.properties?.objectid ??
          f.properties?.ObjectID ??
          f.id;
        const num = Number(idVal);
        if (!isNaN(num) && num > maxId && num < 100000000) {
          maxId = num;
        }
      });
    return String(maxId > 0 ? maxId + 1 : 1);
  };

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      const startLayerId =
        initialLayerId && layers.some((l) => l.id === initialLayerId)
          ? initialLayerId
          : layers.length > 0
          ? layers[0].id
          : 'layer1_tim_kiem';
      setSelectedLayerId(startLayerId);

      const nextId = getNextObjectIdForLayer(startLayerId);
      setObjectId(nextId);

      const schema = getSchemaForLayer(startLayerId);
      const initialValues: Record<string, any> = {};
      schema.forEach((field) => {
        if (field.name === 'OBJECTID') return;
        if (field.name === 'Ten' && initialName) {
          initialValues[field.name] = initialName;
        } else if (field.name === 'PhanLoai') {
          initialValues[field.name] = 1;
        } else if (field.name === 'ToaDo' && markerLocation) {
          initialValues[field.name] = `${markerLocation.lat.toFixed(6)}, ${markerLocation.lng.toFixed(6)}`;
        } else if (field.name === 'DiaDanh3C' && adminLocationRef.current.DiaDanh3C) {
          initialValues[field.name] = adminLocationRef.current.DiaDanh3C;
        } else if (field.name === 'Xa' && adminLocationRef.current.Xa) {
          initialValues[field.name] = adminLocationRef.current.Xa;
        } else if (field.name === 'Tinh' && adminLocationRef.current.Tinh) {
          initialValues[field.name] = adminLocationRef.current.Tinh;
        } else if (field.name === 'CapNhat') {
          initialValues[field.name] = new Date().toISOString().split('T')[0];
        } else if (field.name === 'NguoiSua') {
          initialValues[field.name] = currentUser?.displayName || currentUser?.username || 'Bản đồ qk5';
        } else {
          initialValues[field.name] = '';
        }
      });
      setFormValues(initialValues);
      setErrorMessage('');
    }
  }, [isOpen, layers, markerLocation, initialName, initialLayerId]);

  // When layer changes, update schema fields and auto-calculate next OBJECTID
  const handleLayerChange = (newLayerId: string) => {
    setSelectedLayerId(newLayerId);
    const nextId = getNextObjectIdForLayer(newLayerId);
    setObjectId(nextId);

    const schema = getSchemaForLayer(newLayerId);
    const updatedValues: Record<string, any> = { ...formValues };
    schema.forEach((field) => {
      if (field.name === 'OBJECTID') return;
      if (!(field.name in updatedValues) || updatedValues[field.name] === undefined || updatedValues[field.name] === '') {
        if (field.name === 'PhanLoai') {
          if (updatedValues[field.name] === undefined) updatedValues[field.name] = 1;
        } else if (field.name === 'ToaDo' && markerLocation) {
          if (!updatedValues[field.name]) updatedValues[field.name] = `${markerLocation.lat.toFixed(6)}, ${markerLocation.lng.toFixed(6)}`;
        } else if (field.name === 'DiaDanh3C' && adminLocationRef.current.DiaDanh3C) {
          if (!updatedValues[field.name]) updatedValues[field.name] = adminLocationRef.current.DiaDanh3C;
        } else if (field.name === 'Xa' && adminLocationRef.current.Xa) {
          if (!updatedValues[field.name]) updatedValues[field.name] = adminLocationRef.current.Xa;
        } else if (field.name === 'Tinh' && adminLocationRef.current.Tinh) {
          if (!updatedValues[field.name]) updatedValues[field.name] = adminLocationRef.current.Tinh;
        } else if (field.name === 'CapNhat') {
          if (!updatedValues[field.name]) updatedValues[field.name] = new Date().toISOString().split('T')[0];
        } else if (field.name === 'NguoiSua') {
          if (!updatedValues[field.name]) updatedValues[field.name] = currentUser?.displayName || currentUser?.username || 'Bản đồ qk5';
        } else if (!(field.name in updatedValues)) {
          updatedValues[field.name] = '';
        }
      }
    });
    setFormValues(updatedValues);
    setErrorMessage('');
  };

  const handleInputChange = (fieldName: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
    if (errorMessage) setErrorMessage('');
  };

  const handleSave = () => {
    if (!markerLocation) {
      setErrorMessage('Chưa có vị trí điểm đánh dấu trên bản đồ');
      return;
    }

    const tenValue = formValues['Ten'] ? String(formValues['Ten']).trim() : '';
    if (!tenValue) {
      setErrorMessage('Vui lòng nhập Tên đối tượng');
      return;
    }

    const currentLayer = layers.find((l) => l.id === selectedLayerId);
    const isKhuVucQuyTap =
      selectedLayerId === 'layer1_tim_kiem' ||
      selectedLayerId === 'layer4_khu_vuc_quy_tap' ||
      currentLayer?.type === 'polygon' ||
      (currentLayer?.name || '').toLowerCase().includes('quy tập') ||
      (currentLayer?.name || '').toLowerCase().includes('tìm kiếm');

    const numericObjectId = !isNaN(Number(objectId)) ? Number(objectId) : objectId;
    const finalProps: Record<string, any> = {
      ...formValues,
      OBJECTID: numericObjectId,
      Ten: tenValue,
      NguoiSua: currentUser?.displayName || currentUser?.username || 'Bản đồ qk5',
      CapNhat: new Date().toISOString(),
    };

    if (markerLocation && !finalProps['ToaDo']) {
      finalProps['ToaDo'] = `${markerLocation.lat.toFixed(6)}, ${markerLocation.lng.toFixed(6)}`;
    }
    if (adminLocationRef.current.DiaDanh3C && !finalProps['DiaDanh3C']) {
      finalProps['DiaDanh3C'] = adminLocationRef.current.DiaDanh3C;
    }
    if (adminLocationRef.current.Xa && !finalProps['Xa']) {
      finalProps['Xa'] = adminLocationRef.current.Xa;
    }
    if (adminLocationRef.current.Tinh && !finalProps['Tinh']) {
      finalProps['Tinh'] = adminLocationRef.current.Tinh;
    }

    let geometryType: 'Polygon' | 'Point' = 'Point';
    let coordinates: any;

    if (isKhuVucQuyTap) {
      // Regular pentagon polygon with diameter 300m (radius 150m) centered at marker
      geometryType = 'Polygon';
      const pentagonRing = generateRegularPolygonCoordinates(
        markerLocation.lat,
        markerLocation.lng,
        150, // radius = 150m (diameter 300m)
        5    // 5 vertices for pentagon
      );
      coordinates = [pentagonRing];
    } else {
      geometryType = 'Point';
      coordinates = [markerLocation.lng, markerLocation.lat];
    }

    const cleanCode = `${getLayerCodePrefix(selectedLayerId)}-${objectId}`;
    const newFeature: GeoJsonFeatureItem = {
      id: `feat_${selectedLayerId}_${objectId}_${Date.now()}`,
      layerId: selectedLayerId,
      name: tenValue,
      code: cleanCode,
      type: geometryType,
      coordinates,
      properties: finalProps,
      updatedAt: new Date().toISOString(),
    };

    onSave(newFeature);
    onClose();
  };

  if (!isOpen) return null;

  const currentSchema: FieldDefinition[] = getSchemaForLayer(selectedLayerId).filter(
    (f) => f.name !== 'OBJECTID'
  );

  return (
    <div className="fixed inset-0 z-[2500] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/30 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 leading-tight">
                Thêm đối tượng mới
              </h3>
              {markerLocation && (
                <p className="text-[11px] text-slate-400">
                  Tọa độ marker:{' '}
                  <span className="font-mono text-emerald-300">
                    {markerLocation.lat.toFixed(6)}, {markerLocation.lng.toFixed(6)}
                  </span>
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mx-5 mt-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Table */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800 text-slate-200 uppercase text-[10px] font-black tracking-wider">
                  <th className="py-2.5 px-3 border-r border-slate-700 w-2/5">Tên trường</th>
                  <th className="py-2.5 px-3">Giá trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium text-slate-800">
                {/* Dòng 1: Combo chọn lớp */}
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-2.5 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Lớp dữ liệu</span>
                      <span className="text-red-500">*</span>
                    </span>
                  </td>
                  <td className="py-1.5 px-3">
                    <select
                      value={selectedLayerId}
                      onChange={(e) => handleLayerChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      {layers.map((layer) => (
                        <option key={layer.id} value={layer.id}>
                          {layer.name} ({layer.type === 'polygon' ? 'Polygon' : 'Point'})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>

                {/* Dòng 2: Mã số */}
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="py-2.5 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700">
                    <span>Mã số</span>
                    <span className="text-red-500 ml-0.5">*</span>
                  </td>
                  <td className="py-1.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-600 text-[11px] shrink-0 select-none">
                        {getLayerCodePrefix(selectedLayerId)}-
                      </span>
                      <input
                        type="text"
                        value={objectId}
                        onChange={(e) => setObjectId(e.target.value)}
                        placeholder="Số thứ tự..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </td>
                </tr>

                {/* Các dòng còn lại: Tùy lớp mà hiển thị các trường khác nhau theo đúng thứ tự 4 nhóm */}
                {currentSchema
                  .filter((field) => field.name !== 'OBJECTID')
                  .map((field) => {
                  const fieldVal = formValues[field.name] ?? '';
                  const isTenField = field.name === 'Ten';

                  return (
                    <tr key={field.name} className="hover:bg-slate-50/80 transition">
                      <td className="py-2 px-3 border-r border-slate-200 font-bold bg-slate-50 text-slate-700 align-top">
                        <span>{field.alias || field.name}</span>
                        {isTenField && <span className="text-red-500 ml-0.5">*</span>}
                      </td>
                      <td className="py-1.5 px-3">
                        {field.name === 'PhanLoai' ? (
                          <select
                            value={fieldVal || 1}
                            onChange={(e) => handleInputChange(field.name, Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                          >
                            {Object.entries(PHAN_LOAI_COLORS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                        ) : field.name === 'GhiChu' || field.name === 'MoTa' || field.name === 'ThongTin' ? (
                          <textarea
                            rows={2}
                            value={fieldVal}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            placeholder={`Nhập ${field.alias.toLowerCase()}...`}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                          />
                        ) : field.type === 'Integer' || field.type === 'SmallInteger' ? (
                          <input
                            type="number"
                            value={fieldVal}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            placeholder={`Nhập ${field.alias.toLowerCase()}...`}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        ) : field.type === 'Date' ? (
                          <input
                            type="date"
                            value={fieldVal}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={fieldVal}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            placeholder={`Nhập ${field.alias.toLowerCase()}...`}
                            className={`w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none ${
                              isTenField ? 'font-bold text-slate-900' : ''
                            }`}
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

        {/* Footer Actions */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer flex items-center justify-center"
            title="Hủy"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition cursor-pointer flex items-center justify-center"
            title="Lưu đối tượng"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
