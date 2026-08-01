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

  // Xã (phường)
  xa: 'Xã (phường)',
  Xa: 'Xã (phường)',
  xaphuong: 'Xã (phường)',
  XaPhuong: 'Xã (phường)',
  xa_phuong: 'Xã (phường)',
  phuong: 'Xã (phường)',
  Phuong: 'Xã (phường)',
  phuong_xa: 'Xã (phường)',

  // Tỉnh (TP)
  tinh: 'Tỉnh (TP)',
  Tinh: 'Tỉnh (TP)',
  tinhtp: 'Tỉnh (TP)',
  TinhTP: 'Tỉnh (TP)',
  tinh_tp: 'Tỉnh (TP)',
  TINH_TP: 'Tỉnh (TP)',
  tinh_thanh: 'Tỉnh (TP)',

  // Huyện / Quận
  huyen: 'Huyện (quận)',
  Huyen: 'Huyện (quận)',
  quanhuyen: 'Huyện (quận)',
  QuanHuyen: 'Huyện (quận)',
  quan_huyen: 'Huyện (quận)',

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
 * Checks custom dictionary first, then built-in default map,
 * then case-insensitive variants.
 */
export function getFieldAlias(key: string, customMap?: Record<string, string>): string {
  if (!key) return '';

  const activeCustom = customMap || getCustomAliasMap();

  // 1. Direct match in custom user dictionary
  if (activeCustom[key]) return activeCustom[key];

  // 2. Direct match in default dictionary
  if (DEFAULT_FIELD_ALIASES[key]) return DEFAULT_FIELD_ALIASES[key];

  // 3. Lowercase match
  const lower = key.toLowerCase();
  if (activeCustom[lower]) return activeCustom[lower];
  if (DEFAULT_FIELD_ALIASES[lower]) return DEFAULT_FIELD_ALIASES[lower];

  // 4. Normalized clean key (stripped special chars)
  const cleanKey = lower.replace(/[^a-z0-9]/g, '');
  if (activeCustom[cleanKey]) return activeCustom[cleanKey];
  if (DEFAULT_FIELD_ALIASES[cleanKey]) return DEFAULT_FIELD_ALIASES[cleanKey];

  return key; // Fallback to raw key if no alias found
}

/**
 * Get merged full list of alias rules for display in mapping table UI
 */
export function getAllAliasRules(customMap?: Record<string, string>): FieldAliasRule[] {
  const activeCustom = customMap || getCustomAliasMap();
  const merged: Record<string, string> = { ...DEFAULT_FIELD_ALIASES, ...activeCustom };

  const rules: FieldAliasRule[] = [];
  const seenAliases = new Set<string>();

  Object.entries(merged).forEach(([key, alias]) => {
    // Avoid cluttering UI table with redundant lowercase duplicates
    const uniqueId = `${key.toLowerCase()}_${alias}`;
    if (!seenAliases.has(uniqueId)) {
      seenAliases.add(uniqueId);
      rules.push({ key, alias });
    }
  });

  return rules;
}
