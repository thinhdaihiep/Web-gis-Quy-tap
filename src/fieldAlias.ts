import { GeoJsonFeatureItem } from './types';

/**
 * Central Field Alias Mapping Dictionary for GIS Layers
 * Allows mapping raw GeoJSON property key names (e.g., TimDuoc, ChuaThay, Xa, Tinh)
 * to clean, human-readable Vietnamese labels (e.g., "Đã quy tập", "Chưa tìm thấy", "Xã (phường)").
 */

export interface FieldAliasRule {
  key: string;       // Original field key (e.g., "TimDuoc", "ChuaThay")
  alias: string;     // Friendly display alias (e.g., "Đã quy tập", "Chưa tìm thấy")
  visible: boolean;  // Whether field is visible in Popup and Edit forms
  description?: string;
}

// Built-in default dictionary rules (khai báo chuẩn theo Schema 4 lớp dữ liệu)
export const DEFAULT_FIELD_ALIASES: Record<string, string> = {
  // 1. Mã đối tượng / ID
  OBJECTID: 'Mã',

  // 2. Tên đối tượng / Tên mộ
  Ten: 'Tên',

  // 3. Phân loại & Hiện trạng
  PhanLoai: 'Phân loại',
  HienTrang: 'Hiện trạng',

  // 4. Địa giới Hành chính (Xã, Tỉnh, Huyện, Địa danh 3C)
  Xa: 'Xã (Phường)',
  Tinh: 'Tỉnh (TP)',
  Huyen: 'Huyện (Quận)',
  DiaDanh3C: 'Hành chính cũ',

  // 5. Kết quả Quy tập
  TimDuoc: 'Đã tìm được',
  ChuaThay: 'Chưa tìm thấy',
  QuyTap: 'Kết quả quy tập',

  // 6. Thời gian & Cập nhật & Nguồn
  ThoiGian: 'Thời gian',
  CapNhat: 'TG cập nhật',
  NguoiSua: 'Người cập nhật',
  NguoiCapNhat: 'Người cập nhật',
  Nguon: 'Nguồn TT',

  // 7. Địa điểm / Địa chỉ / Tọa độ / Vị trí
  DiaDiem: 'Địa điểm',
  DiaChi: 'Địa chỉ',
  ToaDo: 'Tọa độ',
  ViTri: 'Vị trí',

  // 8. Trận đánh lịch sử & Đơn vị & Lực lượng
  DonVi: 'Đơn vị',
  BenTa: 'Bên ta',
  BenDich: 'Bên địch',
  CongTrinh: 'Công trình lịch sử',
  GhiChu: 'Ghi chú',
  MoTa: 'Mô tả',

  // 9. Mộ liệt sĩ & Nghĩa trang
  ThongTin: 'Thông tin',
  NTID: 'Mã NT',
  DienThoai: 'Điện thoại',
  SoMo: 'Số lượng mộ',
  ThanhLap: 'Năm thành lập',
  MoCoTen: 'Mộ có tên',
  MoVoDanh: 'Mộ vô danh',
  HoTen: 'Họ và tên',
  QueQuan: 'Quê quán',
  NamSinh: 'Năm sinh',
  HySinh: 'Năm hy sinh',
  NgaySinh: 'Ngày sinh',
  NgayMat: 'Ngày mất',
  CapBac: 'Cấp bậc',
  ChucVu: 'Chức vụ',
};

import { saveFieldAliasDictionaryToFirestore } from './firebaseService';

const STORAGE_KEY = 'gis_field_alias_dictionary';
const HIDDEN_STORAGE_KEY = 'gis_hidden_fields_dictionary';

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
 * Get user-defined hidden fields map from LocalStorage.
 * Returns Record<string, boolean> where key is normalized field key and value true means hidden.
 */
export function getHiddenFieldsMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Lỗi đọc danh sách trường ẩn:', e);
  }
  return {};
}

/**
 * Save hidden fields map to LocalStorage
 */
export function saveHiddenFieldsMap(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Lỗi lưu danh sách trường ẩn:', e);
  }
}

/**
 * Check if a given raw property key is configured as hidden.
 */
