import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import SecurityIcon from '@mui/icons-material/Security';
import {
  authAdminApi,
  AUTH_CONFIG_SECTIONS,
  type AuthUser,
  type Group,
  type MfaMethod,
  type Organization,
  type OrgMember,
  type OrgPlan,
  type OrgType,
  type Permission,
  type Role,
  type Session,
} from '@/api/admin/auth';
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

/** Which 2FA methods an org policy may permit. `available` flags the ones the
 *  auth service implements today (TOTP + backup codes); the rest are persisted
 *  as policy intent only — the methods themselves are not built yet. */
const MFA_METHODS: { key: MfaMethod; label: string; available: boolean }[] = [
  { key: 'totp', label: 'Authenticator app (TOTP)', available: true },
  { key: 'backup_codes', label: 'Backup codes', available: true },
  { key: 'sms', label: 'SMS text message', available: false },
  { key: 'email', label: 'Email code', available: false },
  { key: 'webauthn', label: 'Security keys / passkeys (WebAuthn)', available: false },
];

const DEFAULT_METHODS: MfaMethod[] = ['totp', 'backup_codes'];

const ORG_TYPES: OrgType[] = ['enterprise', 'team', 'personal'];
const ORG_PLANS: OrgPlan[] = ['free', 'starter', 'professional', 'enterprise'];
const ORG_STATUSES = ['active', 'suspended', 'deleted'];

/** Flattened, editable view of an Organization + its `settings` JSON. */
interface OrgFormState {
  name: string;
  slug: string;
  description: string;
  type: OrgType;
  email: string;
  website: string;
  logoUrl: string;
  plan: OrgPlan;
  billingEmail: string;
  status: string;
  allowUserRegistration: boolean;
  requireEmailVerification: boolean;
  sessionTimeoutMinutes: number;
  pwMinLength: number;
  pwRequireUppercase: boolean;
  pwRequireLowercase: boolean;
  pwRequireNumbers: boolean;
  pwRequireSymbols: boolean;
  requireMfa: boolean;
  mfaMethods: MfaMethod[];
  mfaGraceDays: number;
  mfaRememberDays: number;
}

function toForm(org: Organization): OrgFormState {
  const s = org.settings ?? {};
  const pw = s.passwordPolicy ?? {};
  return {
    name: org.name ?? '',
    slug: org.slug ?? '',
    description: org.description ?? '',
    type: org.type ?? 'team',
    email: org.email ?? '',
    website: org.website ?? '',
    logoUrl: org.logoUrl ?? '',
    plan: org.plan ?? 'free',
    billingEmail: org.billingEmail ?? '',
    status: org.status ?? 'active',
    allowUserRegistration: !!s.allowUserRegistration,
    requireEmailVerification: s.requireEmailVerification ?? true,
    sessionTimeoutMinutes: Math.round((s.sessionTimeout ?? 3600000) / 60000),
    pwMinLength: pw.minLength ?? 8,
    pwRequireUppercase: pw.requireUppercase ?? true,
    pwRequireLowercase: pw.requireLowercase ?? true,
    pwRequireNumbers: pw.requireNumbers ?? true,
    pwRequireSymbols: pw.requireSymbols ?? false,
    requireMfa: !!s.requireMfa,
    mfaMethods: s.mfa?.allowedMethods ?? DEFAULT_METHODS,
    mfaGraceDays: s.mfa?.enrollmentGracePeriodDays ?? 7,
    mfaRememberDays: s.mfa?.rememberDeviceDays ?? 0,
  };
}

/**
 * The organization's "page": its stored record + settings JSON extrapolated
 * into editable fields. A single PATCH writes everything back — the auth API
 * replaces the `settings` JSON wholesale, so we merge our fields over whatever
 * is already stored (preserving unknown keys).
 */
