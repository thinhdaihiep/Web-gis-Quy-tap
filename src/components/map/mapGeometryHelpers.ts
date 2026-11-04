import L from 'leaflet';
import proj4 from 'proj4';
import { GeoJsonFeatureItem } from '../../types';

export function toLeafletCoords(coords: any): any {
  if (coords === null || coords === undefined) return [];
  if (typeof coords === 'string') {
    try {
      coords = JSON.parse(coords);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(coords) || coords.length === 0) return [];

  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    !isNaN(coords[0]) &&
    typeof coords[1] === 'number' &&
    !isNaN(coords[1])
  ) {
    let x = coords[0];
    let y = coords[1];

    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      try {
        const [lng, lat] = proj4('EPSG:3405', 'EPSG:4326', [x, y]);
        return [lat, lng];
      } catch (e) {
        console.warn('Proj4 transformation error:', e);
      }
    }
    return [y, x];
  }

  return coords
    .filter((c: any) => c !== null && c !== undefined && (Array.isArray(c) || typeof c === 'string'))
    .map((c: any) => toLeafletCoords(c))
    .filter((c: any) => Array.isArray(c) && c.length > 0);
}

export function leafletLatLngsToGeoJsonPolygon(latLngs: any): any {
  if (!Array.isArray(latLngs) || latLngs.length === 0) return [];

  if (
    Array.isArray(latLngs[0]) &&
    latLngs[0].length > 0 &&
    latLngs[0][0] &&
    typeof latLngs[0][0] === 'object' &&
    'lat' in latLngs[0][0]
  ) {
    return latLngs.map((ring: any) =>
      Array.isArray(ring)
        ? ring
            .filter((ll: any) => ll && typeof ll.lng === 'number' && !isNaN(ll.lng) && typeof ll.lat === 'number' && !isNaN(ll.lat))
            .map((ll: any) => [Number(ll.lng.toFixed(6)), Number(ll.lat.toFixed(6))])
        : []
    );
  }

  if (latLngs[0] && typeof latLngs[0] === 'object' && 'lat' in latLngs[0]) {
    const ring = latLngs
      .filter((ll: any) => ll && typeof ll.lng === 'number' && !isNaN(ll.lng) && typeof ll.lat === 'number' && !isNaN(ll.lat))
      .map((ll: any) => [
        Number(ll.lng.toFixed(6)),
        Number(ll.lat.toFixed(6)),
      ]);
    if (ring.length > 0) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        ring.push([...first]);
      }
    }
    return [ring];
  }

  return latLngs;
}

export function leafletLatLngsToGeoJsonLine(latLngs: any): any {
  if (!Array.isArray(latLngs) || latLngs.length === 0) return [];
  if (latLngs[0] && typeof latLngs[0] === 'object' && 'lat' in latLngs[0]) {
    return latLngs
      .filter((ll: any) => ll && typeof ll.lng === 'number' && !isNaN(ll.lng) && typeof ll.lat === 'number' && !isNaN(ll.lat))
      .map((ll: any) => [
        Number(ll.lng.toFixed(6)),
        Number(ll.lat.toFixed(6)),
      ]);
  }
  return latLngs;
}

