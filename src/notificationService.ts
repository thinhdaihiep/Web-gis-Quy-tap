import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface Notification {
  message: string;
  type: 'error' | 'info' | 'warning';
  createdAt: any;
  read: boolean;
}

export async function addNotification(message: string, type: 'error' | 'info' | 'warning' = 'info') {
  try {
    const notificationsRef = collection(db, 'notifications');
    await addDoc(notificationsRef, {
      message,
      type,
      createdAt: serverTimestamp(),
      read: false
    });
  } catch (error) {
    console.error('Lỗi khi thêm thông báo vào Firestore:', error);
  }
}
