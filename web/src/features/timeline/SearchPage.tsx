import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { timelineApi, type Post, type SearchResponse } from '@/api/timeline';
import { PostCard, PostSkeleton } from './PostCard';

const LIMIT = 20;
const MIN_LEN = 2;

type SearchData = InfiniteData<SearchResponse>;

function patch(
  qc: ReturnType<typeof useQueryClient>,
  q: string,
  fn: (posts: Post[]) => Post[],
) {
  qc.setQueryData<SearchData>(['timeline', 'search', q], (prev) =>
    prev ? { ...prev, pages: prev.pages.map((pg) => ({ ...pg, posts: fn(pg.posts) })) } : prev,
  );
}

/**
 * Search — full-text post search (q param, min 2 chars), debounced, paginated
 * via Load more. Results reuse PostCard with optimistic like/bookmark and
 * edit/delete. Trending hashtags (when available) act as quick searches.
 */
export function SearchPage() {
  const userId = useAppStore((s) => s.user?.id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  // Debounce the query (300ms) so we don't search on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const enabled = q.length >= MIN_LEN;

  const query = useInfiniteQuery({
    queryKey: ['timeline', 'search', q],
    queryFn: ({ pageParam }) => timelineApi.searchPosts(q, { offset: pageParam, limit: LIMIT }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.pagination?.hasMore
        ? (last.pagination.offset ?? 0) + (last.pagination.limit ?? LIMIT)
        : undefined,
    enabled,
  });

  const trending = useQuery({
    queryKey: ['timeline', 'trending-hashtags'],
    queryFn: () => timelineApi.trendingHashtags(),
    enabled: !enabled,
  });

  const likeMutation = useMutation({
    mutationFn: (post: Post) => (post.liked ? timelineApi.unlike(post.id) : timelineApi.like(post.id)),
    onMutate: async (post: Post) => {
      const willLike = !post.liked;
      patch(qc, q, (posts) =>
        posts.map((p) =>
          p.id === post.id
            ? { ...p, liked: willLike, likeCount: Math.max(0, (p.likeCount ?? 0) + (willLike ? 1 : -1)) }
            : p,
        ),
      );
    },
    onError: (_err, post) => {
      patch(qc, q, (posts) =>
        posts.map((p) => (p.id === post.id ? { ...p, liked: post.liked, likeCount: post.likeCount } : p)),
      );
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: (post: Post) =>
      post.bookmarked ? timelineApi.unbookmark(post.id) : timelineApi.bookmark(post.id),
    onMutate: async (post: Post) => {
      const willBookmark = !post.bookmarked;
      patch(qc, q, (posts) =>
        posts.map((p) => (p.id === post.id ? { ...p, bookmarked: willBookmark } : p)),
      );
    },
    onError: (_err, post) => {
      patch(qc, q, (posts) =>
        posts.map((p) => (p.id === post.id ? { ...p, bookmarked: post.bookmarked } : p)),
      );
    },
  });

  const onUpdated = (post: Post) =>
    patch(qc, q, (posts) => posts.map((p) => (p.id === post.id ? { ...p, ...post } : p)));
  const onDeleted = (postId: string) => patch(qc, q, (posts) => posts.filter((p) => p.id !== postId));

  const posts = useMemo(
    () => (query.data?.pages ?? []).flatMap((pg) => pg.posts),
    [query.data],
  );
  const searchMethod = query.data?.pages?.[0]?.searchMethod;
  const total = query.data?.pages?.[0]?.total;

  const tags = trending.data?.hashtags ?? trending.data?.trending ?? [];

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  return (
    <Stack spacing={2} sx={{ maxWidth: 640, mx: 'auto', pb: 6 }}>
      <Typography variant="h5" component="h1">Search</Typography>

      <TextField
        fullWidth
        autoFocus
        placeholder="Search posts…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {!enabled && (
        <>
          <Typography color="text.secondary" variant="body2">
            {input.trim().length > 0
              ? `Type at least ${MIN_LEN} characters to search.`
              : 'Search posts by keyword or hashtag.'}
          </Typography>
          {tags.length > 0 && (
            <Box>
              <Typography variant="overline" color="text.secondary">
                Trending
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                {tags.map((t) => (
                  <Chip
                    key={t.tag}
                    label={`#${t.tag}`}
                    size="small"
                    onClick={() => setInput(`#${t.tag}`)}
                    clickable
                  />
                ))}
              </Stack>
            </Box>
          )}
        </>
      )}

      {enabled && (
        <>
          {query.isLoading && (
            <Stack spacing={2}>
              {Array.from({ length: 4 }).map((_, i) => (
                <PostSkeleton key={i} />
              ))}
            </Stack>
          )}
          {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}
          {query.isSuccess && (
            <Stack direction="row" spacing={1} alignItems="baseline">
              <Typography variant="body2" color="text.secondary">
                {total != null ? `${total} result${total === 1 ? '' : 's'}` : `${posts.length} results`}
              </Typography>
              {searchMethod && (
                <Typography variant="caption" color="text.disabled">
                  · via {searchMethod}
                </Typography>
              )}
            </Stack>
          )}
          {query.isSuccess && posts.length === 0 && (
            <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
              No posts match “{q}”.
            </Typography>
          )}

          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isOwn={post.userId === userId}
              onToggleLike={(p) => likeMutation.mutate(p)}
              onToggleBookmark={(p) => bookmarkMutation.mutate(p)}
              onOpenDetail={(p) => navigate(`/feed/${p.id}`)}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
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
        </>
      )}
    </Stack>
  );
}