export function createPointIcon(
  type: 'search' | 'battle' | 'grave' | 'cemetery' | 'business' | 'default',
  isSelected: boolean,
  color: string = '#10b981'
): L.DivIcon {
  const size = isSelected ? 26 : 24;
  const reducedSize = Math.round(size * 0.7);

  if (type === 'search') {
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <polygon points="12 1.5 21.5 7 21.5 17 12 22.5 2.5 17 2.5 7" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#f59e0b'}" stroke-width="${isSelected ? '1.5' : '1.8'}" />
          <svg x="4.5" y="4.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3l4 4" />
            <path d="M19 5l-8 8" />
            <path d="M13 11l-2-2" />
            <path d="M10 12l-6 6a3 3 0 0 0 0 4.24l.76.76a3 3 0 0 0 4.24 0l6-6" />
            <path d="M12 10l2 2" />
          </svg>
        </svg>
      `,
      className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -10],
    });
  } else if (type === 'battle') {
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <circle cx="12" cy="12" r="10.5" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#dc2626'}" stroke-width="${isSelected ? '1.5' : '1.8'}" />
          <svg x="4.5" y="4.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
            <line x1="13" x2="19" y1="19" y2="13" />
            <line x1="16" x2="20" y1="16" y2="20" />
            <line x1="19" x2="21" y1="21" y2="19" />
            <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
            <line x1="5" x2="9" y1="14" y2="18" />
            <line x1="7" x2="4" y1="17" y2="20" />
            <line x1="3" x2="5" y1="19" y2="21" />
          </svg>
        </svg>
      `,
      className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -10],
    });
  } else if (type === 'business') {
    const bizSize = isSelected ? 18 : 16;
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${bizSize}" height="${bizSize}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <circle cx="12" cy="12" r="9.5" fill="#facc15" stroke="${isSelected ? '#2563eb' : '#dc2626'}" stroke-width="${isSelected ? '2' : '1.8'}" />
        </svg>
      `,
      className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
      iconSize: [bizSize, bizSize],
      iconAnchor: [bizSize / 2, bizSize / 2],
      popupAnchor: [0, -8],
    });
  } else if (type === 'grave') {
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${reducedSize}" height="${reducedSize}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <polygon points="12 1.5 22.5 21.5 1.5 21.5" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#16a34a'}" stroke-width="${isSelected ? '1.5' : '1.8'}" />
          <svg x="5" y="7.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 20h20" />
            <path d="M4 20c0-4.5 3.58-8 8-8s8 3.5 8 8" />
            <path d="M9 12V6a3 3 0 0 1 6 0v6" />
            <path d="M12 7.5v3" />
            <path d="M10.5 9h3" />
          </svg>
        </svg>
      `,
      className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
      iconSize: [reducedSize, reducedSize],
      iconAnchor: [reducedSize / 2, reducedSize / 2],
      popupAnchor: [0, -8],
    });
  } else if (type === 'cemetery') {
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${reducedSize}" height="${reducedSize}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#9333ea'}" stroke-width="${isSelected ? '1.5' : '1.8'}" />
          <svg x="4.5" y="4.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9333ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21h18" />
            <path d="M5 21v-2h14v2" />
            <path d="M7 19v-2h10v2" />
            <path d="M9 17l1.5-12h3L15 17" />
            <polygon points="12 2 12.8 3.8 14.8 3.8 13.2 5 13.8 6.8 12 5.6 10.2 6.8 10.8 5 9.2 3.8 11.2 3.8" fill="#9333ea" stroke="none" />
          </svg>
        </svg>
      `,
      className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
      iconSize: [reducedSize, reducedSize],
      iconAnchor: [reducedSize / 2, reducedSize / 2],
      popupAnchor: [0, -8],
    });
  } else {
    const dotSize = isSelected ? 22 : 20;
    const strokeWidth = 1.5;
    const strokeColor = isSelected ? '#2563eb' : '#ffffff';
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${dotSize}" height="${dotSize}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <circle cx="12" cy="12" r="9.5" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
        </svg>
      `,
      className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
      iconSize: [dotSize, dotSize],
      iconAnchor: [dotSize / 2, dotSize / 2],
      popupAnchor: [0, -8],
    });
  }
}

const pointIconCache = new Map<string, L.DivIcon>();

export function getPointIcon(
  type: 'search' | 'battle' | 'grave' | 'cemetery' | 'business' | 'default',
  isSelected: boolean,
  color: string = '#10b981'
): L.DivIcon {
  const key = `${type}|${isSelected}|${color}`;
  let icon = pointIconCache.get(key);
  if (!icon) {
    icon = createPointIcon(type, isSelected, color);
    pointIconCache.set(key, icon);
  }
  return icon;
}

export function computeFeatureSignature(
  feat: GeoJsonFeatureItem,
  isSelected: boolean,
  color: string,
  aliasVer: number
): { signature: string; coordSignature: string } {
  const coordSignature =
    typeof feat.coordinates === 'string'
      ? feat.coordinates
      : JSON.stringify(feat.coordinates || []);
  const name = feat.properties?.Ten || feat.properties?.ten || feat.name || '';
  const rawPhanLoai = feat.properties?.PhanLoai ?? feat.properties?.phanLoai ?? '';
  const hoSo = feat.properties?.HoSo || feat.properties?.hoso || '';
  const updatedAt = feat.updatedAt || '';
  const signature = `${coordSignature}|${isSelected}|${color}|${feat.layerId || ''}|${name}|${rawPhanLoai}|${aliasVer}|${hoSo}|${updatedAt}`;
  return { signature, coordSignature };
}
