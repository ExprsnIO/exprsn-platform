/**
 * Low-code studio API — the user-facing client for the standalone /apps studio
 * and the Nexus group "Apps" tab. Unlike the admin client, every design call is
 * scoped: the backend (scope-authority RBAC) returns only apps the caller may
 * administer, and list endpoints require an ?appId the caller is authorized for.
 * Record (runtime) calls disambiguate the entity by ?appKey.
 */
import { http } from '@/lib/http';
import type {
  LcApp, Entity, Lookup, Form, Flow, LcRecord, LookupValue,
  RecordListParams, RecordListResult, LowcodeCatalog,
} from '@/api/admin/lowcode';
import { recordListQuery } from '@/api/admin/lowcode';

export type {
  LcApp, Entity, Lookup, Form, Flow, LcRecord, LookupValue, Field,
  FieldType, FieldRole, StateMachine, EntityStorage, StorageMode,
  LookupSource, LowcodeCatalog, RecordFilter, RecordSort, RecordListParams,
  RecordListResult, FilterOp,
} from '@/api/admin/lowcode';

export type ScopeType = 'platform' | 'organization' | 'group' | 'user';

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const enc = encodeURIComponent;

export interface CreateAppInput {
  key: string;
  name: string;
  description?: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
}

export const lowcodeApi = {
  catalog: () => http.get<LowcodeCatalog>('/lowcode/api/design/catalog'),

  // ── apps (already filtered by the backend to what you can administer) ──
  apps: (params: { scopeType?: ScopeType; scopeId?: string } = {}) =>
    http.get<{ apps: LcApp[] }>(`/lowcode/api/design/apps${qs(params)}`),
  getApp: (id: string) => http.get<{ app: LcApp }>(`/lowcode/api/design/apps/${id}`),
  createApp: (body: CreateAppInput) => http.post<{ app: LcApp }>('/lowcode/api/design/apps', body),
  updateApp: (id: string, body: Partial<LcApp>) => http.patch<{ app: LcApp }>(`/lowcode/api/design/apps/${id}`, body),
  deleteApp: (id: string) => http.del<{ ok: boolean; removed: Record<string, number> }>(`/lowcode/api/design/apps/${id}`),

  // ── design: entities (scoped by appId) ──
  entities: (appId: string) => http.get<{ entities: Entity[] }>(`/lowcode/api/design/entities${qs({ appId })}`),
  getEntity: (id: string) => http.get<{ entity: Entity }>(`/lowcode/api/design/entities/${id}`),
  createEntity: (body: Partial<Entity>) => http.post<{ entity: Entity }>('/lowcode/api/design/entities', body),
  updateEntity: (id: string, body: Partial<Entity>) => http.put<{ entity: Entity }>(`/lowcode/api/design/entities/${id}`, body),
  deleteEntity: (id: string) =>
    http.del<{ ok: boolean; removed: { removedRecords: number } }>(`/lowcode/api/design/entities/${id}`),
  truncateEntity: (id: string) => http.post<{ ok: boolean; removed: number }>(`/lowcode/api/design/entities/${id}/truncate`, {}),
  exportEntity: (id: string) => http.post<{ export: unknown }>(`/lowcode/api/design/entities/${id}/export`, {}),

  // ── design: lookups (scoped by appId) ──
  lookups: (appId: string) => http.get<{ lookups: Lookup[] }>(`/lowcode/api/design/lookups${qs({ appId })}`),
  getLookup: (id: string) => http.get<{ lookup: Lookup }>(`/lowcode/api/design/lookups/${id}`),
  resolvedLookup: (id: string) =>
    http.get<{ key: string; dynamic: boolean; values: LookupValue[] }>(`/lowcode/api/design/lookups/${id}/resolved`),
  createLookup: (body: Partial<Lookup>) => http.post<{ lookup: Lookup }>('/lowcode/api/design/lookups', body),
  updateLookup: (id: string, body: Partial<Lookup>) => http.put<{ lookup: Lookup }>(`/lowcode/api/design/lookups/${id}`, body),
  deleteLookup: (id: string) => http.del<{ ok: boolean }>(`/lowcode/api/design/lookups/${id}`),

  // ── design: forms + flows (scoped by appId) ──
  forms: (appId: string) => http.get<{ forms: Form[] }>(`/lowcode/api/design/forms${qs({ appId })}`),
  createForm: (body: Partial<Form>) => http.post<{ form: Form }>('/lowcode/api/design/forms', body),
  updateForm: (id: string, body: Partial<Form>) => http.put<{ form: Form }>(`/lowcode/api/design/forms/${id}`, body),
  deleteForm: (id: string) => http.del<{ ok: boolean }>(`/lowcode/api/design/forms/${id}`),
  flows: (appId: string) => http.get<{ flows: Flow[] }>(`/lowcode/api/design/flows${qs({ appId })}`),
  getFlow: (id: string) => http.get<{ flow: Flow }>(`/lowcode/api/design/flows/${id}`),
  createFlow: (body: Partial<Flow>) => http.post<{ flow: Flow }>('/lowcode/api/design/flows', body),
  updateFlow: (id: string, body: Partial<Flow>) => http.patch<{ flow: Flow }>(`/lowcode/api/design/flows/${id}`, body),
  deleteFlow: (id: string) => http.del<{ ok: boolean }>(`/lowcode/api/design/flows/${id}`),

  // ── runtime records (disambiguate entity by appKey; advanced filter/sort/page) ──
  records: (entityKey: string, appKey: string, params: Omit<RecordListParams, 'appKey' | 'appId'> = {}) =>
    http.get<RecordListResult>(`/lowcode/api/data/${enc(entityKey)}/records${recordListQuery({ ...params, appKey })}`),
  createRecord: (entityKey: string, appKey: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records${qs({ appKey })}`, body),
  updateRecord: (entityKey: string, appKey: string, id: string, body: Record<string, unknown>) =>
    http.put<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}${qs({ appKey })}`, body),
  transitionRecord: (entityKey: string, appKey: string, id: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}/transition${qs({ appKey })}`, body),
  deleteRecord: (entityKey: string, appKey: string, id: string) =>
    http.del<{ ok: boolean }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}${qs({ appKey })}`),
};