export function isFieldHidden(key: string, customHiddenMap?: Record<string, boolean>): boolean {
  if (!key) return false;
  const activeHidden = customHiddenMap || getHiddenFieldsMap();

  if (activeHidden[key] === true) return true;

  const lower = key.toLowerCase();
  if (activeHidden[lower] === true) return true;

  const cleanKey = lower.replace(/[^a-z0-9]/g, '');
  if (activeHidden[cleanKey] === true) return true;

  for (const [hKey, isHidden] of Object.entries(activeHidden)) {
    if (!isHidden) continue;
    const hLower = hKey.toLowerCase();
    const hClean = hLower.replace(/[^a-z0-9]/g, '');
    if (hLower === lower || (hClean && hClean === cleanKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Save user-defined field alias map and hidden fields map to LocalStorage and sync to Firestore
 */
export async function saveCustomAliasMap(
  map: Record<string, string>,
  hiddenMap?: Record<string, boolean>
): Promise<boolean> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    if (hiddenMap) {
      saveHiddenFieldsMap(hiddenMap);
    }
  } catch (e) {
    console.error('Lỗi lưu danh sách ánh xạ tên trường:', e);
  }
  // Sync in background without blocking
  saveFieldAliasDictionaryToFirestore(map, hiddenMap || getHiddenFieldsMap()).catch((err) => {
    console.warn('Lỗi đồng bộ Firestore:', err);
  });
  return true;
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
export function getAllAliasRules(
  customMap?: Record<string, string>,
  customHiddenMap?: Record<string, boolean>
): FieldAliasRule[] {
  const activeCustom = customMap || getCustomAliasMap();
  const activeHidden = customHiddenMap || getHiddenFieldsMap();

  const rules: FieldAliasRule[] = [];
  const seenKeys = new Set<string>();

  // 1. Process defaults first (skipping any deleted by user)
  Object.entries(DEFAULT_FIELD_ALIASES).forEach(([key, alias]) => {
    if (
      activeCustom[key] === '__DELETED__' ||
      activeCustom[key.toLowerCase()] === '__DELETED__'
    ) {
      return;
    }
    let activeAlias = alias;
    if (activeCustom[key] && activeCustom[key] !== '__DELETED__') {
      activeAlias = activeCustom[key];
    }
    const uniqueKey = key.toLowerCase();
    if (!seenKeys.has(uniqueKey)) {
      seenKeys.add(uniqueKey);
      rules.push({
        key,
        alias: activeAlias,
        visible: !isFieldHidden(key, activeHidden),
      });
    }
  });

  // 2. Process custom entries that were not in default
  Object.entries(activeCustom).forEach(([key, alias]) => {
    if (!alias || alias === '__DELETED__') return;
    const uniqueKey = key.toLowerCase();
    if (!seenKeys.has(uniqueKey)) {
      seenKeys.add(uniqueKey);
      rules.push({
        key,
        alias,
        visible: !isFieldHidden(key, activeHidden),
      });
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
    props.FID ??
    props.fid;

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
    return `${layerId}_objid_${String(objId).toLowerCase().trim()}`;
  }
  const idStr = feat.id !== undefined && feat.id !== null ? String(feat.id).toLowerCase().trim() : '';
  if (idStr !== '') {
    return `${layerId}_id_${idStr}`;
  }
  const codeStr = feat.code ? String(feat.code).toLowerCase().trim() : '';
  if (codeStr !== '') {
    return `${layerId}_code_${codeStr}`;
  }
  return `${layerId}_id_${String(feat.name || 'unknown').toLowerCase().trim()}`;
}

/**
 * Robust matcher checking if a feature matches targetIdOrKey.
 */
export function isFeatureMatch(feat: any, targetIdOrKey: string | number | null | undefined): boolean {
  if (!targetIdOrKey || !feat) return false;
  const s = String(targetIdOrKey).toLowerCase().trim();
  if (!s) return false;

  const featKey = getItemUniqueKey(feat).toLowerCase().trim();
  if (featKey === s) return true;

  const featIdStr = feat.id !== undefined && feat.id !== null ? String(feat.id).toLowerCase().trim() : '';
  if (featIdStr !== '' && (featIdStr === s || s.endsWith(`_id_${featIdStr}`))) return true;

  const objId = extractObjectId(feat);
  if (objId !== null && objId !== undefined) {
    const objIdStr = String(objId).toLowerCase().trim();
    if (objIdStr !== '' && (objIdStr === s || s.endsWith(`_objid_${objIdStr}`))) return true;
  }

  const codeStr = feat.code ? String(feat.code).toLowerCase().trim() : '';
  if (codeStr !== '' && (codeStr === s || s.endsWith(`_code_${codeStr}`))) return true;

  return false;
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
export function deduplicateFeaturesList<T extends GeoJsonFeatureItem = GeoJsonFeatureItem>(
  features: T[]
): T[] {
  if (!features || features.length === 0) return [];

  const map = new Map<string, T>();

  features.forEach((rawFeat) => {
    if (!rawFeat) return;
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

  // Mức 5: Thông tin bổ trợ (Đơn vị, Nguồn tư liệu, Ngày cập nhật, Người cập nhật, Ghi chú, Mô tả)
  if (k === 'donvi' || a.includes('đơn vị')) return 200;
  if (k === 'nguon' || k === 'nguontulieu' || a.includes('nguồn')) return 205;
  if (k === 'capnhat' || k === 'ngaycapnhat' || k === 'updatedat' || a.includes('tg cập nhật') || a.includes('thời gian cập nhật')) return 210;
  if (k === 'nguoisua' || k === 'nguoicapnhat' || a.includes('người cập nhật') || a.includes('người sửa')) return 211;
  if (k === 'ghichu' || k === 'mota' || k === 'description' || a.includes('ghi chú') || a.includes('mô tả')) return 220;


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

