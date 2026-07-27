import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  nexusAdminApi,
  rows,
  NEXUS_CONFIG_SECTIONS,
  type Group,
  type Flag,
  type ModCase,
  type Proposal,
  type NexusEvent,
  type Subgroup,
  type GroupMember,
  type GroupStats,
  type PlatformStats,
  type AuditEntry,
} from '@/api/admin/nexus';
import type { AssignableRole, GroupVisibility, JoinMode, SubGroupType, SubGroupVisibility } from '@/api/nexus';
import { formatDate } from '@/features/files/util';
import { Card, ConfigSectionEditor, DataTable, DataView, JsonDialog, Loading, QueryState, SectionHeader, StatCard, StatusChip, useToast } from '../ui';

const VISIBILITIES: GroupVisibility[] = ['public', 'private', 'unlisted'];
const JOIN_MODES: JoinMode[] = ['open', 'request', 'invite'];
const MEMBER_ROLES: AssignableRole[] = ['admin', 'moderator', 'member'];
const SUBGROUP_TYPES: SubGroupType[] = ['channel', 'subgroup'];
const SUBGROUP_VISIBILITIES: SubGroupVisibility[] = ['public', 'members', 'restricted'];
const PERIODS = ['7d', '30d', '90d'];

/* ============================================================= edit group === */

