import type { GroupContextValue } from '../useGroupContext';

/**
 * Props every group tab receives. `ctx` is the resolved useGroupContext value
 * (group, role, capability gate) — the single source of truth for what the
 * current user may do. Use `ctx.can(...)` to gate actions, not ad-hoc role
 * checks.
 */
export interface GroupTabProps {
  groupId: string;
  ctx: GroupContextValue;
}
