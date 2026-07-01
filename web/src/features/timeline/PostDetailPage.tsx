import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { timelineApi, type Comment, type Post } from '@/api/timeline';
import { PostCard, PostSkeleton } from './PostCard';
import { absoluteTime, initials, relativeTime, shortHandle } from './util';

const COMMENT_MAX = 2000;

function postKey(id: string) {
  return ['timeline', 'post', id] as const;
}
function commentsKey(id: string) {
  return ['timeline', 'post', id, 'comments'] as const;
}

/** One comment row — avatar, author, relative time, body. */
function CommentRow({ comment, isOwn }: { comment: Comment; isOwn: boolean }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1.25 }}>
      <Avatar sx={{ bgcolor: isOwn ? 'primary.main' : 'grey.600', width: 32, height: 32, fontSize: 13 }}>
        {initials(comment.userId)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {isOwn ? 'You' : shortHandle(comment.userId)}
          </Typography>
          <Tooltip title={absoluteTime(comment.createdAt)}>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
              · {relativeTime(comment.createdAt)}
            </Typography>
          </Tooltip>
        </Stack>
        <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {comment.content}
        </Typography>
      </Box>
    </Stack>
  );
}

/**
 * Full-content / permalink view for a single post. Fetches the post by id,
 * renders it with the shared PostCard (full body + rich media: images,
 * galleries, video, live), and shows the comment thread with an inline
 * composer. Likes and bookmarks toggle optimistically against the single-post
 * cache; new comments prepend on success and bump the post's commentCount.
 */
export function PostDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const postQ = useQuery({
    queryKey: postKey(id),
    queryFn: () => timelineApi.getPost(id),
    enabled: !!id,
  });
  const commentsQ = useQuery({
    queryKey: commentsKey(id),
    queryFn: () => timelineApi.comments(id, { limit: 100 }),
    enabled: !!id,
  });

  const patchPost = (fn: (p: Post) => Post) =>
    qc.setQueryData<{ success: boolean; post: Post }>(postKey(id), (prev) =>
      prev?.post ? { ...prev, post: fn(prev.post) } : prev,
    );

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

  const commentMutation = useMutation({
    mutationFn: () => timelineApi.comment(id, draft.trim()),
    onSuccess: (res) => {
      setDraft('');
      if (res?.comment) {
        qc.setQueryData<{ comments: Comment[] }>(commentsKey(id), (prev) =>
          prev ? { ...prev, comments: [...prev.comments, res.comment] } : prev,
        );
      }
      patchPost((p) => ({ ...p, commentCount: (p.commentCount ?? 0) + 1 }));
    },
  });

  const onUpdated = (post: Post) => patchPost((p) => ({ ...p, ...post }));
  const onDeleted = () => navigate('/feed');

  const post = postQ.data?.post;
  const comments = commentsQ.data?.comments ?? [];
  const commentTooLong = draft.length > COMMENT_MAX;
  const canComment = draft.trim().length > 0 && !commentTooLong && !commentMutation.isPending;

  return (
    <Stack spacing={2} sx={{ maxWidth: 640, mx: 'auto', pb: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton size="small" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">Post</Typography>
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
              {post.commentCount ?? comments.length} {(post.commentCount ?? comments.length) === 1 ? 'comment' : 'comments'}
            </Typography>

            {userId && (
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField
                  fullWidth
                  multiline
                  minRows={1}
                  maxRows={6}
                  size="small"
                  placeholder="Write a comment…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canComment) commentMutation.mutate();
                  }}
                  error={commentTooLong}
                  helperText={commentTooLong ? `${draft.length}/${COMMENT_MAX}` : undefined}
                />
                <Button variant="contained" disabled={!canComment} onClick={() => commentMutation.mutate()}>
                  {commentMutation.isPending ? '…' : 'Reply'}
                </Button>
              </Stack>
            )}
            {commentMutation.isError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {toMessage(commentMutation.error)}
              </Alert>
            )}

            <Divider />

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
            {commentsQ.isSuccess && comments.length === 0 && (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                No comments yet — start the conversation.
              </Typography>
            )}

            <Stack divider={<Divider />}>
              {comments.map((c) => (
                <CommentRow key={c.id} comment={c} isOwn={c.userId === userId} />
              ))}
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
  );
}
