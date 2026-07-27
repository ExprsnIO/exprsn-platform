import { forwardRef } from 'react';
import { IconButton, Tooltip, type IconButtonProps } from '@mui/material';

/**
 * IconButton accessible-name standard (BUG-042).
 *
 * A `Tooltip` only supplies `aria-describedby` — it is NOT the accessible name,
 * so a bare icon-only `IconButton` is announced as "button" by screen readers.
 * The in-repo reference pattern is `app/ThemeToggle.tsx`: set BOTH the Tooltip
 * (for sighted hover) and `aria-label` (the accessible name).
 *
 * This wrapper makes that pattern the path of least resistance: `label` is
 * REQUIRED and drives both the tooltip and `aria-label`. Prefer it for any new
 * icon-only button; use `tooltip` when the hover text should differ from the
 * accessible name (keep the label a stable action name, e.g. label="Delete
 * row", tooltip="Delete (cannot be undone)"). Pass `tooltip={null}` to render
 * without a tooltip (e.g. inside another Tooltip'd region) — the aria-label
 * still applies.
 *
 * When a disabled state is possible, MUI Tooltips need a focusable child —
 * this wrapper handles that with the usual <span> shim automatically.
 */
export interface LabeledIconButtonProps extends Omit<IconButtonProps, 'aria-label'> {
  /** Accessible name (aria-label) AND default tooltip text. Required. */
  label: string;
  /** Override the tooltip text; `null` disables the tooltip entirely. */
  tooltip?: string | null;
}

export const LabeledIconButton = forwardRef<HTMLButtonElement, LabeledIconButtonProps>(
  function LabeledIconButton({ label, tooltip, disabled, children, ...rest }, ref) {
    const button = (
      <IconButton ref={ref} aria-label={label} disabled={disabled} {...rest}>
        {children}
      </IconButton>
    );
    if (tooltip === null) return button;
    const title = tooltip ?? label;
    // Disabled buttons don't fire events; the span keeps the Tooltip working.
    return <Tooltip title={title}>{disabled ? <span>{button}</span> : button}</Tooltip>;
  },
);
