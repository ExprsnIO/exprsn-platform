/**
 * Entity detail page (dedicated route, admin console). Full structured editor for
 * an entity's schema + state machine + storage, a records browser, and a danger
 * zone (export / truncate / delete). Also serves the "new entity" flow via the
 * :id === 'new' sentinel with an app picker.
 */
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Breadcrumbs, Button, Divider, Link, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { lowcodeAdminApi, type Entity } from '@/api/admin/lowcode';
import { Card, Loading, SectionHeader, useToast } from '@/features/admin/ui';
import { EntityEditor } from '../EntityEditor';
import { RecordsPanel } from '../RecordsPanel';
import { ConfirmDangerDialog } from '../ConfirmDangerDialog';

export function EntityDetailPage() {
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast, showError, ToastHost } = useToast();
  const [newAppId, setNewAppId] = useState(sp.get('appId') ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const appsQ = useQuery({ queryKey: ['lowcode', 'apps'], queryFn: lowcodeAdminApi.apps, enabled: isNew });
  const entityQ = useQuery({ queryKey: ['lowcode', 'entity', id], queryFn: () => lowcodeAdminApi.getEntity(id), enabled: !isNew });
  const entity = entityQ.data?.entity ?? null;
  const appId = isNew ? newAppId : entity?.appId ?? '';

  const appQ = useQuery({ queryKey: ['lowcode', 'app', appId], queryFn: () => lowcodeAdminApi.getApp(appId), enabled: !!appId });
  const entitiesQ = useQuery({ queryKey: ['lowcode', 'entities'], queryFn: lowcodeAdminApi.entities });
  const lookupsQ = useQuery({ queryKey: ['lowcode', 'lookups'], queryFn: lowcodeAdminApi.lookups });

  const siblings = useMemo(() => (entitiesQ.data?.entities ?? []).filter((e) => e.appId === appId), [entitiesQ.data, appId]);
  const lookups = useMemo(() => (lookupsQ.data?.lookups ?? []).filter((l) => l.appId === appId || l.appId == null), [lookupsQ.data, appId]);

  const save = useMutation({
    mutationFn: (payload: Partial<Entity>) => (isNew ? lowcodeAdminApi.createEntity(payload) : lowcodeAdminApi.updateEntity(id, payload)),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lowcode', 'entities'] });
      qc.invalidateQueries({ queryKey: ['lowcode', 'entity', id] });
      showToast(isNew ? 'Entity created' : 'Entity saved', 'success');
      if (isNew) navigate(`/admin/lowcode/entities/${res.entity.id}`);
    },
    onError: showError,
  });
  const del = useMutation({
    mutationFn: () => lowcodeAdminApi.deleteEntity(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lowcode', 'entities'] }); showToast('Entity deleted', 'success'); navigate('/admin/lowcode?tab=entities'); },
    onError: showError,
  });
  const exportE = useMutation({ mutationFn: () => lowcodeAdminApi.exportEntity(id), onSuccess: () => showToast('Export written to FileVault', 'success'), onError: showError });

  if (!isNew && entityQ.isLoading) return <Loading />;
  if (!isNew && entityQ.isError) return <Alert severity="error">Entity not found.</Alert>;

  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <Breadcrumbs>
        <Link component={RouterLink} to="/admin/lowcode?tab=entities" underline="hover">Low-Code</Link>
        <Typography color="text.primary">{isNew ? 'New entity' : entity?.name}</Typography>
      </Breadcrumbs>
      <SectionHeader title={isNew ? 'New entity' : `${entity?.name} · entity`} subtitle={isNew ? 'Define a data model' : `${entity?.key} — ${appQ.data?.app.name ?? ''}`} />

      {isNew && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <TextField select label="App" size="small" value={newAppId} onChange={(e) => setNewAppId(e.target.value)} sx={{ minWidth: 280 }}>
            <MenuItem value=""><em>choose app…</em></MenuItem>
            {(appsQ.data?.apps ?? []).map((a) => <MenuItem key={a.id} value={a.id}>{a.name} ({a.key})</MenuItem>)}
          </TextField>
        </Paper>
      )}

      {(!isNew || appId) && (
        <Card title="Schema">
          <EntityEditor
            entity={entity}
            appId={appId}
            entities={siblings}
            lookups={lookups}
            busy={save.isPending}
            onCancel={() => navigate('/admin/lowcode?tab=entities')}
            onSave={(payload) => save.mutate(payload)}
          />
        </Card>
      )}

      {!isNew && entity && appQ.data && (
        <>
          <Card title="Records">
            <RecordsPanel entity={entity} appKey={appQ.data.app.key} />
          </Card>
          <Card title="Danger zone">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="outlined" onClick={() => exportE.mutate()} disabled={exportE.isPending}>Export to FileVault</Button>
              <Box sx={{ flex: 1 }} />
              <Button color="error" variant="contained" onClick={() => setDeleteOpen(true)}>Delete entity</Button>
            </Stack>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary">Deleting an entity removes its definition and every record (with FileVault cleanup).</Typography>
          </Card>
        </>
      )}

      <ConfirmDangerDialog
        open={deleteOpen}
        title={`Delete ${entity?.name ?? 'entity'}`}
        description={`This permanently deletes the entity and all of its records.`}
        confirmPhrase={entity?.key ?? ''}
        confirmLabel="Delete entity"
        busy={del.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => del.mutate()}
      />
      {ToastHost}
    </Stack>
  );
}
