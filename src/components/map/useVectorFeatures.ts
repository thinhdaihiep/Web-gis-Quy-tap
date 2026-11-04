import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import {
  LayerConfig,
  GeoJsonFeatureItem,
  PHAN_LOAI_COLORS,
  MapInteractionMode,
} from '../../types';
import {
  getItemUniqueKey,
  isFeatureMatch,
  deduplicateFeaturesList,
  getFeatureDisplayCode,
} from '../../fieldAlias';
import {
  toLeafletCoords,
  leafletLatLngsToGeoJsonPolygon,
  leafletLatLngsToGeoJsonLine,
  getPointIcon,
  computeFeatureSignature,
} from './mapGeometryHelpers';
import {
  getFeatureName,
  renderPopupProperties,
  renderFeedbackButtonHtml,
} from './popupHelpers';

interface UseVectorFeaturesProps {
  map: L.Map | null;
  layers: LayerConfig[];
  features: GeoJsonFeatureItem[];
  selectedFeatureId?: string | null;
  interactionMode?: MapInteractionMode;
  aliasVersion?: number;
  onFeatureSelect?: (feature: GeoJsonFeatureItem | null) => void;
  onFeatureGeometryUpdate?: (featureId: string, newCoordinates: any) => void;
  onCursorMove?: (pos: { lat: number; lng: number } | null) => void;
  onMapRenderedReady?: () => void;
  setOrUpdateMarkPoint: (latlng: L.LatLngExpression) => void;
  handleMeasureFeaturePolygon: (feat: GeoJsonFeatureItem) => void;
  featureClickedRef: React.MutableRefObject<boolean>;
}


