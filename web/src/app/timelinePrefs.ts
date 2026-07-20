/**
 * Per-user timeline & comment display preferences. Client-side only, persisted
 * to localStorage — mirrors the themeMode.ts pattern (Zustand + a single JSON
 * key), so a user's timeline "look" (feed choice, density, markdown, and how
 * comments sort/group/thread) survives reloads on that device.
 *
 * Deliberately not a backend store (per the FEAT scope decision): zero server
 * work, per-device. If cross-device sync is wanted later, back this slice with a
 * timeline/auth preferences endpoint and hydrate on login.
 */
import { create } from 'zustand';

const STORAGE_KEY = 'exprsn-timeline-prefs';

export type CommentSort = 'newest' | 'oldest' | 'top';
export type CommentGroup = 'none' | 'time';
export type Density = 'comfortable' | 'compact';
export type FeedKind = 'home' | 'global';

export interface TimelinePrefs {
  /** Which feed to open by default on the main timeline. */
  defaultFeed: FeedKind;
  /** Row spacing across the feed and comments. */
  density: Density;
  /** Render post/comment bodies as GFM markdown (off = plain text). */
  markdown: boolean;
  /** Order of top-level comments. 'top' = most replies first. */
  commentSort: CommentSort;
  /** Keep replies nested under their parent (off = flat chronological list). */
  threaded: boolean;
  /** Section top-level comments into Today / This week / Earlier buckets. */
  commentGroup: CommentGroup;
}

const DEFAULTS: TimelinePrefs = {
  defaultFeed: 'home',
  density: 'comfortable',
  markdown: true,
  commentSort: 'newest',
  threaded: true,
  commentGroup: 'none',
};

function resolveInitial(): TimelinePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TimelinePrefs>;
      // Merge over defaults so newly-added keys are populated for existing users.
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    /* localStorage unavailable or corrupt — fall through to defaults */
  }
  return { ...DEFAULTS };
}

interface TimelinePrefsState extends TimelinePrefs {
  /** Patch one or more preferences and persist the whole slice. */
  set: (patch: Partial<TimelinePrefs>) => void;
  /** Restore every preference to its default. */
  reset: () => void;
}

export const useTimelinePrefs = create<TimelinePrefsState>((set, get) => {
  const persist = (prefs: TimelinePrefs) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore persistence failures (private mode / quota) */
    }
  };

  return {
    ...resolveInitial(),
    set: (patch) => {
      const s = get();
      // Persist only the data keys (drop the action functions).
      const current: TimelinePrefs = {
        defaultFeed: s.defaultFeed,
        density: s.density,
        markdown: s.markdown,
        commentSort: s.commentSort,
        threaded: s.threaded,
        commentGroup: s.commentGroup,
      };
      persist({ ...current, ...patch });
      set(patch);
    },
    reset: () => {
      persist({ ...DEFAULTS });
      set({ ...DEFAULTS });
    },
  };
});