function OrgSettingsForm({ org, onToast }: { org: Organization; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<OrgFormState>(() => toForm(org));

  // Re-hydrate whenever the freshly-fetched org changes (e.g. after a save).
  useEffect(() => setForm(toForm(org)), [org]);

  const set = <K extends keyof OrgFormState>(key: K, value: OrgFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleMethod = (k: MfaMethod) =>
    setForm((f) => ({
      ...f,
      mfaMethods: f.mfaMethods.includes(k) ? f.mfaMethods.filter((m) => m !== k) : [...f.mfaMethods, k],
    }));

  const mut = useMutation({
    mutationFn: () =>
      authAdminApi.updateOrganization(org.id, {
        name: form.name,
        slug: form.slug,
        description: form.description || null,
        type: form.type,
        email: form.email || null,
        website: form.website || null,
        logoUrl: form.logoUrl || null,
        plan: form.plan,
        billingEmail: form.billingEmail || null,
        status: form.status,
        settings: {
          ...(org.settings ?? {}),
          allowUserRegistration: form.allowUserRegistration,
          requireEmailVerification: form.requireEmailVerification,
          sessionTimeout: form.sessionTimeoutMinutes * 60000,
          passwordPolicy: {
            ...(org.settings?.passwordPolicy ?? {}),
            minLength: form.pwMinLength,
            requireUppercase: form.pwRequireUppercase,
            requireLowercase: form.pwRequireLowercase,
            requireNumbers: form.pwRequireNumbers,
            requireSymbols: form.pwRequireSymbols,
          },
          requireMfa: form.requireMfa,
          mfa: {
            ...(org.settings?.mfa ?? {}),
            allowedMethods: form.mfaMethods,
            enrollmentGracePeriodDays: form.mfaGraceDays,
            rememberDeviceDays: form.mfaRememberDays,
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'orgs'] });
      qc.invalidateQueries({ queryKey: ['auth', 'org', org.id, 'detail'] });
      onToast('Organization settings saved');
    },
    onError: (e) => onToast((e as Error).message),
  });

  const slugValid = /^[a-z0-9-]+$/i.test(form.slug);
  const canSave = !!form.name && slugValid && form.mfaMethods.length > 0 && !mut.isPending;

  return (
    <Stack spacing={2}>
      <Card title="Profile">
        <Stack spacing={2}>
          <TextField label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required fullWidth />
          <TextField
            label="Slug"
            value={form.slug}
            onChange={(e) => set('slug', e.target.value)}
            error={!!form.slug && !slugValid}
            helperText={!!form.slug && !slugValid ? 'Letters, numbers and hyphens only.' : 'Used in URLs; must be unique.'}
            fullWidth
          />
          <TextField label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} multiline minRows={2} fullWidth />
          <TextField select label="Type" value={form.type} onChange={(e) => set('type', e.target.value as OrgType)} sx={{ maxWidth: 240 }}>
            {ORG_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField select label="Status" value={form.status} onChange={(e) => set('status', e.target.value)} sx={{ maxWidth: 240 }}>
            {ORG_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Stack>
      </Card>

      <Card title="Contact & branding">
        <Stack spacing={2}>
          <TextField type="email" label="Contact email" value={form.email} onChange={(e) => set('email', e.target.value)} fullWidth />
          <TextField label="Website" value={form.website} onChange={(e) => set('website', e.target.value)} fullWidth />
          <TextField label="Logo URL" value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} fullWidth />
        </Stack>
      </Card>

      <Card title="Plan & billing">
        <Stack spacing={2}>
          <TextField select label="Plan" value={form.plan} onChange={(e) => set('plan', e.target.value as OrgPlan)} sx={{ maxWidth: 240 }}>
            {ORG_PLANS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </TextField>
          <TextField type="email" label="Billing email" value={form.billingEmail} onChange={(e) => set('billingEmail', e.target.value)} fullWidth />
        </Stack>
      </Card>

      <Card title="General settings">
        <Stack spacing={1}>
          <FormControlLabel
            control={<Switch checked={form.allowUserRegistration} onChange={(e) => set('allowUserRegistration', e.target.checked)} />}
            label="Allow self-service user registration"
          />
          <FormControlLabel
            control={<Switch checked={form.requireEmailVerification} onChange={(e) => set('requireEmailVerification', e.target.checked)} />}
            label="Require email verification"
          />
          <TextField
            type="number"
            label="Session timeout (minutes)"
            value={form.sessionTimeoutMinutes}
            onChange={(e) => set('sessionTimeoutMinutes', Math.max(1, Number(e.target.value) || 0))}
            inputProps={{ min: 1 }}
            sx={{ maxWidth: 240, mt: 1 }}
          />
        </Stack>
      </Card>

      <Card title="Password policy">
        <Stack spacing={1}>
          <TextField
            type="number"
            label="Minimum length"
            value={form.pwMinLength}
            onChange={(e) => set('pwMinLength', Math.max(1, Number(e.target.value) || 0))}
            inputProps={{ min: 1 }}
            sx={{ maxWidth: 240 }}
          />
          <FormGroup>
            <FormControlLabel control={<Checkbox checked={form.pwRequireUppercase} onChange={(e) => set('pwRequireUppercase', e.target.checked)} />} label="Require uppercase letter" />
            <FormControlLabel control={<Checkbox checked={form.pwRequireLowercase} onChange={(e) => set('pwRequireLowercase', e.target.checked)} />} label="Require lowercase letter" />
            <FormControlLabel control={<Checkbox checked={form.pwRequireNumbers} onChange={(e) => set('pwRequireNumbers', e.target.checked)} />} label="Require number" />
            <FormControlLabel control={<Checkbox checked={form.pwRequireSymbols} onChange={(e) => set('pwRequireSymbols', e.target.checked)} />} label="Require symbol" />
          </FormGroup>
        </Stack>
      </Card>

      <Card title="Two-factor authentication">
        <Stack spacing={2}>
          <Alert severity="warning">
            This policy is saved but <strong>not yet enforced at login</strong> (see STATUS.md). Members can
            already enable 2FA from their own account security settings.
          </Alert>
          <FormControlLabel
            control={<Switch checked={form.requireMfa} onChange={(e) => set('requireMfa', e.target.checked)} />}
            label="Require two-factor authentication for all members"
          />
          <div>
            <Typography variant="subtitle2" gutterBottom>Allowed methods</Typography>
            <FormGroup>
              {MFA_METHODS.map((m) => (
                <FormControlLabel
                  key={m.key}
                  control={<Checkbox checked={form.mfaMethods.includes(m.key)} onChange={() => toggleMethod(m.key)} />}
                  label={m.available ? m.label : `${m.label} — not yet available`}
                />
              ))}
            </FormGroup>
          </div>
          <TextField
            type="number"
            label="Enrollment grace period (days)"
            value={form.mfaGraceDays}
            onChange={(e) => set('mfaGraceDays', Math.max(0, Number(e.target.value) || 0))}
            helperText="How long a new member has to set up 2FA before it's required."
            inputProps={{ min: 0 }}
            sx={{ maxWidth: 320 }}
          />
          <TextField
            type="number"
            label="Remember trusted device (days)"
            value={form.mfaRememberDays}
            onChange={(e) => set('mfaRememberDays', Math.max(0, Number(e.target.value) || 0))}
            helperText="0 = prompt for 2FA on every sign-in."
            inputProps={{ min: 0 }}
            sx={{ maxWidth: 320 }}
          />
        </Stack>
      </Card>

      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={() => setForm(toForm(org))} disabled={mut.isPending}>Reset</Button>
        <Button variant="contained" onClick={() => mut.mutate()} disabled={!canSave}>Save settings</Button>
      </Stack>
    </Stack>
  );
}

/* ===================================================== organization detail === */

const ORG_MEMBER_ROLES = ['owner', 'admin', 'member', 'guest'];

/**
 * Pick one org-scoped role to assign to a subject (member or group). Assigning
 * a role here carries the organization scope — this is how an admin "sets up
 * scopes" for users and groups within an organization.
 */
function AssignRoleDialog({
  open,
  title,
  roles,
  busy,
  onClose,
  onAssign,
}: {
  open: boolean;
  title: string;
  roles: Role[];
  busy: boolean;
  onClose: () => void;
  onAssign: (roleId: string) => void;
}) {
  const [roleId, setRoleId] = useState('');
  useEffect(() => {
    if (!open) setRoleId('');
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {roles.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>No roles defined for this organization yet — create one in the Roles tab.</Alert>
        ) : (
          <TextField select autoFocus fullWidth label="Role" value={roleId} onChange={(e) => setRoleId(e.target.value)} sx={{ mt: 1 }}>
            {roles.map((r) => (
              <MenuItem key={r.id} value={r.id}>{r.name ?? r.id}</MenuItem>
            ))}
          </TextField>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!roleId || busy} onClick={() => onAssign(roleId)}>Assign</Button>
      </DialogActions>
    </Dialog>
  );
}

function OrgMembersTab({ orgId, roles, onToast }: { orgId: string; roles: Role[]; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [add, setAdd] = useState(false);
  const [assign, setAssign] = useState<OrgMember | null>(null);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState('member');

  const members = useQuery({ queryKey: ['auth', 'org', orgId, 'members'], queryFn: () => authAdminApi.listOrgMembers(orgId) });
  const users = useQuery({ queryKey: ['auth', 'users', 'all'], queryFn: () => authAdminApi.listUsers({ limit: 200 }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth', 'org', orgId, 'members'] });

  const addMut = useMutation({
    mutationFn: () => authAdminApi.addOrgMember(orgId, newUserId, newRole),
    onSuccess: () => { onToast('Member added'); setAdd(false); setNewUserId(''); setNewRole('member'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => authAdminApi.updateOrgMember(orgId, userId, role),
    onSuccess: () => { onToast('Member role updated'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const removeMut = useMutation({
    mutationFn: (userId: string) => authAdminApi.removeOrgMember(orgId, userId),
    onSuccess: () => { onToast('Member removed'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const assignMut = useMutation({
    mutationFn: (roleId: string) => authAdminApi.assignRoleUser(roleId, assign!.userId, orgId),
    onSuccess: () => { onToast('Role assigned to member'); setAssign(null); },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setAdd(true)}>Add member</Button>
      </Stack>
      <QueryState query={members} empty="No members.">
        {(d) => (
          <DataTable
            rows={d.members ?? d.data ?? []}
            rowKey={(m) => m.userId}
            columns={[
              { key: 'user', header: 'User', render: (m) => m.user?.email ?? m.user?.displayName ?? m.userId },
              {
                key: 'role',
                header: 'Org role',
                render: (m) => (
                  <TextField
                    select
                    size="small"
                    value={m.role ?? 'member'}
                    onChange={(e) => roleMut.mutate({ userId: m.userId, role: e.target.value })}
                    sx={{ minWidth: 120 }}
                  >
                    {ORG_MEMBER_ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </TextField>
                ),
              },
              { key: 'status', header: 'Status', render: (m) => <StatusChip status={m.status} /> },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (m) => (
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="Assign role (scoped to this org)">
                      <IconButton size="small" onClick={() => setAssign(m)}><SecurityIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Remove member">
                      <IconButton size="small" color="error" onClick={() => removeMut.mutate(m.userId)}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>

      <Dialog open={add} onClose={() => setAdd(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add member</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select fullWidth label="User" value={newUserId} onChange={(e) => setNewUserId(e.target.value)}>
              {(users.data?.users ?? []).map((u) => (
                <MenuItem key={u.id} value={u.id}>{u.email}{u.displayName ? ` (${u.displayName})` : ''}</MenuItem>
              ))}
            </TextField>
            <TextField select fullWidth label="Org role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {ORG_MEMBER_ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdd(false)}>Cancel</Button>
          <Button variant="contained" disabled={!newUserId || addMut.isPending} onClick={() => addMut.mutate()}>Add</Button>
        </DialogActions>
      </Dialog>

      <AssignRoleDialog
        open={!!assign}
        title={`Assign role to ${assign?.user?.email ?? assign?.userId ?? 'member'}`}
        roles={roles}
        busy={assignMut.isPending}
        onClose={() => setAssign(null)}
        onAssign={(roleId) => assignMut.mutate(roleId)}
      />
    </Stack>
  );
}

function OrgGroupsTab({ orgId, roles, onToast }: { orgId: string; roles: Role[]; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [create, setCreate] = useState(false);
  const [assign, setAssign] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const groups = useQuery({ queryKey: ['auth', 'org', orgId, 'groups'], queryFn: () => authAdminApi.listGroups({ organizationId: orgId }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth', 'org', orgId, 'groups'] });

  const createMut = useMutation({
    mutationFn: () => authAdminApi.createGroup({ name, description, organizationId: orgId }),
    onSuccess: () => { onToast('Group created'); setCreate(false); setName(''); setDescription(''); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => authAdminApi.deleteGroup(id),
    onSuccess: () => { onToast('Group deleted'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const assignMut = useMutation({
    mutationFn: (roleId: string) => authAdminApi.assignRoleGroup(roleId, assign!.id, orgId),
    onSuccess: () => { onToast('Role assigned to group'); setAssign(null); },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setCreate(true)}>New group</Button>
      </Stack>
      <QueryState query={groups} empty="No groups in this organization.">
        {(d) => (
          <DataTable
            rows={d.groups}
            rowKey={(g) => g.id}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'description', header: 'Description', render: (g) => g.description ?? '—' },
              { key: 'members', header: 'Members', align: 'right', render: (g) => g.members?.length ?? 0 },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (g) => (
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="Assign role (scoped to this org)">
                      <IconButton size="small" onClick={() => setAssign(g)}><SecurityIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Delete group">
                      <IconButton size="small" color="error" onClick={() => deleteMut.mutate(g.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>

      <Dialog open={create} onClose={() => setCreate(false)} fullWidth maxWidth="xs">
        <DialogTitle>New group</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField fullWidth label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreate(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name || createMut.isPending} onClick={() => createMut.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>

      <AssignRoleDialog
        open={!!assign}
        title={`Assign role to group "${assign?.name ?? ''}"`}
        roles={roles}
        busy={assignMut.isPending}
        onClose={() => setAssign(null)}
        onAssign={(roleId) => assignMut.mutate(roleId)}
      />
    </Stack>
  );
}

function OrgRolesTab({ orgId, onToast }: { orgId: string; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('0');
  const [perms, setPerms] = useState<string[]>([]);

  const roles = useQuery({ queryKey: ['auth', 'org', orgId, 'roles'], queryFn: () => authAdminApi.listRoles({ organizationId: orgId }) });
  const catalog = useQuery({ queryKey: ['auth', 'permissions'], queryFn: () => authAdminApi.listPermissions() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth', 'org', orgId, 'roles'] });

  const createMut = useMutation({
    mutationFn: () => authAdminApi.createRole({
      name,
      description,
      organizationId: orgId,
      priority: Number(priority) || 0,
      permissions: perms,
    }),
    onSuccess: () => { onToast('Role created'); setCreate(false); setName(''); setDescription(''); setPriority('0'); setPerms([]); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });

  const permOptions = (catalog.data?.permissions ?? catalog.data?.data ?? [])
    .map((p) => p.permissionString)
    .filter((s): s is string => !!s);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setCreate(true)}>New role</Button>
      </Stack>
      <QueryState query={roles} empty="No roles scoped to this organization.">
        {(d) => (
          <DataTable
            rows={(d.roles ?? d.data ?? []).filter((r) => r.organizationId === orgId)}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'priority', header: 'Priority', align: 'right', render: (r) => r.priority ?? 0 },
              {
                key: 'permissions',
                header: 'Permissions',
                render: (r) => (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(r.permissions ?? []).slice(0, 6).map((p) => <Chip key={p} size="small" label={p} />)}
                    {(r.permissions?.length ?? 0) > 6 && <Chip size="small" label={`+${(r.permissions!.length - 6)}`} />}
                    {(r.permissions?.length ?? 0) === 0 && '—'}
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>

      <Dialog open={create} onClose={() => setCreate(false)} fullWidth maxWidth="sm">
        <DialogTitle>New organization role</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField fullWidth label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <TextField fullWidth type="number" label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} />
            <Autocomplete
              multiple
              options={permOptions}
              value={perms}
              onChange={(_e, v) => setPerms(v)}
              loading={catalog.isLoading}
              renderInput={(params) => <TextField {...params} label="Permissions" placeholder="Add permissions…" />}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreate(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name || createMut.isPending} onClick={() => createMut.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function OrgPermissionsTab() {
  const perms = useQuery({ queryKey: ['auth', 'permissions'], queryFn: () => authAdminApi.listPermissions() });
  return (
    <Stack spacing={2}>
      <Alert severity="info">The permission catalog is the building block for roles. Create roles in the Roles tab, then assign them to users and groups (scoped to this organization) from the Users and Groups tabs.</Alert>
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
    </Stack>
  );
}

type OrgDetailTab = 'members' | 'groups' | 'roles' | 'permissions';

function OrganizationDetail({ org, onBack, onToast }: { org: Organization; onBack: () => void; onToast: (m: string) => void }) {
  const [tab, setTab] = useState<OrgDetailTab>('members');

  // The list row carries only a few columns; fetch the full record so every
  // stored field/setting can be extrapolated into the form. Fall back to the
  // list row while the fetch is in flight so the page renders immediately.
  const detail = useQuery({
    queryKey: ['auth', 'org', org.id, 'detail'],
    queryFn: () => authAdminApi.getOrganization(org.id),
  });
  const full = detail.data?.organization ?? org;

  // Org-scoped roles, shared by the Members/Groups assign dialogs.
  const orgRoles = useQuery({ queryKey: ['auth', 'org', org.id, 'roles'], queryFn: () => authAdminApi.listRoles({ organizationId: org.id }) });
  const roles = (orgRoles.data?.roles ?? orgRoles.data?.data ?? []).filter((r) => r.organizationId === org.id);

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>Organizations</Button>
        <Typography variant="h6">{full.name}</Typography>
        {full.slug && <Chip size="small" variant="outlined" label={full.slug} />}
        <StatusChip status={full.status} />
      </Stack>

      {detail.isError && <Alert severity="error">Could not load the full organization record; showing summary data.</Alert>}
      <OrgSettingsForm org={full} onToast={onToast} />

      <div>
        <SectionHeader title="Members, groups & roles" subtitle="Manage membership and role/permission scopes for this organization." />
        <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
          <Tab value="members" label="Users" />
          <Tab value="groups" label="Groups" />
          <Tab value="roles" label="Roles" />
          <Tab value="permissions" label="Permissions" />
        </Tabs>
        <Stack sx={{ mt: 2 }}>
          {tab === 'members' && <OrgMembersTab orgId={org.id} roles={roles} onToast={onToast} />}
          {tab === 'groups' && <OrgGroupsTab orgId={org.id} roles={roles} onToast={onToast} />}
          {tab === 'roles' && <OrgRolesTab orgId={org.id} onToast={onToast} />}
          {tab === 'permissions' && <OrgPermissionsTab />}
        </Stack>
      </div>
    </Stack>
  );
}

/* ---------------------------------------------------------- organizations === */

function OrganizationsTab({ onToast }: { onToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Organization | null>(null);
  const query = useQuery({ queryKey: ['auth', 'orgs'], queryFn: authAdminApi.listOrganizations });

  // Details opens the org's page: its stored settings extrapolated into editable
  // fields (2FA policy included), with membership/group/role management below.
  if (selected) {
    return <OrganizationDetail org={selected} onBack={() => setSelected(null)} onToast={onToast} />;
  }

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
              { key: 'mfa', header: '2FA', render: (o) => <StatusChip status={o.settings?.requireMfa ? 'required' : 'optional'} /> },
              { key: 'createdAt', header: 'Created', render: (o) => formatDate(o.createdAt) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (o) => (
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" onClick={() => setSelected(o)}>Details</Button>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <CreateOrgDialog open={open} onClose={() => setOpen(false)} onDone={onToast} />
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

/* ---------------------------------------------------------------- users -- */

function UsersTab() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<AuthUser | null>(null);
  const users = useQuery({ queryKey: ['auth', 'users', search], queryFn: () => authAdminApi.listUsers({ limit: 200, search }) });
  return (
    <Stack spacing={2}>
      <TextField size="small" label="Search by email or name" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ maxWidth: 360 }} />
      <QueryState query={users} empty="No users.">
        {(d) => (
          <DataTable
            rows={d.users}
            rowKey={(u) => u.id}
            columns={[
              { key: 'email', header: 'Email' },
              { key: 'displayName', header: 'Name', render: (u) => u.displayName ?? '—' },
              { key: 'status', header: 'Status', render: (u) => <StatusChip status={u.status} /> },
              { key: 'emailVerified', header: 'Verified', render: (u) => (u.emailVerified ? 'yes' : 'no') },
              { key: 'mfaEnabled', header: 'MFA', render: (u) => (u.mfaEnabled ? 'on' : 'off') },
              { key: 'lastLoginAt', header: 'Last login', render: (u) => formatDate(u.lastLoginAt ?? undefined) },
              { key: 'view', header: '', align: 'right', render: (u) => <Button size="small" onClick={() => setView(u)}>Details</Button> },
            ]}
          />
        )}
      </QueryState>
      <JsonDialog open={!!view} title={view?.email ?? 'User'} value={view} onClose={() => setView(null)} />
    </Stack>
  );
}

/* --------------------------------------------------------------- groups -- */

function GroupsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const groups = useQuery({ queryKey: ['auth', 'groups', 'all'], queryFn: () => authAdminApi.listGroups() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth', 'groups', 'all'] });

  const createMut = useMutation({
    mutationFn: () => authAdminApi.createGroup({ name, description }),
    onSuccess: () => { onToast('Group created'); setCreate(false); setName(''); setDescription(''); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => authAdminApi.deleteGroup(id),
    onSuccess: () => { onToast('Group deleted'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setCreate(true)}>New group</Button>
      </Stack>
      <QueryState query={groups} empty="No groups.">
        {(d) => (
          <DataTable
            rows={d.groups}
            rowKey={(g) => g.id}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'description', header: 'Description', render: (g) => g.description ?? '—' },
              { key: 'scope', header: 'Scope', render: (g) => (g.organizationId ? 'org' : 'global') },
              { key: 'members', header: 'Members', align: 'right', render: (g) => g.members?.length ?? 0 },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (g) => (
                  <Tooltip title="Delete group">
                    <IconButton size="small" color="error" onClick={() => deleteMut.mutate(g.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                ),
              },
            ]}
          />
        )}
      </QueryState>

      <Dialog open={create} onClose={() => setCreate(false)} fullWidth maxWidth="xs">
        <DialogTitle>New group</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField fullWidth label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreate(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name || createMut.isPending} onClick={() => createMut.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>
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

type AuthTab = 'orgs' | 'users' | 'groups' | 'roles' | 'sessions' | 'directory';

export function AuthSection() {
  const [tab, setTab] = useState<AuthTab>('orgs');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Auth & Identity" subtitle="Organizations, users, groups, roles & permissions, sessions — /auth/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="orgs" label="Organizations" />
        <Tab value="users" label="Users" />
        <Tab value="groups" label="Groups" />
        <Tab value="roles" label="Roles & Permissions" />
        <Tab value="sessions" label="Sessions" />
        <Tab value="directory" label="Directory" />
      </Tabs>
      {tab === 'orgs' && <OrganizationsTab onToast={showToast} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'groups' && <GroupsTab onToast={showToast} />}
      {tab === 'roles' && <RolesTab onToast={showToast} />}
      {tab === 'sessions' && <SessionsTab onToast={showToast} />}
      {tab === 'directory' && <DirectoryTab />}
      {ToastHost}
    </Stack>
  );
}
