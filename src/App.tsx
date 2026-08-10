import React, { useState, useRef, useEffect, useMemo } from 'react';
import L from 'leaflet';
import { Header } from './components/Header';
import { SearchPane } from './components/SearchPane';
import { MapComponent } from './components/Map';
import { LeftSidebar } from './components/LeftSidebar';
import { MapOverlay } from './components/MapOverlay';
import { MapEditorToolbar } from './components/MapEditorToolbar';
import { FeatureEditModal } from './components/FeatureEditModal';
import { AttributePane } from './components/AttributePane';
import { Footer } from './components/Footer';
import { GeoJsonImportModal } from './components/GeoJsonImportModal';
import { FieldAliasModal } from './components/FieldAliasModal';
import { UserManagementModal } from './components/UserManagementModal';
import { LoginModal } from './components/LoginModal';
import { SplashScreen } from './components/SplashScreen';
import { DEFAULT_LAYERS, INITIAL_MAP_FEATURES, BaseMapType, LayerConfig, UserRole, AppUser, GeoJsonFeatureItem, DuplicateStrategy, DrawToolMode, MapInteractionMode } from './types';
import {
  saveImportedFeaturesToFirestore,
  saveSingleFeatureToFirestore,
  fetchSingleFeatureFromFirestore,
  loadSharedFeaturesFromFirestore,
  loadFieldAliasDictionaryFromFirestore,
  loadLayerConfigsFromFirestore,
  saveLayerConfigsToFirestore,
  deleteFeatureFromFirestore,
  isDemoFeatureId,
  signOutUser,
  getStoredUser
} from './firebaseService';
import { extractObjectId, deduplicateFeaturesList, getItemUniqueKey } from './fieldAlias';
import { Upload, X, Check, ShieldAlert, FileText, Server, Database, AlertTriangle, RotateCw, RefreshCw } from 'lucide-react';

function getFeatureCoordsAndType(featOrGeom: any): { type: string; coordinates: any } {
  if (!featOrGeom) return { type: 'Point', coordinates: [0, 0] };
  const type = featOrGeom.type || featOrGeom.geometry?.type || 'Point';
  const coordinates = featOrGeom.coordinates || featOrGeom.geometry?.coordinates || [0, 0];
  return { type, coordinates };
}

function computeFeatureCenter(featOrGeom: any): [number, number] {
  const { type, coordinates } = getFeatureCoordsAndType(featOrGeom);
  if (type === 'Point' && Array.isArray(coordinates) && typeof coordinates[0] === 'number') {
    return [coordinates[0], coordinates[1]];
  }

  let totalLng = 0;
  let totalLat = 0;
  let count = 0;

  const extract = (arr: any) => {
    if (Array.isArray(arr) && arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      totalLng += arr[0];
      totalLat += arr[1];
      count++;
    } else if (Array.isArray(arr)) {
      arr.forEach(extract);
    }
  };

  extract(coordinates);
  if (count === 0) return [0, 0];
  return [totalLng / count, totalLat / count];
}

function shiftFeatureCoordinates(featOrGeom: any, deltaLng: number, deltaLat: number): any {
  const { coordinates } = getFeatureCoordsAndType(featOrGeom);

  const shift = (arr: any): any => {
    if (Array.isArray(arr) && arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      return [
        Number((arr[0] + deltaLng).toFixed(6)),
        Number((arr[1] + deltaLat).toFixed(6)),
      ];
    }
    if (Array.isArray(arr)) {
      return arr.map(shift);
    }
    return arr;
  };

  return shift(coordinates);
}

