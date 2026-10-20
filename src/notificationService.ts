import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface Notification {
  id?: string;
  title?: string;
  message: string;
  type: 'error' | 'info' | 'warning' | 'feedback';
  createdAt: any;
  read: boolean;
  objectId?: string | number;
  layerId?: string;
  feedbackId?: string;
}

export async function addNotification(
  message: string,
  type: 'error' | 'info' | 'warning' | 'feedback' = 'info',
  extra?: {
    title?: string;
    objectId?: string | number;
    layerId?: string;
    feedbackId?: string;
  }
) {
  try {
    const notificationsRef = collection(db, 'notifications');
    const docData: any = {
      message,
      type,
      createdAt: serverTimestamp(),
      read: false,
    };
    if (extra?.title) docData.title = extra.title;
    if (extra?.objectId !== undefined && extra?.objectId !== null) docData.objectId = extra.objectId;
    if (extra?.layerId) docData.layerId = extra.layerId;
    if (extra?.feedbackId) docData.feedbackId = extra.feedbackId;

    await addDoc(notificationsRef, docData);
  } catch (error) {
    console.error('Lỗi khi thêm thông báo vào Firestore:', error);
  }
}
