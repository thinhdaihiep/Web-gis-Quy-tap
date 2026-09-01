import proj4 from 'proj4';
import { LatLngBoundsBox } from '../types';

// 1. Register Vietnamese and international spatial reference systems (CRS)
// EPSG:3857 - WGS 84 / Pseudo-Mercator
proj4.defs(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs'
);

// EPSG:4326 - WGS 84 (Lon/Lat)
proj4.defs(
  'EPSG:4326',
  '+proj=longlat +datum=WGS84 +no_defs +type=crs'
);

// EPSG:32648 - WGS 84 / UTM zone 48N (Vietnam Tây Bắc, Bắc Bộ, Trung Bộ, Nam Bộ kinh tuyến Tây)
proj4.defs(
  'EPSG:32648',
  '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs +type=crs'
);

// EPSG:32649 - WGS 84 / UTM zone 49N (Vietnam Đông Bắc, Trung Trung Bộ & Nam Trung Bộ kinh tuyến Đông)
proj4.defs(
  'EPSG:32649',
  '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs +type=crs'
);

// EPSG:3405 - VN-2000 / UTM zone 48N
proj4.defs(
  'EPSG:3405',
  '+proj=utm +zone=48 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs +type=crs'
);

// EPSG:3406 - VN-2000 / UTM zone 49N
proj4.defs(
  'EPSG:3406',
  '+proj=utm +zone=49 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs +type=crs'
);

// EPSG:5899 - VN-2000 / TM-3 zone 48N
proj4.defs(
  'EPSG:5899',
  '+proj=tmerc +lat_0=0 +lon_0=105 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs +type=crs'
);

// EPSG:5897 - VN-2000 / TM-3 zone 49N
proj4.defs(
  'EPSG:5897',
  '+proj=tmerc +lat_0=0 +lon_0=108 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs +type=crs'
);

// EPSG:4756 - VN-2000 Geographic
proj4.defs(
  'EPSG:4756',
  '+proj=longlat +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +no_defs +type=crs'
);

// Indian 1960 UTM Zone 48N (Bản đồ quân sự UTM cũ)
proj4.defs(
  'EPSG:3148',
  '+proj=utm +zone=48 +ellps=evrst30 +towgs84=198,881,317,0,0,0,0 +units=m +no_defs +type=crs'
);

// Indian 1960 UTM Zone 49N
proj4.defs(
  'EPSG:3149',
  '+proj=utm +zone=49 +ellps=evrst30 +towgs84=198,881,317,0,0,0,0 +units=m +no_defs +type=crs'
);

// Aliases
proj4.defs('32648', proj4.defs('EPSG:32648'));
proj4.defs('32649', proj4.defs('EPSG:32649'));
proj4.defs('3405', proj4.defs('EPSG:3405'));
proj4.defs('3406', proj4.defs('EPSG:3406'));
proj4.defs('5899', proj4.defs('EPSG:5899'));
proj4.defs('5897', proj4.defs('EPSG:5897'));
proj4.defs('4756', proj4.defs('EPSG:4756'));
proj4.defs('3148', proj4.defs('EPSG:3148'));
proj4.defs('3149', proj4.defs('EPSG:3149'));
proj4.defs('3857', proj4.defs('EPSG:3857'));
proj4.defs('4326', proj4.defs('EPSG:4326'));

// 2. CRITICAL: Attach to global window object for georaster-layer-for-leaflet
if (typeof window !== 'undefined') {
  (window as any).proj4 = proj4;
}

function isValid4326(sw: any, ne: any): boolean {
  if (!Array.isArray(sw) || !Array.isArray(ne) || sw.length < 2 || ne.length < 2) return false;
  const [swLng, swLat] = sw;
  const [neLng, neLat] = ne;
  return (
    typeof swLng === 'number' && !isNaN(swLng) &&
    typeof swLat === 'number' && !isNaN(swLat) &&
    typeof neLng === 'number' && !isNaN(neLng) &&
    typeof neLat === 'number' && !isNaN(neLat) &&
    swLat >= -90 && swLat <= 90 &&
    neLat >= -90 && neLat <= 90 &&
    swLng >= -180 && swLng <= 180 &&
    neLng >= -180 && neLng <= 180
  );
}

/**
 * Converts Bounding Box coordinates (EPSG:3857, UTM 48N/49N, VN-2000 or Lat/Lon 4326) to EPSG:4326 LatLngBoundsBox
 */
export function convertAnyBBoxTo4326(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  explicitEpsg?: number | string
): LatLngBoundsBox | null {
  const west = Math.min(minX, maxX);
  const east = Math.max(minX, maxX);
  const south = Math.min(minY, maxY);
  const north = Math.max(minY, maxY);

  // Case 1: Already Lat/Lon degrees in EPSG:4326
  if (
    explicitEpsg === 4326 ||
    explicitEpsg === '4326' ||
    explicitEpsg === 'EPSG:4326' ||
    (!explicitEpsg && west >= -180 && east <= 180 && south >= -90 && north <= 90)
  ) {
    return { south, west, north, east };
  }

  // Case 2: Explicit CRS was provided (e.g. 32648, 3405, 3857, etc.)
  if (explicitEpsg) {
    const code = typeof explicitEpsg === 'number' ? `EPSG:${explicitEpsg}` : explicitEpsg;
    try {
      const sw = proj4(code as string, 'EPSG:4326', [west, south]);
      const ne = proj4(code as string, 'EPSG:4326', [east, north]);
      if (isValid4326(sw, ne)) {
        return {
          south: sw[1],
          west: sw[0],
          north: ne[1],
          east: ne[0],
        };
      }
    } catch (e) {
      console.warn(`Projection from explicit CRS ${code} to EPSG:4326 failed:`, e);
    }
  }

  // Case 3: Coordinates in Vietnam UTM Zone 48N / VN-2000 meter range (X: 100,000 ~ 900,000; Y: 700,000 ~ 3,500,000)
  if (west >= 100000 && east <= 900000 && south >= 700000 && north <= 3500000) {
    try {
      const sw = proj4('EPSG:32648', 'EPSG:4326', [west, south]);
      const ne = proj4('EPSG:32648', 'EPSG:4326', [east, north]);
      if (isValid4326(sw, ne)) {
        return {
          south: sw[1],
          west: sw[0],
          north: ne[1],
          east: ne[0],
        };
      }
    } catch (_) {}
  }

  // Case 4: Web Mercator (EPSG:3857) - meters > 1,000,000 (standard for COG Web Mercator)
  try {
    const sw = proj4('EPSG:3857', 'EPSG:4326', [west, south]);
    const ne = proj4('EPSG:3857', 'EPSG:4326', [east, north]);
    if (isValid4326(sw, ne)) {
      return {
        south: sw[1],
        west: sw[0],
        north: ne[1],
        east: ne[0],
      };
    }
  } catch (e) {
    console.warn('Projection EPSG:3857 failed:', e);
  }

  return { south, west, north, east };
}

export default proj4;
