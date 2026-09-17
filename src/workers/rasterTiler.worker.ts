import { fromArrayBuffer } from 'geotiff';

export interface TileBoundsBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface TileDescriptor {
  key: string;
  col: number;
  row: number;
  x0: number;
  y0: number;
  tileW: number;
  tileH: number;
  boundsBox: TileBoundsBox;
  leafletBounds: [[number, number], [number, number]];
  centerLat: number;
  centerLng: number;
  inViewport: boolean;
  distToCenter: number;
}

export interface WorkerTileResult {
  key: string;
  col: number;
  row: number;
  tileW: number;
  tileH: number;
  boundsBox: TileBoundsBox;
  leafletBounds: [[number, number], [number, number]];
  blob?: Blob;
  buffer?: ArrayBuffer;
  inViewport: boolean;
  isEmpty: boolean;
}

const postMsg = (msg: any, transfer?: Transferable[]) => {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(msg, transfer);
  } else {
    (self as unknown as Worker).postMessage(msg);
  }
};

// Active job state to allow cooperative streaming, viewport reprioritization, and cancellation
let activeJob: {
  id: number;
  aborted: boolean;
  fullData32: Uint32Array | null;
  width: number;
  height: number;
  resX: number;
  resY: number;
  bounds: TileBoundsBox;
  sortedTiles: TileDescriptor[];
  currentIndex: number;
  processedCount: number;
  visibleTilesCount: number;
  totalTiles: number;
  viewport: TileBoundsBox | null;
} | null = null;

function computeTileMetrics(
  col: number,
  row: number,
  tileSize: number,
  width: number,
  height: number,
  bounds: TileBoundsBox,
  resX: number,
  resY: number,
  viewport: TileBoundsBox | null
): TileDescriptor {
  const x0 = col * tileSize;
  const y0 = row * tileSize;
  const tileW = Math.min(tileSize, width - x0);
  const tileH = Math.min(tileSize, height - y0);

  const tileWest = bounds.west + x0 * resX;
  const tileEast = bounds.west + (x0 + tileW) * resX;
  const tileNorth = bounds.north - y0 * resY;
  const tileSouth = bounds.north - (y0 + tileH) * resY;

  const centerLat = (tileSouth + tileNorth) / 2;
  const centerLng = (tileWest + tileEast) / 2;

  let inViewport = true;
  let distToCenter = 0;

  if (viewport) {
    inViewport = !(
      tileNorth < viewport.south ||
      tileSouth > viewport.north ||
      tileEast < viewport.west ||
      tileWest > viewport.east
    );

    const vpCenterLat = (viewport.south + viewport.north) / 2;
    const vpCenterLng = (viewport.west + viewport.east) / 2;
    const dLat = centerLat - vpCenterLat;
    const dLng = centerLng - vpCenterLng;
    distToCenter = dLat * dLat + dLng * dLng;
  }

  return {
    key: `${col}_${row}`,
    col,
    row,
    x0,
    y0,
    tileW,
    tileH,
    boundsBox: {
      south: tileSouth,
      west: tileWest,
      north: tileNorth,
      east: tileEast,
    },
    leafletBounds: [
      [tileSouth, tileWest],
      [tileNorth, tileEast],
    ],
    centerLat,
    centerLng,
    inViewport,
    distToCenter,
  };
}

function sortTilesByPriority(tiles: TileDescriptor[]): void {
  tiles.sort((a, b) => {
    // 1. Prioritize tiles within the viewport
    if (a.inViewport && !b.inViewport) return -1;
    if (!a.inViewport && b.inViewport) return 1;
    // 2. Sort by distance to the viewport center (ascending - closest first)
    return a.distToCenter - b.distToCenter;
  });
}

