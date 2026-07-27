import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import RepeatIcon from '@mui/icons-material/Repeat';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { timelineApi, type Post } from '@/api/timeline';
import { useTimelinePrefs } from '@/app/timelinePrefs';
import { toMessage } from '@/lib/errors';
import { ShareToChatDialog } from '@/features/messages/ShareToChatDialog';
import { ReportDialog } from '@/features/moderation/ReportDialog';
import { absoluteTime, initials, relativeTime, shortHandle } from './util';
import { PostMediaGrid } from './PostMedia';
import { RichText } from './RichText';

const MAX_LEN = 4000;

/**
 * A single feed post. Like/repost/bookmark state is driven by the parent
 * (optimistic toggle); the card stays presentational for those. Edit and delete
 * are self-contained (author-gated PUT/DELETE) and notify the parent via
 * onUpdated/onDeleted so it can patch its query cache. The overflow menu only
 * shows when the post is the viewer's own AND a cache callback is provided.
 */
export function PostCard({
  post,
  isOwn,
  onToggleLike,
  onComment,
  onToggleRepost,
  onToggleBookmark,
  onOpenDetail,
  onUpdated,
  onDeleted,
}: {
  post: Post;
  isOwn: boolean;
  onToggleLike: (post: Post) => void;
  /** When provided, the comment affordance becomes a button. */
  onComment?: (post: Post) => void;
  /**
   * When provided, the timestamp links to the full-content view and the comment
   * affordance opens it (unless `onComment` overrides). Used by feed lists to
   * navigate to the post permalink; omitted on the detail page itself.
   */
  onOpenDetail?: (post: Post) => void;
  /** When provided, the repost affordance becomes a toggle button. */
  onToggleRepost?: (post: Post) => void;
  /** When provided, a bookmark toggle is shown. */
  onToggleBookmark?: (post: Post) => void;
  /** When provided (and isOwn), an Edit menu item patches the post in the cache. */
  onUpdated?: (post: Post) => void;
  /** When provided (and isOwn), a Delete menu item removes the post from cache. */
  onDeleted?: (postId: string) => void;
}) {
  const liked = !!post.liked;
  const reposted = !!post.reposted;
  const bookmarked = !!post.bookmarked;
  const media = Array.isArray(post.media) ? post.media : [];

  const canManage = isOwn && (!!onUpdated || !!onDeleted);
  // Anyone can report content that isn't their own (FEAT-010, timeline-first).
  const canReport = !isOwn;
  const showMenu = canManage || canReport;
  const [menuEl, setMenuEl] = useState<null | HTMLElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const markdown = useTimelinePrefs((s) => s.markdown);

  const editMutation = useMutation({
    mutationFn: () => timelineApi.updatePost(post.id, draft.trim()),
    onSuccess: (res) => {
      setEditOpen(false);
      if (res?.post) onUpdated?.(res.post);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => timelineApi.deletePost(post.id),
    onSuccess: () => {
      setDeleteOpen(false);
      onDeleted?.(post.id);
    },
  });

  const editTooLong = draft.length > MAX_LEN;
  const canSaveEdit = draft.trim().length > 0 && !editTooLong && !editMutation.isPending;

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
              <Typography
                variant="caption"
                color="text.secondary"
                onClick={onOpenDetail ? () => onOpenDetail(post) : undefined}
                sx={{
                  cursor: onOpenDetail ? 'pointer' : 'default',
                  '&:hover': onOpenDetail ? { textDecoration: 'underline' } : undefined,
                }}
              >
                · {relativeTime(post.createdAt)}
              </Typography>
            </Tooltip>
            {post.visibility && post.visibility !== 'public' && (
              <Typography variant="caption" color="text.secondary">
                · {post.visibility}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            {showMenu && (
              <IconButton size="small" onClick={(e) => setMenuEl(e.currentTarget)} aria-label="Post actions">
                <MoreVertIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>

          <Box sx={{ mt: 0.5 }}>
            <RichText text={post.content} markdown={markdown} />
          </Box>

          {media.length > 0 && <PostMediaGrid media={media} />}

          <Stack direction="row" spacing={3} sx={{ mt: 1, color: 'text.secondary' }}>
            <Tooltip title={liked ? 'Unlike' : 'Like'}>
              <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                <IconButton
                  size="small"
                  color={liked ? 'error' : 'default'}
                  aria-label={liked ? 'Unlike' : 'Like'}
                  onClick={() => onToggleLike(post)}
                >
                  {liked ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
                </IconButton>
                <Typography variant="caption">{post.likeCount ?? 0}</Typography>
              </Box>
            </Tooltip>

            {onComment || onOpenDetail ? (
              <Tooltip title={onComment ? 'Comment' : 'View thread'}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                  <IconButton
                    size="small"
                    aria-label={onComment ? 'Comment' : 'View thread'}
                    onClick={() => (onComment ? onComment(post) : onOpenDetail?.(post))}
                  >
                    <ChatBubbleOutlineIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="caption">{post.commentCount ?? 0}</Typography>
                </Box>
              </Tooltip>
            ) : (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <ChatBubbleOutlineIcon fontSize="small" />
                <Typography variant="caption">{post.commentCount ?? 0}</Typography>
              </Box>
            )}

            {onToggleRepost ? (
              <Tooltip title={reposted ? 'Undo repost' : 'Repost'}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                  <IconButton
                    size="small"
                    color={reposted ? 'success' : 'default'}
                    aria-label={reposted ? 'Undo repost' : 'Repost'}
                    onClick={() => onToggleRepost(post)}
                  >
                    <RepeatIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="caption">{post.repostCount ?? 0}</Typography>
                </Box>
              </Tooltip>
            ) : (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <RepeatIcon fontSize="small" />
                <Typography variant="caption">{post.repostCount ?? 0}</Typography>
              </Box>
            )}

            {onToggleBookmark && (
              <Tooltip title={bookmarked ? 'Remove bookmark' : 'Bookmark'}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                  <IconButton
                    size="small"
                    color={bookmarked ? 'primary' : 'default'}
                    aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                    onClick={() => onToggleBookmark(post)}
                  >
                    {bookmarked ? (
                      <BookmarkIcon fontSize="small" />
                    ) : (
                      <BookmarkBorderIcon fontSize="small" />
                    )}
                  </IconButton>
                </Box>
              </Tooltip>
            )}

            <Tooltip title="Share to chat">
              <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                <IconButton size="small" aria-label="Share to chat" onClick={() => setShareOpen(true)}>
                  <SendOutlinedIcon fontSize="small" />
                </IconButton>
              </Box>
            </Tooltip>
          </Stack>
        </Box>
      </Stack>

      {/* Overflow menu: own posts (Edit/Delete) or others' posts (Report) */}
      <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
        {onUpdated && (
          <MenuItem
            onClick={() => {
              setMenuEl(null);
              setDraft(post.content);
              editMutation.reset();
              setEditOpen(true);
            }}
          >
            <EditOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
            Edit
          </MenuItem>
        )}
        {onDeleted && (
          <MenuItem
            onClick={() => {
              setMenuEl(null);
              deleteMutation.reset();
              setDeleteOpen(true);
            }}
            sx={{ color: 'error.main' }}
          >
            <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
            Delete
          </MenuItem>
        )}
        {canReport && (
          <MenuItem
            onClick={() => {
              setMenuEl(null);
              setReportOpen(true);
            }}
          >
            <FlagOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
            Report
          </MenuItem>
        )}
      </Menu>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit post</DialogTitle>
        <DialogContent>
          {editMutation.isError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {toMessage(editMutation.error)}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            maxRows={12}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            error={editTooLong}
            helperText={`${draft.length}/${MAX_LEN}`}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setEditOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!canSaveEdit} onClick={() => editMutation.mutate()}>
            {editMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs">
        <DialogTitle>Delete post?</DialogTitle>
        <DialogContent>
          {deleteMutation.isError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {toMessage(deleteMutation.error)}
            </Alert>
          )}
          <DialogContentText>This can’t be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share this post into a chat (link card) */}
      <ShareToChatDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share post to chat"
        payload={{
          attachments: [
            {
              kind: 'link',
              url: `/feed/${post.id}`,
              title: post.content ? post.content.slice(0, 60) : 'Timeline post',
              subtitle: 'Timeline post',
            },
          ],
        }}
      />

      {/* Report this post to moderation (timeline-first slice of FEAT-010) */}
      {canReport && (
        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          contentType="post"
          contentId={post.id}
          sourceService="timeline"
          contentLabel="post"
        />
      )}
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
