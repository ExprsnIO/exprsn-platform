/**
 * Pure helpers that turn the flat comment list from GET /:id/comments into the
 * nested / sorted / grouped shape the UI renders. Kept framework-free so it's
 * trivially testable and cheap to re-run on every pref change.
 */
import type { Comment } from '@/api/timeline';
import type { CommentSort } from '@/app/timelinePrefs';

export interface CommentNodeT {
  comment: Comment;
  depth: number;
  replies: CommentNodeT[];
  /** Total descendants (all nested levels) — used for the 'top' sort + labels. */
  descendantCount: number;
}

/** Filters applied before the tree is built (see CommentThread toolbar). */
export interface CommentFilter {
  /** Case-insensitive substring match on the body. */
  query: string;
  /** Only comments authored by the signed-in user. */
  mineOnly: boolean;
  /** Only top-level comments that have at least one reply. */
  hasReplies: boolean;
}

export const EMPTY_FILTER: CommentFilter = { query: '', mineOnly: false, hasReplies: false };

function countDescendants(node: CommentNodeT): number {
  let n = node.replies.length;
  for (const r of node.replies) n += countDescendants(r);
  node.descendantCount = n;
  return n;
}

/**
 * Build a nested tree from a flat list. A reply whose parent isn't present in
 * the set (parent deleted/suppressed) is promoted to top level so it never
 * silently vanishes. When `threaded` is false every comment is returned as a
 * flat, depth-0 list.
 */
export function buildTree(comments: Comment[], threaded: boolean): CommentNodeT[] {
  if (!threaded) {
    return comments.map((comment) => ({ comment, depth: 0, replies: [], descendantCount: 0 }));
  }

  const byId = new Map<string, CommentNodeT>();
  for (const comment of comments) {
    byId.set(comment.id, { comment, depth: 0, replies: [], descendantCount: 0 });
  }

  const roots: CommentNodeT[] = [];
  for (const node of byId.values()) {
    const parentId = node.comment.parentId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) {
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  // Assign depth top-down, then compute descendant counts bottom-up.
  const assignDepth = (node: CommentNodeT, depth: number) => {
    node.depth = depth;
    for (const r of node.replies) assignDepth(r, depth + 1);
  };
  for (const root of roots) {
    assignDepth(root, 0);
    countDescendants(root);
  }
  return roots;
}

function timeMs(c: Comment): number {
  const t = Date.parse(c.createdAt);
  return Number.isNaN(t) ? 0 : t;
}

function sortNodes(nodes: CommentNodeT[], sort: CommentSort): CommentNodeT[] {
  const sorted = [...nodes];
  sorted.sort((a, b) => {
    if (sort === 'top') {
      const d = b.descendantCount - a.descendantCount;
      if (d !== 0) return d;
      return timeMs(b.comment) - timeMs(a.comment); // newest tiebreak
    }
    if (sort === 'oldest') return timeMs(a.comment) - timeMs(b.comment);
    return timeMs(b.comment) - timeMs(a.comment); // newest
  });
  return sorted;
}

/**
 * Recursively sort a tree. Top-level order follows `sort`; replies always read
 * oldest-first so a sub-thread reads as a conversation regardless of the
 * top-level choice.
 */
export function sortTree(nodes: CommentNodeT[], sort: CommentSort): CommentNodeT[] {
  const top = sortNodes(nodes, sort);
  const sortReplies = (node: CommentNodeT) => {
    node.replies = sortNodes(node.replies, 'oldest');
    node.replies.forEach(sortReplies);
  };
  top.forEach(sortReplies);
  return top;
}

/** Apply the toolbar filter to the flat list before tree-building. */
export function filterComments(
  comments: Comment[],
  filter: CommentFilter,
  currentUserId?: string,
): Comment[] {
  const q = filter.query.trim().toLowerCase();
  let out = comments;
  if (q) out = out.filter((c) => c.content.toLowerCase().includes(q));
  if (filter.mineOnly && currentUserId) out = out.filter((c) => c.userId === currentUserId);
  return out;
}

export type TimeBucket = 'Today' | 'This week' | 'Earlier';

/** Bucket a top-level comment by age relative to `now` (ms). */
export function timeBucket(c: Comment, now: number): TimeBucket {
  const age = now - timeMs(c);
  const DAY = 86_400_000;
  if (age < DAY) return 'Today';
  if (age < 7 * DAY) return 'This week';
  return 'Earlier';
}

export const BUCKET_ORDER: TimeBucket[] = ['Today', 'This week', 'Earlier'];
