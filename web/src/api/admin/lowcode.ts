/**
 * Low-code admin API (/lowcode/api/*). Design-time CRUD for apps, lookups,
 * entities (with field schemas + state machines), forms and flows, plus the
 * runtime data API for browsing/editing records of any entity. All calls carry
 * the admin bearer (attached automatically by http).
 */
import { http } from '@/lib/http';

export type AppStatus = 'draft' | 'published' | 'archived' | 'disabled' | string;
export type ScopeType = 'platform' | 'organization' | 'group' | 'user';

export interface LcApp {
  id: string;
  key: string;
  name: string;
  description?: string;
  status: AppStatus;
  scopeType?: ScopeType;
  scopeId?: string | null;
  capabilities?: string[];
  createdBy?: string | null;
  [k: string]: unknown;
}

export interface LookupValue {
  value: string;
  label: string;
  color?: string;
  order?: number;
  metadata?: Record<string, unknown>;
}

export interface LookupSource {
  type: 'static' | 'provider';
  provider?: string;
  params?: Record<string, unknown>;
}

export interface Lookup {
  id: string;
  appId: string | null;
  key: string;
  name: string;
  values: LookupValue[];
  source?: LookupSource | null;
  [k: string]: unknown;
}

export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'reference'
  | 'json'
  | 'file';

export type FieldRole = 'dimension' | 'measure' | 'attribute';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  role?: FieldRole;
  enumValues?: string[];
  enumLookup?: string;
  refEntity?: string;
  aggregation?: string;
  format?: string;
  default?: unknown;
  min?: number;
  max?: number;
  /** Computed field — value derived on every write; input for the key ignored. */
  formula?: string;
  [k: string]: unknown;
}

export interface StateMachine {
  initial: string;
  states: string[];
  transitions: { from: string; event: string; to: string }[];
}

export type StorageMode = 'db' | 'mirror' | 'filevault' | 'export';

export interface EntityStorage {
  mode: StorageMode;
  directoryId?: string;
  directory?: string;
}

export interface Entity {
  id: string;
  appId: string;
  key: string;
  name: string;
  description?: string;
  fields: Field[];
  stateMachine?: StateMachine | null;
  storage?: EntityStorage | null;
  [k: string]: unknown;
}

/** One layout entry: a bare field key or an annotated field. */
export interface FormLayoutField {
  key: string;
  /** Condition tree over the in-progress values — hides the field until true. */
  visibleWhen?: Record<string, unknown> | null;
  placeholder?: string;
  help?: string;
}

export interface FormSection {
  title?: string;
  fields: (string | FormLayoutField)[];
}

export interface FormLayout {
  sections?: FormSection[];
  /** true = render each section as a wizard step. */
  steps?: boolean;
  submitLabel?: string;
}

export interface Form {
  id: string;
  appId: string;
  entityKey: string;
  key: string;
  name: string;
  layout?: FormLayout;
  isPublic?: boolean;
  slug?: string | null;
  settings?: Record<string, unknown>;
  [k: string]: unknown;
}

export type FlowScopeType = ScopeType | string;

export type FlowTriggerType = 'event' | 'schedule' | 'webhook' | 'manual';

export interface FlowTrigger {
  type: FlowTriggerType;
  /** schedule: 5-field cron expression. */
  cron?: string;
  /** webhook: server-generated shared secret (present in design reads). */
  secret?: string;
}

export interface Flow {
  id: string;
  appId: string;
  key: string;
  name: string;
  event: string;
  trigger?: FlowTrigger | null;
  match?: Record<string, unknown> | null;
  actions: unknown[];
  scopeType: FlowScopeType;
  enabled: boolean;
  [k: string]: unknown;
}

export interface FlowRunStep {
  i: number;
  type: string;
  status: 'ok' | 'error' | 'skipped';
  error?: string;
  result?: unknown;
  ms?: number;
  attempts?: number;
}

export interface FlowRun {
  id: string;
  flowId: string;
  appId?: string;
  trigger: string;
  status: 'success' | 'partial' | 'error' | 'skipped';
  steps: FlowRunStep[];
  error?: string | null;
  context?: unknown;
  triggeredBy?: string | null;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
}

