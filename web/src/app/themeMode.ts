/**
 * Theme-mode state (light/dark) for the Exprsn design system. Drives both the
 * `data-theme` attribute on <html> (which re-points the --exprsn-* CSS tokens)
 * and the MUI theme (built per-mode in theme.ts). Persisted to localStorage;
 * defaults to the OS `prefers-color-scheme` on first load.
 */
import { create } from 'zustand';
import type { ThemeMode } from './tokens';

const STORAGE_KEY = 'exprsn-theme';

function resolveInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable (private mode / SSR) — fall through */
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Reflect the active mode onto <html data-theme> so the CSS tokens re-point. */
export function applyThemeAttribute(mode: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', mode);
  }
}

interface ThemeModeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeMode = create<ThemeModeState>((set, get) => {
  const initial = resolveInitialMode();
  applyThemeAttribute(initial);

  const commit = (mode: ThemeMode) => {
    applyThemeAttribute(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore persistence failures */
    }
    set({ mode });
  };

  return {
    mode: initial,
    setMode: commit,
    toggle: () => commit(get().mode === 'dark' ? 'light' : 'dark'),
  };
});
