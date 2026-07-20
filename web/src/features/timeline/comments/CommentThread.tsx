/**
 * Renders a post's comments from the flat API list: applies the user's
 * sort/threading/grouping prefs and the toolbar filters, then draws the (capped)
 * nested tree. Time-grouping sections top-level comments into Today / This week
 * / Earlier; threading and grouping compose.
 */
import { useMemo, useState } from 'react';
import { Box, Chip, Divider, Stack, Typography } from '@mui/material';
import { useTimelinePrefs } from '@/app/timelinePrefs';
import type { Comment } from '@/api/timeline';
import { CommentToolbar } from './CommentToolbar';
import { CommentNode } from './CommentNode';
import {
  BUCKET_ORDER,
  EMPTY_FILTER,
  buildTree,
  filterComments,
  sortTree,
  timeBucket,
  type CommentFilter,
  type CommentNodeT,
  type TimeBucket,
} from './commentTree';

/** Visual indentation cap — deeper replies flatten at this level. */
const MAX_DEPTH = 4;

export function CommentThread({
  comments,
  userId,
  submitReply,
  now = Date.now(),
}: {
  comments: Comment[];
  userId?: string;
  submitReply: (parentId: string, content: string) => Promise<void>;
  /** Injectable clock for time-bucketing (defaults to now). */
  now?: number;
}) {
  const { threaded, commentSort, commentGroup, density, markdown } = useTimelinePrefs();
  const [filter, setFilter] = useState<CommentFilter>(EMPTY_FILTER);
  const dense = density === 'compact';

  const roots: CommentNodeT[] = useMemo(() => {
    const filtered = filterComments(comments, filter, userId);
    let tree = sortTree(buildTree(filtered, threaded), commentSort);
    if (filter.hasReplies) tree = tree.filter((n) => n.replies.length > 0);
    return tree;
  }, [comments, filter, userId, threaded, commentSort]);

  const grouped: Array<{ label: TimeBucket | null; nodes: CommentNodeT[] }> = useMemo(() => {
    if (commentGroup !== 'time') return [{ label: null, nodes: roots }];
    const buckets = new Map<TimeBucket, CommentNodeT[]>();
    for (const node of roots) {
      const b = timeBucket(node.comment, now);
      const arr = buckets.get(b) ?? [];
      arr.push(node);
      buckets.set(b, arr);
    }
    return BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => ({
      label: b,
      nodes: buckets.get(b)!,
    }));
  }, [roots, commentGroup, now]);

  const total = roots.length;

  const renderNode = (node: CommentNodeT) => (
    <CommentNode
      key={node.comment.id}
      node={node}
      maxDepth={MAX_DEPTH}
      userId={userId}
      markdown={markdown}
      dense={dense}
      submitReply={submitReply}
    />
  );

  return (
    <Box>
      <CommentToolbar filter={filter} onFilterChange={setFilter} />
      <Divider sx={{ mb: 1 }} />

      {total === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          {comments.length === 0
            ? 'No comments yet — start the conversation.'
            : 'No comments match these filters.'}
        </Typography>
      ) : (
        <Stack divider={<Divider flexItem />} spacing={dense ? 0.5 : 1}>
          {grouped.map((group) => (
            <Box key={group.label ?? 'all'}>
              {group.label && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, mb: 0.5 }}>
                  <Chip label={group.label} size="small" variant="outlined" />
                  <Typography variant="caption" color="text.secondary">
                    {group.nodes.length}
                  </Typography>
                </Stack>
              )}
              {group.nodes.map(renderNode)}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
