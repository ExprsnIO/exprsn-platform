import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Autocomplete,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { authAdminApi } from '@/api/admin/auth';

/** The Auth section's top-level tabs — shared so DirectoryTab can navigate. */
export type AuthTab = 'orgs' | 'users' | 'groups' | 'roles' | 'sessions' | 'directory';

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
export function CreateRoleDialog({
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
