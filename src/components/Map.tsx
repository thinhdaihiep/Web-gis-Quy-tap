import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

import {
  BaseMapType,
  LayerConfig,
  GeoJsonFeatureItem,
  PHAN_LOAI_COLORS,
  DrawToolMode,
  MapInteractionMode,
} from '../types';
import { getFieldAlias } from '../fieldAlias';

proj4.defs('EPSG:3405', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');

interface MapProps {
  baseMap: BaseMapType;
  layers: LayerConfig[];
  features: GeoJsonFeatureItem[];
  aliasVersion?: number;
  interactionMode?: MapInteractionMode;
  selectedFeatureId?: string | null;
  activeDrawMode?: DrawToolMode;
  onMapReady?: (map: L.Map) => void;
  onCursorMove?: (pos: { lat: number; lng: number } | null) => void;
  onFeatureSelect?: (feature: GeoJsonFeatureItem) => void;
  onFeatureGeometryUpdate?: (featureId: string, newCoordinates: any) => void;
  onFeatureCreate?: (newFeaturePartial: Partial<GeoJsonFeatureItem>) => void;
  onDrawingPointsChange?: (count: number) => void;
  drawingVerticesRef?: React.MutableRefObject<[number, number][]>;
}

function getFeatureName(feat: GeoJsonFeatureItem): { name: string; hiddenKey: string | null } {
  const props = feat.properties || {};

  // 1. Highest Priority: Exact property field [Ten] from database
  if (props['Ten'] !== undefined && props['Ten'] !== null && String(props['Ten']).trim() !== '') {
    return { name: String(props['Ten']).trim(), hiddenKey: 'Ten' };
  }

  // 2. Feature object name if non-generic
  if (feat.name && !['Feature', 'Polygon', 'Point', 'LineString', 'MultiPolygon', 'MultiLineString'].includes(feat.name.trim())) {
    return { name: feat.name.trim(), hiddenKey: null };
  }

  // 3. Exact property field [ten] if imported with lowercase key
  if (props['ten'] !== undefined && props['ten'] !== null && String(props['ten']).trim() !== '') {
    return { name: String(props['ten']).trim(), hiddenKey: 'ten' };
  }

  // 4. Exact property field [TEN] if imported with uppercase key
  if (props['TEN'] !== undefined && props['TEN'] !== null && String(props['TEN']).trim() !== '') {
    return { name: String(props['TEN']).trim(), hiddenKey: 'TEN' };
  }

  // 5. Check other property keys mapped to alias 'Tên' or 'name'/'Name'
  for (const k of Object.keys(props)) {
    const val = props[k];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      const alias = getFieldAlias(k);
      if (alias === 'Tên' || k === 'name' || k === 'Name') {
        return { name: String(val).trim(), hiddenKey: k };
      }
    }
  }

  return { name: feat.name || 'Đối tượng GIS', hiddenKey: null };
}

function renderPopupProperties(
  feat: GeoJsonFeatureItem,
  lat?: number,
  lng?: number,
  hiddenKey?: string | null
): string {
  const props = feat.properties || {};
  const entries = Object.entries(props);
  let hasToaDo = false;

  const rows: string[] = [];

  entries.forEach(([k, v]) => {
    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      cleanKey === 'hientrang' ||
      cleanKey === 'trangthaimoi' ||
      cleanKey === 'objectid' ||
      cleanKey === 'id' ||
      cleanKey === 'fid' ||
      k === hiddenKey
    ) {
      return;
    }

    const alias = getFieldAlias(k);
    if (!alias) {
      return;
    }

    if (alias === 'Tọa độ') hasToaDo = true;
    const valStr = v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '---';
    rows.push(`<tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 3px 8px 3px 0; color: #475569; font-weight: 600; white-space: nowrap; vertical-align: top;">${alias}:</td>
      <td style="padding: 3px 0; color: #0f172a; font-weight: 700; text-align: right; word-break: break-word;">${valStr}</td>
    </tr>`);
  });

  if (!hasToaDo && lat !== undefined && lng !== undefined) {
    rows.push(`<tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 3px 8px 3px 0; color: #475569; font-weight: 600; white-space: nowrap; vertical-align: top;">Tọa độ:</td>
      <td style="padding: 3px 0; color: #0f172a; font-weight: 700; text-align: right; font-family: monospace;">${lat.toFixed(6)}, ${lng.toFixed(6)}</td>
    </tr>`);
  }

  if (rows.length === 0) {
    return '';
  }

  return `<table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px;"><tbody>${rows.join('')}</tbody></table>`;
}

