import { useState, useEffect, useCallback } from 'react';
import { UserRole } from '../types';
import { getAuthHeaders } from '../firebaseService';

export function useNotificationPolling(effectiveRole: UserRole) {
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  const fetchUnreadCount = useCallback(async () => {
    if (effectiveRole !== 'admin' && effectiveRole !== 'editor') {
      setUnreadNotificationCount(0);
      return;
    }

    try {
      const res = await fetch(`/api/notifications/unread-count?_t=${Date.now()}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.count === 'number') {
          setUnreadNotificationCount(data.count);
        }
      }
    } catch (err) {
      console.warn('Lỗi kiểm tra thông báo:', err);
    }
  }, [effectiveRole]);

  useEffect(() => {
    if (effectiveRole !== 'admin' && effectiveRole !== 'editor') {
      setUnreadNotificationCount(0);
      return;
    }

    let isMounted = true;

    const runFetch = async () => {
      try {
        const res = await fetch(`/api/notifications/unread-count?_t=${Date.now()}`, {
          headers: getAuthHeaders(),
          cache: 'no-store',
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          if (typeof data.count === 'number') {
            setUnreadNotificationCount(data.count);
          }
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra thông báo:', err);
      }
    };

    runFetch();

    // Polling định kỳ mỗi 60 giây
    const intervalId = setInterval(runFetch, 60000);

    // Kiểm tra ngay khi người dùng chuyển lại tab (focus / visibility) hoặc khi có thông báo mới
    const handleFocus = () => runFetch();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runFetch();
    };
    const handleNotificationUpdated = () => runFetch();

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('webgis:notification-updated', handleNotificationUpdated);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('webgis:notification-updated', handleNotificationUpdated);
    };
  }, [effectiveRole]);

  return {
    unreadNotificationCount,
    setUnreadNotificationCount,
    fetchUnreadCount,
  };
}
