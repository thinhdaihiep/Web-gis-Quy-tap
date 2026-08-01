export type UserRole = 'admin' | 'editor' | 'guest';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

export type BaseMapType = 'street' | 'satellite';

export interface LayerConfig {
  id: string;
  name: string;
  type: 'polygon' | 'point';
  visible: boolean;
  color?: string;
  icon?: string;
  description: string;
  readOnlyForEditor?: boolean;
}

export const DEFAULT_LAYERS: LayerConfig[] = [
  {
    id: 'layer1_tim_kiem',
    name: 'Lớp 1: Khu vực Tìm kiếm Quy tập',
    type: 'polygon',
    visible: true,
    color: '#ef4444',
    description: 'Bao gồm 5 phân loại tiến độ quy tập',
  },
  {
    id: 'layer2_tran_danh',
    name: 'Lớp 2: Các trận đánh lịch sử',
    type: 'polygon',
    visible: true,
    color: '#f59e0b',
    description: 'Khu vực xảy ra các chiến dịch/trận đánh',
  },
  {
    id: 'layer3_mo_chi',
    name: 'Lớp 3: Vị trí Mộ chí',
    type: 'point',
    visible: true,
    color: '#10b981',
    description: 'Thông tin mộ liệt sĩ lẻ/tập trung',
  },
  {
    id: 'layer4_nghia_trang',
    name: 'Lớp 4: Nghĩa trang Liệt sĩ',
    type: 'polygon',
    visible: true,
    color: '#6366f1',
    description: 'Ranh giới và khuôn viên nghĩa trang',
  },
  {
    id: 'layer5_dia_gioi',
    name: 'Lớp 5: Địa giới Hành chính',
    type: 'polygon',
    visible: true,
    color: '#6b7280',
    description: 'Địa giới hành chính các cấp (Chỉ Admin chỉnh sửa)',
    readOnlyForEditor: true,
  },
];

export interface GeoJsonFeatureItem {
  id: string;
  layerId: string;
  name: string;
  code?: string;
  type: 'Point' | 'Polygon' | 'MultiPolygon' | 'LineString';
  coordinates: any; // GeoJSON geometry coordinates
  properties: Record<string, any>;
  status?: 'xac_dinh' | 'chua_xac_dinh' | 'cho_phe_duyet';
  updatedAt?: string;
}

export type DuplicateStrategy = 'overwrite' | 'skip' | 'append';

export const PHAN_LOAI_COLORS: Record<number, { color: string; label: string }> = {
  1: { color: '#10b981', label: '1. Đã quy tập xong' },
  2: { color: '#f59e0b', label: '2. Đã quy tập nhưng chưa xong' },
  3: { color: '#3b82f6', label: '3. Chưa tổ chức tìm kiếm' },
  4: { color: '#ef4444', label: '4. Đã tìm kiếm nhưng chưa có kết quả' },
  5: { color: '#8b5cf6', label: '5. Chưa tìm kiếm quy tập' },
};

export const INITIAL_MAP_FEATURES: GeoJsonFeatureItem[] = [
  {
    id: 'TK-QK5-001',
    layerId: 'layer1_tim_kiem',
    name: 'Khu vực Tìm kiếm Đèo Le - Nông Sơn',
    code: 'TK-QK5-001',
    type: 'Polygon',
    coordinates: [
      [
        [108.115, 15.655],
        [108.135, 15.655],
        [108.135, 15.635],
        [108.115, 15.635],
        [108.115, 15.655],
      ],
    ],
    status: 'xac_dinh',
    properties: {
      ten_khu_vuc: 'Khu vực Tìm kiếm Đèo Le - Nông Sơn',
      ma_so: 'TK-QK5-001',
      don_vi_quy_tap: 'Đội K53 - Quân khu 5',
      tien_do: 'Có thông tin nhưng chưa tìm kiếm',
      so_luong_du_kien: '12-15 liệt sĩ',
      trang_thai: 'xac_dinh',
    },
    updatedAt: '2026-07-25',
  },
  {
    id: 'TD-001',
    layerId: 'layer2_tran_danh',
    name: 'Trận đánh Cao điểm 1489 - Chiến dịch Hè 1972',
    code: 'TD-001',
    type: 'Polygon',
    coordinates: [
      [
        [107.820, 15.220],
        [107.850, 15.220],
        [107.850, 15.190],
        [107.820, 15.190],
        [107.820, 15.220],
      ],
    ],
    status: 'xac_dinh',
    properties: {
      ten_tran_danh: 'Trận đánh Cao điểm 1489',
      thoi_gian: 'Tháng 5/1972',
      don_vi_tham_gia: 'Trung đoàn 1 - Sư đoàn 2',
      ghi_chu: 'Khu vực giao tranh ác liệt tại đỉnh đồi',
      trang_thai: 'xac_dinh',
    },
    updatedAt: '2026-07-20',
  },
  {
    id: 'MC-001',
    layerId: 'layer3_mo_chi',
    name: 'Mộ Liệt sĩ Nguyễn Văn A',
    code: 'MC-001',
    type: 'Point',
    coordinates: [108.202, 15.881],
    status: 'xac_dinh',
    properties: {
      ho_ten: 'Nguyễn Văn A',
      nam_sinh: '1948',
      que_quan: 'Thái Bình',
      don_vi: 'c3 d8 e31',
      hy_sinh: '1968',
      trang_thai: 'xac_dinh',
    },
    updatedAt: '2026-07-15',
  },
  {
    id: 'NT-QK5-01',
    layerId: 'layer4_nghia_trang',
    name: 'Nghĩa trang Liệt sĩ Tỉnh Quảng Nam',
    code: 'NT-QK5-01',
    type: 'Polygon',
    coordinates: [
      [
        [108.470, 15.565],
        [108.480, 15.565],
        [108.480, 15.555],
        [108.470, 15.555],
        [108.470, 15.565],
      ],
    ],
    status: 'xac_dinh',
    properties: {
      ten_nghia_trang: 'Nghĩa trang Liệt sĩ Tỉnh Quảng Nam',
      suc_chua: '5500 phần mộ',
      mo_da_quy_tap: '4820',
      mo_chua_xac_dinh_danh_tinh: '1200',
      trang_thai: 'xac_dinh',
    },
    updatedAt: '2026-07-10',
  },
];

