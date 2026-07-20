import { Stack } from '@mui/material';
import { SectionHeader } from '../ui';
import { UsersTab } from './auth/UsersTab';

/** Standalone Users admin — searchable user list + full user inspector. */
export function UsersSection() {
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Users" subtitle="Platform user directory — profile, orgs, groups, roles, sessions — /auth/api" />
      <UsersTab />
    </Stack>
  );
}
