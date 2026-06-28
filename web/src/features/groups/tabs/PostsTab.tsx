import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useAppStore } from '@/app/store';
import { NS, namespace, connect } from '@/lib/realtime';
import { useNamespaceStatus, type ConnState } from '@/lib/useRealtime';
import { isHttpError, toMessage } from '@/lib/errors';
import { EmojiButton } from '@/components/EmojiPicker';
import {
  timelineApi,
  type GroupFeedResponse,
  type Post,
} from '@/api/timeline';
import { PostCard, PostSkeleton } from '@/features/timeline/PostCard';
import { absoluteTime, relativeTime, shortHandle } from '@/features/timeline/util';
import type { GroupTabProps } from './types';

const MAX_LEN = 4000;
const PAGE_SIZE = 20;

const CHIP_COLOR: Record<ConnState, 'success' | 'warning' | 'default' | 'error'> = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'default',
  error: 'error',
};

type FeedData = InfiniteData<GroupFeedResponse>;

function feedKey(groupId: string) {
  return ['timeline', 'group', groupId] as const;
}

/** Derive the current user's like state from the included `likes` rows. */
function deriveLiked(post: Post, userId?: string): Post {
  if (post.liked != null || !userId) return post;
  return { ...post, liked: !!post.likes?.some((l) => l.userId === userId) };
}

/** Mutate every cached page's posts in place, leaving pagination intact. */
function patchFeed(
  qc: ReturnType<typeof useQueryClient>,
  groupId: string,
  fn: (posts: Post[]) => Post[],
) {
  qc.setQueryData<FeedData>(feedKey(groupId), (prev) =>
    prev ? { ...prev, pages: prev.pages.map((pg) => ({ ...pg, posts: fn(pg.posts) })) } : prev,
  );
}

/** Prepend a freshly-created/broadcast post to the first page (deduped by id). */
function prependPost(qc: ReturnType<typeof useQueryClient>, groupId: string, post: Post) {
  qc.setQueryData<FeedData>(feedKey(groupId), (prev) => {
    if (!prev || prev.pages.length === 0) return prev;
    const exists = prev.pages.some((pg) => pg.posts.some((p) => p.id === post.id));
    if (exists) return prev;
    const [first, ...rest] = prev.pages;
    return { ...prev, pages: [{ ...first, posts: [post, ...first.posts] }, ...rest] };
  });
}

