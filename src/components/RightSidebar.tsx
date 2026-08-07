import React from 'react';
import { GeoJsonFeatureItem, UserRole } from '../types';
import { Clock, Check, Eye, X, Trash2, MapPin } from 'lucide-react';

interface RightSidebarProps {
  currentRole: UserRole;
  pendingFeatures?: GeoJsonFeatureItem[];
  onApproveClick: (featureId: string) => void;
  onRejectClick?: (featureId: string) => void;
  onViewFeature?: (feature: GeoJsonFeatureItem) => void;
  onClose?: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  currentRole,
  pendingFeatures = [],
  onApproveClick,
  onRejectClick,
  onViewFeature,
  onClose,
}) => {
  // Sample fallback drafts if no real draft features are in memory yet
  const sampleDrafts = [
    {
      id: 'draft-sample-1',
      name: 'Thêm mới Mộ chí Đồi 31',
      createdBy: 'Trần Thị B (Editor)',
      editorNotes: 'Tọa độ khảo sát tại khu vực Đồi 31, chưa rõ họ tên.',
      updatedAt: '10:45',
      type: 'Point' as const,
    },
    {
      id: 'draft-sample-2',
      name: 'Cập nhật Vùng QT-2024',
      createdBy: 'Nguyễn Văn A (Editor)',
      editorNotes: 'Điều chỉnh ranh giới phía Tây theo sơ đồ tác chiến mới.',
      updatedAt: '14:20',
      type: 'Polygon' as const,
    },
  ];

  const hasRealDrafts = pendingFeatures.length > 0;
  const displayItems = hasRealDrafts ? pendingFeatures : sampleDrafts;

  return (
    <aside className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0 text-slate-800 z-10 shadow-sm">
      {/* Header */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-amber-500" />
          <span>Chờ phê duyệt</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
            {String(displayItems.length).padStart(2, '0')} DRAFT
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition cursor-pointer"
              title="Ẩn bảng Phê duyệt"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Draft List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {displayItems.map((item, idx) => {
          const isReal = 'layerId' in item;
          const featureName = item.name || 'Đối tượng mới';
          const author = item.createdBy || 'Biên tập viên';
          const notes = item.editorNotes || (item as any).description || 'Chờ kiểm tra và phê duyệt xuất bản.';

          return (
            <div
              key={`${item.id}_${idx}`}
              className="p-3 hover:bg-slate-50 transition-colors border-l-4 border-amber-400"
            >
              <div className="flex justify-between items-start mb-1">
                <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{featureName}</h4>
                <span className="text-[9px] text-slate-400 font-mono shrink-0 ml-1">
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong'}
                </span>
              </div>

              <p className="text-[11px] text-slate-600 leading-snug mb-2.5">
                <span className="font-semibold text-slate-700">{author}:</span> {notes}
              </p>

              <div className="flex gap-1.5">
                <button
                  onClick={() => onApproveClick(item.id)}
                  disabled={currentRole !== 'admin'}
                  className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${
                    currentRole === 'admin'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                  title={
                    currentRole === 'admin'
                      ? 'Chấp nhận & Xuất bản bản ghi này lên bản đồ'
                      : 'Chỉ Admin có quyền phê duyệt bản ghi'
                  }
                >
                  <Check className="w-3 h-3" />
                  <span>Duyệt</span>
                </button>

                {isReal && onViewFeature && (
                  <button
                    onClick={() => onViewFeature(item as GeoJsonFeatureItem)}
                    className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="Xem chi tiết & Chỉnh sửa"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}

                {onRejectClick && (
                  <button
                    onClick={() => onRejectClick(item.id)}
                    disabled={currentRole !== 'admin'}
                    className={`px-2 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${
                      currentRole === 'admin'
                        ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer'
                        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    }`}
                    title="Từ chối bản nháp"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
