import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import { createLeafletGeoRasterLayer } from '../utils/geotiffLoader';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

import {
  BaseMapType,
  LayerConfig,
  GeoJsonFeatureItem,
  PHAN_LOAI_COLORS,
  DrawToolMode,
  MapInteractionMode,
  RasterLayer,
  RasterLoadingStatus,
  normalizeBoundsBox,
  isBoundsInViewport,
} from '../types';
import {
  getFieldAlias,
  sortPropertyRows,
  isFieldHidden,
  getItemUniqueKey,
  isFeatureMatch,
  deduplicateFeaturesList,
} from '../fieldAlias';
import { formatDateForDisplay } from '../utils/dateFormatter';
import { convertWGS84ToTargetCRS } from '../utils/coordinateParser';
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
      k === hiddenKey ||
      isFieldHidden(k)
    ) {
      return;
    }

    const alias = getFieldAlias(k);
    if (!alias) {
      return;
    }
    if (alias === 'Tọa độ') hasToaDo = true;
    const formattedVal = formatDateForDisplay(v, k, alias);
    const valStr = formattedVal !== '' ? formattedVal : (v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '---');
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
  if (coords === null || coords === undefined) return [];
  if (typeof coords === 'string') {
    try {
      coords = JSON.parse(coords);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(coords) || coords.length === 0) return [];

  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    !isNaN(coords[0]) &&
    typeof coords[1] === 'number' &&
    !isNaN(coords[1])
  ) {
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

  return coords
    .filter((c: any) => c !== null && c !== undefined && (Array.isArray(c) || typeof c === 'string'))
    .map((c: any) => toLeafletCoords(c))
    .filter((c: any) => Array.isArray(c) && c.length > 0);
}

function leafletLatLngsToGeoJsonPolygon(latLngs: any): any {
  if (!Array.isArray(latLngs) || latLngs.length === 0) return [];

  if (
    Array.isArray(latLngs[0]) &&
    latLngs[0].length > 0 &&
    latLngs[0][0] &&
    typeof latLngs[0][0] === 'object' &&
    'lat' in latLngs[0][0]
  ) {
    return latLngs.map((ring: any) =>
      Array.isArray(ring)
        ? ring
            .filter((ll: any) => ll && typeof ll.lng === 'number' && !isNaN(ll.lng) && typeof ll.lat === 'number' && !isNaN(ll.lat))
            .map((ll: any) => [Number(ll.lng.toFixed(6)), Number(ll.lat.toFixed(6))])
        : []
    );
  }

  if (latLngs[0] && typeof latLngs[0] === 'object' && 'lat' in latLngs[0]) {
    const ring = latLngs
      .filter((ll: any) => ll && typeof ll.lng === 'number' && !isNaN(ll.lng) && typeof ll.lat === 'number' && !isNaN(ll.lat))
      .map((ll: any) => [
        Number(ll.lng.toFixed(6)),
        Number(ll.lat.toFixed(6)),
      ]);
    if (ring.length > 0) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        ring.push([...first]);
      }
    }
    return [ring];
  }

  return latLngs;
}

function leafletLatLngsToGeoJsonLine(latLngs: any): any {
  if (!Array.isArray(latLngs) || latLngs.length === 0) return [];
  if (latLngs[0] && typeof latLngs[0] === 'object' && 'lat' in latLngs[0]) {
    return latLngs
      .filter((ll: any) => ll && typeof ll.lng === 'number' && !isNaN(ll.lng) && typeof ll.lat === 'number' && !isNaN(ll.lat))
      .map((ll: any) => [
        Number(ll.lng.toFixed(6)),
        Number(ll.lat.toFixed(6)),
      ]);
  }
  return latLngs;
}