export function useVectorFeatures({
  map,
  layers,
  features,
  selectedFeatureId = null,
  interactionMode = 'hand',
  aliasVersion = 1,
  onFeatureSelect,
  onFeatureGeometryUpdate,
  onCursorMove,
  onMapRenderedReady,
  setOrUpdateMarkPoint,
  handleMeasureFeaturePolygon,
  featureClickedRef,
}: UseVectorFeaturesProps) {
  const featureLayersRef = useRef<L.LayerGroup | null>(null);
  const layerSubGroupsRef = useRef<Map<string, L.LayerGroup>>(new Map());

  const featureLayerMapRef = useRef<
    Map<
      string,
      {
        feature: GeoJsonFeatureItem;
        layer: L.Layer;
        updateStyle: (isSelected: boolean, mode: MapInteractionMode) => void;
        signature?: string;
        coordSignature?: string;
        parentSubGroup?: L.LayerGroup;
      }
    >
  >(new Map());

  const prevSelectedFeatureIdRef = useRef<string | null>(null);
  const prevInteractionModeRef = useRef<MapInteractionMode>(interactionMode);
  const isGeomanEditingRef = useRef<boolean>(false);
  const lastSelectedFeatureIdRef = useRef<string | null>(null);
  const hasNotifiedRenderedReadyRef = useRef<boolean>(false);

  const onFeatureSelectRef = useRef(onFeatureSelect);
  onFeatureSelectRef.current = onFeatureSelect;
  const onFeatureGeometryUpdateRef = useRef(onFeatureGeometryUpdate);
  onFeatureGeometryUpdateRef.current = onFeatureGeometryUpdate;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;
  const onMapRenderedReadyRef = useRef(onMapRenderedReady);
  onMapRenderedReadyRef.current = onMapRenderedReady;
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;

  // Initialize feature layer container on map
  useEffect(() => {
    if (!map) return;
    if (!featureLayersRef.current) {
      featureLayersRef.current = L.layerGroup().addTo(map);
    } else if (!map.hasLayer(featureLayersRef.current)) {
      featureLayersRef.current.addTo(map);
    }

    return () => {
      if (featureLayersRef.current && map.hasLayer(featureLayersRef.current)) {
        featureLayersRef.current.clearLayers();
        map.removeLayer(featureLayersRef.current);
        featureLayersRef.current = null;
      }
    };
  }, [map]);

  // Fast selection & interaction mode update effect
  useEffect(() => {
    const currId = selectedFeatureId || null;
    const mode = (interactionMode || 'hand') as MapInteractionMode;

    if (mode !== 'hand' && map) {
      map.closePopup();
    }

    featureLayerMapRef.current.forEach((entry) => {
      const isSelected = currId ? isFeatureMatch(entry.feature, currId) : false;
      entry.updateStyle(isSelected, mode);
    });

    if (prevInteractionModeRef.current === 'pointer' && (mode !== 'pointer' || !currId) && map) {
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
  }, [selectedFeatureId, interactionMode, map]);

  // Render Spatial Features & Attach Editing Handlers
  useEffect(() => {
    if (!map || !featureLayersRef.current) return;

    if (
      isGeomanEditingRef.current &&
      selectedFeatureId &&
      selectedFeatureId === lastSelectedFeatureIdRef.current
    ) {
      isGeomanEditingRef.current = false;
      return;
    }

    isGeomanEditingRef.current = false;
    const prevSelectedId = lastSelectedFeatureIdRef.current;
    lastSelectedFeatureIdRef.current = selectedFeatureId || null;

    if (prevSelectedId && prevSelectedId !== selectedFeatureId) {
      const prevEntry = featureLayerMapRef.current.get(prevSelectedId);
      if (prevEntry?.layer && (prevEntry.layer as any).pm) {
        try {
          if (typeof (prevEntry.layer as any).pm.disable === 'function') {
            (prevEntry.layer as any).pm.disable();
          }
        } catch (e) {}
      }
    }

    layers.forEach((l) => {
      if (!layerSubGroupsRef.current.has(l.id)) {
        const newGroup = L.layerGroup();
        layerSubGroupsRef.current.set(l.id, newGroup);
        if (l.visible && featureLayersRef.current) {
          featureLayersRef.current.addLayer(newGroup);
        }
      }
    });
    if (!layerSubGroupsRef.current.has('_unassigned_')) {
      const unassignedGrp = L.layerGroup();
      layerSubGroupsRef.current.set('_unassigned_', unassignedGrp);
      if (featureLayersRef.current) {
        featureLayersRef.current.addLayer(unassignedGrp);
      }
    }

    const layerConfigMap = new Map<string, LayerConfig>();
    layers.forEach((l) => layerConfigMap.set(l.id, l));
    const activeFeatures = deduplicateFeaturesList(features.filter(Boolean));

    const nextKeys = new Set(activeFeatures.map(getItemUniqueKey));
    featureLayerMapRef.current.forEach((entry, key) => {
      if (!nextKeys.has(key)) {
        if (entry.layer) {
          if ((entry.layer as any).pm && typeof (entry.layer as any).pm.disable === 'function') {
            try {
              (entry.layer as any).pm.disable();
            } catch (e) {}
          }
          if (entry.parentSubGroup) {
            entry.parentSubGroup.removeLayer(entry.layer);
          }
          if (featureLayersRef.current && featureLayersRef.current.hasLayer(entry.layer)) {
            featureLayersRef.current.removeLayer(entry.layer);
          }
          if (map.hasLayer(entry.layer)) {
            map.removeLayer(entry.layer);
          }
        }
        featureLayerMapRef.current.delete(key);
      }
    });

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

        const fk = getItemUniqueKey(featItem);
        const currentFeat = featureLayerMapRef.current.get(fk)?.feature || featItem;

        const layerBounds = typeof (layer as any).getBounds === 'function' ? (layer as any).getBounds() : null;
        const layerCenter =
          typeof (layer as any).getLatLng === 'function'
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

        featureLayerMapRef.current.forEach((entry, k) => {
          entry.updateStyle(k === fk, interactionModeRef.current);
        });
        prevSelectedFeatureIdRef.current = fk;

        if (interactionModeRef.current === 'measure_area_feature') {
          handleMeasureFeaturePolygon(currentFeat);
        }

        if (onFeatureSelectRef.current) {
          onFeatureSelectRef.current(currentFeat);
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

    function resolveFeatureLayer(
      featItem: GeoJsonFeatureItem,
      layerConfigs: LayerConfig[]
    ): { layerId: string; layerName: string; layerColor: string } {
      const rawLayerId = featItem.layerId ? String(featItem.layerId).trim() : '';
      const match = layerConfigs.find((l) => l.id.toLowerCase() === rawLayerId.toLowerCase());
      if (match) {
        return { layerId: match.id, layerName: match.name, layerColor: match.color || '#3b82f6' };
      }

      const lower = rawLayerId.toLowerCase();
      if (lower === 'layer2_tran_danh' || lower === 'layer3_tran_danh_lich_su' || lower.includes('tran_danh')) {
        const l =
          layerConfigs.find((x) => x.id === 'layer2_tran_danh') ||
          layerConfigs.find((x) => x.name.toLowerCase().includes('trận đánh'));
        return {
          layerId: 'layer2_tran_danh',
          layerName: l?.name || 'Các trận đánh lịch sử',
          layerColor: l?.color || '#f59e0b',
        };
      }
      if (
        lower === 'layer4_nghia_trang' ||
        lower === 'layer2_nghia_trang' ||
        lower === 'layer3_nghia_trang' ||
        lower.includes('nghia_trang')
      ) {
        const l =
          layerConfigs.find((x) => x.id === 'layer4_nghia_trang') ||
          layerConfigs.find((x) => x.name.toLowerCase().includes('nghĩa trang'));
        return {
          layerId: 'layer4_nghia_trang',
          layerName: l?.name || 'Nghĩa trang liệt sĩ',
          layerColor: l?.color || '#6366f1',
        };
      }
      if (
        lower === 'layer3_mo_chi' ||
        lower === 'layer1_mo_liet_si' ||
        lower.includes('mo_chi') ||
        lower.includes('mo_liet_si')
      ) {
        const l =
          layerConfigs.find((x) => x.id === 'layer3_mo_chi') ||
          layerConfigs.find((x) => x.name.toLowerCase().includes('mộ'));
        return {
          layerId: 'layer3_mo_chi',
          layerName: l?.name || 'Mộ liệt sĩ',
          layerColor: l?.color || '#10b981',
        };
      }
      if (
        lower === 'layer1_tim_kiem' ||
        lower === 'layer4_khu_vuc_quy_tap' ||
        lower.includes('tim_kiem') ||
        lower.includes('quy_tap')
      ) {
        const l =
          layerConfigs.find((x) => x.id === 'layer1_tim_kiem') ||
          layerConfigs.find(
            (x) => x.name.toLowerCase().includes('tìm kiếm') || x.name.toLowerCase().includes('quy tập')
          );
        return {
          layerId: 'layer1_tim_kiem',
          layerName: l?.name || 'Khu vực tìm kiếm, quy tập',
          layerColor: l?.color || '#ef4444',
        };
      }
      if (lower === 'layer5_nghiep_vu' || lower.includes('nghiep_vu') || lower.includes('nghiepvu')) {
        const l =
          layerConfigs.find((x) => x.id === 'layer5_nghiep_vu') ||
          layerConfigs.find((x) => x.name.toLowerCase().includes('nghiệp vụ'));
        return {
          layerId: 'layer5_nghiep_vu',
          layerName: l?.name || 'Lớp nghiệp vụ',
          layerColor: l?.color || '#facc15',
        };
      }

      return { layerId: rawLayerId || 'default', layerName: 'Vị trí GIS', layerColor: '#3b82f6' };
    }

    activeFeatures.forEach((feat) => {
      const featKey = getItemUniqueKey(feat);
      const resolvedLayer = resolveFeatureLayer(feat, layers);

      let featureColor = resolvedLayer.layerColor;
      const rawPhanLoai = feat.properties?.PhanLoai ?? feat.properties?.phanLoai;
      const phanLoaiNum = Number(rawPhanLoai);

      const isSearchAreaLayer =
        resolvedLayer.layerId === 'layer1_tim_kiem' ||
        resolvedLayer.layerId === 'layer4_khu_vuc_quy_tap' ||
        resolvedLayer.layerName.toLowerCase().includes('tìm kiếm') ||
        resolvedLayer.layerName.toLowerCase().includes('quy tập');

      const isBattleLayer =
        resolvedLayer.layerId === 'layer2_tran_danh' ||
        resolvedLayer.layerId === 'layer3_tran_danh_lich_su' ||
        resolvedLayer.layerName.toLowerCase().includes('trận đánh') ||
        resolvedLayer.layerName.toLowerCase().includes('tran danh');

      const isGraveLayer =
        resolvedLayer.layerId === 'layer3_mo_chi' ||
        resolvedLayer.layerId === 'layer1_mo_liet_si' ||
        resolvedLayer.layerName.toLowerCase().includes('mộ') ||
        resolvedLayer.layerName.toLowerCase().includes('mo');

      const isCemeteryLayer =
        resolvedLayer.layerId === 'layer4_nghia_trang' ||
        resolvedLayer.layerId === 'layer2_nghia_trang' ||
        resolvedLayer.layerId === 'layer3_nghia_trang' ||
        resolvedLayer.layerName.toLowerCase().includes('nghĩa trang') ||
        resolvedLayer.layerName.toLowerCase().includes('nghia trang');

      const isBusinessLayer =
        resolvedLayer.layerId === 'layer5_nghiep_vu' ||
        resolvedLayer.layerName.toLowerCase().includes('nghiệp vụ') ||
        resolvedLayer.layerName.toLowerCase().includes('nghiep vu');

      if (isSearchAreaLayer && rawPhanLoai !== undefined && rawPhanLoai !== null && PHAN_LOAI_COLORS[phanLoaiNum]) {
        featureColor = PHAN_LOAI_COLORS[phanLoaiNum].color;
      }

      const phanLoaiBadgeText =
        isSearchAreaLayer && PHAN_LOAI_COLORS[phanLoaiNum] ? PHAN_LOAI_COLORS[phanLoaiNum].label : null;

      const isSelected = isFeatureMatch(feat, selectedFeatureId);

      const { signature: newSignature, coordSignature: newCoordSig } = computeFeatureSignature(
        feat,
        isSelected,
        featureColor,
        aliasVersion
      );

      const existingEntry = featureLayerMapRef.current.get(featKey);
      if (existingEntry) {
        if (existingEntry.signature === newSignature) {
          return;
        }

        if (existingEntry.coordSignature === newCoordSig) {
          existingEntry.feature = feat;
          existingEntry.signature = newSignature;
          existingEntry.updateStyle(isSelected, (interactionMode || 'hand') as MapInteractionMode);
          return;
        }

        if (existingEntry.layer) {
          if ((existingEntry.layer as any).pm && typeof (existingEntry.layer as any).pm.disable === 'function') {
            try {
              (existingEntry.layer as any).pm.disable();
            } catch (e) {}
          }
          if (existingEntry.parentSubGroup) {
            existingEntry.parentSubGroup.removeLayer(existingEntry.layer);
          }
          if (featureLayersRef.current && featureLayersRef.current.hasLayer(existingEntry.layer)) {
            featureLayersRef.current.removeLayer(existingEntry.layer);
          }
          if (map.hasLayer(existingEntry.layer)) {
            map.removeLayer(existingEntry.layer);
          }
        }
        featureLayerMapRef.current.delete(featKey);
      }

      const shouldShowLabel = isBattleLayer || isBusinessLayer;

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

          const pointType: 'search' | 'battle' | 'grave' | 'cemetery' | 'business' | 'default' = isBusinessLayer
            ? 'business'
            : isSearchAreaLayer
            ? 'search'
            : isBattleLayer
            ? 'battle'
            : isGraveLayer
            ? 'grave'
            : isCemeteryLayer
            ? 'cemetery'
            : 'default';

          const pointMarker = L.marker(markerLatLng, {
            icon: getPointIcon(pointType, isSelected, featureColor),
            draggable: interactionMode === 'pointer' && isSelected,
            zIndexOffset: isSelected ? 1000 : 0,
          });

          const updatePointStyle = (selected: boolean, mode: MapInteractionMode) => {
            pointMarker.setIcon(getPointIcon(pointType, selected, featureColor));
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

          pointMarker.bindPopup(() => {
            const currentFeat = featureLayerMapRef.current.get(featKey)?.feature || feat;
            const currentResolved = resolveFeatureLayer(currentFeat, layers);
            const { name: currentTitle, hiddenKey: curHiddenKey } = getFeatureName(currentFeat);
            const hoSoUrl = currentFeat.properties?.HoSo || currentFeat.properties?.hoso || currentFeat.properties?.HOSO;
            const hoSoButtonHtml =
              hoSoUrl && String(hoSoUrl).trim() !== ''
                ? `<button type="button" onclick="if(window.__openGisPdfViewer){window.__openGisPdfViewer('${encodeURIComponent(String(hoSoUrl).trim())}')}else{window.open('${String(hoSoUrl).trim()}','_blank')}" style="cursor: pointer; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; background-color: #2563eb; color: #ffffff; border: none; border-radius: 4px; font-weight: bold; font-size: 10px; line-height: 1.2; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <span>Xem hồ sơ</span>
                  </button>`
                : '';

            return `
              <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 210px;">
                <div style="background-color: ${currentResolved.layerColor}; color: #ffffff; padding: 4px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; border-radius: 4px 4px 0 0; margin: -2px -2px 6px -2px;">
                  ${currentResolved.layerName}
                </div>
                <strong style="font-size: 13px; color: #1e3a8a;">${currentTitle}</strong><br/>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px;">
                  <span style="color: #64748b; font-size: 11px;">Mã: <b>${getFeatureDisplayCode(currentFeat)}</b></span>
                  ${hoSoButtonHtml}
                </div>
                ${
                  phanLoaiBadgeText
                    ? `<div style="margin-top:4px;"><span style="background-color:${currentResolved.layerColor}; color:#ffffff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">${phanLoaiBadgeText}</span></div>`
                    : ''
                }
                <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                  ${renderPopupProperties(currentFeat, lat, lng, curHiddenKey, currentResolved.layerId)}
                </div>
                ${renderFeedbackButtonHtml(currentFeat, currentResolved.layerName)}
              </div>
            `;
          });

          if (shouldShowLabel && titleName) {
            pointMarker.bindTooltip(titleName, {
              permanent: true,
              direction: 'bottom',
              offset: [0, 10],
              className: isBusinessLayer ? 'business-map-label' : 'battle-map-label',
              interactive: true,
            });
            attachTooltipClickHandler(pointMarker, feat);
          }

          const handlePointDrag = (e: any) => {
            isGeomanEditingRef.current = true;
            const newLatLng = e.target.getLatLng();
            const newCoords = [Number(newLatLng.lng.toFixed(6)), Number(newLatLng.lat.toFixed(6))];
            const entry = featureLayerMapRef.current.get(featKey);
            if (entry) {
              entry.feature = { ...entry.feature, coordinates: newCoords };
            }
            if (onFeatureGeometryUpdateRef.current) {
              onFeatureGeometryUpdateRef.current(featKey, newCoords);
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
            const currentFeat = featureLayerMapRef.current.get(fk)?.feature || feat;
            featureLayerMapRef.current.forEach((entry, k) => {
              entry.updateStyle(k === fk, interactionModeRef.current);
            });
            prevSelectedFeatureIdRef.current = fk;

            if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(currentFeat);
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

          const targetSubGroup =
            (feat.layerId && layerSubGroupsRef.current.get(feat.layerId)) ||
            layerSubGroupsRef.current.get('_unassigned_');

          featureLayerMapRef.current.set(featKey, {
            feature: feat,
            layer: pointMarker,
            updateStyle: updatePointStyle,
            signature: newSignature,
            coordSignature: newCoordSig,
            parentSubGroup: targetSubGroup,
          });

          targetSubGroup?.addLayer(pointMarker);
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
              typeof arr[0] === 'number' &&
              !isNaN(arr[0]) &&
              typeof arr[1] === 'number' &&
              !isNaN(arr[1])
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

          const polyBorderColor = isSelected ? '#2563eb' : isBusinessLayer ? '#dc2626' : featureColor;
          const polyFillColor = isSelected ? '#3b82f6' : isBusinessLayer ? '#facc15' : featureColor;
          const polyFillOpacity = isSelected ? 0.6 : isBusinessLayer ? 0.5 : 0.4;
          const polyWeight = isSelected ? 2.5 : isBusinessLayer ? 2 : 1.5;

          const polygon = L.polygon(leafletCoords, {
            color: polyBorderColor,
            fillColor: polyFillColor,
            fillOpacity: polyFillOpacity,
            weight: polyWeight,
          });

          const updatePolygonStyle = (selected: boolean, mode: MapInteractionMode) => {
            const curBorderColor = selected ? '#2563eb' : isBusinessLayer ? '#dc2626' : featureColor;
            const curFillColor = selected ? '#3b82f6' : isBusinessLayer ? '#facc15' : featureColor;
            const curFillOpacity = selected ? 0.6 : isBusinessLayer ? 0.5 : 0.4;
            const curWeight = selected ? 2.5 : isBusinessLayer ? 2 : 1.5;

            polygon.setStyle({
              color: curBorderColor,
              fillColor: curFillColor,
              fillOpacity: curFillOpacity,
              weight: curWeight,
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
                  onFeatureGeometryUpdateRef.current(featKey, newGeoCoords);
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

          polygon.bindPopup(() => {
            const currentFeat = featureLayerMapRef.current.get(featKey)?.feature || feat;
            const currentResolved = resolveFeatureLayer(currentFeat, layers);
            const { name: currentTitle, hiddenKey: curHiddenKey } = getFeatureName(currentFeat);
            const hoSoUrl = currentFeat.properties?.HoSo || currentFeat.properties?.hoso || currentFeat.properties?.HOSO;
            const hoSoButtonHtml =
              hoSoUrl && String(hoSoUrl).trim() !== ''
                ? `<button type="button" onclick="if(window.__openGisPdfViewer){window.__openGisPdfViewer('${encodeURIComponent(String(hoSoUrl).trim())}')}else{window.open('${String(hoSoUrl).trim()}','_blank')}" style="cursor: pointer; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; background-color: #2563eb; color: #ffffff; border: none; border-radius: 4px; font-weight: bold; font-size: 10px; line-height: 1.2; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <span>Xem hồ sơ</span>
                  </button>`
                : '';

            const isCurSearchArea =
              currentResolved.layerId === 'layer1_tim_kiem' ||
              currentResolved.layerId === 'layer4_khu_vuc_quy_tap' ||
              currentResolved.layerName.toLowerCase().includes('tìm kiếm') ||
              currentResolved.layerName.toLowerCase().includes('quy tập');

            const curRawPhanLoai = currentFeat.properties?.PhanLoai ?? currentFeat.properties?.phanLoai;
            const curPhanLoaiNum = Number(curRawPhanLoai);
            const phanLoaiConfig =
              isCurSearchArea && curRawPhanLoai !== undefined && curRawPhanLoai !== null && PHAN_LOAI_COLORS[curPhanLoaiNum]
                ? PHAN_LOAI_COLORS[curPhanLoaiNum]
                : null;

            const popupColor = phanLoaiConfig ? phanLoaiConfig.color : currentResolved.layerColor;
            const badgeText = phanLoaiConfig ? phanLoaiConfig.label : phanLoaiBadgeText;

            return `
              <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 210px;">
                <div style="background-color: ${popupColor}; color: #ffffff; padding: 4px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; border-radius: 4px 4px 0 0; margin: -2px -2px 6px -2px;">
                  ${currentResolved.layerName}
                </div>
                <strong style="font-size: 13px; color: #1e3a8a;">${currentTitle}</strong><br/>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px;">
                  <span style="color: #64748b; font-size: 11px;">Mã: <b>${getFeatureDisplayCode(currentFeat)}</b></span>
                  ${hoSoButtonHtml}
                </div>
                ${
                  badgeText
                    ? `<div style="margin-top:4px;"><span style="background-color:${popupColor}; color:#ffffff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">${badgeText}</span></div>`
                    : ''
                }
                <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                  ${renderPopupProperties(currentFeat, undefined, undefined, curHiddenKey, currentResolved.layerId)}
                </div>
                ${renderFeedbackButtonHtml(currentFeat, currentResolved.layerName)}
              </div>
            `;
          });

          if (shouldShowLabel && titleName) {
            polygon.bindTooltip(titleName, {
              permanent: true,
              direction: 'center',
              className: isBusinessLayer ? 'business-map-label' : 'battle-map-label',
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
            const currentFeat = featureLayerMapRef.current.get(fk)?.feature || feat;
            featureLayerMapRef.current.forEach((entry, k) => {
              entry.updateStyle(k === fk, interactionModeRef.current);
            });
            prevSelectedFeatureIdRef.current = fk;

            if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(currentFeat);
            }

            const polyBounds = polygon.getBounds();
            const center = polyBounds && polyBounds.isValid() ? polyBounds.getCenter() : undefined;
            if (center && onCursorMoveRef.current) {
              onCursorMoveRef.current({ lat: center.lat, lng: center.lng });
            }

            if (interactionModeRef.current === 'measure_area_feature') {
              polygon.closePopup();
              setTimeout(() => polygon.closePopup(), 0);
              handleMeasureFeaturePolygon(currentFeat);
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

          const targetSubGroup =
            (feat.layerId && layerSubGroupsRef.current.get(feat.layerId)) ||
            layerSubGroupsRef.current.get('_unassigned_');

          featureLayerMapRef.current.set(featKey, {
            feature: feat,
            layer: polygon,
            updateStyle: updatePolygonStyle,
            signature: newSignature,
            coordSignature: newCoordSig,
            parentSubGroup: targetSubGroup,
          });

          targetSubGroup?.addLayer(polygon);
          updatePolygonStyle(isSelected, (interactionMode || 'hand') as MapInteractionMode);
        } else if (feat.type === 'LineString' && Array.isArray(feat.coordinates)) {
          const leafletCoords = toLeafletCoords(feat.coordinates);

          let validPointCount = 0;
          const validCoords: any[] = [];
          if (Array.isArray(leafletCoords)) {
            leafletCoords.forEach((c: any) => {
              if (
                Array.isArray(c) &&
                typeof c[0] === 'number' &&
                !isNaN(c[0]) &&
                typeof c[1] === 'number' &&
                !isNaN(c[1])
              ) {
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
                  onFeatureGeometryUpdateRef.current(featKey, newGeoCoords);
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

          polyline.bindPopup(() => {
            const currentFeat = featureLayerMapRef.current.get(featKey)?.feature || feat;
            const currentResolved = resolveFeatureLayer(currentFeat, layers);
            const { name: currentTitle, hiddenKey: curHiddenKey } = getFeatureName(currentFeat);
            return `
              <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 2px; min-width: 200px;">
                <div style="background-color: ${currentResolved.layerColor}; color: #ffffff; padding: 4px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; border-radius: 4px 4px 0 0; margin: -2px -2px 6px -2px;">
                  ${currentResolved.layerName}
                </div>
                <strong style="font-size: 13px; color: #1e3a8a;">${currentTitle}</strong><br/>
                <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                  ${renderPopupProperties(currentFeat, undefined, undefined, curHiddenKey, currentResolved.layerId)}
                </div>
                ${renderFeedbackButtonHtml(currentFeat, currentResolved.layerName)}
              </div>
            `;
          });

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
            const currentFeat = featureLayerMapRef.current.get(fk)?.feature || feat;
            featureLayerMapRef.current.forEach((entry, k) => {
              entry.updateStyle(k === fk, interactionModeRef.current);
            });
            prevSelectedFeatureIdRef.current = fk;

            if (onFeatureSelectRef.current) {
              onFeatureSelectRef.current(currentFeat);
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

          const targetSubGroup =
            (feat.layerId && layerSubGroupsRef.current.get(feat.layerId)) ||
            layerSubGroupsRef.current.get('_unassigned_');

          featureLayerMapRef.current.set(featKey, {
            feature: feat,
            layer: polyline,
            updateStyle: updatePolylineStyle,
            signature: newSignature,
            coordSignature: newCoordSig,
            parentSubGroup: targetSubGroup,
          });

          targetSubGroup?.addLayer(polyline);
          updatePolylineStyle(isSelected, (interactionMode || 'hand') as MapInteractionMode);
        }
      } catch (err) {
        console.warn('Error rendering GeoJSON feature on Leaflet:', err, feat);
      }
    });

    layers.forEach((l) => {
      const grp = layerSubGroupsRef.current.get(l.id);
      if (grp && featureLayersRef.current) {
        const isAttached = featureLayersRef.current.hasLayer(grp);
        if (l.visible && !isAttached) {
          featureLayersRef.current.addLayer(grp);
        } else if (!l.visible && isAttached) {
          featureLayersRef.current.removeLayer(grp);
        }
      }
    });
    const unassigned = layerSubGroupsRef.current.get('_unassigned_');
    if (unassigned && featureLayersRef.current && !featureLayersRef.current.hasLayer(unassigned)) {
      featureLayersRef.current.addLayer(unassigned);
    }

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

      if (!hasNotifiedRenderedReadyRef.current) {
        hasNotifiedRenderedReadyRef.current = true;
        map.whenReady(() => {
          setTimeout(() => {
            if (onMapRenderedReadyRef.current) {
              onMapRenderedReadyRef.current();
            }
          }, 100);
        });
      }
    }
  }, [map, features, aliasVersion, layers, selectedFeatureId, interactionMode, setOrUpdateMarkPoint, handleMeasureFeaturePolygon, featureClickedRef]);

  // Ultra-fast layer visibility sync
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

  return {
    featureLayersRef,
    featureLayerMapRef,
  };
}
