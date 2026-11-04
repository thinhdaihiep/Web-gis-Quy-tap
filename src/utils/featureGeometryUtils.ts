import { isDemoFeatureId } from '../firebaseService';

export function getFeatureCoordsAndType(featOrGeom: any): { type: string; coordinates: any } {
  if (!featOrGeom) return { type: 'Point', coordinates: [0, 0] };
  const type = featOrGeom.type || featOrGeom.geometry?.type || 'Point';
  const coordinates = featOrGeom.coordinates || featOrGeom.geometry?.coordinates || [0, 0];
  return { type, coordinates };
}

export function computeFeatureCenter(featOrGeom: any): [number, number] {
  const { type, coordinates } = getFeatureCoordsAndType(featOrGeom);
  if (type === 'Point' && Array.isArray(coordinates) && typeof coordinates[0] === 'number' && !isNaN(coordinates[0])) {
    return [coordinates[0], coordinates[1]];
  }

  let totalLng = 0;
  let totalLat = 0;
  let count = 0;

  const extract = (arr: any) => {
    if (
      Array.isArray(arr) &&
      arr.length >= 2 &&
      typeof arr[0] === 'number' &&
      !isNaN(arr[0]) &&
      typeof arr[1] === 'number' &&
      !isNaN(arr[1])
    ) {
      totalLng += arr[0];
      totalLat += arr[1];
      count++;
    } else if (Array.isArray(arr)) {
      arr.forEach(extract);
    }
  };

  extract(coordinates);
  if (count === 0) return [0, 0];
  return [totalLng / count, totalLat / count];
}

export function shiftFeatureCoordinates(featOrGeom: any, deltaLng: number, deltaLat: number): any {
  const { coordinates } = getFeatureCoordsAndType(featOrGeom);

  const shift = (arr: any): any => {
    if (
      Array.isArray(arr) &&
      arr.length >= 2 &&
      typeof arr[0] === 'number' &&
      !isNaN(arr[0]) &&
      typeof arr[1] === 'number' &&
      !isNaN(arr[1])
    ) {
      return [
        Number((arr[0] + deltaLng).toFixed(6)),
        Number((arr[1] + deltaLat).toFixed(6)),
      ];
    }
    if (Array.isArray(arr)) {
      return arr.map(shift);
    }
    return arr;
  };

  return shift(coordinates);
}

export function isInvalidOrTargetToDeleteFeature(f: any): boolean {
  if (!f) return true;
  if (isDemoFeatureId(f.id)) return true;
  const strId = String(f.id || '');
  const strObjId = String(
    f.properties?.OBJECTID ||
      f.properties?.objectid ||
      f.properties?.ObjectID ||
      f.objectid ||
      f.OBJECTID ||
      ''
  );

  if (strId.includes('1785978345694') || strObjId.includes('1785978345694')) {
    return true;
  }
  return false;
}
