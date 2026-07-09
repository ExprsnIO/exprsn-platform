/**
 * Cortex admin surface: registry mutations (guardrails / tools / skills), the
 * human-review queue, and the prompt log. Every call here is platform-admin
 * gated on the backend (403 for non-admins) on top of the CA bearer.
 *
 * Registry lifecycle: save (POST spec) → test → enable. Tools and guardrails
 * are TEST-GATED — enable fails 400 with the test report until the spec's whole
 * suite passes; skills are prompt packs with no gate. `build` drafts a spec
 * from a plain-English description and always saves it disabled.
 */
import { http } from '@/lib/http';
import type {
  GuardrailSpec,
  GuardrailTestReport,
  SkillSpec,
  ToolSpec,
  ToolTestReport,
  TurnGuardrails,
} from '@/api/cortex';

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------- reviews

export type ReviewKind = 'assistant_reply' | 'cs_chat_input' | 'cs_chat_reply' | 'cs_email';

export interface Review {
  id: string;
  kind: ReviewKind;
  sessionId?: string | null;
  outboxId?: string | null;
  /** the held/blocked reply text (absent for cs_chat_input escalations) */
  draft?: string | null;
  customerMessage?: string | null;
  guardrails?: TurnGuardrails | null;
  status: 'pending' | 'approved' | 'rejected';
  note?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------- prompt log

export interface PromptLogRow {
  id: string;
  channel: string;
  sessionId?: string | null;
  model?: string | null;
  prompt: unknown;
  response?: unknown;
  usage?: unknown;
  cached: boolean;
  guardrails?: unknown;
  latencyMs?: number | null;
  createdAt: string;
}

// ---------------------------------------------------------------- api

/** 422 body when the LLM builder produced an invalid draft. */
export interface BuildProblem {
  error: string;
  problems: string[];
  draft?: unknown;
}

export interface GuardrailBuildResult {
  saved: string;
  enabled: false;
  spec: GuardrailSpec;
  tests: GuardrailTestReport;
  next: string;
}

export interface ToolBuildResult {
  saved: string;
  enabled: false;
  spec: ToolSpec;
  tests?: ToolTestReport;
  next: string;
}

export interface SkillBuildResult {
  saved: string;
  enabled: false;
  spec: SkillSpec;
  next: string;
}

export const cortexAdminApi = {
  // -- human-review queue (approve releases held content; 409 = already resolved)
  reviews: () => http.get<{ reviews: Review[] }>('/cortex/api/v1/reviews'),
  resolveReview: (id: string, action: 'approve' | 'reject', note?: string) =>
    http.post<Review>(`/cortex/api/v1/reviews/${encodeURIComponent(id)}`, { action, ...(note && { note }) }),

  // -- prompt log
  prompts: (params?: { channel?: string; session?: string; q?: string; limit?: number; offset?: number }) =>
    http.get<{ rows: PromptLogRow[]; total: number }>(`/cortex/api/v1/prompts${q(params)}`),

  // -- guardrail registry
  guardrail: (name: string) => http.get<GuardrailSpec>(`/cortex/api/v1/guardrails/${encodeURIComponent(name)}`),
  saveGuardrail: (spec: GuardrailSpec) =>
    http.post<{ saved: string; enabled: boolean }>('/cortex/api/v1/guardrails', spec),
  buildGuardrail: (description: string, opts?: { name?: string; action?: string }) =>
    http.post<GuardrailBuildResult>('/cortex/api/v1/guardrails/build', { description, ...opts }),
  testGuardrail: (name: string) =>
    http.post<GuardrailTestReport>(`/cortex/api/v1/guardrails/${encodeURIComponent(name)}/test`, {}),
  enableGuardrail: (name: string) =>
    http.post<{ enabled: string; tests: GuardrailTestReport }>(`/cortex/api/v1/guardrails/${encodeURIComponent(name)}/enable`, {}),
  disableGuardrail: (name: string) =>
    http.post<{ disabled: string }>(`/cortex/api/v1/guardrails/${encodeURIComponent(name)}/disable`, {}),
  deleteGuardrail: (name: string) =>
    http.del<{ deleted: string }>(`/cortex/api/v1/guardrails/${encodeURIComponent(name)}`),

  // -- tool registry (run executes tool code — python kind needs CORTEX_PYTHON_TOOLS_ENABLED)
  tool: (name: string) => http.get<ToolSpec>(`/cortex/api/v1/tools/${encodeURIComponent(name)}`),
  saveTool: (spec: ToolSpec) => http.post<{ saved: string; enabled: boolean }>('/cortex/api/v1/tools', spec),
  buildTool: (description: string, opts?: { name?: string; kind?: string }) =>
    http.post<ToolBuildResult>('/cortex/api/v1/tools/build', { description, ...opts }),
  testTool: (name: string) =>
    http.post<ToolTestReport>(`/cortex/api/v1/tools/${encodeURIComponent(name)}/test`, {}),
  runTool: (name: string, args: Record<string, unknown>) =>
    http.post<{ result: string }>(`/cortex/api/v1/tools/${encodeURIComponent(name)}/run`, { args }),
  enableTool: (name: string) =>
    http.post<{ enabled: string }>(`/cortex/api/v1/tools/${encodeURIComponent(name)}/enable`, {}),
  disableTool: (name: string) =>
    http.post<{ disabled: string }>(`/cortex/api/v1/tools/${encodeURIComponent(name)}/disable`, {}),
  deleteTool: (name: string) => http.del<{ deleted: string }>(`/cortex/api/v1/tools/${encodeURIComponent(name)}`),

  // -- skill registry (no test gate)
  skill: (name: string) => http.get<SkillSpec>(`/cortex/api/v1/skills/${encodeURIComponent(name)}`),
  saveSkill: (spec: SkillSpec) => http.post<{ saved: string; enabled: boolean }>('/cortex/api/v1/skills', spec),
  buildSkill: (description: string, opts?: { name?: string }) =>
    http.post<SkillBuildResult>('/cortex/api/v1/skills/build', { description, ...opts }),
  enableSkill: (name: string) =>
    http.post<{ enabled: string }>(`/cortex/api/v1/skills/${encodeURIComponent(name)}/enable`, {}),
  disableSkill: (name: string) =>
    http.post<{ disabled: string }>(`/cortex/api/v1/skills/${encodeURIComponent(name)}/disable`, {}),
  deleteSkill: (name: string) => http.del<{ deleted: string }>(`/cortex/api/v1/skills/${encodeURIComponent(name)}`),
};
