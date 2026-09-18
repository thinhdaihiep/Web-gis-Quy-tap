import React, { useState, useEffect } from 'react';
import { X, Bell, Trash2, CheckCircle2 } from 'lucide-react';
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
    await updateDoc(doc(db, 'notifications', id), { read: true });
  };

  const deleteNotification = async (id: string) => {
    await deleteDoc(doc(db, 'notifications', id));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center rounded-t-xl">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold">Thông báo hệ thống</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {notifications.length === 0 ? (
            <p className="text-center text-slate-500 italic p-4">Không có thông báo mới.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`p-3 rounded-lg border ${n.read ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex justify-between items-start">
                  <p className={`text-xs ${n.read ? 'text-slate-600' : 'text-slate-900 font-semibold'}`}>{n.message}</p>
                  <div className="flex gap-1">
                    {!n.read && <button onClick={() => markAsRead(n.id)} className="text-emerald-600"><CheckCircle2 className="w-4 h-4" /></button>}
                    <button onClick={() => deleteNotification(n.id)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {n.createdAt?.toDate().toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
