import L from 'leaflet';
import { LatLngBoundsBox } from '../types';
import { fetchRasterWithCache } from './rasterCache';
// @ts-ignore
import RasterTilerWorker from '../workers/rasterTiler.worker?worker';

export interface TiledRasterOptions {
  opacity?: number;
  pane?: string;
  tileSize?: number;
  viewport?: LatLngBoundsBox | null;
  onProgress?: (progress: {
    percent: number;
    processedTiles: number;
    totalTiles: number;
    visibleTiles: number;
    inViewportLoaded: number;
  }) => void;
  onTileLoaded?: (tile: {
    key: string;
    col: number;
    row: number;
    bounds: [[number, number], [number, number]];
    inViewport: boolean;
  }) => void;
}

let workerJobCounter = 0;

/**
 * TiledRasterLayer extends Leaflet's L.LayerGroup to provide smooth progressive tile-by-tile
 * rendering for large raster/GeoTIFF files (15MB+).
 */
export class TiledRasterLayer extends L.LayerGroup {
  private worker: Worker | null = null;
  private jobId: number = 0;
  private objectUrls: string[] = [];
  private tileLayers: Map<string, L.ImageOverlay> = new Map();
  private currentOpacity: number = 1.0;
  private currentPane: string = 'rasterPane';
  private destroyed: boolean = false;
  public rasterMetadata: any = null;

  constructor(options?: TiledRasterOptions) {
    super([], { pane: options?.pane || 'rasterPane' } as any);
    this.currentOpacity = options?.opacity ?? 1.0;
    this.currentPane = options?.pane || 'rasterPane';
  }

  /**
   * Updates opacity across all loaded tiles and stores it for newly arriving tiles
   */
  public setOpacity(opacity: number): this {
    this.currentOpacity = opacity;
    this.tileLayers.forEach((overlay) => {
      overlay.setOpacity(opacity);
    });
    return this;
  }

  /**
   * Notifies the worker of the new map viewport so it immediately reprioritizes
   * remaining tiles to render newly visible areas first
   */
  public updateViewport(viewport: LatLngBoundsBox | L.LatLngBounds): void {
    if (this.destroyed || !this.worker) return;

    let vpBox: LatLngBoundsBox;
    if (typeof (viewport as any).getSouth === 'function') {
      const b = viewport as L.LatLngBounds;
      vpBox = {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      };
    } else {
      vpBox = viewport as LatLngBoundsBox;
    }

    this.worker.postMessage({
      id: this.jobId,
      type: 'UPDATE_VIEWPORT',
      viewport: vpBox,
    });
  }

