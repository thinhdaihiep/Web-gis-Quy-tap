import proj4, { convertAnyBBoxTo4326 } from './projections';
import { getRasterProxyUrl } from './rasterCache';
import { LatLngBoundsBox } from '../types';

export interface WorldFileTFW {
  line1_pixelWidth: number; // A: pixel size in the x-direction in map units/pixel
  line2_rotationY: number;  // D: rotation about y-axis
  line3_rotationX: number;  // B: rotation about x-axis
  line4_pixelHeight: number;// E: pixel size in the y-direction in map units, almost always negative
  line5_originX: number;    // C: x-coordinate of the center of the upper left pixel
  line6_originY: number;    // F: y-coordinate of the center of the upper left pixel
}

/**
 * Parses the 6 numeric lines of a .tfw (TIFF World File)
 */
export function parseTFWContent(content: string): WorldFileTFW | null {
  if (!content) return null;
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isNaN(Number(l)));

  if (lines.length < 6) return null;

  const line1_pixelWidth = parseFloat(lines[0]);
  const line2_rotationY = parseFloat(lines[1]);
  const line3_rotationX = parseFloat(lines[2]);
  const line4_pixelHeight = parseFloat(lines[3]);
  const line5_originX = parseFloat(lines[4]);
  const line6_originY = parseFloat(lines[5]);

  if (
    isNaN(line1_pixelWidth) ||
    isNaN(line4_pixelHeight) ||
    isNaN(line5_originX) ||
    isNaN(line6_originY)
  ) {
    return null;
  }

  return {
    line1_pixelWidth,
    line2_rotationY,
    line3_rotationX,
    line4_pixelHeight,
    line5_originX,
    line6_originY,
  };
}

/**
 * Robust fetch for .tfw files trying backend proxy first to avoid any CORS errors
 */
export async function fetchTFWText(url: string): Promise<string> {
  const urlsToTry = [
    getRasterProxyUrl(url),
    url,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  let lastError: any = null;
  for (const targetUrl of urlsToTry) {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          return text;
        }
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error(`Failed to fetch TFW file from ${url}`);
}

/**
 * Converts .tfw world file parameters + image dimensions into flat LatLngBoundsBox
 *
 * @param tfw Parsed TFW values
 * @param width Image width in pixels (optional, defaults to 0 if unknown)
 * @param height Image height in pixels (optional, defaults to 0 if unknown)
 * @param epsg Code of the coordinate system (e.g. 3857 or 4326)
 */
export function computeBoundsFromTFW(
  tfw: WorldFileTFW,
  width?: number,
  height?: number,
  epsg: number = 3857
): LatLngBoundsBox | null {
  const { line1_pixelWidth, line4_pixelHeight, line5_originX, line6_originY } = tfw;

  // Upper-left corner (center of pixel adjusted or exact)
  const minX = line5_originX;
  const maxY = line6_originY;

  // If width and height are known, calculate lower-right corner
  let maxX: number;
  let minY: number;

  if (width && height && width > 0 && height > 0) {
    maxX = line5_originX + line1_pixelWidth * width;
    minY = line6_originY + line4_pixelHeight * height; // line4_pixelHeight is negative
  } else {
    // If width/height unknown, fallback to default box or estimation
    maxX = line5_originX + Math.abs(line1_pixelWidth) * 1000;
    minY = line6_originY - Math.abs(line4_pixelHeight) * 1000;
  }

  const west = Math.min(minX, maxX);
  const east = Math.max(minX, maxX);
  const south = Math.min(minY, maxY);
  const north = Math.max(minY, maxY);

  return convertAnyBBoxTo4326(west, south, east, north, epsg);
}
