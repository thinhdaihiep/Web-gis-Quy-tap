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
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên', type: 'String', length: 255 },
  { name: 'PhanLoai', alias: 'Phân loại', type: 'SmallInteger', length: 2 },
  { name: 'HienTrang', alias: 'Hiện trạng', type: 'String', length: 255 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (TP)', type: 'String', length: 50 },
  { name: 'CapNhat', alias: 'TG cập nhật', type: 'Date', length: 8 },
  { name: 'Nguon', alias: 'Nguồn TT', type: 'String', length: 50 },
  { name: 'TimDuoc', alias: 'Đã tìm được', type: 'SmallInteger', length: 2 },
  { name: 'ChuaThay', alias: 'Chưa tìm thấy', type: 'SmallInteger', length: 2 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 30 },
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
];

/**
 * 2. Trận đánh lịch sử (Point)
 */
export const TRAN_DANH_LICH_SU_SCHEMA: FieldDefinition[] = [
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên', type: 'String', length: 255 },
  { name: 'ThoiGian', alias: 'Thời gian', type: 'String', length: 255 },
  { name: 'DiaDiem', alias: 'Địa điểm', type: 'String', length: 255 },
  { name: 'DonVi', alias: 'Đơn vị', type: 'String', length: 255 },
  { name: 'BenDich', alias: 'Bên địch', type: 'String', length: 255 },
  { name: 'CongTrinh', alias: 'Công trình lịch sử', type: 'String', length: 255 },
  { name: 'QuyTap', alias: 'Kết quả quy tập', type: 'String', length: 255 },
  { name: 'CapNhat', alias: 'TG cập nhật', type: 'Date', length: 8 },
  { name: 'Nguon', alias: 'Nguồn TT', type: 'String', length: 50 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 30 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (TP)', type: 'String', length: 50 },
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
  { name: 'GhiChu', alias: 'Ghi chú', type: 'String', length: 255 },
  { name: 'BenTa', alias: 'Bên ta', type: 'String', length: 255 },
];

/**
 * 3. Mộ liệt sĩ (Point)
 */
export const MO_LIET_SI_SCHEMA: FieldDefinition[] = [
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên mộ', type: 'String', length: 50 },
  { name: 'DiaDiem', alias: 'Địa điểm', type: 'String', length: 255 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (TP)', type: 'String', length: 50 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 30 },
  { name: 'ThongTin', alias: 'Thông tin', type: 'String', length: 255 },
  { name: 'HienTrang', alias: 'Hiện trạng', type: 'String', length: 255 },
  { name: 'CapNhat', alias: 'TG Cập nhật', type: 'Date', length: 8 },
  { name: 'Nguon', alias: 'Nguồn TT', type: 'String', length: 50 },
  { name: 'NTID', alias: 'Mã NT', type: 'Integer', length: 4 },
  { name: 'GhiChu', alias: 'Ghi chú', type: 'String', length: 255 },
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
  { name: 'NgaySinh', alias: 'Ngày sinh', type: 'String', length: 30 },
  { name: 'NgayMat', alias: 'Ngày mất', type: 'String', length: 30 },
  { name: 'DonVi', alias: 'Đơn vị', type: 'String', length: 50 },
  { name: 'CapBac', alias: 'Cấp bậc', type: 'String', length: 50 },
  { name: 'ChucVu', alias: 'Chức vụ', type: 'String', length: 50 },
];

/**
 * 4. Nghĩa trang liệt sĩ (Point)
 */
export const NGHIA_TRANG_SCHEMA: FieldDefinition[] = [
  { name: 'OBJECTID', alias: 'Mã', type: 'Integer', length: 4 },
  { name: 'Ten', alias: 'Tên', type: 'String', length: 70 },
  { name: 'DiaChi', alias: 'Địa chỉ', type: 'String', length: 255 },
  { name: 'DienThoai', alias: 'Điện thoại', type: 'String', length: 15 },
  { name: 'SoMo', alias: 'Số lượng mộ', type: 'SmallInteger', length: 2 },
  { name: 'ThanhLap', alias: 'Năm thành lập', type: 'SmallInteger', length: 2 },
  { name: 'Xa', alias: 'Xã (Phường)', type: 'String', length: 50 },
  { name: 'Tinh', alias: 'Tỉnh (Tp)', type: 'String', length: 50 },
  { name: 'Nguon', alias: 'Nguồn TT', type: 'String', length: 50 },
  { name: 'CapNhat', alias: 'TG cập nhật', type: 'Date', length: 8 },
  { name: 'ToaDo', alias: 'Tọa độ', type: 'String', length: 30 },
  { name: 'DiaDanh3C', alias: 'Hành chính cũ', type: 'String', length: 255 },
  { name: 'MoCoTen', alias: 'Mộ có tên', type: 'SmallInteger', length: 2 },
  { name: 'MoVoDanh', alias: 'Mộ vô danh', type: 'SmallInteger', length: 2 },
];

/**
 * Tổng hợp Schema 4 lớp dữ liệu
 */
export const ALL_LAYER_SCHEMAS: Record<string, LayerSchema> = {
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
