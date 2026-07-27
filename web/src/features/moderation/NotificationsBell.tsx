import { Link as RouterLink } from 'react-router-dom';
import { Badge, IconButton, Tooltip } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNotificationsStore, selectUnreadCount } from '@/lib/notificationsStore';

/** AppBar bell with an unread badge, linking to the notifications page. */
export function NotificationsBell() {
  const unread = useNotificationsStore(selectUnreadCount);

  return (
    <Tooltip title="Notifications">
      <IconButton aria-label="Notifications" color="inherit" component={RouterLink} to="/moderation" size="large">
        <Badge badgeContent={unread} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
