import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useAppStore } from '@/app/store';
import { useTimelinePrefs } from '@/app/timelinePrefs';
import { NS } from '@/lib/realtime';
import { namespace, connect } from '@/lib/realtime';
import { useNamespaceStatus, type ConnState } from '@/lib/useRealtime';
import { toMessage } from '@/lib/errors';
import { timelineApi, type FeedResponse, type Post } from '@/api/timeline';
import { prefetchApi } from '@/api/prefetch';
import { Composer } from './Composer';
import { PostCard, PostSkeleton } from './PostCard';
import { TimelineSettingsMenu } from './TimelineSettingsMenu';
import { InlineComments } from './InlineComments';

const CHIP_COLOR: Record<ConnState, 'success' | 'warning' | 'default' | 'error'> = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'default',
  error: 'error',
};

type FeedKind = 'home' | 'global';

function feedKey(kind: FeedKind) {
  return ['timeline', 'feed', kind] as const;
}

/** Mutate the cached posts for a feed, leaving the rest of the response intact. */
function patchPosts(
  qc: ReturnType<typeof useQueryClient>,
  kind: FeedKind,
  fn: (posts: Post[]) => Post[],
) {
  qc.setQueryData<FeedResponse>(feedKey(kind), (prev) =>
    prev ? { ...prev, posts: fn(prev.posts) } : prev,
  );
}

/**
 * Phase 4c — Timeline feed. Composer + Home/Global feeds, optimistic likes, and
 * live updates over the shared `/timeline` Socket.IO namespace (new posts, like
 * and comment counters). Author identity is the raw user id for now — the
 * backend feed carries no profile join yet.
 */
