import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, CircularProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { accountApi } from '@/api/account';
import { toMessage } from '@/lib/errors';
import { ProfileForm } from './ProfileForm';
import { SecuritySection } from './SecuritySection';
import { SessionsList } from './SessionsList';
import { UserDids } from './UserDids';

/**
 * Phase 4a — Account settings. Loads the rich identity once (`GET /auth/api/auth/me`)
 * and hosts three tabs: Profile, Security (password + MFA), and Sessions.
 */
export function AccountPage() {
  const [tab, setTab] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: accountApi.me,
  });

  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">{toMessage(error)}</Alert>;

  const user = data!.user;

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Account settings</Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Profile" />
          <Tab label="Security" />
          <Tab label="Sessions" />
          <Tab label="Identity" />
        </Tabs>
      </Box>

      {tab === 0 && <ProfileForm user={user} />}
      {tab === 1 && <SecuritySection />}
      {tab === 2 && <SessionsList />}
      {tab === 3 && <UserDids userId={user.id} />}
    </Stack>
  );
}
