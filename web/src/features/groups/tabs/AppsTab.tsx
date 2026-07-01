/**
 * Group Apps tab — low-code apps scoped to this Nexus group. Group admins
 * (ctx.can('editGroup')) can create + edit; the backend enforces group scope
 * authority independently via the org/group RBAC layer.
 */
import ScopedAppsPanel from '@/features/apps/ScopedAppsPanel';
import type { GroupTabProps } from './types';

export default function AppsTab({ groupId, ctx }: GroupTabProps) {
  return <ScopedAppsPanel scopeType="group" scopeId={groupId} canEdit={ctx.can('editGroup')} />;
}
