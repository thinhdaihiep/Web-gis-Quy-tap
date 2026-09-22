export type UserRole = 'admin' | 'editor' | 'guest';

export interface AppUser {
  uid: string;
  username: string;
  email?: string | null;
  displayName: string | null;
  photoURL?: string | null;
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
  updatedAt?: string;
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

export interface LatLngBoundsBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type RasterBoundsType = LatLngBoundsBox | [[number, number], [number, number]] | [number, number, number, number] | null;

export interface RasterLoadingStatus {
  state: 'idle' | 'loading' | 'loaded' | 'error';
  progress?: number;
  message?: string;
  loadedCount?: number;
  totalCount?: number;
  activeLayerName?: string;
  bounds?: LatLngBoundsBox | null;
  error?: string;
  fileNames?: string[];
  fileStatuses?: { name: string; state: 'loading' | 'loaded' | 'error'; inViewport?: boolean }[];
  failedCount?: number;
  currentLoadingName?: string;
}

/**
 * Normalizes any bounds format to a flat LatLngBoundsBox object for safe Firestore storage without nested arrays
 */
export function normalizeBoundsBox(bounds: any): LatLngBoundsBox | null {
  if (!bounds) return null;
  
  let s: number, w: number, n: number, e: number;
  
  if (
    typeof bounds.south === 'number' && !isNaN(bounds.south) &&
    typeof bounds.west === 'number' && !isNaN(bounds.west) &&
    typeof bounds.north === 'number' && !isNaN(bounds.north) &&
    typeof bounds.east === 'number' &&
    !isNaN(bounds.south) && !isNaN(bounds.west) && !isNaN(bounds.north) && !isNaN(bounds.east)
  ) {
    s = bounds.south;
    w = bounds.west;
    n = bounds.north;
    e = bounds.east;
  } else if (Array.isArray(bounds)) {
    if (bounds.length === 2 && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
      s = Number(bounds[0][0]);
      w = Number(bounds[0][1]);
      n = Number(bounds[1][0]);
      e = Number(bounds[1][1]);
    } else if (bounds.length === 4 && typeof bounds[0] === 'number' && !isNaN(bounds[0])) {
      s = Number(bounds[0]);
      w = Number(bounds[1]);
      n = Number(bounds[2]);
      e = Number(bounds[3]);
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (isNaN(s) || isNaN(w) || isNaN(n) || isNaN(e)) {
    return null;
  }

  return {
    south: Math.min(s, n),
    west: Math.min(w, e),
    north: Math.max(s, n),
    east: Math.max(w, e),
  };
}

/**
 * Converts any bounds format to Leaflet [[South, West], [North, East]] array format
 */
export function boundsToLatLngArray(bounds: any): [[number, number], [number, number]] | null {
  const box = normalizeBoundsBox(bounds);
  if (!box) return null;
  return [
    [box.south, box.west],
    [box.north, box.east],
  ];
}

/**
 * Calculates the combined bounding box bounding all provided bounds
 */
export function computeCombinedBounds(boundsList: (any | null | undefined)[]): LatLngBoundsBox | null {
  let minSouth = Infinity;
  let minWest = Infinity;
  let maxNorth = -Infinity;
  let maxEast = -Infinity;
  let hasValid = false;

  for (const item of boundsList) {
    const box = normalizeBoundsBox(item);
    if (box) {
      if (box.south < minSouth) minSouth = box.south;
      if (box.west < minWest) minWest = box.west;
      if (box.north > maxNorth) maxNorth = box.north;
      if (box.east > maxEast) maxEast = box.east;
      hasValid = true;
    }
  }

  if (!hasValid) return null;
  return {
    south: minSouth,
    west: minWest,
    north: maxNorth,
    east: maxEast,
  };
}

/**
 * Checks if a bounding box intersects with a given viewport in EPSG:4326
 */
export function isBoundsInViewport(
  bounds: any,
  viewport: { south: number; west: number; north: number; east: number }
): boolean {
  const box = normalizeBoundsBox(bounds);
  if (!box) return true; // If no bounds indexed, assume within viewport so it can still load

  return !(
    box.north < viewport.south ||
    box.south > viewport.north ||
    box.east < viewport.west ||
    box.west > viewport.east
  );
}

export interface RasterFileItem {
  id: string;
  fileName: string;
  url: string;
  format?: 'COG' | 'GEOTIFF';
  minZoom?: number; // default 12 (map display min zoom)
  maxZoom?: number; // default 18 (map display max zoom - overzooming)
  maxNativeZoom?: number; // native zoom if applicable
  minNativeZoom?: number;
  bounds?: LatLngBoundsBox | [[number, number], [number, number]] | null;
  fileSize?: number;
  uploadedAt: string;
  source?: 'github' | 'upload' | 'url';
}

export interface RasterLayer {
  id: string;
  name: string;
  type?: 'COG' | 'GEOTIFF';
  files: RasterFileItem[];
  opacity?: number;
  createdAt: string;
  updatedAt?: string;
  githubReleaseUrl?: string;
  // Legacy fields for backward compatibility
  url?: string;
  minZoom?: number;
  maxZoom?: number;
  bounds?: LatLngBoundsBox | [[number, number], [number, number]] | null;
  isActive?: boolean;
}

