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
  mota: 'Mô tả',
  MoTa: 'Mô tả',
  mo_ta: 'Mô tả',
  thoigian: 'Thời gian',
  ThoiGian: 'Thời gian',
  thoi_gian: 'Thời gian',

  // Thông tin Trận đánh & Chiến dịch
  benta: 'Bên ta',
  BenTa: 'Bên ta',
  ben_ta: 'Bên ta',
  BENTA: 'Bên ta',
  benta_lucluong: 'Lực lượng Bên ta',
  lucluongbenta: 'Lực lượng Bên ta',
  LucLuongBenTa: 'Lực lượng Bên ta',
  chihuybenta: 'Chỉ huy Bên ta',
  ChiHuyBenTa: 'Chỉ huy Bên ta',
  bendich: 'Bên địch',
  BenDich: 'Bên địch',
  ben_dich: 'Bên địch',
  BENDICH: 'Bên địch',
  bendich_lucluong: 'Lực lượng Bên địch',
  lucluongbendich: 'Lực lượng Bên địch',
  LucLuongBenDich: 'Lực lượng Bên địch',
  chihuybendich: 'Chỉ huy Bên địch',
  ChiHuyBenDich: 'Chỉ huy Bên địch',
  chihuy: 'Chỉ huy',
  ChiHuy: 'Chỉ huy',
  chi_huy: 'Chỉ huy',
  ketqua: 'Kết quả',
  KetQua: 'Kết quả',
  ket_qua: 'Kết quả',
  thiethai: 'Thiệt hại',
  ThietHai: 'Thiệt hại',
  thiet_hai: 'Thiệt hại',
  lucluong: 'Lực lượng',
  LucLuong: 'Lực lượng',
  luc_luong: 'Lực lượng',
  trandanh: 'Trận đánh',
  TranDanh: 'Trận đánh',
  tran_danh: 'Trận đánh',
  chiendich: 'Chiến dịch',
  ChienDich: 'Chiến dịch',
  chien_dich: 'Chiến dịch',
  dienbien: 'Diễn biến',
  DienBien: 'Diễn biến',
  dien_bien: 'Diễn biến',
  ynghia: 'Ý nghĩa lịch sử',
  YNghia: 'Ý nghĩa lịch sử',
  y_nghia: 'Ý nghĩa lịch sử',
  nhiemvu: 'Nhiệm vụ',
  NhiemVu: 'Nhiệm vụ',
  nhiem_vu: 'Nhiệm vụ',
  muctieu: 'Mục tiêu',
  MucTieu: 'Mục tiêu',
  muc_tieu: 'Mục tiêu',
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
export async function saveCustomAliasMap(map: Record<string, string>): Promise<boolean> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Lỗi lưu danh sách ánh xạ tên trường:', e);
  }
  // Sync directly to Firestore
  return await saveFieldAliasDictionaryToFirestore(map);
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

export function sanitizeFeatureProperties<T extends { properties?: any }>(feat: T): T {
  if (!feat || !feat.properties) return feat;
  const props = { ...feat.properties };
  delete props['TrangThaiMoi'];
  delete props['trang_thai_moi'];
  delete props['trangthaimoi'];
  delete props['ChiHuy'];
  delete props['chihuy'];
  delete props['chi_huy'];
  delete props['KetQua'];
  delete props['ketqua'];
  delete props['ket_qua'];
  return { ...feat, properties: props };
}

/**
 * Utility to deduplicate a list of GeoJsonFeatureItems by layerId + OBJECTID or id.
 * Prefers keeping the feature with the newer updatedAt date (or last in list if equal).
 */
