/**
 * Live updates for the admin console (TASK-039).
 *
 * Connects the /_admin namespace (admin-auth enforced in the handshake) and
 * fans events into TanStack Query so sections stay declarative:
 *  - 'health'          → written into the ['admin','live-health'] cache
 *  - 'config:changed'  → invalidates ['admin','platform-config'] (+ toast data)
 *
 * Sections keep their own polling (refetchInterval) as the fallback — when the
 * socket is connected we stretch nothing; the events simply arrive first.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connect, disconnect, NS } from '@/lib/realtime';

export interface AdminConfigChange {
  key: string;
  module: string;
  restartRequired: boolean;
  pendingRestart: boolean;
  updatedBy: string | null;
  updatedAt: string;
  action: 'set' | 'delete';
}

/** Module-level connection state so every consumer shares one subscription. */
let connState: 'connected' | 'connecting' | 'off' = 'off';
const connListeners = new Set<() => void>();
function setConnState(next: typeof connState) {
  connState = next;
  connListeners.forEach((l) => l());
}

export function useAdminSocket(opts?: { onConfigChange?: (e: AdminConfigChange) => void }) {
  const queryClient = useQueryClient();
  const onConfigChange = opts?.onConfigChange;

  useEffect(() => {
    const socket = connect(NS.admin);
    setConnState(socket.connected ? 'connected' : 'connecting');

    const onConnect = () => setConnState('connected');
    const onDisconnect = () => setConnState('connecting');
    const onHealth = (snapshot: unknown) => {
      queryClient.setQueryData(['admin', 'live-health'], snapshot);
      // The event payload is collectHealth() output — the same shape GET
      // /health returns — so feed the dashboard's query cache directly.
      queryClient.setQueryData(['health'], snapshot);
    };
    const onConfig = (event: AdminConfigChange) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'platform-config'] });
      onConfigChange?.(event);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('health', onHealth);
    socket.on('config:changed', onConfig);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('health', onHealth);
      socket.off('config:changed', onConfig);
      // Last consumer gone → close the namespace (cheap to reopen).
      if (connListeners.size === 0) {
        disconnect(NS.admin);
        setConnState('off');
      }
    };
  }, [queryClient, onConfigChange]);

  const state = useSyncExternalStore(
    (cb) => {
      connListeners.add(cb);
      return () => connListeners.delete(cb);
    },
    () => connState,
  );

  return { state };
}