export type ViewType = 'grid' | 'kanban' | 'calendar';

export interface ViewConfig {
  filters?: RecordFilter[];
  sort?: RecordSort[];
  q?: string;
  /** kanban: the enum field that defines the columns. */
  groupByField?: string;
  /** calendar: the date/datetime field records are placed by. */
  dateField?: string;
  [k: string]: unknown;
}

export interface LcView {
  id: string;
  appId: string;
  entityKey: string;
  name: string;
  ownerId: string | null;
  viewType: ViewType;
  config: ViewConfig;
  [k: string]: unknown;
}

export interface AggregateResult {
  groups: Record<string, unknown>[];
  metrics: { agg: string; field: string; alias: string }[];
  groupBy: string[];
}

/** Portable app definition bundle (export/import/duplicate/template). */
export interface AppBundle {
  version: number;
  exportedAt?: string;
  app: { key: string; name: string; description?: string; capabilities?: string[] };
  entities?: unknown[];
  lookups?: unknown[];
  forms?: unknown[];
  flows?: unknown[];
}

export interface LcRecord {
  id: string;
  entityId?: string;
  appId?: string;
  data?: Record<string, unknown>;
  state?: string | null;
  ownerId?: string | null;
  scopeType?: ScopeType;
  scopeId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

/** Vocab catalogs the flow/entity editors consume (GET /design/catalog). */
export interface LowcodeCatalog {
  events: string[];
  actions: string[];
  triggerTypes?: FlowTriggerType[];
  capabilities: string[];
  storageModes: StorageMode[];
  fieldTypes: FieldType[];
  fieldRoles: FieldRole[];
  aggregations: string[];
  lookupProviders: { key: string; label?: string; [k: string]: unknown }[];
  /** true when the backend has an AI provider configured for /ai/generate. */
  aiAssist?: boolean;
}

// ── Record list query (advanced server-side filter/sort/pagination) ──────────
export type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'contains' | 'in' | 'nin';

export interface RecordFilter {
  field: string;
  op: FilterOp;
  value: string;
}

export interface RecordSort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface RecordListParams {
  appKey?: string;
  appId?: string;
  limit?: number;
  offset?: number;
  sort?: RecordSort[];
  filters?: RecordFilter[];
  /** Free-text search OR'd across string/text/enum fields. */
  q?: string;
}

export interface RecordListResult {
  records: LcRecord[];
  total: number;
  limit: number;
  offset: number;
}

/** Serialize RecordListParams into the query string the record API understands. */
export function recordListQuery(params: RecordListParams = {}): string {
  const sp = new URLSearchParams();
  if (params.appKey) sp.set('appKey', params.appKey);
  if (params.appId) sp.set('appId', params.appId);
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  if (params.q) sp.set('q', params.q);
  if (params.sort?.length) {
    sp.set('sort', params.sort.map((s) => `${s.dir === 'desc' ? '-' : ''}${s.field}`).join(','));
  }
  for (const f of params.filters ?? []) {
    if (f.value === '' && f.op !== 'eq' && f.op !== 'ne') continue;
    // eq is sent flat (?f.field=v) for backward compat; others use ?f.field[op]=v
    if (f.op === 'eq') sp.append(`f.${f.field}`, f.value);
    else sp.append(`f.${f.field}[${f.op}]`, f.value);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const enc = encodeURIComponent;

export const lowcodeAdminApi = {
  catalog: () => http.get<LowcodeCatalog>('/lowcode/api/design/catalog'),

  // ── design: apps ──
  apps: () => http.get<{ apps: LcApp[] }>('/lowcode/api/design/apps'),
  getApp: (id: string) => http.get<{ app: LcApp }>(`/lowcode/api/design/apps/${id}`),
  createApp: (body: Partial<LcApp>) => http.post<{ app: LcApp }>('/lowcode/api/design/apps', body),
  updateApp: (id: string, body: Partial<LcApp>) => http.patch<{ app: LcApp }>(`/lowcode/api/design/apps/${id}`, body),
  deleteApp: (id: string) => http.del<{ ok: boolean; removed: Record<string, number> }>(`/lowcode/api/design/apps/${id}`),

  // ── design: lookups ──
  lookups: () => http.get<{ lookups: Lookup[] }>('/lowcode/api/design/lookups'),
  getLookup: (id: string) => http.get<{ lookup: Lookup }>(`/lowcode/api/design/lookups/${id}`),
  resolvedLookup: (id: string) =>
    http.get<{ key: string; dynamic: boolean; values: LookupValue[] }>(`/lowcode/api/design/lookups/${id}/resolved`),
  createLookup: (body: Partial<Lookup>) => http.post<{ lookup: Lookup }>('/lowcode/api/design/lookups', body),
  updateLookup: (id: string, body: Partial<Lookup>) =>
    http.put<{ lookup: Lookup }>(`/lowcode/api/design/lookups/${id}`, body),
  deleteLookup: (id: string) => http.del<{ ok: boolean }>(`/lowcode/api/design/lookups/${id}`),

  // ── design: entities ──
  entities: () => http.get<{ entities: Entity[] }>('/lowcode/api/design/entities'),
  getEntity: (id: string) => http.get<{ entity: Entity }>(`/lowcode/api/design/entities/${id}`),
  createEntity: (body: Partial<Entity>) => http.post<{ entity: Entity }>('/lowcode/api/design/entities', body),
  updateEntity: (id: string, body: Partial<Entity>) =>
    http.put<{ entity: Entity }>(`/lowcode/api/design/entities/${id}`, body),
  deleteEntity: (id: string) =>
    http.del<{ ok: boolean; removed: { removedRecords: number } }>(`/lowcode/api/design/entities/${id}`),
  truncateEntity: (id: string) => http.post<{ ok: boolean; removed: number }>(`/lowcode/api/design/entities/${id}/truncate`, {}),
  exportEntity: (id: string) => http.post<{ export: unknown }>(`/lowcode/api/design/entities/${id}/export`, {}),

  // ── design: forms ──
  forms: () => http.get<{ forms: Form[] }>('/lowcode/api/design/forms'),
  getForm: (id: string) => http.get<{ form: Form }>(`/lowcode/api/design/forms/${id}`),
  createForm: (body: Partial<Form>) => http.post<{ form: Form }>('/lowcode/api/design/forms', body),
  updateForm: (id: string, body: Partial<Form>) => http.put<{ form: Form }>(`/lowcode/api/design/forms/${id}`, body),
  deleteForm: (id: string) => http.del<{ ok: boolean }>(`/lowcode/api/design/forms/${id}`),

  // ── design: flows ──
  flows: () => http.get<{ flows: Flow[] }>('/lowcode/api/design/flows'),
  getFlow: (id: string) => http.get<{ flow: Flow }>(`/lowcode/api/design/flows/${id}`),
  createFlow: (body: Partial<Flow>) => http.post<{ flow: Flow }>('/lowcode/api/design/flows', body),
  updateFlow: (id: string, body: Partial<Flow>) =>
    http.patch<{ flow: Flow }>(`/lowcode/api/design/flows/${id}`, body),
  deleteFlow: (id: string) => http.del<{ ok: boolean }>(`/lowcode/api/design/flows/${id}`),
  executeFlow: (id: string, ctx: Record<string, unknown> = {}) =>
    http.post<{ run: FlowRun }>(`/lowcode/api/design/flows/${id}/execute`, { ctx }),
  flowRuns: (id: string, limit = 50) =>
    http.get<{ runs: FlowRun[] }>(`/lowcode/api/design/flows/${id}/runs?limit=${limit}`),

  // ── data (runtime records) ──
  records: (entityKey: string, params: RecordListParams = {}) =>
    http.get<RecordListResult>(`/lowcode/api/data/${enc(entityKey)}/records${recordListQuery(params)}`),
  createRecord: (entityKey: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records`, body),
  updateRecord: (entityKey: string, id: string, body: Record<string, unknown>) =>
    http.put<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}`, body),
  transitionRecord: (entityKey: string, id: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${enc(entityKey)}/records/${id}/transition`, body),
  deleteRecord: (entityKey: string, id: string) =>
    http.del<unknown>(`/lowcode/api/data/${enc(entityKey)}/records/${id}`),
};
