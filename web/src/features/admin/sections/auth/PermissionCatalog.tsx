import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { authAdminApi, type Permission } from '@/api/admin/auth';
import { Card, DataTable, QueryState } from '@/features/admin/ui';

/** Create a permission catalog entry (resource:action, scoped to a service). */
function CreatePermissionDialog({
  open,
  services,
  onClose,
  onDone,
}: {
  open: boolean;
  services: string[];
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [scope, setScope] = useState('application');
  const [service, setService] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) { setResource(''); setAction(''); setScope('application'); setService(''); setDescription(''); }
  }, [open]);

  const mut = useMutation({
    mutationFn: () => authAdminApi.createPermission({ resource, action, scope, service: service || undefined, description: description || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'permissions'] });
      onDone('Permission created');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New permission</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus fullWidth required label="Resource" value={resource} onChange={(e) => setResource(e.target.value)}
            placeholder="e.g. report, spark:message" />
          <TextField fullWidth required label="Action" value={action} onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. read, write, manage" />
          {(resource || action) && (
            <Alert severity="info" sx={{ fontFamily: 'monospace' }}>{`${resource || '<resource>'}:${action || '<action>'}`}</Alert>
          )}
          <TextField select fullWidth label="Scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            {['system', 'organization', 'application', 'service'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <Autocomplete
            freeSolo
            options={services}
            value={service}
            onInputChange={(_e, v) => setService(v)}
            renderInput={(params) => <TextField {...params} label="Service" placeholder="auth, spark, timeline…" />}
          />
          <TextField fullWidth label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!resource || !action || mut.isPending} onClick={() => mut.mutate()}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Permission catalog grouped into collapsible per-service sections. */
export function PermissionCatalog({ onToast }: { onToast: (m: string) => void }) {
  const perms = useQuery({ queryKey: ['auth', 'permissions'], queryFn: () => authAdminApi.listPermissions() });
  const [create, setCreate] = useState(false);

  const all = (perms.data?.permissions ?? perms.data?.data ?? []) as Permission[];
  const byService = new Map<string, Permission[]>();
  for (const p of all) {
    const svc = p.service || (p.scope === 'system' ? 'platform (system)' : 'platform');
    if (!byService.has(svc)) byService.set(svc, []);
    byService.get(svc)!.push(p);
  }
  const services = Array.from(byService.keys()).sort();

  return (
    <Card
      title="Permission catalog"
      actions={<Button size="small" variant="outlined" onClick={() => setCreate(true)}>New permission</Button>}
    >
      <Alert severity="info" sx={{ mb: 1.5 }}>
        Permissions are grouped by the service they protect. Attach them to roles (Roles section),
        then apply roles to users directly or to groups via role-to-group bindings.
      </Alert>
      <QueryState query={perms} empty="No permissions.">
        {() => (
          <Stack spacing={0}>
            {services.map((svc) => (
              <Accordion key={svc} disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2">{svc}</Typography>
                    <Chip size="small" variant="outlined" label={byService.get(svc)!.length} />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <DataTable
                    rows={byService.get(svc)!}
                    rowKey={(p, i) => String(p.id ?? p.permissionString ?? i)}
                    columns={[
                      { key: 'permissionString', header: 'Permission', mono: true, render: (p) => p.permissionString ?? '—' },
                      { key: 'scope', header: 'Scope', render: (p) => p.scope ?? '—' },
                      { key: 'description', header: 'Description', render: (p) => p.description ?? '—' },
                    ]}
                  />
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}
      </QueryState>
      <CreatePermissionDialog
        open={create}
        services={services.filter((s) => !s.startsWith('platform'))}
        onClose={() => setCreate(false)}
        onDone={onToast}
      />
    </Card>
  );
}