function isInvalidOrTargetToDeleteFeature(f: any): boolean {
  if (!f) return true;
  if (isDemoFeatureId(f.id)) return true;
  const strId = String(f.id || '');
  const strObjId = String(
    f.properties?.OBJECTID ||
      f.properties?.objectid ||
      f.properties?.ObjectID ||
      f.objectid ||
      f.OBJECTID ||
      ''
  );

  if (strId.includes('1785978345694') || strObjId.includes('1785978345694')) {
    return true;
  }
  return false;
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveRole: UserRole = isMobile ? 'guest' : (user ? user.role : 'guest');

  const [baseMap, setBaseMap] = useState<BaseMapType>('street');
  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS);
  const [mapFeatures, setMapFeatures] = useState<GeoJsonFeatureItem[]>(INITIAL_MAP_FEATURES);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isFieldAliasModalOpen, setIsFieldAliasModalOpen] = useState<boolean>(false);
  const [isUserManagementModalOpen, setIsUserManagementModalOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [aliasVersion, setAliasVersion] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<{
    type: 'save' | 'delete';
    feature: GeoJsonFeatureItem;
    message: string;
  } | null>(null);

  // Map Editing (Phase 3) state
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>('hand');
  const [selectedFeature, setSelectedFeature] = useState<GeoJsonFeatureItem | null>(null);

  // Revert pointer mode to hand if user becomes guest or on mobile
  useEffect(() => {
    if (effectiveRole === 'guest' && interactionMode === 'pointer') {
      setInteractionMode('hand');
    }
  }, [effectiveRole, interactionMode]);
  const [activeDrawMode, setActiveDrawMode] = useState<DrawToolMode>('select');
  const [editingFeature, setEditingFeature] = useState<Partial<GeoJsonFeatureItem> | null>(null);
  const [isFeatureEditModalOpen, setIsFeatureEditModalOpen] = useState<boolean>(false);
  const [drawingPointsCount, setDrawingPointsCount] = useState<number>(0);
  const drawingVerticesRef = useRef<[number, number][]>([]);

  // Clipboard & Pending Ghost Paste State
  const [clipboard, setClipboard] = useState<{
    feature: GeoJsonFeatureItem;
    mode: 'copy' | 'cut';
  } | null>(null);
  const [pendingPasteFeature, setPendingPasteFeature] = useState<GeoJsonFeatureItem | null>(null);

  const handleAliasesUpdated = () => {
    setAliasVersion((prev) => prev + 1);
  };
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number | null>(8);
  const [mapScale, setMapScale] = useState<number | null>(null);

  useEffect(() => {
    if (!mapInstance) return;

    const updateZoomAndScale = () => {
      const z = mapInstance.getZoom();
      const formattedZoom = Number.isInteger(z) ? z : Number(z.toFixed(1));
      setZoomLevel(formattedZoom);

      const center = mapInstance.getCenter();
      const latRad = (center.lat * Math.PI) / 180;
      // 156543.03392 m/px at equator zoom 0
      const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, z);
      // Standard screen 96 DPI = 0.00026458333 m/px
      const scale = Math.round(metersPerPixel / 0.00026458333);
      setMapScale(scale);
    };

    updateZoomAndScale();

    mapInstance.on('zoomend moveend', updateZoomAndScale);
    return () => {
      mapInstance.off('zoomend moveend', updateZoomAndScale);
    };
  }, [mapInstance]);

  // Pane Visibility States (Responsive & Mobile-optimized - left sidebar visible by default on desktop)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(false);

  const [isSearchPaneOpen, setIsSearchPaneOpen] = useState<boolean>(false);

  const toggleLeftSidebar = () => {
    setIsLeftSidebarOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsSearchPaneOpen(false);
      }
      return next;
    });
    setTimeout(() => mapInstance?.invalidateSize(), 200);
  };


  const toggleSearchPane = () => {
    setIsSearchPaneOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsLeftSidebarOpen(false);
      }
      return next;
    });
    setTimeout(() => mapInstance?.invalidateSize(), 200);
  };

  const handleJumpToFeature = (feat: GeoJsonFeatureItem) => {
    setSelectedFeature(feat);

    // Bật hiển thị layer nếu layer đó đang bị ẩn
    if (feat.layerId) {
      setLayers((prevLayers) =>
        prevLayers.map((l) => (l.id === feat.layerId ? { ...l, visible: true } : l))
      );
    }

    if (!mapInstance) return;

    const points: [number, number][] = [];
    const collectCoords = (arr: any) => {
      if (Array.isArray(arr) && arr.length === 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
        points.push([arr[1], arr[0]]);
      } else if (Array.isArray(arr)) {
        arr.forEach(collectCoords);
      }
    };

    collectCoords(feat.coordinates);

    if (points.length === 0) return;

    const bounds = L.latLngBounds(points);
    const center = bounds.getCenter();
    mapInstance.flyTo(center, 14, { duration: 1.0 });
  };

  // App initial loading splash state
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [splashStatusText, setSplashStatusText] = useState<string>('Nạp bộ nhớ đệm cục bộ...');

  // Load shared features, field aliases, and layer configs from Firestore database on mount
  useEffect(() => {
    // 0. Load local storage cache first so data is instantly available even offline or when quota exceeded
    try {
      const cached = localStorage.getItem('gis_local_map_features');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMapFeatures((prev) => {
            const list = [...prev, ...parsed].filter((f) => !isInvalidOrTargetToDeleteFeature(f));
            return deduplicateFeaturesList(list);
          });
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc local cache:', e);
    }

    async function initSharedDb() {
      try {
        setSplashStatusText('Đang kết nối CSDL & tải dữ liệu không gian...');
        // 1. Load shared map features
        const dbFeatures = await loadSharedFeaturesFromFirestore();
        if (dbFeatures && dbFeatures.length > 0) {
          setMapFeatures((prev) => {
            const merged = deduplicateFeaturesList([...prev, ...dbFeatures].filter((f) => !isInvalidOrTargetToDeleteFeature(f)));
            try {
              localStorage.setItem('gis_local_map_features', JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }

        setSplashStatusText('Đang nạp bảng ánh xạ thuộc tính tiếng Việt...');
        // 2. Load shared field alias dictionary from Firestore
        const dbAliases = await loadFieldAliasDictionaryFromFirestore();
        if (dbAliases && Object.keys(dbAliases).length > 0) {
          try {
            localStorage.setItem('gis_field_alias_dictionary', JSON.stringify(dbAliases));
            setAliasVersion((v) => v + 1);
          } catch (e) {
            console.warn('Lỗi lưu cache field_aliases:', e);
          }
        }

        setSplashStatusText('Đang cấu hình danh mục lớp bản đồ...');
        // 3. Load shared layer configs (custom layer names) from Firestore
        const dbLayerNames = await loadLayerConfigsFromFirestore();
        if (dbLayerNames && Object.keys(dbLayerNames).length > 0) {
          setLayers((prevLayers) =>
            prevLayers.map((l) =>
              dbLayerNames[l.id] ? { ...l, name: dbLayerNames[l.id] } : l
            )
          );
        }

        setSplashStatusText('Hoàn tất!');
      } catch (e) {
        console.warn('Lỗi nạp CSDL:', e);
      } finally {
        setTimeout(() => {
          setIsLoadingData(false);
        }, 500);
      }
    }
    initSharedDb();
  }, []);

  // Sync state to local storage backup whenever mapFeatures changes
  useEffect(() => {
    if (mapFeatures.length > 0) {
      try {
        localStorage.setItem('gis_local_map_features', JSON.stringify(mapFeatures));
      } catch (e) {
        console.warn('Không thể ghi vào localStorage:', e);
      }
    }
  }, [mapFeatures]);

  // Backup of original feature geometry before editing
  const originalSelectedFeatureRef = useRef<GeoJsonFeatureItem | null>(null);
  const [pendingNextFeature, setPendingNextFeature] = useState<{ feat: GeoJsonFeatureItem | null } | null>(null);

  const isUnsaved = useMemo(() => {
    if (!selectedFeature || !originalSelectedFeatureRef.current) return false;
    if (selectedFeature.id !== originalSelectedFeatureRef.current.id) return false;

    const currentCoords = JSON.stringify(selectedFeature.coordinates);
    const origCoords = JSON.stringify(originalSelectedFeatureRef.current.coordinates);
    const currentProps = JSON.stringify(selectedFeature.properties);
    const origProps = JSON.stringify(originalSelectedFeatureRef.current.properties);

    return currentCoords !== origCoords || currentProps !== origProps;
  }, [selectedFeature]);
  const handleImportConfirm = (
    targetLayerId: string,
    importedFeatures: GeoJsonFeatureItem[],
    strategy: DuplicateStrategy
  ) => {
    let finalTargetLayerFeatures: GeoJsonFeatureItem[] = [];

    setMapFeatures((prevFeatures) => {
      const existing = [...prevFeatures];
      let updatedCount = 0;
      let addedCount = 0;
      let skippedCount = 0;

      const newFeatures: GeoJsonFeatureItem[] = [];

      importedFeatures.forEach((imp) => {
        const impObjId = extractObjectId(imp);

        const existingIdx = existing.findIndex((e) => {
          if (e.layerId !== targetLayerId) return false;

          // Primary check: OBJECTID match
          const eObjId = extractObjectId(e);
          if (impObjId && eObjId && impObjId.toLowerCase() === eObjId.toLowerCase()) {
            return true;
          }

          // Fallback check: ID or Code match
          const matchId = e.id && imp.id && String(e.id).toLowerCase() === String(imp.id).toLowerCase();
          const matchCode = e.code && imp.code && String(e.code).toLowerCase() === String(imp.code).toLowerCase();
          return Boolean(matchId || matchCode);
        });

        if (existingIdx !== -1) {
          if (strategy === 'overwrite') {
            const updatedItem: GeoJsonFeatureItem = {
              ...imp,
              layerId: targetLayerId,
              updatedAt: new Date().toISOString().split('T')[0],
            };
            existing[existingIdx] = updatedItem;
            updatedCount++;
          } else if (strategy === 'skip') {
            skippedCount++;
          } else if (strategy === 'append') {
            const copyId = `${imp.id}_copy_${Date.now()}`;
            const newItem: GeoJsonFeatureItem = {
              ...imp,
              id: copyId,
              layerId: targetLayerId,
              name: `${imp.name} (Bản sao)`,
              updatedAt: new Date().toISOString().split('T')[0],
            };
            newFeatures.push(newItem);
            addedCount++;
          }
        } else {
          const newItem: GeoJsonFeatureItem = {
            ...imp,
            layerId: targetLayerId,
            updatedAt: new Date().toISOString().split('T')[0],
          };
          newFeatures.push(newItem);
          addedCount++;
        }
      });

      const nextAllFeatures = [...existing, ...newFeatures];
      const dedupedAll = deduplicateFeaturesList(nextAllFeatures);
      finalTargetLayerFeatures = dedupedAll.filter((f) => f.layerId === targetLayerId);

      try {
        localStorage.setItem('gis_local_map_features', JSON.stringify(dedupedAll));
      } catch (e) {}

      const targetLayerObj = layers.find((l) => l.id === targetLayerId);
      const layerName = targetLayerObj ? targetLayerObj.name.split(':')[0] : targetLayerId;

      let toastMsg = `Import thành công [${layerName}]: ${addedCount} mới`;
      if (updatedCount > 0) toastMsg += `, ${updatedCount} ghi đè`;
      if (skippedCount > 0) toastMsg += `, ${skippedCount} bỏ qua trùng`;

      showToast(toastMsg);

      return dedupedAll;
    });

    // Auto sync entire target layer dataset to Firestore via Chunking (reduces writes & payload size)
    if (finalTargetLayerFeatures.length > 0) {
      saveImportedFeaturesToFirestore(finalTargetLayerFeatures).catch((err) =>
        console.warn('Lỗi tự động lưu Firestore:', err)
      );
    }

    // Automatically make target layer visible so imported data displays on Leaflet map
    setLayers((prevLayers) =>
      prevLayers.map((l) => (l.id === targetLayerId ? { ...l, visible: true } : l))
    );

    // Ensure left sidebar opens so user sees the active target layer
    setIsLeftSidebarOpen(true);
  };

  // GPS Location & Cursor Position state
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);
  const [cursorLocation, setCursorLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [targetMarkerLocation, setTargetMarkerLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const locationLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const handleGoToCoordinate = (lat: number, lng: number) => {
    setTargetMarkerLocation({ lat, lng });
    setCursorLocation({ lat, lng });
  };

  const handleToggleLayerVisibility = (layerId: string) => {
    setLayers((prevLayers) =>
      prevLayers.map((l) =>
        l.id === layerId ? { ...l, visible: !l.visible } : l
      )
    );
  };

  const handleToggleLayerGroupVisibility = (layerIds: string[], visible: boolean) => {
    setLayers((prevLayers) =>
      prevLayers.map((l) =>
        layerIds.includes(l.id) ? { ...l, visible } : l
      )
    );
  };

  const handleRenameLayer = async (layerId: string, newName: string) => {
    const updated = layers.map((l) => (l.id === layerId ? { ...l, name: newName } : l));
    setLayers(updated);
    const success = await saveLayerConfigsToFirestore(updated);
    if (success) {
      showToast(`Đã đổi tên lớp thành: "${newName}" và lưu lên Firebase thành công!`);
    } else {
      showToast(`Đã đổi tên lớp thành: "${newName}" (đã lưu tạm máy cục bộ).`);
    }
  };

  const handleZoomToLayer = (layerId: string) => {
    if (!mapInstance) return;
    const layerFeatures = mapFeatures.filter((f) => f.layerId === layerId);
    if (layerFeatures.length === 0) {
      showToast('Lớp dữ liệu này chưa có đối tượng nào.');
      return;
    }

    const bounds: L.LatLng[] = [];
    layerFeatures.forEach((feat) => {
      if (feat.type === 'Point' && Array.isArray(feat.coordinates) && feat.coordinates.length >= 2) {
        bounds.push(L.latLng(feat.coordinates[1], feat.coordinates[0]));
      } else if (feat.coordinates && Array.isArray(feat.coordinates)) {
        const collect = (arr: any) => {
          if (Array.isArray(arr) && arr.length === 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
            bounds.push(L.latLng(arr[1], arr[0]));
          } else if (Array.isArray(arr)) {
            arr.forEach(collect);
          }
        };
        collect(feat.coordinates);
      }
    });

    if (bounds.length > 0) {
      mapInstance.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
      const targetLayer = layers.find((l) => l.id === layerId);
      showToast(`Đã định vị đến phạm vi lớp: "${targetLayer?.name || layerId}"`);
    }
  };

  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      showToast('Trình duyệt của bạn không hỗ trợ nhận diện vị trí GPS.');
      return;
    }

    setIsLocating(true);
    showToast('Đang quét vị trí GPS thiết bị...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setIsLocating(false);
        setUserLocation({ lat: latitude, lng: longitude, accuracy });

        if (mapInstance) {
          // Clear previous location marker if exists
          if (locationLayerGroupRef.current) {
            mapInstance.removeLayer(locationLayerGroupRef.current);
          }

          const locationGroup = L.layerGroup();

          // Accuracy Circle
          if (accuracy) {
            const accuracyCircle = L.circle([latitude, longitude], {
              radius: accuracy,
              color: '#3b82f6',
              fillColor: '#60a5fa',
              fillOpacity: 0.15,
              weight: 1.5,
            });
            locationGroup.addLayer(accuracyCircle);
          }

          // User Device Marker (Pulsing blue dot)
          const deviceMarker = L.circleMarker([latitude, longitude], {
            radius: 9,
            color: '#ffffff',
            weight: 3,
            fillColor: '#2563eb',
            fillOpacity: 1,
          });

          deviceMarker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; padding: 2px;">
              <strong style="color: #1e3a8a;">Vị trí hiện tại của thiết bị</strong><br/>
              <b>Vĩ độ:</b> ${latitude.toFixed(6)}° N<br/>
              <b>Kinh độ:</b> ${longitude.toFixed(6)}° E<br/>
              <b>Độ chính xác:</b> ~${Math.round(accuracy)}m
            </div>
          `).openPopup();

          locationGroup.addLayer(deviceMarker);
          locationGroup.addTo(mapInstance);
          locationLayerGroupRef.current = locationGroup;

          // Fly to location smoothly
          mapInstance.flyTo([latitude, longitude], 15, {
            duration: 1.5,
          });
        }

        showToast(`Đã xác định vị trí: ${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E`);
      },
      (error) => {
        setIsLocating(false);
        let errorMsg = 'Khởi tạo vị trí GPS thất bại.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Quyền truy cập vị trí đã bị từ chối trên thiết bị/trình duyệt.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'Thông tin vị trí GPS không khả dụng.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'Yêu cầu định vị GPS hết thời gian chờ.';
        }
        showToast(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Phase 3 Map Editing Handlers
  const handleModeChange = (mode: DrawToolMode | MapInteractionMode) => {
    if (mode === 'pointer' && effectiveRole === 'guest') {
      alert("Bạn cần đăng nhập bằng tài khoản biên tập viên hoặc quản trị viên để sử dụng chức năng chỉnh sửa.");
      if (!user) setIsLoginModalOpen(true);
      return;
    } else if (mode && mode !== 'select' && mode !== 'hand' && !mode.toString().startsWith('measure_') && effectiveRole === 'guest') {
      alert("Bạn cần quyền biên tập viên hoặc quản trị viên để sử dụng tính năng này.");
      if (!user) setIsLoginModalOpen(true);
      return;
    }

    if (mode === 'hand' || mode === 'pointer' || mode?.toString().startsWith('measure_')) {
      setInteractionMode(mode as MapInteractionMode);
      setActiveDrawMode(null);
      setDrawingPointsCount(0);
      drawingVerticesRef.current = [];
      return;
    }

    setActiveDrawMode(mode as DrawToolMode);
    setDrawingPointsCount(0);
    drawingVerticesRef.current = [];
  };

  const handleFinishDrawing = () => {
    const vertices = drawingVerticesRef.current;
    if (activeDrawMode === 'line' && vertices.length >= 2) {
      setEditingFeature({
        type: 'LineString',
        coordinates: vertices,
      });
      setIsFeatureEditModalOpen(true);
    } else if (activeDrawMode === 'polygon' && vertices.length >= 3) {
      const polygonCoords = [...vertices];
      if (
        polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
        polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1]
      ) {
        polygonCoords.push(polygonCoords[0]);
      }
      setEditingFeature({
        type: 'Polygon',
        coordinates: [polygonCoords],
      });
      setIsFeatureEditModalOpen(true);
    }
    setActiveDrawMode(null);
    drawingVerticesRef.current = [];
    setDrawingPointsCount(0);
  };

  const handleCancelDrawing = () => {
    setActiveDrawMode(null);
    drawingVerticesRef.current = [];
    setDrawingPointsCount(0);
  };

  const handleFeatureCreate = (partialFeat: Partial<GeoJsonFeatureItem>) => {
    setEditingFeature(partialFeat);
    setIsFeatureEditModalOpen(true);
    setActiveDrawMode(null);
  };

  const applyFeatureSelect = (feat: GeoJsonFeatureItem | null) => {
    setSelectedFeature(feat);
    if (feat) {
      originalSelectedFeatureRef.current = JSON.parse(JSON.stringify(feat));
    } else {
      originalSelectedFeatureRef.current = null;
    }
  };

  const handleFeatureSelect = (feat: GeoJsonFeatureItem | null) => {
    if (pendingNextFeature) {
      // Ignore selecting other features until user responds to the pending unsaved changes confirmation badge
      return;
    }
    if (selectedFeature && isUnsaved) {
      if (feat && feat.id === selectedFeature.id) return;
      setPendingNextFeature({ feat });
      return;
    }
    applyFeatureSelect(feat);
  };

  const handleConfirmPendingSave = () => {
    if (pendingNextFeature) {
      const next = pendingNextFeature.feat;
      if (selectedFeature) {
        handleSaveFeature(selectedFeature);
      }
      applyFeatureSelect(next);
      setPendingNextFeature(null);
    }
  };

  const handleConfirmPendingDiscard = () => {
    if (pendingNextFeature) {
      const next = pendingNextFeature.feat;
      handleDiscardSelection();
      applyFeatureSelect(next);
      setPendingNextFeature(null);
    }
  };

  const handleCancelPendingNext = () => {
    setPendingNextFeature(null);
  };

  const handleFeatureGeometryUpdate = (featureId: string, newCoordinates: any) => {
    // Quietly update local React state for real-time vertex dragging without toast or Firestore writes
    setMapFeatures((prev) =>
      prev.map((f) =>
        f.id === featureId ? { ...f, coordinates: newCoordinates, updatedAt: new Date().toISOString() } : f
      )
    );
    setSelectedFeature((prev) =>
      prev && prev.id === featureId
        ? { ...prev, coordinates: newCoordinates, updatedAt: new Date().toISOString() }
        : prev
    );
  };

  const handleSaveFeature = (featureToSave: GeoJsonFeatureItem) => {
    const updatedFeat: GeoJsonFeatureItem = {
      ...featureToSave,
      updatedAt: new Date().toISOString(),
    };

    // 1. Instantly update local state and localStorage cache
    setMapFeatures((prev) => {
      const idx = prev.findIndex(
        (f) => String(f.id) === String(updatedFeat.id) || getItemUniqueKey(f) === getItemUniqueKey(updatedFeat)
      );
      let updatedList: GeoJsonFeatureItem[];
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedFeat;
        updatedList = copy;
      } else {
        updatedList = [...prev, updatedFeat];
      }
      try {
        localStorage.setItem('gis_local_map_features', JSON.stringify(updatedList));
      } catch (e) {}
      return updatedList;
    });

    originalSelectedFeatureRef.current = JSON.parse(JSON.stringify(updatedFeat));
    setSelectedFeature(updatedFeat);

    // 2. Immediate feedback
    showToast('Đã lưu thay đổi thành công!');

    // 3. Background sync to Firebase
    saveSingleFeatureToFirestore(updatedFeat)
      .then((success) => {
        if (success) {
          if (syncError && syncError.feature.id === updatedFeat.id) {
            setSyncError(null);
          }
        } else {
          setSyncError({
            type: 'save',
            feature: updatedFeat,
            message: 'Chưa thể đồng bộ đối tượng lên CSDL Firebase.',
          });
          showToast('Lưu ý: Chưa đồng bộ được CSDL Firebase.');
        }
      })
      .catch((err) => {
        setSyncError({
          type: 'save',
          feature: updatedFeat,
          message: 'Lỗi kết nối Firebase: ' + (err?.message || 'Lỗi mạng'),
        });
        showToast('Chưa đồng bộ được CSDL Firebase.');
      });
  };

  const handleReloadFeature = async (featureId: string) => {
    if (!featureId) return;
    try {
      let freshFeature = await fetchSingleFeatureFromFirestore(featureId);
      if (!freshFeature && selectedFeature && String(selectedFeature.id) === String(featureId)) {
        const localFound = mapFeatures.find(
          (f) => String(f.id) === String(featureId) || getItemUniqueKey(f) === getItemUniqueKey(selectedFeature)
        );
        if (localFound) {
          freshFeature = localFound;
        } else if (originalSelectedFeatureRef.current) {
          freshFeature = originalSelectedFeatureRef.current;
        }
      }

      if (freshFeature) {
        setMapFeatures((prev) => {
          const idx = prev.findIndex(
            (f) => String(f.id) === String(featureId) || getItemUniqueKey(f) === getItemUniqueKey(freshFeature!)
          );
          let updatedList: GeoJsonFeatureItem[];
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = freshFeature!;
            updatedList = copy;
          } else {
            updatedList = [...prev, freshFeature!];
          }
          try {
            localStorage.setItem('gis_local_map_features', JSON.stringify(updatedList));
          } catch (e) {}
          return updatedList;
        });
        setSelectedFeature(freshFeature);
        originalSelectedFeatureRef.current = JSON.parse(JSON.stringify(freshFeature));
        showToast('Đã tải lại dữ liệu đối tượng thành công!');
      } else {
        showToast('Không tìm thấy bản ghi đối tượng này.');
      }
    } catch (err) {
      showToast('Không thể kết nối CSDL để tải lại.');
    }
  };

  const handleDiscardSelection = () => {
    if (selectedFeature && originalSelectedFeatureRef.current && originalSelectedFeatureRef.current.id === selectedFeature.id) {
      const restored = originalSelectedFeatureRef.current;
      setMapFeatures((prev) =>
        prev.map((f) => (f.id === restored.id ? restored : f))
      );
      showToast('Đã khôi phục đối tượng về vị trí ban đầu.');
    }
    setSelectedFeature(null);
    originalSelectedFeatureRef.current = null;
  };

  const handleDeleteFeature = (featureId: string) => {
    const targetFeat = mapFeatures.find((f) => String(f.id) === String(featureId));

    // 1. Immediate local removal
    setMapFeatures((prev) => {
      const updated = prev.filter((f) => String(f.id) !== String(featureId));
      try {
        localStorage.setItem('gis_local_map_features', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (selectedFeature && String(selectedFeature.id) === String(featureId)) {
      setSelectedFeature(null);
      originalSelectedFeatureRef.current = null;
    }

    showToast('Đã xóa đối tượng thành công!');

    // 2. Background sync delete to Firebase
    deleteFeatureFromFirestore(featureId)
      .then((success) => {
        if (success) {
          if (syncError && syncError.feature.id === featureId) {
            setSyncError(null);
          }
        } else if (targetFeat) {
          setSyncError({
            type: 'delete',
            feature: targetFeat,
            message: 'Chưa thể xóa đối tượng khỏi CSDL Firebase.',
          });
          showToast('Lưu ý: Chưa thể đồng bộ xóa lên Firebase.');
        }
      })
      .catch(() => {
        if (targetFeat) {
          setSyncError({
            type: 'delete',
            feature: targetFeat,
            message: 'Lỗi kết nối khi xóa khỏi CSDL Firebase.',
          });
        }
      });
  };

  const handleRetrySync = async () => {
    if (!syncError) return;
    showToast('Đang thử đồng bộ lại với Firebase...');
    if (syncError.type === 'save') {
      const success = await saveSingleFeatureToFirestore(syncError.feature);
      if (success) {
        setSyncError(null);
        showToast('Thử lại thành công! CSDL Firebase đã được cập nhật.');
      } else {
        showToast('Thử lại thất bại. Vui lòng kiểm tra lại kết nối mạng!');
      }
    } else if (syncError.type === 'delete') {
      const success = await deleteFeatureFromFirestore(syncError.feature.id);
      if (success) {
        setSyncError(null);
        showToast('Thử lại xóa trên Firebase thành công!');
      } else {
        showToast('Thử lại xóa trên Firebase thất bại!');
      }
    }
  };

  const handleReloadFailedSync = async () => {
    if (!syncError) return;
    showToast('Đang khôi phục dữ liệu gốc từ CSDL Firebase...');
    try {
      const freshFeature = await fetchSingleFeatureFromFirestore(syncError.feature.id);
      if (freshFeature) {
        setMapFeatures((prev) => {
          const idx = prev.findIndex(
            (f) => String(f.id) === String(syncError.feature.id) || getItemUniqueKey(f) === getItemUniqueKey(freshFeature)
          );
          let updatedList: GeoJsonFeatureItem[];
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = freshFeature;
            updatedList = copy;
          } else {
            updatedList = [...prev, freshFeature];
          }
          try {
            localStorage.setItem('gis_local_map_features', JSON.stringify(updatedList));
          } catch (e) {}
          return updatedList;
        });
        setSelectedFeature(freshFeature);
        originalSelectedFeatureRef.current = JSON.parse(JSON.stringify(freshFeature));
        showToast('Đã khôi phục dữ liệu đối tượng từ Firebase thành công!');
      } else {
        if (syncError.type === 'save') {
          setMapFeatures((prev) => {
            const updatedList = prev.filter((f) => String(f.id) !== String(syncError.feature.id));
            try {
              localStorage.setItem('gis_local_map_features', JSON.stringify(updatedList));
            } catch (e) {}
            return updatedList;
          });
          if (selectedFeature && String(selectedFeature.id) === String(syncError.feature.id)) {
            setSelectedFeature(null);
          }
          showToast('Đối tượng chưa tồn tại trên Firebase, đã hủy bản nháp.');
        } else if (syncError.type === 'delete') {
          showToast('Xác nhận đối tượng không còn trên Firebase.');
        }
      }
      setSyncError(null);
    } catch (e) {
      showToast('Lỗi kết nối khi khôi phục từ Firebase.');
    }
  };

  // --- Copy, Cut, Paste Handlers ---
  const handleCopy = () => {
    if (!selectedFeature) return;
    setClipboard({ feature: selectedFeature, mode: 'copy' });
    setPendingPasteFeature(null);
    showToast(`Đã sao chép đối tượng: "${selectedFeature.name || 'GIS'}"`);
  };

  const handleCut = () => {
    if (!selectedFeature) return;
    setClipboard({ feature: selectedFeature, mode: 'cut' });
    setPendingPasteFeature(null);
    showToast(`Đã cắt đối tượng: "${selectedFeature.name || 'GIS'}"`);
  };

  const handlePaste = () => {
    if (!clipboard) {
      showToast('Chưa sao chép hoặc cắt đối tượng nào!');
      return;
    }
    const targetLoc = cursorLocation || userLocation;
    if (!targetLoc) {
      showToast('Vui lòng kích chọn một vị trí trên bản đồ để dán!');
      return;
    }

    const isCut = clipboard.mode === 'cut';
    const center = computeFeatureCenter(clipboard.feature);
    const deltaLng = targetLoc.lng - center[0];
    const deltaLat = targetLoc.lat - center[1];

    const shiftedCoords = shiftFeatureCoordinates(clipboard.feature, deltaLng, deltaLat);

    const newProps: Record<string, any> = { ...(clipboard.feature.properties || {}) };
    let newId = clipboard.feature.id;

    if (!isCut) {
      newId = `feat_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      // Generate small, sequential integer OBJECTID for COPY
      let maxObjId = 0;
      mapFeatures.forEach((f) => {
        const objId = extractObjectId(f.properties) || extractObjectId(f);
        if (typeof objId === 'number' && !isNaN(objId) && objId > maxObjId && objId < 10000000) {
          maxObjId = objId;
        }
      });
      const newObjectId = maxObjId > 0 ? maxObjId + 1 : 1;

      ['OBJECTID', 'objectid', 'ObjectID', 'objectId', 'FID', 'fid'].forEach((k) => {
        if (k in newProps) newProps[k] = newObjectId;
      });
      if (!('OBJECTID' in newProps) && !('objectid' in newProps)) {
        newProps['OBJECTID'] = newObjectId;
      }

      ['id', 'ID', 'Id'].forEach((k) => {
        if (k in newProps) newProps[k] = newId;
      });
    }

    let newName = clipboard.feature.name || 'Đối tượng';
    if (clipboard.mode === 'copy') {
      if (!newName.includes('(Bản sao)')) newName = `${newName} (Bản sao)`;
      if (newProps['Ten'] && !String(newProps['Ten']).includes('(Bản sao)')) {
        newProps['Ten'] = `${newProps['Ten']} (Bản sao)`;
      } else if (newProps['ten'] && !String(newProps['ten']).includes('(Bản sao)')) {
        newProps['ten'] = `${newProps['ten']} (Bản sao)`;
      }
    }

    const featureType = clipboard.feature.type || (clipboard.feature as any).geometry?.type || 'Point';

    const candidate: GeoJsonFeatureItem = {
      ...clipboard.feature,
      id: newId,
      name: newName,
      type: featureType,
      coordinates: shiftedCoords,
      geometry: {
        type: featureType,
        coordinates: shiftedCoords,
      },
      properties: newProps,
      updatedAt: new Date().toISOString(),
    };

    setPendingPasteFeature(candidate);
  };

  const handleConfirmPaste = () => {
    if (!pendingPasteFeature || !clipboard) return;

    const modeName = clipboard.mode === 'cut' ? 'di chuyển' : 'dán bản sao';
    const featureToSave = { ...pendingPasteFeature };

    // 1. Immediate local update
    setMapFeatures((prev) => {
      let nextList: GeoJsonFeatureItem[];
      if (clipboard.mode === 'cut') {
        // Replace existing feature with updated position
        const exists = prev.some((f) => f.id === featureToSave.id);
        if (exists) {
          nextList = prev.map((f) => (f.id === featureToSave.id ? featureToSave : f));
        } else {
          nextList = [...prev, featureToSave];
        }
      } else {
        nextList = [...prev, featureToSave];
      }
      const dedupedList = deduplicateFeaturesList(nextList);
      try {
        localStorage.setItem('gis_local_map_features', JSON.stringify(dedupedList));
      } catch (e) {}
      return dedupedList;
    });

    setSelectedFeature(featureToSave);
    setPendingPasteFeature(null);
    if (clipboard.mode === 'cut') {
      // After cut-pasting (moving), convert clipboard mode to 'copy' with updated coordinates/feature so further pastes work seamlessly
      setClipboard({ feature: featureToSave, mode: 'copy' });
    }

    showToast(`Đã ${modeName} đối tượng "${featureToSave.name}" thành công!`);

    // 2. Background sync
    saveSingleFeatureToFirestore(featureToSave)
      .then((success) => {
        if (success) {
          if (syncError && syncError.feature.id === featureToSave.id) {
            setSyncError(null);
          }
        } else {
          setSyncError({
            type: 'save',
            feature: featureToSave,
            message: `Chưa thể đồng bộ đối tượng ${modeName} lên CSDL Firebase.`,
          });
        }
      })
      .catch(() => {
        setSyncError({
          type: 'save',
          feature: featureToSave,
          message: `Lỗi kết nối Firebase khi ${modeName}.`,
        });
      });
  };

  const handleCancelPaste = () => {
    setPendingPasteFeature(null);
  };

  // Auto update ghost paste position when user clicks a new map point
  useEffect(() => {
    if (!pendingPasteFeature || !clipboard || !cursorLocation) return;
    const center = computeFeatureCenter(clipboard.feature);
    const deltaLng = cursorLocation.lng - center[0];
    const deltaLat = cursorLocation.lat - center[1];
    const shiftedCoords = shiftFeatureCoordinates(clipboard.feature, deltaLng, deltaLat);
    const featureType = clipboard.feature.type || (clipboard.feature as any).geometry?.type || 'Point';

    setPendingPasteFeature((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        type: featureType,
        coordinates: shiftedCoords,
        geometry: {
          type: featureType,
          coordinates: shiftedCoords,
        },
      };
    });
  }, [cursorLocation]);

  // Keyboard shortcut listener for Ctrl+C, Ctrl+X, Ctrl+V in pointer mode
  useEffect(() => {
    if (interactionMode !== 'pointer') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedFeature) {
          e.preventDefault();
          handleCopy();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (selectedFeature) {
          e.preventDefault();
          handleCut();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboard && (cursorLocation || userLocation)) {
          e.preventDefault();
          handlePaste();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interactionMode, selectedFeature, clipboard, cursorLocation, userLocation]);


  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  if (isLoadingData) {
    return <SplashScreen statusText={splashStatusText} />;
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900 font-sans text-slate-900">
      {/* Top High Density Header */}
      <Header
        currentRole={effectiveRole}
        user={user}
        onLogin={() => setIsLoginModalOpen(true)}
        onLogout={() => {
          signOutUser();
          setUser(null);
        }}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onToggleLeftSidebar={toggleLeftSidebar}
        isSearchPaneOpen={isSearchPaneOpen}
        onToggleSearchPane={toggleSearchPane}
        onOpenFieldAliasModal={() => setIsFieldAliasModalOpen(true)}
        onOpenUserManagementModal={() => setIsUserManagementModalOpen(true)}
        isMobile={isMobile}
      />

      {/* Main App Body */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Mobile Backdrop when sidebars are open as overlays on small screens */}
        {(isLeftSidebarOpen || isSearchPaneOpen) && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-[1900] backdrop-blur-xs transition-opacity"
            onClick={() => {
              setIsLeftSidebarOpen(false);
              setIsSearchPaneOpen(false);
            }}
          />
        )}

        {/* Left Sidebar: Layer Management */}
        {isLeftSidebarOpen && (
          <div className="absolute md:relative inset-y-0 left-0 z-[2000] md:z-10 bg-white h-full shadow-2xl md:shadow-none transition-all">
            <LeftSidebar
              layers={layers}
              features={mapFeatures}
              onToggleVisibility={handleToggleLayerVisibility}
              onToggleGroupVisibility={handleToggleLayerGroupVisibility}
              currentRole={effectiveRole}
              onImportClick={() => setIsImportModalOpen(true)}
              onClose={() => {
                setIsLeftSidebarOpen(false);
                setTimeout(() => mapInstance?.invalidateSize(), 200);
              }}
            />
          </div>
        )}

        {/* Left Sidebar: Spatial & Attribute Search Pane */}
        {isSearchPaneOpen && (
          <div className="absolute md:relative inset-y-0 left-0 z-[2000] md:z-10 bg-slate-900 h-full shadow-2xl md:shadow-none transition-all">
            <SearchPane
              isOpen={isSearchPaneOpen}
              onClose={() => {
                setIsSearchPaneOpen(false);
                setTimeout(() => mapInstance?.invalidateSize(), 200);
              }}
              layers={layers}
              features={mapFeatures}
              selectedFeatureId={selectedFeature?.id}
              onSingleClickFeature={handleJumpToFeature}
              onDoubleClickFeature={handleJumpToFeature}
            />
          </div>
        )}

        {/* Center: Leaflet Map & Overlays */}
        <section className="flex-1 relative bg-slate-200 overflow-hidden flex flex-col">
          {/* Map Editor Floating Toolbar */}
          <MapEditorToolbar
            currentRole={effectiveRole}
            interactionMode={interactionMode}
            onInteractionModeChange={(mode) => {
              if (selectedFeature && isUnsaved) {
                setPendingNextFeature({ feat: null });
                return;
              }
              handleModeChange(mode);
              if (mode === 'hand') {
                setSelectedFeature(null);
                setPendingPasteFeature(null);
              }
            }}
            selectedFeature={selectedFeature}
            isUnsaved={isUnsaved}
            onSaveSelection={() => {
              if (selectedFeature) {
                handleSaveFeature(selectedFeature);
              }
            }}
            onDiscardSelection={handleDiscardSelection}
            onDeleteSelected={() => {
              if (selectedFeature) handleDeleteFeature(selectedFeature.id);
            }}
            pendingNextFeature={pendingNextFeature}
            onConfirmPendingSave={handleConfirmPendingSave}
            onConfirmPendingDiscard={handleConfirmPendingDiscard}
            onCancelPendingNext={handleCancelPendingNext}
            hasClipboard={!!clipboard}
            hasTargetLocation={!!(cursorLocation || userLocation)}
            pendingPasteFeature={pendingPasteFeature}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onConfirmPaste={handleConfirmPaste}
            onCancelPaste={handleCancelPaste}
          />

          {/* Leaflet Map */}
          <MapComponent
            baseMap={baseMap}
            layers={layers}
            features={mapFeatures}
            aliasVersion={aliasVersion}
            interactionMode={interactionMode}
            selectedFeatureId={selectedFeature?.id || null}
            activeDrawMode={activeDrawMode}
            pendingPasteFeature={pendingPasteFeature}
            targetMarkerLocation={targetMarkerLocation}
            currentRole={effectiveRole}
            onMapReady={(map) => setMapInstance(map)}
            onCursorMove={setCursorLocation}
            onFeatureSelect={handleFeatureSelect}
            onFeatureGeometryUpdate={handleFeatureGeometryUpdate}
            onFeatureCreate={handleFeatureCreate}
            onDrawingPointsChange={setDrawingPointsCount}
            drawingVerticesRef={drawingVerticesRef}
          />

          {/* Map Overlay Controls (Top Right BaseMap Switcher & Zoom & GPS Locate) */}
          <MapOverlay
            currentBaseMap={baseMap}
            onBaseMapChange={setBaseMap}
            onZoomIn={() => mapInstance?.zoomIn()}
            onZoomOut={() => mapInstance?.zoomOut()}
            onLocateUser={handleLocateUser}
            isLocating={isLocating}
          />
        </section>

        {/* Right Attribute Pane in Pointer Mode */}
        {interactionMode === 'pointer' && selectedFeature && (
          <AttributePane
            feature={selectedFeature}
            layers={layers}
            currentRole={effectiveRole}
            onSave={(updated) => {
              handleSaveFeature(updated);
            }}
            onDelete={(id) => {
              handleDeleteFeature(id);
              setSelectedFeature(null);
            }}
            onReload={handleReloadFeature}
            onClose={() => setSelectedFeature(null)}
          />
        )}


      </main>

      {/* Bottom Status Bar */}
      <Footer
        cursorLocation={cursorLocation}
        userLocation={userLocation}
        zoomLevel={zoomLevel}
        mapScale={mapScale}
        onGoToCoordinate={handleGoToCoordinate}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-10 right-10 z-[2000] bg-slate-900 text-white px-4 py-3 rounded-lg shadow-2xl border border-slate-700 flex items-center space-x-2 text-xs animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Feature Attribute Editing Modal */}
      {isFeatureEditModalOpen && (
        <FeatureEditModal
          isOpen={isFeatureEditModalOpen}
          feature={editingFeature}
          layers={layers}
          currentRole={effectiveRole}
          onSave={handleSaveFeature}
          onDelete={handleDeleteFeature}
          onClose={() => {
            setIsFeatureEditModalOpen(false);
            setEditingFeature(null);
          }}
        />
      )}


      {/* GeoJSON Import Modal Component */}
      <GeoJsonImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        layers={layers}
        existingFeatures={mapFeatures}
        onImportConfirm={handleImportConfirm}
      />

      {/* Field Alias Dictionary Modal Component */}
      <FieldAliasModal
        isOpen={isFieldAliasModalOpen}
        onClose={() => setIsFieldAliasModalOpen(false)}
        onAliasesUpdated={handleAliasesUpdated}
      />

      {isUserManagementModalOpen && (
        <UserManagementModal onClose={() => setIsUserManagementModalOpen(false)} />
      )}

      {isLoginModalOpen && (
        <LoginModal 
          onClose={() => setIsLoginModalOpen(false)} 
          onSuccess={() => {
            const user = getStoredUser();
            setUser(user);
          }} 
        />
      )}

      {/* Floating Sync Error Alert Banner (Optimistic UI Background Sync Failure) */}
      {syncError && (
        <div className="fixed top-16 right-4 z-[9999] bg-slate-900/95 text-white border border-amber-500/80 shadow-2xl rounded-2xl p-4 max-w-sm flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 animate-pulse" />
              <span>Cần đồng bộ với Firebase</span>
            </div>
            <button
              onClick={() => setSyncError(null)}
              className="text-slate-400 hover:text-white p-0.5 rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <p className="text-[12px] text-slate-300 leading-snug">
            Thao tác <strong className="text-amber-200">{syncError.type === 'save' ? 'Lưu' : 'Xóa'}</strong> đối tượng <b className="text-white">{syncError.feature.name || syncError.feature.id}</b> đã hoàn thành nhưng gặp sự cố kết nối Firebase.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={handleReloadFailedSync}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Khôi phục lại dữ liệu gốc từ Firebase (Reload)"
            >
              <RotateCw className="w-3.5 h-3.5 text-blue-400" />
              <span>Khôi phục</span>
            </button>
            <button
              onClick={handleRetrySync}
              className="px-2.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-900/40"
              title="Cố gắng thử cập nhật lại dữ liệu lên Firebase (Retry)"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử lại</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
