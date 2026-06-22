import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { useAppStore } from '@/app/store';
import { NS } from '@/lib/realtime';
import { useNamespaceStatus, type ConnState } from '@/lib/useRealtime';
import { useNotificationsStore, selectUnreadCount } from '@/lib/notificationsStore';
import { relativeTime } from '@/features/timeline/util';

const CHIP_COLOR: Record<ConnState, 'success' | 'warning' | 'default' | 'error'> = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'default',
  error: 'error',
};

const PRIORITY_COLOR: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  low: 'default',
  normal: 'info',
  high: 'warning',
  urgent: 'error',
};

/**
 * Phase 5 — Notifications (Moderator). Live inbox fed by the `/notifications`
 * socket namespace. Notifications are ephemeral server-side, so this lists what
 * has arrived this session; read-state and dismissal are client-only.
 */
export function NotificationsPage() {
  const userId = useAppStore((s) => s.user?.id);
  const conn = useNamespaceStatus(NS.notifications);
  const items = useNotificationsStore((s) => s.items);
  const unread = useNotificationsStore(selectUnreadCount);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const remove = useNotificationsStore((s) => s.remove);
  const clear = useNotificationsStore((s) => s.clear);

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  return (
    <Stack spacing={2} sx={{ maxWidth: 720, mx: 'auto', pb: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">Notifications</Typography>
        <Chip size="small" color={CHIP_COLOR[conn]} label={conn === 'connected' ? 'live' : conn} />
        {unread > 0 && <Chip size="small" color="error" label={`${unread} unread`} />}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Mark all read">
          <span>
            <Button
              size="small"
              startIcon={<DoneAllIcon />}
              disabled={unread === 0}
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Clear all">
          <span>
            <Button
              size="small"
              color="inherit"
              startIcon={<DeleteSweepIcon />}
              disabled={items.length === 0}
              onClick={clear}
            >
              Clear
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Alert severity="info" variant="outlined">
        Notifications stream in live and are kept only for this session — there is no
        server-side history to load.
      </Alert>

      {items.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
          No notifications yet.
        </Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {items.map((n) => (
              <ListItem
                key={n.id}
                divider
                onMouseEnter={() => !n.read && markRead(n.id)}
                sx={{ bgcolor: n.read ? 'transparent' : 'action.hover', alignItems: 'flex-start' }}
                secondaryAction={
                  <IconButton edge="end" size="small" onClick={() => remove(n.id)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: n.read ? 500 : 700 }}>
                        {n.title || n.type || 'Notification'}
                      </Typography>
                      {n.priority && n.priority !== 'normal' && (
                        <Chip
                          size="small"
                          label={n.priority}
                          color={PRIORITY_COLOR[n.priority] ?? 'default'}
                          variant="outlined"
                        />
                      )}
                      <Typography variant="caption" color="text.secondary">
                        · {relativeTime(n.createdAt)}
                      </Typography>
                    </Stack>
                  }
                  secondary={n.body}
                  secondaryTypographyProps={{ sx: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Stack>
  );
}