export function TimelinePage() {
  const userId = useAppStore((s) => s.user?.id);
  const conn = useNamespaceStatus(NS.timeline);
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Active feed. Held in component state so toggling re-renders (the previous
  // query-cache read had no observer, so setQueryData never re-rendered and the
  // toggle was stuck on Home). Seeded from — and written back to — the query
  // cache so the choice persists across navigation within the session; on a cold
  // load it falls back to the user's persisted default-feed preference.
  const defaultFeed = useTimelinePrefs((s) => s.defaultFeed);
  const density = useTimelinePrefs((s) => s.density);
  const [kind, setKindState] = useState<FeedKind>(
    () => (qc.getQueryData<FeedKind>(['timeline', 'feedKind']) ?? defaultFeed) as FeedKind,
  );
  const setKind = (k: FeedKind) => {
    qc.setQueryData(['timeline', 'feedKind'], k);
    setKindState(k);
  };

  const query = useQuery({
    queryKey: feedKey(kind),
    queryFn: () => (kind === 'home' ? timelineApi.homeFeed({ limit: 30 }) : timelineApi.globalFeed({ limit: 30 })),
  });

  // Live updates: join the global room and reflect broadcasts into the active
  // feed cache. Re-registers when the feed kind changes so it targets the right
  // cache key. Own-user echoes are de-duped (new posts by id, own likes ignored).
  useEffect(() => {
    const socket = namespace(NS.timeline);
    const subscribe = () => socket.emit('subscribe:timeline');
    if (socket.connected) subscribe();
    socket.on('connect', subscribe);

    const onNewPost = (post: Post) => {
      if (!post?.id) return;
      patchPosts(qc, kind, (posts) =>
        posts.some((p) => p.id === post.id) ? posts : [post, ...posts],
      );
    };
    const onLiked = ({ postId, userId: actor }: { postId: string; userId: string }) => {
      if (actor === userId) return; // our own like is already applied optimistically
      patchPosts(qc, kind, (posts) =>
        posts.map((p) => (p.id === postId ? { ...p, likeCount: (p.likeCount ?? 0) + 1 } : p)),
      );
    };
    const onCommented = ({ postId }: { postId: string }) => {
      patchPosts(qc, kind, (posts) =>
        posts.map((p) => (p.id === postId ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p)),
      );
    };

    socket.on('new:post', onNewPost);
    socket.on('post:liked', onLiked);
    socket.on('post:commented', onCommented);
    connect(NS.timeline);

    return () => {
      socket.off('connect', subscribe);
      socket.off('new:post', onNewPost);
      socket.off('post:liked', onLiked);
      socket.off('post:commented', onCommented);
    };
  }, [qc, kind, userId]);

  const likeMutation = useMutation({
    mutationFn: (post: Post) => (post.liked ? timelineApi.unlike(post.id) : timelineApi.like(post.id)),
    onMutate: async (post: Post) => {
      const willLike = !post.liked;
      patchPosts(qc, kind, (posts) =>
        posts.map((p) =>
          p.id === post.id
            ? { ...p, liked: willLike, likeCount: Math.max(0, (p.likeCount ?? 0) + (willLike ? 1 : -1)) }
            : p,
        ),
      );
      return { post };
    },
    onError: (_err, post) => {
      // Revert the optimistic toggle.
      patchPosts(qc, kind, (posts) =>
        posts.map((p) =>
          p.id === post.id
            ? { ...p, liked: post.liked, likeCount: post.likeCount }
            : p,
        ),
      );
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: (post: Post) =>
      post.bookmarked ? timelineApi.unbookmark(post.id) : timelineApi.bookmark(post.id),
    onMutate: async (post: Post) => {
      const willBookmark = !post.bookmarked;
      patchPosts(qc, kind, (posts) =>
        posts.map((p) => (p.id === post.id ? { ...p, bookmarked: willBookmark } : p)),
      );
      return { post };
    },
    onError: (_err, post) => {
      patchPosts(qc, kind, (posts) =>
        posts.map((p) => (p.id === post.id ? { ...p, bookmarked: post.bookmarked } : p)),
      );
    },
  });

  // Best-effort: once the Home feed has loaded, warm the user's prefetch cache
  // for the next visit. Queued (not blocking) and fully fire-and-forget — any
  // permission/availability error is swallowed so it never disrupts the feed.
  const warmedFor = useRef<string | null>(null);
  useEffect(() => {
    if (kind !== 'home' || !userId || !query.isSuccess) return;
    if (warmedFor.current === userId) return;
    warmedFor.current = userId;
    prefetchApi.schedulePrefetch(userId, 'high').catch(() => {});
  }, [kind, userId, query.isSuccess]);

  const onPosted = (post: Post) =>
    patchPosts(qc, kind, (posts) => (posts.some((p) => p.id === post.id) ? posts : [post, ...posts]));

  const onUpdated = (post: Post) =>
    patchPosts(qc, kind, (posts) => posts.map((p) => (p.id === post.id ? { ...p, ...post } : p)));

  const onDeleted = (postId: string) =>
    patchPosts(qc, kind, (posts) => posts.filter((p) => p.id !== postId));

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  const posts = query.data?.posts ?? [];
  const feedSpacing = density === 'compact' ? 1 : 2;

  return (
    <Stack spacing={feedSpacing} sx={{ maxWidth: 640, mx: 'auto', pb: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">Timeline</Typography>
        <Chip size="small" color={CHIP_COLOR[conn]} label={conn === 'connected' ? 'live' : conn} />
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={kind}
          onChange={(_e, v) => v && setKind(v)}
        >
          <ToggleButton value="home">Home</ToggleButton>
          <ToggleButton value="global">Global</ToggleButton>
        </ToggleButtonGroup>
        <TimelineSettingsMenu />
      </Stack>

      <Composer onPosted={onPosted} />

      {query.isLoading && (
        <Stack spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <PostSkeleton key={i} />
          ))}
        </Stack>
      )}
      {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}
      {query.isSuccess && posts.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
          {kind === 'home'
            ? 'Your home feed is empty — follow people or switch to Global.'
            : 'No posts yet. Be the first to post!'}
        </Typography>
      )}

      {posts.map((post) => (
        <Box key={post.id}>
          <PostCard
            post={post}
            isOwn={post.userId === userId}
            onToggleLike={(p) => likeMutation.mutate(p)}
            onToggleBookmark={(p) => bookmarkMutation.mutate(p)}
            onOpenDetail={(p) => navigate(`/feed/${p.id}`)}
            onUpdated={onUpdated}
            onDeleted={onDeleted}
          />
          <InlineComments
            postId={post.id}
            commentCount={post.commentCount ?? 0}
            currentUserId={userId}
            onOpenDetail={() => navigate(`/feed/${post.id}`)}
          />
        </Box>
      ))}
    </Stack>
  );
}
