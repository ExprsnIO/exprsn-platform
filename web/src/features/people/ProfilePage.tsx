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
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import GroupsIcon from '@mui/icons-material/Groups';
import { useAppStore } from '@/app/store';
import { usersApi } from '@/api/users';
import { timelineApi, type Post } from '@/api/timeline';
import { toMessage } from '@/lib/errors';
import { PostCard } from '@/features/timeline/PostCard';
import { FollowButton } from './FollowButton';
import { useStartConversation } from './useStartConversation';
import { avatarColor, personInitials } from './util';

function joinedLabel(createdAt?: string): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Joined ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

function PostsTab({ userId, currentUserId }: { userId: string; currentUserId?: string }) {
  const qc = useQueryClient();
  const posts = useQuery({
    queryKey: ['people', 'posts', userId],
    queryFn: () => timelineApi.userPosts(userId, { limit: 30 }),
  });

  const toggleLike = useMutation({
    mutationFn: (post: Post) => (post.liked ? timelineApi.unlike(post.id) : timelineApi.like(post.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people', 'posts', userId] }),
  });

  if (posts.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (posts.isError) return <Alert severity="error">{toMessage(posts.error)}</Alert>;

  const list = posts.data?.posts ?? [];
  if (list.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        No posts yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {list.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          isOwn={post.userId === currentUserId}
          onToggleLike={(p) => toggleLike.mutate(p)}
        />
      ))}
    </Stack>
  );
}

function GroupsTab({ userId }: { userId: string }) {
  const groups = useQuery({
    queryKey: ['people', 'groups', userId],
    queryFn: () => usersApi.publicGroups(userId),
  });

  if (groups.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (groups.isError) return <Alert severity="error">{toMessage(groups.error)}</Alert>;

  const list = groups.data?.data ?? [];
  if (list.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Not a member of any public groups.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {list.map((g) => (
        <Paper key={g.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar src={g.avatarUrl ?? undefined} sx={{ bgcolor: avatarColor(g.id) }}>
              {(g.name?.[0] ?? '?').toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                {g.name}
              </Typography>
              {g.description && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {g.description}
                </Typography>
              )}
            </Box>
            <Chip size="small" variant="outlined" label={`${g.memberCount ?? 0} members`} />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

/** Public profile — header (avatar, name, joined, follow/message), bio, posts & groups. */
export function ProfilePage() {
  const { id = '' } = useParams();
  const myId = useAppStore((s) => s.user?.id);
  const isSelf = !!myId && myId === id;
  const [tab, setTab] = useState<'posts' | 'groups'>('posts');
  const [toast, setToast] = useState<string | null>(null);
  const { start, pending: starting } = useStartConversation(setToast);

  const profile = useQuery({
    queryKey: ['people', 'profile', id],
    queryFn: () => usersApi.profile(id),
    enabled: !!id,
  });

  if (profile.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (profile.isError) return <Alert severity="error">{toMessage(profile.error)}</Alert>;

  const user = profile.data!.user;
  const joined = joinedLabel(user.createdAt);

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: 'auto', pb: 6 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Avatar
            src={user.avatarUrl ?? undefined}
            sx={{ bgcolor: avatarColor(user.id), width: 72, height: 72, fontSize: 28 }}
          >
            {personInitials(user.displayName, user.id)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {user.displayName || 'Unnamed user'}
            </Typography>
            {joined && (
              <Typography variant="caption" color="text.secondary">
                {joined}
              </Typography>
            )}
            {user.bio && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {user.bio}
              </Typography>
            )}
          </Box>
          <Stack spacing={1} sx={{ flexShrink: 0 }} alignItems="flex-end">
            {isSelf ? (
              <Button size="small" variant="outlined" component={RouterLink} to="/settings">
                Edit profile
              </Button>
            ) : (
              <>
                <FollowButton userId={user.id} size="medium" onError={setToast} />
                <Button
                  size="small"
                  startIcon={<ChatBubbleOutlineIcon />}
                  disabled={starting}
                  onClick={() => start(user.id)}
                >
                  Message
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      </Paper>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="posts" label="Posts" />
        <Tab value="groups" icon={<GroupsIcon />} iconPosition="start" label="Groups" />
      </Tabs>

      {tab === 'posts' && <PostsTab userId={user.id} currentUserId={myId} />}
      {tab === 'groups' && <GroupsTab userId={user.id} />}

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
