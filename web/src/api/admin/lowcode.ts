/**
 * Low-code admin API (/lowcode/api/*). Design-time CRUD for apps, lookups,
 * entities (with field schemas + state machines), forms and flows, plus the
 * runtime data API for browsing/editing records of any entity. All calls carry
 * the admin bearer (attached automatically by http).
 */
import { http } from '@/lib/http';

export type AppStatus = 'draft' | 'published' | 'disabled' | string;

export interface LcApp {
  id: string;
  key: string;
  name: string;
  description?: string;
  status: AppStatus;
  [k: string]: unknown;
}

export interface LookupValue {
  value: string;
  label: string;
}

export interface Lookup {
  id: string;
  appId: string;
  key: string;
  name: string;
  values: LookupValue[];
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
  | 'json';

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
  [k: string]: unknown;
}

export interface Entity {
  id: string;
  appId: string;
  key: string;
  name: string;
  fields: Field[];
  stateMachine?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface Form {
  id: string;
  appId: string;
  key: string;
  name: string;
  [k: string]: unknown;
}

export type FlowScopeType = 'platform' | 'organization' | 'group' | 'user' | string;

export interface Flow {
  id: string;
  appId: string;
  key: string;
  name: string;
  event: string;
  match?: Record<string, unknown>;
  actions: unknown[];
  scopeType: FlowScopeType;
  enabled: boolean;
  [k: string]: unknown;
}

export interface LcRecord {
  id: string;
  [k: string]: unknown;
}

export const lowcodeAdminApi = {
  // ── design: apps ──
  apps: () => http.get<{ apps: LcApp[] }>('/lowcode/api/design/apps'),
  createApp: (body: Partial<LcApp>) => http.post<{ app: LcApp }>('/lowcode/api/design/apps', body),

  // ── design: lookups ──
  lookups: () => http.get<{ lookups: Lookup[] }>('/lowcode/api/design/lookups'),
  createLookup: (body: Partial<Lookup>) => http.post<{ lookup: Lookup }>('/lowcode/api/design/lookups', body),
  updateLookup: (id: string, body: Partial<Lookup>) =>
    http.put<{ lookup: Lookup }>(`/lowcode/api/design/lookups/${id}`, body),

  // ── design: entities ──
  entities: () => http.get<{ entities: Entity[] }>('/lowcode/api/design/entities'),
  createEntity: (body: Partial<Entity>) => http.post<{ entity: Entity }>('/lowcode/api/design/entities', body),
  updateEntity: (id: string, body: Partial<Entity>) =>
    http.put<{ entity: Entity }>(`/lowcode/api/design/entities/${id}`, body),

  // ── design: forms ──
  forms: () => http.get<{ forms: Form[] }>('/lowcode/api/design/forms'),
  createForm: (body: Partial<Form>) => http.post<{ form: Form }>('/lowcode/api/design/forms', body),

  // ── design: flows ──
  flows: () => http.get<{ flows: Flow[] }>('/lowcode/api/design/flows'),
  createFlow: (body: Partial<Flow>) => http.post<{ flow: Flow }>('/lowcode/api/design/flows', body),
  updateFlow: (id: string, body: Partial<Flow>) =>
    http.patch<{ flow: Flow }>(`/lowcode/api/design/flows/${id}`, body),

  // ── data (runtime records) ──
  records: (entityKey: string) =>
    http.get<{ records: LcRecord[] }>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records`),
  createRecord: (entityKey: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records`, body),
  updateRecord: (entityKey: string, id: string, body: Record<string, unknown>) =>
    http.put<{ record: LcRecord }>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records/${id}`, body),
  transitionRecord: (entityKey: string, id: string, body: Record<string, unknown>) =>
    http.post<{ record: LcRecord }>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records/${id}/transition`, body),
  deleteRecord: (entityKey: string, id: string) =>
    http.del<unknown>(`/lowcode/api/data/${encodeURIComponent(entityKey)}/records/${id}`),
};
