import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { addNotification } from './notificationService';

export type FeedbackStatus = 'moi' | 'dang_xu_ly' | 'da_xu_ly';

export interface FeedbackItem {
  id: string;
  OBJECTID: string | number;
  Lop: string;
  TenLop: string;
  TenDoiTuong: string;
  Ten: string;
  DienThoai: string;
  NoiDung: string;
  ThoiGian: string;
  TrangThai: FeedbackStatus;
  createdAt?: any;
}

export interface CreateFeedbackParams {
  OBJECTID: string | number;
  Lop: string;
  TenLop: string;
  TenDoiTuong: string;
  Ten: string;
  DienThoai: string;
  NoiDung: string;
}

export async function createFeedback(params: CreateFeedbackParams): Promise<string> {
  const colRef = collection(db, 'PhanAnh');
  const now = new Date();
  const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const docRef = await addDoc(colRef, {
    OBJECTID: params.OBJECTID,
    Lop: params.Lop,
    TenLop: params.TenLop,
    TenDoiTuong: params.TenDoiTuong,
    Ten: params.Ten,
    DienThoai: params.DienThoai,
    NoiDung: params.NoiDung,
    ThoiGian: timeFormatted,
    TrangThai: 'moi',
    createdAt: serverTimestamp(),
  });

  // Tự động đẩy thông báo realtime cho Admin và Biên tập viên mang trực tiếp objectId và layerId
  await addNotification(
    `[${params.Ten}] góp ý trên "${params.TenDoiTuong}" (${params.TenLop})`,
    'feedback',
    {
      title: 'Góp ý mới',
      objectId: params.OBJECTID,
      layerId: params.Lop,
      feedbackId: docRef.id,
    }
  );

  return docRef.id;
}

export function subscribeFeedbacksForObject(
  objectId: string | number,
  layerId: string,
  onData: (items: FeedbackItem[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, 'PhanAnh');
  const q = query(colRef, where('Lop', '==', String(layerId)));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: FeedbackItem[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (
          String(data.OBJECTID).toLowerCase().trim() ===
          String(objectId).toLowerCase().trim()
        ) {
          items.push({
            id: d.id,
            OBJECTID: data.OBJECTID,
            Lop: data.Lop,
            TenLop: data.TenLop || '',
            TenDoiTuong: data.TenDoiTuong || '',
            Ten: data.Ten || '',
            DienThoai: data.DienThoai || '',
            NoiDung: data.NoiDung || '',
            ThoiGian: data.ThoiGian || '',
            TrangThai: (data.TrangThai as FeedbackStatus) || 'moi',
            createdAt: data.createdAt,
          });
        }
      });

      items.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });

      onData(items);
    },
    (err) => {
      console.warn('Lỗi lắng nghe phản ánh:', err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

export async function deleteFeedback(feedbackId: string): Promise<void> {
  const docRef = doc(db, 'PhanAnh', feedbackId);
  await deleteDoc(docRef);
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus
): Promise<void> {
  const docRef = doc(db, 'PhanAnh', feedbackId);
  await updateDoc(docRef, { TrangThai: status });
}
