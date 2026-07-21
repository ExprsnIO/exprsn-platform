/**
 * Inline comment preview shown under a post in the feed. Renders the top N
 * top-level comments (N + order come from the user's timeline prefs —
 * `feedInlineCount` and `commentSort`), each markdown-rendered with a reply-count
 * hint, plus a "view all" affordance that opens the post's full threaded view.
 *
 * Purely a preview: replies/threading, composing, and grouping live on the post
 * detail page. Disabled entirely when `feedInlineCount` is 0.
 */
import { useQuery } from '@tanstack/react-query';
import { Avatar, Box, Button, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import ModeCommentOutlinedIcon from '@mui/icons-material/ModeCommentOutlined';
import { timelineApi } from '@/api/timeline';
import { useTimelinePrefs } from '@/app/timelinePrefs';
import { RichText } from './RichText';
import { absoluteTime, initials, relativeTime, shortHandle } from './util';
import { buildTree, sortTree } from './comments/commentTree';

// Fetch a bounded page — enough to order the top-level comments sensibly for a
// preview without pulling an entire long thread into the feed.
const PREVIEW_FETCH_LIMIT = 50;

function inlineKey(postId: string, sort: string) {
  return ['timeline', 'post', postId, 'inline', sort] as const;
}

export function InlineComments({
  postId,
  commentCount,
  currentUserId,
  onOpenDetail,
}: {
  postId: string;
  commentCount: number;
  currentUserId?: string;
  onOpenDetail: () => void;
}) {
  const { feedInlineCount, commentSort, markdown, density } = useTimelinePrefs();
  const dense = density === 'compact';
  const enabled = feedInlineCount > 0 && commentCount > 0;

  // 'top' is derived client-side (needs the reply graph); the API only sorts by
  // time, so fetch newest and re-order locally for newest/top, oldest for oldest.
  const fetchSort: 'newest' | 'oldest' = commentSort === 'oldest' ? 'oldest' : 'newest';

  const q = useQuery({
    queryKey: inlineKey(postId, fetchSort),
    queryFn: () => timelineApi.comments(postId, { limit: PREVIEW_FETCH_LIMIT, sort: fetchSort }),
    enabled,
    staleTime: 15_000,
  });

  if (!enabled) return null;

  if (q.isLoading) {
    return (
      <Box sx={{ pl: dense ? 1.5 : 2, py: 0.5 }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="45%" />
      </Box>
    );
  }
  // Preview is non-critical — stay silent on error rather than shouting in the feed.
  if (q.isError || !q.data) return null;

  const all = q.data.comments ?? [];
  const roots = sortTree(buildTree(all, true), commentSort);
  const shown = roots.slice(0, feedInlineCount);
  if (shown.length === 0) return null;

  const hiddenTop = Math.max(0, roots.length - shown.length);
  const hasMore = commentCount > shown.length || hiddenTop > 0 || shown.some((n) => n.replies.length > 0);

  return (
    <Box
      sx={{
        mt: 0.5,
        ml: dense ? 1 : 1.5,
        pl: dense ? 1.5 : 2,
        borderLeft: '2px solid',
        borderColor: 'divider',
      }}
    >
      <Stack spacing={dense ? 0.75 : 1}>
        {shown.map(({ comment, descendantCount }) => {
          const isOwn = comment.userId === currentUserId;
          return (
            <Stack key={comment.id} direction="row" spacing={dense ? 1 : 1.25} sx={{ alignItems: 'flex-start' }}>
              <Avatar
                sx={{
                  bgcolor: isOwn ? 'primary.main' : 'grey.600',
                  width: dense ? 24 : 28,
                  height: dense ? 24 : 28,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {initials(comment.userId)}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {isOwn ? 'You' : shortHandle(comment.userId)}
                  </Typography>
                  <Tooltip title={absoluteTime(comment.createdAt)}>
                    <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
                      · {relativeTime(comment.createdAt)}
                    </Typography>
                  </Tooltip>
                </Stack>
                <RichText text={comment.content} markdown={markdown} dense />
                {descendantCount > 0 && (
                  <Button
                    size="small"
                    onClick={onOpenDetail}
                    sx={{ textTransform: 'none', color: 'text.secondary', minWidth: 0, px: 0, mt: 0.25 }}
                  >
                    {descendantCount} {descendantCount === 1 ? 'reply' : 'replies'}
                  </Button>
                )}
              </Box>
            </Stack>
          );
        })}
      </Stack>

      {hasMore && (
        <Button
          size="small"
          startIcon={<ModeCommentOutlinedIcon fontSize="small" />}
          onClick={onOpenDetail}
          sx={{ textTransform: 'none', mt: 0.5, color: 'text.secondary' }}
        >
          View all {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
        </Button>
      )}
    </Box>
  );
}
