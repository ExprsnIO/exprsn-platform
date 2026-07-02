/**
 * Low-code studio API — the user-facing client for the standalone /apps studio
 * and the Nexus group "Apps" tab. Unlike the admin client, every design call is
 * scoped: the backend (scope-authority RBAC) returns only apps the caller may
 * administer, and list endpoints require an ?appId the caller is authorized for.
 * Record (runtime) calls disambiguate the entity by ?appKey.
 */
import { http } from '@/lib/http';
import type {
  LcApp, Entity, Lookup, Form, Flow, FlowRun, LcRecord, LcView, LookupValue,
  RecordListParams, RecordListResult, LowcodeCatalog, AggregateResult, AppBundle, ViewType, ViewConfig,
} from '@/api/admin/lowcode';
import { recordListQuery } from '@/api/admin/lowcode';

export type {
  LcApp, Entity, Lookup, Form, Flow, FlowRun, FlowRunStep, FlowTrigger, FlowTriggerType,
  LcRecord, LcView, ViewType, ViewConfig, LookupValue, Field,
  FieldType, FieldRole, StateMachine, EntityStorage, StorageMode,
  LookupSource, LowcodeCatalog, RecordFilter, RecordSort, RecordListParams,
  RecordListResult, FilterOp, FormLayout, FormSection, FormLayoutField,
  AggregateResult, AppBundle,
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

  // ── design: flow execution + run history ──
  executeFlow: (id: string, ctx: Record<string, unknown> = {}) =>
    http.post<{ run: FlowRun }>(`/lowcode/api/design/flows/${id}/execute`, { ctx }),
  flowRuns: (id: string, limit = 50) =>
    http.get<{ runs: FlowRun[] }>(`/lowcode/api/design/flows/${id}/runs?limit=${limit}`),

  // ── design: app bundle export/import (duplicate / template install) ──
  exportApp: (id: string) => http.get<{ bundle: AppBundle }>(`/lowcode/api/design/apps/${id}/export`),
  importApp: (body: { bundle: AppBundle; key?: string; name?: string; scopeType?: ScopeType; scopeId?: string | null }) =>
    http.post<{ app: LcApp; imported: Record<string, number> }>('/lowcode/api/design/apps/import', body),

  // ── design: AI assist (natural language → entity/flow draft) ──
  aiGenerate: (body: { kind: 'entity' | 'flow'; prompt: string; appId?: string }) =>
    http.post<{ kind: string; draft: Record<string, unknown>; warnings: string[] }>('/lowcode/api/design/ai/generate', body),

  // ── runtime records (disambiguate entity by appKey; advanced filter/sort/page) ──
  records: (entityKey: string, appKey: string, params: Omit<RecordListParams, 'appKey' | 'appId'> = {}) =>
    http.get<RecordListResult>(`/lowcode/api/data/${enc(entityKey)}/records${recordListQuery({ ...params, appKey })}`),
  getRecord: (entityKey: string, appKey: string, id: string) =>
    http.get<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}${qs({ appKey })}`),
  createRecord: (entityKey: string, appKey: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records${qs({ appKey })}`, body),
  updateRecord: (entityKey: string, appKey: string, id: string, body: Record<string, unknown>) =>
    http.put<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}${qs({ appKey })}`, body),
  transitionRecord: (entityKey: string, appKey: string, id: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}/transition${qs({ appKey })}`, body),
  deleteRecord: (entityKey: string, appKey: string, id: string) =>
    http.del<{ ok: boolean }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}${qs({ appKey })}`),

  // ── runtime: bulk + import/export + aggregation ──
  bulkRecords: (entityKey: string, appKey: string, body: { create?: Record<string, unknown>[]; update?: { id: string; data: Record<string, unknown> }[]; delete?: string[] }) =>
    http.post<{ created: unknown[]; updated: unknown[]; deleted: unknown[] }>(`/lowcode/api/data/${enc(entityKey)}/records/bulk${qs({ appKey })}`, body),
  importRecords: (entityKey: string, appKey: string, body: { csv?: string; records?: Record<string, unknown>[] }) =>
    http.post<{ created: number; failed: number; errors: { row: number; errors: string[] }[] }>(`/lowcode/api/data/${enc(entityKey)}/records/import${qs({ appKey })}`, body),
  /** CSV text of the (filtered) records — caller turns it into a download. */
  exportRecordsCsv: (entityKey: string, appKey: string, params: Omit<RecordListParams, 'appKey' | 'appId'> = {}) =>
    http.get<string>(`/lowcode/api/data/${enc(entityKey)}/records/export${recordListQuery({ ...params, appKey })}`),
  aggregate: (entityKey: string, appKey: string, params: { groupBy?: string; metrics?: string } = {}) =>
    http.get<AggregateResult>(`/lowcode/api/data/${enc(entityKey)}/aggregate${qs({ appKey, ...params })}`),

  // ── runtime: saved views ──
  views: (entityKey: string, appKey: string) =>
    http.get<{ views: LcView[] }>(`/lowcode/api/data/${enc(entityKey)}/views${qs({ appKey })}`),
  createView: (entityKey: string, appKey: string, body: { name: string; viewType?: ViewType; config?: ViewConfig; shared?: boolean }) =>
    http.post<{ view: LcView }>(`/lowcode/api/data/${enc(entityKey)}/views${qs({ appKey })}`, body),
  updateView: (entityKey: string, appKey: string, id: string, body: Partial<LcView>) =>
    http.put<{ view: LcView }>(`/lowcode/api/data/${enc(entityKey)}/views/${id}${qs({ appKey })}`, body),
  deleteView: (entityKey: string, appKey: string, id: string) =>
    http.del<{ ok: boolean }>(`/lowcode/api/data/${enc(entityKey)}/views/${id}${qs({ appKey })}`),
};
