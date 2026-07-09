/**
 * Cortex module (prefix /cortex) — local-LLM agents, guardrails, skills, and
 * custom tools (FEAT-021/FEAT-022).
 *
 * Everything under /cortex/api/v1 needs the CA bearer (http.ts injects it) and
 * answers 503 { error: 'CORTEX_DISABLED' } while the module ships dark — pages
 * should catch that and render a "module disabled" state, not a raw error.
 * /cortex/health is public and answers even when disabled.
 */
import { http, ApiError } from '@/lib/http';

// ---------------------------------------------------------------- shared

/** Strongest action across the guardrail hits; null = clean pass. */
export type GuardrailAction = 'warn' | 'escalate' | 'block' | null;

export interface GuardrailHit {
  guardrail: string;
  action: Exclude<GuardrailAction, null>;
  rule_type: 'regex' | 'contains' | 'max_length' | 'llm_judge';
  rule: string;
}

export interface GuardrailVerdict {
  action: GuardrailAction;
  hits: GuardrailHit[];
}

/** Per-turn verdict bundle (input/output + optional moderator screens). */
export interface TurnGuardrails {
  input?: GuardrailVerdict;
  output?: GuardrailVerdict;
  moderation_input?: Record<string, unknown>;
  moderation_output?: Record<string, unknown>;
  [k: string]: unknown;
}

/** assistant/agent message delivery status (null on user/customer turns). */
export type MessageStatus =
  | 'sent'
  | 'blocked_input'
  | 'blocked_output'
  | 'escalated_input'
  | 'escalated_output'
  | 'sent_after_review'
  | null;

export function isCortexDisabled(e: unknown): boolean {
  return e instanceof ApiError && e.status === 503 && e.code === 'CORTEX_DISABLED';
}

// ---------------------------------------------------------------- health / models

export interface CortexHealth {
  status: string;
  enabled: boolean;
  brain: string;
  judge: string;
  router: { base: string; up: boolean };
  cache: { connected: boolean };
  queue: { initialized: boolean; waiting?: number; active?: number; failed?: number; error?: string };
}

export interface CortexModel {
  id: string;
  status?: string;
}

// ---------------------------------------------------------------- chat

export interface ChatTurnResult {
  session_id: string;
  reply: string;
  status: Exclude<MessageStatus, null>;
  skills?: string[] | null;
  guardrails: TurnGuardrails;
}

export interface ChatSessionBrief {
  id: string;
  created: string;
  turns: number;
  skills?: string[] | null;
  model?: string | null;
  preview?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  /** user | assistant (assistant chat) — customer | agent (cs chat) */
  role: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
}

export interface ChatSessionDetail {
  id: string;
  channel: 'assistant' | 'cs';
  model?: string | null;
  skills?: string[] | null;
  userId?: string | null;
  createdAt: string;
  messages: ChatMessage[];
}

// ---------------------------------------------------------------- tasks

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

/** One step of an agent run. Discriminate on `role` + which fields are set. */
export interface TranscriptEntry {
  role: 'assistant' | 'tool' | 'guardrail' | 'system';
  /** assistant final text / tool result text */
  content?: string;
  /** assistant tool-call step */
  tool_calls?: { name: string; arguments: string }[];
  /** tool result step */
  name?: string;
  /** guardrail intervention step */
  scope?: string;
  tool?: string;
  action?: GuardrailAction;
  hits?: GuardrailHit[];
  /** system note (e.g. tools disabled for this model) */
  note?: string;
}

export interface AgentTaskBrief {
  id: string;
  status: TaskStatus;
  goal: string;
  createdAt: string;
  finishedAt?: string | null;
}

export interface AgentTaskDetail extends AgentTaskBrief {
  model?: string | null;
  tools?: string[] | null;
  skills?: string[] | null;
  result?: string | null;
  error?: string | null;
  transcript?: TranscriptEntry[] | null;
  guardrails?: GuardrailVerdict | null;
  userId?: string | null;
}

// ---------------------------------------------------------------- outbox

export type OutboxStatus = 'sent' | 'pending_review' | 'blocked';

export interface OutboxBrief {
  id: string;
  status: OutboxStatus;
  subject: string;
  toAddress: string;
  createdAt: string;
}

export interface OutboxDetail extends OutboxBrief {
  body?: string | null;
  guardrails?: TurnGuardrails | null;
  userId?: string | null;
}

// ---------------------------------------------------------------- api

