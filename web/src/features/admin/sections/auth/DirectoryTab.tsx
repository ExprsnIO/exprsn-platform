import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { authAdminApi, AUTH_CONFIG_SECTIONS, type ImportResult } from '@/api/admin/auth';
import { Card, ConfigSectionEditor, DataTable, StatCard, StatusChip } from '@/features/admin/ui';
import { AdvancedGroupDialog, CreateRoleDialog, type AuthTab } from './shared';

/**
 * Tiny CSV parser (quoted fields + escaped quotes) → array of row objects
 * keyed by the header row. Enough for directory imports; not a general parser.
 */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { cur.push(field); field = ''; };
  const pushRow = () => { pushField(); if (cur.some((c) => c.trim() !== '')) rows.push(cur); cur = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') pushField();
    else if (ch === '\n') pushRow();
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || cur.length) pushRow();
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function downloadText(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Admin "Create User" dialog (Directory action). */
function CreateUserDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('active');
  const [emailVerified, setEmailVerified] = useState(false);

  useEffect(() => {
    if (!open) { setEmail(''); setDisplayName(''); setPassword(''); setStatus('active'); setEmailVerified(false); }
  }, [open]);

  const mut = useMutation({
    mutationFn: () => authAdminApi.createUser({ email, displayName: displayName || undefined, password: password || undefined, status, emailVerified }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'users'] });
      onDone('User created');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Create user</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus fullWidth required type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField fullWidth label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <TextField fullWidth type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            helperText="Leave empty to require a password reset before first login." autoComplete="new-password" />
          <TextField select fullWidth label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['active', 'inactive', 'suspended'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Switch checked={emailVerified} onChange={(e) => setEmailVerified(e.target.checked)} />} label="Mark email as verified" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!email || mut.isPending} onClick={() => mut.mutate()}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Roles an admin can pre-select as the default for un-roled import rows. */
const IMPORT_DEFAULT_ROLES = ['guest', 'member', 'admin', 'owner'];

/**
 * CSV import dialog.
 *
 * Users path (FEAT-035 slice-A): a raw CSV `File` is streamed to the server —
 * which parses, row-caps, and enforces the org-aware authz boundary — alongside
 * structured options (target org, default role, invite vs. create, credential
 * provisioning). No client-side parsing/preview: the server owns the report.
 *
 * Groups path (unchanged): paste/pick CSV, parse client-side, submit as JSON.
 */
