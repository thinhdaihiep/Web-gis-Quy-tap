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
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Gửi góp ý thất bại');
  }

  const data = await res.json();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('webgis:notification-updated'));
  }
  return data.id || '';
}

/**
 * Smart Polling subscription for feedback on a specific GIS object
 * Automatically polls initially, on window focus, and on an active 15s interval while open
 */
export function subscribeFeedbacksForObject(
  objectId: string | number,
  layerId: string,
  onData: (items: FeedbackItem[]) => void,
  onError?: (err: any) => void
): () => void {
  let isSubscribed = true;

  const fetchItems = async () => {
    if (!isSubscribed) return;
    try {
      const url = `/api/feedback?objectId=${encodeURIComponent(objectId)}&layerId=${encodeURIComponent(layerId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (isSubscribed && Array.isArray(data.items)) {
          onData(data.items);
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (isSubscribed && onError) {
        onError(err);
      }
    }
  };

  // Immediate fetch
  fetchItems();

  // Smart Polling interval: 15 seconds while modal is open
  const intervalId = setInterval(fetchItems, 15000);

  // Poll immediately on window focus
  const handleFocus = () => {
    fetchItems();
  };
  window.addEventListener('focus', handleFocus);

  return () => {
    isSubscribed = false;
    clearInterval(intervalId);
    window.removeEventListener('focus', handleFocus);
  };
}

export async function deleteFeedback(feedbackId: string): Promise<void> {
  const res = await fetch('/api/feedback/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedbackId }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Xóa góp ý thất bại');
  }
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus
): Promise<void> {
  const res = await fetch('/api/feedback/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedbackId, status }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Cập nhật trạng thái góp ý thất bại');
  }
}
