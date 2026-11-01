/**
 * Schema Geodatabase - Quy tập liệt sĩ
 * Nguồn: Schema_Quy_tap.xml — 4 Feature Class
 */

export interface FieldDefinition {
  name: string;
  alias: string;
  type: 'Integer' | 'SmallInteger' | 'String' | 'Date';
  length?: number;
}

export interface LayerSchema {
  layerId: string;
  layerName: string;
  geometryType: 'Point' | 'Polygon';
  fields: FieldDefinition[];
}

/**
 * 1. Tìm kiếm quy tập (Polygon)
 */
export const TIM_KIEM_QUY_TAP_SCHEMA: FieldDefinition[] = [
  // Nhóm 1: Bắt buộc
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên', type: 'String', length: 255 },
  { name: 'PhanLoai', alias: 'Phân loại', type: 'SmallInteger', length: 2 },
  { name: 'HienTrang', alias: 'Hiện trạng', type: 'String', length: 255 },
  // Nhóm 2: Thông tin chuyên ngành
  { name: 'QuyTap', alias: 'Kết quả quy tập', type: 'String', length: 255 },
  { name: 'TimDuoc', alias: 'Đã tìm được', type: 'SmallInteger', length: 2 },
  { name: 'ChuaThay', alias: 'Chưa tìm thấy', type: 'SmallInteger', length: 2 },
  // Nhóm 3: Bổ trợ thông tin
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (TP)', type: 'String', length: 50 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 30 },
  // Nhóm 4: Bổ trợ dữ liệu
  { name: 'Nguon', alias: 'Nguồn TT', type: 'String', length: 50 },
  { name: 'CapNhat', alias: 'TG cập nhật', type: 'Date', length: 8 },
  { name: 'NguoiSua', alias: 'Người cập nhật', type: 'String', length: 50 },
];

/**
 * 2. Trận đánh lịch sử (Point)
 */
export const TRAN_DANH_LICH_SU_SCHEMA: FieldDefinition[] = [
  // Nhóm 1: Bắt buộc
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên', type: 'String', length: 255 },
  // Nhóm 2: Thông tin chuyên ngành
  { name: 'ThoiGian', alias: 'Thời gian', type: 'String', length: 255 },
  { name: 'BenTa', alias: 'Bên ta', type: 'String', length: 255 },
  { name: 'BenDich', alias: 'Bên địch', type: 'String', length: 255 },
  { name: 'CongTrinh', alias: 'Công trình lịch sử', type: 'String', length: 255 },
  { name: 'QuyTap', alias: 'Kết quả quy tập', type: 'String', length: 255 },
  // Nhóm 3: Bổ trợ thông tin
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (TP)', type: 'String', length: 50 },
  { name: 'DiaDiem', alias: 'Địa điểm', type: 'String', length: 255 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 30 },
  { name: 'DonVi', alias: 'Đơn vị', type: 'String', length: 255 },
  // Nhóm 4: Bổ trợ dữ liệu
  { name: 'Nguon', alias: 'Nguồn TT', type: 'String', length: 50 },
  { name: 'CapNhat', alias: 'TG cập nhật', type: 'Date', length: 8 },
  { name: 'NguoiSua', alias: 'Người cập nhật', type: 'String', length: 50 },
  { name: 'HoSo', alias: 'Hồ sơ', type: 'String', length: 500 },
  { name: 'GhiChu', alias: 'Ghi chú', type: 'String', length: 255 },
];

/**
 * 3. Mộ liệt sĩ (Point)
 */
