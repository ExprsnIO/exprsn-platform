/**
 * One comment in the thread, rendered recursively. Indentation is capped at
 * `maxDepth` (deeper replies stay at the max indent — "capped then flatten") so
 * mobile threads stay readable while the reply graph itself is unbounded. Each
 * node owns its own collapse toggle and inline reply composer.
 */
import { useState } from 'react';
import { Avatar, Box, Button, Collapse, Stack, Tooltip, Typography } from '@mui/material';
import ReplyIcon from '@mui/icons-material/Reply';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { absoluteTime, initials, relativeTime, shortHandle } from '../util';
import { RichText } from '../RichText';
import { CommentComposer } from './CommentComposer';
import type { CommentNodeT } from './commentTree';

const INDENT_PX = 20;

export function CommentNode({
  node,
  maxDepth,
  userId,
  markdown,
  dense,
  submitReply,
}: {
  node: CommentNodeT;
  maxDepth: number;
  userId?: string;
  markdown: boolean;
  dense: boolean;
  submitReply: (parentId: string, content: string) => Promise<void>;
}) {
  const { comment, replies } = node;
  const isOwn = comment.userId === userId;
  const [collapsed, setCollapsed] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replyCount = node.descendantCount;
  const gap = dense ? 1 : 1.25;

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitReply(comment.id, draft.trim());
      setDraft('');
      setReplyOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ py: gap * 0.5 }}>
      <Stack direction="row" spacing={dense ? 1 : 1.5}>
        <Avatar
          sx={{
            bgcolor: isOwn ? 'primary.main' : 'grey.600',
            width: dense ? 28 : 32,
            height: dense ? 28 : 32,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {initials(comment.userId)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {isOwn ? 'You' : shortHandle(comment.userId)}
            </Typography>
            <Tooltip title={absoluteTime(comment.createdAt)}>
              <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
                · {relativeTime(comment.createdAt)}
              </Typography>
            </Tooltip>
          </Stack>

          <Box sx={{ mt: 0.25 }}>
            <RichText text={comment.content} markdown={markdown} dense={dense} />
          </Box>

          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25, ml: -0.5 }}>
            {userId && (
              <Button
                size="small"
                startIcon={<ReplyIcon fontSize="small" />}
                onClick={() => setReplyOpen((v) => !v)}
                sx={{ textTransform: 'none', color: 'text.secondary', minWidth: 0 }}
              >
                Reply
              </Button>
            )}
            {replies.length > 0 && (
              <Button
                size="small"
                startIcon={collapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                onClick={() => setCollapsed((v) => !v)}
                sx={{ textTransform: 'none', color: 'text.secondary', minWidth: 0 }}
              >
                {collapsed
                  ? `Show ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
                  : 'Hide'}
              </Button>
            )}
          </Stack>

          <Collapse in={replyOpen} unmountOnExit>
            <Box sx={{ mt: 1 }}>
              <CommentComposer
                value={draft}
                onChange={setDraft}
                onSubmit={onSubmit}
                submitting={submitting}
                markdown={markdown}
                error={error}
                placeholder={`Reply to ${isOwn ? 'yourself' : shortHandle(comment.userId)}…`}
                submitLabel="Reply"
                autoFocus
                compact
                onCancel={() => {
                  setReplyOpen(false);
                  setError(null);
                }}
              />
            </Box>
          </Collapse>
        </Box>
      </Stack>

      {replies.length > 0 && (
        <Collapse in={!collapsed} unmountOnExit>
          <Box
            sx={{
              // Indent only until the cap, then flatten so deep threads don't
              // march off-screen. Left rule visually ties replies to the parent.
              ml: node.depth < maxDepth ? `${INDENT_PX}px` : 0,
              pl: dense ? 1 : 1.5,
              borderLeft: '2px solid',
              borderColor: 'divider',
            }}
          >
            {replies.map((child) => (
              <CommentNode
                key={child.comment.id}
                node={child}
                maxDepth={maxDepth}
                userId={userId}
                markdown={markdown}
                dense={dense}
                submitReply={submitReply}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}
