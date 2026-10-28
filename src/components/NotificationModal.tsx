import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Bell,
  Trash2,
  CheckCircle2,
  MessageSquare,
  AlertTriangle,
  Info,
  Navigation,
  Clock,
} from 'lucide-react';
import { Notification } from '../notificationService';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNotification?: (notification: Notification & { id: string }) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  onSelectNotification,
}) => {
  const [notifications, setNotifications] = useState<(Notification & { id: string })[]>([]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
        }
      }
    } catch (err) {
      console.warn('Error fetching notifications:', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    fetchNotifications();

    // Smart Polling: every 15s while modal is active
    const timer = setInterval(fetchNotifications, 15000);

    const handleFocus = () => {
      fetchNotifications();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isOpen, fetchNotifications]);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      // Optimistic UI update
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item))
      );

      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('webgis:notification-updated'));
      }
    } catch (err) {
      console.error('Lỗi khi đánh dấu đã đọc:', err);
    }
  };

  const deleteNotification = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      // Optimistic UI update
      setNotifications((prev) => prev.filter((item) => item.id !== id));

      await fetch('/api/notifications/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('webgis:notification-updated'));
      }
    } catch (err) {
      console.error('Lỗi khi xóa thông báo:', err);
    }
  };

  const handleItemClick = (n: Notification & { id: string }) => {
    if (!n.read) {
      markAsRead(n.id);
    }
    if (onSelectNotification) {
      onSelectNotification(n);
    }
  };

  const formatTimestamp = (createdAt: any): string => {
    if (!createdAt) return '';
    try {
      if (typeof createdAt === 'string') {
        return new Date(createdAt).toLocaleString('vi-VN');
      }
      if (typeof createdAt?.toDate === 'function') {
        return createdAt.toDate().toLocaleString('vi-VN');
      }
      if (typeof createdAt === 'number') {
        return new Date(createdAt).toLocaleString('vi-VN');
      }
    } catch (_) {}
    return '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
        <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center rounded-t-xl shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm sm:text-base">Thông báo</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-2">
          {notifications.length === 0 ? (
            <div className="text-center text-slate-400 italic p-8 text-xs">
              Không có thông báo mới.
            </div>
          ) : (
            notifications.map((n) => {
              const isFeedback = n.type === 'feedback';
              const hasTarget = n.objectId !== undefined && n.objectId !== null;

              return (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`p-3 rounded-lg border transition cursor-pointer flex gap-2.5 items-start ${
                    n.read
                      ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      : isFeedback
                      ? 'bg-sky-50 border-sky-300 hover:border-sky-400 shadow-2xs'
                      : 'bg-amber-50 border-amber-200 hover:border-amber-300 shadow-2xs'
                  }`}
                  title={hasTarget ? 'Nhấp để định vị đối tượng trên bản đồ và mở góp ý' : undefined}
                >
                  {/* Icon Loại thông báo */}
                  <div className="mt-0.5 shrink-0">
                    {isFeedback ? (
                      <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </span>
                    ) : n.type === 'error' ? (
                      <span className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                        <Info className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {/* Nội dung thông báo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-xs ${n.read ? 'text-slate-700 font-medium' : 'text-slate-900 font-bold'}`}>
                        {n.message}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(n.createdAt)}
                        </span>
                        {hasTarget && (
                          <span className="inline-flex items-center gap-0.5 text-sky-600 font-semibold bg-sky-100 px-1.5 py-0.2 rounded">
                            <Navigation className="w-2.5 h-2.5" />
                            <span>Định vị</span>
                          </span>
                        )}
                      </div>

                      {/* Thao tác nút bấm */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {!n.read && (
                          <button
                            type="button"
                            onClick={(e) => markAsRead(n.id, e)}
                            className="text-emerald-600 hover:text-emerald-700 p-1 hover:bg-emerald-50 rounded transition cursor-pointer"
                            title="Đánh dấu đã đọc"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => deleteNotification(n.id, e)}
                          className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition cursor-pointer"
                          title="Xóa thông báo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
