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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { authAdminApi, type Permission, type Role } from '@/api/admin/auth';
import { formatDate } from '@/features/files/util';
import { Card, DataTable, QueryState, StatusChip } from '@/features/admin/ui';
import { CreateRoleDialog } from './shared';

/**
 * Role inspector — the role's definition (editable unless it's a system role)
 * plus its reach: which users hold it (and in which org scope) and which
 * groups are bound to it. Assign/revoke for both subjects lives here.
 */
function RoleDetailView({ role, onBack, onToast }: { role: Role; onBack: () => void; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(role.name ?? '');
  const [description, setDescription] = useState(String(role.description ?? ''));
  const [priority, setPriority] = useState(String(role.priority ?? 0));
  const [perms, setPerms] = useState<string[]>(role.permissions ?? []);
  const [assignUserOpen, setAssignUserOpen] = useState(false);
  const [assignGroupOpen, setAssignGroupOpen] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const assignments = useQuery({
    queryKey: ['auth', 'role', role.id, 'assignments'],
    queryFn: () => authAdminApi.getRoleAssignments(role.id),
  });
  const users = useQuery({ queryKey: ['auth', 'users', 'all'], queryFn: () => authAdminApi.listUsers({ limit: 200 }), enabled: assignUserOpen });
  const groups = useQuery({ queryKey: ['auth', 'groups', 'all'], queryFn: () => authAdminApi.listGroups(), enabled: assignGroupOpen });
  const catalog = useQuery({ queryKey: ['auth', 'permissions'], queryFn: () => authAdminApi.listPermissions() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['auth', 'role', role.id, 'assignments'] });
    qc.invalidateQueries({ queryKey: ['auth', 'roles'] });
  };

  const saveMut = useMutation({
    mutationFn: () => authAdminApi.updateRole(role.id, {
      name,
      description,
      priority: Number(priority) || 0,
      permissions: perms,
    }),
    onSuccess: () => { onToast('Role saved'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: () => authAdminApi.deleteRole(role.id),
    onSuccess: () => { onToast('Role deleted'); onBack(); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const assignUserMut = useMutation({
    mutationFn: () => authAdminApi.assignRoleUser(role.id, subjectId, role.organizationId ?? undefined),
    onSuccess: () => { onToast('Role assigned to user'); setAssignUserOpen(false); setSubjectId(''); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const revokeUserMut = useMutation({
    mutationFn: (a: { userId: string; organizationId?: string | null }) =>
      authAdminApi.revokeRoleUser(role.id, a.userId, a.organizationId ?? undefined),
    onSuccess: () => { onToast('Role revoked from user'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const assignGroupMut = useMutation({
    mutationFn: () => authAdminApi.assignRoleGroup(role.id, subjectId, role.organizationId ?? undefined),
    onSuccess: () => { onToast('Role bound to group — members inherit it'); setAssignGroupOpen(false); setSubjectId(''); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const revokeGroupMut = useMutation({
    mutationFn: (a: { groupId: string; organizationId?: string | null }) =>
      authAdminApi.revokeRoleGroup(role.id, a.groupId, a.organizationId ?? undefined),
    onSuccess: () => { onToast('Role unbound from group'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });

  const permOptions = Array.from(new Set([
    ...(catalog.data?.permissions ?? catalog.data?.data ?? []).map((p) => p.permissionString).filter((s): s is string => !!s),
    '*',
  ]));

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>Roles</Button>
        <Typography variant="h6">{role.name}</Typography>
        <Chip size="small" variant="outlined" label={role.organizationId ? 'org-scoped' : 'global'} />
        {role.isSystem && <Chip size="small" color="warning" variant="outlined" label="system role" />}
      </Stack>

      <Card title="Definition"
        actions={!role.isSystem && (
          <Stack direction="row" spacing={1}>
            <Button size="small" color="error" onClick={() => setConfirmDelete(true)}>Delete role</Button>
            <Button size="small" variant="contained" disabled={!name || saveMut.isPending} onClick={() => saveMut.mutate()}>Save</Button>
          </Stack>
        )}
      >
        {role.isSystem ? (
          <Alert severity="info">System roles are read-only.</Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: role.isSystem ? 2 : 0 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={!!role.isSystem} fullWidth />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!!role.isSystem} fullWidth />
          <TextField type="number" label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!!role.isSystem} sx={{ maxWidth: 200 }} />
          <Autocomplete
            multiple
            freeSolo
            options={permOptions}
            value={perms}
            onChange={(_e, v) => setPerms(v as string[])}
            disabled={!!role.isSystem}
            renderInput={(params) => <TextField {...params} label="Permissions" placeholder="Add permissions…" />}
          />
        </Stack>
      </Card>

      <Card
        title="Users holding this role"
        actions={<Button size="small" variant="outlined" onClick={() => { setSubjectId(''); setAssignUserOpen(true); }}>Assign user</Button>}
      >
        <QueryState query={assignments} empty="No user assignments.">
          {(a) => a.users.length === 0 ? (
            <Alert severity="info">No user assignments.</Alert>
          ) : (
            <DataTable
              rows={a.users}
              rowKey={(u, i) => `${u.userId}-${i}`}
              columns={[
                { key: 'user', header: 'User', render: (u) => u.user?.email ?? u.userId },
                { key: 'status', header: 'Status', render: (u) => <StatusChip status={u.user?.status} /> },
                { key: 'org', header: 'Scope', render: (u) => (u.organizationId ? 'org' : 'global') },
                { key: 'expiresAt', header: 'Expires', render: (u) => u.expiresAt ? formatDate(u.expiresAt) : 'never' },
                {
                  key: 'revoke', header: '', align: 'right', locked: true,
                  render: (u) => (
                    <Button size="small" color="error" onClick={() => revokeUserMut.mutate(u)}>Revoke</Button>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <Card
        title="Groups bound to this role"
        actions={<Button size="small" variant="outlined" onClick={() => { setSubjectId(''); setAssignGroupOpen(true); }}>Bind group</Button>}
      >
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Binding a role to a group gives every member of the group this role's permission set —
          e.g. a “Moderators” role bound to a “Moderators” group.
        </Alert>
        <QueryState query={assignments} empty="No group bindings.">
          {(a) => a.groups.length === 0 ? (
            <Alert severity="info">No group bindings.</Alert>
          ) : (
            <DataTable
              rows={a.groups}
              rowKey={(g, i) => `${g.groupId}-${i}`}
              columns={[
                { key: 'group', header: 'Group', render: (g) => g.group?.name ?? g.groupId },
                { key: 'org', header: 'Scope', render: (g) => (g.organizationId ? 'org' : 'global') },
                {
                  key: 'revoke', header: '', align: 'right', locked: true,
                  render: (g) => (
                    <Button size="small" color="error" onClick={() => revokeGroupMut.mutate(g)}>Unbind</Button>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      {/* Assign-user picker */}
      <Dialog open={assignUserOpen} onClose={() => setAssignUserOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Assign “{role.name}” to a user</DialogTitle>
        <DialogContent>
          <TextField select autoFocus fullWidth label="User" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} sx={{ mt: 1 }}>
            {(users.data?.users ?? []).map((u) => (
              <MenuItem key={u.id} value={u.id}>{u.email}{u.displayName ? ` (${u.displayName})` : ''}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignUserOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!subjectId || assignUserMut.isPending} onClick={() => assignUserMut.mutate()}>Assign</Button>
        </DialogActions>
      </Dialog>

      {/* Bind-group picker */}
      <Dialog open={assignGroupOpen} onClose={() => setAssignGroupOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Bind “{role.name}” to a group</DialogTitle>
        <DialogContent>
          <TextField select autoFocus fullWidth label="Group" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} sx={{ mt: 1 }}>
            {(groups.data?.groups ?? [])
              .filter((g) => !role.organizationId || g.organizationId === role.organizationId)
              .map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignGroupOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!subjectId || assignGroupMut.isPending} onClick={() => assignGroupMut.mutate()}>Bind group</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete role “{role.name}”?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">All user and group assignments of this role are removed with it.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

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
function PermissionCatalog({ onToast }: { onToast: (m: string) => void }) {
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
        Permissions are grouped by the service they protect. Attach them to roles (Roles table above),
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

export function RolesTab({ onToast }: { onToast: (m: string) => void }) {
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<Role | null>(null);
  const roles = useQuery({ queryKey: ['auth', 'roles'], queryFn: () => authAdminApi.listRoles() });

  // Row click (or Inspect) opens the role inspector: definition, user
  // assignments, and group bindings.
  if (selected) {
    return <RoleDetailView role={selected} onBack={() => setSelected(null)} onToast={onToast} />;
  }

  return (
    <Stack spacing={2}>
      <Card
        title="Roles"
        actions={<Button size="small" variant="contained" onClick={() => setCreate(true)}>New role</Button>}
      >
        <QueryState query={roles} empty="No roles.">
          {(d) => (
            <DataTable
              rows={d.roles ?? d.data ?? []}
              rowKey={(r) => r.id}
              tableId="auth.roles"
              onRowClick={(r) => setSelected(r)}
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'type', header: 'Type', render: (r) => r.type ?? '—' },
                { key: 'description', header: 'Description', defaultHidden: true, render: (r) => String(r.description ?? '—') },
                { key: 'priority', header: 'Priority', align: 'right', render: (r) => r.priority ?? '—', sortValue: (r) => r.priority ?? null },
                {
                  key: 'scope',
                  header: 'Scope',
                  render: (r) => (r.organizationId ? 'org' : 'global'),
                  sortValue: (r) => (r.organizationId ? 'org' : 'global'),
                  filterValue: (r) => (r.organizationId ? 'org' : 'global'),
                },
                {
                  key: 'permissions',
                  header: 'Permissions',
                  defaultHidden: true,
                  render: (r) => (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {(r.permissions ?? []).slice(0, 4).map((p) => <Chip key={p} size="small" label={p} />)}
                      {(r.permissions?.length ?? 0) > 4 && <Chip size="small" label={`+${r.permissions!.length - 4}`} />}
                      {(r.permissions?.length ?? 0) === 0 && '—'}
                    </Stack>
                  ),
                  sortValue: (r) => r.permissions?.length ?? 0,
                  filterValue: (r) => (r.permissions ?? []).join(' '),
                },
                {
                  key: 'system',
                  header: 'System',
                  render: (r) => (r.isSystem ? 'yes' : 'no'),
                  sortValue: (r) => (r.isSystem ? 1 : 0),
                  filterValue: (r) => (r.isSystem ? 'yes' : 'no'),
                },
                {
                  key: 'inspect', header: '', align: 'right', locked: true,
                  render: (r) => <Button size="small" onClick={() => setSelected(r)}>Inspect</Button>,
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <PermissionCatalog onToast={onToast} />
      <CreateRoleDialog open={create} onClose={() => setCreate(false)} onDone={onToast} />
    </Stack>
  );
}
