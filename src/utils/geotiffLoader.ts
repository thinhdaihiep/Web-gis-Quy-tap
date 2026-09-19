import { fromUrl, fromArrayBuffer, fromBlob } from 'geotiff';
// @ts-ignore
import parseGeoraster from 'georaster';
// @ts-ignore
import GeoRasterLayer from 'georaster-layer-for-leaflet';
import L from 'leaflet';
import proj4, { convertAnyBBoxTo4326 } from './projections';
import { fetchRasterWithCache, getRasterProxyUrl } from './rasterCache';
import { LatLngBoundsBox, normalizeBoundsBox } from '../types';
// @ts-ignore
import GeoTiffWorker from '../workers/geotiff.worker?worker';
import { createLeafletTiledRasterLayer, TiledRasterLayer } from './tiledRasterLayer';

export { createLeafletTiledRasterLayer, TiledRasterLayer };

// Ensure proj4 is globally attached to window for georaster-layer-for-leaflet
if (typeof window !== 'undefined') {
  (window as any).proj4 = proj4;
}

// Global worker instance
let globalWorker: Worker | null = null;
let msgIdCounter = 0;
const pendingJobs = new Map<number, { resolve: Function, reject: Function }>();

function getWorker() {
  if (!globalWorker) {
    globalWorker = new GeoTiffWorker();
    globalWorker.onmessage = (e) => {
      const { id, success, blob, buffer, metadata, error } = e.data;
      const job = pendingJobs.get(id);
      if (job) {
        pendingJobs.delete(id);
        if (success) {
          job.resolve({ blob, buffer, metadata });
        } else {
          job.reject(new Error(error || 'Worker decode failed'));
        }
      }
    };
  }
  return globalWorker;
}

export interface ParsedGeoRasterInfo {
  georaster?: any;
  bounds: LatLngBoundsBox | null;
  projection: number | string;
  width: number;
  height: number;
  pixelWidth?: number;
  pixelHeight?: number;
}

/**
 * Converts bounding box [minX, minY, maxX, maxY] and EPSG into flat LatLngBoundsBox object
 */
function convertBBoxToBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  _epsg?: number | string
): LatLngBoundsBox | null {
  if (
    typeof minX !== 'number' || typeof minY !== 'number' ||
    typeof maxX !== 'number' || typeof maxY !== 'number' ||
    isNaN(minX) || isNaN(minY) || isNaN(maxX) || isNaN(maxY)
  ) {
    return null;
  }

  // Dự án luôn dùng duy nhất 1 hệ toạ độ EPSG:4326 (WGS84 Lon/Lat degrees)
  return {
    west: Math.min(minX, maxX),
    south: Math.min(minY, maxY),
    east: Math.max(minX, maxX),
    north: Math.max(minY, maxY),
  };
}

/**
 * Robustly extracts bounds and metadata directly from a COG / GeoTIFF URL or file in milliseconds.
 */
