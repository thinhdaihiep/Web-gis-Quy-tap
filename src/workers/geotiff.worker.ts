import { fromArrayBuffer } from 'geotiff';
import { ParsedGeoRasterInfo } from '../utils/geotiffLoader';

self.onmessage = async (e: MessageEvent) => {
  const { arrayBuffer, options, id } = e.data;
  
  if (!arrayBuffer) return;

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
    
    // Dự án luôn dùng duy nhất 1 hệ toạ độ EPSG:4326 (WGS84 Lon/Lat degrees)
    const bounds = {
      west: Math.min(bbox[0], bbox[2]),
      south: Math.min(bbox[1], bbox[3]),
      east: Math.max(bbox[0], bbox[2]),
      north: Math.max(bbox[1], bbox[3]),
    };

    if (
      typeof bounds.west !== 'number' || typeof bounds.south !== 'number' ||
      typeof bounds.east !== 'number' || typeof bounds.north !== 'number' ||
      isNaN(bounds.west) || isNaN(bounds.south) || isNaN(bounds.east) || isNaN(bounds.north)
    ) {
      throw new Error('Không thể xác định toạ độ địa lý (Bounding Box) của file GeoTIFF.');
    }

    let targetImage = firstImage;
    const maxDim = options?.maxDimension || 6144;
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
    
    // We create a raw 32-bit pixel buffer
    const buffer = new ArrayBuffer(width * height * 4);
    const data32 = new Uint32Array(buffer);
    const totalPixels = width * height;

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

    // STRATEGY 1: Dedicated Palette / Indexed Color (8-bit with ColorMap)
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
            const isWhite = (r === 255 && g === 255 && b === 255);
            const a = isWhite ? 0 : 255;
            lut32[c] = (a << 24) | (b << 16) | (g << 8) | r;
          }

          for (let i = 0; i < totalPixels; i++) {
            data32[i] = lut32[indexBand[i]];
          }
          decoded = true;
        }
      } catch (paletteErr) {
        console.warn('Worker: Palette direct decode failed, trying readRGB:', paletteErr);
      }
    }

    // STRATEGY 2: Built-in targetImage.readRGB()
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

            const isWhite = (r === 255 && g === 255 && b === 255);
            const alpha = isWhite ? 0 : a;

            data32[p] = (alpha << 24) | (b << 16) | (g << 8) | r;
            srcIdx += isRgba ? 4 : 3;
          }
          decoded = true;
        }
      } catch (rgbErr) {
        console.warn('Worker: readRGB failed, trying readRasters:', rgbErr);
      }
    }

    // STRATEGY 3: Multi-band readRasters
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

            data32[i] = (alpha << 24) | (b << 16) | (g << 8) | r;
          }
          decoded = true;
        } else if (numBands === 1 && rasters) {
          const band = Array.isArray(rasters) ? rasters[0] : rasters;
          if (!band) return;
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

            data32[i] = (alpha << 24) | (norm << 16) | (norm << 8) | norm;
          }
          decoded = true;
        }
      } catch (rasterErr) {
        console.warn('Worker: readRasters fallback failed:', rasterErr);
      }
    }

    if (!decoded) {
      throw new Error('Không thể giải mã mảng pixel từ ảnh GeoTIFF.');
    }

    let blob: Blob | null = null;

    // Use OffscreenCanvas if supported
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        
        // Convert to Uint8ClampedArray for ImageData
        const clampedArray = new Uint8ClampedArray(buffer);
        const imageData = new ImageData(clampedArray, width, height);
        ctx.putImageData(imageData, 0, 0);
        
        blob = await canvas.convertToBlob({ type: 'image/png' });
        
        // Post message with blob
        (self as unknown as Worker).postMessage({
          id,
          success: true,
          blob,
          metadata: { bounds, epsg: 4326, width: origWidth, height: origHeight }
        });
        return;
      } catch (e) {
        console.warn('Worker: OffscreenCanvas failed, falling back to raw buffer transfer', e);
      }
    }

    // Fallback: Send raw buffer via transferable
    (self as unknown as Worker).postMessage({
      id,
      success: true,
      buffer,
      metadata: { bounds, epsg: 4326, width: origWidth, height: origHeight, renderWidth: width, renderHeight: height }
    }, [buffer]);

  } catch (error: any) {
    (self as unknown as Worker).postMessage({ id, success: false, error: error.message });
  }
};
