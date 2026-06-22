/**
 * Management console shell. A dedicated surface (its own navbar + sidebar)
 * mounted at /admin, distinct from the consumer app's RootLayout. Reuses the
 * shared auth/session/realtime infra and the Exprsn Unified design-system
 * chrome (see src/styles/exprsn-unified.css) — only the brand and nav differ.
 */
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LiveTvOutlinedIcon from '@mui/icons-material/LiveTvOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import { authApi } from '@/api/auth';
import { useAppStore } from '@/app/store';
import { RealtimeStatus } from '@/app/RealtimeStatus';
import { ThemeToggle } from '@/app/ThemeToggle';

interface AdminItem {
  label: string;
  to: string;
  icon: SvgIconComponent;
}
const SECTIONS: AdminItem[] = [
  { label: 'Overview', to: '/admin', icon: DashboardOutlinedIcon },
  { label: 'Certificate Authority', to: '/admin/ca', icon: VerifiedUserOutlinedIcon },
  { label: 'Auth & Identity', to: '/admin/auth', icon: FingerprintOutlinedIcon },
  { label: 'Jobs & Queues', to: '/admin/jobs', icon: LayersOutlinedIcon },
  { label: 'Groups (Nexus)', to: '/admin/nexus', icon: GroupsOutlinedIcon },
  { label: 'Live Streaming', to: '/admin/live', icon: LiveTvOutlinedIcon },
  { label: 'Vault', to: '/admin/vault', icon: LockOutlinedIcon },
  { label: 'Moderation', to: '/admin/moderator', icon: ShieldOutlinedIcon },
  { label: 'Messaging (Spark)', to: '/admin/spark', icon: ChatBubbleOutlineOutlinedIcon },
  { label: 'Files (FileVault)', to: '/admin/filevault', icon: FolderOutlinedIcon },
];

function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'A';
}

export function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const clearSession = useAppStore((s) => s.clearSession);

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  };

  const displayName = user?.displayName || user?.email || 'Admin';

  return (
    <>
      {/* ── Top navbar ───────────────────────────────────────────────── */}
      <header className="top-navbar">
        <RouterLink to="/admin" className="navbar-brand">
          <span className="brand-icon">E</span>
          Exprsn <Box component="span" sx={{ color: 'var(--exprsn-text-muted)', fontWeight: 600 }}>Admin</Box>
        </RouterLink>

        <div className="navbar-actions">
          <RealtimeStatus />
          <ThemeToggle />

          <div className="user-menu">
            <button type="button" className="user-menu-btn">
              <span className="user-avatar">{initials(displayName)}</span>
              <span className="user-info">
                <span className="user-name">{displayName}</span>
                <span className="user-role">Administrator</span>
              </span>
            </button>
            <div className="user-menu-dropdown">
              {user && (
                <div className="dropdown-header">
                  <div className="user-name">{user.displayName || user.email}</div>
                  {user.email && <div className="user-email">{user.email}</div>}
                </div>
              )}
              <RouterLink to="/" className="dropdown-item">
                <ArrowBackOutlinedIcon fontSize="small" />
                Back to app
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
          <div className="nav-section">
            <div className="nav-section-title">Management</div>
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const active =
                item.to === '/admin'
                  ? pathname === '/admin'
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);
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
        </nav>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <Box component="main" className="main-content" sx={{ minWidth: 0 }}>
        <Outlet />
      </Box>
    </>
  );
}
