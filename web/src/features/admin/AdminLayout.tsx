/**
 * Management console shell. A dedicated surface (its own navbar + sidebar)
 * mounted at /admin, distinct from the consumer app's RootLayout. Reuses the
 * shared auth/session/realtime infra and the Exprsn Unified design-system
 * chrome (see src/styles/exprsn-unified.css) — only the brand and nav differ.
 */
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import WorkspacesOutlinedIcon from '@mui/icons-material/WorkspacesOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LiveTvOutlinedIcon from '@mui/icons-material/LiveTvOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import DynamicFeedOutlinedIcon from '@mui/icons-material/DynamicFeedOutlined';
import CachedOutlinedIcon from '@mui/icons-material/CachedOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import { authApi } from '@/api/auth';
import { useAppStore } from '@/app/store';
import { RealtimeStatus } from '@/app/RealtimeStatus';
import Chip from '@mui/material/Chip';
import { useAdminSocket } from './useAdminSocket';
import { ThemeToggle } from '@/app/ThemeToggle';

interface AdminItem {
  label: string;
  to: string;
  icon: SvgIconComponent;
}
interface AdminCategory {
  label: string;
  items: AdminItem[];
}

/** Always-visible items above the categories. */
const TOP_ITEMS: AdminItem[] = [
  { label: 'Overview', to: '/admin', icon: DashboardOutlinedIcon },
  { label: 'Platform', to: '/admin/platform', icon: TuneOutlinedIcon },
];

/** Collapsible sidebar categories (IA per Rick, 2026-07-17). */
const CATEGORIES: AdminCategory[] = [
  {
    label: 'Infrastructure',
    items: [
      { label: 'Certificate Authority', to: '/admin/ca', icon: VerifiedUserOutlinedIcon },
      { label: 'Authentication', to: '/admin/auth', icon: FingerprintOutlinedIcon },
      { label: 'Groups', to: '/admin/identity-groups', icon: Diversity3OutlinedIcon },
      { label: 'Users', to: '/admin/users', icon: PersonOutlineOutlinedIcon },
      { label: 'Roles', to: '/admin/roles', icon: BadgeOutlinedIcon },
      { label: 'Permissions', to: '/admin/permissions', icon: VpnKeyOutlinedIcon },
      { label: 'Scopes', to: '/admin/scopes', icon: WorkspacesOutlinedIcon },
      { label: 'AT-Protocol', to: '/admin/atproto', icon: HubOutlinedIcon },
      { label: 'AI', to: '/admin/ai', icon: PsychologyOutlinedIcon },
    ],
  },
  {
    label: 'Services',
    items: [
      { label: 'Timeline', to: '/admin/timeline', icon: DynamicFeedOutlinedIcon },
      { label: 'Groups', to: '/admin/nexus', icon: GroupsOutlinedIcon },
      { label: 'Live', to: '/admin/live', icon: LiveTvOutlinedIcon },
      { label: 'Vault', to: '/admin/vault', icon: LockOutlinedIcon },
      { label: 'File Vault', to: '/admin/filevault', icon: FolderOutlinedIcon },
      { label: 'Spark', to: '/admin/spark', icon: ChatBubbleOutlineOutlinedIcon },
      { label: 'Jobs & Queues', to: '/admin/jobs', icon: LayersOutlinedIcon },
      { label: 'Prefetch', to: '/admin/prefetch', icon: CachedOutlinedIcon },
    ],
  },
  {
    label: 'Applications',
    items: [
      { label: 'Low-Code', to: '/admin/lowcode', icon: AccountTreeOutlinedIcon },
      { label: 'Cortex', to: '/admin/cortex', icon: SmartToyOutlinedIcon },
      { label: 'Plugins', to: '/admin/plugins', icon: ExtensionOutlinedIcon },
      { label: 'Moderation', to: '/admin/moderator', icon: ShieldOutlinedIcon },
    ],
  },
];

const NAV_PREFS_KEY = 'admin.nav.collapsed';

function loadCollapsed(): string[] {
  try {
    const stored = localStorage.getItem(NAV_PREFS_KEY);
    if (stored) return JSON.parse(stored) as string[];
  } catch { /* ignore storage failures */ }
  return [];
}

function isItemActive(to: string, pathname: string): boolean {
  return to === '/admin'
    ? pathname === '/admin'
    : pathname === to || pathname.startsWith(`${to}/`);
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'A';
}

/** Connection state of the /_admin live stream (health + config events). */
function AdminLiveChip() {
  const { state } = useAdminSocket();
  return (
    <Chip
      size="small"
      variant="outlined"
      color={state === 'connected' ? 'success' : 'warning'}
      label={state === 'connected' ? 'Admin live' : 'Admin polling'}
      sx={{ mr: 1 }}
    />
  );
}

/** One sidebar link (shared by top-level items and category children). */
function NavLinkItem({ item, pathname }: { item: AdminItem; pathname: string }) {
  const Icon = item.icon;
  const active = isItemActive(item.to, pathname);
  return (
    <div className="nav-item">
      <RouterLink to={item.to} className={`nav-link${active ? ' active' : ''}`}>
        <Icon sx={{ fontSize: '1.125rem', width: 24 }} />
        <span>{item.label}</span>
      </RouterLink>
    </div>
  );
}

export function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const clearSession = useAppStore((s) => s.clearSession);
  const [collapsed, setCollapsed] = useState<string[]>(loadCollapsed);

  const toggleCategory = (label: string) => {
    setCollapsed((cur) => {
      const next = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label];
      try { localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

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
          <AdminLiveChip />
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
            {TOP_ITEMS.map((item) => (
              <NavLinkItem key={item.to} item={item} pathname={pathname} />
            ))}
          </div>
          {CATEGORIES.map((cat) => {
            const containsActive = cat.items.some((i) => isItemActive(i.to, pathname));
            // A category holding the active route is always open.
            const open = containsActive || !collapsed.includes(cat.label);
            return (
              <div className="nav-section" key={cat.label}>
                <button
                  type="button"
                  className="nav-section-title"
                  onClick={() => toggleCategory(cat.label)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                    textTransform: 'inherit',
                    letterSpacing: 'inherit',
                  }}
                  aria-expanded={open}
                >
                  <span>{cat.label}</span>
                  <ExpandMoreIcon
                    sx={{
                      fontSize: '1rem',
                      transition: 'transform 120ms',
                      transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                      opacity: 0.6,
                    }}
                  />
                </button>
                <Collapse in={open} timeout={120}>
                  {cat.items.map((item) => (
                    <NavLinkItem key={item.to} item={item} pathname={pathname} />
                  ))}
                </Collapse>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <Box component="main" className="main-content" sx={{ minWidth: 0 }}>
        <Outlet />
      </Box>
    </>
  );
}
