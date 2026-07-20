import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, IconButton, Stack, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { authAdminApi, type Session } from '@/api/admin/auth';
import { formatDate } from '@/features/files/util';
import { DataTable, QueryState } from '@/features/admin/ui';

export function SessionsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['auth', 'sessions'], queryFn: authAdminApi.listSessions });
  const revoke = useMutation({
    mutationFn: (s: Session) => authAdminApi.revokeSession(s.id),
    onSuccess: () => {
      onToast('Session revoked');
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Stack spacing={2}>
      <Alert severity="info">Sessions shown are the signed-in admin&apos;s own sessions (the auth API scopes session management to self).</Alert>
      <QueryState query={query} empty="No active sessions.">
        {(d) => (
          <DataTable
            rows={d.sessions ?? d.data ?? []}
            rowKey={(s) => s.id}
            columns={[
              { key: 'ipAddress', header: 'IP', mono: true, render: (s) => s.ipAddress ?? '—' },
              { key: 'userAgent', header: 'User agent', render: (s) => (s.userAgent ?? '—').slice(0, 60) },
              { key: 'lastActivityAt', header: 'Last active', render: (s) => formatDate(s.lastActivityAt) },
              { key: 'current', header: 'Current', render: (s) => (s.current ? 'yes' : '') },
              {
                key: 'revoke',
                header: '',
                align: 'right',
                render: (s) => (
                  <Tooltip title="Revoke">
                    <span>
                      <IconButton size="small" color="error" disabled={!!s.current} onClick={() => revoke.mutate(s)}><DeleteIcon fontSize="small" /></IconButton>
                    </span>
                  </Tooltip>
                ),
              },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}
