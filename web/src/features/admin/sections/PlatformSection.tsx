/**
 * Platform section (TASK-039) — the env-level config-overrides store.
 * One table of every overridable key (search/sort/filter come from DataTable
 * defaults); row click opens a typed editor bound to the key's descriptor
 * metadata (boolean → switch, int → number field, enum → select). Restart-
 * required keys surface a persistent banner while any override is pending.
 * Live: config:changed events invalidate the query via useAdminSocket.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { platformAdminApi, PlatformConfigKey } from '@/api/admin/platform';
import { Card, DataTable, QueryState, SectionHeader, StatusChip, useToast } from '../ui';
import { useAdminSocket } from '../useAdminSocket';

const QUERY_KEY = ['admin', 'platform-config'];

function EditDialog({
  row,
  onClose,
}: {
  row: PlatformConfigKey;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast, showError, ToastHost } = useToast();
  const [value, setValue] = useState<string>(() => {
    if (row.override?.value != null && !row.isSecret) return row.override.value;
    if (row.effectiveValue != null && !row.isSecret) return row.effectiveValue;
    return row.type === 'boolean' ? 'false' : '';
  });

  const save = useMutation({
    mutationFn: () => platformAdminApi.set(row.key, value, row.override?.version),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showToast(
        res.pendingRestart ? `${row.key} saved — restart required to apply` : `${row.key} applied`,
        res.pendingRestart ? 'warning' : 'success',
      );
      onClose();
    },
    onError: showError,
  });
  const revert = useMutation({
    mutationFn: () => platformAdminApi.remove(row.key),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showToast(
        res.pendingRestart
          ? `${row.key} override removed — restart required to revert`
          : `${row.key} reverted to environment value`,
        res.pendingRestart ? 'warning' : 'success',
      );
      onClose();
    },
    onError: showError,
  });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontFamily: 'monospace', fontSize: 16 }}>{row.key}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {row.description}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip size="small" label={row.module} />
            <Chip size="small" label={row.type} variant="outlined" />
            {row.restartRequired && (
              <Chip size="small" color="warning" icon={<RestartAltIcon />} label="restart required" />
            )}
          </Stack>
          {row.type === 'boolean' ? (
            <FormControlLabel
              control={
                <Switch
                  checked={value === 'true'}
                  onChange={(e) => setValue(e.target.checked ? 'true' : 'false')}
                />
              }
              label={value === 'true' ? 'Enabled' : 'Disabled'}
            />
          ) : row.type === 'int' ? (
            <TextField
              label="Value"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              fullWidth
            />
          ) : (
            <TextField
              label="Value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              fullWidth
              select={row.type === 'enum'}
            >
              {row.type === 'enum' &&
                (row.values ?? []).map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
            </TextField>
          )}
          <Typography variant="caption" color="text.secondary">
            Source: {row.source}
            {row.override
              ? ` — overridden by ${row.override.updatedBy ?? 'unknown'} at ${new Date(row.override.updatedAt).toLocaleString()}`
              : ' (no override stored)'}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        {row.override && (
          <Button color="warning" onClick={() => revert.mutate()} disabled={revert.isPending}>
            Remove override
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
      </DialogActions>
      {ToastHost}
    </Dialog>
  );
}

/**
 * Reusable, optionally module-filtered view of the overrides store. The
 * Platform section renders it unfiltered; module sections (filevault, atproto)
 * embed it filtered so their env-level settings are editable in place.
 */
export function PlatformConfigPanel({ module }: { module?: string }) {
  const { state: socketState } = useAdminSocket();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: platformAdminApi.list,
    // Socket invalidation is primary; polling is the fallback.
    refetchInterval: socketState === 'connected' ? false : 30_000,
  });
  const [editing, setEditing] = useState<PlatformConfigKey | null>(null);

  const rows = useMemo(
    () => (query.data?.keys ?? []).filter((k) => !module || k.module === module),
    [query.data, module],
  );
  const pendingRestart = useMemo(() => rows.filter((k) => k.pendingRestart), [rows]);
  const anomalies = module ? [] : (query.data?.anomalies ?? []);

  return (
    <Stack spacing={2}>
      {pendingRestart.length > 0 && (
        <Alert severity="warning" icon={<RestartAltIcon />}>
          {pendingRestart.length} setting{pendingRestart.length > 1 ? 's' : ''} awaiting a gateway
          restart: {pendingRestart.map((k) => k.key).join(', ')}
        </Alert>
      )}
      <QueryState query={query}>
        {() => (
          <>
            <Card title={`Overridable settings (${rows.length})`}>
              <DataTable
                tableId={module ? `platform-config-${module}` : 'platform-config'}
                rows={rows}
                rowKey={(r) => r.key}
                onRowClick={(r) => setEditing(r)}
                initialSort={{ key: 'module', dir: 'asc' }}
                columns={[
                  { key: 'key', header: 'Key', mono: true },
                  { key: 'module', header: 'Module' },
                  { key: 'type', header: 'Type' },
                  {
                    key: 'effectiveValue',
                    header: 'Effective value',
                    mono: true,
                    render: (r) => (r.isSecret ? '••••' : (r.effectiveValue ?? '—')),
                  },
                  {
                    key: 'source',
                    header: 'Source',
                    render: (r) => <StatusChip status={r.source} />,
                  },
                  {
                    key: 'restartRequired',
                    header: 'Apply',
                    filterValue: (r) => (r.restartRequired ? 'restart' : 'hot'),
                    render: (r) =>
                      r.pendingRestart ? (
                        <Chip size="small" color="warning" label="pending restart" />
                      ) : r.restartRequired ? (
                        <Chip size="small" variant="outlined" label="restart" />
                      ) : (
                        <Chip size="small" variant="outlined" color="success" label="hot" />
                      ),
                  },
                  {
                    key: 'updatedBy',
                    header: 'Overridden by',
                    sortValue: (r) => r.override?.updatedAt ?? null,
                    render: (r) => r.override?.updatedBy ?? '—',
                  },
                  { key: 'description', header: 'Description', defaultHidden: true },
                ]}
              />
            </Card>
            {anomalies.length > 0 && (
              <Alert severity="error">
                Anomalous override rows ignored at boot:{' '}
                {anomalies.map((a) => `${a.key} (${a.reason})`).join('; ')}
              </Alert>
            )}
          </>
        )}
      </QueryState>
      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}

export default function PlatformSection() {
  return (
    <Stack spacing={2}>
      <SectionHeader
        title="Platform"
        subtitle="Environment-level settings with database overrides — the code-side descriptor governs what is overridable"
      />
      <PlatformConfigPanel />
    </Stack>
  );
}
