'use strict';

/**
 * Flow layer for the cortex module (port of the MacOS LLM service's
 * agents/jobs.js): runTask / assistantChatTurn / csChatTurn / csEmail /
 * resolveReview.
 *
 * Every input, output, and tool call passes through the guardrail engine;
 * escalations land in the human-review queue (cortex.reviews) instead of
 * going out. An optional moderator-module screen (CORTEX_MODERATE) layers on
 * top of the local guardrails, fail-open.
 *
 * Queueing changes vs the source: the RabbitMQ request/response bridge is
 * gone. Interactive flows are direct in-process calls (the LLM semaphore in
 * lib/llama.js serializes router traffic); long-running tasks go to the Bull
 * queue `cortex-tasks`, with an in-process fallback when Redis is down so a
 * dev machine without the worker still completes tasks.
 */

const path = require('path');
const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const config = require('../config');
const agent = require('./agent');
const { GuardrailEngine } = require('./guardrails');
const { ToolRegistry } = require('./tools');
const { SkillRegistry } = require('./skills');
const { AgentTask, Agent, AgentRun, ChatSession, ChatMessage, OutboxEntry, Review } = require('../models');
const { personaPrompt } = require('./agents');
const { runChain } = require('./chain');
const { newId } = require('../lib/ids');
const { logPrompt } = require('../lib/promptLog');
const { initQueues, queues } = require('../queues');

const logger = createLogger('exprsn-cortex');

const ENGINE = new GuardrailEngine(agent.judge);
const TOOLS = new ToolRegistry();
const SKILLS = new SkillRegistry();

const BLOCKED_REPLY = "Sorry — I can't help with that request. " +
  'If you believe this is a mistake, a human agent can assist you.';
const HELD_REPLY = 'Thanks for your message. A human agent is reviewing this ' +
  'conversation and will follow up shortly.';

const WORKSPACES_DIR = path.join(config.cortex.dataDir, 'workspaces');

// The moderator's moderation_items.user_id is a NOT NULL uuid column, so the
// cortex system principal is represented by the nil UUID rather than the string
// 'cortex' — which used to make moderatorScreen 500 on
// `invalid input syntax for type uuid: "cortex"` immediately after BUG-015's
// content_type wall (the two together are why the screen had never persisted a
// row). sourceService:'cortex' still carries the provenance for the audit trail.
const CORTEX_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

async function applyOutputGuardrails(text, channel) {
  const verdict = await ENGINE.evaluate(text, 'output', channel);
  return [verdict.action, verdict];
}

// Optional moderator-module screen, layered on top of the local guardrails.
// Fail-open: when moderation is disabled or the moderator is unreachable it
// returns null and the local guardrail verdict stands alone.
async function moderatorScreen(text, channel, sessionId) {
  if (!config.cortex.moderate || !text) return null;
  let verdict = null;
  try {
    const headers = { 'Content-Type': 'application/json' };
    const serviceId = process.env.SERVICE_ID || 'platform';
    try {
      headers['X-Service-ID'] = serviceId;
      headers['X-Service-Token'] = deriveServiceToken(serviceId);
    } catch { /* no service secret configured; moderator decides */ }
    const res = await axios.post(
      `${config.baseUrl}/moderator/api/moderate/content`,
      {
        contentType: 'llm_message',
        contentId: sessionId || `llm-${newId('mod')}`,
        sourceService: 'cortex',
        userId: CORTEX_SYSTEM_USER_ID,
        contentText: String(text).slice(0, 32000),
        contentMetadata: { channel },
      },
      { timeout: 15000, headers, httpsAgent: undefined },
    );
    verdict = (res.data && res.data.moderation) || null;
  } catch (e) {
    logger.warn('moderator screen unavailable (fail-open)', { error: e.message });
    return null;
  }
  if (!verdict) return null;
  if (verdict.rejected) verdict.effective = 'block';
  else if (verdict.requiresReview) verdict.effective = 'escalate';
  else verdict.effective = 'pass';
  return verdict;
}

