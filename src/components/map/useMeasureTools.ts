import { useState, useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import { GeoJsonFeatureItem, MapInteractionMode } from '../../types';
import {
  calculateLineDistance,
  calculatePolygonArea,
  formatDistance,
  formatArea,
  extractPolygonLatLngs,
} from '../../utils/geoMeasure';
import { getFeatureName } from './popupHelpers';
import { MeasureResult } from './MapMeasurePanel';

export function useMeasureTools(
  map: L.Map | null,
  interactionMode?: MapInteractionMode
) {
  const measurePointsRef = useRef<L.LatLng[]>([]);
  const measureLayerRef = useRef<L.LayerGroup | null>(null);
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);

  // Initialize or attach measure layer group to map
  useEffect(() => {
    if (!map) return;
    if (!measureLayerRef.current) {
      measureLayerRef.current = L.layerGroup().addTo(map);
    } else if (!map.hasLayer(measureLayerRef.current)) {
      measureLayerRef.current.addTo(map);
    }

    return () => {
      if (measureLayerRef.current && map.hasLayer(measureLayerRef.current)) {
        measureLayerRef.current.clearLayers();
        map.removeLayer(measureLayerRef.current);
        measureLayerRef.current = null;
      }
    };
  }, [map]);

  const handleClearMeasurement = useCallback(() => {
    measurePointsRef.current = [];
    if (measureLayerRef.current) {
      measureLayerRef.current.clearLayers();
    }
    setMeasureResult(null);
  }, []);

  // When interaction mode switches away from measurement, clear or keep as appropriate
  useEffect(() => {
    if (
      interactionMode !== 'measure_distance' &&
      interactionMode !== 'measure_area_custom' &&
      interactionMode !== 'measure_area_feature'
    ) {
      handleClearMeasurement();
    }
  }, [interactionMode, handleClearMeasurement]);

  const handleMeasureMapClick = useCallback((latlng: L.LatLng) => {
    const layer = measureLayerRef.current;
    if (!layer) return;

    if (interactionMode === 'measure_distance') {
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
    } else if (interactionMode === 'measure_area_custom') {
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
  }, [interactionMode]);

  const handleMeasureFeaturePolygon = useCallback((feat: GeoJsonFeatureItem) => {
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
  }, []);

  return {
    measureResult,
    handleClearMeasurement,
    handleMeasureMapClick,
    handleMeasureFeaturePolygon,
    measureLayerRef,
  };
}
