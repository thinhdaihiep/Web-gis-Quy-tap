import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import { BaseMapType, LayerConfig, GeoJsonFeatureItem, PHAN_LOAI_COLORS } from '../types';
import { getFieldAlias } from '../fieldAlias';

proj4.defs('EPSG:3405', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');

interface MapProps {
  baseMap: BaseMapType;
  layers: LayerConfig[];
  features: GeoJsonFeatureItem[];
  onMapReady?: (map: L.Map) => void;
  onCursorMove?: (pos: { lat: number; lng: number } | null) => void;
}

function renderPopupProperties(feat: GeoJsonFeatureItem, lat?: number, lng?: number): string {
  const props = feat.properties || {};
  const entries = Object.entries(props);
  let hasToaDo = false;

  const rows: string[] = [];

  entries.forEach(([k, v]) => {
    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Ignore HienTrang, TrangThaiMoi, OBJECTID, and ID keys as requested
    if (
      cleanKey === 'hientrang' ||
      cleanKey === 'trangthaimoi' ||
      cleanKey === 'objectid' ||
      cleanKey === 'id' ||
      cleanKey === 'fid'
    ) {
      return;
    }

    const alias = getFieldAlias(k);
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

// Convert GeoJSON coordinate structure handling EPSG:3405 meters to Leaflet [lat, lng] format
function toLeafletCoords(coords: any): any {
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

export const MapComponent: React.FC<MapProps> = ({
  baseMap,
  layers,
  features,
  onMapReady,
  onCursorMove,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<{ street: L.TileLayer; satellite: L.TileLayer } | null>(null);
  const featureLayersRef = useRef<L.LayerGroup | null>(null);
  const clickMarkerRef = useRef<L.CircleMarker | null>(null);
  const onCursorMoveRef = useRef(onCursorMove);
  const hasFittedInitialRef = useRef<boolean>(false);
  const prevFeaturesCountRef = useRef<number>(0);

  useEffect(() => {
    onCursorMoveRef.current = onCursorMove;
  }, [onCursorMove]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [14.5, 108.3], // Central Vietnam
        zoom: 8,
        zoomControl: false,
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onCursorMoveRef.current) {
          onCursorMoveRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
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

      const streetLayer = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
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

      mapInstanceRef.current = map;
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

  // Render Spatial Features with PhanLoai Color Logic
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !featureLayersRef.current) return;

    featureLayersRef.current.clearLayers();

    const visibleLayerMap = new Map<string, LayerConfig>();
    layers.forEach((l) => {
      if (l.visible) visibleLayerMap.set(l.id, l);
    });

    const activeFeatures = features.filter((f) => visibleLayerMap.has(f.layerId));
    const allBounds: L.LatLng[] = [];

    activeFeatures.forEach((feat) => {
      const parentLayer = visibleLayerMap.get(feat.layerId);

      // Determine feature color strictly using PhanLoai property if present
      let featureColor = parentLayer?.color || '#2563eb';
      const rawPhanLoai = feat.properties?.PhanLoai ?? feat.properties?.phanLoai;
      const phanLoaiNum = Number(rawPhanLoai);

      if (rawPhanLoai !== undefined && rawPhanLoai !== null && PHAN_LOAI_COLORS[phanLoaiNum]) {
        featureColor = PHAN_LOAI_COLORS[phanLoaiNum].color;
      }

      const phanLoaiBadgeText =
        PHAN_LOAI_COLORS[phanLoaiNum] ? PHAN_LOAI_COLORS[phanLoaiNum].label : null;

      try {
        if (feat.type === 'Point' && Array.isArray(feat.coordinates) && feat.coordinates.length >= 2) {
          let x = feat.coordinates[0];
          let y = feat.coordinates[1];
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

          const circleMarker = L.circleMarker(markerLatLng, {
            radius: 8,
            fillColor: featureColor,
            fillOpacity: 0.9,
            color: '#ffffff',
            weight: 2,
          });

          const popupHtml = `
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 200px;">
              <div style="background-color: ${featureColor}; color: #ffffff; padding: 4px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; border-radius: 4px 4px 0 0; margin: -2px -2px 6px -2px;">
                ${parentLayer?.name || 'Vị trí GIS'}
              </div>
              <strong style="font-size: 13px; color: #1e3a8a;">${feat.name}</strong><br/>
              <span style="color: #64748b; font-size: 11px;">Mã số: <b>${feat.code || feat.id}</b></span>
              ${
                phanLoaiBadgeText
                  ? `<div style="margin-top:4px;"><span style="background-color:${featureColor}; color:#ffffff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">${phanLoaiBadgeText}</span></div>`
                  : ''
              }
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                ${renderPopupProperties(feat, lat, lng)}
              </div>
            </div>
          `;

          circleMarker.bindPopup(popupHtml);
          
          circleMarker.on('click', () => {
            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: markerLatLng.lat, lng: markerLatLng.lng });
            }
            if (clickMarkerRef.current && mapInstanceRef.current) {
              mapInstanceRef.current.removeLayer(clickMarkerRef.current);
            }
          });

          featureLayersRef.current?.addLayer(circleMarker);
        } else if (
          (feat.type === 'Polygon' || feat.type === 'MultiPolygon') &&
          Array.isArray(feat.coordinates)
        ) {
          const leafletCoords = toLeafletCoords(feat.coordinates);

          // Flatten to collect LatLngs for bounds
          const collectLatLngs = (arr: any) => {
            if (Array.isArray(arr) && arr.length === 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
              allBounds.push(L.latLng(arr[0], arr[1]));
            } else if (Array.isArray(arr)) {
              arr.forEach(collectLatLngs);
            }
          };
          collectLatLngs(leafletCoords);

          const polygon = L.polygon(leafletCoords, {
            color: featureColor,
            fillColor: featureColor,
            fillOpacity: 0.45,
            weight: 2.5,
          });

          const popupHtml = `
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 200px;">
              <div style="background-color: ${featureColor}; color: #ffffff; padding: 4px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; border-radius: 4px 4px 0 0; margin: -2px -2px 6px -2px;">
                ${parentLayer?.name || 'Khu vực GIS'}
              </div>
              <strong style="font-size: 13px; color: #1e3a8a;">${feat.name}</strong><br/>
              <span style="color: #64748b; font-size: 11px;">Mã số: <b>${feat.code || feat.id}</b></span>
              ${
                phanLoaiBadgeText
                  ? `<div style="margin-top:4px;"><span style="background-color:${featureColor}; color:#ffffff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">${phanLoaiBadgeText}</span></div>`
                  : ''
              }
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                ${renderPopupProperties(feat)}
              </div>
            </div>
          `;

          polygon.bindPopup(popupHtml);
          
          polygon.on('click', () => {
            const center = polygon.getBounds().getCenter();
            if (onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
            }
            if (clickMarkerRef.current && mapInstanceRef.current) {
              mapInstanceRef.current.removeLayer(clickMarkerRef.current);
            }
          });

          featureLayersRef.current?.addLayer(polygon);
        }
      } catch (err) {
        console.warn('Error rendering GeoJSON feature on Leaflet:', err, feat);
      }
    });

    // Auto fit map bounds ONLY on initial load or when new features are imported
    const isInitial = !hasFittedInitialRef.current && allBounds.length > 0;
    const isNewImport = features.length > prevFeaturesCountRef.current && prevFeaturesCountRef.current > 0;

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
  }, [layers, features]);

  return (
    <div className="relative w-full h-full flex-1 z-0">
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />
    </div>
  );
};