function createPointIcon(
  type: 'search' | 'battle' | 'grave' | 'cemetery' | 'default',
  isSelected: boolean,
  color: string = '#10b981'
): L.DivIcon {
  const size = isSelected ? 26 : 24;
  if (type === 'search') {
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <polygon points="12 1.5 21.5 7 21.5 17 12 22.5 2.5 17 2.5 7" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#f59e0b'}" stroke-width="${isSelected ? '1.5' : '1.8'}" />
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
          <circle cx="12" cy="12" r="10.5" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#dc2626'}" stroke-width="${isSelected ? '1.5' : '1.8'}" />
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
          <polygon points="12 1.5 22.5 21.5 1.5 21.5" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#16a34a'}" stroke-width="${isSelected ? '1.5' : '1.8'}" />
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
  } else if (type === 'cemetery') {
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="#ffffff" stroke="${isSelected ? '#2563eb' : '#9333ea'}" stroke-width="${isSelected ? '1.5' : '1.8'}" />
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
  } else {
    const dotSize = isSelected ? 22 : 20;
    const strokeWidth = 1.5;
    const strokeColor = isSelected ? '#2563eb' : '#ffffff';
    return L.divIcon({
      html: `
        <svg viewBox="0 0 24 24" width="${dotSize}" height="${dotSize}" class="marker-gis-svg ${isSelected ? 'is-selected' : ''}">
          <circle cx="12" cy="12" r="9.5" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
        </svg>
      `,
      className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
      iconSize: [dotSize, dotSize],
      iconAnchor: [dotSize / 2, dotSize / 2],
      popupAnchor: [0, -8],
    });
  }
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
  selectedCRS = '4326',
  currentRole,
  onMapReady,
  onCursorMove,
  onFeatureSelect,
  onFeatureGeometryUpdate,
  onFeatureCreate,
  onDrawingPointsChange,
  drawingVerticesRef,
  onRasterStatusChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<Record<BaseMapType, L.TileLayer> | null>(null);
  const featureLayersRef = useRef<L.LayerGroup | null>(null);
  const rasterLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const layerSubGroupsRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const tempDrawLayerRef = useRef<L.LayerGroup | null>(null);
  const clickMarkerRef = useRef<L.CircleMarker | null>(null);
  const rasterLayersCacheRef = useRef<Map<string, { layer: any; metadata: any }>>(new Map());
  const hasActivatedRasterRef = useRef<boolean>(false);
  const selectedCRSRef = useRef<'4326' | '3405' | '3406'>(selectedCRS);
  selectedCRSRef.current = selectedCRS;

  const onRasterStatusChangeRef = useRef(onRasterStatusChange);
  onRasterStatusChangeRef.current = onRasterStatusChange;
  const lastRasterStatusJsonRef = useRef<string>('');

  const reportRasterStatus = useCallback((status: RasterLoadingStatus) => {
    const json = JSON.stringify(status);
    if (lastRasterStatusJsonRef.current === json) return;
    lastRasterStatusJsonRef.current = json;
    if (onRasterStatusChangeRef.current) {
      onRasterStatusChangeRef.current(status);
    }
  }, []);

  // Helper đặt/di chuyển markpoint tới vị trí chỉ định
  const setOrUpdateMarkPoint = useCallback((latlng: L.LatLngExpression) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const targetLatLng = latlng instanceof L.LatLng ? latlng : L.latLng((latlng as any).lat ?? (latlng as any)[0], (latlng as any).lng ?? (latlng as any)[1]);
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
  }, []);

  // Feature Layer Cache Ref for fast selection updates
  const featureLayerMapRef = useRef<
    Map<
      string,
      {
        feature: GeoJsonFeatureItem;
        layer: L.Layer;
        updateStyle: (isSelected: boolean, mode: MapInteractionMode) => void;
      }
    >
  >(new Map());
  const prevSelectedFeatureIdRef = useRef<string | null>(null);
  const prevInteractionModeRef = useRef<MapInteractionMode>(interactionMode || 'hand');

  // Fast selection & interaction mode update effect (0ms re-render cost for selection changes)
  useEffect(() => {
    const currId = selectedFeatureId || null;
    const mode = (interactionMode || 'hand') as MapInteractionMode;

    if (mode !== 'hand' && mapInstanceRef.current) {
      mapInstanceRef.current.closePopup();
    }

    // Update ALL entries in featureLayerMapRef using isFeatureMatch to ensure correct feature is highlighted
    featureLayerMapRef.current.forEach((entry) => {
      const isSelected = currId ? isFeatureMatch(entry.feature, currId) : false;
      entry.updateStyle(isSelected, mode);
    });

    // Clean orphan vertex markers only when transitioning out of pointer mode or deselecting in pointer mode
    if (prevInteractionModeRef.current === 'pointer' && (mode !== 'pointer' || !currId) && mapInstanceRef.current) {
      const map = mapInstanceRef.current;
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
    }

    prevSelectedFeatureIdRef.current = currId;
    prevInteractionModeRef.current = mode;
  }, [selectedFeatureId, interactionMode]);

  // Dynamically update active markpoint popup when selectedCRS changes
  useEffect(() => {
    selectedCRSRef.current = selectedCRS;
  }, [selectedCRS]);

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
        const perimeter = pts.length > 0 ? calculateLineDistance([...pts, pts[0]]) : 0;

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
    const perimeter = latlngs.length > 0 ? calculateLineDistance([...latlngs, latlngs[0]]) : 0;
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
    let cleanupWheel: (() => void) | null = null;

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
        zoomSnap: 1,
        zoomDelta: 1,
        scrollWheelZoom: false, // Sử dụng bộ xử lý con lăn chuột chuyên biệt để đảm bảo mỗi lần lăn chỉ thay đổi đúng +/- 1 mức
      });

      // Điều khiển con lăn chuột: mỗi lần lăn chỉ thu phóng đúng +/- 1 mức zoom, không nhảy bậc
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

      // 1. OpenStreetMap Standard (Tiếng Việt đầy đủ cấp Thôn/Xóm/Xã)
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxZoom: 18,
      });

      // 2. ESRI World Topo Map (Địa hình & Đường đồng mức)
      const esriTopoLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a> &mdash; Topo Map',
          maxZoom: 18,
        }
      );

      // 3. ESRI World Imagery (Vệ tinh)
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

      // Create dedicated pane for raster layers (z-index 350, sits above base tilePane 200 and below overlayPane 400)
      try {
        if (!map.getPane('rasterPane')) {
          const rPane = map.createPane('rasterPane');
          rPane.style.zIndex = '350';
        }
      } catch (_) {}

      featureLayersRef.current = L.layerGroup().addTo(map);
      rasterLayerGroupRef.current = L.layerGroup({ pane: 'rasterPane' } as any).addTo(map);
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

        setOrUpdateMarkPoint(e.latlng);
      });

      // Khi hiện popup một đối tượng, đặt markpoint chính là tâm của đối tượng
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

