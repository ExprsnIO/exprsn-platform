import { useQuery } from '@tanstack/react-query';
import {
  Alert,
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
import { getHealth } from '@/api/platform';
import { ApiError } from '@/lib/http';

/**
 * Phase 1 deliverable: proves the SPA reaches the gateway through the dev proxy
 * (or the nginx edge in prod) by rendering /health and every mounted module.
 */
export function HealthPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 15_000,
  });

  if (isLoading) return <CircularProgress />;

  if (error) {
    const cid = error instanceof ApiError ? error.correlationId : undefined;
    return (
      <Alert severity="error">
        Failed to reach the gateway: {(error as Error).message}
        {cid ? ` (correlation ${cid})` : ''}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="h5">Platform health</Typography>
        <Chip
          color={data?.status === 'ok' ? 'success' : 'warning'}
          label={`${data?.service} · ${data?.status} · ${data?.env}`}
        />
      </Stack>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Module</TableCell>
              <TableCell>Prefix</TableCell>
              <TableCell>Mounted</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.modules.map((m) => (
              <TableRow key={m.name}>
                <TableCell>{m.name}</TableCell>
                <TableCell>
                  <code>{m.prefix}</code>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={m.mounted ? 'success' : 'default'}
                    label={m.mounted ? 'yes' : 'no'}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