// ── Composer ──────────────────────────────────────────────────────────────
function GroupComposer({ groupId, onPosted }: { groupId: string; onPosted: (post: Post) => void }) {
  const [content, setContent] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const mutation = useMutation({
    mutationFn: () => timelineApi.createGroupPost(groupId, content.trim()),
    onSuccess: (res) => {
      setContent('');
      if (res?.post) onPosted(res.post);
    },
  });

  const trimmed = content.trim();
  const tooLong = content.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !tooLong && !mutation.isPending;

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    const next = content.slice(0, start) + emoji + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const caret = start + emoji.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <TextField
          inputRef={inputRef}
          multiline
          minRows={2}
          maxRows={8}
          fullWidth
          placeholder="Share something with the group…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canPost) mutation.mutate();
          }}
          error={tooLong}
        />
        {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EmojiButton onSelect={insertEmoji} disabled={mutation.isPending} />
          <Box sx={{ flex: 1 }} />
          <Box component="span" sx={{ fontSize: 12, color: tooLong ? 'error.main' : 'text.secondary' }}>
            {content.length}/{MAX_LEN}
          </Box>
          <Button
            variant="contained"
            endIcon={<SendIcon />}
            disabled={!canPost}
            onClick={() => mutation.mutate()}
          >
            Post
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

// ── Comments dialog ─────────────────────────────────────────────────────────
function CommentsDialog({
  post,
  userId,
  canComment,
  onClose,
  onCommented,
}: {
  post: Post | null;
  userId?: string;
  canComment: boolean;
  onClose: () => void;
  onCommented: (postId: string) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const open = !!post;
  const postId = post?.id;

  const q = useQuery({
    queryKey: ['timeline', 'comments', postId],
    queryFn: () => timelineApi.comments(postId as string, { limit: 50 }),
    enabled: open && !!postId,
  });

  const addMut = useMutation({
    mutationFn: () => timelineApi.comment(postId as string, draft.trim()),
    onSuccess: () => {
      setDraft('');
      if (postId) {
        qc.invalidateQueries({ queryKey: ['timeline', 'comments', postId] });
        onCommented(postId);
      }
    },
  });

  const canSubmit = draft.trim().length > 0 && !addMut.isPending;
  const comments = q.data?.comments ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Comments</DialogTitle>
      <DialogContent dividers>
        {q.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {q.isError && <Alert severity="error">{toMessage(q.error)}</Alert>}
        {q.isSuccess && comments.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', p: 3 }}>
            No comments yet.
          </Typography>
        )}
        <Stack spacing={1.5}>
          {comments.map((c) => (
            <Box key={c.id}>
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {c.userId === userId ? 'You' : shortHandle(c.userId)}
                </Typography>
                <Typography variant="caption" color="text.secondary" title={absoluteTime(c.createdAt)}>
                  · {relativeTime(c.createdAt)}
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {c.content}
              </Typography>
            </Box>
          ))}
        </Stack>
        {canComment && (
          <>
            <Divider sx={{ my: 2 }} />
            {addMut.isError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {toMessage(addMut.error)}
              </Alert>
            )}
            <TextField
              fullWidth
              multiline
              minRows={2}
              placeholder="Write a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Close
        </Button>
        {canComment && (
          <Button variant="contained" disabled={!canSubmit} onClick={() => addMut.mutate()}>
            {addMut.isPending ? 'Posting…' : 'Comment'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Posts tab — a member-gated group feed. Composer (members only), paginated
 * newest-first feed, optimistic like/repost, a comments dialog, and live
 * updates over the shared `/timeline` Socket.IO namespace (group room
 * `timeline:group:{groupId}`). REST is the source of truth; socket events are
 * best-effort and reflected into the TanStack Query cache.
 */
export default function PostsTab({ groupId, ctx }: GroupTabProps) {
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const conn = useNamespaceStatus(NS.timeline);
  const [toast, setToast] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);

  const canView = ctx.can('viewMemberContent');
  const canPost = ctx.can('post');

  const query = useInfiniteQuery({
    queryKey: feedKey(groupId),
    queryFn: ({ pageParam }) =>
      timelineApi.groupFeed(groupId, {
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam, direction: 'after' as const } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.pagination?.hasMore ? last.pagination?.nextCursor ?? undefined : undefined,
    enabled: !!groupId && canView,
  });

  // Live updates: join the group room and reflect broadcasts into the cache.
  useEffect(() => {
    if (!canView) return;
    const socket = namespace(NS.timeline);
    const subscribe = () => socket.emit('subscribe:group', { groupId });
    if (socket.connected) subscribe();
    socket.on('connect', subscribe);

    const onNewPost = (post: Post) => {
      if (!post?.id || post.groupId !== groupId) return;
      prependPost(qc, groupId, deriveLiked(post, userId));
    };
    const onLiked = ({ postId, userId: actor }: { postId: string; userId: string }) => {
      if (actor === userId) return; // our own like is already applied optimistically
      patchFeed(qc, groupId, (posts) =>
        posts.map((p) => (p.id === postId ? { ...p, likeCount: (p.likeCount ?? 0) + 1 } : p)),
      );
    };
    const onCommented = ({ postId }: { postId: string }) => {
      patchFeed(qc, groupId, (posts) =>
        posts.map((p) => (p.id === postId ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p)),
      );
    };

    socket.on('new:post', onNewPost);
    socket.on('post:liked', onLiked);
    socket.on('post:commented', onCommented);
    connect(NS.timeline);

    return () => {
      if (socket.connected) socket.emit('unsubscribe:group', { groupId });
      socket.off('connect', subscribe);
      socket.off('new:post', onNewPost);
      socket.off('post:liked', onLiked);
      socket.off('post:commented', onCommented);
    };
  }, [qc, groupId, userId, canView]);

  const likeMutation = useMutation({
    mutationFn: (post: Post) => (post.liked ? timelineApi.unlike(post.id) : timelineApi.like(post.id)),
    onMutate: async (post: Post) => {
      const willLike = !post.liked;
      patchFeed(qc, groupId, (posts) =>
        posts.map((p) =>
          p.id === post.id
            ? { ...p, liked: willLike, likeCount: Math.max(0, (p.likeCount ?? 0) + (willLike ? 1 : -1)) }
            : p,
        ),
      );
      return { post };
    },
    onError: (_err, post) => {
      patchFeed(qc, groupId, (posts) =>
        posts.map((p) => (p.id === post.id ? { ...p, liked: post.liked, likeCount: post.likeCount } : p)),
      );
      setToast('Could not update like');
    },
  });

  const repostMutation = useMutation({
    mutationFn: (post: Post) => (post.reposted ? timelineApi.unrepost(post.id) : timelineApi.repost(post.id)),
    onMutate: async (post: Post) => {
      const willRepost = !post.reposted;
      patchFeed(qc, groupId, (posts) =>
        posts.map((p) =>
          p.id === post.id
            ? {
                ...p,
                reposted: willRepost,
                repostCount: Math.max(0, (p.repostCount ?? 0) + (willRepost ? 1 : -1)),
              }
            : p,
        ),
      );
      return { post };
    },
    onSuccess: (_res, post) => setToast(post.reposted ? 'Repost removed' : 'Reposted'),
    onError: (_err, post) => {
      patchFeed(qc, groupId, (posts) =>
        posts.map((p) =>
          p.id === post.id ? { ...p, reposted: post.reposted, repostCount: post.repostCount } : p,
        ),
      );
      setToast('Could not repost');
    },
  });

  // Non-members (incl. of private groups) can't read the feed — the backend
  // 403s and the capability gate is false. Show the gated message.
  if (!canView) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Posts are visible to group members only. Join the group to see them.
      </Typography>
    );
  }

  const posts = (query.data?.pages ?? []).flatMap((pg) => pg.posts).map((p) => deriveLiked(p, userId));

  let body: ReactNode;
  if (query.isLoading) {
    body = (
      <Stack spacing={2}>
        {Array.from({ length: 4 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </Stack>
    );
  } else if (query.isError) {
    body = isHttpError(query.error, 403) ? (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Posts are visible to group members only.
      </Typography>
    ) : (
      <Alert severity="error">{toMessage(query.error)}</Alert>
    );
  } else if (posts.length === 0) {
    body = (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        No posts yet.{canPost ? ' Be the first to post!' : ''}
      </Typography>
    );
  } else {
    body = (
      <Stack spacing={2}>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isOwn={post.userId === userId}
            onToggleLike={(p) => likeMutation.mutate(p)}
            onToggleRepost={(p) => repostMutation.mutate(p)}
            onComment={(p) => setCommentsFor(p)}
          />
        ))}
        {query.hasNextPage && (
          <Box sx={{ textAlign: 'center' }}>
            <Button
              variant="outlined"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </Box>
        )}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
          Posts
        </Typography>
        <Chip size="small" color={CHIP_COLOR[conn]} label={conn === 'connected' ? 'live' : conn} />
      </Stack>

      {canPost && (
        <GroupComposer groupId={groupId} onPosted={(post) => prependPost(qc, groupId, deriveLiked(post, userId))} />
      )}

      {body}

      <CommentsDialog
        post={commentsFor}
        userId={userId}
        canComment={canPost}
        onClose={() => setCommentsFor(null)}
        onCommented={(postId) =>
          patchFeed(qc, groupId, (ps) =>
            ps.map((p) => (p.id === postId ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p)),
          )
        }
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