self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  if (!data) return;

  const { type, id } = data;

  // Handler: Reprioritize remaining un-processed tiles when viewport changes
  if (type === 'UPDATE_VIEWPORT') {
    if (activeJob && activeJob.id === id && !activeJob.aborted) {
      const newVp: TileBoundsBox = data.viewport;
      activeJob.viewport = newVp;

      // Update remaining tiles starting from currentIndex
      const remaining = activeJob.sortedTiles.slice(activeJob.currentIndex);
      const vpCenterLat = (newVp.south + newVp.north) / 2;
      const vpCenterLng = (newVp.west + newVp.east) / 2;

      for (const t of remaining) {
        t.inViewport = !(
          t.boundsBox.north < newVp.south ||
          t.boundsBox.south > newVp.north ||
          t.boundsBox.east < newVp.west ||
          t.boundsBox.west > newVp.east
        );
        const dLat = t.centerLat - vpCenterLat;
        const dLng = t.centerLng - vpCenterLng;
        t.distToCenter = dLat * dLat + dLng * dLng;
      }

      sortTilesByPriority(remaining);
      activeJob.sortedTiles.splice(activeJob.currentIndex, remaining.length, ...remaining);
    }
    return;
  }

  // Handler: Abort active tiling job
  if (type === 'ABORT') {
    if (activeJob && activeJob.id === id) {
      activeJob.aborted = true;
      activeJob.fullData32 = null;
      activeJob = null;
    }
    return;
  }

  // Primary Handler: Start Tiling Process
  if (type === 'SLICE_TILES' || !type) {
    const { arrayBuffer, options } = data;
    if (!arrayBuffer) {
      postMsg({ id, success: false, error: 'Dữ liệu ArrayBuffer trống' });
      return;
    }

    try {
      const tiff = await fromArrayBuffer(arrayBuffer);
      const imageCount = await tiff.getImageCount();
      const firstImage = await tiff.getImage(0);

      const origWidth = firstImage.getWidth();
      const origHeight = firstImage.getHeight();
      const bbox = firstImage.getBoundingBox();

      if (!bbox || !Array.isArray(bbox) || bbox.length < 4) {
        throw new Error('Không thể xác định toạ độ địa lý (Bounding Box) của file GeoTIFF.');
      }

      // EPSG:4326 bounds
      const bounds: TileBoundsBox = {
        west: Math.min(bbox[0], bbox[2]),
        south: Math.min(bbox[1], bbox[3]),
        east: Math.max(bbox[0], bbox[2]),
        north: Math.max(bbox[1], bbox[3]),
      };

      if (
        isNaN(bounds.west) || isNaN(bounds.south) ||
        isNaN(bounds.east) || isNaN(bounds.north)
      ) {
        throw new Error('Toạ độ Bounding Box của file GeoTIFF không hợp lệ.');
      }

      let targetImage = firstImage;
      const maxDim = options?.maxDimension || 8192;
      if (origWidth > maxDim || origHeight > maxDim) {
        for (let i = 0; i < imageCount; i++) {
          const img = await tiff.getImage(i);
          if (img.getWidth() <= maxDim && img.getHeight() <= maxDim) {
            targetImage = img;
            break;
          }
        }
      }

      const width = targetImage.getWidth();
      const height = targetImage.getHeight();

      const totalPixels = width * height;
      const fullBuffer = new ArrayBuffer(totalPixels * 4);
      const fullData32 = new Uint32Array(fullBuffer);

      const colorMap =
        (targetImage.fileDirectory as any)?.ColorMap ||
        (firstImage.fileDirectory as any)?.ColorMap ||
        (tiff as any)?.fileDirectories?.[0]?.ColorMap;

      const rawNoData =
        (targetImage.fileDirectory as any)?.GDAL_NODATA ??
        (firstImage.fileDirectory as any)?.GDAL_NODATA;

      const parsedNoDataList: number[] = [];
      if (rawNoData !== undefined && rawNoData !== null) {
        const parsedVal = parseFloat(String(rawNoData).trim());
        if (!isNaN(parsedVal)) {
          parsedNoDataList.push(parsedVal);
        }
      }

      let decoded = false;

      // STRATEGY 1: ColorMap / Indexed Color (Palette)
      if (colorMap && colorMap.length >= 768) {
        try {
          const rasters: any = await targetImage.readRasters({ interleave: false });
          const indexBand = Array.isArray(rasters) ? rasters[0] : rasters;
          if (indexBand && indexBand.length >= totalPixels) {
            const numColors = Math.floor(colorMap.length / 3);
            const is16BitColorMap = colorMap.some((c: number) => c > 255);
            const scale = is16BitColorMap ? 256 : 1;
            const lut32 = new Uint32Array(numColors);

            for (let c = 0; c < numColors; c++) {
              const r = Math.min(255, Math.max(0, Math.floor((colorMap[c] || 0) / scale)));
              const g = Math.min(255, Math.max(0, Math.floor((colorMap[c + numColors] || 0) / scale)));
              const b = Math.min(255, Math.max(0, Math.floor((colorMap[c + numColors * 2] || 0) / scale)));
              
              // Transparency at pure white (255, 255, 255)
              const isWhite = (r === 255 && g === 255 && b === 255);
              const a = isWhite ? 0 : 255;
              lut32[c] = (a << 24) | (b << 16) | (g << 8) | r;
            }

            for (let i = 0; i < totalPixels; i++) {
              fullData32[i] = lut32[indexBand[i]];
            }
            decoded = true;
          }
        } catch (paletteErr) {
          console.warn('Worker [Tile]: Palette decode failed, trying readRGB:', paletteErr);
        }
      }

      // STRATEGY 2: Built-in readRGB
      if (!decoded) {
        try {
          const rgbData: any = await targetImage.readRGB({ interleave: true });
          if (rgbData && rgbData.length >= width * height * 3) {
            const isRgba = rgbData.length >= totalPixels * 4;
            let srcIdx = 0;
            for (let p = 0; p < totalPixels; p++) {
              const r = rgbData[srcIdx];
              const g = rgbData[srcIdx + 1];
              const b = rgbData[srcIdx + 2];
              const a = isRgba ? rgbData[srcIdx + 3] : 255;

              // Pure white (255,255,255) transparency
              const isWhite = (r === 255 && g === 255 && b === 255);
              const alpha = isWhite ? 0 : a;

              fullData32[p] = (alpha << 24) | (b << 16) | (g << 8) | r;
              srcIdx += isRgba ? 4 : 3;
            }
            decoded = true;
          }
        } catch (rgbErr) {
          console.warn('Worker [Tile]: readRGB failed, trying readRasters:', rgbErr);
        }
      }

      // STRATEGY 3: Multi-band / Single-band rasters
      if (!decoded) {
        try {
          const rasters: any = await targetImage.readRasters({ interleave: false });
          const numBands = Array.isArray(rasters) ? rasters.length : 1;

          if (numBands >= 3 && rasters && rasters[0] && rasters[1] && rasters[2]) {
            const rBand = rasters[0];
            const gBand = rasters[1];
            const bBand = rasters[2];
            const aBand = numBands >= 4 && rasters[3] ? rasters[3] : null;

            for (let i = 0; i < totalPixels; i++) {
              const r = rBand[i] ?? 0;
              const g = gBand[i] ?? 0;
              const b = bBand[i] ?? 0;
              let alpha = aBand ? (aBand[i] > 1 ? aBand[i] : aBand[i] * 255) : 255;

              const isWhite = (r === 255 && g === 255 && b === 255);
              if (isWhite) alpha = 0;

              fullData32[i] = (alpha << 24) | (b << 16) | (g << 8) | r;
            }
            decoded = true;
          } else if (numBands === 1 && rasters) {
            const band = Array.isArray(rasters) ? rasters[0] : rasters;
            let min = Infinity;
            let max = -Infinity;

            for (let i = 0; i < Math.min(totalPixels, 10000); i++) {
              const val = band[i];
              if (val !== undefined && !isNaN(val)) {
                if (parsedNoDataList.includes(val)) continue;
                if (val < min) min = val;
                if (val > max) max = val;
              }
            }
            if (min === Infinity || max === -Infinity || min === max) {
              min = 0;
              max = 255;
            }
            const range = max - min || 1;

            for (let i = 0; i < totalPixels; i++) {
              const val = band[i] ?? 0;
              const norm = Math.max(0, Math.min(255, Math.round(((val - min) / range) * 255)));
              const isWhite = (norm === 255);
              const alpha = isWhite ? 0 : 255;

              fullData32[i] = (alpha << 24) | (norm << 16) | (norm << 8) | norm;
            }
            decoded = true;
          }
        } catch (rasterErr) {
          console.warn('Worker [Tile]: readRasters failed:', rasterErr);
        }
      }

      if (!decoded) {
        throw new Error('Không thể giải mã dữ liệu pixel từ file GeoTIFF.');
      }

      // GeoTIFF spatial resolution
      const resX = (bounds.east - bounds.west) / width;
      const resY = (bounds.north - bounds.south) / height;

      const tileSize = options?.tileSize || 256;
      const cols = Math.ceil(width / tileSize);
      const rows = Math.ceil(height / tileSize);
      const totalTiles = cols * rows;

      const viewport: TileBoundsBox | null = options?.viewport || null;

      // 1. Build grid of 256x256 tiles
      const tiles: TileDescriptor[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          tiles.push(
            computeTileMetrics(c, r, tileSize, width, height, bounds, resX, resY, viewport)
          );
        }
      }

      // 2. Sort tiles: viewport tiles first, ordered by distance to viewport center
      sortTilesByPriority(tiles);

      // 3. Notify main thread with grid setup & total counts
      postMsg({
        id,
        type: 'INIT',
        metadata: {
          width,
          height,
          origWidth,
          origHeight,
          bounds,
          tileSize,
          cols,
          rows,
          totalTiles,
        },
      });

      // 4. Set up cooperative streaming loop
      activeJob = {
        id,
        aborted: false,
        fullData32,
        width,
        height,
        resX,
        resY,
        bounds,
        sortedTiles: tiles,
        currentIndex: 0,
        processedCount: 0,
        visibleTilesCount: 0,
        totalTiles,
        viewport,
      };

      const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
      let offscreenCanvas: OffscreenCanvas | null = null;
      let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

      if (hasOffscreenCanvas) {
        try {
          offscreenCanvas = new OffscreenCanvas(tileSize, tileSize);
          offscreenCtx = offscreenCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        } catch (e) {
          console.warn('Worker [Tile]: Failed to instantiate OffscreenCanvas, using buffer transfer', e);
        }
      }

      // Cooperative slice processor
      const processTilesBatch = async () => {
        if (!activeJob || activeJob.id !== id || activeJob.aborted) {
          return;
        }

        const batchStartTime = Date.now();
        // Process in small time-slices (e.g. 16ms) to keep worker responsive to viewport updates & aborts
        while (activeJob.currentIndex < activeJob.sortedTiles.length && (Date.now() - batchStartTime < 20)) {
          if (activeJob.aborted) return;

          const tileDesc = activeJob.sortedTiles[activeJob.currentIndex++];
          const { x0, y0, tileW, tileH, key, col, row, boundsBox, leafletBounds, inViewport } = tileDesc;

          // Check if tile has ANY non-transparent pixel
          let hasVisiblePixels = false;
          for (let ty = 0; ty < tileH; ty++) {
            const rowOffset = (y0 + ty) * width + x0;
            for (let tx = 0; tx < tileW; tx++) {
              const pixel = fullData32[rowOffset + tx];
              if ((pixel >>> 24) > 0) {
                hasVisiblePixels = true;
                break;
              }
            }
            if (hasVisiblePixels) break;
          }

          activeJob.processedCount++;

          if (!hasVisiblePixels) {
            // Entire tile is transparent (all white / nodata). Skip generating image to save memory and DOM elements!
            postMsg({
              id,
              type: 'TILE',
              tile: {
                key,
                col,
                row,
                tileW,
                tileH,
                boundsBox,
                leafletBounds,
                inViewport,
                isEmpty: true,
              },
              processedCount: activeJob.processedCount,
              totalTiles: activeJob.totalTiles,
              visibleTilesCount: activeJob.visibleTilesCount,
            });
            continue;
          }

          // Extract tile pixel data (RGBA)
          const tileBuffer = new ArrayBuffer(tileW * tileH * 4);
          const tileData32 = new Uint32Array(tileBuffer);

          for (let ty = 0; ty < tileH; ty++) {
            const srcRow = (y0 + ty) * width + x0;
            const dstRow = ty * tileW;
            for (let tx = 0; tx < tileW; tx++) {
              tileData32[dstRow + tx] = fullData32[srcRow + tx];
            }
          }

          activeJob.visibleTilesCount++;

          // Convert to Blob using OffscreenCanvas if available
          let tileBlob: Blob | undefined;
          if (offscreenCanvas && offscreenCtx) {
            try {
              if (offscreenCanvas.width !== tileW || offscreenCanvas.height !== tileH) {
                offscreenCanvas.width = tileW;
                offscreenCanvas.height = tileH;
              }
              const clamped = new Uint8ClampedArray(tileBuffer);
              const imgData = new ImageData(clamped, tileW, tileH);
              offscreenCtx.putImageData(imgData, 0, 0);
              tileBlob = await offscreenCanvas.convertToBlob({ type: 'image/png' });
            } catch (canvasErr) {
              console.warn('Worker: convertToBlob failed:', canvasErr);
            }
          }

          if (tileBlob) {
            postMsg({
              id,
              type: 'TILE',
              tile: {
                key,
                col,
                row,
                tileW,
                tileH,
                boundsBox,
                leafletBounds,
                blob: tileBlob,
                inViewport,
                isEmpty: false,
              },
              processedCount: activeJob.processedCount,
              totalTiles: activeJob.totalTiles,
              visibleTilesCount: activeJob.visibleTilesCount,
            });
          } else {
            // Transfer raw ArrayBuffer as fallback
            postMsg(
              {
                id,
                type: 'TILE',
                tile: {
                  key,
                  col,
                  row,
                  tileW,
                  tileH,
                  boundsBox,
                  leafletBounds,
                  buffer: tileBuffer,
                  inViewport,
                  isEmpty: false,
                },
                processedCount: activeJob.processedCount,
                totalTiles: activeJob.totalTiles,
                visibleTilesCount: activeJob.visibleTilesCount,
              },
              [tileBuffer]
            );
          }
        }

        if (activeJob && !activeJob.aborted) {
          if (activeJob.currentIndex < activeJob.sortedTiles.length) {
            // Yield execution to process incoming messages (like UPDATE_VIEWPORT) before resuming next batch
            setTimeout(processTilesBatch, 0);
          } else {
            // All tiles finished!
            postMsg({
              id,
              type: 'COMPLETE',
              success: true,
              metadata: {
                width,
                height,
                bounds,
                tileSize,
                cols,
                rows,
                totalTiles: activeJob.totalTiles,
                visibleTilesCount: activeJob.visibleTilesCount,
              },
            });
            activeJob.fullData32 = null;
            activeJob = null;
          }
        }
      };

      // Launch tile processing
      processTilesBatch();

    } catch (error: any) {
      postMsg({
        id,
        type: 'ERROR',
        success: false,
        error: error.message || 'Lỗi không xác định khi cắt mảnh GeoTIFF',
      });
      activeJob = null;
    }
  }
};
