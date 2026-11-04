import React, { useState, useRef, useEffect } from 'react';
import {
  Database,
  X,
  ShieldAlert,
  Layers,
  Upload,
  Download,
  Users,
} from 'lucide-react';
import { RasterManagementTab } from './RasterManagementTab';
import { UserManagementTab } from './UserManagementTab';
import { ImportDataTab } from './database/ImportDataTab';
import { ExportDataTab } from './database/ExportDataTab';
import { AttributesTab } from './database/AttributesTab';
import {
  LayerConfig,
  GeoJsonFeatureItem,
  DuplicateStrategy,
  RasterLayer,
  LatLngBoundsBox,
  RasterLoadingStatus,
  AppUser,
} from '../types';

export interface DatabaseManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'import' | 'export' | 'attributes' | 'raster' | 'users';
  layers: LayerConfig[];
  existingFeatures: GeoJsonFeatureItem[];
  currentUser?: AppUser | null;
  onImportConfirm: (
    targetLayerId: string,
    importedFeatures: GeoJsonFeatureItem[],
    strategy: DuplicateStrategy
  ) => void;
  onBatchUpdateFeatures?: (featuresToUpdate: GeoJsonFeatureItem[]) => void;
  onAliasesUpdated?: () => void;
  onRasterLayersUpdated?: (layers: RasterLayer[]) => void;
  onSelectAndFlyToRaster?: (layerId: string, bounds?: LatLngBoundsBox | null) => void;
  rasterStatus?: RasterLoadingStatus;
}

export const DatabaseManagementModal: React.FC<DatabaseManagementModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'import',
  layers,
  existingFeatures,
  currentUser,
  onImportConfirm,
  onAliasesUpdated,
  onRasterLayersUpdated,
  onSelectAndFlyToRaster,
  rasterStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'attributes' | 'raster' | 'users'>(defaultTab);

  // Sync activeTab when defaultTab changes
  const prevDefaultTabRef = useRef(defaultTab);
  useEffect(() => {
    if (defaultTab !== prevDefaultTabRef.current) {
      prevDefaultTabRef.current = defaultTab;
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  return (
    <div
      className={`fixed inset-0 z-[3000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ${
        isOpen ? '' : 'hidden pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-3xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/30 rounded-lg border border-blue-500/50 text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-100">
                Quản lý Cơ sở Dữ liệu (CSDL)
              </h3>
              <p className="text-[11px] text-slate-400">
                Nhập/Xuất dữ liệu không gian &amp; Cấu hình bảng thuộc tính hệ thống
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
            title="Đóng bảng quản lý CSDL"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation - Compact, responsive layout */}
        <div className="bg-slate-100 border-b border-slate-200 px-2 sm:px-4 pt-2 grid grid-cols-5 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-1 sm:px-3 py-2 text-[11px] sm:text-xs font-bold rounded-t-lg transition flex items-center justify-center text-center cursor-pointer border-t border-x ${
              activeTab === 'import'
                ? 'bg-white text-blue-700 border-slate-300 border-b-transparent -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
            title="Nhập dữ liệu"
          >
            <span className="truncate">Nhập DL</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`px-1 sm:px-3 py-2 text-[11px] sm:text-xs font-bold rounded-t-lg transition flex items-center justify-center text-center cursor-pointer border-t border-x ${
              activeTab === 'export'
                ? 'bg-white text-blue-700 border-slate-300 border-b-transparent -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
            title="Xuất dữ liệu"
          >
            <span className="truncate">Xuất DL</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attributes')}
            className={`px-1 sm:px-3 py-2 text-[11px] sm:text-xs font-bold rounded-t-lg transition flex items-center justify-center text-center cursor-pointer border-t border-x ${
              activeTab === 'attributes'
                ? 'bg-white text-blue-700 border-slate-300 border-b-transparent -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
            title="Bảng thuộc tính"
          >
            <span className="truncate">Thuộc tính</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('raster')}
            className={`px-1 sm:px-3 py-2 text-[11px] sm:text-xs font-bold rounded-t-lg transition flex items-center justify-center text-center cursor-pointer border-t border-x ${
              activeTab === 'raster'
                ? 'bg-white text-blue-700 border-slate-300 border-b-transparent -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
            title="Bản đồ nền"
          >
            <span className="truncate">Bản đồ nền</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-1 sm:px-3 py-2 text-[11px] sm:text-xs font-bold rounded-t-lg transition flex items-center justify-center text-center cursor-pointer border-t border-x ${
              activeTab === 'users'
                ? 'bg-white text-blue-700 border-slate-300 border-b-transparent -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
            title="Người dùng"
          >
            <span className="truncate">Người dùng</span>
          </button>
        </div>

        {/* Tab Content Panels */}
        {activeTab === 'import' && (
          <ImportDataTab
            layers={layers}
            existingFeatures={existingFeatures}
            onImportConfirm={onImportConfirm}
            onClose={onClose}
          />
        )}

        {activeTab === 'export' && (
          <ExportDataTab
            layers={layers}
            existingFeatures={existingFeatures}
          />
        )}

        {activeTab === 'attributes' && (
          <AttributesTab onAliasesUpdated={onAliasesUpdated} />
        )}

        {activeTab === 'raster' && (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 flex-1">
            <RasterManagementTab
              onLayersChange={onRasterLayersUpdated}
              onSelectAndFlyToRaster={onSelectAndFlyToRaster}
              rasterStatus={rasterStatus}
            />
          </div>
        )}

        {activeTab === 'users' && (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 flex-1">
            <UserManagementTab />
          </div>
        )}

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Phân quyền: Quản trị viên CSDL hệ thống</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
