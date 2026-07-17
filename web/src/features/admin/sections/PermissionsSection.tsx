import { Stack } from '@mui/material';
import { SectionHeader, useToast } from '../ui';
import { PermissionCatalog } from './auth/PermissionCatalog';

/** Standalone Permissions admin — the per-service permission catalog + create flow. */
export function PermissionsSection() {
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Permissions" subtitle="Permission catalog by service — /auth/api/roles/permissions" />
      <PermissionCatalog onToast={showToast} />
      {ToastHost}
    </Stack>
  );
}
