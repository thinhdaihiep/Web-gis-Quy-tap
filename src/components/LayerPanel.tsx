import React from 'react';
import { LayerConfig } from '../types';
import { Layers, Eye, EyeOff, ShieldAlert, CheckCircle2, Info } from 'lucide-react';

interface LayerPanelProps {
  layers: LayerConfig[];
  onToggleVisibility: (layerId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  onToggleVisibility,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-16 right-4 z-[1000] w-80 sm:w-96 bg-slate-900/95 backdrop-blur-md text-slate-100 border border-slate-800 rounded-xl shadow-2xl overflow-hidden transition-all">
      {/* Header */}
      <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-100">
            Quản Lý Lớp Bản Đồ GIS
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-700 transition"
        >
          ✕
        </button>
      </div>

      {/* Layer Items */}
      <div className="p-3 space-y-2.5 max-h-[70vh] overflow-y-auto divide-y divide-slate-800/60">
        {layers.map((layer) => (
          <div
            key={layer.id}
            className="pt-2.5 first:pt-0 flex flex-col space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="text-xs font-semibold text-slate-200">
                  {layer.name}
                </span>
              </div>

              <button
                onClick={() => onToggleVisibility(layer.id)}
                className={`p-1.5 rounded-md transition-all flex items-center space-x-1 ${
                  layer.visible
                    ? 'bg-red-950/60 text-red-400 border border-red-800/50 hover:bg-red-900/60'
                    : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                }`}
                title={layer.visible ? 'Ẩn lớp' : 'Hiện lớp'}
              >
                {layer.visible ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-400 pl-6">
              {layer.description}
            </p>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="bg-slate-950/80 px-4 py-2 border-t border-slate-800 flex items-center text-[11px] text-slate-400 space-x-1.5">
        <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span>Giai đoạn 1: Bật/tắt các lớp dữ liệu nền bản đồ.</span>
      </div>
    </div>
  );
};
