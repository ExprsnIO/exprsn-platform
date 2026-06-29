import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Stack, Typography } from '@mui/material';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { timelineApi, type BookmarksResponse, type Post } from '@/api/timeline';
import { PostCard, PostSkeleton } from './PostCard';

const KEY = ['timeline', 'bookmarks'] as const;

function patch(qc: ReturnType<typeof useQueryClient>, fn: (posts: Post[]) => Post[]) {
  qc.setQueryData<BookmarksResponse>(KEY, (prev) =>
    prev ? { ...prev, bookmarks: fn(prev.bookmarks) } : prev,
  );
}

/**
 * Bookmarks — the signed-in user's saved posts. Reuses PostCard with optimistic
 * like, edit/delete, and a bookmark toggle that removes the post from the list
 * (since unbookmarking takes it out of this feed).
 */
export function BookmarksPage() {
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => timelineApi.bookmarksFeed({ limit: 50 }),
  });

  const likeMutation = useMutation({
    mutationFn: (post: Post) => (post.liked ? timelineApi.unlike(post.id) : timelineApi.like(post.id)),
    onMutate: async (post: Post) => {
      const willLike = !post.liked;
      patch(qc, (posts) =>
        posts.map((p) =>
          p.id === post.id
            ? { ...p, liked: willLike, likeCount: Math.max(0, (p.likeCount ?? 0) + (willLike ? 1 : -1)) }
            : p,
        ),
      );
    },
    onError: (_err, post) => {
      patch(qc, (posts) =>
        posts.map((p) => (p.id === post.id ? { ...p, liked: post.liked, likeCount: post.likeCount } : p)),
      );
    },
  });

  // On this feed everything is bookmarked; toggling removes it from the list.
  const unbookmarkMutation = useMutation({
    mutationFn: (post: Post) => timelineApi.unbookmark(post.id),
    onMutate: async (post: Post) => {
      const prev = qc.getQueryData<BookmarksResponse>(KEY);
      patch(qc, (posts) => posts.filter((p) => p.id !== post.id));
      return { prev };
    },
    onError: (_err, _post, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
  });

  const onUpdated = (post: Post) =>
    patch(qc, (posts) => posts.map((p) => (p.id === post.id ? { ...p, ...post } : p)));
  const onDeleted = (postId: string) => patch(qc, (posts) => posts.filter((p) => p.id !== postId));

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  const posts = (query.data?.bookmarks ?? []).map((p) => ({ ...p, bookmarked: true }));

  return (
    <Stack spacing={2} sx={{ maxWidth: 640, mx: 'auto', pb: 6 }}>
      <Typography variant="h5">Bookmarks</Typography>

      {query.isLoading && (
        <Stack spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <PostSkeleton key={i} />
          ))}
        </Stack>
      )}
      {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}
      {query.isSuccess && posts.length === 0 && (
        <Stack alignItems="center" spacing={1} sx={{ p: 6, color: 'text.secondary' }}>
          <BookmarkBorderIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
          <Typography color="text.secondary">No bookmarks yet.</Typography>
        </Stack>
      )}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          isOwn={post.userId === userId}
          onToggleLike={(p) => likeMutation.mutate(p)}
          onToggleBookmark={(p) => unbookmarkMutation.mutate(p)}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      ))}
    </Stack>
  );
}
