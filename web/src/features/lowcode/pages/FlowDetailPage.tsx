/**
 * Flow detail page (dedicated route, admin console). Full WYSIWYG canvas + node
 * inspector editor for a low-code flow, plus a danger zone (delete). Serves the
 * "new flow" flow via :id === 'new' with an app picker.
 */
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Breadcrumbs, Button, Divider, Link, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { lowcodeAdminApi, type Flow } from '@/api/admin/lowcode';
import { Card, Loading, SectionHeader, useToast } from '@/features/admin/ui';
import { LowcodeFlowEditor } from '../flow/LowcodeFlowEditor';
import { ConfirmDangerDialog } from '../ConfirmDangerDialog';

export function FlowDetailPage() {
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast, showError, ToastHost } = useToast();
  const [newAppId, setNewAppId] = useState(sp.get('appId') ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const appsQ = useQuery({ queryKey: ['lowcode', 'apps'], queryFn: lowcodeAdminApi.apps, enabled: isNew });
  const flowQ = useQuery({ queryKey: ['lowcode', 'flow', id], queryFn: () => lowcodeAdminApi.getFlow(id), enabled: !isNew });
  const flow = flowQ.data?.flow ?? null;
  const appId = isNew ? newAppId : flow?.appId ?? '';

  const appQ = useQuery({ queryKey: ['lowcode', 'app', appId], queryFn: () => lowcodeAdminApi.getApp(appId), enabled: !!appId });
  const entitiesQ = useQuery({ queryKey: ['lowcode', 'entities'], queryFn: lowcodeAdminApi.entities });
  const siblings = useMemo(() => (entitiesQ.data?.entities ?? []).filter((e) => e.appId === appId), [entitiesQ.data, appId]);

  const save = useMutation({
    mutationFn: (payload: Partial<Flow>) => (isNew ? lowcodeAdminApi.createFlow(payload) : lowcodeAdminApi.updateFlow(id, payload)),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lowcode', 'flows'] });
      qc.invalidateQueries({ queryKey: ['lowcode', 'flow', id] });
      showToast(isNew ? 'Flow created' : 'Flow saved', 'success');
      if (isNew) navigate(`/admin/lowcode/flows/${res.flow.id}`);
    },
    onError: showError,
  });
  const del = useMutation({
    mutationFn: () => lowcodeAdminApi.deleteFlow(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lowcode', 'flows'] }); showToast('Flow deleted', 'success'); navigate('/admin/lowcode?tab=flows'); },
    onError: showError,
  });

  if (!isNew && flowQ.isLoading) return <Loading />;
  if (!isNew && flowQ.isError) return <Alert severity="error">Flow not found.</Alert>;

  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <Breadcrumbs>
        <Link component={RouterLink} to="/admin/lowcode?tab=flows" underline="hover">Low-Code</Link>
        <Typography color="text.primary">{isNew ? 'New flow' : flow?.name}</Typography>
      </Breadcrumbs>
      <SectionHeader title={isNew ? 'New flow' : `${flow?.name} · flow`} subtitle={isNew ? 'Event-driven automation' : `${flow?.key} — ${appQ.data?.app.name ?? ''}`} />

      {isNew && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <TextField select label="App" size="small" value={newAppId} onChange={(e) => setNewAppId(e.target.value)} sx={{ minWidth: 280 }}>
            <MenuItem value=""><em>choose app…</em></MenuItem>
            {(appsQ.data?.apps ?? []).map((a) => <MenuItem key={a.id} value={a.id}>{a.name} ({a.key})</MenuItem>)}
          </TextField>
        </Paper>
      )}

      {(!isNew || appId) && (
        <Card title="Flow">
          <LowcodeFlowEditor
            flow={flow}
            appId={appId}
            entities={siblings}
            busy={save.isPending}
            onCancel={() => navigate('/admin/lowcode?tab=flows')}
            onSave={(payload) => save.mutate(payload)}
          />
        </Card>
      )}

      {!isNew && flow && (
        <Card title="Danger zone">
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }} />
            <Button color="error" variant="contained" onClick={() => setDeleteOpen(true)}>Delete flow</Button>
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary">Deleting a flow stops its automation immediately.</Typography>
        </Card>
      )}

      <ConfirmDangerDialog
        open={deleteOpen}
        title={`Delete ${flow?.name ?? 'flow'}`}
        description="This permanently deletes the flow and stops its automation."
        confirmPhrase={flow?.key ?? ''}
        confirmLabel="Delete flow"
        busy={del.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => del.mutate()}
      />
      {ToastHost}
    </Stack>
  );
}
