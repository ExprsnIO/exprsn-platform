import { createTheme, type Theme } from '@mui/material/styles';
import {
  exprsnTokens,
  SEMANTIC_TINTS,
  FONT_FAMILY,
  FONT_FAMILY_MONO,
  WHITE,
  BLACK,
  type ThemeMode,
} from './tokens';

/**
 * Builds the MUI theme from the Exprsn Unified design tokens (src/app/tokens.ts
 * / src/styles/exprsn-unified.css) for the given mode. Every Exprsn-themed value
 * flows from a token so MUI components and plain-class markup share one design
 * language and switch light/dark together. `data-theme` on <html> drives the CSS
 * custom properties; the matching MUI `mode` is passed in here.
 */
export function buildTheme(mode: ThemeMode): Theme {
  const t = exprsnTokens[mode];

  // ── BUG-049: semantic Chip contrast ────────────────────────────────────────
  // Filled success/error/info chips map onto the design system's on-tint pairs
  // (theme-invariant; 6.78–7.15:1). Filled warning (black text, 9.22) and
  // secondary (white on purple, 5.70) already pass and keep the MUI defaults.
  // Outlined labels/borders use text-grade colors per mode: light = the -text
  // tokens (7.09–8.72) with -hover borders (3.19–5.17 non-text); dark keeps the
  // mains where they pass (success 6.50, warning 7.67) and lightens error/info/
  // secondary (5.96/6.48/6.06). Outlined primary is covered by the BUG-048
  // primary token itself (4.83 light / 5.01 dark).
  type ChipSemantic = 'success' | 'error' | 'warning' | 'info' | 'secondary';
  const chipOutlined: Partial<Record<ChipSemantic, { color: string; border: string }>> =
    mode === 'light'
      ? // Outlined secondary passes in light (5.70) — MUI default kept.
        Object.fromEntries(
          (['success', 'error', 'warning', 'info'] as const).map((c) => [
            c,
            { color: SEMANTIC_TINTS[c].text, border: SEMANTIC_TINTS[c].hover },
          ]),
        )
      : {
          success: { color: t.success, border: t.success },
          warning: { color: t.warning, border: t.warning },
          error: { color: t.dangerEmphasis, border: t.dangerEmphasis },
          info: { color: t.infoEmphasis, border: t.infoEmphasis },
          secondary: { color: t.secondaryEmphasis, border: t.secondaryEmphasis },
        };

  // Icon/delete-icon follow the label color (MUI's defaults assume the old
  // white-on-main fills and would vanish on the tints).
  const chipIconInherit = {
    '& .MuiChip-icon': { color: 'inherit' },
    '& .MuiChip-deleteIcon': { color: 'inherit', opacity: 0.7, '&:hover': { color: 'inherit', opacity: 1 } },
  } as const;

  const chipVariants = [
    ...(['success', 'error', 'info'] as const).map((color) => ({
      props: { variant: 'filled' as const, color },
      style: {
        backgroundColor: SEMANTIC_TINTS[color].bg,
        color: SEMANTIC_TINTS[color].text,
        // Keep the compliant tint on clickable hover (MUI would darken to main).
        '&.MuiChip-clickable:hover': { backgroundColor: SEMANTIC_TINTS[color].bg },
        ...chipIconInherit,
      },
    })),
    ...(Object.entries(chipOutlined) as Array<
      [ChipSemantic, { color: string; border: string }]
    >).map(([color, v]) => ({
      props: { variant: 'outlined' as const, color },
      style: { color: v.color, borderColor: v.border, ...chipIconInherit },
    })),
  ];

  return createTheme({
    palette: {
      mode,
      common: { white: WHITE, black: BLACK },
      // BUG-048: contrastText is mode-aware (white in light, near-black in dark)
      // and dark-mode `dark` (the contained-button hover bg) lightens instead of
      // darkening — near-black on #0047b3 would be ~2.4:1.
      primary: {
        main: t.primary,
        light: t.primaryLight,
        dark: mode === 'dark' ? t.primaryHover : t.primaryDark,
        contrastText: t.primaryContrast,
      },
      secondary: { main: t.secondary, dark: t.secondaryHover, contrastText: WHITE },
      success: { main: t.success, contrastText: WHITE },
      error: { main: t.danger, contrastText: WHITE },
      warning: { main: t.warning, contrastText: BLACK },
      info: { main: t.info, contrastText: WHITE },
      background: { default: t.bgSecondary, paper: t.surfaceRaised },
      text: { primary: t.textPrimary, secondary: t.textSecondary, disabled: t.textMuted },
      divider: t.border,
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: FONT_FAMILY,
      h1: { fontWeight: 700, letterSpacing: '-0.02em' },
      h2: { fontWeight: 700, letterSpacing: '-0.02em' },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 600 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      button: { fontWeight: 600, textTransform: 'none' },
    },
    components: {
      // MUI ButtonBase suppresses the native outline, hiding keyboard focus; the
      // style guide requires a visible brand ring on buttons (WCAG 2.1 AA).
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              outline: '2px solid var(--exprsn-primary)',
              outlineOffset: 2,
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 12, paddingInline: 18 },
          containedPrimary: {
            transition: 'transform 150ms cubic-bezier(.4,0,.2,1), box-shadow 150ms cubic-bezier(.4,0,.2,1)',
            '&:hover': { transform: 'translateY(-1px)', boxShadow: 'var(--exprsn-shadow-md)' },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          // Cards/sheets sit on the raised surface; soften the default border radius.
          rounded: { borderRadius: 16 },
          outlined: { borderColor: t.border },
        },
      },
      MuiCard: { styleOverrides: { root: { borderRadius: 16 } } },
      MuiAppBar: {
        styleOverrides: {
          root: { boxShadow: 'var(--exprsn-shadow-sm)', backgroundImage: 'none' },
        },
      },
      MuiTextField: { defaultProps: { variant: 'outlined' } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 12 },
          notchedOutline: { borderColor: t.border },
        },
      },
      // BUG-049 — see chipVariants above.
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } }, variants: chipVariants },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontSize: '0.75rem', fontWeight: 500, borderRadius: 8 },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          code: { fontFamily: FONT_FAMILY_MONO },
          // Match the design-system scrollbar treatment.
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            background: t.borderStrong,
            borderRadius: 8,
          },
        },
      },
    },
  });
}

// Default light theme for any non-mode-aware import sites.
export const theme = buildTheme('light');
