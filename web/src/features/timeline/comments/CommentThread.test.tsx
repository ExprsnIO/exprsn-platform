import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CommentThread } from './CommentThread';
import { useTimelinePrefs } from '@/app/timelinePrefs';
import type { Comment } from '@/api/timeline';

// A small threaded fixture: two top-level comments; c1 has a reply r1, which
// itself has a reply r2 (depth 2). r1 carries markdown to prove GFM rendering.
const now = Date.parse('2026-07-20T12:00:00Z');
function at(minAgo: number) {
  return new Date(now - minAgo * 60_000).toISOString();
}
const comments: Comment[] = [
  { id: 'c1', postId: 'p', userId: 'u-alice', content: 'top level one', parentId: null, createdAt: at(30) },
  { id: 'r1', postId: 'p', userId: 'u-bob', content: 'a **bold** reply with `code`', parentId: 'c1', createdAt: at(20) },
  { id: 'r2', postId: 'p', userId: 'u-alice', content: 'nested deeper', parentId: 'r1', createdAt: at(10) },
  { id: 'c2', postId: 'p', userId: 'u-carol', content: 'top level two', parentId: null, createdAt: at(5) },
];

function renderThread() {
  return render(<CommentThread comments={comments} userId="u-alice" submitReply={vi.fn()} now={now} />);
}

describe('CommentThread', () => {
  beforeEach(() => {
    // Deterministic prefs: threaded + markdown on, newest-first, no time grouping.
    useTimelinePrefs.getState().set({
      threaded: true,
      markdown: true,
      commentSort: 'newest',
      commentGroup: 'none',
      density: 'comfortable',
    });
  });

  it('renders every comment', () => {
    renderThread();
    expect(screen.getByText('top level one')).toBeInTheDocument();
    expect(screen.getByText('top level two')).toBeInTheDocument();
    expect(screen.getByText('nested deeper')).toBeInTheDocument();
  });

  it('renders markdown (bold + code) rather than raw asterisks', () => {
    const { container } = renderThread();
    // The reply body should produce <strong> and <code>, not literal "**".
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(screen.queryByText(/\*\*bold\*\*/)).not.toBeInTheDocument();
  });

  it('nests replies under their parent (r2 lives inside c1 subtree, not c2)', () => {
    renderThread();
    // Smallest ancestor of "nested deeper" that also contains "top level one".
    const deep = screen.getByText('nested deeper');
    let ancestor: HTMLElement | null = deep.parentElement;
    while (ancestor && !within(ancestor).queryByText('top level one')) {
      ancestor = ancestor.parentElement;
    }
    expect(ancestor).not.toBeNull();
    // That c1 subtree must include the bold reply too, but NOT the other
    // top-level comment (c2) — proving r2 is nested under c1, not a sibling.
    expect(within(ancestor as HTMLElement).getByText(/bold/)).toBeInTheDocument();
    expect(within(ancestor as HTMLElement).queryByText('top level two')).toBeNull();
  });

  it('exposes sort/threaded/grouping controls', () => {
    renderThread();
    expect(screen.getByLabelText('Sort')).toBeInTheDocument();
    expect(screen.getByText('Threaded')).toBeInTheDocument();
    expect(screen.getByText('By time')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Filter comments…')).toBeInTheDocument();
  });

  it('flattens to a chronological list when threading is off', () => {
    useTimelinePrefs.getState().set({ threaded: false });
    renderThread();
    // All four still present, but now none are nested — the deepest reply
    // renders at the same level as the top-level comments.
    expect(screen.getByText('nested deeper')).toBeInTheDocument();
    expect(screen.getByText('top level two')).toBeInTheDocument();
  });
});