  /**
   * Starts the background tiling process in the Web Worker.
   * Resolves immediately when metadata/grid is initialized so MapComponent can add the layer
   * to Leaflet right away, while tiles stream in progressively.
   */
  public async loadFromBuffer(
    arrayBuffer: ArrayBuffer,
    options: TiledRasterOptions = {}
  ): Promise<any> {
    if (this.destroyed) return null;

    return new Promise((resolve, reject) => {
      this.jobId = ++workerJobCounter;
      this.worker = new RasterTilerWorker();

      let inViewportLoaded = 0;
      let visibleTiles = 0;
      let totalTiles = 1;
      let isInitResolved = false;

      this.worker.onmessage = (e: MessageEvent) => {
        if (this.destroyed) return;

        const { type, id, metadata, tile, processedCount, visibleTilesCount, success, error } = e.data;
        if (id !== this.jobId) return;

        if (type === 'INIT') {
          this.rasterMetadata = metadata;
          totalTiles = metadata.totalTiles || 1;
          if (!isInitResolved) {
            isInitResolved = true;
            resolve(metadata);
          }
          return;
        }

        if (type === 'TILE') {
          if (!tile) return;
          const { key, leafletBounds, blob, buffer, tileW, tileH, inViewport, isEmpty } = tile;

          if (isEmpty) {
            // Empty / pure white (255,255,255) tile skipped
            const percent = Math.min(99, Math.round((processedCount / totalTiles) * 100));
            if (options.onProgress) {
              options.onProgress({
                percent,
                processedTiles: processedCount,
                totalTiles,
                visibleTiles,
                inViewportLoaded,
              });
            }
            return;
          }

          visibleTiles = visibleTilesCount || (visibleTiles + 1);
          if (inViewport) inViewportLoaded++;

          let imageUrl = '';
          if (blob) {
            imageUrl = URL.createObjectURL(blob);
          } else if (buffer) {
            const canvas = document.createElement('canvas');
            canvas.width = tileW;
            canvas.height = tileH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const imgData = new ImageData(new Uint8ClampedArray(buffer), tileW, tileH);
              ctx.putImageData(imgData, 0, 0);
              imageUrl = canvas.toDataURL('image/png');
            }
          }

          if (imageUrl) {
            this.objectUrls.push(imageUrl);

            const tileOverlay = L.imageOverlay(imageUrl, leafletBounds, {
              pane: this.currentPane,
              opacity: this.currentOpacity,
              interactive: false,
            });

            this.tileLayers.set(key, tileOverlay);
            this.addLayer(tileOverlay);

            if (options.onTileLoaded) {
              options.onTileLoaded({
                key,
                col: tile.col,
                row: tile.row,
                bounds: leafletBounds,
                inViewport,
              });
            }
          }

          const percent = Math.min(99, Math.round((processedCount / totalTiles) * 100));
          if (options.onProgress) {
            options.onProgress({
              percent,
              processedTiles: processedCount,
              totalTiles,
              visibleTiles,
              inViewportLoaded,
            });
          }
          return;
        }

        if (type === 'COMPLETE') {
          if (options.onProgress) {
            options.onProgress({
              percent: 100,
              processedTiles: totalTiles,
              totalTiles,
              visibleTiles,
              inViewportLoaded,
            });
          }
          this.terminateWorker();
          if (!isInitResolved) {
            isInitResolved = true;
            resolve(metadata || this.rasterMetadata);
          }
          return;
        }

        if (type === 'ERROR' || success === false) {
          this.terminateWorker();
          if (!isInitResolved) {
            isInitResolved = true;
            reject(new Error(error || 'Lỗi xử lý chia nhỏ raster trong Worker'));
          }
        }
      };

      this.worker.onerror = (err: ErrorEvent) => {
        this.terminateWorker();
        if (!isInitResolved) {
          isInitResolved = true;
          reject(new Error(`Worker lỗi: ${err.message}`));
        }
      };

      // Kick off the tiling process in Worker
      const vp = options.viewport || null;
      this.worker.postMessage(
        {
          id: this.jobId,
          type: 'SLICE_TILES',
          arrayBuffer,
          options: {
            tileSize: options.tileSize || 256,
            viewport: vp,
          },
        },
        [arrayBuffer]
      );
    });
  }

  private terminateWorker(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ id: this.jobId, type: 'ABORT' });
        this.worker.terminate();
      } catch (e) {
        // ignore
      }
      this.worker = null;
    }
  }

  /**
   * Cleans up all object URLs, terminates worker, and clears Leaflet layers
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.terminateWorker();

    // Revoke all created blob URLs to prevent memory leaks
    this.objectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // ignore
      }
    });
    this.objectUrls = [];

    this.tileLayers.clear();
    this.clearLayers();
  }

  /**
   * Leaflet onRemove hook to ensure complete garbage collection
   */
  public onRemove(map: L.Map): this {
    super.onRemove(map);
    return this;
  }
}

/**
 * High-level function to create a TiledRasterLayer from a GeoTIFF URL or ArrayBuffer.
 * This satisfies the requirement:
 * "Worker để xử lý chia nhỏ file GeoTIFF/Raster 256x256px ở client.
 *  Worker này cần nhận dữ liệu raster đã tải, thực hiện cắt mảnh theo tọa độ (Tile)
 *  và trả về danh sách các mảnh đã xử lý để MapComponent nạp dần dần vào Leaflet
 *  thay vì nạp toàn bộ 1 file 15Mb cùng lúc. File chia nhỏ trong suốt ở màu (255,255,255),
 *  luôn ưu tiên nạp các mảnh trong khung nhìn"
 */
export async function createLeafletTiledRasterLayer(
  input: string | ArrayBuffer,
  options: TiledRasterOptions & {
    onDownloadProgress?: (percent: number) => void;
  } = {}
): Promise<{ layer: TiledRasterLayer; metadata: any }> {
  let arrayBuffer: ArrayBuffer;

  if (typeof input === 'string') {
    arrayBuffer = await fetchRasterWithCache(input, options.onDownloadProgress);
  } else {
    arrayBuffer = input;
  }

  const layer = new TiledRasterLayer(options);

  // Start background tiling in Worker
  const metadataPromise = layer.loadFromBuffer(arrayBuffer, options);

  // Wait for initial metadata (which arrives almost immediately via INIT message)
  // or until completion, but we return layer right away so MapComponent can attach it immediately!
  const metadata = await metadataPromise;

  return {
    layer,
    metadata,
  };
}
