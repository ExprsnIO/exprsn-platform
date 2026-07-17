import { Stack } from '@mui/material';
import { SectionHeader, useToast } from '../ui';
import { GroupsTab } from './auth/GroupsTab';

/**
 * Standalone identity-groups admin — auth (identity) groups with base
 * R/W/A/U/D permissions and the advanced create flow (templates, org scope,
 * parent group, role bindings).
 */
export function IdentityGroupsSection() {
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Identity Groups" subtitle="Auth identity groups — base permissions & role bindings — /auth/api/groups" />
      <GroupsTab onToast={showToast} />
      {ToastHost}
    </Stack>
  );
}