function toLeafletCoords(coords: any): any {
  if (typeof coords === 'string') {
    try {
      coords = JSON.parse(coords);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(coords) || coords.length === 0) return [];

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    let x = coords[0];
    let y = coords[1];

    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      try {
        const [lng, lat] = proj4('EPSG:3405', 'EPSG:4326', [x, y]);
        return [lat, lng];
      } catch (e) {
        console.warn('Proj4 transformation error:', e);
      }
    }
    return [y, x];
  }

  return coords.map((c) => toLeafletCoords(c));
}

function leafletLatLngsToGeoJsonPolygon(latLngs: any): any {
  if (!Array.isArray(latLngs) || latLngs.length === 0) return [];

  if (Array.isArray(latLngs[0]) && 'lat' in latLngs[0][0]) {
    return latLngs.map((ring: any) =>
      ring.map((ll: any) => [Number(ll.lng.toFixed(6)), Number(ll.lat.toFixed(6))])
    );
  }

  if ('lat' in latLngs[0]) {
    const ring = latLngs.map((ll: any) => [
      Number(ll.lng.toFixed(6)),
      Number(ll.lat.toFixed(6)),
    ]);
    if (ring.length > 0) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([...first]);
      }
    }
    return [ring];
  }

  return latLngs;
}

function leafletLatLngsToGeoJsonLine(latLngs: any): any {
  if (!Array.isArray(latLngs) || latLngs.length === 0) return [];
  if ('lat' in latLngs[0]) {
    return latLngs.map((ll: any) => [
      Number(ll.lng.toFixed(6)),
      Number(ll.lat.toFixed(6)),
    ]);
  }
  return latLngs;
}

