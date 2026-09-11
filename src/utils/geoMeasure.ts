import L from 'leaflet';

const EARTH_RADIUS = 6378137; // WGS84 radius in meters

/**
 * Calculates total distance (in meters) along a line of LatLng points.
 */
export function calculateLineDistance(points: L.LatLng[]): number {
  if (!points || points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalMeters += points[i].distanceTo(points[i + 1]);
  }
  return totalMeters;
}

/**
 * Format distance value in Vietnamese
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toLocaleString('vi-VN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} km`;
  }
  return `${Math.round(meters).toLocaleString('vi-VN')} m`;
}

/**
 * Calculates geodesic area of a polygon defined by LatLng points (in square meters).
 */
export function calculatePolygonArea(points: L.LatLng[]): number {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const len = points.length;
  for (let i = 0; i < len; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % len];
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const lng1 = (p1.lng * Math.PI) / 180;
    const lng2 = (p2.lng * Math.PI) / 180;
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
  return area;
}

/**
 * Format area value in Vietnamese (m², ha, km²)
 */
export function formatArea(sqMeters: number): string {
  const sqMetersFormatted = Math.round(sqMeters).toLocaleString('vi-VN');
  if (sqMeters >= 10000) {
    const ha = sqMeters / 10000;
    if (ha >= 100) {
      const km2 = sqMeters / 1000000;
      return `${km2.toLocaleString('vi-VN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} km² (${sqMetersFormatted} m²)`;
    }
    return `${ha.toLocaleString('vi-VN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ha (${sqMetersFormatted} m²)`;
  }
  return `${sqMetersFormatted} m²`;
}

/**
 * Extract LatLng array from GeoJSON geometry coordinates
 */
export function extractPolygonLatLngs(coordinates: any): L.LatLng[] {
  const points: L.LatLng[] = [];
  if (!coordinates) return points;

  const collectRing = (arr: any) => {
    if (Array.isArray(arr) && arr.length > 0) {
      if (typeof arr[0] === 'number' && !isNaN(arr[0]) && typeof arr[1] === 'number' && !isNaN(arr[1])) {
        points.push(L.latLng(arr[1], arr[0]));
      } else if (arr[0] && Array.isArray(arr[0]) && arr[0].length > 0) {
        if (typeof arr[0][0] === 'number' && !isNaN(arr[0][0])) {
          arr.forEach((pt: any) => {
            if (Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number' && !isNaN(pt[0]) && !isNaN(pt[1])) {
              points.push(L.latLng(pt[1], pt[0]));
            }
          });
        } else {
          arr.forEach(collectRing);
        }
      }
    }
  };

  collectRing(coordinates);
  return points;
}

/**
 * Generates a regular polygon (e.g. 5-sided pentagon) with a given radius (in meters)
 * centered at a target latitude/longitude using WGS84 spherical geodesic projection.
 * Returns GeoJSON coordinates array: [ [lng, lat], ... , [lng, lat] ] (closed ring).
 *
 * @param centerLat Center latitude in degrees
 * @param centerLng Center longitude in degrees
 * @param radiusMeters Radius in meters (e.g. 150m for a 300m diameter polygon)
 * @param sides Number of sides (default 5 for pentagon)
 */
export function generateRegularPolygonCoordinates(
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  sides: number = 5
): [number, number][] {
  const coordinates: [number, number][] = [];
  const R = EARTH_RADIUS; // WGS84 Earth radius in meters (6378137)
  const angularDistance = radiusMeters / R;

  const latRad = (centerLat * Math.PI) / 180;
  const lngRad = (centerLng * Math.PI) / 180;

  // 0 degrees is North, angles progress clockwise: 0, 72, 144, 216, 288 degrees
  for (let i = 0; i < sides; i++) {
    const bearingRad = (i * 2 * Math.PI) / sides; // Bearing from North

    const ptLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );

    const ptLngRad =
      lngRad +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(ptLatRad)
      );

    const ptLat = (ptLatRad * 180) / Math.PI;
    const ptLng = (ptLngRad * 180) / Math.PI;

    coordinates.push([ptLng, ptLat]);
  }

  // Close the polygon ring by repeating the first vertex
  if (coordinates.length > 0) {
    coordinates.push([coordinates[0][0], coordinates[0][1]]);
  }

  return coordinates;
}