export function deduplicateFeaturesList<T extends { id?: string | number; layerId?: string; updatedAt?: string; properties?: any; code?: string }>(
  features: T[]
): T[] {
  if (!features || features.length === 0) return [];

  const map = new Map<string, T>();

  features.forEach((rawFeat) => {
    const feat = sanitizeFeatureProperties(rawFeat);
    const key = getItemUniqueKey(feat);

    if (!map.has(key)) {
      map.set(key, feat);
    } else {
      const existing = map.get(key)!;
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() || 0 : 0;
      const featTime = feat.updatedAt ? new Date(feat.updatedAt).getTime() || 0 : 0;

      // Keep newer item (or if equal timestamp or invalid timestamp, keep feat as it comes later)
      if (isNaN(featTime) || isNaN(existingTime) || featTime >= existingTime) {
        map.set(key, feat);
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Calculate numerical priority score for field key or alias.
 * Lower numbers appear higher in the attribute table.
 * Calculate numerical priority score for field key or alias.
 * Lower numbers appear higher in the attribute table.
 * Groups fields by logical importance requested by user:
 * 1. Quan trọng: ID, Tên, Phân loại, Hiện trạng (10 - 30)
 * 2. Chuyên biệt: Các trường đặc hiệu từng lớp (Bên ta, Bên địch, Quy tập, Công trình, Tìm thấy, Chưa thấy...) (40 - 65)
 * 3. Thời gian, Địa điểm, Địa danh, Vị trí, Tọa độ (80 - 95)
 * 4. Thông tin khác: Thuộc tính tùy biến mở rộng khác (150)
 * 5. Thông tin bổ trợ: Đơn vị, Nguồn tư liệu, Thời gian cập nhật, Ghi chú, Mô tả (200 - 230)
 */
export function getFieldPriorityScore(rawKey: string, aliasLabel: string): number {
  const k = (rawKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = (aliasLabel || '').toLowerCase();

  // Mức 1: Quan trọng (Tên, ID, Phân loại, Hiện trạng)
  if (k === 'objectid' || k === 'objectid1' || k === 'code' || k === 'maso' || a.includes('mã số') || a.includes('mã đối tượng')) return 10;
  if (k === 'ten' || k === 'name' || k === 'tendiadiem' || k === 'tenkhuvuc' || a.includes('tên')) return 20;
  if (k === 'phanloai' || k === 'type' || k === 'hientrang' || a.includes('phân loại') || a.includes('hiện trạng')) return 30;

  // Mức 2: Chuyên biệt (mang tính đặc hiệu của từng lớp)
  // Lớp Các trận đánh, chiến dịch
  if (k === 'benta' || a.includes('bên ta')) return 40;
  if (k === 'bendich' || a.includes('bên địch')) return 41;
  if (k === 'lucluong' || a.includes('lực lượng')) return 42;
  if (k === 'nhiemvu' || a.includes('nhiệm vụ')) return 43;
  if (k === 'dienbien' || a.includes('diễn biến')) return 44;
  if (k === 'ynghia' || a.includes('ý nghĩa')) return 45;
  if (k === 'muctieu' || a.includes('mục tiêu')) return 46;
  if (k === 'trandanh' || a.includes('trận đánh')) return 47;
  if (k === 'chiendich' || a.includes('chiến dịch')) return 48;

  // Lớp Liệt sĩ / Tìm kiếm quy tập
  if (k === 'hoten' || a.includes('họ và tên') || a.includes('họ tên')) return 50;
  if (k === 'namsinh' || a.includes('năm sinh')) return 51;
  if (k === 'hysinh' || a.includes('hy sinh')) return 52;
  if (k === 'quequan' || a.includes('quê quán')) return 53;
  if (k === 'quytap' || a.includes('quy tập')) return 54;
  if (k === 'congtrinh' || a.includes('công trình')) return 55;
  if (k === 'timduoc' || k === 'timthay' || k === 'daquytap' || a.includes('tìm được') || a.includes('tìm thấy') || a.includes('đã quy tập')) return 56;
  if (k === 'chuathay' || k === 'chuatimthay' || a.includes('chưa thấy') || a.includes('chưa tìm thấy')) return 57;
  if (k === 'soluong' || a.includes('số lượng')) return 58;
  if (k === 'thiethai' || a.includes('thiệt hại')) return 59;

  // Mức 3: Thời gian, địa điểm, địa danh, vị trí, tọa độ
  if (k === 'thoigian' || a.includes('thời gian')) return 80;
  if (k === 'diadiem' || k === 'diachi' || a.includes('địa điểm') || a.includes('địa chỉ')) return 81;
  if (k === 'tinh' || k === 'tinhtp' || a.includes('tỉnh')) return 82;
  if (k === 'huyen' || k === 'quanhuyen' || a.includes('huyện') || a.includes('quận')) return 83;
  if (k === 'xa' || k === 'xaphuong' || a.includes('xã') || a.includes('phường')) return 84;
  if (k === 'diadanh2c' || a.includes('địa danh 2')) return 85;
  if (k === 'diadanh3c' || a.includes('địa danh 3')) return 86;
  if (k === 'vitri' || k === 'location' || a.includes('vị trí')) return 87;
  if (k === 'toado' || k === 'coordinates' || a.includes('tọa độ')) return 88;

  // Mức 5: Thông tin bổ trợ (Đơn vị, Nguồn tư liệu, Ngày cập nhật, Ghi chú, Mô tả)
  if (k === 'donvi' || a.includes('đơn vị')) return 200;
  if (k === 'nguon' || k === 'nguontulieu' || a.includes('nguồn')) return 205;
  if (k === 'capnhat' || k === 'ngaycapnhat' || k === 'updatedat' || a.includes('cập nhật')) return 210;
  if (k === 'ghichu' || k === 'mota' || k === 'description' || a.includes('ghi chú') || a.includes('mô tả')) return 220;
  if (k === 'status' || k === 'createdby' || k === 'editornotes') return 230;

  // Mức 4: Thông tin khác
  return 150;
}

/**
 * Sort array of property row items according to field priority score logic.
 */
export function sortPropertyRows<T extends { rawKey?: string; key?: string; aliasLabel?: string }>(rows: T[]): T[] {
  if (!rows || rows.length <= 1) return rows;
  return [...rows].sort((a, b) => {
    const keyA = a.rawKey || a.key || '';
    const keyB = b.rawKey || b.key || '';
    const aliasA = a.aliasLabel || getFieldAlias(keyA) || keyA;
    const aliasB = b.aliasLabel || getFieldAlias(keyB) || keyB;

    const scoreA = getFieldPriorityScore(keyA, aliasA);
    const scoreB = getFieldPriorityScore(keyB, aliasB);

    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }
    // Tie breaker: alphabetical order of alias label
    return aliasA.localeCompare(aliasB, 'vi');
  });
}