export const MapComponent: React.FC<MapProps> = ({
  baseMap,
  layers,
  features,
  aliasVersion,
  interactionMode = 'hand',
  selectedFeatureId = null,
  activeDrawMode = null,
  onMapReady,
  onCursorMove,
  onFeatureSelect,
  onFeatureGeometryUpdate,
  onFeatureCreate,
  onDrawingPointsChange,
  drawingVerticesRef,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<{ street: L.TileLayer; satellite: L.TileLayer } | null>(null);
  const featureLayersRef = useRef<L.LayerGroup | null>(null);
  const tempDrawLayerRef = useRef<L.LayerGroup | null>(null);
  const clickMarkerRef = useRef<L.CircleMarker | null>(null);

  const onCursorMoveRef = useRef(onCursorMove);
  const activeDrawModeRef = useRef(activeDrawMode);
  const interactionModeRef = useRef(interactionMode);
  const onFeatureCreateRef = useRef(onFeatureCreate);
  const onDrawingPointsChangeRef = useRef(onDrawingPointsChange);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const onFeatureGeometryUpdateRef = useRef(onFeatureGeometryUpdate);

  const localVerticesRef = useRef<[number, number][]>([]);

  const featureClickedRef = useRef<boolean>(false);
  const isGeomanEditingRef = useRef<boolean>(false);
  const lastSelectedFeatureIdRef = useRef<string | null>(null);

  const hasFittedInitialRef = useRef<boolean>(false);
  const prevFeaturesCountRef = useRef<number>(0);

  useEffect(() => {
    onCursorMoveRef.current = onCursorMove;
    activeDrawModeRef.current = activeDrawMode;
    interactionModeRef.current = interactionMode;
    onFeatureCreateRef.current = onFeatureCreate;
    onDrawingPointsChangeRef.current = onDrawingPointsChange;
    onFeatureSelectRef.current = onFeatureSelect;
    onFeatureGeometryUpdateRef.current = onFeatureGeometryUpdate;
  }, [
    onCursorMove,
    activeDrawMode,
    interactionMode,
    onFeatureCreate,
    onDrawingPointsChange,
    onFeatureSelect,
    onFeatureGeometryUpdate,
  ]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [14.5, 108.3],
        zoom: 8,
        zoomControl: false,
      });

      const streetLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          maxZoom: 19,
          subdomains: 'abcd',
        }
      );

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri World Imagery',
          maxZoom: 18,
        }
      );

      streetLayer.addTo(map);

      baseLayersRef.current = {
        street: streetLayer,
        satellite: satelliteLayer,
      };

      featureLayersRef.current = L.layerGroup().addTo(map);
      tempDrawLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;

      const updateLabelVisibility = () => {
        if (!map) return;
        const container = map.getContainer();
        if (container) {
          if (map.getZoom() > 10) {
            container.classList.add('show-battle-labels');
          } else {
            container.classList.remove('show-battle-labels');
          }
        }
      };

      map.on('zoomend', updateLabelVisibility);
      updateLabelVisibility();

      // Handle map clicks for drawing and placement
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        if (onCursorMoveRef.current) {
          onCursorMoveRef.current({ lat, lng });
        }

        if (featureClickedRef.current) {
          featureClickedRef.current = false;
          return;
        }

          if (e && e.originalEvent && e.originalEvent.target) {
            const target = e.originalEvent.target as HTMLElement;
            if (
              target.classList &&
              typeof target.classList.contains === 'function' &&
              (target.classList.contains('marker-icon') ||
                target.classList.contains('leaflet-pm-draggable') ||
                target.classList.contains('leaflet-marker-icon') ||
                target.classList.contains('leaflet-interactive'))
            ) {
              return;
            }
          }

          if (onFeatureSelectRef.current) {
            onFeatureSelectRef.current(null);
          }

          if (!clickMarkerRef.current) {
            clickMarkerRef.current = L.circleMarker(e.latlng, {
              radius: 6,
              fillColor: '#ef4444',
              fillOpacity: 1,
              color: '#ffffff',
              weight: 2,
            }).addTo(map);
          } else {
            if (!map.hasLayer(clickMarkerRef.current)) {
              clickMarkerRef.current.addTo(map);
            }
            clickMarkerRef.current.setLatLng(e.latlng);
          }
      });

      if (onMapReady) {
        onMapReady(map);
      }
    }

    return () => {
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

    if (baseMap === 'street') {
      if (map.hasLayer(baseLayers.satellite)) map.removeLayer(baseLayers.satellite);
      if (!map.hasLayer(baseLayers.street)) map.addLayer(baseLayers.street);
    } else if (baseMap === 'satellite') {
      if (map.hasLayer(baseLayers.street)) map.removeLayer(baseLayers.street);
      if (!map.hasLayer(baseLayers.satellite)) map.addLayer(baseLayers.satellite);
    }
  }, [baseMap]);

  // Update Map Cursor based on draw mode & interaction mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const container = map.getContainer();
    if (interactionMode === 'hand') {
      container.style.cursor = 'grab';
    } else if (
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

  // Render Spatial Features & Attach Editing Handlers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !featureLayersRef.current) return;

    // Check if this update was triggered by Geoman vertex/geometry edit on the active selected feature
    if (
      isGeomanEditingRef.current &&
      selectedFeatureId &&
      selectedFeatureId === lastSelectedFeatureIdRef.current
    ) {
      isGeomanEditingRef.current = false;
      return;
    }

    isGeomanEditingRef.current = false;
    lastSelectedFeatureIdRef.current = selectedFeatureId || null;

    // Safely disable Geoman on all existing feature layers before clearing
    featureLayersRef.current.eachLayer((l: any) => {
      if (l && l.pm) {
        try {
          if (
            typeof l.pm.disable === 'function' &&
            typeof l.pm.enabled === 'function' &&
            l.pm.enabled()
          ) {
            l.pm.disable();
          }
        } catch (e) {
          console.warn('Error disabling Geoman on layer:', e);
        }
      }
    });

    featureLayersRef.current.clearLayers();

    // Build visible layer set safely
    const visibleLayerIds = new Set(layers.filter((l) => l.visible).map((l) => l.id));
    const visibleLayerMap = new Map<string, LayerConfig>();
    layers.forEach((l) => visibleLayerMap.set(l.id, l));

    // Display ALL features if their layer is visible OR if layerId is missing/custom
    const activeFeatures = features.filter((f) => {
      if (!f) return false;
      if (!f.layerId) return true;
      const parentLayer = layers.find((l) => l.id === f.layerId);
      if (parentLayer) {
        return parentLayer.visible;
      }
      return visibleLayerIds.size === 0 || visibleLayerIds.has(f.layerId);
    });

    const allBounds: L.LatLng[] = [];

    activeFeatures.forEach((feat) => {
      const parentLayer = visibleLayerMap.get(feat.layerId) || layers[0];

      let featureColor = parentLayer?.color || '#2563eb';
      const rawPhanLoai = feat.properties?.PhanLoai ?? feat.properties?.phanLoai;
      const phanLoaiNum = Number(rawPhanLoai);

      if (rawPhanLoai !== undefined && rawPhanLoai !== null && PHAN_LOAI_COLORS[phanLoaiNum]) {
        featureColor = PHAN_LOAI_COLORS[phanLoaiNum].color;
      }

      const phanLoaiBadgeText = PHAN_LOAI_COLORS[phanLoaiNum]
        ? PHAN_LOAI_COLORS[phanLoaiNum].label
        : null;

      const isSelected = selectedFeatureId === feat.id;

      const isSearchAreaLayer =
        feat.layerId === 'layer4_khu_vuc_quy_tap' ||
        parentLayer?.id === 'layer4_khu_vuc_quy_tap' ||
        parentLayer?.name?.toLowerCase().includes('tìm kiếm') ||
        parentLayer?.name?.toLowerCase().includes('quy tập') ||
        parentLayer?.name?.toLowerCase().includes('khu vực');

      const isBattleLayer =
        feat.layerId === 'layer2_tran_danh' ||
        parentLayer?.id === 'layer2_tran_danh' ||
        parentLayer?.name?.toLowerCase().includes('trận đánh') ||
        parentLayer?.name?.toLowerCase().includes('tran danh');

      const isGraveLayer =
        feat.layerId === 'layer1_mo_liet_si' ||
        parentLayer?.id === 'layer1_mo_liet_si' ||
        parentLayer?.name?.toLowerCase().includes('mộ') ||
        parentLayer?.name?.toLowerCase().includes('mo');

      const isCemeteryLayer =
        feat.layerId === 'layer3_nghia_trang' ||
        parentLayer?.id === 'layer3_nghia_trang' ||
        parentLayer?.name?.toLowerCase().includes('nghĩa trang') ||
        parentLayer?.name?.toLowerCase().includes('nghia trang');

      const shouldShowLabel = isBattleLayer;

      try {
        let pointCoords = feat.coordinates;
        if (typeof pointCoords === 'string') {
          try {
            pointCoords = JSON.parse(pointCoords);
          } catch (e) {
            pointCoords = [];
          }
        }

        if (
          feat.type === 'Point' &&
          Array.isArray(pointCoords) &&
          pointCoords.length >= 2
        ) {
          let x = Number(pointCoords[0]);
          let y = Number(pointCoords[1]);
          let lat = y;
          let lng = x;

          if (Math.abs(x) > 180 || Math.abs(y) > 90) {
            try {
              const [pLng, pLat] = proj4('EPSG:3405', 'EPSG:4326', [x, y]);
              lng = pLng;
              lat = pLat;
            } catch (e) {
              console.warn('Proj4 point error:', e);
            }
          }

          const markerLatLng = L.latLng(lat, lng);
          allBounds.push(markerLatLng);

          const { name: titleName, hiddenKey } = getFeatureName(feat);

          let pointMarker: L.Marker | L.CircleMarker;

          // Draggable point when selected in pointer mode
          const isDraggable = interactionMode === 'pointer' && isSelected;

          if (isSearchAreaLayer) {
            const size = isSelected ? 30 : 24;
            const searchIcon = L.divIcon({
              html: `
                <svg viewBox="0 0 24 24" width="${size}" height="${size}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
                  <polygon points="12 1.5 21.5 7 21.5 17 12 22.5 2.5 17 2.5 7" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#f59e0b'}" stroke-width="${isSelected ? '3' : '2.2'}" />
                  <svg x="4.5" y="4.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3l4 4" />
                    <path d="M19 5l-8 8" />
                    <path d="M13 11l-2-2" />
                    <path d="M10 12l-6 6a3 3 0 0 0 0 4.24l.76.76a3 3 0 0 0 4.24 0l6-6" />
                    <path d="M12 10l2 2" />
                  </svg>
                </svg>
              `,
              className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
              popupAnchor: [0, -10],
            });
            pointMarker = L.marker(markerLatLng, { icon: searchIcon, draggable: isDraggable });
          } else if (isBattleLayer) {
            const size = isSelected ? 30 : 24;
            const battleIcon = L.divIcon({
              html: `
                <svg viewBox="0 0 24 24" width="${size}" height="${size}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
                  <circle cx="12" cy="12" r="10.5" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#dc2626'}" stroke-width="${isSelected ? '3' : '2.2'}" />
                  <svg x="4.5" y="4.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
                    <line x1="13" x2="19" y1="19" y2="13" />
                    <line x1="16" x2="20" y1="16" y2="20" />
                    <line x1="19" x2="21" y1="21" y2="19" />
                    <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
                    <line x1="5" x2="9" y1="14" y2="18" />
                    <line x1="7" x2="4" y1="17" y2="20" />
                    <line x1="3" x2="5" y1="19" y2="21" />
                  </svg>
                </svg>
              `,
              className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
              popupAnchor: [0, -10],
            });
            pointMarker = L.marker(markerLatLng, { icon: battleIcon, draggable: isDraggable });
          } else if (isGraveLayer) {
            const size = isSelected ? 30 : 24;
            const graveIcon = L.divIcon({
              html: `
                <svg viewBox="0 0 24 24" width="${size}" height="${size}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
                  <polygon points="12 1.5 22.5 21.5 1.5 21.5" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#16a34a'}" stroke-width="${isSelected ? '3' : '2.2'}" />
                  <svg x="5" y="7.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 20h20" />
                    <path d="M4 20c0-4.5 3.58-8 8-8s8 3.5 8 8" />
                    <path d="M9 12V6a3 3 0 0 1 6 0v6" />
                    <path d="M12 7.5v3" />
                    <path d="M10.5 9h3" />
                  </svg>
                </svg>
              `,
              className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
              popupAnchor: [0, -10],
            });
            pointMarker = L.marker(markerLatLng, { icon: graveIcon, draggable: isDraggable });
          } else if (isCemeteryLayer) {
            const size = isSelected ? 30 : 24;
            const cemeteryIcon = L.divIcon({
              html: `
                <svg viewBox="0 0 24 24" width="${size}" height="${size}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
                  <rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#9333ea'}" stroke-width="${isSelected ? '3' : '2.2'}" />
                  <svg x="4.5" y="4.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9333ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 21h18" />
                    <path d="M5 21v-2h14v2" />
                    <path d="M7 19v-2h10v2" />
                    <path d="M9 17l1.5-12h3L15 17" />
                    <polygon points="12 2 12.8 3.8 14.8 3.8 13.2 5 13.8 6.8 12 5.6 10.2 6.8 10.8 5 9.2 3.8 11.2 3.8" fill="#9333ea" stroke="none" />
                  </svg>
                </svg>
              `,
              className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
              popupAnchor: [0, -10],
            });
            pointMarker = L.marker(markerLatLng, { icon: cemeteryIcon, draggable: isDraggable });
          } else {
            pointMarker = L.circleMarker(markerLatLng, {
              className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
              radius: isSelected ? 10 : 8,
              fillColor: isSelected ? '#2563eb' : featureColor,
              fillOpacity: 0.9,
              color: '#ffffff',
              weight: isSelected ? 3 : 2,
            });
          }

          const popupHtml = `
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 200px;">
              <div style="background-color: ${featureColor}; color: #ffffff; padding: 4px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; border-radius: 4px 4px 0 0; margin: -2px -2px 6px -2px;">
                ${parentLayer?.name || 'Vị trí GIS'}
              </div>
              <strong style="font-size: 13px; color: #1e3a8a;">${titleName}</strong><br/>
              <span style="color: #64748b; font-size: 11px;">Mã số: <b>${feat.code || feat.id}</b></span>
              ${
                phanLoaiBadgeText
                  ? `<div style="margin-top:4px;"><span style="background-color:${featureColor}; color:#ffffff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">${phanLoaiBadgeText}</span></div>`
                  : ''
              }
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                ${renderPopupProperties(feat, lat, lng, hiddenKey)}
              </div>
            </div>
          `;

          // Hand mode vs Pointer mode popup binding & click handlers
          if (interactionMode === 'hand') {
            pointMarker.bindPopup(popupHtml);
          } else if (pointMarker.getPopup()) {
            pointMarker.unbindPopup();
          }

          if (shouldShowLabel && titleName) {
            pointMarker.bindTooltip(titleName, {
              permanent: true,
              direction: 'bottom',
              offset: [0, 10],
              className: 'battle-map-label',
            });
          }

          // Drag end handler
          pointMarker.on('dragend', (e: any) => {
            isGeomanEditingRef.current = true;
            const newLatLng = e.target.getLatLng();
            const newCoords = [
              Number(newLatLng.lng.toFixed(6)),
              Number(newLatLng.lat.toFixed(6)),
            ];
            if (onFeatureGeometryUpdateRef.current) {
              onFeatureGeometryUpdateRef.current(feat.id, newCoords);
            }
          });

          pointMarker.on('click', (e: any) => {
            featureClickedRef.current = true;
            if (e && e.originalEvent) {
              L.DomEvent.stopPropagation(e.originalEvent);
            } else if (e) {
              L.DomEvent.stopPropagation(e);
            }
            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: markerLatLng.lat, lng: markerLatLng.lng });
            }
            if (interactionMode === 'hand') {
              pointMarker.openPopup(e.latlng || markerLatLng);
            } else if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(feat);
            }
          });

          featureLayersRef.current?.addLayer(pointMarker);
        } else if (
          (feat.type === 'Polygon' || feat.type === 'MultiPolygon') &&
          Array.isArray(feat.coordinates)
        ) {
          const leafletCoords = toLeafletCoords(feat.coordinates);

          const collectLatLngs = (arr: any) => {
            if (
              Array.isArray(arr) &&
              arr.length === 2 &&
              typeof arr[0] === 'number' &&
              typeof arr[1] === 'number'
            ) {
              allBounds.push(L.latLng(arr[0], arr[1]));
            } else if (Array.isArray(arr)) {
              arr.forEach(collectLatLngs);
            }
          };
          collectLatLngs(leafletCoords);

          const { name: titleName, hiddenKey } = getFeatureName(feat);

          const polygon = L.polygon(leafletCoords, {
            color: isSelected ? '#2563eb' : featureColor,
            fillColor: isSelected ? '#3b82f6' : featureColor,
            fillOpacity: isSelected ? 0.6 : 0.45,
            weight: isSelected ? 3.5 : 2.5,
          });

          const popupHtml = `
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 200px;">
              <div style="background-color: ${featureColor}; color: #ffffff; padding: 4px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; border-radius: 4px 4px 0 0; margin: -2px -2px 6px -2px;">
                ${parentLayer?.name || 'Khu vực GIS'}
              </div>
              <strong style="font-size: 13px; color: #1e3a8a;">${titleName}</strong><br/>
              <span style="color: #64748b; font-size: 11px;">Mã số: <b>${feat.code || feat.id}</b></span>
              ${
                phanLoaiBadgeText
                  ? `<div style="margin-top:4px;"><span style="background-color:${featureColor}; color:#ffffff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">${phanLoaiBadgeText}</span></div>`
                  : ''
              }
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                ${renderPopupProperties(feat, undefined, undefined, hiddenKey)}
              </div>
            </div>
          `;

          if (interactionMode === 'hand') {
            polygon.bindPopup(popupHtml);
          } else if (polygon.getPopup()) {
            polygon.unbindPopup();
          }

          if (shouldShowLabel && titleName) {
            polygon.bindTooltip(titleName, {
              permanent: true,
              direction: 'center',
              className: 'battle-map-label',
            });
          }

          polygon.on('click', (e: any) => {
            featureClickedRef.current = true;
            if (e && e.originalEvent) {
              L.DomEvent.stopPropagation(e.originalEvent);
            } else if (e) {
              L.DomEvent.stopPropagation(e);
            }
            const center = polygon.getBounds().getCenter();
            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
            }
            if (interactionMode === 'hand') {
              polygon.openPopup(e.latlng || center);
            } else if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(feat);
            }
          });

          featureLayersRef.current?.addLayer(polygon);

          // Enable Geoman Vertex Editing if selected in Pointer mode
          if (interactionMode === 'pointer' && isSelected && (polygon as any).pm) {
            (polygon as any).pm.enable({
              allowSelfIntersection: false,
              preventMarkerNested: true,
              snappable: true,
              draggable: false,
            });

            const handleGeomanEdit = () => {
              isGeomanEditingRef.current = true;
              const updatedLatLngs = polygon.getLatLngs();
              const newGeoCoords = leafletLatLngsToGeoJsonPolygon(updatedLatLngs);
              if (onFeatureGeometryUpdateRef.current) {
                onFeatureGeometryUpdateRef.current(feat.id, newGeoCoords);
              }
            };

            polygon.on('pm:edit', handleGeomanEdit);
            polygon.on('pm:markerdragend', handleGeomanEdit);
            polygon.on('pm:vertexchange', handleGeomanEdit);
          } else if ((polygon as any).pm && typeof (polygon as any).pm.enabled === 'function' && (polygon as any).pm.enabled()) {
            (polygon as any).pm.disable();
          }
        } else if (feat.type === 'LineString' && Array.isArray(feat.coordinates)) {
          const leafletCoords = toLeafletCoords(feat.coordinates);

          leafletCoords.forEach((c: any) => {
            if (Array.isArray(c) && typeof c[0] === 'number') {
              allBounds.push(L.latLng(c[0], c[1]));
            }
          });

          const { name: titleName, hiddenKey } = getFeatureName(feat);

          const polyline = L.polyline(leafletCoords, {
            color: isSelected ? '#2563eb' : featureColor,
            weight: isSelected ? 4.5 : 3,
          });

          const popupHtml = `
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 200px;">
              <strong style="font-size: 13px; color: #1e3a8a;">${titleName}</strong><br/>
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                ${renderPopupProperties(feat, undefined, undefined, hiddenKey)}
              </div>
            </div>
          `;

          if (interactionMode === 'hand') {
            polyline.bindPopup(popupHtml);
          } else if (polyline.getPopup()) {
            polyline.unbindPopup();
          }

          if (shouldShowLabel && titleName) {
            polyline.bindTooltip(titleName, {
              permanent: true,
              direction: 'center',
              className: 'battle-map-label',
            });
          }

          polyline.on('click', (e: any) => {
            featureClickedRef.current = true;
            if (e && e.originalEvent) {
              L.DomEvent.stopPropagation(e.originalEvent);
            } else if (e) {
              L.DomEvent.stopPropagation(e);
            }
            const bounds = polyline.getBounds();
            const center = bounds.getCenter();
            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
            }
            if (interactionMode === 'hand') {
              polyline.openPopup(e.latlng || center);
            } else if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(feat);
            }
          });

          featureLayersRef.current?.addLayer(polyline);

          if (interactionMode === 'pointer' && isSelected && (polyline as any).pm) {
            (polyline as any).pm.enable({
              preventMarkerNested: true,
              draggable: false,
            });

            const handleGeomanEdit = () => {
              isGeomanEditingRef.current = true;
              const updatedLatLngs = polyline.getLatLngs();
              const newGeoCoords = leafletLatLngsToGeoJsonLine(updatedLatLngs);
              if (onFeatureGeometryUpdateRef.current) {
                onFeatureGeometryUpdateRef.current(feat.id, newGeoCoords);
              }
            };

            polyline.on('pm:edit', handleGeomanEdit);
            polyline.on('pm:dragend', handleGeomanEdit);
            polyline.on('pm:markerdragend', handleGeomanEdit);
            polyline.on('pm:vertexchange', handleGeomanEdit);
          } else if ((polyline as any).pm && typeof (polyline as any).pm.enabled === 'function' && (polyline as any).pm.enabled()) {
            (polyline as any).pm.disable();
          }
        }
      } catch (err) {
        console.warn('Error rendering GeoJSON feature on Leaflet:', err, feat);
      }
    });

    const isInitial = !hasFittedInitialRef.current && allBounds.length > 0;
    const isNewImport =
      features.length > prevFeaturesCountRef.current && prevFeaturesCountRef.current > 0;

    if ((isInitial || isNewImport) && allBounds.length > 0 && map) {
      try {
        const bounds = L.latLngBounds(allBounds);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        hasFittedInitialRef.current = true;
      } catch (e) {
        // Ignore zoom errors
      }
    }

    prevFeaturesCountRef.current = features.length;

    if (map) {
      const container = map.getContainer();
      if (container) {
        if (map.getZoom() > 10) {
          container.classList.add('show-battle-labels');
        } else {
          container.classList.remove('show-battle-labels');
        }
      }
    }
  }, [layers, features, aliasVersion, interactionMode, selectedFeatureId]);

  return (
    <div className={`relative w-full h-full flex-1 ${interactionMode === 'pointer' ? 'mode-pointer' : interactionMode === 'hand' ? 'mode-hand' : ''}`}>
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />
    </div>
  );
};
