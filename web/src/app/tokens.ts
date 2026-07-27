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
  /** Text color on solid primary fills (mirrors --exprsn-text-on-primary). */
  primaryContrast: string;
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
    primaryContrast: WHITE, // white on #0066ff = 4.83:1
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
    // BUG-048: was #3b82f6 — white-on-primary measured 3.68:1 and primary text
    // on surface-raised 4.48:1. #4a8cf7 keeps primary text ≥4.5:1 on every dark
    // surface (5.01 on raised), and dark primary fills now take near-black text
    // (primaryContrast, 6.02:1) since no blue can pass 4.5 with white text AND
    // as text on the dark surfaces simultaneously.
    primary: '#4a8cf7',
    primaryContrast: BLACK,
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

/**
 * Semantic on-tint pairs (theme-invariant). Mirror the --exprsn-*-bg / -text /
 * -hover custom properties in src/styles/exprsn-unified.css — keep in sync.
 * The -text values are the purpose-built text-grade colors that pass 4.5:1 on
 * their tint (6.78–7.15) and on the light surfaces (7.09–8.72).
 */
export const SEMANTIC_TINTS = {
  success: { bg: '#d1fae5', text: '#065f46', hover: '#059669' },
  error: { bg: '#fee2e2', text: '#991b1b', hover: '#dc2626' },
  warning: { bg: '#fef3c7', text: '#92400e', hover: '#d97706' },
  info: { bg: '#dbeafe', text: '#1e40af', hover: '#2563eb' },
} as const;

/**
 * BUG-049: lightened semantic emphasis used ONLY for dark-mode outlined chip
 * labels/borders (the saturated mains measure 4.38–4.48 on the dark surfaces).
 * MUI-only — no CSS counterpart, except `secondary`, which mirrors
 * --exprsn-secondary-light.
 */
export const DARK_CHIP_EMPHASIS = {
  error: '#f87171', // 5.96:1 on surface-raised #1f1f1f
  info: '#60a5fa', // 6.48:1
  secondary: '#a78bfa', // 6.06:1
} as const;

export const FONT_FAMILY =
  "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif";
export const FONT_FAMILY_MONO =
  "'JetBrains Mono', 'Fira Code', 'Monaco', 'Menlo', 'Courier New', monospace";
