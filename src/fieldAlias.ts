/**
 * Central Field Alias Mapping Dictionary for GIS Layers
 * Allows mapping raw GeoJSON property key names (e.g., TimDuoc, ChuaThay, Xa, Tinh)
 * to clean, human-readable Vietnamese labels (e.g., "Đã quy tập", "Chưa tìm thấy", "Xã (phường)").
 */

export interface FieldAliasRule {
  key: string;       // Original field key (e.g., "TimDuoc", "ChuaThay")
  alias: string;     // Friendly display alias (e.g., "Đã quy tập", "Chưa tìm thấy")
  description?: string;
}

// Built-in default dictionary rules
export const DEFAULT_FIELD_ALIASES: Record<string, string> = {
  // Đã quy tập & Chưa tìm thấy
  timduoc: 'Đã quy tập',
  TimDuoc: 'Đã quy tập',
  tim_duoc: 'Đã quy tập',
  chuathay: 'Chưa tìm thấy',
  ChuaThay: 'Chưa tìm thấy',
  chua_thay: 'Chưa tìm thấy',
  daquytap: 'Đã quy tập',
  DaQuyTap: 'Đã quy tập',
  da_quytap: 'Đã quy tập',
  quytap: 'Đã quy tập',
  chuatimthay: 'Chưa tìm thấy',
  ChuaTimThay: 'Chưa tìm thấy',
  chua_timthay: 'Chưa tìm thấy',

  // Tên
  ten: 'Tên',
  Ten: 'Tên',
  TEN: 'Tên',
  name: 'Tên',
  Name: 'Tên',
  NAME: 'Tên',
  t_ten: 'Tên',
  t_Ten: 'Tên',
  tendiadiem: 'Tên địa điểm',
  TenDiaDiem: 'Tên địa điểm',
  tenkhuvuc: 'Tên khu vực',
  TenKhuVuc: 'Tên khu vực',
  ten_khu_vuc: 'Tên khu vực',

  // Địa điểm / Địa chỉ / Vị trí
  diadiem: 'Địa điểm',
  DiaDiem: 'Địa điểm',
  dia_diem: 'Địa điểm',
  DIADIEM: 'Địa điểm',
  diachi: 'Địa chỉ',
  DiaChi: 'Địa chỉ',
  dia_chi: 'Địa chỉ',
  vitri: 'Vị trí',
  ViTri: 'Vị trí',
  vi_tri: 'Vị trí',
  location: 'Địa điểm',
  Location: 'Địa điểm',

  // Phân loại
  phanloai: 'Phân loại',
  PhanLoai: 'Phân loại',
  PHANLOAI: 'Phân loại',
  phan_loai: 'Phân loại',
  type: 'Phân loại',

  // Mã số
  OBJECTID: "Mã số",
  code: 'Mã số',
  Code: 'Mã số',
  CODE: 'Mã số',
  ma: 'Mã số',
  Ma: 'Mã số',
  masu: 'Mã số',
  MaSo: 'Mã số',
  ma_so: 'Mã số',

  // Xã phường
  xa: 'Xã phường',
  Xa: 'Xã phường',
  xaphuong: 'Xã phường',
  XaPhuong: 'Xã phường',
  xa_phuong: 'Xã phường',
  phuong: 'Xã phường',
  Phuong: 'Xã phường',
  phuong_xa: 'Xã phường',

  // Tỉnh thành
  tinh: 'Tỉnh thành',
  Tinh: 'Tỉnh thành',
  tinhtp: 'Tỉnh thành',
  TinhTP: 'Tỉnh thành',
  tinh_tp: 'Tỉnh thành',
  TINH_TP: 'Tỉnh thành',
  tinh_thanh: 'Tỉnh thành',

  // Huyện quận
  huyen: 'Huyện quận',
  Huyen: 'Huyện quận',
  quanhuyen: 'Huyện quận',
  QuanHuyen: 'Huyện quận',
  quan_huyen: 'Huyện quận',

  // Tọa độ
  toado: 'Tọa độ',
  ToaDo: 'Tọa độ',
  TOA_DO: 'Tọa độ',
  toa_do: 'Tọa độ',
  coordinates: 'Tọa độ',

  // Thông tin Liệt sĩ / Quân khu
  hoten: 'Họ và tên',
  HoTen: 'Họ và tên',
  ho_ten: 'Họ và tên',
  quequan: 'Quê quán',
  QueQuan: 'Quê quán',
  que_quan: 'Quê quán',
  donvi: 'Đơn vị',
  DonVi: 'Đơn vị',
  don_vi: 'Đơn vị',
  namsinh: 'Năm sinh',
  NamSinh: 'Năm sinh',
  nam_sinh: 'Năm sinh',
  hysinh: 'Năm hy sinh',
  HySinh: 'Năm hy sinh',
  hy_sinh: 'Năm hy sinh',
  soluong: 'Số lượng',
  SoLuong: 'Số lượng',
  so_luong: 'Số lượng',
  ghichu: 'Ghi chú',
  GhiChu: 'Ghi chú',
  ghi_chu: 'Ghi chú',
  thoigian: 'Thời gian',
  ThoiGian: 'Thời gian',
  thoi_gian: 'Thời gian',
};

