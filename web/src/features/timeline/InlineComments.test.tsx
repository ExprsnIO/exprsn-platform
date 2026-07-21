import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InlineComments } from './InlineComments';
import { useTimelinePrefs } from '@/app/timelinePrefs';
import type { Comment } from '@/api/timeline';

const commentsMock = vi.fn();
vi.mock('@/api/timeline', () => ({
  timelineApi: { comments: (...args: unknown[]) => commentsMock(...args) },
}));

const now = Date.parse('2026-07-20T12:00:00Z');
function at(min: number) {
  return new Date(now - min * 60_000).toISOString();
}
// 4 top-level comments (c1..c4) + one reply to c1 → c1 has a reply badge.
const data: Comment[] = [
  { id: 'c1', postId: 'p', userId: 'u1', content: 'first comment', parentId: null, createdAt: at(40) },
  { id: 'r1', postId: 'p', userId: 'u2', content: 'reply to first', parentId: 'c1', createdAt: at(35) },
  { id: 'c2', postId: 'p', userId: 'u3', content: 'second comment', parentId: null, createdAt: at(30) },
  { id: 'c3', postId: 'p', userId: 'u4', content: 'third comment', parentId: null, createdAt: at(20) },
  { id: 'c4', postId: 'p', userId: 'u5', content: 'fourth comment', parentId: null, createdAt: at(10) },
];

function renderInline(commentCount = 5) {
  const onOpenDetail = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InlineComments postId="p" commentCount={commentCount} onOpenDetail={onOpenDetail} />
    </QueryClientProvider>,
  );
  return { onOpenDetail };
}

describe('InlineComments', () => {
  beforeEach(() => {
    commentsMock.mockReset();
    commentsMock.mockResolvedValue({ comments: data });
    useTimelinePrefs.getState().set({ feedInlineCount: 3, commentSort: 'newest', markdown: true });
  });

  it('previews only the top N top-level comments (newest first)', async () => {
    renderInline();
    // Newest 3 top-level: c4, c3, c2 — c1 (oldest) is beyond the cap.
    await waitFor(() => expect(screen.getByText('fourth comment')).toBeInTheDocument());
    expect(screen.getByText('third comment')).toBeInTheDocument();
    expect(screen.getByText('second comment')).toBeInTheDocument();
    expect(screen.queryByText('first comment')).not.toBeInTheDocument();
  });

  it('shows a "view all" affordance with the real comment count', async () => {
    renderInline(9);
    await waitFor(() => expect(screen.getByText(/View all 9 comments/)).toBeInTheDocument());
  });

  it('renders nothing and skips the fetch when disabled (feedInlineCount = 0)', async () => {
    useTimelinePrefs.getState().set({ feedInlineCount: 0 });
    const { container } = (() => {
      const client = new QueryClient();
      return render(
        <QueryClientProvider client={client}>
          <InlineComments postId="p" commentCount={5} onOpenDetail={vi.fn()} />
        </QueryClientProvider>,
      );
    })();
    expect(container).toBeEmptyDOMElement();
    expect(commentsMock).not.toHaveBeenCalled();
  });

  it('renders nothing when the post has no comments', () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <InlineComments postId="p" commentCount={0} onOpenDetail={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(commentsMock).not.toHaveBeenCalled();
  });
});
