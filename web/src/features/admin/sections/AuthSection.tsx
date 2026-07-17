import { useState } from 'react';
import { Stack, Tab, Tabs } from '@mui/material';
import { SectionHeader, useToast } from '../ui';
import { type AuthTab } from './auth/shared';
import { OrganizationsTab } from './auth/OrganizationsTab';
import { UsersTab } from './auth/UsersTab';
import { GroupsTab } from './auth/GroupsTab';
import { RolesTab } from './auth/RolesTab';
import { SessionsTab } from './auth/SessionsTab';
import { DirectoryTab } from './auth/DirectoryTab';

/** Auth & Identity admin — organizations, users, groups, roles, sessions, directory. */
export function AuthSection() {
  const [tab, setTab] = useState<AuthTab>('orgs');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Auth & Identity" subtitle="Organizations, users, groups, roles & permissions, sessions — /auth/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="orgs" label="Organizations" />
        <Tab value="users" label="Users" />
        <Tab value="groups" label="Groups" />
        <Tab value="roles" label="Roles & Permissions" />
        <Tab value="sessions" label="Sessions" />
        <Tab value="directory" label="Directory" />
      </Tabs>
      {tab === 'orgs' && <OrganizationsTab onToast={showToast} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'groups' && <GroupsTab onToast={showToast} />}
      {tab === 'roles' && <RolesTab onToast={showToast} />}
      {tab === 'sessions' && <SessionsTab onToast={showToast} />}
      {tab === 'directory' && <DirectoryTab onToast={showToast} onNavigate={setTab} />}
      {ToastHost}
    </Stack>
  );
}