import { saveFieldAliasDictionaryToFirestore } from './firebaseService';

const STORAGE_KEY = 'gis_field_alias_dictionary';

/**
 * Get user-defined field aliases from LocalStorage
 */
export function getCustomAliasMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Lỗi đọc danh sách ánh xạ tên trường:', e);
  }
  return {};
}

/**
 * Save user-defined field alias map to LocalStorage and sync to Firestore
 */
export function saveCustomAliasMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Lỗi lưu danh sách ánh xạ tên trường:', e);
  }
  // Sync to Firestore for multi-device & all accounts
  saveFieldAliasDictionaryToFirestore(map).catch((err) =>
    console.warn('Lỗi đồng bộ bảng ánh xạ lên Firestore:', err)
  );
}

/**
 * Lookup alias for a given raw property key name.
 * Returns the mapped friendly Vietnamese alias if found, or null if the key is not in the mapping dictionary.
 */
export function getFieldAlias(key: string, customMap?: Record<string, string>): string | null {
  if (!key) return null;

  const activeCustom = customMap || getCustomAliasMap();

  // 0. Explicit deletion check in custom map
  if (activeCustom[key] === '__DELETED__') return null;

  // 1. Direct match in custom user dictionary
  if (activeCustom[key] && activeCustom[key] !== '__DELETED__') return activeCustom[key];

  const lower = key.toLowerCase();
  const cleanKey = lower.replace(/[^a-z0-9]/g, '');

  if (activeCustom[lower] === '__DELETED__' || activeCustom[cleanKey] === '__DELETED__') return null;

  // 2. Direct match in default dictionary if not deleted
  if (DEFAULT_FIELD_ALIASES[key]) return DEFAULT_FIELD_ALIASES[key];

  // 3. Lowercase / clean match in custom dictionary
  if (activeCustom[lower] && activeCustom[lower] !== '__DELETED__') return activeCustom[lower];
  if (activeCustom[cleanKey] && activeCustom[cleanKey] !== '__DELETED__') return activeCustom[cleanKey];

  // 4. Lowercase / clean match in default dictionary
  if (DEFAULT_FIELD_ALIASES[lower]) return DEFAULT_FIELD_ALIASES[lower];
  if (DEFAULT_FIELD_ALIASES[cleanKey]) return DEFAULT_FIELD_ALIASES[cleanKey];

  // 5. Deep case-insensitive & clean-key match in custom dictionary
  for (const [cKey, cAlias] of Object.entries(activeCustom)) {
    if (cAlias === '__DELETED__') continue;
    const cLower = cKey.toLowerCase();
    const cClean = cLower.replace(/[^a-z0-9]/g, '');
    if (cLower === lower || (cClean && cClean === cleanKey)) {
      return cAlias;
    }
  }

  // 6. Deep case-insensitive & clean-key match in default dictionary
  for (const [dKey, dAlias] of Object.entries(DEFAULT_FIELD_ALIASES)) {
    const dLower = dKey.toLowerCase();
    const dClean = dLower.replace(/[^a-z0-9]/g, '');
    if (dLower === lower || (dClean && dClean === cleanKey)) {
      if (
        activeCustom[dKey] === '__DELETED__' ||
        activeCustom[dLower] === '__DELETED__' ||
        activeCustom[dClean] === '__DELETED__'
      ) {
        return null;
      }
      return dAlias;
    }
  }

  return null; // Not found in mapping table
}

