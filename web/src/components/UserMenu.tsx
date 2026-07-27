import { useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { authApi } from '@/api/auth';
import { useAppStore } from '@/app/store';

/** Avatar initials from a display name / email (first letters of the first two words). */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

/**
 * The navbar account menu shared by RootLayout and AdminLayout: trigger button
 * (avatar + name + role), anchor/open state, aria wiring, the user header, and
 * the Sign out action (logout → clear session → /login). Layout-specific middle
 * MenuItems come in via the `children` render prop, which receives the menu's
 * close() so items can dismiss it on click.
 */
export function UserMenu({
  menuId,
  roleLabel,
  fallbackName,
  children,
}: {
  /** Base for the element ids: `${menuId}-btn` / `${menuId}-dropdown`. */
  menuId: string;
  /** Small label under the user's name on the trigger (e.g. "Member"). */
  roleLabel: string;
  /** Display name when no user is loaded (e.g. "Account"). */
  fallbackName: string;
  /** Layout-specific MenuItems rendered between the header and Sign out. */
  children?: (close: () => void) => ReactNode;
}) {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const clearSession = useAppStore((s) => s.clearSession);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);

  const openMenu = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);
  const closeMenu = () => setAnchor(null);

  const logout = async () => {
    closeMenu();
    try {
      await authApi.logout();
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  };

  const displayName = user?.displayName || user?.email || fallbackName;

  return (
    <div className="user-menu">
      <button
        type="button"
        className="user-menu-btn"
        id={`${menuId}-btn`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${menuId}-dropdown` : undefined}
        onClick={openMenu}
      >
        <span className="user-avatar">{initials(displayName)}</span>
        <span className="user-info">
          <span className="user-name">{displayName}</span>
          <span className="user-role">{roleLabel}</span>
        </span>
      </button>
      <Menu
        id={`${menuId}-dropdown`}
        anchorEl={anchor}
        open={open}
        onClose={closeMenu}
        MenuListProps={{ 'aria-labelledby': `${menuId}-btn`, dense: true }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 240 } } }}
      >
        {user && (
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {user.displayName || user.email}
            </Typography>
            {user.email && (
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {user.email}
              </Typography>
            )}
          </Box>
        )}
        {children?.(closeMenu)}
        <Divider />
        <MenuItem onClick={logout} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <LogoutOutlinedIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>
    </div>
  );
}