// Strongest of a guardrail action and an optional moderator verdict.
function combinedAction(guardrailAction, moderation) {
  const rank = { pass: 0, warn: 1, escalate: 2, block: 3 };
  const m = moderation?.effective ?? 'pass';
  return (rank[m] ?? 0) > (rank[guardrailAction] ?? 0) ? m : guardrailAction;
}

// ---------------------------------------------------------------- sessions

async function appendMessage(sessionId, { role, content, status = null }) {
  await ChatMessage.create({ sessionId, role, content, status });
}

async function sessionHistory(sessionId, userRole) {
  const msgs = await ChatMessage.findAll({
    where: { sessionId },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
  });
  return msgs.map((m) => ({
    role: m.role === userRole ? 'user' : 'assistant',
    content: m.content,
  }));
}

// ---------------------------------------------------------------- flows

async function runTask(taskId) {
  const task = await AgentTask.findByPk(taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  await task.update({ status: 'running' });
  const workspace = path.join(WORKSPACES_DIR, taskId);
  const [schemas, impls] = agent.taskTools(
    workspace, await TOOLS.agentTools(task.tools ?? null));
  const system = await personaPrompt('task', agent.TASK_SYSTEM) +
    await SKILLS.promptBlock(task.skills);
  const started = Date.now();
  const update = {};
  try {
    const { text, transcript, commitCache } = await agent.runAgent(
      system, [{ role: 'user', content: task.goal }],
      schemas, impls, ENGINE, 'task', { model: task.model });
    const [action, verdict] = await applyOutputGuardrails(text, 'task');
    let result = text;
    if (action === 'block') {
      result = 'Result withheld: it violated guardrail(s) ' +
               verdict.hits.map((h) => h.guardrail).join(', ');
    } else if (action !== 'escalate' && commitCache) {
      await commitCache();
    }
    Object.assign(update, { status: 'done', result, transcript,
                            guardrails: verdict, finishedAt: new Date() });
  } catch (e) {
    Object.assign(update, { status: 'failed', error: `${e.name || 'Error'}: ${e.message}`,
                            finishedAt: new Date() });
  }
  await task.update(update);
  logPrompt({
    channel: 'task', sessionId: taskId,
    model: task.model || agent.BRAIN_MODEL,
    prompt: { goal: task.goal, tools: task.tools, skills: task.skills },
    response: { status: task.status, result: task.result, error: task.error },
    guardrails: task.guardrails, latencyMs: Date.now() - started,
  });
  return task;
}

// Enqueue a task run on the Bull queue; if Redis is down, fall back to an
// in-process fire-and-forget run so the task still completes.
async function queueTask(taskId) {
  try {
    initQueues();
    await queues.tasks.add('run-task', { taskId });
  } catch (e) {
    logger.warn('cortex-tasks enqueue failed; running task in-process', {
      taskId, error: e.message,
    });
    runTask(taskId).catch((err) =>
      logger.error('in-process task run failed', { taskId, error: err.message }));
  }
}

// Execute a DB-defined agent's run (FEAT-080). Mirrors runTask: per-run
// workspace, spec-scoped custom tools + skills, guardrails on the spec's
// channel, output guardrails on the final text, transcript persisted on the
// run row. The AGENT's spec is read at run time — model resolvability was
// checked at enable time but the router can differ now; a run-time failure
// fails the RUN (status 'failed'), never the agent's lifecycle status.
/**
 * FEAT-081 — execute a multi-step agent spec.
 *
 * This function is the ONLY place the chaining engine is bound to real I/O; the
 * engine itself (engine/chain.js) is dependency-injected and side-effect-free,
 * which is what makes the step semantics unit-testable without a router or a DB.
 *
 * Note what is deliberately reused rather than reimplemented: the same
 * `applyOutputGuardrails` the single-loop path uses screens every model-producing
 * step, the same `moderatorScreen` backs `moderate` steps, and `tool_loop` steps
 * call `agent.runAgent` unchanged — so per-tool-call guardrail screening still
 * happens inside them. A chain adds steps; it does not add a second, weaker
 * enforcement path.
 */
async function runAgentChain(spec, run, { system, schemas, impls, channel, model, workspace }) {
  const reviews = [];
  const deps = {
    runPrompt: async (prompt, { model: stepModel } = {}) => agent.simpleChat(
      system, prompt, { model: stepModel || model || null }),

    runToolLoop: async (goal, { model: stepModel, maxIterations, tools } = {}) => {
      // A step may narrow the tool set; null means "the agent's own tools".
      const [stepSchemas, stepImpls] = tools
        ? agent.taskTools(workspace, await TOOLS.agentTools(tools))
        : [schemas, impls];
      const { text, transcript } = await agent.runAgent(
        system, [{ role: 'user', content: goal }],
        stepSchemas, stepImpls, ENGINE, channel,
        { model: stepModel || model || null,
          maxIterations: maxIterations || spec.max_iterations || undefined });
      return { text, transcript };
    },

    // The global channel screen — identical to the single-loop path's.
    screenOutput: async (text) => {
      const [, verdict] = await applyOutputGuardrails(text, channel);
      return verdict;
    },

    // A `guardrail` step's named subset, evaluated against the same engine.
    evaluateGuardrails: async (text, names) => {
      const specs = (await ENGINE.enabledSpecs()).filter((g) => names.includes(g.name));
      return ENGINE.evaluate(text, 'output', channel, specs);
    },

    moderate: async (text) => moderatorScreen(text, channel, run.id),

    skillBlock: async (name) => SKILLS.promptBlock([name]),

    // FEAT-095 will bind a real KB here. Until then an empty result, never a
    // throw — a chain containing a retrieve step has to run today (AC).
    retrieve: async () => '',

    onEscalate: async (reason, { step, verdict, draft }) => {
      const review = await Review.create({
        id: newId('rev'), kind: 'agent_step',
        sessionId: run.id, draft: String(draft ?? '').slice(0, 32000),
        customerMessage: run.input, guardrails: verdict ?? null,
        status: 'pending',
      });
      reviews.push({ id: review.id, step, reason });
    },
  };

  const { output, transcript, halted, haltReason } = await runChain(
    spec.steps, run.input, deps);

  if (halted) {
    // A halted chain is a completed run with a withheld result, not a crash —
    // the transcript carries exactly which step stopped it and why.
    return {
      status: 'done',
      result: haltReason.action === 'escalate'
        ? 'Held for human review: ' + haltReason.message
        : 'Result withheld: ' + haltReason.message,
      transcript,
      guardrails: haltReason.verdict ?? null,
      finishedAt: new Date(),
      ...(reviews.length && { error: null }),
    };
  }

  // The chain's own per-step screening already cleared every model output, so
  // this final screen is belt-and-braces over the value actually returned.
  const [action, verdict] = await applyOutputGuardrails(output, channel);
  return {
    status: 'done',
    result: action === 'block'
      ? 'Result withheld: it violated guardrail(s) ' + verdict.hits.map((h) => h.guardrail).join(', ')
      : output,
    transcript,
    guardrails: verdict,
    finishedAt: new Date(),
  };
}

async function runAgentRun(runId) {
  const run = await AgentRun.findByPk(runId);
  if (!run) throw new Error(`agent run not found: ${runId}`);
  const agentRow = await Agent.findByPk(run.agentId);
  if (!agentRow) {
    await run.update({ status: 'failed', error: 'agent no longer exists', finishedAt: new Date() });
    return run;
  }
  const spec = agentRow.spec || {};
  const channel = spec.channel || 'task';
  await run.update({ status: 'running' });
  const workspace = path.join(WORKSPACES_DIR, runId);
  const [schemas, impls] = agent.taskTools(
    workspace, await TOOLS.agentTools(spec.tools ?? null));
  const system = String(spec.system_prompt || agent.TASK_SYSTEM) +
    await SKILLS.promptBlock(spec.skills);
  const model = run.model || spec.model || null;
  const started = Date.now();
  const update = {};
  try {
    // FEAT-081: a spec with steps runs the sequential chain; an empty steps
    // list keeps the classic single tool-loop behavior byte-for-byte, so every
    // agent that exists today is unaffected.
    if (Array.isArray(spec.steps) && spec.steps.length) {
      const chain = await runAgentChain(spec, run, {
        system, schemas, impls, channel, model, workspace,
      });
      Object.assign(update, chain);
    } else {
      const { text, transcript, commitCache } = await agent.runAgent(
        system, [{ role: 'user', content: run.input }],
        schemas, impls, ENGINE, channel,
        { model, maxIterations: spec.max_iterations || undefined });
      const [action, verdict] = await applyOutputGuardrails(text, channel);
      let result = text;
      if (action === 'block') {
        result = 'Result withheld: it violated guardrail(s) ' +
                 verdict.hits.map((h) => h.guardrail).join(', ');
      } else if (action !== 'escalate' && commitCache) {
        await commitCache();
      }
      Object.assign(update, { status: 'done', result, transcript,
                              guardrails: verdict, finishedAt: new Date() });
    }
  } catch (e) {
    Object.assign(update, { status: 'failed', error: `${e.name || 'Error'}: ${e.message}`,
                            finishedAt: new Date() });
  }
  await run.update(update);
  logPrompt({
    channel: 'task', sessionId: runId,
    model: model || agent.BRAIN_MODEL,
    prompt: { agent: agentRow.name, input: run.input, origin: run.origin },
    response: { status: run.status, result: run.result, error: run.error },
    guardrails: run.guardrails, latencyMs: Date.now() - started,
  });
  return run;
}

// Enqueue an agent run on the Bull queue; if Redis is down, fall back to an
// in-process fire-and-forget run so the run still completes (queueTask twin).
async function queueAgentRun(runId) {
  try {
    initQueues();
    await queues.tasks.add('run-agent', { runId });
  } catch (e) {
    logger.warn('run-agent enqueue failed; running in-process', {
      runId, error: e.message,
    });
    runAgentRun(runId).catch((err) =>
      logger.error('in-process agent run failed', { runId, error: err.message }));
  }
}

// Owner-facing assistant chat: full tool access (session workspace, delegate,
// enabled custom tools) + selected skills; same guardrail flow as the
// customer channels, on channel 'chat'.
async function assistantChatTurn(sessionId, message, model = null,
                                 skillNames = null, userId = null) {
  let session = await ChatSession.findByPk(sessionId);
  if (!session) {
    session = await ChatSession.create({
      id: sessionId, channel: 'assistant', skills: [], model: null, userId,
    });
  }
  const patch = {};
  if (skillNames != null) patch.skills = skillNames;
  if (model) patch.model = model;
  if (Object.keys(patch).length) await session.update(patch);

  await appendMessage(sessionId, { role: 'user', content: message });

  const started = Date.now();
  let reply, status, verdicts;
  const vIn = await ENGINE.evaluate(message, 'input', 'chat');
  const modIn = await moderatorScreen(message, 'chat', sessionId);
  if (combinedAction(vIn.action, modIn) === 'block') {
    reply = BLOCKED_REPLY;
    status = 'blocked_input';
    verdicts = { input: vIn, ...(modIn && { moderation_input: modIn }) };
  } else {
    const history = await sessionHistory(sessionId, 'user');
    const workspace = path.join(WORKSPACES_DIR, sessionId);
    const [schemas, impls] = agent.taskTools(workspace, await TOOLS.agentTools());
    const system = await personaPrompt('assistant', agent.CHAT_SYSTEM) +
      await SKILLS.promptBlock(session.skills);
    const { text: draft, commitCache } = await agent.runAgent(
      system, history, schemas, impls, ENGINE, 'chat', { model: session.model });
    let [action, vOut] = await applyOutputGuardrails(draft, 'chat');
    const modOut = await moderatorScreen(draft, 'chat', sessionId);
    action = combinedAction(action, modOut);
    verdicts = { input: vIn, output: vOut,
                 ...(modIn && { moderation_input: modIn }),
                 ...(modOut && { moderation_output: modOut }) };
    if (action === 'block') {
      reply = BLOCKED_REPLY;
      status = 'blocked_output';
    } else if (action === 'escalate') {
      reply = HELD_REPLY;
      status = 'escalated_output';
      await Review.create({ id: newId('rev'), kind: 'assistant_reply',
                            sessionId, draft,
                            customerMessage: message, guardrails: vOut,
                            status: 'pending' });
    } else {
      reply = draft;
      status = 'sent';
      if (commitCache) await commitCache();
    }
  }
  await appendMessage(sessionId, { role: 'assistant', content: reply, status });
  logPrompt({
    channel: 'assistant', sessionId,
    model: session.model || agent.BRAIN_MODEL,
    prompt: { message }, response: { reply, status },
    guardrails: verdicts, latencyMs: Date.now() - started,
  });
  return { session_id: sessionId, reply, status,
           skills: session.skills, guardrails: verdicts };
}

async function csChatTurn(sessionId, message, userId = null) {
  let session = await ChatSession.findByPk(sessionId);
  if (!session) {
    session = await ChatSession.create({ id: sessionId, channel: 'cs', userId });
  }
  await appendMessage(sessionId, { role: 'customer', content: message });

  const started = Date.now();
  let reply, status;
  let guardrails = await ENGINE.evaluate(message, 'input', 'cs_chat');
  const vIn = guardrails;
  const modIn = await moderatorScreen(message, 'cs_chat', sessionId);
  const inAction = combinedAction(vIn.action, modIn);
  if (modIn) guardrails = { ...vIn, moderation_input: modIn };
  if (inAction === 'block') {
    reply = BLOCKED_REPLY;
    status = 'blocked_input';
  } else if (inAction === 'escalate') {
    reply = HELD_REPLY;
    status = 'escalated_input';
    await Review.create({ id: newId('rev'), kind: 'cs_chat_input',
                          sessionId, customerMessage: message,
                          guardrails: vIn, status: 'pending' });
  } else {
    const history = await sessionHistory(sessionId, 'customer');
    const [schemas, impls] = agent.csTools();
    const { text: draft, commitCache } = await agent.runAgent(
      agent.csSystemPrompt(await personaPrompt('cs', agent.CS_SYSTEM)),
      history, schemas, impls, ENGINE, 'cs_chat');
    let [action, vOut] = await applyOutputGuardrails(draft, 'cs_chat');
    const modOut = await moderatorScreen(draft, 'cs_chat', sessionId);
    action = combinedAction(action, modOut);
    if (action === 'block') {
      reply = BLOCKED_REPLY;
      status = 'blocked_output';
    } else if (action === 'escalate') {
      reply = HELD_REPLY;
      status = 'escalated_output';
      await Review.create({ id: newId('rev'), kind: 'cs_chat_reply',
                            sessionId, draft,
                            customerMessage: message, guardrails: vOut,
                            status: 'pending' });
    } else {
      reply = draft;
      status = 'sent';
      if (commitCache) await commitCache();
    }
    guardrails = { input: vIn, output: vOut,
                   ...(modIn && { moderation_input: modIn }),
                   ...(modOut && { moderation_output: modOut }) };
  }
  await appendMessage(sessionId, { role: 'agent', content: reply, status });
  logPrompt({
    channel: 'cs_chat', sessionId, model: agent.BRAIN_MODEL,
    prompt: { message }, response: { reply, status },
    guardrails, latencyMs: Date.now() - started,
  });
  return { session_id: sessionId, reply, status, guardrails };
}

async function csEmail(sender, subject, body, userId = null) {
  const started = Date.now();
  const mailId = newId('mail');
  const vIn = await ENGINE.evaluate(`${subject}\n\n${body}`, 'input', 'cs_email');
  const modIn = await moderatorScreen(`${subject}\n\n${body}`, 'cs_email', mailId);
  const entry = { id: mailId, toAddress: sender, subject: 'Re: ' + subject, userId };
  if (combinedAction(vIn.action, modIn) === 'block') {
    Object.assign(entry, {
      status: 'blocked',
      guardrails: modIn ? { ...vIn, moderation_input: modIn } : vIn,
    });
    logPrompt({
      channel: 'cs_email', sessionId: mailId, model: agent.BRAIN_MODEL,
      prompt: { from: sender, subject, body },
      response: { status: 'blocked' }, guardrails: entry.guardrails,
      latencyMs: Date.now() - started,
    });
    return (await OutboxEntry.create(entry)).get({ plain: true });
  }
  const [schemas, impls] = agent.csTools();
  const prompt = `Customer email from ${sender}\nSubject: ${subject}\n\n${body}\n\n` +
    'Write the reply email body (plain text, no subject line).';
  const { text: draft, commitCache } = await agent.runAgent(
    agent.csSystemPrompt(await personaPrompt('cs', agent.CS_SYSTEM)),
    [{ role: 'user', content: prompt }],
    schemas, impls, ENGINE, 'cs_email');
  let [action, vOut] = await applyOutputGuardrails(draft, 'cs_email');
  const modOut = await moderatorScreen(draft, 'cs_email', mailId);
  action = combinedAction(action, modOut);
  Object.assign(entry, { body: draft,
    guardrails: { input: vIn, output: vOut,
                  ...(modIn && { moderation_input: modIn }),
                  ...(modOut && { moderation_output: modOut }) } });
  if (action === 'block') {
    entry.status = 'blocked';
  } else if (action === 'escalate' || combinedAction(vIn.action, modIn) === 'escalate') {
    entry.status = 'pending_review';
    await Review.create({ id: newId('rev'), kind: 'cs_email', outboxId: mailId,
                          draft, guardrails: entry.guardrails,
                          status: 'pending' });
  } else {
    entry.status = 'sent';
    if (commitCache) await commitCache();
  }
  logPrompt({
    channel: 'cs_email', sessionId: mailId, model: agent.BRAIN_MODEL,
    prompt: { from: sender, subject, body },
    response: { reply: entry.body, status: entry.status },
    guardrails: entry.guardrails, latencyMs: Date.now() - started,
  });
  return (await OutboxEntry.create(entry)).get({ plain: true });
}

async function resolveReview(review, action, note, resolvedBy = null) {
  await review.update({
    status: action === 'approve' ? 'approved' : 'rejected',
    note: note ?? null,
    resolvedAt: new Date(),
    resolvedBy,
  });
  if (action === 'approve') {
    if (review.kind === 'cs_email') {
      const mail = await OutboxEntry.findByPk(review.outboxId);
      if (mail) await mail.update({ status: 'sent' });
    } else if (review.kind === 'cs_chat_reply' || review.kind === 'assistant_reply') {
      const role = review.kind === 'cs_chat_reply' ? 'agent' : 'assistant';
      const session = await ChatSession.findByPk(review.sessionId);
      if (session) {
        await appendMessage(session.id, {
          role, content: review.draft, status: 'sent_after_review',
        });
      }
    }
  }
  return review.get({ plain: true });
}

module.exports = {
  ENGINE, TOOLS, SKILLS,
  BLOCKED_REPLY, HELD_REPLY, WORKSPACES_DIR,
  combinedAction, moderatorScreen,
  runTask, queueTask, runAgentChain,
  runAgentRun, queueAgentRun,
  assistantChatTurn, csChatTurn, csEmail, resolveReview,
};