export const cortexApi = {
  health: () => http.get<CortexHealth>('/cortex/health'),
  models: () => http.get<{ models: CortexModel[]; brain: string }>('/cortex/api/v1/models'),

  // owner-facing assistant chat (full tool access + selected skills)
  chatTurn: (message: string, opts?: { session_id?: string; model?: string; skills?: string[] }) =>
    http.post<ChatTurnResult>('/cortex/api/v1/chat', { message, ...opts }),
  chatSessions: () => http.get<{ sessions: ChatSessionBrief[] }>('/cortex/api/v1/chat'),
  chatSession: (id: string) => http.get<ChatSessionDetail>(`/cortex/api/v1/chat/${encodeURIComponent(id)}`),

  // long-running agent tasks (Bull worker; poll task() for progress)
  createTask: (goal: string, opts?: { model?: string; tools?: string[]; skills?: string[] }) =>
    http.post<{ id: string; status: TaskStatus }>('/cortex/api/v1/tasks', { goal, ...opts }),
  tasks: () => http.get<{ tasks: AgentTaskBrief[] }>('/cortex/api/v1/tasks'),
  task: (id: string) => http.get<AgentTaskDetail>(`/cortex/api/v1/tasks/${encodeURIComponent(id)}`),

  // guarded customer-service channels
  csChatTurn: (message: string, session_id?: string) =>
    http.post<ChatTurnResult>('/cortex/api/v1/cs/chat', { message, ...(session_id && { session_id }) }),
  csChats: () => http.get<{ chats: { id: string; created: string; turns: number }[] }>('/cortex/api/v1/cs/chat'),
  csChat: (id: string) => http.get<ChatSessionDetail>(`/cortex/api/v1/cs/chat/${encodeURIComponent(id)}`),
  csEmail: (from: string, subject: string, body: string) =>
    http.post<OutboxDetail>('/cortex/api/v1/cs/email', { from, subject, body }),

  // drafted CS email replies
  outbox: () => http.get<{ outbox: OutboxBrief[] }>('/cortex/api/v1/outbox'),
  outboxEntry: (id: string) => http.get<OutboxDetail>(`/cortex/api/v1/outbox/${encodeURIComponent(id)}`),

  // registries are readable by any token holder (mutations live in admin/cortex.ts)
  guardrails: () => http.get<{ guardrails: GuardrailBrief[] }>('/cortex/api/v1/guardrails'),
  tools: () => http.get<{ tools: ToolBrief[] }>('/cortex/api/v1/tools'),
  skills: () => http.get<{ skills: SkillBrief[] }>('/cortex/api/v1/skills'),
};

// ---------------------------------------------------------------- registry types
// (shared with src/api/admin/cortex.ts)

export type RuleType = 'regex' | 'contains' | 'max_length' | 'llm_judge';
export type GuardrailScope = 'input' | 'output' | 'tool_call';

export interface GuardrailRule {
  type: RuleType;
  /** regex */
  pattern?: string;
  description?: string;
  /** contains */
  values?: string[];
  case_sensitive?: boolean;
  /** max_length */
  limit?: number;
  /** llm_judge */
  prompt?: string;
  fail_marker?: string;
}

export interface GuardrailTest {
  text: string;
  expect: 'trigger' | 'pass';
}

export interface GuardrailSpec {
  name: string;
  description?: string;
  enabled?: boolean;
  scope: GuardrailScope[];
  /** omit / empty = all channels (chat, cs_chat, cs_email, task) */
  channels?: string[] | null;
  action: Exclude<GuardrailAction, null>;
  rules: GuardrailRule[];
  tests?: GuardrailTest[];
  built_from?: string;
}

export interface GuardrailBrief {
  name: string;
  enabled: boolean;
  scope: GuardrailScope[];
  action: Exclude<GuardrailAction, null>;
  channels?: string[] | null;
  /** counts, not the arrays */
  rules: number;
  tests: number;
}

export interface GuardrailTestReport {
  passed: number;
  failed: number;
  results: { text: string; expect: 'trigger' | 'pass'; triggered: boolean; ok: boolean }[];
}

export type ToolKind = 'http' | 'python';

export interface ToolTest {
  args: Record<string, unknown>;
  expect_contains?: string;
  expect_regex?: string;
  expect_error?: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  enabled?: boolean;
  kind: ToolKind;
  /** JSON schema: { type:'object', required?: string[], properties: {...} } */
  parameters: {
    type: 'object';
    required?: string[];
    properties: Record<string, { type?: string; description?: string }>;
  };
  /** python kind: must define `def run(args):` */
  code?: string;
  /** http kind: {param} placeholders must be declared parameters */
  request?: { method?: string; url: string; headers?: Record<string, string>; body?: unknown };
  timeout?: number;
  tests?: ToolTest[];
  built_from?: string;
}

export interface ToolBrief {
  name: string;
  enabled: boolean;
  description: string;
  kind: ToolKind | null;
  params: string[];
  tests: number;
}

export interface ToolTestReport {
  passed: number;
  failed: number;
  results: { args: Record<string, unknown>; output?: string; error?: string; ok: boolean }[];
}

export interface SkillSpec {
  name: string;
  description: string;
  enabled?: boolean;
  instructions: string;
  recommended_tools?: string[];
  built_from?: string;
}

export interface SkillBrief {
  name: string;
  enabled: boolean;
  description: string;
  recommended_tools: string[];
}
