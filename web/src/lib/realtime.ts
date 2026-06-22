/**
 * Realtime layer — ONE Socket.IO connection, many namespaces.
 *
 * The gateway runs a single Socket.IO server (path `/socket.io`) and each
 * realtime module owns a namespace. We create one Manager against the current
 * origin and derive per-namespace sockets from it, so every namespace is
 * multiplexed over a single underlying connection.
 *
 * Auth: the bearer is sent in the handshake `auth` as a function, so each
 * (re)connect picks up the latest token (several namespaces run per-namespace
 * auth middleware that validates it during the handshake).
 *
 * Connect lazily — only open a namespace when a feature needs it.
 */
import { Manager, Socket } from 'socket.io-client';
import { tokenStore } from './token';

// Namespaces owned by the realtime modules (mirror src/modules/registry.js).
export const NS = {
  ca: '/ca',
  spark: '/spark',
  vault: '/vault',
  timeline: '/timeline',
  moderation: '/moderation',
  notifications: '/notifications',
  live: '/live',
} as const;

export type Namespace = (typeof NS)[keyof typeof NS];

let manager: Manager | null = null;
const sockets = new Map<string, Socket>();

function getManager(): Manager {
  if (!manager) {
    // Same origin as the SPA (nginx edge in prod / Vite proxy in dev).
    manager = new Manager(window.location.origin, {
      path: '/socket.io',
      autoConnect: false,
      transports: ['websocket', 'polling'],
      // Reconnect with backoff; the Manager handles it for all namespaces.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return manager;
}

/**
 * Get (creating if needed) the socket for a namespace. Does not connect.
 */
export function namespace(nsp: Namespace): Socket {
  let socket = sockets.get(nsp);
  if (!socket) {
    socket = getManager().socket(nsp, {
      // Function form re-reads the token on every (re)connect.
      auth: (cb: (data: Record<string, unknown>) => void) => cb({ token: tokenStore.get() }),
    });
    sockets.set(nsp, socket);
  }
  return socket;
}

/** Get the namespace socket and ensure it is connecting/connected. */
export function connect(nsp: Namespace): Socket {
  const socket = namespace(nsp);
  if (!socket.connected) socket.connect();
  return socket;
}

/** Disconnect a single namespace (keeps the socket for later reuse). */
export function disconnect(nsp: Namespace): void {
  sockets.get(nsp)?.disconnect();
}

/**
 * Re-authenticate every open namespace — call after the bearer changes
 * (login / re-mint). Reconnecting re-runs the auth function with the new token.
 */
export function reauthAll(): void {
  for (const socket of sockets.values()) {
    if (socket.connected) {
      socket.disconnect().connect();
    }
  }
}

/** Tear everything down (logout). */
export function disconnectAll(): void {
  for (const socket of sockets.values()) socket.disconnect();
  sockets.clear();
  manager?.removeAllListeners();
  manager = null;
}
