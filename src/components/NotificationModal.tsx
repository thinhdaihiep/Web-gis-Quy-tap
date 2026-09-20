import React, { useState, useEffect } from 'react';
import { X, Bell, Trash2, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Notification } from '../notificationService';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<(Notification & { id: string })[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Notification & { id: string }));
      setNotifications(items);
    });

    return () => unsubscribe();
  }, [isOpen]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.warn('Lỗi đánh dấu đã đọc:', e);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (e) {
      console.warn('Lỗi xóa thông báo:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center rounded-t-xl">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm sm:text-base">Thông báo hệ thống</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition cursor-pointer p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
          {notifications.length === 0 ? (
            <p className="text-center text-slate-500 italic p-6 text-xs sm:text-sm">Không có thông báo mới.</p>
          ) : (
            notifications.map((n) => {
              const isError = n.type === 'error';
              const isWarning = n.type === 'warning';
              
              let containerClass = n.read ? 'bg-slate-50 border-slate-200' : 'bg-blue-50/70 border-blue-200';
              let iconElement = <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />;

              if (isError) {
                containerClass = n.read ? 'bg-red-50/40 border-red-200' : 'bg-red-50 border-red-300';
                iconElement = <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />;
              } else if (isWarning) {
                containerClass = n.read ? 'bg-amber-50/40 border-amber-200' : 'bg-amber-50 border-amber-300';
                iconElement = <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;
              }

              return (
                <div key={n.id} className={`p-3 rounded-lg border transition ${containerClass}`}>
                  <div className="flex items-start gap-2.5 justify-between">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      {iconElement}
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs leading-relaxed break-words ${n.read ? 'text-slate-700' : 'text-slate-900 font-semibold'}`}>
                          {n.message}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {!n.read && (
                        <button
                          onClick={() => markAsRead(n.id)}
                          className="text-slate-400 hover:text-emerald-600 p-1 rounded transition cursor-pointer"
                          title="Đánh dấu đã đọc"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(n.id)}
                        className="text-slate-400 hover:text-red-500 p-1 rounded transition cursor-pointer"
                        title="Xóa thông báo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
