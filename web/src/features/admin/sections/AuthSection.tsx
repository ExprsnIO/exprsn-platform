import { Fragment, ReactNode, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SecurityIcon from '@mui/icons-material/Security';
import {
  authAdminApi,
  AUTH_CONFIG_SECTIONS,
  type AuthUser,
  type Group,
  type ImportResult,
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
import { Card, ConfigSectionEditor, DataTable, DataView, PermBadges, QueryState, SectionHeader, StatCard, StatusChip, useToast } from '../ui';

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
          <Alert severity="info">
            <strong>Enforced at login.</strong> When required, members who haven't set up 2FA are
            prompted to enrol during sign-in (password, OAuth, and re-mint paths) once their grace
            period elapses; a bearer is only issued after enrolment. Grace is measured from each
            member's account-creation date. Only TOTP + backup codes are available today — a policy
            restricted to other methods can't be enforced and is skipped.
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

  const groups = useQuery({ queryKey: ['auth', 'org', orgId, 'groups'], queryFn: () => authAdminApi.listGroups({ organizationId: orgId }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth', 'org', orgId, 'groups'] });

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
            rows={d.groups ?? []}
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

      <AdvancedGroupDialog
        open={create}
        organizationId={orgId}
        onClose={() => setCreate(false)}
        onDone={(m) => { onToast(m); invalidate(); }}
      />

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
  const query = useQuery({
    queryKey: ['auth', 'orgs', 'counts'],
    queryFn: () => authAdminApi.listOrganizations({ includeCounts: true }),
  });

  // Details opens the org's page: its stored settings extrapolated into editable
  // fields (2FA policy included), with membership/group/role management below.
  // Clicking anywhere on a row opens the same inspector.
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
            tableId="auth.orgs"
            sortable
            filterable
            onRowClick={(o) => setSelected(o)}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'slug', header: 'Slug', render: (o) => o.slug ?? '—' },
              { key: 'type', header: 'Type', defaultHidden: true, render: (o) => o.type ?? '—' },
              { key: 'plan', header: 'Plan', defaultHidden: true, render: (o) => o.plan ?? '—' },
              {
                key: 'status',
                header: 'Status',
                render: (o) => <StatusChip status={o.status} />,
                sortValue: (o) => o.status ?? '',
                filterValue: (o) => o.status ?? '',
              },
              {
                key: 'mfa',
                header: '2FA',
                render: (o) => <StatusChip status={o.settings?.requireMfa ? 'required' : 'optional'} />,
                sortValue: (o) => (o.settings?.requireMfa ? 1 : 0),
                filterValue: (o) => (o.settings?.requireMfa ? 'required' : 'optional'),
              },
              {
                key: 'groups',
                header: 'Groups',
                align: 'right',
                render: (o) => o.counts?.groups ?? '—',
                sortValue: (o) => o.counts?.groups ?? null,
                filterValue: (o) => String(o.counts?.groups ?? ''),
              },
              {
                key: 'users',
                header: 'Users',
                align: 'right',
                render: (o) => o.counts?.users ?? '—',
                sortValue: (o) => o.counts?.users ?? null,
                filterValue: (o) => String(o.counts?.users ?? ''),
              },
              {
                key: 'violations',
                header: 'Violations',
                align: 'right',
                render: (o) => o.counts?.violations ?? '—',
                sortValue: (o) => o.counts?.violations ?? null,
                filterValue: (o) => String(o.counts?.violations ?? ''),
              },
              {
                key: 'createdAt',
                header: 'Created',
                render: (o) => formatDate(o.createdAt),
                sortValue: (o) => o.createdAt ?? null,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                locked: true,
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

/** Starting points for the role dialog — permission sets stay editable. */
const ROLE_TEMPLATES: Array<{ key: string; label: string; description: string; permissions: string[]; priority: number }> = [
  { key: 'blank', label: 'Blank role', description: '', permissions: [], priority: 0 },
  { key: 'administrator', label: 'Administrator', description: 'Full platform access.', permissions: ['*'], priority: 100 },
  {
    key: 'moderator',
    label: 'Moderator',
    description: 'Reviews users, groups and content.',
    permissions: ['user:read', 'group:read', 'service:moderator:access'],
    priority: 50,
  },
  {
    key: 'member',
    label: 'Member',
    description: 'Standard signed-in member.',
    permissions: ['user:read', 'group:read'],
    priority: 10,
  },
  {
    key: 'auditor',
    label: 'Auditor (read-only)',
    description: 'Read access across the directory, never writes.',
    permissions: ['user:read', 'group:read', 'org:read', 'app:read'],
    priority: 5,
  },
  {
    key: 'service',
    label: 'Service account',
    description: 'Machine identity scoped to service access.',
    permissions: ['service:auth:access'],
    priority: 1,
  },
];

/**
 * Create a role (global or org-scoped) from a template or from scratch.
 */
function CreateRoleDialog({
  open,
  organizationId,
  onClose,
  onDone,
}: {
  open: boolean;
  organizationId?: string;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState('blank');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('0');
  const [perms, setPerms] = useState<string[]>([]);

  const catalog = useQuery({ queryKey: ['auth', 'permissions'], queryFn: () => authAdminApi.listPermissions(), enabled: open });

  useEffect(() => {
    if (!open) { setTemplate('blank'); setName(''); setDescription(''); setPriority('0'); setPerms([]); }
  }, [open]);

  const applyTemplate = (key: string) => {
    setTemplate(key);
    const t = ROLE_TEMPLATES.find((x) => x.key === key);
    if (t) {
      setPerms(t.permissions);
      setPriority(String(t.priority));
      if (t.key !== 'blank' && !description) setDescription(t.description);
    }
  };

  const permOptions = Array.from(new Set([
    ...(catalog.data?.permissions ?? catalog.data?.data ?? []).map((p) => p.permissionString).filter((s): s is string => !!s),
    '*',
  ]));

  const mut = useMutation({
    mutationFn: () => authAdminApi.createRole({
      name,
      description,
      organizationId,
      priority: Number(priority) || 0,
      permissions: perms,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'roles'] });
      onDone('Role created');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{organizationId ? 'New organization role' : 'New role'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select fullWidth label="Template" value={template} onChange={(e) => applyTemplate(e.target.value)}
            helperText="Presets fill permissions and priority — everything stays editable.">
            {ROLE_TEMPLATES.map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
          </TextField>
          <TextField autoFocus fullWidth required label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField fullWidth label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <TextField fullWidth type="number" label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}
            helperText="Higher priority wins when role permissions conflict." />
          <Autocomplete
            multiple
            freeSolo
            options={permOptions}
            value={perms}
            onChange={(_e, v) => setPerms(v as string[])}
            loading={catalog.isLoading}
            renderInput={(params) => <TextField {...params} label="Permissions" placeholder="Add permissions…" />}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name || mut.isPending} onClick={() => mut.mutate()}>Create role</Button>
      </DialogActions>
    </Dialog>
  );
}

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

function RolesTab({ onToast }: { onToast: (m: string) => void }) {
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
              sortable
              filterable
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

/**
 * Full user inspector — everything the platform knows about the user:
 * profile, organizations (with member role), groups, roles, resolved
 * permissions, and recent sessions. Backed by GET /users/:id/detail.
 */
function UserDetailView({ user, onBack }: { user: AuthUser; onBack: () => void }) {
  const detail = useQuery({
    queryKey: ['auth', 'user', user.id, 'detail'],
    queryFn: () => authAdminApi.getUserDetail(user.id),
  });
  const d = detail.data;
  const profile = d?.user ?? user;

  const profileRows: Array<[string, ReactNode]> = [
    ['Email', profile.email],
    ['Display name', profile.displayName ?? '—'],
    ['First name', profile.firstName ?? '—'],
    ['Last name', profile.lastName ?? '—'],
    ['Status', <StatusChip key="s" status={profile.status} />],
    ['Email verified', profile.emailVerified ? 'yes' : 'no'],
    ['MFA', profile.mfaEnabled ? 'enabled' : 'off'],
    ['Last login', formatDate(profile.lastLoginAt ?? undefined)],
    ['Created', formatDate(profile.createdAt)],
    ['User ID', <Typography key="id" component="span" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{profile.id}</Typography>],
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>Users</Button>
        <Typography variant="h6">{profile.email}</Typography>
        <StatusChip status={profile.status} />
      </Stack>

      {detail.isError && <Alert severity="error">Could not load the full user record; showing summary data.</Alert>}

      <Card title="Profile">
        <Stack spacing={0.75} sx={{ display: 'grid', gridTemplateColumns: 'minmax(150px, max-content) 1fr', columnGap: 2.5, rowGap: 0.75, alignItems: 'baseline' }}>
          {profileRows.map(([label, value]) => (
            <Fragment key={label}>
              <Typography component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>{label}</Typography>
              <Typography component="span" sx={{ fontSize: 14 }}>{value}</Typography>
            </Fragment>
          ))}
        </Stack>
      </Card>

      <Card title="Organizations">
        {(d?.organizations?.length ?? 0) === 0 ? (
          <Alert severity="info">Not a member of any organization.</Alert>
        ) : (
          <DataTable
            rows={d!.organizations}
            rowKey={(o) => o.id}
            columns={[
              { key: 'name', header: 'Organization', render: (o) => o.name ?? o.id },
              { key: 'memberRole', header: 'Member role', render: (o) => o.memberRole ?? '—' },
              { key: 'memberStatus', header: 'Membership', render: (o) => <StatusChip status={o.memberStatus ?? undefined} /> },
              { key: 'status', header: 'Org status', render: (o) => <StatusChip status={o.status} /> },
            ]}
          />
        )}
      </Card>

      <Card title="Groups">
        {(d?.groups?.length ?? 0) === 0 ? (
          <Alert severity="info">No group memberships.</Alert>
        ) : (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {d!.groups.map((g) => (
              <Chip key={g.id} size="small" variant="outlined" label={g.name} title={g.description ?? undefined} />
            ))}
          </Stack>
        )}
      </Card>

      <Card title="Roles">
        {(d?.roles?.length ?? 0) === 0 ? (
          <Alert severity="info">No roles assigned.</Alert>
        ) : (
          <DataTable
            rows={d!.roles}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: 'Role' },
              { key: 'type', header: 'Type', render: (r) => r.type ?? '—' },
              { key: 'scope', header: 'Scope', render: (r) => (r.organizationId ? 'org' : 'global') },
              {
                key: 'permissions',
                header: 'Permissions',
                render: (r) => (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(r.permissions ?? []).slice(0, 6).map((p) => <Chip key={p} size="small" label={p} />)}
                    {(r.permissions?.length ?? 0) > 6 && <Chip size="small" label={`+${r.permissions!.length - 6}`} />}
                    {(r.permissions?.length ?? 0) === 0 && '—'}
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </Card>

      {d?.permissions != null && (
        <Card title="Resolved permissions">
          <DataView value={d.permissions} />
        </Card>
      )}

      <Card title="Recent sessions">
        {(d?.sessions?.length ?? 0) === 0 ? (
          <Alert severity="info">No sessions recorded.</Alert>
        ) : (
          <DataTable
            rows={d!.sessions}
            rowKey={(s) => s.id}
            columns={[
              { key: 'ipAddress', header: 'IP', mono: true, render: (s) => s.ipAddress ?? '—' },
              { key: 'userAgent', header: 'User agent', render: (s) => (s.userAgent ?? '—').slice(0, 60) },
              { key: 'createdAt', header: 'Started', render: (s) => formatDate(s.createdAt) },
              { key: 'lastActivityAt', header: 'Last active', render: (s) => formatDate(s.lastActivityAt) },
            ]}
          />
        )}
      </Card>
    </Stack>
  );
}

function UsersTab() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<AuthUser | null>(null);
  const users = useQuery({ queryKey: ['auth', 'users', search], queryFn: () => authAdminApi.listUsers({ limit: 200, search }) });

  // Row click and the Details button both open the full inspector.
  if (view) {
    return <UserDetailView user={view} onBack={() => setView(null)} />;
  }

  return (
    <Stack spacing={2}>
      <TextField size="small" label="Search by email or name" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ maxWidth: 360 }} />
      <QueryState query={users} empty="No users.">
        {(d) => (
          <DataTable
            rows={d.users ?? []}
            rowKey={(u) => u.id}
            tableId="auth.users"
            sortable
            filterable
            onRowClick={(u) => setView(u)}
            columns={[
              { key: 'email', header: 'Email' },
              { key: 'displayName', header: 'Name', render: (u) => u.displayName ?? '—' },
              { key: 'firstName', header: 'First name', defaultHidden: true, render: (u) => u.firstName ?? '—' },
              { key: 'lastName', header: 'Last name', defaultHidden: true, render: (u) => u.lastName ?? '—' },
              {
                key: 'status',
                header: 'Status',
                render: (u) => <StatusChip status={u.status} />,
                sortValue: (u) => u.status ?? '',
                filterValue: (u) => u.status ?? '',
              },
              {
                key: 'emailVerified',
                header: 'Verified',
                render: (u) => (u.emailVerified ? 'yes' : 'no'),
                sortValue: (u) => (u.emailVerified ? 1 : 0),
                filterValue: (u) => (u.emailVerified ? 'yes' : 'no'),
              },
              {
                key: 'mfaEnabled',
                header: 'MFA',
                render: (u) => (u.mfaEnabled ? 'on' : 'off'),
                sortValue: (u) => (u.mfaEnabled ? 1 : 0),
                filterValue: (u) => (u.mfaEnabled ? 'on' : 'off'),
              },
              {
                key: 'lastLoginAt',
                header: 'Last login',
                render: (u) => formatDate(u.lastLoginAt ?? undefined),
                sortValue: (u) => u.lastLoginAt ?? null,
              },
              {
                key: 'createdAt',
                header: 'Created',
                defaultHidden: true,
                render: (u) => formatDate(u.createdAt),
                sortValue: (u) => u.createdAt ?? null,
              },
              { key: 'view', header: '', align: 'right', locked: true, render: (u) => <Button size="small" onClick={() => setView(u)}>Details</Button> },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

/* --------------------------------------------------------------- groups -- */

/** Base-permission flags an auth group can carry (RWAUD). */
type GroupPerms = { read: boolean; write: boolean; append: boolean; update: boolean; delete: boolean };

const NO_PERMS: GroupPerms = { read: false, write: false, append: false, update: false, delete: false };

/** Starting points for the advanced group dialog. */
const GROUP_TEMPLATES: Array<{ key: string; label: string; description: string; permissions: GroupPerms }> = [
  { key: 'blank', label: 'Blank', description: '', permissions: NO_PERMS },
  {
    key: 'team',
    label: 'Team',
    description: 'General collaboration group — members can read and contribute content.',
    permissions: { read: true, write: true, append: true, update: true, delete: false },
  },
  {
    key: 'readonly',
    label: 'Read-only / Auditors',
    description: 'Members can view but never change anything.',
    permissions: { read: true, write: false, append: false, update: false, delete: false },
  },
  {
    key: 'moderators',
    label: 'Moderators',
    description: 'Members review and act on content (edit/remove) without authoring rights.',
    permissions: { read: true, write: false, append: false, update: true, delete: true },
  },
  {
    key: 'admins',
    label: 'Administrators',
    description: 'Full base permissions. Combine with an admin role binding for elevated API access.',
    permissions: { read: true, write: true, append: true, update: true, delete: true },
  },
];

const PERM_LABELS: Array<{ key: keyof GroupPerms; label: string }> = [
  { key: 'read', label: 'Read' },
  { key: 'write', label: 'Write' },
  { key: 'append', label: 'Append' },
  { key: 'update', label: 'Update' },
  { key: 'delete', label: 'Delete' },
];

/**
 * Advanced group creation: template presets, scope (global or organization),
 * optional parent group, base R/W/A/U/D permissions, and role bindings that
 * are applied (assign-group) right after creation — members of the group then
 * inherit those roles.
 */
export function AdvancedGroupDialog({
  open,
  organizationId,
  onClose,
  onDone,
}: {
  open: boolean;
  /** Pin the group to one organization (hides the org picker). */
  organizationId?: string;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState('blank');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [orgId, setOrgId] = useState('');
  const [parentId, setParentId] = useState('');
  const [perms, setPerms] = useState<GroupPerms>(NO_PERMS);
  const [roleIds, setRoleIds] = useState<string[]>([]);

  const orgs = useQuery({ queryKey: ['auth', 'orgs'], queryFn: () => authAdminApi.listOrganizations(), enabled: open && !organizationId });
  const groups = useQuery({ queryKey: ['auth', 'groups', 'all'], queryFn: () => authAdminApi.listGroups(), enabled: open });
  const roles = useQuery({ queryKey: ['auth', 'roles'], queryFn: () => authAdminApi.listRoles(), enabled: open });

  useEffect(() => {
    if (!open) {
      setTemplate('blank'); setName(''); setDescription(''); setOrgId('');
      setParentId(''); setPerms(NO_PERMS); setRoleIds([]);
    }
  }, [open]);

  const applyTemplate = (key: string) => {
    setTemplate(key);
    const t = GROUP_TEMPLATES.find((x) => x.key === key);
    if (t) {
      setPerms(t.permissions);
      if (t.key !== 'blank' && !description) setDescription(t.description);
    }
  };

  const effectiveOrg = organizationId ?? (orgId || undefined);
  const roleOptions = (roles.data?.roles ?? roles.data?.data ?? []).filter(
    (r) => !r.organizationId || r.organizationId === effectiveOrg,
  );

  const mut = useMutation({
    mutationFn: async () => {
      const { group } = await authAdminApi.createGroup({
        name,
        description,
        organizationId: effectiveOrg,
        parentId: parentId || undefined,
        permissions: perms,
      });
      // Role-to-group bindings: everyone in the group inherits these roles.
      const failures: string[] = [];
      for (const roleId of roleIds) {
        try {
          await authAdminApi.assignRoleGroup(roleId, group.id, effectiveOrg);
        } catch (e) {
          failures.push((e as Error).message);
        }
      }
      return { group, failures };
    },
    onSuccess: ({ failures }) => {
      qc.invalidateQueries({ queryKey: ['auth', 'groups'] });
      onDone(failures.length ? `Group created; ${failures.length} role binding(s) failed: ${failures[0]}` : 'Group created');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New group</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select fullWidth label="Template" value={template} onChange={(e) => applyTemplate(e.target.value)}
            helperText="Presets fill the base permissions below — everything stays editable.">
            {GROUP_TEMPLATES.map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
          </TextField>
          <TextField autoFocus fullWidth required label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField fullWidth label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
          {!organizationId && (
            <TextField select fullWidth label="Organization" value={orgId} onChange={(e) => setOrgId(e.target.value)}
              helperText="Leave empty for a global group.">
              <MenuItem value="">Global (no organization)</MenuItem>
              {(orgs.data?.organizations ?? orgs.data?.data ?? []).map((o) => (
                <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
              ))}
            </TextField>
          )}
          <TextField select fullWidth label="Parent group" value={parentId} onChange={(e) => setParentId(e.target.value)}
            helperText="Optional — nests this group under another.">
            <MenuItem value="">None</MenuItem>
            {(groups.data?.groups ?? [])
              .filter((g) => (g.organizationId ?? undefined) === effectiveOrg || !g.organizationId)
              .map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
          </TextField>

          <div>
            <Typography variant="subtitle2" gutterBottom>Base permissions</Typography>
            <FormGroup row>
              {PERM_LABELS.map(({ key, label }) => (
                <FormControlLabel
                  key={key}
                  control={<Checkbox checked={perms[key]} onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))} />}
                  label={label}
                />
              ))}
            </FormGroup>
          </div>

          <Autocomplete
            multiple
            options={roleOptions}
            getOptionLabel={(r) => r.name ?? r.id}
            value={roleOptions.filter((r) => roleIds.includes(r.id))}
            onChange={(_e, v) => setRoleIds(v.map((r) => r.id))}
            loading={roles.isLoading}
            renderInput={(params) => (
              <TextField {...params} label="Bind roles to this group" placeholder="Add roles…"
                helperText="Members of the group inherit these roles (role-to-group binding)." />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name || mut.isPending} onClick={() => mut.mutate()}>Create group</Button>
      </DialogActions>
    </Dialog>
  );
}

function GroupsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [create, setCreate] = useState(false);
  const groups = useQuery({ queryKey: ['auth', 'groups', 'all'], queryFn: () => authAdminApi.listGroups() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth', 'groups', 'all'] });

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
            rows={d.groups ?? []}
            rowKey={(g) => g.id}
            tableId="auth.groups"
            sortable
            filterable
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'description', header: 'Description', render: (g) => g.description ?? '—' },
              {
                key: 'scope',
                header: 'Scope',
                render: (g) => (g.organizationId ? 'org' : 'global'),
                sortValue: (g) => (g.organizationId ? 'org' : 'global'),
                filterValue: (g) => (g.organizationId ? 'org' : 'global'),
              },
              {
                key: 'permissions',
                header: 'Base perms',
                render: (g) => <PermBadges perms={(g.permissions as Record<string, boolean>) ?? {}} />,
                filterValue: (g) => Object.entries((g.permissions as Record<string, boolean>) ?? {}).filter(([, v]) => v).map(([k]) => k).join(' '),
              },
              {
                key: 'members',
                header: 'Members',
                align: 'right',
                render: (g) => g.members?.length ?? 0,
                sortValue: (g) => g.members?.length ?? 0,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                locked: true,
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

      <AdvancedGroupDialog open={create} onClose={() => setCreate(false)} onDone={onToast} />
    </Stack>
  );
}

/* ------------------------------------------------------------- directory - */

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

/**
 * CSV import dialog for users or groups. Paste CSV or pick a file; rows are
 * previewed, submitted as JSON, and per-row outcomes are reported back.
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
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const rows = parseCsv(text);
  const expected = kind === 'users' ? 'email,displayName,firstName,lastName,status' : 'name,description,organizationId';

  useEffect(() => {
    if (!open) { setText(''); setResult(null); }
  }, [open]);

  const pickFile = (file: File | null) => {
    if (!file) return;
    file.text().then(setText).catch(() => onDone('Could not read file'));
  };

  const mut = useMutation({
    mutationFn: () => (kind === 'users' ? authAdminApi.importUsers(rows) : authAdminApi.importGroups(rows)),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['auth', kind === 'users' ? 'users' : 'groups'] });
      onDone(`Import finished — ${r.created} created, ${r.skipped} skipped, ${r.failed} failed`);
    },
    onError: (e) => onDone((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import {kind}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            CSV with a header row. Expected columns: <code>{expected}</code>
            {kind === 'users' ? ' (email is required).' : ' (name is required).'}
          </Alert>
          <Button component="label" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
            Choose CSV file…
            <input hidden type="file" accept=".csv,text/csv" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </Button>
          <TextField
            label="CSV content"
            multiline
            minRows={6}
            maxRows={16}
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            placeholder={`${expected}\n…`}
          />
          {rows.length > 0 && !result && <Alert severity="success">{rows.length} row(s) parsed and ready to import.</Alert>}
          {result && (
            <DataTable
              rows={result.rows}
              rowKey={(r, i) => `${r.email ?? r.name ?? i}-${i}`}
              columns={[
                { key: 'subject', header: kind === 'users' ? 'Email' : 'Name', render: (r) => r.email ?? r.name ?? '—' },
                { key: 'outcome', header: 'Outcome', render: (r) => <StatusChip status={r.outcome === 'created' ? 'completed' : r.outcome} /> },
                { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '—' },
              ]}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
        {!result && (
          <Button variant="contained" disabled={rows.length === 0 || mut.isPending} onClick={() => mut.mutate()}>
            Import {rows.length > 0 ? `${rows.length} row(s)` : ''}
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
function DirectoryTab({ onToast, onNavigate }: { onToast: (m: string) => void; onNavigate: (tab: AuthTab) => void }) {
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
      {tab === 'directory' && <DirectoryTab onToast={showToast} onNavigate={setTab} />}
      {ToastHost}
    </Stack>
  );
}
