import React, { useState, useEffect, useRef } from 'react';
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
import { getFieldAlias, sortPropertyRows } from '../fieldAlias';
import {
  calculateLineDistance,
  calculatePolygonArea,
  formatDistance,
  formatArea,
  extractPolygonLatLngs,
} from '../utils/geoMeasure';
import { Ruler, DraftingCompass, Target, X } from 'lucide-react';

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
  pendingPasteFeature?: GeoJsonFeatureItem | null;
  targetMarkerLocation?: { lat: number; lng: number } | null;
  currentRole: 'admin' | 'editor' | 'guest';
  onMapReady?: (map: L.Map) => void;
  onCursorMove?: (pos: { lat: number; lng: number } | null) => void;
  onFeatureSelect?: (feature: GeoJsonFeatureItem | null) => void;
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

  const validItems: { key: string; alias: string; value: string }[] = [];

  entries.forEach(([k, v]) => {
    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      cleanKey === 'hientrang' ||
      cleanKey === 'trangthaimoi' ||
      cleanKey === 'chihuy' ||
      cleanKey === 'ketqua' ||
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
    validItems.push({ key: k, alias, value: valStr });
  });

  const sortedItems = sortPropertyRows(
    validItems.map((item) => ({ rawKey: item.key, aliasLabel: item.alias, value: item.value }))
  );

  const rows: string[] = sortedItems.map((item) => {
    return `<tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 3px 8px 3px 0; color: #475569; font-weight: 600; white-space: nowrap; vertical-align: top;">${item.aliasLabel}:</td>
      <td style="padding: 3px 0; color: #0f172a; font-weight: 700; text-align: right; word-break: break-word;">${item.value}</td>
    </tr>`;
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

function createPointIcon(
  type: 'search' | 'battle' | 'grave' | 'cemetery',
  isSelected: boolean
): L.DivIcon {
  const size = isSelected ? 30 : 24;
  if (type === 'search') {
    return L.divIcon({
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
  } else if (type === 'battle') {
    return L.divIcon({
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
  } else if (type === 'grave') {
    return L.divIcon({
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
  } else {
    return L.divIcon({
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
  }
}

export const MapComponent: React.FC<MapProps> = ({
  baseMap,
  layers,
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
  onFeatureCreate,
  onDrawingPointsChange,
  drawingVerticesRef,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<Record<BaseMapType, L.TileLayer> | null>(null);
  const featureLayersRef = useRef<L.LayerGroup | null>(null);
  const tempDrawLayerRef = useRef<L.LayerGroup | null>(null);
  const clickMarkerRef = useRef<L.CircleMarker | null>(null);

  // Feature Layer Cache Ref for fast selection updates
  const featureLayerMapRef = useRef<
    Map<
      string,
      {
        layer: L.Layer;
        updateStyle: (isSelected: boolean, mode: MapInteractionMode) => void;
      }
    >
  >(new Map());
  const prevSelectedFeatureIdRef = useRef<string | null>(null);
  const prevInteractionModeRef = useRef<MapInteractionMode>(interactionMode || 'hand');

  // Selection & interaction mode popup handler
  useEffect(() => {
    const mode: MapInteractionMode = (interactionMode || 'hand') as MapInteractionMode;

    if (mode !== 'hand' && mapInstanceRef.current) {
      mapInstanceRef.current.closePopup();
    }
  }, [selectedFeatureId, interactionMode]);

  // Measure Tool State & Refs
  const measurePointsRef = useRef<L.LatLng[]>([]);
  const measureLayerRef = useRef<L.LayerGroup | null>(null);
  const [measureResult, setMeasureResult] = useState<{
    mode: 'distance' | 'area_custom' | 'area_feature';
    valueString: string;
    subValueString?: string;
    featureName?: string;
  } | null>(null);

  const handleClearMeasurement = () => {
    measurePointsRef.current = [];
    if (measureLayerRef.current) {
      measureLayerRef.current.clearLayers();
    }
    setMeasureResult(null);
  };

  const handleMeasureMapClick = (latlng: L.LatLng) => {
    const mode = interactionModeRef.current;
    const layer = measureLayerRef.current;
    if (!layer) return;

    if (mode === 'measure_distance') {
      measurePointsRef.current.push(latlng);
      const pts = measurePointsRef.current;
      layer.clearLayers();

      L.polyline(pts, {
        color: '#4f46e5',
        weight: 3.5,
        dashArray: '6, 6',
        opacity: 0.9,
      }).addTo(layer);

      pts.forEach((pt, idx) => {
        L.circleMarker(pt, {
          radius: idx === pts.length - 1 ? 6 : 4,
          fillColor: '#ffffff',
          color: '#4f46e5',
          fillOpacity: 1,
          weight: 2,
        }).addTo(layer);
      });

      const totalMeters = calculateLineDistance(pts);
      setMeasureResult({
        mode: 'distance',
        valueString: formatDistance(totalMeters),
        subValueString: `${pts.length} điểm mốc`,
      });
    } else if (mode === 'measure_area_custom') {
      measurePointsRef.current.push(latlng);
      const pts = measurePointsRef.current;
      layer.clearLayers();

      if (pts.length >= 2) {
        L.polyline(pts, {
          color: '#059669',
          weight: 2.5,
          dashArray: '6, 6',
          opacity: 0.9,
        }).addTo(layer);
      }

      if (pts.length >= 3) {
        L.polygon(pts, {
          color: '#059669',
          fillColor: '#10b981',
          fillOpacity: 0.25,
          weight: 2.5,
          dashArray: '6, 6',
        }).addTo(layer);

        const areaSqMeters = calculatePolygonArea(pts);
        const perimeter = calculateLineDistance([...pts, pts[0]]);

        setMeasureResult({
          mode: 'area_custom',
          valueString: formatArea(areaSqMeters),
          subValueString: `Chu vi: ${formatDistance(perimeter)} (${pts.length} đỉnh)`,
        });
      } else {
        setMeasureResult({
          mode: 'area_custom',
          valueString: `Cần thêm điểm (${pts.length}/3)`,
          subValueString: `Click thêm ${3 - pts.length} điểm để khép kín`,
        });
      }

      pts.forEach((pt, idx) => {
        L.circleMarker(pt, {
          radius: idx === pts.length - 1 ? 6 : 4,
          fillColor: '#ffffff',
          color: '#059669',
          fillOpacity: 1,
          weight: 2,
        }).addTo(layer);
      });
    }
  };

  const handleMeasureFeaturePolygon = (feat: GeoJsonFeatureItem) => {
    const layer = measureLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    const latlngs = extractPolygonLatLngs(feat.coordinates);
    if (!latlngs || latlngs.length < 3) {
      setMeasureResult({
        mode: 'area_feature',
        valueString: 'Không thể tính diện tích',
        subValueString: 'Tọa độ đối tượng không hợp lệ',
        featureName: getFeatureName(feat).name,
      });
      return;
    }

    L.polygon(latlngs, {
      color: '#9333ea',
      fillColor: '#c084fc',
      fillOpacity: 0.35,
      weight: 3,
      dashArray: '6, 6',
    }).addTo(layer);

    latlngs.forEach((pt) => {
      L.circleMarker(pt, {
        radius: 4,
        fillColor: '#ffffff',
        color: '#9333ea',
        fillOpacity: 1,
        weight: 2,
      }).addTo(layer);
    });

    const areaSqMeters = calculatePolygonArea(latlngs);
    const perimeter = calculateLineDistance([...latlngs, latlngs[0]]);
    const featInfo = getFeatureName(feat);

    setMeasureResult({
      mode: 'area_feature',
      valueString: formatArea(areaSqMeters),
      subValueString: `Chu vi: ${formatDistance(perimeter)}`,
      featureName: featInfo.name,
    });
  };

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
      // Restore map center and zoom level from LocalStorage if available
      let initialCenter: [number, number] = [14.5, 108.3];
      let initialZoom = 8;
      let hasSavedView = false;
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
            hasSavedView = true;
          }
        }
      } catch (e) {}

      if (hasSavedView) {
        hasFittedInitialRef.current = true;
      }

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: false,
      });

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

      // 1. OpenStreetMap Standard (Tiếng Việt đầy đủ cấp Thôn/Xóm/Xã)
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      });

      // 2. ESRI World Topo Map (Địa hình & Đường đồng mức)
      const esriTopoLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), swisstopo, MapmyIndia, &copy; OpenStreetMap contributors, and the GIS User Community',
          maxZoom: 19,
        }
      );

      // 3. ESRI World Imagery (Vệ tinh)
      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          maxZoom: 18,
        }
      );

      streetLayer.addTo(map);

      baseLayersRef.current = {
        street: streetLayer,
        esri_topo: esriTopoLayer,
        satellite: satelliteLayer,
      };

      featureLayersRef.current = L.layerGroup().addTo(map);
      tempDrawLayerRef.current = L.layerGroup().addTo(map);
      measureLayerRef.current = L.layerGroup().addTo(map);

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

        // If in measure distance or custom area mode, process measurement click
        if (
          interactionModeRef.current === 'measure_distance' ||
          interactionModeRef.current === 'measure_area_custom'
        ) {
          handleMeasureMapClick(e.latlng);
          return;
        }

        if (featureClickedRef.current) {
          featureClickedRef.current = false;
          return;
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
            interactive: false,
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

    (Object.keys(baseLayers) as BaseMapType[]).forEach((key) => {
      const layer = baseLayers[key];
      if (key === baseMap) {
        if (!map.hasLayer(layer)) map.addLayer(layer);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });
  }, [baseMap]);

  // Reset measurement when interactionMode changes & control doubleClickZoom
  useEffect(() => {
    handleClearMeasurement();
    const map = mapInstanceRef.current;
    if (!map) return;
    if (
      interactionMode === 'measure_distance' ||
      interactionMode === 'measure_area_custom'
    ) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
  }, [interactionMode]);

  // Auto-measure feature area if feature selected while in measure_area_feature mode
  useEffect(() => {
    if (interactionMode === 'measure_area_feature' && selectedFeatureId) {
      const feat = features.find((f) => f.id === selectedFeatureId);
      if (feat && (feat.type === 'Polygon' || feat.type === 'MultiPolygon')) {
        handleMeasureFeaturePolygon(feat);
      }
    }
  }, [interactionMode, selectedFeatureId, features]);

  // Update Map Cursor based on draw mode & interaction mode
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

  // Handle external target location jump (from Footer coordinate input)
  useEffect(() => {
    if (!targetMarkerLocation) return;
    const map = mapInstanceRef.current;
    if (!map) return;

    const latlng = L.latLng(targetMarkerLocation.lat, targetMarkerLocation.lng);

    map.flyTo(latlng, Math.max(map.getZoom(), 16), { duration: 1.2 });

    if (!clickMarkerRef.current) {
      clickMarkerRef.current = L.circleMarker(latlng, {
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
      clickMarkerRef.current.setLatLng(latlng);
    }

    if (onCursorMoveRef.current) {
      onCursorMoveRef.current({ lat: targetMarkerLocation.lat, lng: targetMarkerLocation.lng });
    }
  }, [targetMarkerLocation]);

  // Render Ghost Paste Preview Feature on tempDrawLayerRef
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

    // Disable Geoman on previous layers safely while still attached to map
    featureLayerMapRef.current.forEach(({ layer }) => {
      if (layer) {
        if ((layer as any).pm) {
          try {
            if (typeof (layer as any).pm.disable === 'function') {
              (layer as any).pm.disable();
            }
          } catch (e) {}
        }
        try {
          if (map.hasLayer(layer)) {
            map.removeLayer(layer);
          }
        } catch (e) {}
      }
    });

    // Safely collect orphan Geoman vertex markers, handles, and temp layers first to avoid mutating map._layers mid-loop
    const orphanLayers: L.Layer[] = [];
    map.eachLayer((l: any) => {
      if (!l || l instanceof L.TileLayer) return;
      if (
        l._pmTempLayer ||
        l.pmMarker ||
        l._vertexMarker ||
        l.options?.isGeoman ||
        l.options?.isFinishMarker ||
        l.options?.isMiddleMarker ||
        (l.options &&
          l.options.className &&
          typeof l.options.className === 'string' &&
          (l.options.className.includes('leaflet-pm') ||
            l.options.className.includes('vertex-marker') ||
            l.options.className.includes('marker-icon')))
      ) {
        orphanLayers.push(l);
      }
    });

    orphanLayers.forEach((l) => {
      try {
        if (map.hasLayer(l)) {
          map.removeLayer(l);
        }
      } catch (e) {}
    });

    // Disable global map Geoman modes
    try {
      if ((map as any).pm) {
        if (typeof (map as any).pm.disableGlobalEditMode === 'function') {
          (map as any).pm.disableGlobalEditMode();
        }
        if (typeof (map as any).pm.disableDraw === 'function') {
          (map as any).pm.disableDraw();
        }
      }
    } catch (e) {}

    if (tempDrawLayerRef.current) {
      tempDrawLayerRef.current.clearLayers();
    }

    if (featureLayersRef.current) {
      featureLayersRef.current.clearLayers();
    }
    featureLayerMapRef.current.clear();

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

    const attachTooltipClickHandler = (layer: L.Layer, feat: GeoJsonFeatureItem) => {
      const tooltip = layer.getTooltip();
      if (!tooltip) return;

      const handleTooltipClick = (e: any) => {
        featureClickedRef.current = true;
        setTimeout(() => {
          featureClickedRef.current = false;
        }, 0);
        if (e && e.originalEvent) {
          L.DomEvent.stopPropagation(e.originalEvent);
        } else if (e) {
          L.DomEvent.stopPropagation(e);
        }

        const latlng = e.latlng || (typeof (layer as any).getLatLng === 'function' ? (layer as any).getLatLng() : (layer as any).getBounds ? (layer as any).getBounds().getCenter() : undefined);
        if (interactionModeRef.current === 'hand' && typeof (layer as any).openPopup === 'function') {
          (layer as any).openPopup(latlng);
        } else if (typeof (layer as any).closePopup === 'function') {
          (layer as any).closePopup();
          setTimeout(() => (layer as any).closePopup(), 0);
        }

        const center = typeof (layer as any).getLatLng === 'function' ? (layer as any).getLatLng() : (layer as any).getBounds ? (layer as any).getBounds().getCenter() : undefined;
        if (center && onCursorMoveRef.current) {
          onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
        }

        if (interactionModeRef.current === 'measure_area_feature') {
          handleMeasureFeaturePolygon(feat);
        }

        if (onFeatureSelectRef.current) {
          onFeatureSelectRef.current(feat);
        }
      };

      tooltip.on('click', handleTooltipClick);

      tooltip.on('add', () => {
        const el = tooltip.getElement();
        if (el) {
          L.DomEvent.off(el, 'click', handleTooltipClick);
          L.DomEvent.on(el, 'click', handleTooltipClick);
        }
      });
    };

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

          const pointType = isSearchAreaLayer
            ? 'search'
            : isBattleLayer
            ? 'battle'
            : isGraveLayer
            ? 'grave'
            : isCemeteryLayer
            ? 'cemetery'
            : null;

          if (pointType) {
            pointMarker = L.marker(markerLatLng, {
              icon: createPointIcon(pointType, isSelected),
              draggable: interactionMode === 'pointer' && isSelected,
            });
            if (isSelected) pointMarker.setZIndexOffset(1000);
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

          const updatePointStyle = (selected: boolean, mode: MapInteractionMode) => {
            if (pointType) {
              (pointMarker as L.Marker).setIcon(createPointIcon(pointType, selected));
              if (mode === 'pointer' && selected) {
                (pointMarker as L.Marker).dragging?.enable();
                (pointMarker as L.Marker).setZIndexOffset(1000);
              } else {
                (pointMarker as L.Marker).dragging?.disable();
                (pointMarker as L.Marker).setZIndexOffset(0);
              }
            } else if (pointMarker instanceof L.CircleMarker) {
              pointMarker.setStyle({
                radius: selected ? 10 : 8,
                fillColor: selected ? '#2563eb' : featureColor,
                weight: selected ? 3 : 2,
              });
              if (mode === 'pointer' && selected && (pointMarker as any).pm) {
                (pointMarker as any).pm.enable({ draggable: true });
              } else if ((pointMarker as any).pm) {
                try {
                  if (typeof (pointMarker as any).pm.disable === 'function') {
                    (pointMarker as any).pm.disable();
                  }
                } catch (e) {}
              }
            }
          };

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

          pointMarker.bindPopup(popupHtml);

          if (shouldShowLabel && titleName) {
            pointMarker.bindTooltip(titleName, {
              permanent: true,
              direction: 'bottom',
              offset: [0, 10],
              className: 'battle-map-label',
              interactive: true,
            });
            attachTooltipClickHandler(pointMarker, feat);
          }

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
            setTimeout(() => {
              featureClickedRef.current = false;
            }, 0);
            if (e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            else if (e) L.DomEvent.stopPropagation(e);

            if (interactionModeRef.current === 'pointer') {
              if (prevSelectedFeatureIdRef.current && prevSelectedFeatureIdRef.current !== feat.id) {
                featureLayerMapRef.current.get(prevSelectedFeatureIdRef.current)?.updateStyle(false, interactionModeRef.current);
              }
              updatePointStyle(true, interactionModeRef.current);
              prevSelectedFeatureIdRef.current = feat.id;
            }

            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: markerLatLng.lat, lng: markerLatLng.lng });
            }
            if (interactionModeRef.current === 'hand') {
              pointMarker.openPopup(e.latlng || markerLatLng);
            } else {
              pointMarker.closePopup();
              setTimeout(() => pointMarker.closePopup(), 0);
              if (onFeatureSelectRef.current) {
                onFeatureSelectRef.current(feat);
              }
            }
          });

          featureLayerMapRef.current.set(feat.id, {
            layer: pointMarker,
            updateStyle: updatePointStyle,
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

          const updatePolygonStyle = (selected: boolean, mode: MapInteractionMode) => {
            polygon.setStyle({
              color: selected ? '#2563eb' : featureColor,
              fillColor: selected ? '#3b82f6' : featureColor,
              fillOpacity: selected ? 0.6 : 0.45,
              weight: selected ? 3.5 : 2.5,
            });

            if (mode === 'pointer' && selected && (polygon as any).pm) {
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

              polygon.off('pm:edit', handleGeomanEdit);
              polygon.off('pm:markerdragend', handleGeomanEdit);
              polygon.off('pm:vertexchange', handleGeomanEdit);

              polygon.on('pm:edit', handleGeomanEdit);
              polygon.on('pm:markerdragend', handleGeomanEdit);
              polygon.on('pm:vertexchange', handleGeomanEdit);
            } else if ((polygon as any).pm) {
              try {
                if (typeof (polygon as any).pm.disable === 'function') {
                  (polygon as any).pm.disable();
                }
              } catch (e) {}
            }
          };

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

          polygon.bindPopup(popupHtml);

          if (shouldShowLabel && titleName) {
            polygon.bindTooltip(titleName, {
              permanent: true,
              direction: 'center',
              className: 'battle-map-label',
              interactive: true,
            });
            attachTooltipClickHandler(polygon, feat);
          }

          polygon.on('click', (e: any) => {
            featureClickedRef.current = true;
            setTimeout(() => {
              featureClickedRef.current = false;
            }, 0);
            if (e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            else if (e) L.DomEvent.stopPropagation(e);

            if (interactionModeRef.current === 'pointer') {
              if (prevSelectedFeatureIdRef.current && prevSelectedFeatureIdRef.current !== feat.id) {
                featureLayerMapRef.current.get(prevSelectedFeatureIdRef.current)?.updateStyle(false, interactionModeRef.current);
              }
              updatePolygonStyle(true, interactionModeRef.current);
              prevSelectedFeatureIdRef.current = feat.id;
            }

            const center = polygon.getBounds().getCenter();
            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
            }

            if (interactionModeRef.current === 'measure_area_feature') {
              polygon.closePopup();
              setTimeout(() => polygon.closePopup(), 0);
              handleMeasureFeaturePolygon(feat);
              if (onFeatureSelectRef.current) {
                onFeatureSelectRef.current(feat);
              }
            } else if (interactionModeRef.current === 'hand') {
              polygon.openPopup(e.latlng || center);
            } else {
              polygon.closePopup();
              setTimeout(() => polygon.closePopup(), 0);
              if (onFeatureSelectRef.current) {
                onFeatureSelectRef.current(feat);
              }
            }
          });

          featureLayerMapRef.current.set(feat.id, {
            layer: polygon,
            updateStyle: updatePolygonStyle,
          });

          featureLayersRef.current?.addLayer(polygon);

          // Apply initial style
          updatePolygonStyle(isSelected, (interactionMode || 'hand') as MapInteractionMode);
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

          const updatePolylineStyle = (selected: boolean, mode: MapInteractionMode) => {
            polyline.setStyle({
              color: selected ? '#2563eb' : featureColor,
              weight: selected ? 4.5 : 3,
            });

            if (mode === 'pointer' && selected && (polyline as any).pm) {
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

              polyline.off('pm:edit', handleGeomanEdit);
              polyline.off('pm:dragend', handleGeomanEdit);
              polyline.off('pm:markerdragend', handleGeomanEdit);
              polyline.off('pm:vertexchange', handleGeomanEdit);

              polyline.on('pm:edit', handleGeomanEdit);
              polyline.on('pm:dragend', handleGeomanEdit);
              polyline.on('pm:markerdragend', handleGeomanEdit);
              polyline.on('pm:vertexchange', handleGeomanEdit);
            } else if ((polyline as any).pm) {
              try {
                if (typeof (polyline as any).pm.disable === 'function') {
                  (polyline as any).pm.disable();
                }
              } catch (e) {}
            }
          };

          const popupHtml = `
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 200px;">
              <strong style="font-size: 13px; color: #1e3a8a;">${titleName}</strong><br/>
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                ${renderPopupProperties(feat, undefined, undefined, hiddenKey)}
              </div>
            </div>
          `;

          polyline.bindPopup(popupHtml);

          if (shouldShowLabel && titleName) {
            polyline.bindTooltip(titleName, {
              permanent: true,
              direction: 'center',
              className: 'battle-map-label',
              interactive: true,
            });
            attachTooltipClickHandler(polyline, feat);
          }

          polyline.on('click', (e: any) => {
            featureClickedRef.current = true;
            setTimeout(() => {
              featureClickedRef.current = false;
            }, 0);
            if (e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            else if (e) L.DomEvent.stopPropagation(e);

            if (interactionModeRef.current === 'pointer') {
              if (prevSelectedFeatureIdRef.current && prevSelectedFeatureIdRef.current !== feat.id) {
                featureLayerMapRef.current.get(prevSelectedFeatureIdRef.current)?.updateStyle(false, interactionModeRef.current);
              }
              updatePolylineStyle(true, interactionModeRef.current);
              prevSelectedFeatureIdRef.current = feat.id;
            }

            const bounds = polyline.getBounds();
            const center = bounds.getCenter();
            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
            }
            if (interactionModeRef.current === 'hand') {
              polyline.openPopup(e.latlng || center);
            } else {
              polyline.closePopup();
              setTimeout(() => polyline.closePopup(), 0);
              if (onFeatureSelectRef.current) {
                onFeatureSelectRef.current(feat);
              }
            }
          });

          featureLayerMapRef.current.set(feat.id, {
            layer: polyline,
            updateStyle: updatePolylineStyle,
          });

          featureLayersRef.current?.addLayer(polyline);

          // Apply initial style
          updatePolylineStyle(isSelected, (interactionMode || 'hand') as MapInteractionMode);
        }
      } catch (err) {
        console.warn('Error rendering GeoJSON feature on Leaflet:', err, feat);
      }
    });

    hasFittedInitialRef.current = true;
    prevFeaturesCountRef.current = features.length;
    prevSelectedFeatureIdRef.current = selectedFeatureId || null;
    prevInteractionModeRef.current = interactionMode;

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
  }, [layers, features, aliasVersion, selectedFeatureId, interactionMode]);

  return (
    <div
      className={`relative w-full h-full flex-1 ${
        interactionMode === 'pointer'
          ? 'mode-pointer'
          : interactionMode === 'hand'
          ? 'mode-hand'
          : ''
      }`}
    >
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />

      {/* Floating Measurement Result Widget */}
      {measureResult && (
        <div className="absolute bottom-6 right-6 z-[800] bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-2xl shadow-2xl border border-slate-200 flex items-center gap-3 text-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto">
          <div
            className={`p-2 rounded-xl text-white ${
              measureResult.mode === 'distance'
                ? 'bg-indigo-600'
                : measureResult.mode === 'area_custom'
                ? 'bg-emerald-600'
                : 'bg-purple-600'
            }`}
          >
            {measureResult.mode === 'distance' && <Ruler className="w-4 h-4" />}
            {measureResult.mode === 'area_custom' && <DraftingCompass className="w-4 h-4" />}
            {measureResult.mode === 'area_feature' && <Target className="w-4 h-4" />}
          </div>

          <div className="flex flex-col pr-1">
            {measureResult.featureName && (
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-[220px]">
                {measureResult.featureName}
              </span>
            )}
            <span className="text-sm font-bold text-slate-900 leading-snug">
              {measureResult.valueString}
            </span>
            {measureResult.subValueString && (
              <span className="text-[11px] font-medium text-slate-600 leading-snug">
                {measureResult.subValueString}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleClearMeasurement}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Xóa kết quả đo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