export const MO_LIET_SI_SCHEMA: FieldDefinition[] = [
  // Nhóm 1: Bắt buộc
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên mộ', type: 'String', length: 50 },
  { name: 'HienTrang', alias: 'Hiện trạng', type: 'String', length: 255 },
  // Nhóm 2: Thông tin chuyên ngành
  { name: 'NTID', alias: 'Mã NT', type: 'Integer', length: 4 },
  { name: 'NgaySinh', alias: 'Ngày sinh', type: 'String', length: 30 },
  { name: 'NgayMat', alias: 'Ngày mất', type: 'String', length: 30 },
  { name: 'CapBac', alias: 'Cấp bậc', type: 'String', length: 50 },
  { name: 'ChucVu', alias: 'Chức vụ', type: 'String', length: 50 },
  // Nhóm 3: Bổ trợ thông tin
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (TP)', type: 'String', length: 50 },
  { name: 'DiaDiem', alias: 'Địa điểm', type: 'String', length: 255 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 30 },
  { name: 'DonVi', alias: 'Đơn vị', type: 'String', length: 50 },
  // Nhóm 4: Bổ trợ dữ liệu
  { name: 'ThongTin', alias: 'Thông tin', type: 'String', length: 255 },
  { name: 'Nguon', alias: 'Nguồn TT', type: 'String', length: 50 },
  { name: 'CapNhat', alias: 'TG Cập nhật', type: 'Date', length: 8 },
  { name: 'NguoiSua', alias: 'Người cập nhật', type: 'String', length: 50 },
  { name: 'GhiChu', alias: 'Ghi chú', type: 'String', length: 255 },
];

/**
 * 4. Nghĩa trang liệt sĩ (Point)
 */
export const NGHIA_TRANG_SCHEMA: FieldDefinition[] = [
  // Nhóm 1: Bắt buộc
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên', type: 'String', length: 70 },
  // Nhóm 2: Thông tin chuyên ngành
  { name: 'SoMo', alias: 'Số lượng mộ', type: 'SmallInteger', length: 2 },
  { name: 'MoCoTen', alias: 'Mộ có tên', type: 'SmallInteger', length: 2 },
  { name: 'MoVoDanh', alias: 'Mộ vô danh', type: 'SmallInteger', length: 2 },
  { name: 'ThanhLap', alias: 'Năm thành lập', type: 'SmallInteger', length: 2 },
  // Nhóm 3: Bổ trợ thông tin
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (Tp)', type: 'String', length: 50 },
  { name: 'DiaChi', alias: 'Địa chỉ', type: 'String', length: 255 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 30 },
  { name: 'DienThoai', alias: 'Điện thoại', type: 'String', length: 15 },
  // Nhóm 4: Bổ trợ dữ liệu
  { name: 'Nguon', alias: 'Nguồn TT', type: 'String', length: 50 },
  { name: 'CapNhat', alias: 'TG cập nhật', type: 'Date', length: 8 },
  { name: 'NguoiSua', alias: 'Người cập nhật', type: 'String', length: 50 },
];

/**
 * 5. Lớp nghiệp vụ (Point / Polygon linh hoạt)
 * Đơn giản hóa: Người dùng nhập Tên và Ghi chú, các trường khác tự động sinh
 */
export const NGHIEP_VU_SCHEMA: FieldDefinition[] = [
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên', type: 'String', length: 255 },
  { name: 'GhiChu', alias: 'Ghi chú', type: 'String', length: 500 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 50 },
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (TP)', type: 'String', length: 50 },
  { name: 'CapNhat', alias: 'TG cập nhật', type: 'Date', length: 8 },
  { name: 'NguoiSua', alias: 'Người cập nhật', type: 'String', length: 50 },
];

/**
 * Tổng hợp Schema các lớp dữ liệu
 */
