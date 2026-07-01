/**
 * Moderator admin API (/moderator/api/*). NOTE: nearly every moderator REST
 * route is unauthenticated in this deployment (only POST /api/notifications is
 * service-HMAC), so these calls work with or without a bearer.
 */
import { http } from '@/lib/http';

export interface QueueItem {
  id: string;
  contentType?: string;
  status?: string;
  priority?: number | string;
  riskScore?: number;
  sourceService?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface ModReport {
  id: string;
  status?: string;
  reason?: string;
  contentType?: string;
  reportedBy?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface ModRule {
  id: string;
  name?: string;
  action?: string;
  enabled?: boolean;
  priority?: number;
  appliesTo?: string;
  [k: string]: unknown;
}
export interface Appeal {
  id: string;
  status?: string;
  reason?: string;
  userId?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface Workflow {
  id: string;
  name?: string;
  enabled?: boolean;
  trigger?: string;
  [k: string]: unknown;
}

/* ---------------------------------------------------------- rule builder */

export type RuleAction =
  | 'auto_approve'
  | 'approve'
  | 'reject'
  | 'hide'
  | 'remove'
  | 'warn'
  | 'flag'
  | 'escalate'
  | 'require_review';

export type ContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'post'
  | 'comment'
  | 'message'
  | 'profile'
  | 'file';

export type ConditionCategory = 'toxicity' | 'nsfw' | 'spam' | 'violence' | 'hateSpeech' | 'sentiment';

export type DidMethod = 'web' | 'plc' | 'exprsn';

/**
 * The nested boolean tree the moderation engine evaluates. A node may carry
 * GROUP keys (all/any/none — AND/OR/NOT over child nodes) and/or LEAF keys
 * (all ANDed together). A flat object with only leaf keys is a single leaf.
 */
export interface ConditionNode {
  all?: ConditionNode[];
  any?: ConditionNode[];
  none?: ConditionNode[];
  min_risk_score?: number;
  max_risk_score?: number;
  min_toxicity_score?: number;
  max_toxicity_score?: number;
  min_nsfw_score?: number;
  max_nsfw_score?: number;
  min_spam_score?: number;
  max_spam_score?: number;
  min_violence_score?: number;
  max_violence_score?: number;
  min_hateSpeech_score?: number;
  max_hateSpeech_score?: number;
  min_sentiment_score?: number;
  max_sentiment_score?: number;
  keywords?: string[];
  keyword_match?: 'any' | 'all';
  keywords_list?: string | string[];
  regex?: string;
  regex_flags?: string;
  did_method?: DidMethod[];
  min_length?: number;
  max_length?: number;
  [k: string]: unknown;
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  appliesTo: ContentType[];
  sourceServices: string[];
  conditions: ConditionNode;
  thresholdScore: number | null;
  action: RuleAction;
  enabled: boolean;
  priority: number;
  parentRuleId: string | null;
  metadata?: { safeguard?: boolean; gate?: boolean; [k: string]: unknown };
  [k: string]: unknown;
}

export type RuleInput = Partial<Omit<Rule, 'id'>>;

export interface RuleScores {
  toxicityScore?: number;
  nsfwScore?: number;
  spamScore?: number;
  violenceScore?: number;
  hateSpeechScore?: number;
  sentimentScore?: number;
}

export interface RuleTestInput {
  contentType?: string;
  contentText?: string;
  sourceService?: string;
  authorDid?: string;
  scores?: RuleScores;
  riskScore?: number;
}

export interface RuleTestResult {
  matched: boolean;
  wouldWin: boolean;
  pipeline?: unknown;
  [k: string]: unknown;
}

/* ----------------------------------------------------------- ai agents */

export type AgentType =
  | 'text_moderation'
  | 'image_moderation'
  | 'video_moderation'
  | 'spam_detection'
  | 'rate_limit_detection'
  | 'hate_speech_detection'
  | 'nsfw_detection'
  | 'violence_detection'
  | 'custom';

export type AgentStatus = 'active' | 'inactive' | 'testing' | 'error';
export type AgentProvider = 'claude' | 'openai' | 'deepseek' | 'local';

export interface ModAgent {
  id: string;
  name: string;
  description?: string;
  type: AgentType;
  status: AgentStatus;
  provider: AgentProvider;
  model: string;
  promptTemplate: string;
  config: Record<string, unknown>;
  thresholdScores: Record<string, unknown>;
  appliesTo: string[];
  priority: number;
  enabled: boolean;
  autoAction: boolean;
  [k: string]: unknown;
}

export type AgentInput = Partial<Omit<ModAgent, 'id'>>;

/* ----------------------------------------------------------- word lists */

export interface WordList {
  name: string;
  words: string[];
  mode: 'deny' | 'allow';
  count: number;
}

/* ----------------------------------------------------------- workflows */

/**
 * A workflow step. Discriminated by `type`. `set_action` reuses the rule engine's
 * RuleAction values. `condition` branches into then/else sub-step lists; `parallel`
 * fans out into a sub-step list. The whole tree is what the workflow builder edits.
 */
export type Step =
  | { type: 'analyze' }
  | { type: 'apply_rules' }
  | { type: 'set_action'; action: RuleAction; persist?: boolean }
  | { type: 'route_queue'; queue?: string }
  | { type: 'condition'; if: ConditionNode; then: Step[]; else: Step[] }
  | { type: 'notify'; target: 'moderators' | 'user'; title?: string; body?: string }
  | { type: 'label'; value: string }
  | { type: 'parallel'; steps: Step[] };

export type StepType = Step['type'];

export interface WorkflowSpec {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: { type: 'event' | 'manual'; event?: 'content_submitted' };
  steps: Step[];
}

export type WorkflowInput = Partial<Omit<WorkflowSpec, 'id'>>;

export interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  trigger?: unknown;
  steps: unknown[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  [k: string]: unknown;
}

/* -------------------------------------------------------------- queues */

export type QueueBackend = 'redis' | 'rabbitmq';
export type QueuePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface QueueRabbitSpec {
  exchange: string;
  exchangeType: 'topic' | 'direct' | 'fanout';
  routingKey: string;
  durable: boolean;
  dlx: string;
}

export interface QueueSpec {
  name: string;
  displayName: string;
  description?: string;
  backend: QueueBackend;
  enabled: boolean;
  priority: QueuePriority;
  concurrency: number;
  attempts: number;
  backoff: { type: 'exponential' | 'fixed'; delay: number };
  deadLetter: boolean;
  rateLimit: { max: number; duration: number } | null;
  rabbit: QueueRabbitSpec | null;
  match: ConditionNode;
}

export interface QueueCounts {
  // Bull/Redis backend
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  /** Dead-letter count (both backends). */
  dlq?: number;
  // RabbitMQ backend
  /** True once the rabbit topology + consumer are up. */
  wired?: boolean;
  /** Messages waiting in the rabbit work queue. */
  depth?: number;
  /** Publishes that couldn't be delivered while the broker was down. */
  pending?: number;
  [k: string]: unknown;
}

/** A queue spec plus live broker stats (from GET /moderator/api/queues). */
export type QueueWithCounts = QueueSpec & {
  counts?: QueueCounts;
  /** Whether a per-bucket consumer is registered/active. */
  consumer?: boolean;
  /** Items the consumer has processed this process lifetime. */
  processed?: number;
};

export interface QueueTestSample {
  scores?: RuleScores;
  contentType?: string;
  sourceService?: string;
  contentText?: string;
  authorDid?: string;
}

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const MODERATOR_CONFIG_SECTIONS = ['moderation-rules', 'moderation-ai', 'moderation-queue'];

export const moderatorAdminApi = {
  queue: (params?: { status?: string; priority?: string; limit?: number }) =>
    http.get<{ items?: QueueItem[]; queue?: QueueItem[]; data?: QueueItem[] }>(`/moderator/api/queue${q(params)}`),
  approve: (itemId: string, moderatorId: string) => http.post<unknown>(`/moderator/api/queue/${itemId}/approve`, { moderatorId }),
  reject: (itemId: string, moderatorId: string) => http.post<unknown>(`/moderator/api/queue/${itemId}/reject`, { moderatorId }),
  warn: (id: string) => http.post<unknown>(`/moderator/api/queue/${id}/warn`, {}),
  remove: (id: string) => http.post<unknown>(`/moderator/api/queue/${id}/remove`, {}),
  ban: (id: string) => http.post<unknown>(`/moderator/api/queue/${id}/ban`, {}),
  analyze: (id: string) => http.post<Record<string, unknown>>(`/moderator/api/queue/${id}/analyze`, {}),

  reports: (params?: { status?: string; limit?: number }) =>
    http.get<{ reports?: ModReport[]; data?: ModReport[] }>(`/moderator/api/reports${q(params)}`),
  resolveReport: (id: string, resolvedBy: string, actionTaken?: string) =>
    http.put<unknown>(`/moderator/api/reports/${id}/resolve`, { resolvedBy, actionTaken }),

  rules: (params?: { enabled?: string; limit?: number }) =>
    http.get<{ rules?: ModRule[]; data?: ModRule[] }>(`/moderator/api/rules${q(params)}`),
  getRule: (id: string) => http.get<{ rule?: Rule } & Record<string, unknown>>(`/moderator/api/rules/${id}`),
  createRule: (body: RuleInput) => http.post<{ rule?: Rule } & Record<string, unknown>>('/moderator/api/rules', body),
  updateRule: (id: string, body: RuleInput) => http.put<{ rule?: Rule } & Record<string, unknown>>(`/moderator/api/rules/${id}`, body),
  testRule: (id: string, body: RuleTestInput) =>
    http.post<{ success?: boolean; test?: RuleTestResult } & Record<string, unknown>>(`/moderator/api/rules/${id}/test`, body),
  enableRule: (id: string) => http.post<unknown>(`/moderator/api/rules/${id}/enable`, {}),
  disableRule: (id: string) => http.post<unknown>(`/moderator/api/rules/${id}/disable`, {}),
  deleteRule: (id: string) => http.del<unknown>(`/moderator/api/rules/${id}`),

  agents: () => http.get<{ agents?: ModAgent[]; data?: ModAgent[] }>('/moderator/api/agents'),
  createAgent: (body: AgentInput) => http.post<{ agent?: ModAgent } & Record<string, unknown>>('/moderator/api/agents', body),
  updateAgent: (id: string, body: AgentInput) => http.put<{ agent?: ModAgent } & Record<string, unknown>>(`/moderator/api/agents/${id}`, body),
  enableAgent: (id: string) => http.post<unknown>(`/moderator/api/agents/${id}/enable`, {}),
  disableAgent: (id: string) => http.post<unknown>(`/moderator/api/agents/${id}/disable`, {}),
  deleteAgent: (id: string) => http.del<unknown>(`/moderator/api/agents/${id}`),

  wordlists: () => http.get<{ lists?: WordList[]; data?: WordList[] }>('/moderator/api/wordlists'),
  getWordlist: (name: string) => http.get<{ list?: WordList } & Record<string, unknown>>(`/moderator/api/wordlists/${name}`),
  saveWordlist: (name: string, body: { words: string[]; mode: 'deny' | 'allow' }) =>
    http.put<{ list?: WordList } & Record<string, unknown>>(`/moderator/api/wordlists/${name}`, body),
  deleteWordlist: (name: string) => http.del<unknown>(`/moderator/api/wordlists/${name}`),

  appeals: (params?: { status?: string; limit?: number }) =>
    http.get<{ appeals?: Appeal[]; data?: Appeal[] }>(`/moderator/api/appeals${q(params)}`),
  appealStats: () => http.get<Record<string, unknown>>('/moderator/api/appeals/stats/summary'),
  reviewAppeal: (id: string, decision: 'approve' | 'deny', notes: string) =>
    http.post<unknown>(`/moderator/api/appeals/${id}/review`, { decision, notes }),

  workflows: () => http.get<{ success?: boolean; workflows?: WorkflowSpec[] }>('/moderator/api/workflows'),
  createWorkflow: (body: WorkflowInput) =>
    http.post<{ workflow?: WorkflowSpec } & Record<string, unknown>>('/moderator/api/workflows', body),
  updateWorkflow: (id: string, body: WorkflowInput) =>
    http.put<{ workflow?: WorkflowSpec } & Record<string, unknown>>(`/moderator/api/workflows/${id}`, body),
  deleteWorkflow: (id: string) => http.del<unknown>(`/moderator/api/workflows/${id}`),
  executeWorkflow: (id: string, context?: Record<string, unknown>) =>
    http.post<Record<string, unknown>>(`/moderator/api/workflows/${id}/execute`, context ? { context } : {}),
  executions: () => http.get<{ success?: boolean; executions?: Execution[] }>('/moderator/api/workflows/executions'),
  getExecution: (id: string) =>
    http.get<{ success?: boolean; execution?: Execution }>(`/moderator/api/workflows/executions/${id}`),

  queues: () => http.get<{ success?: boolean; queues?: QueueWithCounts[] }>('/moderator/api/queues'),
  getQueue: (name: string) => http.get<{ success?: boolean; queue?: QueueSpec }>(`/moderator/api/queues/${name}`),
  saveQueue: (name: string, spec: QueueSpec) =>
    http.put<{ queue?: QueueSpec } & Record<string, unknown>>(`/moderator/api/queues/${name}`, spec),
  deleteQueue: (name: string) => http.del<unknown>(`/moderator/api/queues/${name}`),
  queueStats: (name: string) => http.get<Record<string, unknown>>(`/moderator/api/queues/${name}/stats`),
  testQueue: (name: string, sample: QueueTestSample) =>
    http.post<{ success?: boolean; matched?: boolean } & Record<string, unknown>>(`/moderator/api/queues/${name}/test`, sample),

  // ── dead-letter management ──
  dlqItems: (name: string, limit = 50) =>
    http.get<{ success?: boolean; items?: Array<Record<string, unknown>>; depth?: number }>(`/moderator/api/queues/${name}/dlq?limit=${limit}`),
  redriveDlq: (name: string, limit?: number) =>
    http.post<{ success?: boolean; moved?: number }>(`/moderator/api/queues/${name}/dlq/redrive`, limit ? { limit } : {}),
  purgeDlq: (name: string) =>
    http.del<{ success?: boolean; purged?: number }>(`/moderator/api/queues/${name}/dlq`),

  metrics: (period = 'today') => http.get<Record<string, unknown>>(`/moderator/api/metrics${q({ period })}`),
  recentActions: (limit = 25) => http.get<{ actions?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> }>(`/moderator/api/actions/recent${q({ limit })}`),
  providersStatus: () => http.get<Record<string, unknown>>('/moderator/api/actions/providers/status'),

  getConfigSection: (s: string) => http.get<unknown>(`/moderator/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/moderator/api/config/${s}`, data),
};