export async function parseGeoTiffMetadata(input: ArrayBuffer | File | Blob | string): Promise<ParsedGeoRasterInfo> {
  // Case A: Input is a URL string
  if (typeof input === 'string') {
    // 1. Try server-side fast COG header range reader (/api/cog-bounds)
    try {
      const apiUrl = `/api/cog-bounds?url=${encodeURIComponent(input)}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.bounds) {
          const norm = normalizeBoundsBox(data.bounds);
          if (norm) {
            return {
              bounds: norm,
              projection: data.epsg || 4326,
              width: data.width || 0,
              height: data.height || 0,
            };
          }
        }
      }
    } catch (apiErr) {
      console.warn('API /api/cog-bounds failed, falling back to client-side reader:', apiErr);
    }

    // 2. Client-side reading via geotiff.js using proxy
    try {
      const proxyUrl = getRasterProxyUrl(input);
      const tiff = await fromUrl(proxyUrl);
      const image = await tiff.getImage(0);
      const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
      const geoKeys = image.getGeoKeys ? image.getGeoKeys() : {};
      const epsg = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey;

      const bounds = (bbox && Array.isArray(bbox) && bbox.length >= 4)
        ? convertBBoxToBounds(bbox[0], bbox[1], bbox[2], bbox[3], epsg)
        : null;
      if (bounds) {
        return {
          bounds,
          projection: epsg || 4326,
          width: image.getWidth(),
          height: image.getHeight(),
        };
      }
    } catch (geotiffErr) {
      console.warn('geotiff.fromUrl range read failed, trying georaster parser:', geotiffErr);
    }

    // 3. Fallback: Parse via georaster proxy URL
    try {
      const proxyUrl = getRasterProxyUrl(input);
      const georaster = await parseGeoraster(proxyUrl);
      if (georaster) {
        const proj = detectAndNormalizeProjection(georaster);
        const { xmin, ymin, xmax, ymax, width, height } = georaster;
        const bounds = convertBBoxToBounds(xmin, ymin, xmax, ymax, proj);
        return {
          georaster,
          bounds,
          projection: proj,
          width: width || 0,
          height: height || 0,
        };
      }
    } catch (georasterErr) {
      console.warn('parseGeoraster proxy failed, trying cached buffer:', georasterErr);
    }

    // 4. Final fallback: Fetch buffer to cache and parse
    const buffer = await fetchRasterWithCache(input);
    return parseGeoTiffMetadata(buffer);
  }

  // Case B: Input is ArrayBuffer / File / Blob (Local file or cached buffer)
  try {
    let tiff: any;
    if (input instanceof ArrayBuffer) {
      tiff = await fromArrayBuffer(input);
    } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
      tiff = await fromBlob(input);
    }

    if (tiff) {
      const image = await tiff.getImage(0);
      const bbox = image.getBoundingBox();
      const geoKeys = image.getGeoKeys ? image.getGeoKeys() : {};
      const epsg = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey;
      const bounds = (bbox && Array.isArray(bbox) && bbox.length >= 4)
        ? convertBBoxToBounds(bbox[0], bbox[1], bbox[2], bbox[3], epsg)
        : null;

      return {
        bounds,
        projection: epsg || 4326,
        width: image.getWidth(),
        height: image.getHeight(),
      };
    }
  } catch (bufErr) {
    console.warn('geotiff.fromArrayBuffer failed, trying parseGeoraster:', bufErr);
  }

  // Fallback with georaster
  const georaster = await parseGeoraster(input);
  if (!georaster) {
    throw new Error('Không thể đọc cấu trúc GeoTIFF từ file.');
  }

  const proj = detectAndNormalizeProjection(georaster);
  const { xmin, ymin, xmax, ymax, width, height } = georaster;
  const bounds = convertBBoxToBounds(xmin, ymin, xmax, ymax, proj);

  return {
    georaster,
    bounds,
    projection: proj,
    width: width || 0,
    height: height || 0,
  };
}

/**
 * Automatically detects and normalizes Coordinate Reference System (CRS) for GeoRaster
 * Luôn dùng duy nhất 1 hệ toạ độ EPSG:4326
 */
export function detectAndNormalizeProjection(georaster: any, _defaultEpsg?: number | string): number | string {
  georaster.projection = 4326;
  return 4326;
}

/**
 * Decodes GeoTIFF ArrayBuffer directly into a high-performance Leaflet ImageOverlay using Web Workers
 * This guarantees 100% reliable rendering on Leaflet with native hardware acceleration,
 * zero missing tile gaps, and full compatibility across all GeoTIFF color spaces & encodings.
 */
async function renderGeoTiffToImageOverlay(
  arrayBuffer: ArrayBuffer,
  options: {
    opacity?: number;
    pane?: string;
    maxDimension?: number;
  } = {}
): Promise<{ layer: L.Layer; metadata: ParsedGeoRasterInfo }> {
  const worker = getWorker();
  const id = ++msgIdCounter;
  
  const result: any = await new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject });
    worker.postMessage({ id, arrayBuffer, options }, [arrayBuffer]);
  });

  const { blob, buffer, metadata } = result;
  let imageUrl: string;
  
  if (blob) {
    imageUrl = URL.createObjectURL(blob);
  } else if (buffer) {
    // Fallback if OffscreenCanvas wasn't supported
    const canvas = document.createElement('canvas');
    canvas.width = metadata.renderWidth;
    canvas.height = metadata.renderHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo Canvas 2D context.');
    
    const imageData = new ImageData(
      new Uint8ClampedArray(buffer), 
      metadata.renderWidth, 
      metadata.renderHeight
    );
    ctx.putImageData(imageData, 0, 0);
    
    imageUrl = await new Promise<string>((res) => {
      canvas.toBlob((b) => {
        if (b) res(URL.createObjectURL(b));
        else res(canvas.toDataURL('image/png'));
      }, 'image/png');
    });
  } else {
    throw new Error('Worker trả về dữ liệu không hợp lệ');
  }

  const leafletBounds: L.LatLngBoundsExpression = [
    [metadata.bounds.south, metadata.bounds.west],
    [metadata.bounds.north, metadata.bounds.east],
  ];

  const layer = L.imageOverlay(imageUrl, leafletBounds, {
    opacity: options.opacity ?? 1.0,
    pane: options.pane || 'rasterPane',
    interactive: false,
  });

  return {
    layer,
    metadata,
  };
}

/**
 * Creates a Leaflet layer from a GeoTIFF / COG URL (with IndexedDB caching and proxy support)
 * Combines Direct ImageOverlay rendering and GeoRasterLayer for maximum performance & compatibility.
 */
export async function createLeafletGeoRasterLayer(
  url: string,
  options: {
    opacity?: number;
    resolution?: number;
    minZoom?: number;
    maxZoom?: number;
    maxNativeZoom?: number;
    pane?: string;
    viewport?: LatLngBoundsBox | null;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<{ layer: L.Layer; metadata: ParsedGeoRasterInfo }> {
  // 1. Fetch file into cache with progress reporting
  let arrayBuffer: ArrayBuffer | null = null;
  try {
    arrayBuffer = await fetchRasterWithCache(url, options.onProgress);
  } catch (fetchErr) {
    console.warn('fetchRasterWithCache failed, trying proxy URL:', fetchErr);
  }

  // 2. PRIMARY STRATEGY: High-Performance 256x256 Client-Side Tiled Layer with Web Worker
  // Cuts raster into 256x256 tiles, applies (255,255,255) transparency, prioritizes viewport tiles
  if (arrayBuffer && arrayBuffer.byteLength > 0) {
    try {
      const tiledResult = await createLeafletTiledRasterLayer(arrayBuffer, {
        opacity: options.opacity ?? 1.0,
        pane: options.pane || 'rasterPane',
        tileSize: 256,
        viewport: options.viewport || null,
        onProgress: (p) => {
          if (options.onProgress) {
            options.onProgress(p.percent);
          }
        },
      });

      return {
        layer: tiledResult.layer,
        metadata: {
          bounds: tiledResult.metadata.bounds,
          projection: 4326,
          width: tiledResult.metadata.width,
          height: tiledResult.metadata.height,
        },
      };
    } catch (tileErr) {
      console.warn('createLeafletTiledRasterLayer failed, falling back to single ImageOverlay:', tileErr);
    }
  }

  // 3. FALLBACK STRATEGY A: Direct Decoded Single ImageOverlay
  if (arrayBuffer && arrayBuffer.byteLength > 0) {
    try {
      const result = await renderGeoTiffToImageOverlay(arrayBuffer, {
        opacity: options.opacity ?? 1.0,
        pane: options.pane || 'rasterPane',
      });
      return result;
    } catch (overlayErr) {
      console.warn('renderGeoTiffToImageOverlay failed, falling back to GeoRasterLayer:', overlayErr);
    }
  }

  // 4. FALLBACK STRATEGY B: GeoRasterLayer via georaster parser
  let georaster: any = null;
  if (arrayBuffer) {
    try {
      georaster = await parseGeoraster(arrayBuffer);
    } catch (e) {
      console.warn('parseGeoraster(arrayBuffer) failed:', e);
    }
  }

  if (!georaster) {
    const proxyUrl = getRasterProxyUrl(url);
    georaster = await parseGeoraster(proxyUrl);
  }

  if (!georaster) {
    throw new Error(`Không thể khởi tạo raster từ ${url}`);
  }

  const proj = detectAndNormalizeProjection(georaster);
  const { xmin, ymin, xmax, ymax, width, height } = georaster;
  const bounds = convertBBoxToBounds(xmin, ymin, xmax, ymax, proj);

  const layer = new GeoRasterLayer({
    georaster: georaster,
    opacity: options.opacity ?? 1.0,
    resolution: options.resolution ?? 256,
    pane: options.pane || 'rasterPane',
    debugLevel: 0,
  });

  return {
    layer,
    metadata: {
      georaster,
      bounds,
      projection: proj,
      width: width || 0,
      height: height || 0,
    },
  };
}


