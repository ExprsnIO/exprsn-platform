/**
 * Scoped apps panel — lists the low-code apps for a given scope (a Nexus group
 * or an organization) and opens one into the record workspace. Shared by the
 * group Apps tab and the org-admin Apps section so both surfaces stay identical.
 */
import { useState } from 'react';
import {
  Stack, Box, Paper, Typography, Button, TextField, MenuItem, CircularProgress, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lowcodeApi, type ScopeType } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';
import AppWorkspace from './AppWorkspace';
import CreateAppDialog from './CreateAppDialog';

export default function ScopedAppsPanel({ scopeType, scopeId, canEdit }: { scopeType: ScopeType; scopeId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const appsQ = useQuery({
    queryKey: ['lowcode', 'scoped-apps', scopeType, scopeId],
    queryFn: () => lowcodeApi.apps({ scopeType, scopeId }),
  });
  const apps = appsQ.data?.apps ?? [];
  const selected = apps.find((a) => a.id === selectedId) ?? apps[0];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lowcode', 'scoped-apps', scopeType, scopeId] });

  if (appsQ.isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (appsQ.isError) return <Alert severity="error">{toMessage(appsQ.error)}</Alert>;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center">
        {apps.length > 0 && (
          <TextField
            select size="small" label="App" sx={{ minWidth: 220 }}
            value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}
          >
            {apps.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
          </TextField>
        )}
        <Box sx={{ flex: 1 }} />
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>New app</Button>}
      </Stack>

      {!apps.length ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography color="text.secondary">
            {canEdit ? 'No apps here yet. Create one to get started.' : 'No apps have been set up here.'}
          </Typography>
        </Paper>
      ) : selected ? (
        <AppWorkspace app={selected} canEdit={canEdit} />
      ) : null}

      <CreateAppDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        fixedScope={{ scopeType, scopeId }}
        onCreated={(app) => { setCreateOpen(false); setSelectedId(app.id); invalidate(); }}
      />
    </Stack>
  );
}
