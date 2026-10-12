/**
 * Utility functions to detect and sanitize unwanted ArcGIS geometry calculation fields
 * (Shape_Area, Shape_Length, etc.) that do not belong to the business data.
 */

export function isShapeProperty(key: string): boolean {
  if (!key) return false;
  const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    norm === 'shapearea' ||
    norm === 'shapelength' ||
    norm === 'shapeleng' ||
    norm.startsWith('shapearea') ||
    norm.startsWith('shapelength') ||
    norm.startsWith('shapeleng')
  );
}

export function cleanShapeProperties<T extends Record<string, any>>(props: T | undefined | null): T {
  if (!props || typeof props !== 'object') {
    return {} as T;
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(props)) {
    if (!isShapeProperty(key)) {
      result[key] = val;
    }
  }
  return result as T;
}
