import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HowToVoteIcon from '@mui/icons-material/HowToVote';
import EventIcon from '@mui/icons-material/Event';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useAppStore } from '@/app/store';
import { nexusApi, type GroupMember } from '@/api/nexus';
import { usersApi, type PublicUser } from '@/api/users';
import { isHttpError, toMessage } from '@/lib/errors';
import { avatarColor, personInitials } from '@/features/people/util';
import { GovernanceDialog } from './GovernanceDialog';

function formatWhen(value?: string | number): string {
  if (value == null) return '';
  const d = new Date(typeof value === 'number' ? value : Date.parse(value));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function MemberRow({ member, profile }: { member: GroupMember; profile?: PublicUser }) {
  const name = profile?.displayName || 'Unnamed user';
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Avatar
          src={profile?.avatarUrl ?? undefined}
          sx={{ bgcolor: avatarColor(member.userId), width: 36, height: 36 }}
        >
          {personInitials(profile?.displayName, member.userId)}
        </Avatar>
        <Link
          component={RouterLink}
          to={`/people/${member.userId}`}
          underline="hover"
          color="inherit"
          sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}
          noWrap
        >
          {name}
        </Link>
        <Chip
          size="small"
          label={member.role}
          color={member.role === 'owner' ? 'primary' : member.role === 'admin' ? 'secondary' : 'default'}
        />
      </Stack>
    </Paper>
  );
}

function MembersTab({ groupId, isMember }: { groupId: string; isMember: boolean }) {
  const members = useQuery({
    queryKey: ['nexus', 'members', groupId],
    queryFn: () => nexusApi.listMembers(groupId, { limit: 100 }),
    enabled: isMember,
  });

  // Resolve display names/avatars for the member ids in one batched call.
  const memberIds = (members.data?.members ?? []).map((m) => m.userId);
  const profilesQ = useQuery({
    queryKey: ['people', 'profiles', memberIds],
    queryFn: () => usersApi.profilesByIds(memberIds),
    enabled: memberIds.length > 0,
  });
  const profileMap = new Map((profilesQ.data?.users ?? []).map((u) => [u.id, u]));

  if (!isMember) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Members are visible to group members only. Join the group to see them.
      </Typography>
    );
  }
  if (members.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (members.isError) {
    return isHttpError(members.error, 403) ? (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Members are visible to group members only.
      </Typography>
    ) : (
      <Alert severity="error">{toMessage(members.error)}</Alert>
    );
  }

  const list = members.data?.members ?? [];
  if (list.length === 0) {
    return <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>No members yet.</Typography>;
  }
  return (
    <Stack spacing={1}>
      {list.map((m) => (
        <MemberRow key={m.id} member={m} profile={profileMap.get(m.userId)} />
      ))}
    </Stack>
  );
}