/**
 * Get merged full list of alias rules for display in mapping table UI
 */
export function getAllAliasRules(customMap?: Record<string, string>): FieldAliasRule[] {
  const activeCustom = customMap || getCustomAliasMap();

  const rules: FieldAliasRule[] = [];
  const seenAliases = new Set<string>();

  // 1. Process defaults first (skipping any deleted by user)
  Object.entries(DEFAULT_FIELD_ALIASES).forEach(([key, alias]) => {
    if (
      activeCustom[key] === '__DELETED__' ||
      activeCustom[key.toLowerCase()] === '__DELETED__'
    ) {
      return;
    }
    // If custom map defines a non-deleted alias for this key, custom map entry will handle it
    if (activeCustom[key] && activeCustom[key] !== '__DELETED__') {
      return;
    }
    const uniqueId = `${key.toLowerCase()}_${alias}`;
    if (!seenAliases.has(uniqueId)) {
      seenAliases.add(uniqueId);
      rules.push({ key, alias });
    }
  });

  // 2. Process custom entries
  Object.entries(activeCustom).forEach(([key, alias]) => {
    if (!alias || alias === '__DELETED__') return;
    const uniqueId = `${key.toLowerCase()}_${alias}`;
    if (!seenAliases.has(uniqueId)) {
      seenAliases.add(uniqueId);
      rules.push({ key, alias });
    }
  });

  return rules;
}

/**
 * Utility to extract OBJECTID value from a feature item or properties dictionary.
 */
export function extractObjectId(feature: any): string | null {
  if (!feature) return null;
  const props = feature.properties || feature;
  const val =
    props.OBJECTID ??
    props.objectid ??
    props.ObjectId ??
    props.objectId ??
    props.OBJECT_ID ??
    props.Object_Id ??
    props.code ??
    feature.code;

  if (val !== undefined && val !== null && String(val).trim() !== '') {
    return String(val).trim();
  }
  return null;
}

/**
 * Utility to compute a unique key for a map feature based on layerId + OBJECTID or id.
 */
export function getItemUniqueKey(feat: any): string {
  if (!feat) return 'default_unknown';
  const layerId = feat.layerId || 'default';
  const objId = extractObjectId(feat);
  if (objId) {
    return `${layerId}_objid_${objId.toLowerCase()}`;
  }
  return `${layerId}_id_${String(feat.id || '').toLowerCase()}`;
}

/**
 * Utility to deduplicate a list of GeoJsonFeatureItems by layerId + OBJECTID or id.
 * Prefers keeping the feature with the newer updatedAt date (or last in list if equal).
 */
export function deduplicateFeaturesList<T extends { id?: string | number; layerId?: string; updatedAt?: string; properties?: any; code?: string }>(
  features: T[]
): T[] {
  if (!features || features.length <= 1) return features || [];

  const map = new Map<string, T>();

  features.forEach((feat) => {
    const key = getItemUniqueKey(feat);

    if (!map.has(key)) {
      map.set(key, feat);
    } else {
      const existing = map.get(key)!;
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const featTime = feat.updatedAt ? new Date(feat.updatedAt).getTime() : 0;

      // Keep newer item (or if equal timestamp, keep feat)
      if (featTime >= existingTime) {
        map.set(key, feat);
      }
    }
  });

  return Array.from(map.values());
}

