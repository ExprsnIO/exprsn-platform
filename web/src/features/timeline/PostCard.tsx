import { Avatar, Box, IconButton, Paper, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import RepeatIcon from '@mui/icons-material/Repeat';
import type { Post } from '@/api/timeline';
import { absoluteTime, initials, relativeTime, shortHandle } from './util';

/**
 * A single feed post. Like state is driven by the parent (optimistic toggle);
 * the card itself is presentational beyond firing onToggleLike.
 */
export function PostCard({
  post,
  isOwn,
  onToggleLike,
}: {
  post: Post;
  isOwn: boolean;
  onToggleLike: (post: Post) => void;
}) {
  const liked = !!post.liked;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5}>
        <Avatar sx={{ bgcolor: isOwn ? 'primary.main' : 'grey.600', width: 40, height: 40 }}>
          {initials(post.userId)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {isOwn ? 'You' : shortHandle(post.userId)}
            </Typography>
            <Tooltip title={absoluteTime(post.createdAt)}>
              <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
                · {relativeTime(post.createdAt)}
              </Typography>
            </Tooltip>
            {post.visibility && post.visibility !== 'public' && (
              <Typography variant="caption" color="text.secondary">
                · {post.visibility}
              </Typography>
            )}
          </Stack>

          <Typography variant="body1" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {post.content}
          </Typography>

          <Stack direction="row" spacing={3} sx={{ mt: 1, color: 'text.secondary' }}>
            <Tooltip title={liked ? 'Unlike' : 'Like'}>
              <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                <IconButton
                  size="small"
                  color={liked ? 'error' : 'default'}
                  onClick={() => onToggleLike(post)}
                >
                  {liked ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
                </IconButton>
                <Typography variant="caption">{post.likeCount ?? 0}</Typography>
              </Box>
            </Tooltip>

            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <ChatBubbleOutlineIcon fontSize="small" />
              <Typography variant="caption">{post.commentCount ?? 0}</Typography>
            </Box>

            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <RepeatIcon fontSize="small" />
              <Typography variant="caption">{post.repostCount ?? 0}</Typography>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

/**
 * Shimmer placeholder matching PostCard's layout — the Exprsn "Loaders &
 * Skeletons" pattern, rendered with MUI's theme-aware <Skeleton>. Shown while
 * the feed query is loading so the page keeps its shape instead of flashing a
 * bare spinner.
 */
export function PostSkeleton() {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="95%" />
          <Skeleton variant="text" width="80%" />
          <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
            <Skeleton variant="text" width={32} />
            <Skeleton variant="text" width={32} />
            <Skeleton variant="text" width={32} />
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}
