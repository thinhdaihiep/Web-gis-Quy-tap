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
    const payload: any = {
      message,
      type,
    };
    if (extra?.title) payload.title = extra.title;
    if (extra?.objectId !== undefined && extra?.objectId !== null) payload.objectId = extra.objectId;
    if (extra?.layerId) payload.layerId = extra.layerId;
    if (extra?.feedbackId) payload.feedbackId = extra.feedbackId;

    await fetch('/api/notifications/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('webgis:notification-updated'));
    }
  } catch (error) {
    console.error('Lỗi khi thêm thông báo:', error);
  }
}
