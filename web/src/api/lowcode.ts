/**
 * Low-code studio API — the user-facing client for the standalone /apps studio
 * and the Nexus group "Apps" tab. Unlike the admin client, every design call is
 * scoped: the backend (scope-authority RBAC) returns only apps the caller may
 * administer, and list endpoints require an ?appId the caller is authorized for.
 * Record (runtime) calls disambiguate the entity by ?appKey.
 */
import { http } from '@/lib/http';
import type { LcApp, Entity, Lookup, Form, Flow, LcRecord, LookupValue } from '@/api/admin/lowcode';

export type { LcApp, Entity, Lookup, Form, Flow, LcRecord, LookupValue, Field } from '@/api/admin/lowcode';

export type ScopeType = 'platform' | 'organization' | 'group' | 'user';

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface CreateAppInput {
  key: string;
  name: string;
  description?: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
}

export const lowcodeApi = {
  // ── apps (already filtered by the backend to what you can administer) ──
  apps: (params: { scopeType?: ScopeType; scopeId?: string } = {}) =>
    http.get<{ apps: LcApp[] }>(`/lowcode/api/design/apps${qs(params)}`),
  createApp: (body: CreateAppInput) => http.post<{ app: LcApp }>('/lowcode/api/design/apps', body),
  updateApp: (id: string, body: Partial<LcApp>) => http.patch<{ app: LcApp }>(`/lowcode/api/design/apps/${id}`, body),

  // ── design reads (scoped by appId) ──
  entities: (appId: string) => http.get<{ entities: Entity[] }>(`/lowcode/api/design/entities${qs({ appId })}`),
  createEntity: (body: Partial<Entity>) => http.post<{ entity: Entity }>('/lowcode/api/design/entities', body),
  lookups: (appId: string) => http.get<{ lookups: Lookup[] }>(`/lowcode/api/design/lookups${qs({ appId })}`),
  resolvedLookup: (id: string) =>
    http.get<{ key: string; dynamic: boolean; values: LookupValue[] }>(`/lowcode/api/design/lookups/${id}/resolved`),
  forms: (appId: string) => http.get<{ forms: Form[] }>(`/lowcode/api/design/forms${qs({ appId })}`),
  flows: (appId: string) => http.get<{ flows: Flow[] }>(`/lowcode/api/design/flows${qs({ appId })}`),

  // ── runtime records (disambiguate entity by appKey) ──
  records: (entityKey: string, appKey: string) =>
    http.get<{ records: LcRecord[] }>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records${qs({ appKey })}`),
  createRecord: (entityKey: string, appKey: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records${qs({ appKey })}`, body),
  updateRecord: (entityKey: string, appKey: string, id: string, body: Record<string, unknown>) =>
    http.put<{ record: LcRecord }>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records/${id}${qs({ appKey })}`, body),
  deleteRecord: (entityKey: string, appKey: string, id: string) =>
    http.del<{ ok: boolean }>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records/${id}${qs({ appKey })}`),
};
