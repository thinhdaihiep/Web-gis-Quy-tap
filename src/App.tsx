import React, { useState, useRef, useEffect, useMemo } from 'react';
import L from 'leaflet';
import { Header } from './components/Header';
import { SearchFilterBar } from './components/SearchFilterBar';
import { MapComponent } from './components/Map';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { MapOverlay } from './components/MapOverlay';
import { MapEditorToolbar } from './components/MapEditorToolbar';
import { FeatureEditModal } from './components/FeatureEditModal';
import { AttributePane } from './components/AttributePane';
import { Footer } from './components/Footer';
import { GeoJsonImportModal } from './components/GeoJsonImportModal';
import { FieldAliasModal } from './components/FieldAliasModal';
import { SplashScreen } from './components/SplashScreen';
import { DEFAULT_LAYERS, INITIAL_MAP_FEATURES, BaseMapType, LayerConfig, UserRole, GeoJsonFeatureItem, DuplicateStrategy, DrawToolMode, MapInteractionMode } from './types';
import {
  saveImportedFeaturesToFirestore,
  saveSingleFeatureToFirestore,
  loadSharedFeaturesFromFirestore,
  loadFieldAliasDictionaryFromFirestore,
  loadLayerConfigsFromFirestore,
  saveLayerConfigsToFirestore,
  deleteFeatureFromFirestore,
  isDemoFeatureId,
} from './firebaseService';
import { extractObjectId, deduplicateFeaturesList } from './fieldAlias';
import { Upload, X, Check, ShieldAlert, FileText, Server, Database, AlertTriangle } from 'lucide-react';

