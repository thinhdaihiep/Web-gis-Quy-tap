import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

import {
  BaseMapType,
  LayerConfig,
  GeoJsonFeatureItem,
  DrawToolMode,
  MapInteractionMode,
  RasterLayer,
  RasterLoadingStatus,
} from '../types';
import { toLeafletCoords } from './map/mapGeometryHelpers';
import { useMeasureTools } from './map/useMeasureTools';
import { useRasterOverlays } from './map/useRasterOverlays';
import { useVectorFeatures } from './map/useVectorFeatures';
import { MapMeasurePanel } from './map/MapMeasurePanel';

proj4.defs('EPSG:3405', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');

interface MapProps {
  baseMap: BaseMapType;
  layers: LayerConfig[];
  rasterLayers?: RasterLayer[];
  activeRasterLayerId?: string | null;
  isRasterVisible?: boolean;
  features: GeoJsonFeatureItem[];
  aliasVersion?: number;
  interactionMode?: MapInteractionMode;
  selectedFeatureId?: string | null;
  activeDrawMode?: DrawToolMode;
  pendingPasteFeature?: GeoJsonFeatureItem | null;
  targetMarkerLocation?: { lat: number; lng: number; timestamp?: number } | null;
  selectedCRS?: '4326' | '3405' | '3406';
  currentRole: 'admin' | 'editor' | 'guest';
  onMapReady?: (map: L.Map) => void;
  onCursorMove?: (pos: { lat: number; lng: number } | null) => void;
  onFeatureSelect?: (feature: GeoJsonFeatureItem | null) => void;
  onFeatureGeometryUpdate?: (featureId: string, newCoordinates: any) => void;
  onFeatureCreate?: (newFeaturePartial: Partial<GeoJsonFeatureItem>) => void;
  onDrawingPointsChange?: (count: number) => void;
  drawingVerticesRef?: React.MutableRefObject<[number, number][]>;
  onRasterStatusChange?: (status: RasterLoadingStatus) => void;
  onMapRenderedReady?: () => void;
  onOpenPdfViewer?: (url: string, title?: string) => void;
  onOpenFeedbackModal?: (
    objectId: string | number,
    layerId: string,
    featureName: string,
    layerName: string
  ) => void;
}

export const MapComponent: React.FC<MapProps> = ({
  baseMap,
  layers,
  rasterLayers = [],
  activeRasterLayerId = null,
  isRasterVisible = false,
  features,
  aliasVersion,
  interactionMode = 'hand',
  selectedFeatureId = null,
  activeDrawMode = null,
  pendingPasteFeature = null,
  targetMarkerLocation = null,
  currentRole,
  onMapReady,
  onCursorMove,
  onFeatureSelect,
  onFeatureGeometryUpdate,
  onRasterStatusChange,
  onMapRenderedReady,
  onOpenPdfViewer,
  onOpenFeedbackModal,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<Record<BaseMapType, L.TileLayer> | null>(null);
  const tempDrawLayerRef = useRef<L.LayerGroup | null>(null);
  const clickMarkerRef = useRef<L.CircleMarker | null>(null);
  const featureClickedRef = useRef<boolean>(false);

  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;

  // Global popup handlers
  useEffect(() => {
    (window as any).__openGisPdfViewer = (encodedUrl: string) => {
      try {
        const decoded = decodeURIComponent(encodedUrl);
        if (onOpenPdfViewer) {
          onOpenPdfViewer(decoded);
        } else {
          window.open(decoded, '_blank');
        }
      } catch (e) {
        window.open(encodedUrl, '_blank');
      }
    };
    return () => {
      delete (window as any).__openGisPdfViewer;
    };
  }, [onOpenPdfViewer]);

  useEffect(() => {
    (window as any).__openGisFeedbackModal = (
      encodedObjId: string,
      encodedLayerId: string,
      encodedName: string,
      encodedLayerName: string
    ) => {
      try {
        const objId = decodeURIComponent(encodedObjId);
        const layerId = decodeURIComponent(encodedLayerId);
        const name = decodeURIComponent(encodedName);
        const layerName = decodeURIComponent(encodedLayerName);
        if (onOpenFeedbackModal) {
          onOpenFeedbackModal(objId, layerId, name, layerName);
        }
      } catch (e) {
        console.error('Lỗi khi mở cửa sổ phản ánh:', e);
      }
    };
    return () => {
      delete (window as any).__openGisFeedbackModal;
    };
  }, [onOpenFeedbackModal]);

  // Set or update markpoint
  const setOrUpdateMarkPoint = useCallback((latlng: L.LatLngExpression) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const targetLatLng =
      latlng instanceof L.LatLng
        ? latlng
        : L.latLng((latlng as any).lat ?? (latlng as any)[0], (latlng as any).lng ?? (latlng as any)[1]);
    if (!clickMarkerRef.current) {
      clickMarkerRef.current = L.circleMarker(targetLatLng, {
        radius: 6,
        fillColor: '#ef4444',
        fillOpacity: 1,
        color: '#ffffff',
        weight: 2,
        interactive: false,
      }).addTo(map);
    } else {
      if (!map.hasLayer(clickMarkerRef.current)) {
        clickMarkerRef.current.addTo(map);
      }
      clickMarkerRef.current.setLatLng(targetLatLng);
    }
    if (onCursorMoveRef.current) {
      onCursorMoveRef.current({ lat: targetLatLng.lat, lng: targetLatLng.lng });
    }
  }, []);

  const mode: MapInteractionMode = (interactionMode as MapInteractionMode) || 'hand';

  // Measurement hook
  const {
    measureResult,
    handleClearMeasurement,
    handleMeasureMapClick,
    handleMeasureFeaturePolygon,
  } = useMeasureTools(mapInstanceRef.current, mode);

  // Raster overlays hook
  useRasterOverlays({
    map: mapInstanceRef.current,
    rasterLayers,
    activeRasterLayerId,
    isRasterVisible,
    currentRole,
    onRasterStatusChange,
  });

  // Vector features hook
  useVectorFeatures({
    map: mapInstanceRef.current,
    layers,
    features,
    selectedFeatureId,
    interactionMode: mode,
    aliasVersion,
    onFeatureSelect,
    onFeatureGeometryUpdate,
    onCursorMove,
    onMapRenderedReady,
    setOrUpdateMarkPoint,
    handleMeasureFeaturePolygon,
    featureClickedRef,
  });

  // Map initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cleanupWheel: (() => void) | null = null;

    if (!mapInstanceRef.current) {
      let initialCenter: [number, number] = [14.5, 108.3];
      let initialZoom = 8;
      try {
        const savedView = localStorage.getItem('gis_map_view_state');
        if (savedView) {
          const parsed = JSON.parse(savedView);
          if (
            parsed &&
            typeof parsed.lat === 'number' &&
            !isNaN(parsed.lat) &&
            typeof parsed.lng === 'number' &&
            !isNaN(parsed.lng) &&
            typeof parsed.zoom === 'number' &&
            !isNaN(parsed.zoom)
          ) {
            initialCenter = [parsed.lat, parsed.lng];
            initialZoom = parsed.zoom;
          }
        }
      } catch (e) {}

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: false,
        zoomSnap: 1,
        zoomDelta: 1,
        scrollWheelZoom: false,
      });

      const mapContainer = map.getContainer();
      let wheelCooldown = false;
      let wheelTimer: any = null;

      const handleWheelZoom = (e: WheelEvent) => {
        e.preventDefault();
        if (wheelCooldown) return;
        if (e.deltaY === 0) return;

        const direction = e.deltaY < 0 ? 1 : -1;
        const currentZoom = map.getZoom();
        const minZoom = map.getMinZoom();
        const maxZoom = map.getMaxZoom();
        const nextZoom = Math.min(maxZoom, Math.max(minZoom, Math.round(currentZoom) + direction));

        if (nextZoom !== currentZoom) {
          const mouseLatLng = map.mouseEventToLatLng(e);
          map.setZoomAround(mouseLatLng, nextZoom, { animate: true });
          wheelCooldown = true;

          if (wheelTimer) clearTimeout(wheelTimer);
          wheelTimer = setTimeout(() => {
            wheelCooldown = false;
          }, 200);
        }
      };

      mapContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
      cleanupWheel = () => {
        mapContainer.removeEventListener('wheel', handleWheelZoom);
        if (wheelTimer) clearTimeout(wheelTimer);
      };

      const saveViewState = () => {
        if (!map) return;
        try {
          const center = map.getCenter();
          const zoom = map.getZoom();
          localStorage.setItem(
            'gis_map_view_state',
            JSON.stringify({
              lat: Number(center.lat.toFixed(6)),
              lng: Number(center.lng.toFixed(6)),
              zoom: Math.round(zoom * 10) / 10,
            })
          );
        } catch (e) {}
      };

      map.on('moveend', saveViewState);
      map.on('zoomend', saveViewState);

      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxZoom: 18,
      });

      const esriTopoLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a> &mdash; Topo Map',
          maxZoom: 18,
        }
      );

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a> &mdash; Imagery',
          maxZoom: 18,
        }
      );

      streetLayer.addTo(map);

      baseLayersRef.current = {
        street: streetLayer,
        esri_topo: esriTopoLayer,
        satellite: satelliteLayer,
      };

      tempDrawLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      // Handle map clicks
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        if (onCursorMoveRef.current) {
          onCursorMoveRef.current({ lat, lng });
        }

        if (interactionMode === 'measure_distance' || interactionMode === 'measure_area_custom') {
          handleMeasureMapClick(e.latlng);
          return;
        }

        if (featureClickedRef.current) {
          featureClickedRef.current = false;
          return;
        }

        if (onFeatureSelect) {
          onFeatureSelect(null);
        }

        setOrUpdateMarkPoint(e.latlng);
      });

      // Handle popup open
      map.on('popupopen', (e: any) => {
        try {
          const popup = e?.popup;
          const source = popup?._source;
          if (source) {
            let centerLatLng: L.LatLng | undefined;
            if (typeof source.getLatLng === 'function') {
              centerLatLng = source.getLatLng();
            } else if (typeof source.getBounds === 'function') {
              const bounds = source.getBounds();
              if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
                centerLatLng = bounds.getCenter();
              }
            }
            if (!centerLatLng && popup?.getLatLng) {
              centerLatLng = popup.getLatLng();
            }
            if (centerLatLng) {
              setOrUpdateMarkPoint(centerLatLng);
              if (onCursorMoveRef.current) {
                onCursorMoveRef.current({ lat: centerLatLng.lat, lng: centerLatLng.lng });
              }
            }
          }
        } catch (_) {}
      });

      if (onMapReady) {
        onMapReady(map);
      }
    }

    return () => {
      if (cleanupWheel) {
        cleanupWheel();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Base Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const baseLayers = baseLayersRef.current;
    if (!map || !baseLayers) return;

    (Object.keys(baseLayers) as BaseMapType[]).forEach((key) => {
      const layer = baseLayers[key];
      if (key === baseMap) {
        if (!map.hasLayer(layer)) map.addLayer(layer);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });
  }, [baseMap]);

  // Update Map Cursor
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const container = map.getContainer();
    if (interactionMode === 'hand') {
      container.style.cursor = 'grab';
    } else if (
      interactionMode === 'measure_distance' ||
      interactionMode === 'measure_area_custom' ||
      interactionMode === 'measure_area_feature' ||
      activeDrawMode === 'point' ||
      activeDrawMode === 'line' ||
      activeDrawMode === 'polygon'
    ) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = 'pointer';
      if (tempDrawLayerRef.current) {
        tempDrawLayerRef.current.clearLayers();
      }
    }
  }, [activeDrawMode, interactionMode]);

  // Handle target marker jump
  useEffect(() => {
    if (!targetMarkerLocation) return;
    const map = mapInstanceRef.current;
    if (!map) return;

    const latlng = L.latLng(targetMarkerLocation.lat, targetMarkerLocation.lng);
    try {
      (map as any).stop?.();
    } catch (e) {}

    map.flyTo(latlng, 13, { duration: 0.35 });
    setOrUpdateMarkPoint(latlng);
  }, [targetMarkerLocation, setOrUpdateMarkPoint]);

  // Render Ghost Paste Preview Feature
  useEffect(() => {
    const tempLayerGroup = tempDrawLayerRef.current;
    if (!tempLayerGroup) return;

    tempLayerGroup.clearLayers();
    if (!pendingPasteFeature) return;

    const coords = pendingPasteFeature.coordinates || (pendingPasteFeature as any).geometry?.coordinates;
    const gType = pendingPasteFeature.type || (pendingPasteFeature as any).geometry?.type;
    if (!coords) return;

    const leafletCoords = toLeafletCoords(coords);
    if (!leafletCoords || leafletCoords.length === 0) return;

    let ghostLayer: L.Layer | null = null;
    if (gType === 'Point') {
      ghostLayer = L.circleMarker(leafletCoords as [number, number], {
        radius: 9,
        fillColor: '#3b82f6',
        fillOpacity: 0.85,
        color: '#ffffff',
        weight: 3,
      });
    } else if (gType === 'LineString' || gType === 'MultiLineString') {
      ghostLayer = L.polyline(leafletCoords, {
        color: '#2563eb',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.9,
      });
    } else if (gType === 'Polygon' || gType === 'MultiPolygon') {
      ghostLayer = L.polygon(leafletCoords, {
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.45,
        weight: 3,
        dashArray: '8, 8',
      });
    }

    if (ghostLayer) {
      ghostLayer.addTo(tempLayerGroup);
    }
  }, [pendingPasteFeature]);

  return (
    <div
      className={`relative w-full h-full flex-1 ${
        interactionMode === 'pointer' ? 'mode-pointer' : interactionMode === 'hand' ? 'mode-hand' : ''
      }`}
    >
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />
      <MapMeasurePanel measureResult={measureResult} onClear={handleClearMeasurement} />
    </div>
  );
};
