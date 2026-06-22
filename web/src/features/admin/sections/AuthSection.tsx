import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { authAdminApi, AUTH_CONFIG_SECTIONS, type Organization, type Role, type Permission, type Session } from '@/api/admin/auth';
import { formatDate } from '@/features/files/util';
import { Card, ConfigSectionEditor, DataTable, JsonDialog, QueryState, SectionHeader, StatusChip, useToast } from '../ui';

/* ---------------------------------------------------------- organizations */

function CreateOrgDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const mut = useMutation({
    mutationFn: () => authAdminApi.createOrganization({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'orgs'] });
      onDone('Organization created');
      onClose();
      setName('');
    },
    onError: (e) => onDone((e as Error).message),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Create organization</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name || mut.isPending} onClick={() => mut.mutate()}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

function OrganizationsTab({ onToast }: { onToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Organization | null>(null);
  const query = useQuery({ queryKey: ['auth', 'orgs'], queryFn: authAdminApi.listOrganizations });
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setOpen(true)}>New organization</Button>
      </Stack>
      <QueryState query={query} empty="You belong to no organizations.">
        {(d) => (
          <DataTable
            rows={d.organizations ?? d.data ?? []}
            rowKey={(o) => o.id}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'slug', header: 'Slug', render: (o) => o.slug ?? '—' },
              { key: 'status', header: 'Status', render: (o) => <StatusChip status={o.status} /> },
              { key: 'createdAt', header: 'Created', render: (o) => formatDate(o.createdAt) },
              { key: 'view', header: '', align: 'right', render: (o) => <Button size="small" onClick={() => setView(o)}>Details</Button> },
            ]}
          />
        )}
      </QueryState>
      <CreateOrgDialog open={open} onClose={() => setOpen(false)} onDone={onToast} />
      <JsonDialog open={!!view} title={view?.name ?? 'Organization'} value={view} onClose={() => setView(null)} />
    </Stack>
  );
}

/* -------------------------------------------------------------- roles ---- */

function RolesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [assign, setAssign] = useState<Role | null>(null);
  const [userId, setUserId] = useState('');
  const roles = useQuery({ queryKey: ['auth', 'roles'], queryFn: () => authAdminApi.listRoles() });
  const perms = useQuery({ queryKey: ['auth', 'permissions'], queryFn: () => authAdminApi.listPermissions() });
  const assignMut = useMutation({
    mutationFn: () => authAdminApi.assignRoleUser(assign!.id, userId),
    onSuccess: () => {
      onToast('Role assigned');
      setAssign(null);
      setUserId('');
      qc.invalidateQueries({ queryKey: ['auth', 'roles'] });
    },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Stack spacing={2}>
      <Card title="Roles">
        <QueryState query={roles} empty="No roles.">
          {(d) => (
            <DataTable
              rows={d.roles ?? d.data ?? []}
              rowKey={(r) => r.id}
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'type', header: 'Type', render: (r) => r.type ?? '—' },
                { key: 'priority', header: 'Priority', align: 'right', render: (r) => r.priority ?? '—' },
                { key: 'scope', header: 'Scope', render: (r) => (r.organizationId ? 'org' : 'global') },
                { key: 'system', header: 'System', render: (r) => (r.isSystem ? 'yes' : 'no') },
                { key: 'assign', header: '', align: 'right', render: (r) => <Button size="small" onClick={() => setAssign(r)}>Assign user</Button> },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card title="Permission catalog">
        <QueryState query={perms} empty="No permissions.">
          {(d) => (
            <DataTable
              rows={(d.permissions ?? d.data ?? []) as Permission[]}
              rowKey={(p, i) => String(p.id ?? p.permissionString ?? i)}
              columns={[
                { key: 'permissionString', header: 'Permission', mono: true, render: (p) => p.permissionString ?? '—' },
                { key: 'scope', header: 'Scope', render: (p) => p.scope ?? '—' },
                { key: 'service', header: 'Service', render: (p) => p.service ?? '—' },
                { key: 'description', header: 'Description', render: (p) => p.description ?? '—' },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Dialog open={!!assign} onClose={() => setAssign(null)} fullWidth maxWidth="xs">
        <DialogTitle>Assign “{assign?.name}” to user</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssign(null)}>Cancel</Button>
          <Button variant="contained" disabled={!userId || assignMut.isPending} onClick={() => assignMut.mutate()}>Assign</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/* ------------------------------------------------------------- sessions -- */

function SessionsTab({ onToast }: { onToast: (m: string) => void }) {
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

/* ------------------------------------------------------------- directory - */

function DirectoryTab() {
  return (
    <Stack spacing={2}>
      <Alert severity="info">These public config sections expose the auth directory listings (users, groups, roles, methods). Editing posts the section back.</Alert>
      <ConfigSectionEditor
        sections={AUTH_CONFIG_SECTIONS}
        load={(s) => authAdminApi.getConfigSection(s)}
        save={(s, data) => authAdminApi.saveConfigSection(s, data)}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------- page */

type AuthTab = 'orgs' | 'roles' | 'sessions' | 'directory';

export function AuthSection() {
  const [tab, setTab] = useState<AuthTab>('orgs');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Auth & Identity" subtitle="Organizations, roles & permissions, sessions, directory — /auth/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="orgs" label="Organizations" />
        <Tab value="roles" label="Roles & Permissions" />
        <Tab value="sessions" label="Sessions" />
        <Tab value="directory" label="Directory" />
      </Tabs>
      {tab === 'orgs' && <OrganizationsTab onToast={showToast} />}
      {tab === 'roles' && <RolesTab onToast={showToast} />}
      {tab === 'sessions' && <SessionsTab onToast={showToast} />}
      {tab === 'directory' && <DirectoryTab />}
      {ToastHost}
    </Stack>
  );
}
