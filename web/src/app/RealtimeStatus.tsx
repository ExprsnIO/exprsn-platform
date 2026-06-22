import { Chip, Tooltip } from '@mui/material';
import { NS } from '@/lib/realtime';
import { useNamespaceStatus } from '@/lib/useRealtime';

const COLOR = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'default',
  error: 'error',
} as const;

/**
 * Live indicator for the single Socket.IO connection — demonstrates the
 * realtime layer by subscribing to the moderator /notifications namespace.
 */
export function RealtimeStatus() {
  const state = useNamespaceStatus(NS.notifications);
  return (
    <Tooltip title={`Realtime (${NS.notifications}): ${state}`}>
      <Chip size="small" color={COLOR[state]} label={state === 'connected' ? 'live' : state} />
    </Tooltip>
  );
}