function EditGroupDialog({ group, open, onClose, onToast }: { group: Group; open: boolean; onClose: () => void; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('public');
  const [joinMode, setJoinMode] = useState<JoinMode>('open');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');

  // Re-hydrate fields whenever the dialog opens for a (possibly new) group.
  useEffect(() => {
    if (!open) return;
    setName(group.name ?? '');
    setDescription(group.description ?? '');
    setVisibility(group.visibility ?? 'public');
    setJoinMode(group.joinMode ?? 'open');
    setCategory(group.category ?? '');
    setTags((group.tags ?? []).join(', '));
    setLocation(typeof group.location === 'string' ? group.location : '');
    setWebsite(typeof group.website === 'string' ? group.website : '');
  }, [open, group]);

  const mut = useMutation({
    mutationFn: () =>
      nexusAdminApi.updateGroup(group.id, {
        name,
        description: description || null,
        visibility,
        joinMode,
        category: category || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        location: location || null,
        website: website || null,
      }),
    onSuccess: () => {
      onToast('Group updated');
      qc.invalidateQueries({ queryKey: ['nexus', 'groups'] });
      qc.invalidateQueries({ queryKey: ['nexus', 'group', group.id] });
      onClose();
    },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit group</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} fullWidth />
          <Stack direction="row" spacing={2}>
            <TextField select label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as GroupVisibility)} fullWidth>
              {VISIBILITIES.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
            <TextField select label="Join mode" value={joinMode} onChange={(e) => setJoinMode(e.target.value as JoinMode)} fullWidth>
              {JOIN_MODES.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} helperText="Optional category key." fullWidth />
          <TextField label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} helperText="Comma-separated." fullWidth />
          <TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth />
          <TextField label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name || mut.isPending} onClick={() => mut.mutate()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ------------------------------------------------------ confirm dialog ----- */

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography variant="body2">{message}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ============================================== group overview (Phase 1+4) === */

function GroupOverviewSubTab({ group, onToast, onDeleted }: { group: Group; onToast: (m: string) => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState('30d');
  const [edit, setEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detail = useQuery({ queryKey: ['nexus', 'group', group.id], queryFn: () => nexusAdminApi.getGroup(group.id) });
  const stats = useQuery({ queryKey: ['nexus', 'group', group.id, 'stats', period], queryFn: () => nexusAdminApi.groupStats(group.id, period) });
  const full = detail.data?.group ?? group;

  const deleteMut = useMutation({
    mutationFn: () => nexusAdminApi.deleteGroup(group.id),
    onSuccess: () => {
      onToast('Group deleted');
      qc.invalidateQueries({ queryKey: ['nexus', 'groups'] });
      setConfirmDelete(false);
      onDeleted();
    },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Card
        title="Group details"
        actions={
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={() => setEdit(true)}>Edit</Button>
            <Button size="small" variant="outlined" color="error" onClick={() => setConfirmDelete(true)}>Delete</Button>
          </Stack>
        }
      >
        <DataView value={full} />
      </Card>

      <Card
        title="Statistics"
        actions={
          <TextField select size="small" value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ minWidth: 110 }}>
            {PERIODS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </TextField>
        }
      >
        <QueryState query={stats} empty="No statistics.">
          {(d) => <GroupStatsView stats={d} />}
        </QueryState>
      </Card>

      <EditGroupDialog group={full} open={edit} onClose={() => setEdit(false)} onToast={onToast} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete group"
        message={`Delete "${full.name}"? This soft-deletes the group and removes it from listings.`}
        confirmLabel="Delete group"
        busy={deleteMut.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMut.mutate()}
      />
    </Stack>
  );
}

function GroupStatsView({ stats }: { stats: GroupStats }) {
  const t = stats.totals;
  const series = stats.growth?.series ?? [];
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <StatCard label="Members" value={t?.members} />
        <StatCard label="Active members" value={t?.activeMembers} />
        <StatCard label="Events" value={t?.events} />
        <StatCard label="Proposals" value={t?.proposals} hint={`${t?.activeProposals ?? 0} active`} />
        <StatCard label="Flags" value={t?.flags} hint={`${t?.pendingFlags ?? 0} pending`} />
      </Stack>
      {stats.activity && (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <StatCard label="New members" value={stats.activity.recentMembers} hint={`last ${stats.growth?.days ?? ''}d`} />
          <StatCard label="New events" value={stats.activity.recentEvents} hint={`last ${stats.growth?.days ?? ''}d`} />
          <StatCard label="New flags" value={stats.activity.recentFlags} hint={`last ${stats.growth?.days ?? ''}d`} />
        </Stack>
      )}
      {series.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Growth ({stats.growth?.period})</Typography>
          <DataTable
            rows={series}
            rowKey={(s, i) => s.date ?? String(i)}
            columns={[
              { key: 'date', header: 'Date', render: (s) => s.date ?? '—' },
              { key: 'members', header: 'Members', align: 'right', render: (s) => s.members ?? 0 },
              { key: 'events', header: 'Events', align: 'right', render: (s) => s.events ?? 0 },
              { key: 'flags', header: 'Flags', align: 'right', render: (s) => s.flags ?? 0 },
            ]}
          />
        </Box>
      )}
    </Stack>
  );
}

/* ================================================== members (Phase 1) ====== */

function GroupMembersSubTab({ groupId, onToast }: { groupId: string; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [remove, setRemove] = useState<GroupMember | null>(null);
  const query = useQuery({ queryKey: ['nexus', 'members', groupId], queryFn: () => nexusAdminApi.listMembers(groupId, { limit: 100 }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['nexus', 'members', groupId] });

  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AssignableRole }) => nexusAdminApi.changeMemberRole(groupId, userId, role),
    onSuccess: () => { onToast('Member role updated'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  const removeMut = useMutation({
    mutationFn: (userId: string) => nexusAdminApi.removeMember(groupId, userId),
    onSuccess: () => { onToast('Member removed'); setRemove(null); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <QueryState query={query} empty="No members.">
        {(d) => (
          <DataTable
            rows={(d.members ?? d.data ?? []) as GroupMember[]}
            rowKey={(m) => m.id ?? m.userId}
            columns={[
              { key: 'userId', header: 'User', mono: true, render: (m) => m.userId },
              {
                key: 'role',
                header: 'Role',
                render: (m) =>
                  m.role === 'owner' ? (
                    <StatusChip status="owner" />
                  ) : (
                    <TextField
                      select
                      size="small"
                      value={m.role ?? 'member'}
                      onChange={(e) => roleMut.mutate({ userId: m.userId, role: e.target.value as AssignableRole })}
                      sx={{ minWidth: 130 }}
                    >
                      {MEMBER_ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </TextField>
                  ),
              },
              { key: 'status', header: 'Status', render: (m) => <StatusChip status={m.status} /> },
              { key: 'joinedAt', header: 'Joined', render: (m) => formatDate(m.joinedAt) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (m) => (
                  <Tooltip title={m.role === 'owner' ? 'Owners cannot be removed' : 'Remove member'}>
                    <span>
                      <IconButton size="small" color="error" aria-label="Remove member" disabled={m.role === 'owner'} onClick={() => setRemove(m)}><DeleteIcon fontSize="small" /></IconButton>
                    </span>
                  </Tooltip>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <ConfirmDialog
        open={!!remove}
        title="Remove member"
        message={`Remove member ${remove?.userId ?? ''} from this group?`}
        confirmLabel="Remove"
        busy={removeMut.isPending}
        onClose={() => setRemove(null)}
        onConfirm={() => remove && removeMut.mutate(remove.userId)}
      />
    </Stack>
  );
}

/* ============================================== moderation (Phase 2) ======= */

function AssignModeratorsDialog({ caseId, open, onClose, onToast }: { caseId: string; open: boolean; onClose: () => void; onToast: (m: string) => void }) {
  const [ids, setIds] = useState('');
  useEffect(() => { if (open) setIds(''); }, [open]);
  const mut = useMutation({
    mutationFn: () => nexusAdminApi.caseAssign(caseId, ids.split(',').map((s) => s.trim()).filter(Boolean)),
    onSuccess: () => { onToast('Moderators assigned'); onClose(); },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Assign moderators</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Moderator user IDs"
          value={ids}
          onChange={(e) => setIds(e.target.value)}
          helperText="Comma-separated user IDs."
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!ids.trim() || mut.isPending} onClick={() => mut.mutate()}>Assign</Button>
      </DialogActions>
    </Dialog>
  );
}

function ModerationPanel({ groupId, onToast }: { groupId: string; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [caseId, setCaseId] = useState('');
  const [assign, setAssign] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const flags = useQuery({ queryKey: ['nexus', 'flags', groupId], queryFn: () => nexusAdminApi.flags(groupId, { limit: 50 }), enabled: !!groupId });
  const queue = useQuery({ queryKey: ['nexus', 'queue', groupId], queryFn: () => nexusAdminApi.queue(groupId, { limit: 50 }), enabled: !!groupId });

  const action = (type: string) => {
    if (!caseId) return onToast('Select or enter a case id first');
    nexusAdminApi.caseAction(caseId, type, `${type} from admin console`).then(() => {
      onToast(`Case ${type}`);
      qc.invalidateQueries({ queryKey: ['nexus', 'queue', groupId] });
    }).catch((e) => onToast((e as Error).message));
  };
  const resolveFlag = (flagId: string, resolution: 'dismiss' | 'escalate') => {
    nexusAdminApi.resolveFlag(flagId, { resolution, reason: `${resolution} from admin console` }).then(() => {
      onToast(`Flag ${resolution === 'dismiss' ? 'dismissed' : 'escalated'}`);
      qc.invalidateQueries({ queryKey: ['nexus', 'flags', groupId] });
      qc.invalidateQueries({ queryKey: ['nexus', 'queue', groupId] });
    }).catch((e) => onToast((e as Error).message));
  };

  return (
    <Stack spacing={2}>
      <Card title="Flags">
        <QueryState query={flags} empty="No flags.">
          {(d) => (
            <DataTable
              rows={rows<Flag>(d, 'flags', 'data')}
              rowKey={(f) => f.id}
              columns={[
                { key: 'contentType', header: 'Content', render: (f) => `${f.contentType ?? ''}` },
                { key: 'flagReason', header: 'Reason', render: (f) => f.flagReason ?? '—' },
                { key: 'priority', header: 'Priority', render: (f) => f.priority ?? '—' },
                { key: 'status', header: 'Status', render: (f) => <StatusChip status={f.status} /> },
                { key: 'createdAt', header: 'When', render: (f) => formatDate(f.createdAt) },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (f) => (
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Button size="small" onClick={() => resolveFlag(f.id, 'dismiss')}>Dismiss</Button>
                      <Button size="small" color="warning" onClick={() => resolveFlag(f.id, 'escalate')}>Escalate</Button>
                    </Stack>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card title="Case queue">
        <QueryState query={queue} empty="No open cases.">
          {(d) => (
            <DataTable
              rows={rows<ModCase>(d, 'cases', 'queue', 'data')}
              rowKey={(c) => c.id}
              columns={[
                { key: 'id', header: 'Case', mono: true, render: (c) => `${c.id.slice(0, 8)}…` },
                { key: 'contentType', header: 'Content', render: (c) => c.contentType ?? '—' },
                { key: 'priority', header: 'Priority', render: (c) => c.priority ?? '—' },
                { key: 'status', header: 'Status', render: (c) => <StatusChip status={c.status} /> },
                {
                  key: 'use',
                  header: '',
                  align: 'right',
                  render: (c) => (
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Button size="small" onClick={() => setCaseId(c.id)}>Select</Button>
                      <Button size="small" onClick={() => setAssign(c.id)}>Assign</Button>
                    </Stack>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card title="Case action">
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField size="small" label="Case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} sx={{ minWidth: 300 }} />
          <Button size="small" variant="outlined" onClick={() => action('warn')}>Warn</Button>
          <Button size="small" variant="outlined" color="warning" onClick={() => action('remove')}>Remove</Button>
          <Button size="small" variant="outlined" color="error" onClick={() => action('ban')}>Ban</Button>
          <Button size="small" disabled={!caseId} onClick={() => setAssign(caseId)}>Assign moderators</Button>
          <Button size="small" disabled={!caseId} onClick={() => nexusAdminApi.caseDetail(caseId).then((v) => setView({ title: 'Case detail', value: v })).catch((e) => onToast((e as Error).message))}>View detail</Button>
        </Stack>
      </Card>
      <AssignModeratorsDialog caseId={assign} open={!!assign} onClose={() => setAssign('')} onToast={onToast} />
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ============================================== governance (Phase 3) ======= */

function GovernancePanel({ groupId, onToast }: { groupId: string; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['nexus', 'proposals', groupId], queryFn: () => nexusAdminApi.proposals(groupId, { limit: 50 }), enabled: !!groupId });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['nexus', 'proposals', groupId] });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); invalidate(); }).catch((e) => onToast((e as Error).message));
  return (
    <QueryState query={query} empty="No proposals.">
      {(d) => (
        <DataTable
          rows={rows<Proposal>(d, 'proposals', 'data')}
          rowKey={(p) => p.id}
          columns={[
            { key: 'title', header: 'Title', render: (p) => p.title ?? '—' },
            { key: 'proposalType', header: 'Type', render: (p) => p.proposalType ?? '—' },
            { key: 'status', header: 'Status', render: (p) => <StatusChip status={p.status} /> },
            { key: 'votingEndsAt', header: 'Voting ends', render: (p) => formatDate(p.votingEndsAt) },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (p) => (
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  {p.status === 'passed' && <Button size="small" variant="outlined" onClick={() => act(() => nexusAdminApi.executeProposal(p.id), 'Proposal executed')}>Execute</Button>}
                  {p.status === 'active' && <Button size="small" variant="outlined" color="warning" onClick={() => act(() => nexusAdminApi.closeProposal(p.id), 'Proposal closed')}>Close</Button>}
                </Stack>
              ),
            },
          ]}
        />
      )}
    </QueryState>
  );
}

/* ================================================== events (Phase 3) ======= */

function NotifyEventDialog({ eventId, open, onClose, onToast }: { eventId: string; open: boolean; onClose: () => void; onToast: (m: string) => void }) {
  const [updateType, setUpdateType] = useState('update');
  const [message, setMessage] = useState('');
  useEffect(() => { if (open) { setUpdateType('update'); setMessage(''); } }, [open]);
  const mut = useMutation({
    mutationFn: () => nexusAdminApi.notifyEvent(eventId, { updateType, message }),
    onSuccess: () => { onToast('Notification sent'); onClose(); },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Notify attendees</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Update type" value={updateType} onChange={(e) => setUpdateType(e.target.value)} fullWidth />
          <TextField label="Message" value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={2} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!message.trim() || mut.isPending} onClick={() => mut.mutate()}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}

function EventsPanel({ groupId, onToast }: { groupId: string; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [notify, setNotify] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<NexusEvent | null>(null);
  const query = useQuery({ queryKey: ['nexus', 'events', groupId], queryFn: () => nexusAdminApi.events({ groupId, limit: 50 }), enabled: !!groupId });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['nexus', 'events', groupId] });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); invalidate(); }).catch((e) => onToast((e as Error).message));
  const deleteMut = useMutation({
    mutationFn: (id: string) => nexusAdminApi.deleteEvent(id),
    onSuccess: () => { onToast('Event deleted'); setConfirmDelete(null); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Stack spacing={2}>
      <QueryState query={query} empty="No events.">
        {(d) => (
          <DataTable
            rows={rows<NexusEvent>(d, 'events', 'data')}
            rowKey={(e) => e.id}
            columns={[
              { key: 'title', header: 'Title', render: (e) => e.title ?? '—' },
              { key: 'eventType', header: 'Type', render: (e) => e.eventType ?? '—' },
              { key: 'status', header: 'Status', render: (e) => <StatusChip status={e.status} /> },
              { key: 'startTime', header: 'Starts', render: (e) => formatDate(e.startTime) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (e) => (
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" disabled={e.status === 'cancelled'} onClick={() => act(() => nexusAdminApi.cancelEvent(e.id, 'Cancelled from admin console'), 'Event cancelled')}>Cancel</Button>
                    <Button size="small" onClick={() => setNotify(e.id)}>Notify</Button>
                    <IconButton size="small" color="error" aria-label="Delete event" onClick={() => setConfirmDelete(e)}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <NotifyEventDialog eventId={notify} open={!!notify} onClose={() => setNotify('')} onToast={onToast} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete event"
        message={`Delete event "${confirmDelete?.title ?? ''}"?`}
        confirmLabel="Delete"
        busy={deleteMut.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
      />
    </Stack>
  );
}

/* ================================================= subgroups (Phase 3) ===== */

function SubgroupDialog({
  groupId,
  subgroup,
  open,
  onClose,
  onToast,
}: {
  groupId: string;
  subgroup: Subgroup | null;
  open: boolean;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<SubGroupType>('channel');
  const [visibility, setVisibility] = useState<SubGroupVisibility>('public');
  const editing = !!subgroup;

  useEffect(() => {
    if (!open) return;
    setName(subgroup?.name ?? '');
    setDescription(typeof subgroup?.description === 'string' ? subgroup.description : '');
    setType((subgroup?.type as SubGroupType) ?? 'channel');
    setVisibility((subgroup?.visibility as SubGroupVisibility) ?? 'public');
  }, [open, subgroup]);

  const mut = useMutation({
    mutationFn: () =>
      editing
        ? nexusAdminApi.updateSubgroup(subgroup!.id, { name, description, visibility })
        : nexusAdminApi.createSubgroup({ parentGroupId: groupId, name, description, type, visibility }),
    onSuccess: () => {
      onToast(editing ? 'Subgroup updated' : 'Subgroup created');
      qc.invalidateQueries({ queryKey: ['nexus', 'subgroups', groupId] });
      onClose();
    },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{editing ? 'Edit subgroup' : 'New subgroup'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} fullWidth />
          {!editing && (
            <TextField select label="Type" value={type} onChange={(e) => setType(e.target.value as SubGroupType)} fullWidth>
              {SUBGROUP_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
          )}
          <TextField select label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as SubGroupVisibility)} fullWidth>
            {SUBGROUP_VISIBILITIES.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name || mut.isPending} onClick={() => mut.mutate()}>{editing ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function SubgroupsPanel({ groupId, onToast }: { groupId: string; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; subgroup: Subgroup | null }>({ open: false, subgroup: null });
  const [confirmDelete, setConfirmDelete] = useState<Subgroup | null>(null);
  const query = useQuery({ queryKey: ['nexus', 'subgroups', groupId], queryFn: () => nexusAdminApi.subgroups(groupId), enabled: !!groupId });
  const deleteMut = useMutation({
    mutationFn: (id: string) => nexusAdminApi.deleteSubgroup(id),
    onSuccess: () => { onToast('Subgroup deleted'); setConfirmDelete(null); qc.invalidateQueries({ queryKey: ['nexus', 'subgroups', groupId] }); },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setDialog({ open: true, subgroup: null })}>New subgroup</Button>
      </Stack>
      <QueryState query={query} empty="No subgroups.">
        {(d) => (
          <DataTable
            rows={rows<Subgroup>(d, 'subGroups', 'subgroups', 'data')}
            rowKey={(s) => s.id}
            columns={[
              { key: 'name', header: 'Name', render: (s) => s.name ?? '—' },
              { key: 'type', header: 'Type', render: (s) => s.type ?? '—' },
              { key: 'visibility', header: 'Visibility', render: (s) => s.visibility ?? '—' },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (s) => (
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" onClick={() => setDialog({ open: true, subgroup: s })}>Edit</Button>
                    <IconButton size="small" color="error" aria-label="Delete subgroup" onClick={() => setConfirmDelete(s)}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <SubgroupDialog
        groupId={groupId}
        subgroup={dialog.subgroup}
        open={dialog.open}
        onClose={() => setDialog({ open: false, subgroup: null })}
        onToast={onToast}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete subgroup"
        message={`Delete subgroup "${confirmDelete?.name ?? ''}"?`}
        confirmLabel="Delete"
        busy={deleteMut.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
      />
    </Stack>
  );
}

/* ============================================== group detail (Phase 0) ===== */

type GroupDetailTab = 'overview' | 'members' | 'moderation' | 'events' | 'governance' | 'subgroups' | 'config';

function GroupDetail({ group, onBack, onToast }: { group: Group; onBack: () => void; onToast: (m: string) => void }) {
  const [tab, setTab] = useState<GroupDetailTab>('overview');
  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>Groups</Button>
        <Typography variant="h6">{group.name}</Typography>
        {group.visibility && <StatusChip status={group.visibility} />}
      </Stack>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="overview" label="Overview" />
        <Tab value="members" label="Members" />
        <Tab value="moderation" label="Moderation" />
        <Tab value="events" label="Events" />
        <Tab value="governance" label="Governance" />
        <Tab value="subgroups" label="Subgroups" />
        <Tab value="config" label="Config overrides" />
      </Tabs>
      <Box>
        {tab === 'overview' && <GroupOverviewSubTab group={group} onToast={onToast} onDeleted={onBack} />}
        {tab === 'members' && <GroupMembersSubTab groupId={group.id} onToast={onToast} />}
        {tab === 'moderation' && <ModerationPanel groupId={group.id} onToast={onToast} />}
        {tab === 'events' && <EventsPanel groupId={group.id} onToast={onToast} />}
        {tab === 'governance' && <GovernancePanel groupId={group.id} onToast={onToast} />}
        {tab === 'subgroups' && <SubgroupsPanel groupId={group.id} onToast={onToast} />}
        {tab === 'config' && (
          <Alert severity="info">
            Group configuration is global, not per-group: the platform Nexus settings live under the top-level
            <strong> Config </strong> tab. The backend exposes no per-group config-override endpoint.
          </Alert>
        )}
      </Box>
    </Stack>
  );
}

/* ----------------------------------------------------------- groups list -- */

function GroupsTab({ onToast }: { onToast: (m: string) => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Group | null>(null);
  const query = useQuery({ queryKey: ['nexus', 'groups', search], queryFn: () => nexusAdminApi.listGroups({ search, limit: 100 }) });

  if (selected) {
    return <GroupDetail group={selected} onBack={() => setSelected(null)} onToast={onToast} />;
  }

  return (
    <Stack spacing={2}>
      <TextField size="small" label="Search groups" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ maxWidth: 360 }} />
      <QueryState query={query} empty="No groups.">
        {(d) => (
          <DataTable
            rows={d.groups ?? []}
            rowKey={(g) => g.id}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'visibility', header: 'Visibility', render: (g) => g.visibility ?? '—' },
              { key: 'memberCount', header: 'Members', align: 'right', render: (g) => g.memberCount ?? 0 },
              { key: 'category', header: 'Category', render: (g) => g.category ?? '—' },
              { key: 'createdAt', header: 'Created', render: (g) => formatDate(g.createdAt) },
              { key: 'view', header: '', align: 'right', render: (g) => <Button size="small" onClick={() => setSelected(g)}>Manage</Button> },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

/* ------------------------------------------------------ overview (Phase 4) - */

function OverviewTab() {
  const [period, setPeriod] = useState('30d');
  const query = useQuery({ queryKey: ['nexus', 'stats', period], queryFn: () => nexusAdminApi.adminStats(period) });
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <TextField select size="small" label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ minWidth: 120 }}>
          {PERIODS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
        </TextField>
      </Stack>
      <QueryState query={query} empty="No statistics.">
        {(d) => <PlatformStatsView stats={d} />}
      </QueryState>
    </Stack>
  );
}

function PlatformStatsView({ stats }: { stats: PlatformStats }) {
  const t = stats.totals;
  const g = stats.growth;
  const series = g?.series ?? [];
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <StatCard label="Groups" value={t?.groups} hint={`${t?.activeGroups ?? 0} active`} />
        <StatCard label="Members" value={t?.members} />
        <StatCard label="Events" value={t?.events} />
        <StatCard label="Active proposals" value={t?.activeProposals} />
      </Stack>
      {g && (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <StatCard label="New groups" value={g.newGroups} hint={`last ${g.days}d`} />
          <StatCard label="New members" value={g.newMembers} hint={`last ${g.days}d`} />
          <StatCard label="New events" value={g.newEvents} hint={`last ${g.days}d`} />
        </Stack>
      )}
      {series.length > 0 && (
        <Card title={`Growth (${g?.period})`}>
          <DataTable
            rows={series}
            rowKey={(s, i) => s.date ?? String(i)}
            columns={[
              { key: 'date', header: 'Date', render: (s) => s.date ?? '—' },
              { key: 'groups', header: 'Groups', align: 'right', render: (s) => s.groups ?? 0 },
              { key: 'members', header: 'Members', align: 'right', render: (s) => s.members ?? 0 },
              { key: 'events', header: 'Events', align: 'right', render: (s) => s.events ?? 0 },
            ]}
          />
        </Card>
      )}
    </Stack>
  );
}

/* --------------------------------------------------------- trending ------- */

function TrendingTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['nexus', 'trending'], queryFn: () => nexusAdminApi.trendingGroups(25) });
  const recompute = useMutation({
    mutationFn: nexusAdminApi.recomputeTrending,
    onSuccess: () => { onToast('Trending recomputed'); qc.invalidateQueries({ queryKey: ['nexus', 'trending'] }); },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" disabled={recompute.isPending} onClick={() => recompute.mutate()}>Recompute trending</Button>
      </Stack>
      <QueryState query={query} empty="No trending groups.">
        {(d) => (
          <DataTable
            rows={rows<Group>(d, 'groups', 'data')}
            rowKey={(g) => g.id}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'memberCount', header: 'Members', align: 'right', render: (g) => g.memberCount ?? 0 },
              { key: 'category', header: 'Category', render: (g) => g.category ?? '—' },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

/* ------------------------------------------ standalone moderation (paste id) */

function StandaloneModerationTab({ onToast }: { onToast: (m: string) => void }) {
  const [groupId, setGroupId] = useState('');
  return (
    <Stack spacing={2}>
      <Alert severity="info">Power-user path — moderation is also available per-group via Groups → Manage → Moderation.</Alert>
      <TextField size="small" label="Group ID" value={groupId} onChange={(e) => setGroupId(e.target.value)} sx={{ maxWidth: 380 }} />
      {groupId && <ModerationPanel groupId={groupId} onToast={onToast} />}
    </Stack>
  );
}

/* ----------------------------------- standalone events/governance (paste id) */

function StandaloneInspectTab({ onToast }: { onToast: (m: string) => void }) {
  const [groupId, setGroupId] = useState('');
  return (
    <Stack spacing={2}>
      <Alert severity="info">Power-user path — events, governance and subgroups are also available per-group via Groups → Manage.</Alert>
      <TextField size="small" label="Group ID" value={groupId} onChange={(e) => setGroupId(e.target.value)} sx={{ maxWidth: 380 }} />
      {groupId && (
        <>
          <Card title="Events"><EventsPanel groupId={groupId} onToast={onToast} /></Card>
          <Card title="Governance proposals"><GovernancePanel groupId={groupId} onToast={onToast} /></Card>
          <Card title="Subgroups"><SubgroupsPanel groupId={groupId} onToast={onToast} /></Card>
        </>
      )}
    </Stack>
  );
}

/* -------------------------------------------------------- audit (Phase 5) -- */

function AuditTab() {
  const [filters, setFilters] = useState({ action: '', targetType: '', groupId: '', actor: '' });
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const query = useQuery({
    queryKey: ['nexus', 'audit', filters, offset],
    queryFn: () => nexusAdminApi.auditLog({ ...filters, limit, offset }),
  });
  const set = (k: keyof typeof filters, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setOffset(0); };
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField size="small" label="Action" value={filters.action} onChange={(e) => set('action', e.target.value)} sx={{ maxWidth: 200 }} />
        <TextField size="small" label="Target type" value={filters.targetType} onChange={(e) => set('targetType', e.target.value)} sx={{ maxWidth: 200 }} />
        <TextField size="small" label="Group ID" value={filters.groupId} onChange={(e) => set('groupId', e.target.value)} sx={{ maxWidth: 240 }} />
        <TextField size="small" label="Actor (user ID)" value={filters.actor} onChange={(e) => set('actor', e.target.value)} sx={{ maxWidth: 240 }} />
      </Stack>
      <QueryState query={query} empty="No audit entries.">
        {(d) => (
          <>
            <DataTable
              rows={d.entries ?? []}
              rowKey={(e: AuditEntry) => e.id}
              columns={[
                { key: 'createdAt', header: 'When', render: (e) => formatDate(e.createdAt) },
                { key: 'action', header: 'Action', render: (e) => e.action ?? '—' },
                { key: 'actorUserId', header: 'Actor', mono: true, render: (e) => (e.actorUserId ?? '—').slice(0, 12) },
                { key: 'targetType', header: 'Target', render: (e) => `${e.targetType ?? '—'}${e.targetId ? ` ${String(e.targetId).slice(0, 8)}…` : ''}` },
                { key: 'groupId', header: 'Group', mono: true, render: (e) => (e.groupId ? String(e.groupId).slice(0, 8) + '…' : '—') },
                { key: 'metadata', header: 'Metadata', render: (e) => (e.metadata ? <DataView value={e.metadata} /> : '—') },
              ]}
            />
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
              <Typography variant="caption" color="text.secondary">
                {d.total > 0 ? `${offset + 1}–${Math.min(offset + limit, d.total)} of ${d.total}` : '0'}
              </Typography>
              <Button size="small" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>Previous</Button>
              <Button size="small" disabled={offset + limit >= d.total} onClick={() => setOffset((o) => o + limit)}>Next</Button>
            </Stack>
          </>
        )}
      </QueryState>
      {query.isFetching && !query.isLoading && <Loading size={20} />}
    </Stack>
  );
}

/* ------------------------------------------------------------------- page */

type NexusTab = 'overview' | 'groups' | 'trending' | 'moderation' | 'inspect' | 'audit' | 'config';

export function NexusSection() {
  const [tab, setTab] = useState<NexusTab>('overview');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Groups (Nexus)" subtitle="Overview, groups, trending, moderation, events & governance, audit — /nexus/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="overview" label="Overview" />
        <Tab value="groups" label="Groups" />
        <Tab value="trending" label="Trending" />
        <Tab value="moderation" label="Moderation" />
        <Tab value="inspect" label="Events / Governance" />
        <Tab value="audit" label="Audit" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'groups' && <GroupsTab onToast={showToast} />}
      {tab === 'trending' && <TrendingTab onToast={showToast} />}
      {tab === 'moderation' && <StandaloneModerationTab onToast={showToast} />}
      {tab === 'inspect' && <StandaloneInspectTab onToast={showToast} />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'config' && <ConfigSectionEditor sections={NEXUS_CONFIG_SECTIONS} load={(s) => nexusAdminApi.getConfigSection(s)} save={(s, data) => nexusAdminApi.saveConfigSection(s, data)} />}
      {ToastHost}
    </Stack>
  );
}