export const ALL_LAYER_SCHEMAS: Record<string, LayerSchema> = {
  layer1_tim_kiem: {
    layerId: 'layer1_tim_kiem',
    layerName: 'Tìm kiếm quy tập',
    geometryType: 'Polygon',
    fields: TIM_KIEM_QUY_TAP_SCHEMA,
  },
  layer2_tran_danh: {
    layerId: 'layer2_tran_danh',
    layerName: 'Trận đánh lịch sử',
    geometryType: 'Point',
    fields: TRAN_DANH_LICH_SU_SCHEMA,
  },
  layer3_mo_chi: {
    layerId: 'layer3_mo_chi',
    layerName: 'Mộ liệt sĩ',
    geometryType: 'Point',
    fields: MO_LIET_SI_SCHEMA,
  },
  layer4_nghia_trang: {
    layerId: 'layer4_nghia_trang',
    layerName: 'Nghĩa trang',
    geometryType: 'Point',
    fields: NGHIA_TRANG_SCHEMA,
  },
  layer5_nghiep_vu: {
    layerId: 'layer5_nghiep_vu',
    layerName: 'Lớp nghiệp vụ',
    geometryType: 'Point',
    fields: NGHIEP_VU_SCHEMA,
  },
  // Tương thích ngược với các ID lớp phụ/cũ
  layer4_khu_vuc_quy_tap: {
    layerId: 'layer4_khu_vuc_quy_tap',
    layerName: 'Tìm kiếm quy tập',
    geometryType: 'Polygon',
    fields: TIM_KIEM_QUY_TAP_SCHEMA,
  },
  layer3_tran_danh_lich_su: {
    layerId: 'layer3_tran_danh_lich_su',
    layerName: 'Trận đánh lịch sử',
    geometryType: 'Point',
    fields: TRAN_DANH_LICH_SU_SCHEMA,
  },
  layer1_mo_liet_si: {
    layerId: 'layer1_mo_liet_si',
    layerName: 'Mộ liệt sĩ',
    geometryType: 'Point',
    fields: MO_LIET_SI_SCHEMA,
  },
  layer2_nghia_trang: {
    layerId: 'layer2_nghia_trang',
    layerName: 'Nghĩa trang',
    geometryType: 'Point',
    fields: NGHIA_TRANG_SCHEMA,
  },
};

export function getSchemaForLayer(layerId?: string): FieldDefinition[] {
  if (!layerId) return TIM_KIEM_QUY_TAP_SCHEMA;
  if (ALL_LAYER_SCHEMAS[layerId]) {
    return ALL_LAYER_SCHEMAS[layerId].fields;
  }
  const l = layerId.toLowerCase();
  if (l.includes('nghiep_vu') || l.includes('nghiepvu')) {
    return NGHIEP_VU_SCHEMA;
  }
  if (l.includes('tim_kiem') || l.includes('quy_tap') || l.includes('quytap')) {
    return TIM_KIEM_QUY_TAP_SCHEMA;
  }
  if (l.includes('tran_danh') || l.includes('trandanh') || l.includes('chien_dich')) {
    return TRAN_DANH_LICH_SU_SCHEMA;
  }
  if (l.includes('mo_chi') || l.includes('mo_liet_si') || l.includes('molietsi') || l.includes('mo')) {
    return MO_LIET_SI_SCHEMA;
  }
  if (l.includes('nghia_trang') || l.includes('nghiatrang')) {
    return NGHIA_TRANG_SCHEMA;
  }
  return TIM_KIEM_QUY_TAP_SCHEMA;
}

/**
 * Chuẩn hóa và làm sạch thuộc tính của đối tượng theo Schema của lớp.
 * Đặc biệt đối với Lớp nghiệp vụ (layer5_nghiep_vu), chỉ giữ lại đúng 9 trường được định nghĩa trong NGHIEP_VU_SCHEMA.
 */
export function sanitizePropertiesForLayer(props: Record<string, any>, layerId?: string): Record<string, any> {
  if (!props || typeof props !== 'object') return {};
  const isBusiness =
    layerId === 'layer5_nghiep_vu' ||
    layerId === 'layer_nghiep_vu' ||
    (layerId && (layerId.includes('nghiep_vu') || layerId.includes('nghiepvu')));

  if (isBusiness) {
    const allowed = new Set(NGHIEP_VU_SCHEMA.map((f) => f.name.toLowerCase()));
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(props)) {
      if (allowed.has(k.toLowerCase())) {
        result[k] = v;
      }
    }
    return result;
  }

  return { ...props };
}

