/**
 * Client-side notification inbox.
 *
 * The moderator `/notifications` socket namespace pushes live events (room
 * `user:{userId}`) and the moderator module also persists them (Redis). This
 * store is hydrated from that history on load (see useNotificationsSocket) and
 * then accumulates live arrivals; read-state and dismissal are mirrored back to
 * the server so they survive reloads.
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
  /**
   * Merge a page of persisted notifications from the server (read flags are
   * authoritative). Existing live items not present in the server set are kept,
   * then everything is sorted newest-first and capped.
   */
  hydrate: (items: Array<Omit<AppNotification, 'read'> & { read?: boolean }>) => void;
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
  hydrate: (incoming) =>
    set((s) => {
      const existing = new Map(s.items.map((i) => [i.id, i]));
      const byId = new Map<string, AppNotification>();
      // Merge server items; `read` is sticky (OR-merge) so a late-resolving
      // hydrate can't downgrade an item the client just marked read back to
      // unread. Then keep any live items the server page didn't include.
      for (const n of incoming) {
        byId.set(n.id, { ...n, read: (n.read ?? false) || !!existing.get(n.id)?.read });
      }
      for (const n of s.items) if (!byId.has(n.id)) byId.set(n.id, n);
      const items = [...byId.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_ITEMS);
      return { items };
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
