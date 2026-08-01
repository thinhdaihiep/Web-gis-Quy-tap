import React, { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import { Header } from './components/Header';
import { SearchFilterBar } from './components/SearchFilterBar';
import { MapComponent } from './components/Map';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { MapOverlay } from './components/MapOverlay';
import { Footer } from './components/Footer';
import { GeoJsonImportModal } from './components/GeoJsonImportModal';
import { FieldAliasModal } from './components/FieldAliasModal';
import { DEFAULT_LAYERS, INITIAL_MAP_FEATURES, BaseMapType, LayerConfig, UserRole, GeoJsonFeatureItem, DuplicateStrategy } from './types';
import {
  saveImportedFeaturesToFirestore,
  loadSharedFeaturesFromFirestore,
  loadFieldAliasDictionaryFromFirestore,
  loadLayerConfigsFromFirestore,
  saveLayerConfigsToFirestore,
} from './firebaseService';
import { Upload, X, Check, ShieldAlert, FileText, Server, Database } from 'lucide-react';

export default function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('admin');
  const [baseMap, setBaseMap] = useState<BaseMapType>('street');
  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS);
  const [mapFeatures, setMapFeatures] = useState<GeoJsonFeatureItem[]>(INITIAL_MAP_FEATURES);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isFieldAliasModalOpen, setIsFieldAliasModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  // Pane Visibility States (Responsive & Mobile-optimized - left sidebar visible by default on desktop)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(false);

  const toggleLeftSidebar = () => {
    setIsLeftSidebarOpen((prev) => !prev);
    setTimeout(() => mapInstance?.invalidateSize(), 200);
  };

  const toggleRightSidebar = () => {
    setIsRightSidebarOpen((prev) => !prev);
    setTimeout(() => mapInstance?.invalidateSize(), 200);
  };

  // Load shared features, field aliases, and layer configs from Firestore database on mount
  useEffect(() => {
    async function initSharedDb() {
      // 1. Load shared map features
      const dbFeatures = await loadSharedFeaturesFromFirestore();
      if (dbFeatures && dbFeatures.length > 0) {
        setMapFeatures((prev) => {
          const merged = [...prev];
          dbFeatures.forEach((dbFeat) => {
            const idx = merged.findIndex((m) => String(m.id).toLowerCase() === String(dbFeat.id).toLowerCase());
            if (idx !== -1) {
              merged[idx] = dbFeat;
            } else {
              merged.push(dbFeat);
            }
          });
          return merged;
        });
      }

      // 2. Load shared field alias dictionary from Firestore
      const dbAliases = await loadFieldAliasDictionaryFromFirestore();
      if (dbAliases && Object.keys(dbAliases).length > 0) {
        try {
          localStorage.setItem('gis_field_alias_dictionary', JSON.stringify(dbAliases));
        } catch (e) {
          console.warn('Lỗi lưu cache field_aliases:', e);
        }
      }

      // 3. Load shared layer configs (custom layer names) from Firestore
      const dbLayerNames = await loadLayerConfigsFromFirestore();
      if (dbLayerNames && Object.keys(dbLayerNames).length > 0) {
        setLayers((prevLayers) =>
          prevLayers.map((l) =>
            dbLayerNames[l.id] ? { ...l, name: dbLayerNames[l.id] } : l
          )
        );
      }
    }
    initSharedDb();
  }, []);
  const handleImportConfirm = (
    targetLayerId: string,
    importedFeatures: GeoJsonFeatureItem[],
    strategy: DuplicateStrategy
  ) => {
    let processedBatch: GeoJsonFeatureItem[] = [];

    setMapFeatures((prevFeatures) => {
      const existing = [...prevFeatures];
      let updatedCount = 0;
      let addedCount = 0;
      let skippedCount = 0;

      const newFeatures: GeoJsonFeatureItem[] = [];

      importedFeatures.forEach((imp) => {
        const existingIdx = existing.findIndex((e) => {
          if (e.layerId !== targetLayerId) return false;
          const matchId = e.id && imp.id && e.id.toLowerCase() === imp.id.toLowerCase();
          const matchCode = e.code && imp.code && e.code.toLowerCase() === imp.code.toLowerCase();
          const matchName = e.name && imp.name && e.name.toLowerCase() === imp.name.toLowerCase();
          return Boolean(matchId || matchCode || matchName);
        });

        if (existingIdx !== -1) {
          if (strategy === 'overwrite') {
            const updatedItem: GeoJsonFeatureItem = {
              ...imp,
              layerId: targetLayerId,
              updatedAt: new Date().toISOString().split('T')[0],
            };
            existing[existingIdx] = updatedItem;
            processedBatch.push(updatedItem);
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
            processedBatch.push(newItem);
            addedCount++;
          }
        } else {
          const newItem: GeoJsonFeatureItem = {
            ...imp,
            layerId: targetLayerId,
            updatedAt: new Date().toISOString().split('T')[0],
          };
          newFeatures.push(newItem);
          processedBatch.push(newItem);
          addedCount++;
        }
      });

      const targetLayerObj = layers.find((l) => l.id === targetLayerId);
      const layerName = targetLayerObj ? targetLayerObj.name.split(':')[0] : targetLayerId;

      let toastMsg = `Import thành công [${layerName}]: ${addedCount} mới`;
      if (updatedCount > 0) toastMsg += `, ${updatedCount} ghi đè`;
      if (skippedCount > 0) toastMsg += `, ${skippedCount} bỏ qua trùng`;

      showToast(toastMsg);

      return [...existing, ...newFeatures];
    });

    // Auto sync to Firestore
    if (processedBatch.length > 0) {
      saveImportedFeaturesToFirestore(processedBatch).catch((err) =>
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

  const handleApproveDraft = (draftId: string) => {
    showToast(`Đã phê duyệt thành công bản ghi draft: ${draftId}`);
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900 font-sans text-slate-900">
      {/* Top High Density Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onToggleLeftSidebar={toggleLeftSidebar}
        isRightSidebarOpen={isRightSidebarOpen}
        onToggleRightSidebar={toggleRightSidebar}
        onOpenFieldAliasModal={() => setIsFieldAliasModalOpen(true)}
      />

      {/* Mobile-Optimized Search Bar below Title Bar */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main App Body */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Mobile Backdrop when sidebars are open as overlays on small screens */}
        {(isLeftSidebarOpen || (isRightSidebarOpen && currentRole === 'admin')) && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-25 backdrop-blur-xs transition-opacity"
            onClick={() => {
              setIsLeftSidebarOpen(false);
              setIsRightSidebarOpen(false);
            }}
          />
        )}

        {/* Left Sidebar: Layer Management */}
        {isLeftSidebarOpen && (
          <div className="absolute md:relative inset-y-0 left-0 z-30 md:z-10 bg-white h-full shadow-2xl md:shadow-none transition-all">
            <LeftSidebar
              layers={layers}
              onToggleVisibility={handleToggleLayerVisibility}
              onRenameLayer={handleRenameLayer}
              onZoomToLayer={handleZoomToLayer}
              currentRole={currentRole}
              onImportClick={() => setIsImportModalOpen(true)}
              onOpenFieldAliasModal={() => setIsFieldAliasModalOpen(true)}
              onClose={() => {
                setIsLeftSidebarOpen(false);
                setTimeout(() => mapInstance?.invalidateSize(), 200);
              }}
            />
          </div>
        )}

        {/* Center: Leaflet Map & Overlays */}
        <section className="flex-1 relative bg-slate-200 overflow-hidden flex flex-col">
          {/* Leaflet Map */}
          <MapComponent
            baseMap={baseMap}
            layers={layers}
            features={mapFeatures}
            onMapReady={(map) => setMapInstance(map)}
            onCursorMove={setCursorLocation}
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

        {/* Right Sidebar: Approval Queue / Draft List (Admin Only) */}
        {currentRole === 'admin' && isRightSidebarOpen && (
          <div className="absolute md:relative inset-y-0 right-0 z-30 md:z-10 bg-white h-full shadow-2xl md:shadow-none transition-all">
            <RightSidebar
              currentRole={currentRole}
              onApproveClick={handleApproveDraft}
              onClose={() => {
                setIsRightSidebarOpen(false);
                setTimeout(() => mapInstance?.invalidateSize(), 200);
              }}
            />
          </div>
        )}
      </main>

      {/* Bottom Status Bar */}
      <Footer cursorLocation={cursorLocation} userLocation={userLocation} />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-10 right-10 z-[2000] bg-slate-900 text-white px-4 py-3 rounded-lg shadow-2xl border border-slate-700 flex items-center space-x-2 text-xs animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
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
      />
    </div>
  );
}
