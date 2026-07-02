import { createTheme, type Theme } from '@mui/material/styles';
import { exprsnTokens, FONT_FAMILY, FONT_FAMILY_MONO, WHITE, BLACK, type ThemeMode } from './tokens';

/**
 * Builds the MUI theme from the Exprsn Unified design tokens (src/app/tokens.ts
 * / src/styles/exprsn-unified.css) for the given mode. Every Exprsn-themed value
 * flows from a token so MUI components and plain-class markup share one design
 * language and switch light/dark together. `data-theme` on <html> drives the CSS
 * custom properties; the matching MUI `mode` is passed in here.
 */
export function buildTheme(mode: ThemeMode): Theme {
  const t = exprsnTokens[mode];

  return createTheme({
    palette: {
      mode,
      common: { white: WHITE, black: BLACK },
      primary: { main: t.primary, light: t.primaryLight, dark: t.primaryDark, contrastText: WHITE },
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
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
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
