import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { accountApi } from '@/api/account';
import { toMessage } from '@/lib/errors';

/** Active sessions: list, revoke individually, or sign out everywhere else. */
export function SessionsList() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: accountApi.listSessions,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });

  const revokeOne = useMutation({ mutationFn: accountApi.revokeSession, onSuccess: invalidate });
  const revokeOthers = useMutation({ mutationFn: accountApi.revokeOtherSessions, onSuccess: invalidate });

  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">{toMessage(error)}</Alert>;

  const sessions = data!.sessions;
  const mutationError = revokeOne.error || revokeOthers.error;
  const hasOthers = sessions.some((s) => !s.isCurrent);

  return (
    <Stack spacing={2} sx={{ maxWidth: 800 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="h6">Active sessions</Typography>
        <Button
          size="small"
          variant="outlined"
          color="error"
          disabled={!hasOthers || revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          Sign out other sessions
        </Button>
      </Stack>

      {mutationError && <Alert severity="error">{toMessage(mutationError)}</Alert>}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>IP address</TableCell>
              <TableCell>Device</TableCell>
              <TableCell>Last active</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.ipAddress || '—'}</TableCell>
                <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.userAgent || '—'}
                </TableCell>
                <TableCell>{s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleString() : '—'}</TableCell>
                <TableCell align="right">
                  {s.isCurrent ? (
                    <Chip size="small" color="primary" label="This device" />
                  ) : (
                    <Button
                      size="small"
                      color="error"
                      disabled={revokeOne.isPending}
                      onClick={() => revokeOne.mutate(s.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
