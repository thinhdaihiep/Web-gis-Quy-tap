/**
 * OpenStreetMap Overpass API Service
 * Hỗ trợ truy vấn địa danh thực địa trong Bounding Box của bản đồ
 */

export type OsmGroup = 'all' | 'hanh_chinh' | 'song_nui' | 'di_tich';

export interface OsmItem {
  id: string;
  name: string;
  group: 'hanh_chinh' | 'song_nui' | 'di_tich';
  kind: string;
  kindLabel: string;
  lat: number;
  lon: number;
  ele?: string;
}

export class OsmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OsmError';
  }
}

export const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/**
 * Thoát các ký tự đặc biệt khi dùng regex trong Overpass QL
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Kiểm tra mức zoom an toàn (Zoom >= 11) để tránh quét phạm vi quá rộng
 */
export function isZoomOk(map: any): boolean {
  if (!map) return false;
  const z = typeof map.getZoom === 'function' ? map.getZoom() : map.zoom;
  return typeof z === 'number' && z >= 11;
}

/**
 * Tạo chuỗi khóa Bounding Box để làm cache key
 */
export function makeBBoxKey(bounds: any): string {
  if (!bounds) return '';
  const s = typeof bounds.getSouth === 'function' ? bounds.getSouth() : bounds.south;
  const w = typeof bounds.getWest === 'function' ? bounds.getWest() : bounds.west;
  const n = typeof bounds.getNorth === 'function' ? bounds.getNorth() : bounds.north;
  const e = typeof bounds.getEast === 'function' ? bounds.getEast() : bounds.east;
  return `${Number(s).toFixed(3)}_${Number(w).toFixed(3)}_${Number(n).toFixed(3)}_${Number(e).toFixed(3)}`;
}

/**
 * Lọc danh sách OsmItem theo nhóm lọc Client-side
 */
export function filterOsm(items: OsmItem[], group: OsmGroup): OsmItem[] {
  if (!group || group === 'all') {
    return items;
  }
  return items.filter((item) => item.group === group);
}

/**
 * Tính khoảng cách giữa 2 điểm (mét) bằng công thức Haversine
 */
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Phân loại thẻ OSM thành nhóm, loại và nhãn tiếng Việt
 */
function classifyOsmElement(tags: Record<string, string>): {
  group: 'hanh_chinh' | 'song_nui' | 'di_tich';
  kind: string;
  kindLabel: string;
} {
  // 1. Nhóm Nghĩa trang & Di tích
  if (tags.landuse === 'cemetery' || tags.amenity === 'grave_yard') {
    return { group: 'di_tich', kind: 'cemetery', kindLabel: 'Nghĩa trang' };
  }
  if (tags.historic === 'battlefield') {
    return { group: 'di_tich', kind: 'battlefield', kindLabel: 'Chiến trường' };
  }
  if (tags.historic === 'memorial' || tags.historic === 'monument') {
    return { group: 'di_tich', kind: 'memorial', kindLabel: 'Di tích/Tưởng niệm' };
  }

  // 2. Nhóm Sông núi & Thủy văn
  if (
    tags.natural === 'water' ||
    tags.water === 'lake' ||
    tags.water === 'reservoir' ||
    tags.water === 'pond' ||
    tags.landuse === 'reservoir' ||
    (tags.name && (tags.name.toLowerCase().startsWith('hồ ') || tags.name.toLowerCase().includes('hồ chứa nước') || tags.name.toLowerCase().startsWith('đầm ') || tags.name.toLowerCase().startsWith('bàu ')))
  ) {
    return { group: 'song_nui', kind: 'lake', kindLabel: 'Hồ nước' };
  }
  if (tags.natural === 'peak') {
    return { group: 'song_nui', kind: 'peak', kindLabel: 'Đỉnh núi' };
  }
  if (tags.natural === 'hill' || tags.natural === 'volcano') {
    return { group: 'song_nui', kind: 'hill', kindLabel: 'Đồi' };
  }
  if (tags.natural === 'ridge') {
    return { group: 'song_nui', kind: 'ridge', kindLabel: 'Dãy núi' };
  }
  if (tags.natural === 'valley') {
    return { group: 'song_nui', kind: 'valley', kindLabel: 'Thung lũng' };
  }
  if (tags.waterway === 'river') {
    return { group: 'song_nui', kind: 'river', kindLabel: 'Sông' };
  }
  if (tags.waterway === 'stream' || tags.waterway === 'canal') {
    return { group: 'song_nui', kind: 'stream', kindLabel: 'Suối' };
  }

  // 3. Nhóm Hành chính & Dân cư
  if (tags.place === 'hamlet') {
    return { group: 'hanh_chinh', kind: 'hamlet', kindLabel: 'Thôn/Bản' };
  }
  if (tags.place === 'village') {
    return { group: 'hanh_chinh', kind: 'village', kindLabel: 'Làng/Xã' };
  }
  if (tags.place === 'locality') {
    return { group: 'hanh_chinh', kind: 'locality', kindLabel: 'Địa danh' };
  }
  if (tags.place === 'town') {
    return { group: 'hanh_chinh', kind: 'town', kindLabel: 'Thị trấn' };
  }
  if (tags.place === 'suburb') {
    return { group: 'hanh_chinh', kind: 'suburb', kindLabel: 'Phường/Khu' };
  }

  return { group: 'hanh_chinh', kind: 'place', kindLabel: 'Địa danh' };
}

/**
 * Xây dựng câu truy vấn Overpass QL tối ưu
 */