function getShortRasterName(f: { fileName?: string; name?: string; url?: string }): string {
  let name = f.fileName || f.name || '';
  if (!name && f.url) {
    try {
      const parts = f.url.split('/');
      name = decodeURIComponent(parts[parts.length - 1] || '').split('?')[0];
    } catch {
      name = f.url.split('/').pop() || '';
    }
  }
  return name.replace(/\.(tif|tiff|geotiff|cog|png|jpg|jpeg)$/i, '').trim();
}

  // Update Raster Layers (COG / GeoTIFF) - Display on top of active base map when isRasterVisible is true
  useEffect(() => {
    let isActive = true;
    const map = mapInstanceRef.current;
    const rasterGroup = rasterLayerGroupRef.current;
    if (!map || !rasterGroup) return;

    if (isRasterVisible) {
      hasActivatedRasterRef.current = true;
    }

    // Điều khiển hiển thị trực quan của rasterPane: chỉ hiển thị khi checkbox bật VÀ zoom >= 12
    const updatePaneVisibility = () => {
      const rPane = map.getPane('rasterPane');
      if (rPane) {
        const isZoomOk = map.getZoom() >= 12;
        rPane.style.display = (isRasterVisible && isZoomOk) ? '' : 'none';
      }
    };

    updatePaneVisibility();

    // Nếu chưa từng bật checkbox raster lần nào, hoặc danh sách layers rỗng thì không tải
    if (!hasActivatedRasterRef.current || !rasterLayers || rasterLayers.length === 0) {
      reportRasterStatus({ state: 'idle' });
      return;
    }

    const cache = rasterLayersCacheRef.current;
    const pendingUrls = new Set<string>();
    let bufferDebounceTimer: any = null;
    
    // Evaluate and load rasters based on current viewport
    const evaluateRasters = () => {
      if (!isActive) return;

      updatePaneVisibility();

      if (!rasterLayers || rasterLayers.length === 0) {
        rasterGroup.clearLayers();
        reportRasterStatus({ state: 'idle' });
        return;
      }

      const targetLayers = rasterLayers.filter(
        (layer) => layer && (!activeRasterLayerId || layer.id === activeRasterLayerId)
      );

      const activeLayer = targetLayers.length > 0 ? targetLayers[0] : null;
      const activeLayerName = activeLayer?.name || 'Bản đồ Raster';

      let allFilesToProcess: Array<{
        url: string;
        fileName?: string;
        format?: 'COG' | 'GEOTIFF';
        opacity?: number;
        bounds?: any;
      }> = [];

      targetLayers.forEach((layer) => {
        if (layer?.files && Array.isArray(layer.files) && layer.files.length > 0) {
          layer.files.forEach((f) => {
            if (f?.url) allFilesToProcess.push({ ...f, opacity: layer.opacity ?? 1.0 });
          });
        } else if (layer?.url) {
          allFilesToProcess.push({
            url: layer.url,
            fileName: layer.name,
            opacity: layer.opacity ?? 1.0,
            bounds: layer.bounds,
          });
        }
      });

      // Requirement 2: Evaluate files based on map center distance
      const currentCenter = map.getCenter();

      // Sort by distance from viewport center
      const getDistanceToCenter = (f: any) => {
        const box = normalizeBoundsBox(f.bounds);
        if (!box) return Infinity; 
        
        const dLat = Math.max(0, box.south - currentCenter.lat, currentCenter.lat - box.north);
        const dLng = Math.max(0, box.west - currentCenter.lng, currentCenter.lng - box.east);
        const distanceToEdge = dLat * dLat + dLng * dLng;

        // If the map center is INSIDE the image (distanceToEdge === 0),
        // we break ties by calculating distance to the center of the image itself
        if (distanceToEdge === 0) {
            const boxCenterLat = (box.south + box.north) / 2;
            const boxCenterLng = (box.west + box.east) / 2;
            const distToBoxCenter = Math.pow(boxCenterLat - currentCenter.lat, 2) + Math.pow(boxCenterLng - currentCenter.lng, 2);
            return distToBoxCenter * 0.0000001; // Tiny penalty to sort among central images
        }

        return distanceToEdge;
      };

      let activeFiles = [...allFilesToProcess];

      // Limit strictly to 9 nearest rasters (1 center + 8 surrounding)
      // This is optimal for zoom >= 13, giving perfect continuity without memory bloat
      if (activeFiles.length > 9) {
        activeFiles.sort((a, b) => getDistanceToCenter(a) - getDistanceToCenter(b));
        activeFiles = activeFiles.slice(0, 9);
      }

      if (activeFiles.length === 0) {
        rasterGroup.clearLayers();
        reportRasterStatus({
          state: 'idle',
          message: 'Không có mảnh raster nào trong khu vực đang xem.',
          activeLayerName,
        });
        return;
      }

      // Sync active layers on the map
      const currentUrls = new Set(activeFiles.map((f) => f.url));
      rasterGroup.eachLayer((layer: any) => {
        let layerUrl = null;
        for (const [url, item] of cache.entries()) {
          if (item.layer === layer) {
            layerUrl = url;
            break;
          }
        }
        if (layerUrl && !currentUrls.has(layerUrl)) {
          rasterGroup.removeLayer(layer);
        }
      });

      let loadedCount = 0;
      let visibleLoadedCount = 0;
      let combinedBoundsBox: any = null;

      const mapBounds = map.getBounds();
      const currentViewportBox = {
        south: mapBounds.getSouth(),
        west: mapBounds.getWest(),
        north: mapBounds.getNorth(),
        east: mapBounds.getEast(),
      };

      // Attach already-cached layers that are in the Active Set
      activeFiles.forEach((file) => {
        if (cache.has(file.url)) {
          const cachedItem = cache.get(file.url)!;
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

        const targetList = inViewportUrls.size > 0
          ? activeFiles.filter((f) => inViewportUrls.has(f.url))
          : activeFiles;

        const uniqueNames = new Map<string, { state: 'loading' | 'loaded'; inViewport: boolean }>();
        targetList.forEach((f) => {
          const name = getShortRasterName(f);
          if (name) {
            const isLoaded = cache.has(f.url);
            const inView = inViewportUrls.has(f.url);
            const existing = uniqueNames.get(name);
            if (!existing) {
              uniqueNames.set(name, { state: isLoaded ? 'loaded' : 'loading', inViewport: inView });
            } else {
              if (!isLoaded) existing.state = 'loading';
              if (inView) existing.inViewport = true;
            }
          }
        });

        return Array.from(uniqueNames.entries())
          .map(([name, data]) => ({ name, state: data.state, inViewport: data.inViewport }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      };

      if (loadedCount === activeFiles.length) {
        const fileStatuses = getVisibleFileStatuses();
        const fileNames = fileStatuses.map(fs => fs.name);
        reportRasterStatus({
          state: 'loaded',
          progress: 100,
          message: fileNames.join(', ') || `Đã nạp ${loadedCount}/${activeFiles.length} ảnh raster`,
          loadedCount,
          totalCount: activeFiles.length,
          activeLayerName,
          bounds: combinedBoundsBox,
          fileNames,
          fileStatuses,
        });
      } else {
        const currentProgress = Math.round((loadedCount / activeFiles.length) * 100) || 5;
        const fileStatuses = getVisibleFileStatuses();
        const fileNames = fileStatuses.map(fs => fs.name);
        reportRasterStatus({
          state: 'loading',
          progress: currentProgress,
          message: `Đang nạp ${currentProgress}%`,
          loadedCount,
          totalCount: activeFiles.length,
          activeLayerName,
          bounds: combinedBoundsBox,
          fileNames,
          fileStatuses,
        });
      }

      // Shared single raster loader function
      const loadSingleRaster = async (file: any) => {
        if (!isActive || !file || !file.url || cache.has(file.url) || pendingUrls.has(file.url)) {
          return;
        }

        pendingUrls.add(file.url);
        try {
          const { layer: geoRasterLayer, metadata } = await createLeafletGeoRasterLayer(file.url, {
            opacity: file.opacity ?? 1.0,
            resolution: 256,
            pane: 'rasterPane',
            viewport: currentViewportBox,
            onProgress: (percent) => {
              if (isActive && percent < 100 && loadedCount < activeFiles.length) {
                const currentProgress = Math.min(99, Math.round(((loadedCount + percent / 100) / activeFiles.length) * 100));
                const fileStatuses = getVisibleFileStatuses();
                const fileNames = fileStatuses.map(fs => fs.name);
                reportRasterStatus({
                  state: 'loading',
                  progress: currentProgress,
                  message: `Đang nạp mảnh ${currentProgress}%`,
                  loadedCount,
                  totalCount: activeFiles.length,
                  activeLayerName,
                  fileNames,
                  fileStatuses,
                });
              }
            },
          });

          if (isActive && mapInstanceRef.current) {
            cache.set(file.url, { layer: geoRasterLayer, metadata });
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

            if (loadedCount >= activeFiles.length) {
              const fileStatuses = getVisibleFileStatuses();
              const fileNames = fileStatuses.map(fs => fs.name);
              reportRasterStatus({
                state: 'loaded',
                progress: 100,
                message: fileNames.join(', ') || `Đã nạp hoàn tất`,
                loadedCount,
                totalCount: activeFiles.length,
                activeLayerName,
                bounds: combinedBoundsBox,
                fileNames,
                fileStatuses,
              });
            } else {
              const currentProgress = Math.round((loadedCount / activeFiles.length) * 100);
              const fileStatuses = getVisibleFileStatuses();
              const fileNames = fileStatuses.map(fs => fs.name);
              reportRasterStatus({
                state: 'loading',
                progress: currentProgress,
                message: `Đang nạp ${currentProgress}%`,
                loadedCount,
                totalCount: activeFiles.length,
                activeLayerName,
                bounds: combinedBoundsBox,
                fileNames,
                fileStatuses,
              });
            }
          }
        } catch (e: any) {
          console.error('Lỗi khi nạp file raster COG:', file.fileName || file.url, e);
        } finally {
          pendingUrls.delete(file.url);
        }
      };

      const pendingFiles = activeFiles.filter((f) => f.url && !cache.has(f.url));
      if (pendingFiles.length > 0) {
        if (bufferDebounceTimer) clearTimeout(bufferDebounceTimer);
        
        bufferDebounceTimer = setTimeout(() => {
          if (!isActive) return;
          
          // Run loading in background microtasks with spacing so UI interactions never lag
          (async () => {
            let idx = 0;
            const processNext = async () => {
              if (!isActive || idx >= pendingFiles.length) return;
              const file = pendingFiles[idx++];
              if (file && file.url && !cache.has(file.url) && !pendingUrls.has(file.url)) {
                // Yield to main thread before loading each raster
                await new Promise((res) => setTimeout(res, 60));
                await loadSingleRaster(file);
              }
              if (isActive) {
                await processNext();
              }
            };

            // Background worker with cooperative concurrency
            const workers = Math.min(4, pendingFiles.length);
            for (let b = 0; b < workers; b++) {
              processNext();
            }
          })();
        }, 500); // 500ms debounce before starting loads to ensure smooth panning
      }
    };

    let debounceTimer: any = null;
    const debouncedEvaluateRasters = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        evaluateRasters();
      }, 150);
    };

    const handleClearRasterCacheEvent = (e: any) => {
      const urls: string[] = e?.detail?.urls;
      if (urls && Array.isArray(urls)) {
        urls.forEach((u) => {
          const item = cache.get(u);
          if (item && typeof (item.layer as any).destroy === 'function') {
            (item.layer as any).destroy();
          }
          cache.delete(u);
        });
      } else {
        cache.forEach((item) => {
          if (item && typeof (item.layer as any).destroy === 'function') {
            (item.layer as any).destroy();
          }
        });
        cache.clear();
      }
      rasterGroup.clearLayers();
      evaluateRasters();
    };

    window.addEventListener('clear-raster-cache', handleClearRasterCacheEvent);

    // Evaluate initially
    evaluateRasters();

    // Re-evaluate on map movements with debounce to keep panning silky smooth
    map.on('moveend', debouncedEvaluateRasters);
    map.on('zoomend', debouncedEvaluateRasters);
    map.on('zoom', updatePaneVisibility);
    map.on('zoomend', updatePaneVisibility);

    return () => {
      isActive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (bufferDebounceTimer) clearTimeout(bufferDebounceTimer);
      window.removeEventListener('clear-raster-cache', handleClearRasterCacheEvent);
      map.off('moveend', debouncedEvaluateRasters);
      map.off('zoomend', debouncedEvaluateRasters);
      map.off('zoom', updatePaneVisibility);
      map.off('zoomend', updatePaneVisibility);
    };
  }, [rasterLayers, isRasterVisible, activeRasterLayerId]);

  // Update Base Map (Phố, Địa hình, Vệ tinh)
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
      const feat = features.find((f) => isFeatureMatch(f, selectedFeatureId));
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

  // Handle external target location jump (from search list or coordinate input)
  useEffect(() => {
    if (!targetMarkerLocation) return;
    const map = mapInstanceRef.current;
    if (!map) return;

    const latlng = L.latLng(targetMarkerLocation.lat, targetMarkerLocation.lng);

    // Ngắt animation cũ để phản hồi tức thì
    try {
      (map as any).stop?.();
    } catch (e) {}

    // Jump nhanh bản đồ tới vị trí với zoom 13
    map.flyTo(latlng, 13, { duration: 0.35 });

    // Hiển thị marker vị trí tương tự như khi kích chuột vào bản đồ trống (không hiện popup)
    if (!clickMarkerRef.current) {
      clickMarkerRef.current = L.circleMarker(latlng, {
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

    // Re-create dedicated LayerGroup per layerId for instantaneous 0ms show/hide toggling
    layerSubGroupsRef.current.forEach((grp) => {
      try {
        grp.clearLayers();
      } catch (e) {}
    });
    layerSubGroupsRef.current.clear();

    layers.forEach((l) => {
      layerSubGroupsRef.current.set(l.id, L.layerGroup());
    });
    layerSubGroupsRef.current.set('_unassigned_', L.layerGroup());

    // Render ALL features into their respective LayerGroups
    const layerConfigMap = new Map<string, LayerConfig>();
    layers.forEach((l) => layerConfigMap.set(l.id, l));
    const activeFeatures = deduplicateFeaturesList(features.filter(Boolean));

    const allBounds: L.LatLng[] = [];

    const attachTooltipClickHandler = (layer: L.Layer, featItem: GeoJsonFeatureItem) => {
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

        const layerBounds = typeof (layer as any).getBounds === 'function' ? (layer as any).getBounds() : null;
        const layerCenter = typeof (layer as any).getLatLng === 'function'
          ? (layer as any).getLatLng()
          : layerBounds && typeof layerBounds.isValid === 'function' && layerBounds.isValid()
          ? layerBounds.getCenter()
          : undefined;

        const latlng = layerCenter || e.latlng;
        if (interactionModeRef.current === 'hand' && typeof (layer as any).openPopup === 'function') {
          (layer as any).openPopup(latlng);
          if (layerCenter) {
            setOrUpdateMarkPoint(layerCenter);
          }
        } else if (typeof (layer as any).closePopup === 'function') {
          (layer as any).closePopup();
          setTimeout(() => (layer as any).closePopup(), 0);
        }

        const center = layerCenter;
        if (center && onCursorMoveRef.current) {
          onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
        }

        const fk = getItemUniqueKey(featItem);
        featureLayerMapRef.current.forEach((entry, k) => {
          entry.updateStyle(k === fk, interactionModeRef.current);
        });
        prevSelectedFeatureIdRef.current = fk;

        if (interactionModeRef.current === 'measure_area_feature') {
          handleMeasureFeaturePolygon(featItem);
        }

        if (onFeatureSelectRef.current) {
          onFeatureSelectRef.current(featItem);
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
      const featKey = getItemUniqueKey(feat);
      const parentLayer = (feat.layerId ? layerConfigMap.get(feat.layerId) : null) || (layers.length > 0 ? layers[0] : null);

      let featureColor = parentLayer?.color || '#10b981';
      const rawPhanLoai = feat.properties?.PhanLoai ?? feat.properties?.phanLoai;
      const phanLoaiNum = Number(rawPhanLoai);

      if (rawPhanLoai !== undefined && rawPhanLoai !== null && PHAN_LOAI_COLORS[phanLoaiNum]) {
        featureColor = PHAN_LOAI_COLORS[phanLoaiNum].color;
      }

      const phanLoaiBadgeText = PHAN_LOAI_COLORS[phanLoaiNum]
        ? PHAN_LOAI_COLORS[phanLoaiNum].label
        : null;

      const isSelected = isFeatureMatch(feat, selectedFeatureId);

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
          pointCoords.length >= 2 &&
          pointCoords[0] !== null &&
          pointCoords[1] !== null &&
          !isNaN(Number(pointCoords[0])) &&
          !isNaN(Number(pointCoords[1]))
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

          if (isNaN(lat) || isNaN(lng)) {
            return;
          }

          const markerLatLng = L.latLng(lat, lng);
          allBounds.push(markerLatLng);

          const { name: titleName, hiddenKey } = getFeatureName(feat);

          const pointType: 'search' | 'battle' | 'grave' | 'cemetery' | 'default' = isSearchAreaLayer
            ? 'search'
            : isBattleLayer
            ? 'battle'
            : isGraveLayer
            ? 'grave'
            : isCemeteryLayer
            ? 'cemetery'
            : 'default';

          const pointMarker = L.marker(markerLatLng, {
            icon: createPointIcon(pointType, isSelected, featureColor),
            draggable: (interactionMode === 'pointer' || interactionMode === 'edit') && isSelected,
            zIndexOffset: isSelected ? 1000 : 0,
          });

          const updatePointStyle = (selected: boolean, mode: MapInteractionMode) => {
            pointMarker.setIcon(createPointIcon(pointType, selected, featureColor));
            if (mode === 'pointer' && selected) {
              if (pointMarker.dragging) {
                pointMarker.dragging.enable();
              }
              pointMarker.setZIndexOffset(1000);
            } else {
              if (pointMarker.dragging) {
                pointMarker.dragging.disable();
              }
              pointMarker.setZIndexOffset(0);
            }
            const el = pointMarker.getElement();
            if (el) {
              if (selected) {
                L.DomUtil.addClass(el as HTMLElement, 'point-feature-selected');
              } else {
                L.DomUtil.removeClass(el as HTMLElement, 'point-feature-selected');
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

          const handlePointDrag = (e: any) => {
            isGeomanEditingRef.current = true;
            const newLatLng = e.target.getLatLng();
            const newCoords = [
              Number(newLatLng.lng.toFixed(6)),
              Number(newLatLng.lat.toFixed(6)),
            ];
            const entry = featureLayerMapRef.current.get(featKey);
            if (entry) {
              entry.feature = { ...entry.feature, coordinates: newCoords };
            }
            if (onFeatureGeometryUpdateRef.current) {
              onFeatureGeometryUpdateRef.current(feat.id || featKey, newCoords);
            }
          };

          pointMarker.off('dragend', handlePointDrag);
          pointMarker.on('dragend', handlePointDrag);

          pointMarker.on('click', (e: any) => {
            featureClickedRef.current = true;
            setTimeout(() => {
              featureClickedRef.current = false;
            }, 0);
            if (e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            else if (e) L.DomEvent.stopPropagation(e);

            const fk = getItemUniqueKey(feat);
            featureLayerMapRef.current.forEach((entry, k) => {
              entry.updateStyle(k === fk, interactionModeRef.current);
            });
            prevSelectedFeatureIdRef.current = fk;

            if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(feat);
            }

            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: markerLatLng.lat, lng: markerLatLng.lng });
            }
            if (interactionModeRef.current === 'hand') {
              pointMarker.openPopup(markerLatLng);
              setOrUpdateMarkPoint(markerLatLng);
            } else {
              pointMarker.closePopup();
              setTimeout(() => pointMarker.closePopup(), 0);
            }
          });

          featureLayerMapRef.current.set(featKey, {
            feature: feat,
            layer: pointMarker,
            updateStyle: updatePointStyle,
          });

          const targetSubGroup =
            (feat.layerId && layerSubGroupsRef.current.get(feat.layerId)) ||
            layerSubGroupsRef.current.get('_unassigned_');
          targetSubGroup?.addLayer(pointMarker);

          // Apply initial style after adding layer to DOM
          updatePointStyle(isSelected, (interactionMode || 'hand') as MapInteractionMode);
        } else if (
          (feat.type === 'Polygon' || feat.type === 'MultiPolygon') &&
          Array.isArray(feat.coordinates)
        ) {
          const leafletCoords = toLeafletCoords(feat.coordinates);

          let validPointCount = 0;
          const collectLatLngs = (arr: any) => {
            if (
              Array.isArray(arr) &&
              arr.length === 2 &&
              typeof arr[0] === 'number' && !isNaN(arr[0]) &&
              typeof arr[1] === 'number' && !isNaN(arr[1])
            ) {
              allBounds.push(L.latLng(arr[0], arr[1]));
              validPointCount++;
            } else if (Array.isArray(arr)) {
              arr.forEach(collectLatLngs);
            }
          };
          collectLatLngs(leafletCoords);

          if (validPointCount < 3) {
            return;
          }

          const { name: titleName, hiddenKey } = getFeatureName(feat);

          const polygon = L.polygon(leafletCoords, {
            color: isSelected ? '#2563eb' : featureColor,
            fillColor: isSelected ? '#3b82f6' : featureColor,
            fillOpacity: isSelected ? 0.5 : 0.4,
            weight: isSelected ? 2.5 : 1.5,
          });

          const updatePolygonStyle = (selected: boolean, mode: MapInteractionMode) => {
            polygon.setStyle({
              color: selected ? '#2563eb' : featureColor,
              fillColor: selected ? '#3b82f6' : featureColor,
              fillOpacity: selected ? 0.5 : 0.4,
              weight: selected ? 2.5 : 1.5,
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
                const entry = featureLayerMapRef.current.get(featKey);
                if (entry) {
                  entry.feature = { ...entry.feature, coordinates: newGeoCoords };
                }
                if (onFeatureGeometryUpdateRef.current) {
                  onFeatureGeometryUpdateRef.current(feat.id || featKey, newGeoCoords);
                }
              };

              (polygon as any).off('pm:edit');
              (polygon as any).off('pm:dragend');
              (polygon as any).off('pm:markerdragend');
              (polygon as any).off('pm:vertexchange');

              (polygon as any).on('pm:edit', handleGeomanEdit);
              (polygon as any).on('pm:dragend', handleGeomanEdit);
              (polygon as any).on('pm:markerdragend', handleGeomanEdit);
              (polygon as any).on('pm:vertexchange', handleGeomanEdit);
            } else if ((polygon as any).pm) {
              try {
                (polygon as any).off('pm:edit');
                (polygon as any).off('pm:dragend');
                (polygon as any).off('pm:markerdragend');
                (polygon as any).off('pm:vertexchange');
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

            const fk = getItemUniqueKey(feat);
            featureLayerMapRef.current.forEach((entry, k) => {
              entry.updateStyle(k === fk, interactionModeRef.current);
            });
            prevSelectedFeatureIdRef.current = fk;

            if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(feat);
            }

            const polyBounds = polygon.getBounds();
            const center = polyBounds && polyBounds.isValid() ? polyBounds.getCenter() : undefined;
            if (center && onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
            }

            if (interactionModeRef.current === 'measure_area_feature') {
              polygon.closePopup();
              setTimeout(() => polygon.closePopup(), 0);
              handleMeasureFeaturePolygon(feat);
            } else if (interactionModeRef.current === 'hand') {
              const targetPopupLatLng = center || e.latlng;
              polygon.openPopup(targetPopupLatLng);
              if (targetPopupLatLng) {
                setOrUpdateMarkPoint(targetPopupLatLng);
              }
            } else {
              polygon.closePopup();
              setTimeout(() => polygon.closePopup(), 0);
            }
          });

          featureLayerMapRef.current.set(featKey, {
            feature: feat,
            layer: polygon,
            updateStyle: updatePolygonStyle,
          });

          const targetSubGroup =
            (feat.layerId && layerSubGroupsRef.current.get(feat.layerId)) ||
            layerSubGroupsRef.current.get('_unassigned_');
          targetSubGroup?.addLayer(polygon);

          // Apply initial style
          updatePolygonStyle(isSelected, (interactionMode || 'hand') as MapInteractionMode);
        } else if (feat.type === 'LineString' && Array.isArray(feat.coordinates)) {
          const leafletCoords = toLeafletCoords(feat.coordinates);

          let validPointCount = 0;
          const validCoords: any[] = [];
          if (Array.isArray(leafletCoords)) {
            leafletCoords.forEach((c: any) => {
              if (Array.isArray(c) && typeof c[0] === 'number' && !isNaN(c[0]) && typeof c[1] === 'number' && !isNaN(c[1])) {
                allBounds.push(L.latLng(c[0], c[1]));
                validCoords.push(c);
                validPointCount++;
              }
            });
          }

          if (validPointCount < 2) {
            return;
          }

          const { name: titleName, hiddenKey } = getFeatureName(feat);

          const polyline = L.polyline(validCoords, {
            color: isSelected ? '#2563eb' : featureColor,
            weight: isSelected ? 3 : 2,
          });

          const updatePolylineStyle = (selected: boolean, mode: MapInteractionMode) => {
            polyline.setStyle({
              color: selected ? '#2563eb' : featureColor,
              weight: selected ? 3 : 2,
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
                const entry = featureLayerMapRef.current.get(featKey);
                if (entry) {
                  entry.feature = { ...entry.feature, coordinates: newGeoCoords };
                }
                if (onFeatureGeometryUpdateRef.current) {
                  onFeatureGeometryUpdateRef.current(feat.id || featKey, newGeoCoords);
                }
              };

              (polyline as any).off('pm:edit');
              (polyline as any).off('pm:dragend');
              (polyline as any).off('pm:markerdragend');
              (polyline as any).off('pm:vertexchange');

              (polyline as any).on('pm:edit', handleGeomanEdit);
              (polyline as any).on('pm:dragend', handleGeomanEdit);
              (polyline as any).on('pm:markerdragend', handleGeomanEdit);
              (polyline as any).on('pm:vertexchange', handleGeomanEdit);
            } else if ((polyline as any).pm) {
              try {
                (polyline as any).off('pm:edit');
                (polyline as any).off('pm:dragend');
                (polyline as any).off('pm:markerdragend');
                (polyline as any).off('pm:vertexchange');
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

            const fk = getItemUniqueKey(feat);
            featureLayerMapRef.current.forEach((entry, k) => {
              entry.updateStyle(k === fk, interactionModeRef.current);
            });
            prevSelectedFeatureIdRef.current = fk;

            if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(feat);
            }

            const lineBounds = polyline.getBounds();
            const center = lineBounds && lineBounds.isValid() ? lineBounds.getCenter() : undefined;
            if (center && onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
            }
            if (interactionModeRef.current === 'hand') {
              const targetPopupLatLng = center || e.latlng;
              polyline.openPopup(targetPopupLatLng);
              if (targetPopupLatLng) {
                setOrUpdateMarkPoint(targetPopupLatLng);
              }
            } else {
              polyline.closePopup();
              setTimeout(() => polyline.closePopup(), 0);
            }
          });

          featureLayerMapRef.current.set(featKey, {
            feature: feat,
            layer: polyline,
            updateStyle: updatePolylineStyle,
          });

          const targetSubGroup =
            (feat.layerId && layerSubGroupsRef.current.get(feat.layerId)) ||
            layerSubGroupsRef.current.get('_unassigned_');
          targetSubGroup?.addLayer(polyline);

          // Apply initial style
          updatePolylineStyle(isSelected, (interactionMode || 'hand') as MapInteractionMode);
        }
      } catch (err) {
        console.warn('Error rendering GeoJSON feature on Leaflet:', err, feat);
      }
    });

    // Attach initial visible sub-groups to main featureLayers container
    layers.forEach((l) => {
      const grp = layerSubGroupsRef.current.get(l.id);
      if (grp && l.visible && featureLayersRef.current) {
        featureLayersRef.current.addLayer(grp);
      }
    });
    const unassigned = layerSubGroupsRef.current.get('_unassigned_');
    if (unassigned && featureLayersRef.current) {
      featureLayersRef.current.addLayer(unassigned);
    }

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
  }, [features, aliasVersion, layers.map((l) => `${l.id}:${l.color || ''}`).join(';')]);

  // Ultra-fast layer visibility sync (0.1ms instantaneous DOM detach/attach)
  useEffect(() => {
    const parentGroup = featureLayersRef.current;
    if (!parentGroup) return;

    layers.forEach((l) => {
      const grp = layerSubGroupsRef.current.get(l.id);
      if (!grp) return;
      const isAttached = parentGroup.hasLayer(grp);
      if (l.visible && !isAttached) {
        parentGroup.addLayer(grp);
      } else if (!l.visible && isAttached) {
        parentGroup.removeLayer(grp);
      }
    });
  }, [layers]);

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
