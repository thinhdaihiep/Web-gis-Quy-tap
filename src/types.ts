export type UserRole = 'admin' | 'editor' | 'guest';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

export type BaseMapType = 'street' | 'esri_topo' | 'satellite';

export interface LayerConfig {
  id: string;
  name: string;
  type: 'polygon' | 'point';
  visible: boolean;
  color?: string;
  icon?: string;
  description: string;
}

export const DEFAULT_LAYERS: LayerConfig[] = [
  {
    id: 'layer1_tim_kiem',
    name: 'Khu vực tìm kiếm, quy tập',
    type: 'polygon',
    visible: true,
    color: '#ef4444',
    description: 'Bao gồm 5 phân loại tiến độ quy tập',
  },
  {
    id: 'layer2_tran_danh',
    name: 'Các trận đánh lịch sử',
    type: 'point',
    visible: true,
    color: '#f59e0b',
    description: 'Vị trí xảy ra các chiến dịch/trận đánh',
  },
  {
    id: 'layer3_mo_chi',
    name: 'Mộ liệt sĩ',
    type: 'point',
    visible: true,
    color: '#10b981',
    description: 'Thông tin mộ liệt sĩ lẻ/tập trung',
  },
  {
    id: 'layer4_nghia_trang',
    name: 'Nghĩa trang liệt sĩ',
    type: 'point',
    visible: true,
    color: '#6366f1',
    description: 'Vị trí nghĩa trang liệt sĩ',
  },
];

export type MapInteractionMode =
  | 'hand'
  | 'pointer'
  | 'measure_distance'
  | 'measure_area_custom'
  | 'measure_area_feature';
export type DrawToolMode = 'select' | 'point' | 'line' | 'polygon' | null;

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
  createdBy?: string;
  editorNotes?: string;
}

export type DuplicateStrategy = 'overwrite' | 'skip' | 'append';

export const PHAN_LOAI_COLORS: Record<number, { color: string; label: string }> = {
  1: { color: '#10b981', label: '1. Đã quy tập xong' },
  2: { color: '#f59e0b', label: '2. Đã quy tập nhưng chưa xong' },
  3: { color: '#ec4899', label: '3. Chưa tổ chức tìm kiếm' },
  4: { color: '#ef4444', label: '4. Đã tìm kiếm nhưng chưa có kết quả' },
  5: { color: '#94a3b8', label: '5. Tìm kiếm, quy tập không rõ thông tin' },
};

export const INITIAL_MAP_FEATURES: GeoJsonFeatureItem[] = [];

