import { http } from '@/lib/http';
import type { AppNotification } from '@/lib/notificationsStore';

/** A persisted notification as returned by the moderator store (read flag set). */
export type ServerNotification = Omit<AppNotification, 'read'> & { read?: boolean };

/**
 * Persisted notifications (moderator module, Redis-backed). The live socket
 * (`/notifications`) still pushes new ones; these endpoints provide history,
 * unread count, and durable read/dismiss state across reloads.
 */
export const notificationsApi = {
  list: (limit = 100) =>
    http.get<{ success: boolean; notifications: ServerNotification[]; unreadCount: number }>(
      `/moderator/api/notifications?limit=${limit}`,
    ),
  unreadCount: () =>
    http.get<{ success: boolean; count: number }>('/moderator/api/notifications/unread-count'),
  markRead: (id: string) =>
    http.post<{ success: boolean }>(`/moderator/api/notifications/${id}/read`),
  markAllRead: () => http.post<{ success: boolean; changed: number }>('/moderator/api/notifications/read-all'),
  remove: (id: string) => http.del<{ success: boolean }>(`/moderator/api/notifications/${id}`),
  clear: () => http.del<{ success: boolean }>('/moderator/api/notifications'),
};
