import { useEffect } from 'react';
import { useAppStore } from '@/app/store';
import { NS, namespace, connect } from '@/lib/realtime';
import { useNotificationsStore, type AppNotification } from '@/lib/notificationsStore';
import { notificationsApi } from '@/api/notifications';

/**
 * App-wide subscription to the moderator `/notifications` namespace. Mounted
 * once in the authenticated shell so live notifications are captured regardless
 * of which page is open. The server binds the socket to `user:{userId}` from
 * the validated token, so no client-side room join is needed.
 */
export function useNotificationsSocket() {
  const status = useAppStore((s) => s.status);
  const add = useNotificationsStore((s) => s.add);
  const hydrate = useNotificationsStore((s) => s.hydrate);

  // Load persisted history once authenticated so the bell + unread count are
  // correct on a fresh load (before any live event arrives). Best-effort.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    notificationsApi
      .list(100)
      .then((res) => {
        if (active && res?.notifications) hydrate(res.notifications);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [status, hydrate]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const socket = namespace(NS.notifications);
    const onNotification = (n: Omit<AppNotification, 'read'>) => {
      if (n?.id) add(n);
    };
    socket.on('notification', onNotification);
    connect(NS.notifications);

    return () => {
      socket.off('notification', onNotification);
    };
  }, [status, add]);
}
