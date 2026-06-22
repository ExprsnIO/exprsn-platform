import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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
import AddIcon from '@mui/icons-material/Add';
import GroupsIcon from '@mui/icons-material/Groups';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { nexusApi, type Group, type MemberRole } from '@/api/nexus';
import { CreateGroupDialog } from './CreateGroupDialog';

const ROLE_COLOR: Record<MemberRole, 'primary' | 'secondary' | 'info' | 'default'> = {
  owner: 'primary',
  admin: 'secondary',
  moderator: 'info',
  member: 'default',
};

function GroupCard({
  group,
  children,
}: {
  group: Group;
  children?: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {group.name}
            </Typography>
            {group.visibility && group.visibility !== 'public' && (
              <Chip size="small" variant="outlined" label={group.visibility} />
            )}
            {group.joinMode && <Chip size="small" variant="outlined" label={group.joinMode} />}
          </Stack>
          {group.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {group.description}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {group.memberCount ?? 0} member{(group.memberCount ?? 0) === 1 ? '' : 's'}
          </Typography>
        </Box>
        <Box sx={{ flexShrink: 0 }}>{children}</Box>
      </Stack>
    </Paper>
  );
}

/**
 * Phase 5 — Groups (Nexus). My Groups (memberships) + Discover (public groups),
 * create-group dialog, and join/leave against the nexus module. Category is
 * omitted on create (FK to an unseeded table).
 */
export function GroupsPage() {
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'mine' | 'discover'>('mine');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const memberships = useQuery({
    queryKey: ['nexus', 'memberships'],
    queryFn: nexusApi.myMemberships,
  });
  const discover = useQuery({
    queryKey: ['nexus', 'groups'],
    queryFn: () => nexusApi.listGroups({ limit: 50 }),
    enabled: tab === 'discover',
  });

  const myGroupIds = new Set((memberships.data?.data ?? []).map((m) => m.groupId));

  const joinMutation = useMutation({
    mutationFn: (id: string) => nexusApi.joinGroup(id),
    onSuccess: () => {
      setToast('Joined group');
      qc.invalidateQueries({ queryKey: ['nexus'] });
    },
    onError: (err) => setToast(toMessage(err)),
  });
  const leaveMutation = useMutation({
    mutationFn: (id: string) => nexusApi.leaveGroup(id),
    onSuccess: () => {
      setToast('Left group');
      qc.invalidateQueries({ queryKey: ['nexus'] });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: 'auto', pb: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">Groups</Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          New group
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="mine" icon={<PeopleAltIcon />} iconPosition="start" label="My groups" />
        <Tab value="discover" icon={<GroupsIcon />} iconPosition="start" label="Discover" />
      </Tabs>

      {tab === 'mine' && (
        <>
          {memberships.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {memberships.isError && <Alert severity="error">{toMessage(memberships.error)}</Alert>}
          {memberships.isSuccess && (memberships.data.data?.length ?? 0) === 0 && (
            <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
              You're not in any groups yet. Create one or discover groups to join.
            </Typography>
          )}
          {(memberships.data?.data ?? []).map((m) =>
            m.group ? (
              <GroupCard key={m.id} group={m.group}>
                <Stack spacing={1} alignItems="flex-end">
                  <Chip size="small" color={ROLE_COLOR[m.role]} label={m.role} />
                  <Tooltip title={m.role === 'owner' ? 'Owners cannot leave their group' : ''}>
                    <span>
                      <Button
                        size="small"
                        color="inherit"
                        disabled={m.role === 'owner' || leaveMutation.isPending}
                        onClick={() => leaveMutation.mutate(m.groupId)}
                      >
                        Leave
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
              </GroupCard>
            ) : null,
          )}
        </>
      )}

      {tab === 'discover' && (
        <>
          {discover.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {discover.isError && <Alert severity="error">{toMessage(discover.error)}</Alert>}
          {discover.isSuccess && (discover.data.groups?.length ?? 0) === 0 && (
            <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
              No public groups yet.
            </Typography>
          )}
          {(discover.data?.groups ?? []).map((g) => {
            const joined = myGroupIds.has(g.id);
            return (
              <GroupCard key={g.id} group={g}>
                <Button
                  size="small"
                  variant={joined ? 'outlined' : 'contained'}
                  disabled={joined || joinMutation.isPending}
                  onClick={() => joinMutation.mutate(g.id)}
                >
                  {joined ? 'Joined' : g.joinMode === 'open' ? 'Join' : 'Request'}
                </Button>
              </GroupCard>
            );
          })}
        </>
      )}

      <CreateGroupDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(msg) => setToast(msg)}
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
