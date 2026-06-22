import { useEffect, useState } from 'react';
import { connect, namespace, type Namespace } from './realtime';

export type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Subscribe a component to a namespace and track its connection state. Connects
 * lazily on mount; leaves the socket open on unmount for reuse by other views.
 */
export function useNamespaceStatus(nsp: Namespace, enabled = true): ConnState {
  const [state, setState] = useState<ConnState>('disconnected');

  useEffect(() => {
    if (!enabled) return;
    const socket = namespace(nsp);
    setState(socket.connected ? 'connected' : 'connecting');

    const onConnect = () => setState('connected');
    const onDisconnect = () => setState('disconnected');
    const onError = () => setState('error');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);

    connect(nsp);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, [nsp, enabled]);

  return state;
}
