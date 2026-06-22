/**
 * Client/UI state (Zustand). Server state lives in TanStack Query; this holds
 * session identity, socket status, and cross-cutting UI flags. The bearer token
 * itself lives in lib/token.ts (kept out of React state so non-React modules —
 * the http wrapper, the socket manager — can read it synchronously).
 */
import { create } from 'zustand';
import type { User } from '@/api/auth';
import { tokenStore } from '@/lib/token';
import { reauthAll, disconnectAll } from '@/lib/realtime';
import { useE2eeStore } from '@/lib/e2eeStore';

interface AppState {
  user: User | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
  setSession: (user: User, token: string) => void;
  /** Update identity only (e.g. after a profile edit) — no token/socket churn. */
  setUser: (user: User) => void;
  clearSession: () => void;
  setAnonymous: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  status: 'unknown',
  setSession: (user, token) => {
    tokenStore.set(token);
    // Any already-open namespaces re-handshake with the new bearer.
    reauthAll();
    set({ user, status: 'authenticated' });
  },
  setUser: (user) => set({ user }),
  clearSession: () => {
    tokenStore.clear();
    disconnectAll();
    // Drop the in-memory private key + caches so the next user must re-unlock.
    useE2eeStore.getState().lock();
    set({ user: null, status: 'anonymous' });
  },
  setAnonymous: () => set({ status: 'anonymous' }),
}));
