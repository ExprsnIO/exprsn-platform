import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stack, Tab, Tabs } from '@mui/material';
import { SectionHeader, useToast } from '../ui';
import { type AuthTab } from './auth/shared';
import { OrganizationsTab } from './auth/OrganizationsTab';
import { SessionsTab } from './auth/SessionsTab';
import { DirectoryTab } from './auth/DirectoryTab';

/**
 * Authentication admin — directory overview, organizations, sessions.
 * Users / identity groups / roles / permissions were promoted to standalone
 * sections (UsersSection, IdentityGroupsSection, RolesSection,
 * PermissionsSection, ScopesSection) in the Infrastructure IA.
 */
export function AuthSection() {
  const [tab, setTab] = useState<AuthTab>('directory');
  const navigate = useNavigate();
  const { showToast, ToastHost } = useToast();

  // DirectoryTab still navigates by AuthTab name; identity-domain tabs now
  // live at their own routes, so map those to router navigation.
  const goTo = (t: AuthTab) => {
    if (t === 'users') navigate('/admin/users');
    else if (t === 'groups') navigate('/admin/identity-groups');
    else if (t === 'roles') navigate('/admin/roles');
    else setTab(t);
  };

  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Authentication" subtitle="Directory, organizations, sessions — /auth/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="directory" label="Directory" />
        <Tab value="orgs" label="Organizations" />
        <Tab value="sessions" label="Sessions" />
      </Tabs>
      {tab === 'directory' && <DirectoryTab onToast={showToast} onNavigate={goTo} />}
      {tab === 'orgs' && <OrganizationsTab onToast={showToast} />}
      {tab === 'sessions' && <SessionsTab onToast={showToast} />}
      {ToastHost}
    </Stack>
  );
}
