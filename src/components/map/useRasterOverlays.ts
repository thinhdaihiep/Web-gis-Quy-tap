import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import {
  RasterLayer,
  RasterLoadingStatus,
  LatLngBoundsBox,
  normalizeBoundsBox,
} from '../../types';
import { createLeafletGeoRasterLayer } from '../../utils/geotiffLoader';
import { removeCachedRaster } from '../../utils/rasterCache';
import { getShortRasterName } from './popupHelpers';

interface UseRasterOverlaysProps {
  map: L.Map | null;
  rasterLayers?: RasterLayer[];
  activeRasterLayerId?: string | null;
  isRasterVisible?: boolean;
  currentRole: 'admin' | 'editor' | 'guest';
  onRasterStatusChange?: (status: RasterLoadingStatus) => void;
}

export function useRasterOverlays({
  map,
  rasterLayers,
  activeRasterLayerId,
  isRasterVisible,
  currentRole,
  onRasterStatusChange,
}: UseRasterOverlaysProps) {
  const rasterLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const rasterLayersCacheRef = useRef<
    Map<string, { layer: any; metadata: any; version?: number; boundsStr?: string; url?: string }>
  >(new Map());
  const hasActivatedRasterRef = useRef<boolean>(false);
  const onRasterStatusChangeRef = useRef(onRasterStatusChange);
  onRasterStatusChangeRef.current = onRasterStatusChange;
  const lastRasterStatusJsonRef = useRef<string>('');
  const isRasterPausedRef = useRef<boolean>(false);

  const reportRasterStatus = useCallback((status: RasterLoadingStatus) => {
    const json = JSON.stringify(status);
    if (lastRasterStatusJsonRef.current === json) return;
    lastRasterStatusJsonRef.current = json;
    if (onRasterStatusChangeRef.current) {
      onRasterStatusChangeRef.current(status);
    }
  }, []);

  // Initialize raster pane & layer group
  useEffect(() => {
    if (!map) return;

    try {
      if (!map.getPane('rasterPane')) {
        const rPane = map.createPane('rasterPane');
        rPane.style.zIndex = '350';
      }
    } catch (_) {}

    if (!rasterLayerGroupRef.current) {
      rasterLayerGroupRef.current = L.layerGroup({ pane: 'rasterPane' } as any).addTo(map);
    } else if (!map.hasLayer(rasterLayerGroupRef.current)) {
      rasterLayerGroupRef.current.addTo(map);
    }

    return () => {
      if (rasterLayerGroupRef.current && map.hasLayer(rasterLayerGroupRef.current)) {
        rasterLayerGroupRef.current.clearLayers();
        map.removeLayer(rasterLayerGroupRef.current);
        rasterLayerGroupRef.current = null;
      }
    };
  }, [map]);

  // Main raster evaluation effect
  useEffect(() => {
    let isActive = true;
    const rasterGroup = rasterLayerGroupRef.current;
    if (!map || !rasterGroup) return;

    if (isRasterVisible) {
      hasActivatedRasterRef.current = true;
    }

    const updatePaneVisibility = () => {
      const rPane = map.getPane('rasterPane');
      if (rPane) {
        const isZoomOk = map.getZoom() >= 12;
        rPane.style.display = isRasterVisible && isZoomOk ? '' : 'none';
      }
    };

    updatePaneVisibility();

    if (!hasActivatedRasterRef.current || !rasterLayers || rasterLayers.length === 0) {
      reportRasterStatus({ state: 'idle' });
      return;
    }

    const cache = rasterLayersCacheRef.current;
    const pendingUrls = new Set<string>();
    const failedUrls = new Set<string>();
    let bufferDebounceTimer: any = null;
    let visibleStatuses: { name: string; state: 'loading' | 'loaded' | 'error'; inViewport?: boolean }[] = [];

    const evaluateRasters = (isInstantOnly: boolean = false) => {
      if (!isActive) return;

      updatePaneVisibility();

      if (!rasterLayers || rasterLayers.length === 0) {
        rasterGroup.clearLayers();
        reportRasterStatus({ state: 'idle' });
        return;
      }

      const canAccessFirebase = currentRole === 'admin' || currentRole === 'editor';
      const targetLayers = rasterLayers.filter((layer) => {
        if (!layer || layer.enabled === false) return false;
        const isFirebase = layer.source === 'firebase' || (!layer.githubReleaseUrl && !!layer.storagePath);
        if (isFirebase && !canAccessFirebase) return false;
        return !activeRasterLayerId || layer.id === activeRasterLayerId;
      });

      const activeLayer = targetLayers.length > 0 ? targetLayers[0] : null;
      const activeLayerName = activeLayer?.name || 'Bản đồ Raster';

      if (isRasterPausedRef.current) {
        rasterGroup.clearLayers();
        reportRasterStatus({
          state: 'loading',
          message: 'Đang tạm dừng tải raster để cập nhật chỉ mục Bounding Box...',
          activeLayerName,
          fileStatuses: [],
          fileNames: [],
          loadedCount: 0,
          totalCount: 0,
        });
        return;
      }

      let allFilesToProcess: Array<{
        id?: string;
        url: string;
        fileName?: string;
        format?: 'COG' | 'GEOTIFF';
        opacity?: number;
        bounds?: any;
        version?: number;
      }> = [];

      targetLayers.forEach((layer) => {
        if (layer?.files && Array.isArray(layer.files) && layer.files.length > 0) {
          layer.files.forEach((f) => {
            if (f?.url) allFilesToProcess.push({ ...f, opacity: layer.opacity ?? 1.0, version: f.version || 1 });
          });
        } else if (layer?.url) {
          allFilesToProcess.push({
            id: `${layer.id}_file_0`,
            url: layer.url,
            fileName: layer.name,
            opacity: layer.opacity ?? 1.0,
            bounds: layer.bounds,
            version: layer.version || 1,
          });
        }
      });

      const currentCenter = map.getCenter();

      const getDistanceToCenter = (f: any) => {
        const box = normalizeBoundsBox(f.bounds);
        if (!box) return Infinity;

        const dLat = Math.max(0, box.south - currentCenter.lat, currentCenter.lat - box.north);
        const dLng = Math.max(0, box.west - currentCenter.lng, currentCenter.lng - box.east);
        const distanceToEdge = dLat * dLat + dLng * dLng;

        if (distanceToEdge === 0) {
          const boxCenterLat = (box.south + box.north) / 2;
          const boxCenterLng = (box.west + box.east) / 2;
          const distToBoxCenter =
            Math.pow(boxCenterLat - currentCenter.lat, 2) + Math.pow(boxCenterLng - currentCenter.lng, 2);
          return distToBoxCenter * 0.0000001;
        }

        return distanceToEdge;
      };

      let activeFiles = [...allFilesToProcess];

      if (activeFiles.length > 9) {
        activeFiles.sort((a, b) => getDistanceToCenter(a) - getDistanceToCenter(b));
        activeFiles = activeFiles.slice(0, 9);
      }

      if (activeFiles.length === 0) {
        rasterGroup.clearLayers();
        visibleStatuses = [];
        reportRasterStatus({
          state: 'idle',
          message: 'Không có mảnh raster nào trong khu vực đang xem.',
          activeLayerName,
          fileStatuses: [],
          fileNames: [],
          loadedCount: 0,
          totalCount: 0,
        });
        return;
      }

      activeFiles.forEach((file) => {
        const cacheKey = file.id || file.url;
        const cachedItem = cache.get(cacheKey);
        if (cachedItem) {
          const currentBoundsStr = JSON.stringify(file.bounds || null);
          const isVersionMismatch = typeof file.version === 'number' && cachedItem.version !== file.version;
          const isBoundsMismatch = cachedItem.boundsStr && cachedItem.boundsStr !== currentBoundsStr;
          if (isVersionMismatch || isBoundsMismatch) {
            if (rasterGroup.hasLayer(cachedItem.layer)) {
              rasterGroup.removeLayer(cachedItem.layer);
            }
            if (typeof (cachedItem.layer as any).destroy === 'function') {
              (cachedItem.layer as any).destroy();
            }
            cache.delete(cacheKey);
          }
        }
      });

      const currentActiveKeys = new Set(activeFiles.map((f) => f.id || f.url));
      rasterGroup.eachLayer((layer: any) => {
        let matchedKey: string | null = null;
        for (const [key, item] of cache.entries()) {
          if (item.layer === layer) {
            matchedKey = key;
            break;
          }
        }
        if (matchedKey && !currentActiveKeys.has(matchedKey)) {
          rasterGroup.removeLayer(layer);
        }
      });

      let loadedCount = 0;
      let combinedBoundsBox: any = null;

      const mapBounds = map.getBounds();
      const currentViewportBox = {
        south: mapBounds.getSouth(),
        west: mapBounds.getWest(),
        north: mapBounds.getNorth(),
        east: mapBounds.getEast(),
      };

      activeFiles.forEach((file) => {
        const cacheKey = file.id || file.url;
        if (cache.has(cacheKey)) {
          const cachedItem = cache.get(cacheKey)!;
          if (typeof (cachedItem.layer as any).setOpacity === 'function') {
            (cachedItem.layer as any).setOpacity(file.opacity ?? 1.0);
          }
          if (typeof (cachedItem.layer as any).updateViewport === 'function') {
            (cachedItem.layer as any).updateViewport(currentViewportBox);
          }
          if (!rasterGroup.hasLayer(cachedItem.layer)) {
            rasterGroup.addLayer(cachedItem.layer);
          }
          if (cachedItem.metadata?.bounds) {
            if (!combinedBoundsBox) {
              combinedBoundsBox = { ...cachedItem.metadata.bounds };
            } else {
              combinedBoundsBox = {
                south: Math.min(combinedBoundsBox.south, cachedItem.metadata.bounds.south),
                west: Math.min(combinedBoundsBox.west, cachedItem.metadata.bounds.west),
                north: Math.max(combinedBoundsBox.north, cachedItem.metadata.bounds.north),
                east: Math.max(combinedBoundsBox.east, cachedItem.metadata.bounds.east),
              };
            }
          }
          loadedCount++;
        }
      });

      const getVisibleFileStatuses = () => {
        const inViewportUrls = new Set(
          allFilesToProcess
            .filter((f) => {
              const b = normalizeBoundsBox(f.bounds);
              if (!b) return true;
              return !(
                b.south > currentViewportBox.north ||
                b.north < currentViewportBox.south ||
                b.west > currentViewportBox.east ||
                b.east < currentViewportBox.west
              );
            })
            .map((f) => f.url)
        );

        const uniqueNames = new Map<string, { state: 'loading' | 'loaded' | 'error'; inViewport: boolean }>();
        allFilesToProcess.forEach((f) => {
          const name = getShortRasterName(f);
          if (name) {
            const isLoaded = cache.has(f.id || f.url);
            const isFailed = failedUrls.has(f.url);
            const inView = inViewportUrls.has(f.url);
            const fileState: 'loading' | 'loaded' | 'error' = isLoaded ? 'loaded' : isFailed ? 'error' : 'loading';
            const existing = uniqueNames.get(name);
            if (!existing) {
              uniqueNames.set(name, { state: fileState, inViewport: inView });
            } else {
              if (existing.state !== 'loaded') existing.state = fileState;
              if (inView) existing.inViewport = true;
            }
          }
        });

        return Array.from(uniqueNames.entries())
          .map(([name, data]) => ({ name, state: data.state, inViewport: data.inViewport }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      };

      visibleStatuses = getVisibleFileStatuses();
      const fileNames = visibleStatuses.map((fs) => fs.name);
      const isInitialDone = loadedCount >= activeFiles.length;

      const currentlyPendingFile = activeFiles.find((f) => pendingUrls.has(f.url));
      const activePendingName = currentlyPendingFile ? getShortRasterName(currentlyPendingFile) : undefined;

      reportRasterStatus({
        state: isInitialDone ? 'loaded' : 'loading',
        progress: Math.round((loadedCount / activeFiles.length) * 100) || 0,
        message: `${loadedCount}/${activeFiles.length}`,
        loadedCount,
        totalCount: activeFiles.length,
        activeLayerName,
        bounds: combinedBoundsBox,
        fileNames,
        fileStatuses: visibleStatuses,
        currentLoadingName: activePendingName,
      });

      if (isInstantOnly) {
        return;
      }

      const loadSingleRaster = async (file: any) => {
        const cacheKey = file.id || file.url;
        if (!isActive || !file || !file.url || cache.has(cacheKey) || pendingUrls.has(file.url)) {
          return;
        }

        pendingUrls.add(file.url);
        const shortName = getShortRasterName(file);
        if (shortName) {
          visibleStatuses = visibleStatuses.map((item) =>
            item.name === shortName ? { ...item, state: 'loading' } : item
          );
          reportRasterStatus({
            state: 'loading',
            progress: Math.round((loadedCount / activeFiles.length) * 100) || 0,
            message: `${loadedCount}/${activeFiles.length}`,
            loadedCount,
            failedCount: failedUrls.size,
            totalCount: activeFiles.length,
            activeLayerName,
            bounds: combinedBoundsBox,
            fileNames: visibleStatuses.map((fs) => fs.name),
            fileStatuses: visibleStatuses,
            currentLoadingName: shortName,
          });
        }

        try {
          const { layer: geoRasterLayer, metadata } = await createLeafletGeoRasterLayer(file.url, {
            opacity: file.opacity ?? 1.0,
            resolution: 256,
            pane: 'rasterPane',
            viewport: currentViewportBox,
            fileId: file.id,
            version: file.version || 1,
          });

          if (isActive && map) {
            cache.set(cacheKey, {
              layer: geoRasterLayer,
              metadata,
              version: file.version || 1,
              boundsStr: JSON.stringify(file.bounds || null),
              url: file.url,
            });
            if (!rasterGroup.hasLayer(geoRasterLayer)) {
              rasterGroup.addLayer(geoRasterLayer);
            }

            if (metadata.bounds) {
              if (!combinedBoundsBox) {
                combinedBoundsBox = { ...metadata.bounds };
              } else {
                combinedBoundsBox = {
                  south: Math.min(combinedBoundsBox.south, metadata.bounds.south),
                  west: Math.min(combinedBoundsBox.west, metadata.bounds.west),
                  north: Math.max(combinedBoundsBox.north, metadata.bounds.north),
                  east: Math.max(combinedBoundsBox.east, metadata.bounds.east),
                };
              }
            }

            loadedCount++;

            const shortName = getShortRasterName(file);
            if (shortName) {
              visibleStatuses = visibleStatuses.map((item) =>
                item.name === shortName ? { ...item, state: 'loaded' } : item
              );
            }

            const updatedNames = visibleStatuses.map((fs) => fs.name);
            const isDone = loadedCount + failedUrls.size >= activeFiles.length;

            reportRasterStatus({
              state: isDone ? (loadedCount > 0 ? 'loaded' : 'error') : 'loading',
              progress: Math.round((loadedCount / activeFiles.length) * 100),
              message: `${loadedCount}/${activeFiles.length}`,
              loadedCount,
              failedCount: failedUrls.size,
              totalCount: activeFiles.length,
              activeLayerName,
              bounds: combinedBoundsBox,
              fileNames: updatedNames,
              fileStatuses: visibleStatuses,
              currentLoadingName: undefined,
            });
          }
        } catch (e: any) {
          console.warn('Không thể nạp file raster COG:', file.fileName || file.url, e?.message || e);
          removeCachedRaster(file.url).catch(() => {});
          failedUrls.add(file.url);
          const shortName = getShortRasterName(file);
          if (shortName) {
            visibleStatuses = visibleStatuses.map((item) =>
              item.name === shortName ? { ...item, state: 'error' } : item
            );
          }
          const updatedNames = visibleStatuses.map((fs) => fs.name);
          const isDone = loadedCount + failedUrls.size >= activeFiles.length;
          const preservedBounds =
            combinedBoundsBox ||
            normalizeBoundsBox(targetLayers[0]?.bounds) ||
            normalizeBoundsBox(file.bounds);

          reportRasterStatus({
            state: isDone ? (loadedCount > 0 ? 'loaded' : 'error') : 'loading',
            progress: Math.round((loadedCount / activeFiles.length) * 100),
            message: `${loadedCount}/${activeFiles.length}`,
            loadedCount,
            failedCount: failedUrls.size,
            totalCount: activeFiles.length,
            activeLayerName,
            bounds: preservedBounds,
            fileNames: updatedNames,
            fileStatuses: visibleStatuses,
            currentLoadingName: undefined,
          });
        } finally {
          pendingUrls.delete(file.url);
        }
      };

      const pendingFiles = activeFiles.filter((f) => f.url && !cache.has(f.id || f.url));
      if (pendingFiles.length > 0) {
        const inViewportUrls = new Set(
          activeFiles
            .filter((f) => {
              const b = normalizeBoundsBox(f.bounds);
              if (!b) return true;
              return !(
                b.south > currentViewportBox.north ||
                b.north < currentViewportBox.south ||
                b.west > currentViewportBox.east ||
                b.east < currentViewportBox.west
              );
            })
            .map((f) => f.url)
        );

        pendingFiles.sort((a, b) => {
          const aInView = inViewportUrls.has(a.url);
          const bInView = inViewportUrls.has(b.url);
          if (aInView && !bInView) return -1;
          if (!aInView && bInView) return 1;
          return getDistanceToCenter(a) - getDistanceToCenter(b);
        });

        if (bufferDebounceTimer) clearTimeout(bufferDebounceTimer);

        bufferDebounceTimer = setTimeout(() => {
          if (!isActive) return;

          (async () => {
            let idx = 0;
            const processNext = async () => {
              if (!isActive || idx >= pendingFiles.length) return;
              const file = pendingFiles[idx++];
              const cacheKey = file ? file.id || file.url : '';
              if (file && file.url && !cache.has(cacheKey) && !pendingUrls.has(file.url)) {
                await new Promise((res) => setTimeout(res, 60));
                await loadSingleRaster(file);
              }
              if (isActive) {
                await processNext();
              }
            };

            processNext();
          })();
        }, 500);
      }
    };

    let debounceTimer: any = null;
    let moveRafId: number | null = null;
    const debouncedEvaluateRasters = () => {
      evaluateRasters(true);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        evaluateRasters();
      }, 150);
    };

    const handleClearRasterCacheEvent = (e: any) => {
      const urls: string[] = e?.detail?.urls;
      if (urls && Array.isArray(urls)) {
        const urlSet = new Set(urls);
        for (const [key, item] of cache.entries()) {
          if (urlSet.has(item.url || '') || urlSet.has(key)) {
            if (item && typeof (item.layer as any).destroy === 'function') {
              (item.layer as any).destroy();
            }
            cache.delete(key);
          }
        }
      } else {
        cache.forEach((item) => {
          if (item && typeof (item.layer as any).destroy === 'function') {
            (item.layer as any).destroy();
          }
        });
        cache.clear();
      }
      rasterGroup.clearLayers();
      if (!isRasterPausedRef.current) {
        evaluateRasters();
      }
    };

    const handleRetryFailedRastersEvent = () => {
      failedUrls.clear();
      if (!isRasterPausedRef.current) {
        evaluateRasters();
      }
    };

    const handlePauseRasterLoadingEvent = (e: any) => {
      isRasterPausedRef.current = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (bufferDebounceTimer) clearTimeout(bufferDebounceTimer);
      rasterGroup.clearLayers();
      failedUrls.clear();
      const currentActive = rasterLayers?.find((l) => !activeRasterLayerId || l.id === activeRasterLayerId);
      reportRasterStatus({
        state: 'loading',
        message: e?.detail?.message || 'Đang tạm dừng tải raster để cập nhật chỉ mục Bounding Box...',
        activeLayerName: currentActive?.name || 'Bản đồ Raster',
        fileStatuses: [],
        fileNames: [],
        loadedCount: 0,
        totalCount: 0,
      });
    };

    const handleResumeRasterLoadingEvent = () => {
      isRasterPausedRef.current = false;
      failedUrls.clear();
      cache.forEach((item) => {
        if (item && typeof (item.layer as any).destroy === 'function') {
          (item.layer as any).destroy();
        }
      });
      cache.clear();
      rasterGroup.clearLayers();
      evaluateRasters();
    };

    window.addEventListener('clear-raster-cache', handleClearRasterCacheEvent);
    window.addEventListener('retry-failed-rasters', handleRetryFailedRastersEvent);
    window.addEventListener('pause-raster-loading', handlePauseRasterLoadingEvent);
    window.addEventListener('resume-raster-loading', handleResumeRasterLoadingEvent);

    evaluateRasters();

    const handleMapMoveInstant = () => {
      if (moveRafId !== null) return;
      moveRafId = requestAnimationFrame(() => {
        moveRafId = null;
        if (!isActive) return;
        evaluateRasters(true);
      });
    };

    map.on('move', handleMapMoveInstant);
    map.on('zoom', handleMapMoveInstant);
    map.on('moveend', debouncedEvaluateRasters);
    map.on('zoomend', debouncedEvaluateRasters);
    map.on('zoom', updatePaneVisibility);
    map.on('zoomend', updatePaneVisibility);

    return () => {
      isActive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (bufferDebounceTimer) clearTimeout(bufferDebounceTimer);
      if (moveRafId !== null) {
        cancelAnimationFrame(moveRafId);
        moveRafId = null;
      }
      window.removeEventListener('clear-raster-cache', handleClearRasterCacheEvent);
      window.removeEventListener('retry-failed-rasters', handleRetryFailedRastersEvent);
      window.removeEventListener('pause-raster-loading', handlePauseRasterLoadingEvent);
      window.removeEventListener('resume-raster-loading', handleResumeRasterLoadingEvent);
      map.off('move', handleMapMoveInstant);
      map.off('zoom', handleMapMoveInstant);
      map.off('moveend', debouncedEvaluateRasters);
      map.off('zoomend', debouncedEvaluateRasters);
    };
  }, [map, rasterLayers, activeRasterLayerId, isRasterVisible, currentRole, reportRasterStatus]);

  return {
    rasterLayerGroupRef,
    rasterLayersCacheRef,
  };
}
