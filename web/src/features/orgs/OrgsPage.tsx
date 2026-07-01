/**
 * Organizations (/orgs) — the org-admin surface. Lists the organizations you
 * belong to, and for those you administer (owner/admin) lets you manage members
 * and org-scoped low-code apps. All mutations are authorized server-side.
 */
import { useState } from 'react';
import {
  Stack, Box, Paper, Typography, Button, List, ListItemButton, ListItemText, Chip,
  CircularProgress, Alert, Divider, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/app/store';
import { organizationsApi, canAdminOrg, orgRole, type Organization, type OrgRole } from '@/api/organizations';
import { toMessage } from '@/lib/errors';
import ScopedAppsPanel from '@/features/apps/ScopedAppsPanel';

const ASSIGNABLE_ROLES: OrgRole[] = ['admin', 'member', 'guest'];

function CreateOrgDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (o: Organization) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => organizationsApi.createOrg({ name: name.trim() }),
    onSuccess: (res) => onCreated(res.organization),
    onError: (e) => setError(toMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New organization</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" fullWidth value={name} onChange={(e) => setName(e.target.value)} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={create.isPending || !name.trim()} onClick={() => { setError(null); create.mutate(); }}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

function MembersPanel({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<OrgRole>('member');
  const membersQ = useQuery({ queryKey: ['orgs', orgId, 'members'], queryFn: () => organizationsApi.members(orgId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['orgs', orgId, 'members'] });

  const add = useMutation({ mutationFn: () => organizationsApi.addMember(orgId, { userId: newUserId.trim(), role: newRole }), onSuccess: () => { setNewUserId(''); invalidate(); } });
  const setRole = useMutation({ mutationFn: (v: { userId: string; role: OrgRole }) => organizationsApi.updateMemberRole(orgId, v.userId, v.role), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (userId: string) => organizationsApi.removeMember(orgId, userId), onSuccess: invalidate });

  if (membersQ.isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (membersQ.isError) return <Alert severity="error">{toMessage(membersQ.error)}</Alert>;
  const members = membersQ.data?.members ?? [];

  return (
    <Stack spacing={2}>
      {canEdit && (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField size="small" label="User id" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} sx={{ minWidth: 260 }} />
          <TextField size="small" select label="Role" value={newRole} onChange={(e) => setNewRole(e.target.value as OrgRole)} sx={{ minWidth: 130 }}>
            {ASSIGNABLE_ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
          <Button variant="contained" startIcon={<AddIcon />} disabled={!newUserId.trim() || add.isPending} onClick={() => add.mutate()}>Add</Button>
        </Stack>
      )}
      {add.isError && <Alert severity="error">{toMessage(add.error)}</Alert>}
      <Paper variant="outlined">
        {!members.length ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>No members.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>User</TableCell><TableCell>Role</TableCell><TableCell>Status</TableCell>{canEdit && <TableCell align="right">Actions</TableCell>}</TableRow>
            </TableHead>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{m.userId}</TableCell>
                  <TableCell>
                    {canEdit && m.role !== 'owner' ? (
                      <TextField size="small" select value={m.role} onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value as OrgRole })} sx={{ minWidth: 120 }}>
                        {ASSIGNABLE_ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                      </TextField>
                    ) : <Chip size="small" label={m.role} />}
                  </TableCell>
                  <TableCell>{m.status ?? 'active'}</TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      {m.role !== 'owner' && (
                        <Tooltip title="Remove"><IconButton size="small" onClick={() => remove.mutate(m.userId)} disabled={remove.isPending}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}

export function OrgsPage() {
  const qc = useQueryClient();
  const userId = useAppStore((s) => s.user?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<'members' | 'apps'>('members');

  const orgsQ = useQuery({ queryKey: ['orgs'], queryFn: () => organizationsApi.myOrgs() });
  const orgs = orgsQ.data?.organizations ?? [];
  const selected: Organization | undefined = orgs.find((o) => o.id === selectedId) ?? orgs[0];
  const canEdit = selected ? canAdminOrg(selected, userId) : false;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center">
        <Box>
          <Typography variant="h5" gutterBottom>Organizations</Typography>
          <Typography variant="body2" color="text.secondary">Manage your organizations, members, and org-scoped apps.</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>New org</Button>
      </Stack>

      {orgsQ.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : orgsQ.isError ? (
        <Alert severity="error">{toMessage(orgsQ.error)}</Alert>
      ) : !orgs.length ? (
        <Alert severity="info">You don't belong to any organizations yet.</Alert>
      ) : (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start">
          <Paper variant="outlined" sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
            <List dense disablePadding>
              {orgs.map((o, i) => (
                <Box key={o.id}>
                  {i > 0 && <Divider component="li" />}
                  <ListItemButton selected={selected?.id === o.id} onClick={() => setSelectedId(o.id)}>
                    <ListItemText primary={o.name} secondary={orgRole(o) ?? 'member'} primaryTypographyProps={{ noWrap: true }} />
                    {o.plan && <Chip size="small" label={String(o.plan)} />}
                  </ListItemButton>
                </Box>
              ))}
            </List>
          </Paper>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            {selected ? (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6">{selected.name}</Typography>
                  <Typography variant="body2" color="text.secondary">Your role: {orgRole(selected) ?? 'member'}{canEdit ? ' · you can manage this org' : ''}</Typography>
                </Box>
                <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
                  <Tab value="members" label="Members" />
                  <Tab value="apps" label="Apps" />
                </Tabs>
                {tab === 'members'
                  ? <MembersPanel orgId={selected.id} canEdit={canEdit} />
                  : <ScopedAppsPanel scopeType="organization" scopeId={selected.id} canEdit={canEdit} />}
              </Stack>
            ) : <Typography color="text.secondary">Select an organization.</Typography>}
          </Box>
        </Stack>
      )}

      <CreateOrgDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(o) => { setCreateOpen(false); setSelectedId(o.id); qc.invalidateQueries({ queryKey: ['orgs'] }); }} />
    </Stack>
  );
}
