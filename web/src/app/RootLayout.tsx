import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import DynamicFeedOutlinedIcon from '@mui/icons-material/DynamicFeedOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import LiveTvOutlinedIcon from '@mui/icons-material/LiveTvOutlined';
import VideoCameraFrontOutlinedIcon from '@mui/icons-material/VideoCameraFrontOutlined';
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import { authApi } from '@/api/auth';
import { useAppStore } from '@/app/store';
import { useNotificationsSocket } from '@/lib/useNotifications';
import { NotificationsBell } from '@/features/moderation/NotificationsBell';
import { RealtimeStatus } from './RealtimeStatus';
import { ThemeToggle } from './ThemeToggle';

// Feature areas mirror the 10 backend modules. Client routes use friendly
// names that deliberately DO NOT collide with the backend module prefixes
// (/spark, /timeline, …) — those paths belong to the gateway/proxy. API calls
// still target the real prefixes (e.g. /spark/api/...).
interface NavItem {
  label: string;
  to: string;
  icon: SvgIconComponent;
}
const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Health', to: '/', icon: MonitorHeartOutlinedIcon },
      { label: 'Messages', to: '/messages', icon: ChatBubbleOutlineOutlinedIcon },
      { label: 'Timeline', to: '/feed', icon: DynamicFeedOutlinedIcon },
      { label: 'Search', to: '/search', icon: SearchOutlinedIcon },
      { label: 'Bookmarks', to: '/bookmarks', icon: BookmarkBorderOutlinedIcon },
      { label: 'Files', to: '/files', icon: FolderOutlinedIcon },
      { label: 'Groups', to: '/groups', icon: GroupsOutlinedIcon },
      { label: 'People', to: '/people', icon: PeopleAltOutlinedIcon },
      { label: 'Live', to: '/streams', icon: LiveTvOutlinedIcon },
      { label: 'Rooms', to: '/rooms', icon: VideoCameraFrontOutlinedIcon },
      { label: 'Apps', to: '/apps', icon: AppsOutlinedIcon },
      { label: 'Organizations', to: '/orgs', icon: CorporateFareOutlinedIcon },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'Moderation', to: '/moderation', icon: ShieldOutlinedIcon },
      { label: 'Vault', to: '/secrets', icon: LockOutlinedIcon },
      { label: 'Certificates', to: '/certs', icon: VerifiedUserOutlinedIcon },
    ],
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

export function RootLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const clearSession = useAppStore((s) => s.clearSession);

  // App-wide live notifications (captured regardless of the open page).
  useNotificationsSocket();

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  };

  const displayName = user?.displayName || user?.email || 'Account';

  return (
    <>
      {/* ── Top navbar ───────────────────────────────────────────────── */}
      <header className="top-navbar">
        <RouterLink to="/" className="navbar-brand">
          <span className="brand-icon">E</span>
          Exprsn
        </RouterLink>

        <div className="navbar-actions">
          <RealtimeStatus />
          <ThemeToggle />
          <NotificationsBell />

          <div className="user-menu">
            <button type="button" className="user-menu-btn">
              <span className="user-avatar">{initials(displayName)}</span>
              <span className="user-info">
                <span className="user-name">{displayName}</span>
                <span className="user-role">Member</span>
              </span>
            </button>
            <div className="user-menu-dropdown">
              {user && (
                <div className="dropdown-header">
                  <div className="user-name">{user.displayName || user.email}</div>
                  {user.email && <div className="user-email">{user.email}</div>}
                </div>
              )}
              <RouterLink to="/settings" className="dropdown-item">
                <SettingsOutlinedIcon fontSize="small" />
                Settings
              </RouterLink>
              <RouterLink to="/admin" className="dropdown-item">
                <AdminPanelSettingsOutlinedIcon fontSize="small" />
                Admin console
              </RouterLink>
              <div className="dropdown-divider" />
              <button type="button" className="dropdown-item text-danger" onClick={logout}>
                <LogoutOutlinedIcon fontSize="small" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div className="nav-section" key={section.title}>
              <div className="nav-section-title">{section.title}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to;
                return (
                  <div className="nav-item" key={item.to}>
                    <RouterLink to={item.to} className={`nav-link${active ? ' active' : ''}`}>
                      <Icon sx={{ fontSize: '1.125rem', width: 24 }} />
                      <span>{item.label}</span>
                    </RouterLink>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="system-status">
            <span className="status-indicator" />
            <span className="system-status-text">All systems operational</span>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <Box component="main" className="main-content">
        <Outlet />
      </Box>
    </>
  );
}
