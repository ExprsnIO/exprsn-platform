import { useState, type ComponentType, type ReactElement } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import EventIcon from '@mui/icons-material/Event';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import TagIcon from '@mui/icons-material/Tag';
import LiveTvOutlinedIcon from '@mui/icons-material/LiveTvOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAppStore } from '@/app/store';
import { nexusApi } from '@/api/nexus';
import { toMessage } from '@/lib/errors';
import { avatarColor } from '@/features/people/util';
import { GovernanceDialog } from './GovernanceDialog';
import { useGroupContext, type GroupContextValue } from './useGroupContext';
import type { GroupTabProps } from './tabs/types';
import AboutTab from './tabs/AboutTab';
import PostsTab from './tabs/PostsTab';
import MembersTab from './tabs/MembersTab';
import EventsTab from './tabs/EventsTab';
import GalleriesTab from './tabs/GalleriesTab';
import FilesTab from './tabs/FilesTab';
import MessagesTab from './tabs/MessagesTab';
import SubgroupsTab from './tabs/SubgroupsTab';
import LiveTab from './tabs/LiveTab';
import SecretsTab from './tabs/SecretsTab';

/**
 * Tab registry — the single source of truth for the group's information
 * architecture. `visible(ctx)` gates each tab (capability + visibility);
 * `Component` receives `{ groupId, ctx }`. Feature agents fill the stub
 * components without touching this page.
 */
interface TabDef {
  value: string;
  label: string;
  icon: ReactElement;
  Component: ComponentType<GroupTabProps>;
  visible: (ctx: GroupContextValue) => boolean;
}

// A tab is visible to members, platform admins, or — for non-member-only
// content — anyone when the group is public. Private groups hide member content
// from non-members entirely.
const memberOrPublic = (ctx: GroupContextValue) =>
  ctx.isMember || ctx.isPlatformAdmin || ctx.group?.visibility === 'public';
const memberOnly = (ctx: GroupContextValue) => ctx.isMember || ctx.isPlatformAdmin;

const TABS: TabDef[] = [
  { value: 'about', label: 'About', icon: <InfoOutlinedIcon />, Component: AboutTab, visible: () => true },
  { value: 'posts', label: 'Posts', icon: <ForumOutlinedIcon />, Component: PostsTab, visible: memberOrPublic },
  { value: 'members', label: 'Members', icon: <PeopleAltIcon />, Component: MembersTab, visible: memberOrPublic },
  { value: 'events', label: 'Events', icon: <EventIcon />, Component: EventsTab, visible: memberOrPublic },
  { value: 'galleries', label: 'Galleries', icon: <CollectionsOutlinedIcon />, Component: GalleriesTab, visible: memberOrPublic },
  { value: 'files', label: 'Files', icon: <FolderOutlinedIcon />, Component: FilesTab, visible: memberOnly },
  { value: 'messages', label: 'Messages', icon: <ChatBubbleOutlineIcon />, Component: MessagesTab, visible: memberOnly },
  { value: 'channels', label: 'Channels', icon: <TagIcon />, Component: SubgroupsTab, visible: memberOrPublic },
  { value: 'live', label: 'Live', icon: <LiveTvOutlinedIcon />, Component: LiveTab, visible: (ctx) => ctx.can('goLive') },
  { value: 'secrets', label: 'Secrets', icon: <LockOutlinedIcon />, Component: SecretsTab, visible: (ctx) => ctx.can('manageSecrets') },
];

/** Group detail — header + a scalable, capability-gated tab framework. */
export function GroupDetailPage() {
  const { id = '' } = useParams();
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [tab, setTab] = useState('about');
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const ctx = useGroupContext(id);
  // memberships query is also used to drive the join/leave button state.
  const memberships = useQuery({
    queryKey: ['nexus', 'memberships'],
    queryFn: nexusApi.myMemberships,
    enabled: !!userId,
  });
  const myMembership = ctx.membership;
  const isMember = ctx.isMember;

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

  if (ctx.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (ctx.isError || !ctx.group) return <Alert severity="error">{toMessage(ctx.error)}</Alert>;

  const group = ctx.group;
  const visibleTabs = TABS.filter((t) => t.visible(ctx));
  const active = visibleTabs.find((t) => t.value === tab) ?? visibleTabs[0];
  const ActiveComponent = active.Component;

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
              {ctx.role !== 'non-member' && (
                <Chip size="small" color="primary" variant="outlined" label={ctx.role} />
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
                disabled={join.isPending || memberships.isLoading}
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

      <Tabs
        value={active.value}
        onChange={(_e, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        {visibleTabs.map((t) => (
          <Tab key={t.value} value={t.value} icon={t.icon} iconPosition="start" label={t.label} />
        ))}
      </Tabs>

      <ActiveComponent groupId={group.id} ctx={ctx} />

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
