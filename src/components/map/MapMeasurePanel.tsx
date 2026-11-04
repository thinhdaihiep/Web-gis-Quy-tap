import React from 'react';
import { Ruler, DraftingCompass, Target, X } from 'lucide-react';

export interface MeasureResult {
  mode: 'distance' | 'area_custom' | 'area_feature';
  valueString: string;
  subValueString?: string;
  featureName?: string;
}

interface MapMeasurePanelProps {
  measureResult: MeasureResult | null;
  onClear: () => void;
}

export const MapMeasurePanel: React.FC<MapMeasurePanelProps> = ({ measureResult, onClear }) => {
  if (!measureResult) return null;

  return (
    <div className="absolute top-4 left-16 z-[1000] bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-lg rounded-lg px-3 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-600">
          {measureResult.mode === 'distance' && <Ruler className="w-4 h-4" />}
          {measureResult.mode === 'area_custom' && <DraftingCompass className="w-4 h-4 text-emerald-600" />}
          {measureResult.mode === 'area_feature' && <Target className="w-4 h-4 text-purple-600" />}
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
            <span>{measureResult.valueString}</span>
            {measureResult.featureName && (
              <span className="text-[10px] font-normal text-slate-500 truncate max-w-[120px]">
                ({measureResult.featureName})
              </span>
            )}
          </div>
          {measureResult.subValueString && (
            <div className="text-[10px] text-slate-500">{measureResult.subValueString}</div>
          )}
        </div>
      </div>
      <button
        onClick={onClear}
        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
        title="Đóng đo đạc"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