export default function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('admin');
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveRole: UserRole = isMobile ? 'guest' : currentRole;

  const [baseMap, setBaseMap] = useState<BaseMapType>('street');
  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS);
  const [mapFeatures, setMapFeatures] = useState<GeoJsonFeatureItem[]>(INITIAL_MAP_FEATURES);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isFieldAliasModalOpen, setIsFieldAliasModalOpen] = useState<boolean>(false);
  const [aliasVersion, setAliasVersion] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Map Editing (Phase 3) state
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>('hand');
  const [selectedFeature, setSelectedFeature] = useState<GeoJsonFeatureItem | null>(null);
  const [activeDrawMode, setActiveDrawMode] = useState<DrawToolMode>('select');
  const [editingFeature, setEditingFeature] = useState<Partial<GeoJsonFeatureItem> | null>(null);
  const [isFeatureEditModalOpen, setIsFeatureEditModalOpen] = useState<boolean>(false);
  const [drawingPointsCount, setDrawingPointsCount] = useState<number>(0);
  const drawingVerticesRef = useRef<[number, number][]>([]);

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
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(false);

  const toggleLeftSidebar = () => {
    setIsLeftSidebarOpen((prev) => !prev);
    setTimeout(() => mapInstance?.invalidateSize(), 200);
  };

  const toggleRightSidebar = () => {
    setIsRightSidebarOpen((prev) => !prev);
    setTimeout(() => mapInstance?.invalidateSize(), 200);
  };

  // App initial loading splash state
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [splashStatusText, setSplashStatusText] = useState<string>('Nạp bộ nhớ đệm local...');

  // Load shared features, field aliases, and layer configs from Firestore database on mount
  useEffect(() => {
    // 0. Load local storage cache first so data is instantly available even offline or when quota exceeded
    try {
      const cached = localStorage.getItem('gis_local_map_features');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMapFeatures((prev) => {
            const list = [...prev, ...parsed].filter((f) => !isDemoFeatureId(f.id));
            return deduplicateFeaturesList(list);
          });
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc local cache:', e);
    }

    async function initSharedDb() {
      try {
        setSplashStatusText('Đang kết nối CSDL Firestore & tải dữ liệu không gian...');
        // 1. Load shared map features
        const dbFeatures = await loadSharedFeaturesFromFirestore();
        if (dbFeatures && dbFeatures.length > 0) {
          setMapFeatures((prev) => {
            const merged = deduplicateFeaturesList([...prev, ...dbFeatures].filter((f) => !isDemoFeatureId(f.id)));
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
  const locationLayerGroupRef = useRef<L.LayerGroup | null>(null);

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

  const handleRenameLayer = (layerId: string, newName: string) => {
    setLayers((prevLayers) => {
      const updated = prevLayers.map((l) =>
        l.id === layerId ? { ...l, name: newName } : l
      );
      saveLayerConfigsToFirestore(updated).catch((err) =>
        console.warn('Lỗi đồng bộ tên lớp lên Firestore:', err)
      );
      return updated;
    });
    showToast(`Đã đổi tên lớp thành: "${newName}" và lưu lên CSDL dùng chung`);
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
  const handleModeChange = (mode: DrawToolMode) => {
    setActiveDrawMode(mode);
    drawingVerticesRef.current = [];
    setDrawingPointsCount(0);
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
    if (selectedFeature && isUnsaved) {
      if (feat && feat.id === selectedFeature.id) return;
      setPendingNextFeature({ feat });
      return;
    }
    applyFeatureSelect(feat);
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

  const handleSaveFeature = (featureToSave: GeoJsonFeatureItem, targetStatus: 'xac_dinh' | 'cho_phe_duyet') => {
    const updatedFeat: GeoJsonFeatureItem = {
      ...featureToSave,
      status: targetStatus,
      updatedAt: new Date().toISOString(),
    };

    setMapFeatures((prev) => {
      const idx = prev.findIndex((f) => f.id === updatedFeat.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedFeat;
        return copy;
      } else {
        return [...prev, updatedFeat];
      }
    });

    originalSelectedFeatureRef.current = JSON.parse(JSON.stringify(updatedFeat));
    setSelectedFeature(updatedFeat);
    saveSingleFeatureToFirestore(updatedFeat);

    if (targetStatus === 'cho_phe_duyet') {
      showToast('Đã lưu bản nháp và chuyển vào hàng chờ phê duyệt.');
    } else {
      showToast('Đã lưu thay đổi đối tượng và đồng bộ CSDL thành công!');
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
    setMapFeatures((prev) => {
      const updated = prev.filter((f) => f.id !== featureId);
      try {
        localStorage.setItem('gis_local_map_features', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    deleteFeatureFromFirestore(featureId).catch((err) =>
      console.warn('Lỗi khi xóa đối tượng khỏi Firestore:', err)
    );
    if (selectedFeature?.id === featureId) {
      setSelectedFeature(null);
      originalSelectedFeatureRef.current = null;
    }
    showToast('Đã xóa đối tượng và đồng bộ CSDL thành công!');
  };

  const handleApproveDraft = (featureId: string) => {
    setMapFeatures((prev) => {
      const updatedList = prev.map((f) => (f.id === featureId ? { ...f, status: 'xac_dinh' as const } : f));
      const targetFeat = updatedList.find((f) => f.id === featureId);
      if (targetFeat) {
        saveSingleFeatureToFirestore(targetFeat).catch((err) =>
          console.warn('Lỗi đồng bộ phê duyệt lên Firestore:', err)
        );
      }
      return updatedList;
    });
    showToast('Đã phê duyệt bản ghi và đồng bộ CSDL thành công!');
  };

  const handleRejectDraft = (featureId: string) => {
    handleDeleteFeature(featureId);
  };

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
        onRoleChange={setCurrentRole}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onToggleLeftSidebar={toggleLeftSidebar}
        isRightSidebarOpen={isRightSidebarOpen}
        onToggleRightSidebar={toggleRightSidebar}
        onOpenFieldAliasModal={() => setIsFieldAliasModalOpen(true)}
        isMobile={isMobile}
      />

      {/* Mobile-Optimized Search Bar below Title Bar */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main App Body */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Mobile Backdrop when sidebars are open as overlays on small screens */}
        {(isLeftSidebarOpen || (isRightSidebarOpen && effectiveRole === 'admin')) && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-[1900] backdrop-blur-xs transition-opacity"
            onClick={() => {
              setIsLeftSidebarOpen(false);
              setIsRightSidebarOpen(false);
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

        {/* Center: Leaflet Map & Overlays */}
        <section className="flex-1 relative bg-slate-200 overflow-hidden flex flex-col">
          {/* Phase 3 Map Editor Floating Toolbar */}
          <MapEditorToolbar
            currentRole={effectiveRole}
            interactionMode={interactionMode}
            onInteractionModeChange={(mode) => {
              if (selectedFeature && isUnsaved) {
                setPendingNextFeature({ feat: null });
                return;
              }
              setInteractionMode(mode);
              if (mode === 'hand') setSelectedFeature(null);
            }}
            selectedFeature={selectedFeature}
            isUnsaved={isUnsaved}
            onSaveSelection={() => {
              if (selectedFeature) {
                handleSaveFeature(selectedFeature, selectedFeature.status || 'xac_dinh');
              }
            }}
            onDiscardSelection={handleDiscardSelection}
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
            onSave={(updated, status) => {
              handleSaveFeature(updated, status);
            }}
            onDelete={(id) => {
              handleDeleteFeature(id);
              setSelectedFeature(null);
            }}
            onClose={() => setSelectedFeature(null)}
          />
        )}

        {/* Right Sidebar: Approval Queue / Draft List (Admin Only) */}
        {effectiveRole === 'admin' && isRightSidebarOpen && (
          <div className="absolute md:relative inset-y-0 right-0 z-[2000] md:z-10 bg-white h-full shadow-2xl md:shadow-none transition-all">
            <RightSidebar
              currentRole={effectiveRole}
              pendingFeatures={mapFeatures.filter((f) => f.status === 'cho_phe_duyet')}
              onApproveClick={handleApproveDraft}
              onRejectClick={handleRejectDraft}
              onViewFeature={handleFeatureSelect}
              onClose={() => {
                setIsRightSidebarOpen(false);
                setTimeout(() => mapInstance?.invalidateSize(), 200);
              }}
            />
          </div>
        )}
      </main>

      {/* Bottom Status Bar */}
      <Footer
        cursorLocation={cursorLocation}
        userLocation={userLocation}
        zoomLevel={zoomLevel}
        mapScale={mapScale}
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

      {/* Unsaved Changes Confirmation Dialog Modal */}
      {pendingNextFeature && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 max-w-md w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Thay đổi chưa được lưu</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Đối tượng <b className="text-white">{selectedFeature?.name || selectedFeature?.id}</b> có thay đổi hình học chưa được lưu lên CSDL. Bạn muốn xử lý như thế nào?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPendingNextFeature(null)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Hủy bỏ (Tiếp tục sửa)
              </button>
              <button
                onClick={() => {
                  const next = pendingNextFeature.feat;
                  handleDiscardSelection();
                  applyFeatureSelect(next);
                  setPendingNextFeature(null);
                }}
                className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Bỏ thay đổi (Discard)
              </button>
              <button
                onClick={() => {
                  const next = pendingNextFeature.feat;
                  if (selectedFeature) {
                    handleSaveFeature(selectedFeature, selectedFeature.status || 'xac_dinh');
                  }
                  applyFeatureSelect(next);
                  setPendingNextFeature(null);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
