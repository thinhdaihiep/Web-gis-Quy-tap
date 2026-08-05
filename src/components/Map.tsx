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
  let name = feat.name || '';
  let hiddenKey: string | null = null;

  for (const k of Object.keys(props)) {
    const lowerKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const alias = getFieldAlias(k);
    if (
      alias === 'Tên' ||
      lowerKey === 'ten' ||
      lowerKey === 'name' ||
      lowerKey.includes('tenxa') ||
      lowerKey.includes('tentinh') ||
      lowerKey.includes('tenhuyen')
    ) {
      const val = props[k];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        name = String(val);
        hiddenKey = k;
        break;
      }
    }
  }

  if (!name || name === 'Feature' || name === 'Polygon' || name === 'Point' || name === 'LineString') {
    for (const k of Object.keys(props)) {
      if (k.toLowerCase().includes('ten')) {
        const val = props[k];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          name = String(val);
          hiddenKey = k;
          break;
        }
      }
    }
  }

  return { name: name || 'Đối tượng GIS', hiddenKey };
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

      // Handle map clicks for drawing and placement
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        if (onCursorMoveRef.current) {
          onCursorMoveRef.current({ lat, lng });
        }

        const mode = activeDrawModeRef.current;
        const modeType = interactionModeRef.current;

        if (modeType === 'pointer' && mode === 'point') {
          if (onFeatureCreateRef.current) {
            onFeatureCreateRef.current({
              type: 'Point',
              coordinates: [lng, lat],
            });
          }
        } else if (modeType === 'pointer' && (mode === 'line' || mode === 'polygon')) {
          const list = drawingVerticesRef ? drawingVerticesRef.current : localVerticesRef.current;
          list.push([lng, lat]);
          if (onDrawingPointsChangeRef.current) {
            onDrawingPointsChangeRef.current(list.length);
          }

          if (tempDrawLayerRef.current) {
            tempDrawLayerRef.current.clearLayers();
            const latLngs = list.map(([vLng, vLat]) => L.latLng(vLat, vLng));

            latLngs.forEach((ll) => {
              L.circleMarker(ll, {
                radius: 5,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                color: '#ffffff',
                weight: 2,
              }).addTo(tempDrawLayerRef.current!);
            });

            if (mode === 'line' && latLngs.length >= 2) {
              L.polyline(latLngs, { color: '#2563eb', weight: 3, dashArray: '6, 6' }).addTo(
                tempDrawLayerRef.current!
              );
            } else if (mode === 'polygon' && latLngs.length >= 3) {
              L.polygon(latLngs, {
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.35,
                weight: 2.5,
              }).addTo(tempDrawLayerRef.current!);
            }
          }
        } else {
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

          const isBattleLayer =
            feat.layerId === 'layer2_tran_danh' ||
            parentLayer?.id === 'layer2_tran_danh' ||
            parentLayer?.name?.toLowerCase().includes('trận đánh');

          const isGraveLayer =
            feat.layerId === 'layer1_mo_liet_si' ||
            parentLayer?.id === 'layer1_mo_liet_si' ||
            parentLayer?.name?.toLowerCase().includes('mộ');

          const isCemeteryLayer =
            feat.layerId === 'layer3_nghia_trang' ||
            parentLayer?.id === 'layer3_nghia_trang' ||
            parentLayer?.name?.toLowerCase().includes('nghĩa trang');

          // Draggable point when selected in pointer mode
          const isDraggable = interactionMode === 'pointer' && isSelected;

          if (isBattleLayer) {
            const flameIcon = L.divIcon({
              html: `
                <div style="width: ${isSelected ? 28 : 22}px; height: ${
                isSelected ? 28 : 22
              }px; background-color: #ffffff; border: ${
                isSelected ? '3px solid #2563eb' : '2px solid #ef4444'
              }; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#ef4444" stroke="#dc2626" stroke-width="0.5">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                  </svg>
                </div>
              `,
              className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
              iconSize: [isSelected ? 28 : 22, isSelected ? 28 : 22],
              iconAnchor: [isSelected ? 14 : 11, isSelected ? 14 : 11],
              popupAnchor: [0, -10],
            });
            pointMarker = L.marker(markerLatLng, { icon: flameIcon, draggable: isDraggable });
          } else if (isGraveLayer) {
            const graveIcon = L.divIcon({
              html: `
                <div style="width: ${isSelected ? 28 : 22}px; height: ${
                isSelected ? 28 : 22
              }px; background-color: #ffffff; border: ${
                isSelected ? '3px solid #2563eb' : '2px solid #16a34a'
              }; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#16a34a">
                    <path d="M12 3c-3.86 0-7 3.14-7 7v9h14v-9c0-3.86-3.14-7-7-7zm-1 3.5h2v2.5h2.5v2H13V15h-2v-4H8.5v-2H11V6.5z"/>
                  </svg>
                </div>
              `,
              className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
              iconSize: [isSelected ? 28 : 22, isSelected ? 28 : 22],
              iconAnchor: [isSelected ? 14 : 11, isSelected ? 14 : 11],
              popupAnchor: [0, -10],
            });
            pointMarker = L.marker(markerLatLng, { icon: graveIcon, draggable: isDraggable });
          } else if (isCemeteryLayer) {
            const cemeteryIcon = L.divIcon({
              html: `
                <div style="width: ${isSelected ? 28 : 22}px; height: ${
                isSelected ? 28 : 22
              }px; background-color: #ffffff; border: ${
                isSelected ? '3px solid #2563eb' : '2px solid #9333ea'
              }; border-radius: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#9333ea">
                    <path d="M4 20h16v2H4v-2zm2-2h12V10c0-3.31-2.69-6-6-6s-6 2.69-6 6v8zm5-11h2v2.5h2.5v2H13V15h-2v-3.5H8.5v-2H11V7z"/>
                  </svg>
                </div>
              `,
              className: `point-feature-marker ${isSelected ? 'point-feature-selected' : ''}`,
              iconSize: [isSelected ? 28 : 22, isSelected ? 28 : 22],
              iconAnchor: [isSelected ? 14 : 11, isSelected ? 14 : 11],
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

          if ((isBattleLayer || isGraveLayer || isCemeteryLayer) && titleName) {
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
  }, [layers, features, aliasVersion, interactionMode, selectedFeatureId]);

  return (
    <div className={`relative w-full h-full flex-1 ${interactionMode === 'pointer' ? 'mode-pointer' : interactionMode === 'hand' ? 'mode-hand' : ''}`}>
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />
    </div>
  );
};
