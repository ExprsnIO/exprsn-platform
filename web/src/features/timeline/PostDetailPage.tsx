import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAppStore } from '@/app/store';
import { useTimelinePrefs } from '@/app/timelinePrefs';
import { toMessage } from '@/lib/errors';
import { timelineApi, type Comment, type Post } from '@/api/timeline';
import { PostCard, PostSkeleton } from './PostCard';
import { CommentThread } from './comments/CommentThread';
import { CommentComposer } from './comments/CommentComposer';

function postKey(id: string) {
  return ['timeline', 'post', id] as const;
}
function commentsKey(id: string, sort: string) {
  return ['timeline', 'post', id, 'comments', sort] as const;
}

/**
 * Full-content / permalink view for a single post. Fetches the post by id,
 * renders it with the shared PostCard (full body + rich media), and shows the
 * threaded comment section (markdown, nested replies, sort/filter/group) driven
 * by the user's persisted timeline prefs. Likes and bookmarks toggle
 * optimistically against the single-post cache; new comments/replies patch the
 * comment cache and bump the post's commentCount.
 */
export function PostDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  // The list sort is a persisted pref; 'top' is derived client-side, so the API
  // only needs newest/oldest. Key the query by the fetch sort so switching
  // newest⇄oldest refetches while 'top' reuses the newest fetch.
  const commentSort = useTimelinePrefs((s) => s.commentSort);
  const markdown = useTimelinePrefs((s) => s.markdown);
  const fetchSort: 'newest' | 'oldest' = commentSort === 'oldest' ? 'oldest' : 'newest';

  const postQ = useQuery({
    queryKey: postKey(id),
    queryFn: () => timelineApi.getPost(id),
    enabled: !!id,
  });
  const commentsQ = useQuery({
    queryKey: commentsKey(id, fetchSort),
    // Fetch the whole set (capped) so the tree/threading is complete client-side.
    queryFn: () => timelineApi.comments(id, { limit: 500, sort: fetchSort }),
    enabled: !!id,
  });

  const patchPost = (fn: (p: Post) => Post) =>
    qc.setQueryData<{ success: boolean; post: Post }>(postKey(id), (prev) =>
      prev?.post ? { ...prev, post: fn(prev.post) } : prev,
    );

  const appendComment = (comment: Comment) => {
    // Patch every cached sort variant so the new row shows regardless of order.
    qc.setQueriesData<{ comments: Comment[] }>(
      { queryKey: ['timeline', 'post', id, 'comments'] },
      (prev) => (prev ? { ...prev, comments: [...prev.comments, comment] } : prev),
    );
    patchPost((p) => ({ ...p, commentCount: (p.commentCount ?? 0) + 1 }));
  };

  const likeMutation = useMutation({
    mutationFn: (post: Post) => (post.liked ? timelineApi.unlike(post.id) : timelineApi.like(post.id)),
    onMutate: (post: Post) => {
      const willLike = !post.liked;
      patchPost((p) => ({
        ...p,
        liked: willLike,
        likeCount: Math.max(0, (p.likeCount ?? 0) + (willLike ? 1 : -1)),
      }));
    },
    onError: (_e, post) => patchPost((p) => ({ ...p, liked: post.liked, likeCount: post.likeCount })),
  });

  const bookmarkMutation = useMutation({
    mutationFn: (post: Post) =>
      post.bookmarked ? timelineApi.unbookmark(post.id) : timelineApi.bookmark(post.id),
    onMutate: (post: Post) => patchPost((p) => ({ ...p, bookmarked: !post.bookmarked })),
    onError: (_e, post) => patchPost((p) => ({ ...p, bookmarked: post.bookmarked })),
  });

  // Top-level comment.
  const commentMutation = useMutation({
    mutationFn: () => timelineApi.comment(id, draft.trim()),
    onSuccess: (res) => {
      setDraft('');
      if (res?.comment) appendComment(res.comment);
    },
  });

  // Threaded reply — awaited by CommentNode so it can show inline errors and
  // close its composer on success.
  const submitReply = async (parentId: string, content: string) => {
    const res = await timelineApi.comment(id, content, parentId);
    if (res?.comment) appendComment(res.comment);
  };

  const onUpdated = (post: Post) => patchPost((p) => ({ ...p, ...post }));
  const onDeleted = () => navigate('/feed');

  const post = postQ.data?.post;
  const comments = commentsQ.data?.comments ?? [];
  const count = post?.commentCount ?? comments.length;

  return (
    <Stack spacing={2} sx={{ maxWidth: 680, mx: 'auto', pb: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton size="small" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1">Post</Typography>
      </Stack>

      {postQ.isLoading && <PostSkeleton />}
      {postQ.isError && <Alert severity="error">{toMessage(postQ.error)}</Alert>}

      {post && (
        <>
          <PostCard
            post={post}
            isOwn={post.userId === userId}
            onToggleLike={(p) => likeMutation.mutate(p)}
            onToggleBookmark={(p) => bookmarkMutation.mutate(p)}
            onUpdated={onUpdated}
            onDeleted={onDeleted}
          />

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              {count} {count === 1 ? 'comment' : 'comments'}
            </Typography>

            {userId && (
              <Box sx={{ mb: 1.5 }}>
                <CommentComposer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => commentMutation.mutate()}
                  submitting={commentMutation.isPending}
                  markdown={markdown}
                  error={commentMutation.isError ? toMessage(commentMutation.error) : null}
                  placeholder="Write a comment…"
                  submitLabel="Comment"
                />
              </Box>
            )}

            <Divider sx={{ mb: 1 }} />

            {commentsQ.isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={20} />
              </Box>
            )}
            {commentsQ.isError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {toMessage(commentsQ.error)}
              </Alert>
            )}
            {commentsQ.isSuccess && (
              <CommentThread comments={comments} userId={userId} submitReply={submitReply} />
            )}
          </Paper>
        </>
      )}
    </Stack>
  );
}
