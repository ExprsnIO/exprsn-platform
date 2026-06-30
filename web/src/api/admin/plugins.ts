/**
 * Plugins admin API (/plugins/api/*). Catalog of registered plugins, their
 * installations (per scope) with a lifecycle state machine, webhook endpoints,
 * delivery log, and the read-only capability/event/lifecycle registry. All calls
 * carry the admin bearer (attached automatically by http).
 */
import { http } from '@/lib/http';

export type PluginKind = 'declarative' | 'webhook' | 'script' | 'internal';
export type PluginStatus = 'draft' | 'published' | 'disabled' | 'deprecated' | string;

export interface Plugin {
  id: string;
  pluginKey: string;
  name: string;
  description?: string;
  publisher?: string;
  latestVersion?: string;
  kind: PluginKind;
  source?: string;
  status: PluginStatus;
  manifest?: Record<string, unknown>;
  versions?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export type ScopeType = 'platform' | 'organization' | 'group' | 'user';
export type InstallationStatus = 'installed' | 'enabled' | 'disabled' | 'error';

export interface Installation {
  id: string;
  pluginId: string;
  scopeType: ScopeType;
  scopeId?: string | null;
  version?: string;
  status: InstallationStatus;
  lifecycleState?: string;
  config?: Record<string, unknown>;
  grants?: unknown;
  plugin?: Plugin;
  availableEvents?: string[];
  [k: string]: unknown;
}

export type TransitionEvent = 'enable' | 'disable' | 'fail' | 'uninstall';

export interface Transition {
  id?: string;
  event?: string;
  fromState?: string;
  toState?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export type EndpointDirection = 'outbound' | 'inbound';

export interface Endpoint {
  id: string;
  installationId?: string | null;
  name: string;
  direction: EndpointDirection;
  method?: string;
  url?: string;
  timeoutMs?: number;
  secretRef?: string;
  [k: string]: unknown;
}

export type DeliveryStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export interface Delivery {
  id: string;
  pluginKey: string;
  event: string;
  kind: string;
  status: DeliveryStatus;
  attempts?: number;
  responseCode?: number;
  error?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface Capability {
  key: string;
  description: string;
}

export interface EventDef {
  key: string;
  module: string;
  description: string;
}

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
}

export interface EndpointInput {
  installationId?: string | null;
  name: string;
  direction: EndpointDirection;
  method?: string;
  url?: string;
  timeoutMs?: number;
  secretRef?: string;
}

export interface InstallationInput {
  pluginKey: string;
  scopeType: ScopeType;
  scopeId?: string;
  config?: Record<string, unknown>;
  capabilities?: string[];
}

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const pluginsAdminApi = {
  // ── catalog ──
  plugins: (params?: { kind?: string; status?: string }) =>
    http.get<{ plugins: Plugin[] }>(`/plugins/api/plugins${q(params)}`),
  getPlugin: (key: string) => http.get<{ plugin: Plugin }>(`/plugins/api/plugins/${encodeURIComponent(key)}`),
  validateManifest: (manifest: Record<string, unknown>) =>
    http.post<ManifestValidation>('/plugins/api/plugins/validate', manifest),
  registerPlugin: (manifest: Record<string, unknown>) =>
    http.post<{ plugin: Plugin }>('/plugins/api/plugins', manifest),
  deletePlugin: (key: string) => http.del<unknown>(`/plugins/api/plugins/${encodeURIComponent(key)}`),

  // ── installations ──
  installations: (params?: { scopeType?: string; status?: string }) =>
    http.get<{ installations: Installation[] }>(`/plugins/api/installations${q(params)}`),
  install: (body: InstallationInput) =>
    http.post<{ installation: Installation }>('/plugins/api/installations', body),
  enableInstallation: (id: string) => http.post<unknown>(`/plugins/api/installations/${id}/enable`, {}),
  disableInstallation: (id: string) => http.post<unknown>(`/plugins/api/installations/${id}/disable`, {}),
  uninstall: (id: string) => http.del<unknown>(`/plugins/api/installations/${id}`),
  transition: (id: string, event: TransitionEvent) =>
    http.post<unknown>(`/plugins/api/installations/${id}/transition`, { event }),
  transitions: (id: string) =>
    http.get<{ transitions: Transition[] }>(`/plugins/api/installations/${id}/transitions`),

  // ── endpoints ──
  endpoints: (installationId?: string) =>
    http.get<{ endpoints: Endpoint[] }>(`/plugins/api/endpoints${q({ installationId })}`),
  createEndpoint: (body: EndpointInput) => http.post<{ endpoint: Endpoint }>('/plugins/api/endpoints', body),
  updateEndpoint: (id: string, body: Partial<EndpointInput>) =>
    http.patch<{ endpoint: Endpoint }>(`/plugins/api/endpoints/${id}`, body),
  deleteEndpoint: (id: string) => http.del<unknown>(`/plugins/api/endpoints/${id}`),

  // ── deliveries ──
  deliveries: (params?: { installationId?: string; event?: string; status?: string; limit?: number }) =>
    http.get<{ deliveries: Delivery[] }>(`/plugins/api/deliveries${q(params)}`),

  // ── registry (read-only vocabulary) ──
  capabilities: () => http.get<{ capabilities: Capability[] }>('/plugins/api/registry/capabilities'),
  events: () => http.get<{ events: EventDef[]; surfaces: string[] }>('/plugins/api/registry/events'),
  lifecycle: () => http.get<{ machine: unknown }>('/plugins/api/registry/lifecycle'),
};