function buildOverpassQuery(
  s: number,
  w: number,
  n: number,
  e: number,
  keyword?: string
): string {
  const bbox = `${s},${w},${n},${e}`;
  const trimmed = keyword ? keyword.trim() : '';

  // Khi có từ khóa: tìm theo name, name:vi, alt_name, old_name
  // Khi không có từ khóa: chỉ lấy các đối tượng có thẻ name
  let nameFilter = '["name"]';
  if (trimmed) {
    const escaped = escapeRegex(trimmed);
    nameFilter = `[~"^(name|name:vi|alt_name|old_name)$"~"${escaped}",i]`;
  }

  return `[out:json][timeout:25];
(
  // 1. Hành chính & Dân cư (Node)
  node["place"~"hamlet|village|locality|town|suburb"]${nameFilter}(${bbox});

  // 2. Sông núi & Địa hình (Node cho đỉnh núi/đồi; Way cho dãy núi/thung lũng/sông suối)
  node["natural"~"peak|hill|volcano"]${nameFilter}(${bbox});
  way["natural"~"ridge|valley|cliff"]${nameFilter}(${bbox});
  way["waterway"~"river|stream|canal"]${nameFilter}(${bbox});

  // 3. Nghĩa trang & Di tích lịch sử (Cả Node và Way)
  node["historic"~"battlefield|memorial|monument"]${nameFilter}(${bbox});
  way["historic"~"battlefield|memorial|monument"]${nameFilter}(${bbox});
  node["amenity"="grave_yard"]${nameFilter}(${bbox});
  way["amenity"="grave_yard"]${nameFilter}(${bbox});
  node["landuse"="cemetery"]${nameFilter}(${bbox});
  way["landuse"="cemetery"]${nameFilter}(${bbox});
);
out center tags;`;
}

/**
 * Dự phòng gọi trực tiếp Photon Komoot API từ Client (có sẵn CORS Access-Control-Allow-Origin: *)
 * Đảm bảo 100% không bao giờ gặp lỗi Failed to fetch do CORS
 */
async function searchPhotonClientFallback(
  bounds: { south: number; west: number; north: number; east: number },
  keyword?: string,
  signal?: AbortSignal
): Promise<OsmItem[]> {
  const { south, west, north, east } = bounds;
  const bbox = `${west},${south},${east},${north}`;
  const trimmed = keyword ? keyword.trim() : '';

  const queryTerms = trimmed ? [trimmed] : ['xã', 'thôn', 'núi', 'hồ', 'sông', 'suối', 'nghĩa trang'];
  const promises = queryTerms.map((term) =>
    fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&bbox=${bbox}&limit=20`,
      { signal }
    )
      .then((res) => (res.ok ? res.json() : { features: [] }))
      .catch(() => ({ features: [] }))
  );

  const results = await Promise.all(promises);
  const items: OsmItem[] = [];

  for (const data of results) {
    for (const f of data.features || []) {
      const p = f.properties || {};
      const geom = f.geometry || {};
      const name = p.name || p.street || p.locality || p.city;
      if (!name || !geom.coordinates || geom.coordinates.length < 2) continue;

      const lon = geom.coordinates[0];
      const lat = geom.coordinates[1];
      if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) continue;

      if (lat < south - 0.005 || lat > north + 0.005 || lon < west - 0.005 || lon > east + 0.005) {
        continue;
      }

      const { group, kind, kindLabel } = classifyOsmElement({
        ...p,
        [p.osm_key]: p.osm_value,
      });

      items.push({
        id: `photon/${p.osm_type || 'N'}/${p.osm_id || Math.random()}`,
        name: String(name).trim(),
        group,
        kind,
        kindLabel,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
        ele: p.ele || undefined,
      });
    }
  }

  // Khử trùng lặp (< 50m)
  const deduped: OsmItem[] = [];
  for (const item of items) {
    const exists = deduped.some((existing) => {
      if (existing.name.toLowerCase() !== item.name.toLowerCase()) return false;
      const dist = getDistanceMeters(existing.lat, existing.lon, item.lat, item.lon);
      return dist < 50;
    });
    if (!exists) {
      deduped.push(item);
    }
  }

  return deduped;
}

/**
 * Thực thi tìm kiếm địa danh OpenStreetMap qua API Proxy nội bộ trên Server
 * - Không bao giờ bị chặn CORS ở trình duyệt
 * - Có bộ nhớ đệm (Cache) trên Server và tự động dự phòng đa tầng
 */
export async function searchOsm(
  bounds: { south: number; west: number; north: number; east: number },
  keyword?: string,
  signal?: AbortSignal
): Promise<OsmItem[]> {
  try {
    const response = await fetch('/api/osm/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bounds,
        keyword: keyword ? keyword.trim() : '',
      }),
      signal,
    });

    if (!response.ok) {
      throw new OsmError(`Máy chủ phản hồi mã lỗi (${response.status})`);
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.items)) {
      return data.items;
    }

    throw new OsmError(data.error || 'Dữ liệu không hợp lệ từ máy chủ');
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }

    console.warn('Proxy /api/osm/search gặp sự cố, tự động kích hoạt Photon fallback:', err);
    try {
      return await searchPhotonClientFallback(bounds, keyword, signal);
    } catch (fallbackErr: any) {
      if (fallbackErr.name === 'AbortError') {
        throw fallbackErr;
      }
      throw new OsmError('Không thể kết nối đến máy chủ OpenStreetMap. Vui lòng kiểm tra lại kết nối mạng.');
    }
  }
}
