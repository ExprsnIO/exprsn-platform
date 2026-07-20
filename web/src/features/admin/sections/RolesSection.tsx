import { Stack } from '@mui/material';
import { SectionHeader, useToast } from '../ui';
import { RolesTab } from './auth/RolesTab';

/**
 * Standalone Roles admin — role table, role inspector (definition, user
 * assignments, group bindings) and the create-role flow. The permission
 * catalog lives in its own Permissions section.
 */
export function RolesSection() {
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Roles" subtitle="Role definitions, user assignments & group bindings — /auth/api/roles" />
      <RolesTab onToast={showToast} />
      {ToastHost}
    </Stack>
  );
}