function EventsTab({ groupId }: { groupId: string }) {
  const events = useQuery({
    queryKey: ['nexus', 'events', groupId],
    queryFn: () => nexusApi.listGroupEvents(groupId, { upcoming: true, limit: 50 }),
  });

  if (events.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (events.isError) {
    return isHttpError(events.error, 403) ? (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Events are visible to group members only.
      </Typography>
    ) : (
      <Alert severity="error">{toMessage(events.error)}</Alert>
    );
  }

  const list = events.data?.events ?? [];
  if (list.length === 0) {
    return <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>No upcoming events.</Typography>;
  }
  return (
    <Stack spacing={1.5}>
      {list.map((e) => (
        <Paper key={e.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
              {e.title}
            </Typography>
            {e.eventType && <Chip size="small" variant="outlined" label={e.eventType} />}
          </Stack>
          {formatWhen(e.startTime) && (
            <Typography variant="caption" color="text.secondary">
              {formatWhen(e.startTime)}
              {e.location ? ` · ${e.location}` : ''}
            </Typography>
          )}
          {e.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {e.description}
            </Typography>
          )}
        </Paper>
      ))}
    </Stack>
  );
}

/** Group detail — header, about, members, and events for a single group. */
export function GroupDetailPage() {
  const { id = '' } = useParams();
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'about' | 'members' | 'events'>('about');
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const groupQ = useQuery({
    queryKey: ['nexus', 'group', id],
    queryFn: () => nexusApi.getGroup(id),
    enabled: !!id,
  });
  const memberships = useQuery({
    queryKey: ['nexus', 'memberships'],
    queryFn: nexusApi.myMemberships,
  });

  const myMembership = (memberships.data?.data ?? []).find((m) => m.groupId === id);
  const isMember = !!myMembership;

  const join = useMutation({
    mutationFn: () => nexusApi.joinGroup(id),
    onSuccess: () => {
      setToast('Joined group');
      qc.invalidateQueries({ queryKey: ['nexus'] });
    },
    onError: (err) => setToast(toMessage(err)),
  });
  const leave = useMutation({
    mutationFn: () => nexusApi.leaveGroup(id),
    onSuccess: () => {
      setToast('Left group');
      qc.invalidateQueries({ queryKey: ['nexus'] });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  if (groupQ.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (groupQ.isError) return <Alert severity="error">{toMessage(groupQ.error)}</Alert>;

  const group = groupQ.data!.group;

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: 'auto', pb: 6 }}>
      <Button
        component={RouterLink}
        to="/groups"
        startIcon={<ArrowBackIcon />}
        size="small"
        color="inherit"
        sx={{ alignSelf: 'flex-start' }}
      >
        All groups
      </Button>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Avatar
            src={(group.avatarUrl as string) ?? undefined}
            sx={{ bgcolor: avatarColor(group.id), width: 64, height: 64, fontSize: 26 }}
          >
            {(group.name?.[0] ?? '?').toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {group.name}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
              {group.visibility && <Chip size="small" variant="outlined" label={group.visibility} />}
              {group.joinMode && <Chip size="small" variant="outlined" label={group.joinMode} />}
              {typeof group.governanceModel === 'string' && (
                <Chip size="small" variant="outlined" label={group.governanceModel} />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {group.memberCount ?? 0} member{(group.memberCount ?? 0) === 1 ? '' : 's'}
            </Typography>
          </Box>
          <Stack spacing={1} sx={{ flexShrink: 0 }} alignItems="flex-end">
            {isMember ? (
              <Tooltip title={myMembership?.role === 'owner' ? 'Owners cannot leave their group' : ''}>
                <span>
                  <Button
                    size="small"
                    color="inherit"
                    variant="outlined"
                    disabled={myMembership?.role === 'owner' || leave.isPending}
                    onClick={() => leave.mutate()}
                  >
                    Leave
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                size="small"
                variant="contained"
                disabled={join.isPending}
                onClick={() => join.mutate()}
              >
                {group.joinMode === 'open' ? 'Join' : 'Request to join'}
              </Button>
            )}
            <Button
              size="small"
              color="inherit"
              startIcon={<HowToVoteIcon />}
              onClick={() => setGovernanceOpen(true)}
            >
              Governance
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="about" icon={<InfoOutlinedIcon />} iconPosition="start" label="About" />
        <Tab value="members" icon={<PeopleAltIcon />} iconPosition="start" label="Members" />
        <Tab value="events" icon={<EventIcon />} iconPosition="start" label="Events" />
      </Tabs>

      {tab === 'about' && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="body1">
              {(group.description as string) || 'No description provided.'}
            </Typography>
            {Boolean(group.location || group.website) && <Divider />}
            {group.location ? (
              <Typography variant="body2" color="text.secondary">
                📍 {group.location as string}
              </Typography>
            ) : null}
            {group.website ? (
              <Link href={group.website as string} target="_blank" rel="noopener" variant="body2">
                {group.website as string}
              </Link>
            ) : null}
            {Array.isArray(group.tags) && group.tags.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {(group.tags as string[]).map((t) => (
                  <Chip key={t} size="small" label={t} />
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      )}
      {tab === 'members' && <MembersTab groupId={group.id} isMember={isMember} />}
      {tab === 'events' && <EventsTab groupId={group.id} />}

      <GovernanceDialog
        group={group}
        userId={userId ?? ''}
        open={governanceOpen}
        onClose={() => setGovernanceOpen(false)}
        onToast={setToast}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}