function ImportDialog({
  kind,
  open,
  onClose,
  onDone,
}: {
  kind: 'users' | 'groups';
  open: boolean;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const isUsers = kind === 'users';

  // Groups path: client-parsed CSV text.
  const [text, setText] = useState('');
  // Users path: raw file + structured options.
  const [file, setFile] = useState<File | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [defaultRole, setDefaultRole] = useState('member');
  const [mode, setMode] = useState<'create' | 'invite'>('create');
  const [provisionCredentials, setProvisionCredentials] = useState(false);

  const [result, setResult] = useState<ImportResult | null>(null);
  const rows = isUsers ? [] : parseCsv(text);
  const groupExpected = 'name,description,organizationId';

  const orgs = useQuery({
    queryKey: ['auth', 'orgs'],
    queryFn: () => authAdminApi.listOrganizations(),
    enabled: open && isUsers,
  });

  useEffect(() => {
    if (!open) {
      setText(''); setFile(null); setOrganizationId(''); setDefaultRole('member');
      setMode('create'); setProvisionCredentials(false); setResult(null);
    }
  }, [open]);

  const pickGroupsFile = (f: File | null) => {
    if (!f) return;
    f.text().then(setText).catch(() => onDone('Could not read file'));
  };

  // Credentials only apply on the create path with a target org (server rejects
  // otherwise); keep the outbound flag consistent with that constraint.
  const credsEnabled = isUsers && mode === 'create' && !!organizationId;

  const mut = useMutation({
    mutationFn: () => {
      if (isUsers) {
        if (!file) throw new Error('Choose a CSV file first');
        return authAdminApi.importUsersFile(file, {
          organizationId: organizationId || undefined,
          defaultRole,
          mode,
          provisionCredentials: credsEnabled && provisionCredentials,
        });
      }
      return authAdminApi.importGroups(rows);
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['auth', isUsers ? 'users' : 'groups'] });
      const parts = [`${r.created} created`];
      if (r.invited != null) parts.push(`${r.invited} invited`);
      parts.push(`${r.skipped} skipped`, `${r.failed} failed`);
      onDone(`Import finished — ${parts.join(', ')}`);
    },
    onError: (e) => onDone((e as Error).message),
  });

  const canSubmit = isUsers ? !!file : rows.length > 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import {kind}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {isUsers ? (
            <>
              <Alert severity="info">
                Upload a CSV with a header row. Recognized columns:{' '}
                <code>email, display_name, first_name, last_name, status, password, role, auth_group, nexus_group</code>{' '}
                (email is required). The file is parsed on the server — up to 2,000 rows and 8&nbsp;MB.
              </Alert>
              <Button component="label" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
                {file ? 'Choose a different file…' : 'Choose CSV file…'}
                <input
                  hidden
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
                />
              </Button>
              {file && !result && (
                <Alert severity="success">{file.name} ({Math.ceil(file.size / 1024)} KB) ready to import.</Alert>
              )}

              <TextField
                select
                fullWidth
                label="Target organization"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                helperText="Members are added here with the role below. Required to provision credentials; platform admins may leave it empty."
              >
                <MenuItem value="">Platform (no organization)</MenuItem>
                {(orgs.data?.organizations ?? orgs.data?.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                fullWidth
                label="Default role"
                value={defaultRole}
                onChange={(e) => setDefaultRole(e.target.value)}
                helperText="Applied to rows without a role column. 'owner' is reserved — rejected unless you are a platform admin."
              >
                {IMPORT_DEFAULT_ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>

              <FormControlLabel
                control={<Switch checked={mode === 'invite'} onChange={(e) => setMode(e.target.checked ? 'invite' : 'create')} />}
                label="Invite mode — create inactive accounts and email an activation link (no password set)"
              />
              <FormControlLabel
                control={(
                  <Switch
                    checked={credsEnabled && provisionCredentials}
                    disabled={!credsEnabled}
                    onChange={(e) => setProvisionCredentials(e.target.checked)}
                  />
                )}
                label="Provision member credentials (certificate/token) on creation — requires an organization, create mode only"
              />
            </>
          ) : (
            <>
              <Alert severity="info">
                CSV with a header row. Expected columns: <code>{groupExpected}</code> (name is required).
              </Alert>
              <Button component="label" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
                Choose CSV file…
                <input hidden type="file" accept=".csv,text/csv" onChange={(e) => pickGroupsFile(e.target.files?.[0] ?? null)} />
              </Button>
              <TextField
                label="CSV content"
                multiline
                minRows={6}
                maxRows={16}
                value={text}
                onChange={(e) => setText(e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                placeholder={`${groupExpected}\n…`}
              />
              {rows.length > 0 && !result && <Alert severity="success">{rows.length} row(s) parsed and ready to import.</Alert>}
            </>
          )}

          {result && (
            <DataTable
              rows={result.rows}
              rowKey={(r, i) => `${r.email ?? r.name ?? i}-${i}`}
              columns={isUsers ? [
                { key: 'row', header: '#', align: 'right', render: (r) => r.row ?? '—' },
                { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
                { key: 'outcome', header: 'Outcome', render: (r) => <StatusChip status={r.outcome} /> },
                { key: 'orgRole', header: 'Org role', render: (r) => r.orgRole ?? '—' },
                { key: 'credentials', header: 'Credentials', render: (r) => (r.credentialsIssued ? 'Issued' : '—') },
                { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '—' },
              ] : [
                { key: 'subject', header: 'Name', render: (r) => r.name ?? r.email ?? '—' },
                { key: 'outcome', header: 'Outcome', render: (r) => <StatusChip status={r.outcome} /> },
                { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '—' },
              ]}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
        {!result && (
          <Button variant="contained" disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
            {isUsers ? 'Import users' : `Import ${rows.length > 0 ? `${rows.length} row(s)` : ''}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Directory tab — live stats for users/groups/roles with the action bubbles
 * (Create / Import / Export) wired to real endpoints, plus the auth-methods
 * config section.
 */
export function DirectoryTab({ onToast, onNavigate }: { onToast: (m: string) => void; onNavigate: (tab: AuthTab) => void }) {
  const [createUser, setCreateUser] = useState(false);
  const [importKind, setImportKind] = useState<'users' | 'groups' | null>(null);
  const [createGroup, setCreateGroup] = useState(false);
  const [createRole, setCreateRole] = useState(false);
  const [exporting, setExporting] = useState(false);

  const users = useQuery({ queryKey: ['auth', 'users', ''], queryFn: () => authAdminApi.listUsers({ limit: 1 }) });
  const groups = useQuery({ queryKey: ['auth', 'groups', 'all'], queryFn: () => authAdminApi.listGroups() });
  const roles = useQuery({ queryKey: ['auth', 'roles'], queryFn: () => authAdminApi.listRoles() });

  const exportUsers = async () => {
    setExporting(true);
    try {
      const csv = await authAdminApi.exportUsersCsv();
      downloadText('users.csv', csv);
      onToast('User export downloaded');
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const exportGroups = () => {
    const rows = groups.data?.groups ?? [];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      'id,name,description,organizationId,type,members',
      ...rows.map((g) => [g.id, g.name, g.description ?? '', g.organizationId ?? '', g.type ?? '', g.members?.length ?? 0].map(esc).join(',')),
    ].join('\n');
    downloadText('groups.csv', csv);
    onToast('Group export downloaded');
  };

  return (
    <Stack spacing={2}>
      <Card
        title="Users"
        actions={
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={() => setCreateUser(true)}>Create User</Button>
            <Button size="small" variant="outlined" onClick={() => setImportKind('users')}>Import Users</Button>
            <Button size="small" variant="outlined" disabled={exporting} onClick={exportUsers}>Export Users</Button>
          </Stack>
        }
      >
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <StatCard label="Total users" value={users.data?.pagination?.total ?? '—'} />
        </Stack>
      </Card>

      <Card
        title="Groups"
        actions={
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={() => setCreateGroup(true)}>Create Group</Button>
            <Button size="small" variant="outlined" onClick={() => setImportKind('groups')}>Import Groups</Button>
            <Button size="small" variant="outlined" onClick={exportGroups}>Export Groups</Button>
          </Stack>
        }
      >
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <StatCard label="Total groups" value={groups.data?.groups?.length ?? '—'} />
          <StatCard label="Org-scoped" value={groups.data?.groups?.filter((g) => g.organizationId).length ?? '—'} />
        </Stack>
      </Card>

      <Card
        title="Roles"
        actions={
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={() => setCreateRole(true)}>Create Role</Button>
            <Button size="small" variant="outlined" onClick={() => onNavigate('roles')}>Manage Permissions</Button>
          </Stack>
        }
      >
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <StatCard label="Total roles" value={(roles.data?.roles ?? roles.data?.data ?? []).length || '—'} />
          <StatCard label="System roles" value={(roles.data?.roles ?? roles.data?.data ?? []).filter((r) => r.isSystem).length} />
        </Stack>
      </Card>

      <ConfigSectionEditor
        sections={AUTH_CONFIG_SECTIONS}
        load={(s) => authAdminApi.getConfigSection(s)}
        save={(s, data) => authAdminApi.saveConfigSection(s, data)}
      />

      <CreateUserDialog open={createUser} onClose={() => setCreateUser(false)} onDone={onToast} />
      <ImportDialog kind={importKind ?? 'users'} open={!!importKind} onClose={() => setImportKind(null)} onDone={onToast} />
      <AdvancedGroupDialog open={createGroup} onClose={() => setCreateGroup(false)} onDone={onToast} />
      <CreateRoleDialog open={createRole} onClose={() => setCreateRole(false)} onDone={onToast} />
    </Stack>
  );
}
