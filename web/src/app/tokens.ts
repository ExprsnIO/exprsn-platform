/**
 * TypeScript mirror of the Exprsn Unified design tokens (see
 * src/styles/exprsn-unified.css). MUI's createTheme needs concrete color values
 * to compute its own light/dark/contrast variants, so the subset of tokens that
 * MUI consumes is duplicated here, keyed by mode. The CSS file remains the
 * source of truth for plain-class markup and the `--exprsn-*` custom properties;
 * these constants exist only to feed the MUI theme. Keep the two in sync.
 */
export type ThemeMode = 'light' | 'dark';

interface ExprsnPalette {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryHover: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  surfaceRaised: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
}

// Constant across modes (semantic + accent + neutrals stay fixed per the style guide).
export const WHITE = '#ffffff';
export const BLACK = '#0a0a0a';

const constants = {
  primaryLight: '#4d94ff',
  primaryDark: '#0047b3',
  secondary: '#7c3aed',
  secondaryHover: '#6d28d9',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

export const exprsnTokens: Record<ThemeMode, ExprsnPalette> = {
  light: {
    ...constants,
    primary: '#0066ff',
    primaryHover: '#0052cc',
    bgPrimary: '#ffffff',
    bgSecondary: '#fafafa',
    bgTertiary: '#f5f5f5',
    surfaceRaised: '#ffffff',
    textPrimary: '#171717',
    textSecondary: '#525252',
    textMuted: '#737373',
    border: '#e5e5e5',
    borderStrong: '#a3a3a3',
  },
  dark: {
    ...constants,
    primary: '#3b82f6',
    primaryHover: '#60a5fa',
    bgPrimary: '#0a0a0a',
    bgSecondary: '#171717',
    bgTertiary: '#262626',
    surfaceRaised: '#1f1f1f',
    textPrimary: '#fafafa',
    textSecondary: '#d4d4d4',
    textMuted: '#a3a3a3',
    border: '#404040',
    borderStrong: '#525252',
  },
};

export const FONT_FAMILY =
  "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif";
export const FONT_FAMILY_MONO =
  "'JetBrains Mono', 'Fira Code', 'Monaco', 'Menlo', 'Courier New', monospace";
