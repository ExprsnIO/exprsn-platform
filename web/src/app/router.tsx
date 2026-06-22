import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { HealthPage } from '@/features/health/HealthPage';
import { AccountPage } from '@/features/account/AccountPage';
import { MessagesPage } from '@/features/messages/MessagesPage';
import { TimelinePage } from '@/features/timeline/TimelinePage';
import { NotificationsPage } from '@/features/moderation/NotificationsPage';
import { FilesPage } from '@/features/files/FilesPage';
import { GroupsPage } from '@/features/groups/GroupsPage';
import { SecretsPage } from '@/features/secrets/SecretsPage';
import { CaAdminPage } from '@/features/certs/CaAdminPage';
import { StreamsPage } from '@/features/streams/StreamsPage';
import { PlaceholderPage } from '@/features/PlaceholderPage';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { DashboardPage } from '@/features/admin/DashboardPage';
import { CaSection } from '@/features/admin/sections/CaSection';
import { AuthSection } from '@/features/admin/sections/AuthSection';
import { JobsSection } from '@/features/admin/sections/JobsSection';
import { NexusSection } from '@/features/admin/sections/NexusSection';
import { LiveSection } from '@/features/admin/sections/LiveSection';
import { VaultSection } from '@/features/admin/sections/VaultSection';
import { ModeratorSection } from '@/features/admin/sections/ModeratorSection';
import { SparkSection } from '@/features/admin/sections/SparkSection';
import { FilevaultSection } from '@/features/admin/sections/FilevaultSection';
import { LoginPage } from '@/auth/LoginPage';
import { SsoCallbackPage } from '@/auth/SsoCallbackPage';
import { RequireAuth } from '@/auth/RequireAuth';

// Public auth routes + guarded app shell. Session status is resolved by
// AuthGate (see main.tsx) before any guard runs.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/sso/callback', element: <SsoCallbackPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <RootLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HealthPage /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: 'feed', element: <TimelinePage /> },
      { path: 'files', element: <FilesPage /> },
      { path: 'groups', element: <GroupsPage /> },
      { path: 'streams', element: <StreamsPage /> },
      { path: 'moderation', element: <NotificationsPage /> },
      { path: 'secrets', element: <SecretsPage /> },
      { path: 'certs', element: <CaAdminPage /> },
      { path: 'settings', element: <AccountPage /> },
      { path: '*', element: <PlaceholderPage title="Not found" /> },
    ],
  },
  {
    // Dedicated management console — its own shell (AdminLayout), same guard.
    path: '/admin',
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'ca', element: <CaSection /> },
      { path: 'auth', element: <AuthSection /> },
      { path: 'jobs', element: <JobsSection /> },
      { path: 'nexus', element: <NexusSection /> },
      { path: 'live', element: <LiveSection /> },
      { path: 'vault', element: <VaultSection /> },
      { path: 'moderator', element: <ModeratorSection /> },
      { path: 'spark', element: <SparkSection /> },
      { path: 'filevault', element: <FilevaultSection /> },
    ],
  },
]);
