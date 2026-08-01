import React from 'react';
import { UserRole } from '../types';
import { ShieldCheck, Clock, Check, Eye, AlertCircle, X } from 'lucide-react';

interface RightSidebarProps {
  currentRole: UserRole;
  onApproveClick: (draftId: string) => void;
  onClose?: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  currentRole,
  onApproveClick,
  onClose,
}) => {
  // Sample Draft items matching system workflow requirements
  const draftItems = [
    {
      id: 'draft-1',
      title: 'Sửa vùng QT-2024',
      time: '14:20',
      editor: 'Nguyễn Văn A',
      description: 'Cập nhật geometry ranh giới vùng tìm kiếm quy tập tại xã A, huyện B.',
      statusColor: 'border-amber-400',
    },
    {
      id: 'draft-2',
      title: 'Thêm mới Mộ chí',
      time: '10:45',
      editor: 'Trần Thị B',
      description: 'Thêm tọa độ điểm mộ chí liệt sĩ chưa rõ tên tại khu vực đồi 31.',
      statusColor: 'border-blue-400',
    },
    {
      id: 'draft-3',
      title: 'Cập nhật trận đánh 1968',
      time: 'Hôm qua',
      editor: 'Lê Văn C',
      description: 'Sửa thông tin thuộc tính quy mô đơn vị tham chiến.',
      statusColor: 'border-purple-400',
    },
  ];

  return (
    <aside className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0 text-slate-800 z-10 shadow-sm">
      {/* Header */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-amber-500" />
          <span>Chờ phê duyệt</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
            03 DRAFT
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
        {draftItems.map((item) => (
          <div
            key={item.id}
            className={`p-3 hover:bg-slate-50 transition-colors border-l-4 ${item.statusColor}`}
          >
            <div className="flex justify-between items-start mb-1">
              <h4 className="text-xs font-bold text-slate-800">{item.title}</h4>
              <span className="text-[9px] text-slate-400 font-mono">{item.time}</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug mb-2.5">
              <span className="font-medium text-slate-700">Editor {item.editor}:</span>{' '}
              {item.description}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onApproveClick(item.id)}
                disabled={currentRole !== 'admin'}
                className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${
                  currentRole === 'admin'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={
                  currentRole === 'admin'
                    ? 'Duyệt bản ghi draft này sang trạng thái Published'
                    : 'Chỉ Admin có quyền phê duyệt bản ghi'
                }
              >
                <Check className="w-3 h-3" />
                <span>Duyệt</span>
              </button>
              <button className="flex-1 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center gap-1 transition-all">
                <Eye className="w-3 h-3" />
                <span>Chi tiết</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
