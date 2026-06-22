/**
 * Client-side notification inbox.
 *
 * The moderator `/notifications` socket namespace pushes live, EPHEMERAL events
 * (room `user:{userId}`) — the backend persists nothing, so there is no history
 * to fetch on load. This store accumulates whatever arrives during the session;
 * read-state and dismissal are therefore client-only.
 */
import { create } from 'zustand';

export interface AppNotification {
  id: string;
  type?: string;
  channel?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  priority?: string;
  createdAt: string;
  read: boolean;
}

const MAX_ITEMS = 200;

interface NotificationsState {
  items: AppNotification[];
  /** Add an incoming notification (de-duped by id; newest first; capped). */
  add: (n: Omit<AppNotification, 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  add: (n) =>
    set((s) => {
      if (s.items.some((i) => i.id === n.id)) return s;
      return { items: [{ ...n, read: false }, ...s.items].slice(0, MAX_ITEMS) };
    }),
  markRead: (id) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, read: true } : i)) })),
  markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ items: [] }),
}));

/** Selector: count of unread notifications. */
export const selectUnreadCount = (s: NotificationsState) =>
  s.items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
