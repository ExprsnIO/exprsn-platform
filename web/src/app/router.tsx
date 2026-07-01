import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { HealthPage } from '@/features/health/HealthPage';
import { AccountPage } from '@/features/account/AccountPage';
import { MessagesPage } from '@/features/messages/MessagesPage';
import { TimelinePage } from '@/features/timeline/TimelinePage';
import { PostDetailPage } from '@/features/timeline/PostDetailPage';
import { BookmarksPage } from '@/features/timeline/BookmarksPage';
import { SearchPage } from '@/features/timeline/SearchPage';
import { NotificationsPage } from '@/features/moderation/NotificationsPage';
import { FilesPage } from '@/features/files/FilesPage';
import { SharePage } from '@/features/files/SharePage';
import { GroupsPage } from '@/features/groups/GroupsPage';
import { GroupDetailPage } from '@/features/groups/GroupDetailPage';
import { PeoplePage } from '@/features/people/PeoplePage';
import { ProfilePage } from '@/features/people/ProfilePage';
import { SecretsPage } from '@/features/secrets/SecretsPage';
import { CaAdminPage } from '@/features/certs/CaAdminPage';
import { StreamsPage } from '@/features/streams/StreamsPage';
import { WatchPage } from '@/features/streams/WatchPage';
import { RoomsPage } from '@/features/rooms/RoomsPage';
import { AppsPage } from '@/features/apps/AppsPage';
import { OrgsPage } from '@/features/orgs/OrgsPage';
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
import { AtprotoSection } from '@/features/admin/sections/AtprotoSection';
import { SparkSection } from '@/features/admin/sections/SparkSection';
import { FilevaultSection } from '@/features/admin/sections/FilevaultSection';
import { PluginsSection } from '@/features/admin/sections/PluginsSection';
import { LowcodeSection } from '@/features/admin/sections/LowcodeSection';
import { LoginPage } from '@/auth/LoginPage';
import { SsoCallbackPage } from '@/auth/SsoCallbackPage';
import { RequireAuth } from '@/auth/RequireAuth';
import { RequireAdmin } from '@/auth/RequireAdmin';

// Public auth routes + guarded app shell. Session status is resolved by
// AuthGate (see main.tsx) before any guard runs.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorBoundary /> },
  { path: '/sso/callback', element: <SsoCallbackPage />, errorElement: <RouteErrorBoundary /> },
  // Public share landing — anonymous visitors, no app shell / auth guard.
  { path: '/s/:shareLinkId', element: <SharePage />, errorElement: <RouteErrorBoundary /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <RootLayout />
      </RequireAuth>
    ),
    // Backstop: catches a crash in the shell/guard itself (full-page error).
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        // Pathless wrapper: a crash in any page renders here — inside the
        // RootLayout Outlet — so the nav/shell stays mounted.
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <HealthPage /> },
          { path: 'messages', element: <MessagesPage /> },
          { path: 'feed', element: <TimelinePage /> },
          { path: 'feed/:id', element: <PostDetailPage /> },
          { path: 'bookmarks', element: <BookmarksPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'files', element: <FilesPage /> },
          { path: 'groups', element: <GroupsPage /> },
          { path: 'groups/:id', element: <GroupDetailPage /> },
          { path: 'apps', element: <AppsPage /> },
          { path: 'orgs', element: <OrgsPage /> },
          { path: 'people', element: <PeoplePage /> },
          { path: 'people/:id', element: <ProfilePage /> },
          { path: 'streams', element: <StreamsPage /> },
          { path: 'streams/watch/:id', element: <WatchPage /> },
          { path: 'rooms', element: <RoomsPage /> },
          { path: 'moderation', element: <NotificationsPage /> },
          { path: 'secrets', element: <SecretsPage /> },
          { path: 'certs', element: <CaAdminPage /> },
          { path: 'settings', element: <AccountPage /> },
          { path: '*', element: <PlaceholderPage title="Not found" /> },
        ],
      },
    ],
  },
  {
    // Dedicated management console — its own shell (AdminLayout), same guard.
    path: '/admin',
    element: (
      <RequireAuth>
        <RequireAdmin>
          <AdminLayout />
        </RequireAdmin>
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'ca', element: <CaSection /> },
          { path: 'auth', element: <AuthSection /> },
          { path: 'jobs', element: <JobsSection /> },
          { path: 'nexus', element: <NexusSection /> },
          { path: 'live', element: <LiveSection /> },
          { path: 'vault', element: <VaultSection /> },
          { path: 'moderator', element: <ModeratorSection /> },
          { path: 'atproto', element: <AtprotoSection /> },
          { path: 'spark', element: <SparkSection /> },
          { path: 'filevault', element: <FilevaultSection /> },
          { path: 'plugins', element: <PluginsSection /> },
          { path: 'lowcode', element: <LowcodeSection /> },
        ],
      },
    ],
  },
]);
