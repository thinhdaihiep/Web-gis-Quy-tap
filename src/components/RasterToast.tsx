import React, { useMemo } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, RotateCw } from 'lucide-react';
import { RasterLoadingStatus, RasterLayer, normalizeBoundsBox } from '../types';

export function normalizeRasterName(str?: string): string {
  if (!str) return '';
  const cleaned = str.trim().toLowerCase().split('?')[0].split('#')[0];
  const base = cleaned.split('/').pop() || cleaned;
  return base.replace(/\.(tif|tiff|geotiff|cog|png|jpg|jpeg)$/i, '').trim();
}

interface RasterToastProps {
  show: boolean;
  data: RasterLoadingStatus;
  containingRasterFileName?: string | null;
  activeMarkpoint?: { lat: number; lng: number } | null;
  rasterLayers?: RasterLayer[];
  activeRasterLayerId?: string | null;
  onRetryFailed?: () => void;
}

export const RasterToast: React.FC<RasterToastProps> = ({
  show,
  data,
  containingRasterFileName,
  activeMarkpoint,
  rasterLayers,
  activeRasterLayerId,
  onRetryFailed,
}) => {
  if (!show || data.state === 'idle') return null;

  const resolvedContainingFileName = useMemo(() => {
    if (containingRasterFileName !== undefined) return containingRasterFileName;
    if (activeMarkpoint && activeRasterLayerId && rasterLayers) {
      const currentActiveLayer = rasterLayers.find((l) => l.id === activeRasterLayerId);
      if (currentActiveLayer && Array.isArray(currentActiveLayer.files)) {
        const { lat, lng } = activeMarkpoint;
        const matched = currentActiveLayer.files.find((f) => {
          const bBox = normalizeBoundsBox(f.bounds);
          if (!bBox) return false;
          return lat >= bBox.south && lat <= bBox.north && lng >= bBox.west && lng <= bBox.east;
        });
        if (matched) {
          return normalizeRasterName(matched.fileName || (matched as any).name || matched.url);
        }
      }
    }
    return null;
  }, [containingRasterFileName, activeMarkpoint, activeRasterLayerId, rasterLayers]);

  const isOverallLoading =
    data.state === 'loading' &&
    (data.totalCount ?? 0) > 0 &&
    ((data.loadedCount ?? 0) + (data.failedCount ?? 0)) < (data.totalCount ?? 0);

  const currentLoadingName = isOverallLoading ? data.currentLoadingName : undefined;
  const visibleFileStatuses = data.fileStatuses || [];

  const filteredVisibleStatuses = visibleFileStatuses.filter(
    (fs) => !(currentLoadingName && fs.name === currentLoadingName && fs.state !== 'loaded')
  );

  const hasFailedFiles = (data.failedCount ?? 0) > 0;
  const isFinishedWithErrors = !isOverallLoading && hasFailedFiles;
  const displayTitle = visibleFileStatuses.map((fs) => fs.name).join(', ');

  const handleRetry = () => {
    if (onRetryFailed) {
      onRetryFailed();
    } else {
      window.dispatchEvent(new CustomEvent('retry-failed-rasters'));
    }
  };

  let unifiedStatusIcon: React.ReactNode = null;
  if (isOverallLoading) {
    unifiedStatusIcon = <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />;
  } else if (hasFailedFiles) {
    unifiedStatusIcon = <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  } else {
    unifiedStatusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
  }

  return (
    <div
      className="absolute bottom-0 left-0 z-[1000] pointer-events-auto bg-white/90 backdrop-blur-[3px] text-slate-700 text-[11px] px-2.5 py-1 flex items-center gap-2 rounded-tr-md border-t border-r border-slate-200/80 shadow-xs max-w-[360px] sm:max-w-[480px]"
      title={displayTitle}
    >
      {unifiedStatusIcon}

      <span className="font-medium truncate whitespace-nowrap overflow-hidden flex items-center gap-1.5">
        {data.message && data.message.includes('tạm dừng') ? (
          <span className="text-amber-600 font-semibold inline-flex items-center">
            {data.message}
          </span>
        ) : filteredVisibleStatuses.length > 0 ? (
          filteredVisibleStatuses.map((fs, idx) => {
            let statusClasses = 'text-amber-600 font-semibold inline-flex items-center';
            let dotColor = 'bg-amber-600';

            if (fs.state === 'loaded') {
              statusClasses = 'text-emerald-600 font-semibold inline-flex items-center';
              dotColor = 'bg-emerald-600';
            } else if (fs.state === 'error') {
              statusClasses = 'text-amber-600 font-semibold inline-flex items-center';
              dotColor = 'bg-amber-600';
            }

            const isContainingMarkpoint =
              resolvedContainingFileName &&
              normalizeRasterName(fs.name) === resolvedContainingFileName;

            return (
              <span key={idx} className="inline-flex items-center">
                <span className={statusClasses}>
                  {isContainingMarkpoint && (
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0 mr-1`} />
                  )}
                  {fs.name}
                </span>
                {idx < filteredVisibleStatuses.length - 1 ? (
                  <span className="text-slate-300 ml-1.5 mr-0.5">|</span>
                ) : (
                  ''
                )}
              </span>
            );
          })
        ) : visibleFileStatuses.length > 0 && currentLoadingName ? null : (
          <span className="text-slate-400 font-medium flex items-center">Không có ảnh</span>
        )}
      </span>

      {isOverallLoading && currentLoadingName && (
        <div
          className={`flex items-center gap-1.5 ${
            filteredVisibleStatuses.length > 0 ? 'pl-2 border-l border-slate-200' : ''
          }`}
        >
          <span
            className="text-amber-600 font-bold text-[11px] truncate max-w-[150px] sm:max-w-[200px] inline-flex items-center"
            title={`Đang tải: ${currentLoadingName}`}
          >
            <span className="truncate">{currentLoadingName}</span>
          </span>
        </div>
      )}

      {isFinishedWithErrors && (
        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors cursor-pointer shadow-2xs"
            title="Thử lại"
          >
            <RotateCw className="w-3 h-3 text-red-600" />
            <span>Thử lại</span>
          </button>
        </div>
      )}
    </div>
  );
};
