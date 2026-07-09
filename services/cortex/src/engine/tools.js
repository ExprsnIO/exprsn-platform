'use strict';

/**
 * Custom tool registry + builder (port of the MacOS LLM service's
 * agents/tools.js), storage moved from disk JSON to the cortex.tools table.
 *
 * A tool is a spec that agents can call through the normal tool-calling loop
 * (so every invocation is still screened by the guardrail engine first). Two
 * kinds:
 *
 *     http    — a parameterized HTTP request template
 *     python  — a Python function run in an isolated subprocess with a timeout
 *
 * Same lifecycle as guardrails: specs save disabled by default, the test
 * suite must pass before a tool can be enabled, and the *builder* drafts a
 * spec (with tests) from a plain-English description using the brain model.
 *
 * Platform hardening on top of the source:
 *  - python execution is ARBITRARY CODE EXECUTION on this host, so it is
 *    hard-gated behind CORTEX_PYTHON_TOOLS_ENABLED (default false);
 *  - http templates are SSRF-capable, so targets resolving to loopback or
 *    private ranges are rejected unless CORTEX_TOOL_ALLOW_PRIVATE_HOSTS.
 */

const { spawn } = require('child_process');
const dns = require('dns').promises;
const net = require('net');
const config = require('../config');
const { Tool } = require('../models');
const { namedError, pyDumps } = require('./agent');
const { compilePyRegex } = require('./guardrails');

const KINDS = ['http', 'python'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
const MAX_RESULT = 16000; // chars returned to the model
const DEFAULT_TIMEOUT = 10; // seconds
const MAX_TIMEOUT = 120;
const MAX_REDIRECTS = 5;

const PLACEHOLDER = /\{(\w+)\}/g;
const NAME_RE = /^[\w-]{1,64}$/;
const pyTuple = (arr) => '(' + arr.map((v) => `'${v}'`).join(', ') + ')';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- validation

// All {param} names referenced by an http spec's template.
function placeholders(spec) {
  const req = spec.request || {};
  const hay = [req.url ?? ''];
  hay.push(...Object.values(req.headers || {}));
  const body = req.body;
  if (typeof body === 'string') hay.push(body);
  else if (isObj(body)) hay.push(...Object.values(body).filter((v) => typeof v === 'string'));
  const names = new Set();
  for (const h of hay) {
    for (const m of String(h).matchAll(PLACEHOLDER)) names.add(m[1]);
  }
  return names;
}

// Return a list of problems; empty list means the spec is valid.
function validateSpec(spec) {
  const problems = [];
  if (!NAME_RE.test(String(spec.name ?? ''))) {
    problems.push('name: letters, digits, _ - only (max 64)');
  }
  if (!String(spec.description ?? '').trim()) {
    problems.push('description required (the model reads it)');
  }
  if (!KINDS.includes(spec.kind)) {
    problems.push(`kind must be one of ${pyTuple(KINDS)}`);
  }

  const params = spec.parameters;
  let props = {};
  if (!isObj(params) || params.type !== 'object' || !isObj(params.properties)) {
    problems.push('parameters must be {"type":"object","properties":{...}}');
  } else {
    props = params.properties;
    for (const r of params.required ?? []) {
      if (!(r in props)) problems.push(`required parameter '${r}' not in properties`);
    }
  }

  if (spec.kind === 'python') {
    const code = spec.code || '';
    if (!code.includes('def run(')) {
      problems.push('python tool: code must define run(args)');
    }
    const t = spec.timeout ?? DEFAULT_TIMEOUT;
    if (!Number.isInteger(t) || t < 1 || t > MAX_TIMEOUT) {
      problems.push(`timeout must be an integer 1..${MAX_TIMEOUT}`);
    }
  } else if (spec.kind === 'http') {
    const req = spec.request;
    if (!isObj(req)) {
      problems.push("http tool: 'request' object required");
    } else {
      if (!HTTP_METHODS.includes(req.method ?? 'GET')) {
        problems.push(`request.method must be one of ${pyTuple(HTTP_METHODS)}`);
      }
      const url = req.url ?? '';
      if (!/^https?:\/\//.test(url)) {
        problems.push('request.url must start with http:// or https://');
      }
      const unknown = [...placeholders(spec)].filter((n) => !(n in props));
      if (unknown.length) {
        problems.push('placeholders with no matching parameter: ' + unknown.sort().join(', '));
      }
    }
  }

  (spec.tests ?? []).forEach((t, i) => {
    if (!isObj(t.args)) problems.push(`test ${i}: needs 'args' object`);
    if (!['expect_contains', 'expect_regex', 'expect_error'].some((k) => k in t)) {
      problems.push(`test ${i}: needs expect_contains, expect_regex, or expect_error`);
    }
    if ('expect_regex' in t) {
      try {
        compilePyRegex(t.expect_regex);
      } catch (e) {
        problems.push(`test ${i}: bad expect_regex: ${e.message}`);
      }
    }
  });
  return problems;
}

// ---------------------------------------------------------------- execution

const PY_RUNNER = 'import json, sys\n' +
'payload = json.load(sys.stdin)\n' +
'ns = {}\n' +
'exec(payload["code"], ns)\n' +
'result = ns["run"](payload["args"])\n' +
'sys.stdout.write(result if isinstance(result, str) else json.dumps(result))\n';

// URL-encode like Python's urllib.parse.quote(val, safe="").
function pyQuote(val) {
  return encodeURIComponent(val).replace(/[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function substitute(template, args, quote = false) {
  return String(template).replace(PLACEHOLDER, (_, name) => {
    const val = String(args[name] ?? '');
    return quote ? pyQuote(val) : val;
  });
}

function privateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 ||
         (a === 100 && b >= 64 && b <= 127) ||
         (a === 169 && b === 254) ||
         (a === 172 && b >= 16 && b <= 31) ||
         (a === 192 && b === 168);
}

function privateIp(ip) {
  if (net.isIPv4(ip)) return privateIPv4(ip);
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) {
    const mapped = v6.slice(7);
    if (net.isIPv4(mapped)) return privateIPv4(mapped);
  }
  return v6 === '::1' || v6 === '::' ||
         v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') ||
         v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

// SSRF guard for http-kind tools: reject targets that resolve to loopback or
// private ranges unless CORTEX_TOOL_ALLOW_PRIVATE_HOSTS (dev) is set.
async function assertPublicHost(url) {
  if (config.cortex.toolAllowPrivateHosts) return;
  // URL keeps IPv6 literals bracketed ([::1]); strip for isIP/lookup.
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '');
  let addrs;
  if (net.isIP(hostname)) {
    addrs = [hostname];
  } else {
    try {
      addrs = (await dns.lookup(hostname, { all: true })).map((a) => a.address);
    } catch {
      throw namedError('ValueError', `cannot resolve host: ${hostname}`);
    }
  }
  if (addrs.some(privateIp)) {
    throw namedError('PermissionError',
      `tool target ${hostname} resolves to a private/loopback address ` +
      '(set CORTEX_TOOL_ALLOW_PRIVATE_HOSTS=true to allow in dev)');
  }
}

function runProcess(cmd, argv, input, timeoutSec) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutSec * 1000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(namedError('TimeoutExpired',
          `Command '${cmd} ${argv[0]} ${argv[1]} ...' timed out after ${timeoutSec} seconds`));
      } else {
        resolve({ code, stdout, stderr });
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

// Read up to capBytes of a fetch Response body, decoded utf-8 with
// replacement (mirrors resp.read(n).decode("utf-8", "replace")).
async function readCapped(res, capBytes) {
  if (!res.body) return '';
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of res.body) {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= capBytes) break;
    }
  } finally {
    try {
      await res.body.cancel();
    } catch {
      /* already consumed/released */
    }
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks).subarray(0, capBytes));
}

// DB row -> plain spec object (same shape as the source JSON files).
function rowToSpec(row) {
  return {
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    kind: row.kind,
    parameters: row.parameters,
    ...(row.code != null && { code: row.code }),
    ...(row.request != null && { request: row.request }),
    timeout: row.timeout,
    tests: row.tests ?? [],
    ...(row.builtFrom != null && { built_from: row.builtFrom }),
  };
}

class ToolRegistry {
  // -- storage (mirrors GuardrailEngine) --------------------------------------

  async loadAll() {
    const rows = await Tool.findAll({ order: [['name', 'ASC']] });
    return rows.map(rowToSpec);
  }

  async get(name) {
    if (!NAME_RE.test(String(name ?? ''))) return null;
    const row = await Tool.findOne({ where: { name } });
    return row ? rowToSpec(row) : null;
  }

  async save(spec, userId = null) {
    const problems = validateSpec(spec);
    if (problems.length) throw namedError('ValueError', problems.join('; '));
    const values = {
      name: spec.name,
      description: spec.description,
      enabled: Boolean(spec.enabled),
      kind: spec.kind,
      parameters: spec.parameters,
      code: spec.code ?? null,
      request: spec.request ?? null,
      timeout: spec.timeout ?? DEFAULT_TIMEOUT,
      tests: spec.tests ?? [],
      builtFrom: spec.built_from ?? null,
    };
    const existing = await Tool.findOne({ where: { name: spec.name } });
    if (existing) await existing.update(values);
    else await Tool.create({ ...values, createdBy: userId });
    return spec;
  }

  async delete(name) {
    await Tool.destroy({ where: { name } });
  }

  // -- execution --------------------------------------------------------------

  // Execute the tool. Resolves to result text; rejects on failure.
  async run(spec, args) {
    args = args || {};
    const missing = ((spec.parameters || {}).required ?? []).filter((r) => !(r in args));
    if (missing.length) {
      throw namedError('ValueError', 'missing required argument(s): ' + missing.join(', '));
    }
    if (spec.kind === 'python') return this.runPython(spec, args);
    return this.runHttp(spec, args);
  }

  async runPython(spec, args) {
    if (!config.cortex.pythonToolsEnabled) {
      throw namedError('PermissionError',
        'python tools are disabled on this deployment (CORTEX_PYTHON_TOOLS_ENABLED)');
    }
    const proc = await runProcess(
      'python3', ['-I', '-c', PY_RUNNER],
      JSON.stringify({ code: spec.code, args }),
      spec.timeout ?? DEFAULT_TIMEOUT,
    );
    if (proc.code !== 0) {
      const tail = (proc.stderr || '').trim().split('\n').slice(-3);
      throw namedError('RuntimeError', 'tool code failed: ' + tail.join(' | '));
    }
    return proc.stdout.slice(0, MAX_RESULT);
  }

  async runHttp(spec, args) {
    const reqT = spec.request;
    let url = substitute(reqT.url, args, true);
    const headers = {};
    for (const [k, v] of Object.entries(reqT.headers || {})) {
      headers[k] = substitute(v, args);
    }
    const body = reqT.body;
    let data = null;
    if (isObj(body)) {
      data = pyDumps(Object.fromEntries(Object.entries(body).map(
        ([k, v]) => [k, typeof v === 'string' ? substitute(v, args) : v])));
      if (!('Content-Type' in headers)) headers['Content-Type'] = 'application/json';
    } else if (typeof body === 'string') {
      data = substitute(body, args);
    }
    let method = reqT.method || 'GET';
    const timeout = (spec.timeout ?? DEFAULT_TIMEOUT) || DEFAULT_TIMEOUT;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout * 1000);
    try {
      // Redirects are followed manually so EVERY hop passes the public-host
      // check — with fetch's default follow, a public host could 302 to a
      // loopback/private address and bypass the SSRF guard.
      for (let hop = 0; ; hop++) {
        if (!/^https?:\/\//.test(url)) {
          throw namedError('ValueError',
            hop === 0 ? 'substituted URL lost its http(s) scheme'
                      : `redirect left http(s): ${url.slice(0, 100)}`);
        }
        await assertPublicHost(url);
        const res = await fetch(url, {
          method,
          headers,
          // fetch forbids bodies on GET/HEAD; those combinations are nonsensical
          // for a request template anyway.
          body: data != null && !['GET', 'HEAD'].includes(method) ? data : undefined,
          signal: ctl.signal,
          redirect: 'manual',
        });
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const loc = res.headers.get('location');
          try {
            await res.body?.cancel();
          } catch { /* already released */ }
          if (!loc) {
            throw namedError('RuntimeError', `HTTP ${res.status}: redirect with no Location`);
          }
          if (hop >= MAX_REDIRECTS) {
            throw namedError('RuntimeError', `too many redirects (>${MAX_REDIRECTS})`);
          }
          url = new URL(loc, url).toString();
          if (res.status === 303 || (res.status !== 307 && res.status !== 308 && method !== 'GET' && method !== 'HEAD')) {
            method = 'GET';
            data = null;
          }
          continue;
        }
        if (res.status >= 400) {
          const payload = await readCapped(res, 2000);
          throw namedError('RuntimeError', `HTTP ${res.status}: ${payload.slice(0, 500)}`);
        }
        return (await readCapped(res, 4 * MAX_RESULT)).slice(0, MAX_RESULT);
      }
    } finally {
      clearTimeout(t);
    }
  }

  // -- testing ----------------------------------------------------------------

  // Run the spec's test cases (regardless of enabled state).
  async runTests(spec) {
    const results = [];
    for (const testCase of spec.tests ?? []) {
      const entry = { args: testCase.args };
      let out = '';
      let errored = false;
      try {
        out = await this.run(spec, testCase.args);
        entry.output = out.slice(0, 500);
      } catch (e) {
        entry.error = `${e.name || 'Error'}: ${e.message}`.slice(0, 500);
        out = '';
        errored = true;
      }
      if ('expect_error' in testCase) {
        entry.ok = errored === Boolean(testCase.expect_error);
      } else if (errored) {
        entry.ok = false;
      } else if ('expect_regex' in testCase) {
        entry.ok = compilePyRegex(testCase.expect_regex).test(out);
      } else {
        entry.ok = out.includes(testCase.expect_contains);
      }
      results.push(entry);
    }
    return {
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  // -- agent wiring -------------------------------------------------------------

  // OpenAI-style function schema for the agent loop.
  schemaFor(spec) {
    return { type: 'function', function: {
      name: spec.name.replace(/-/g, '_'),
      description: spec.description,
      parameters: spec.parameters } };
  }

  // [schemas, impls] for enabled custom tools.
  //
  // names=null -> all enabled tools; otherwise the enabled subset of `names`.
  // Function names swap - for _ (tool-call-safe identifiers).
  async agentTools(names = null) {
    const schemas = [];
    const impls = {};
    for (const spec of await this.loadAll()) {
      if (!spec.enabled) continue;
      if (names != null && !names.includes(spec.name)) continue;
      schemas.push(this.schemaFor(spec));
      impls[spec.name.replace(/-/g, '_')] = (args) => this.run(spec, args);
    }
    return [schemas, impls];
  }
}

// ---------------------------------------------------------------- builder

const BUILDER_SYSTEM = 'You write tool specifications for a local AI agent ' +
'system. Given a description of what the tool should do, produce ONE JSON ' +
'object (no markdown, no commentary) with exactly these fields:\n' +
'\n' +
'name: short-kebab-case-slug\n' +
'description: one sentence written for the AI model that will call the tool\n' +
'kind: "python" (compute something locally) or "http" (call a web API)\n' +
'parameters: JSON schema: {"type":"object","required":[...],"properties":' +
'{"<arg>":{"type":"string|number|integer|boolean","description":"..."}}}\n' +
'timeout: integer seconds (default 10)\n' +
'\n' +
'For kind "python" add:\n' +
'code: a string defining `def run(args):` where args is a dict of the ' +
'parameters; return a short string result. Standard library only. No file or ' +
'network access unless the description explicitly asks for it.\n' +
'\n' +
'For kind "http" add:\n' +
'request: {"method":"GET|POST|...","url":"https://... with {param} ' +
'placeholders","headers":{...},"body":null or {...} or "string"} — every ' +
'{param} placeholder must be a declared parameter.\n' +
'\n' +
'tests: 2-5 cases {"args":{...}, "expect_contains":"..."} (or ' +
'"expect_regex", or "expect_error": true for invalid input). Tests must be ' +
'consistent with the implementation: each expectation must actually hold. ' +
'For http tools whose live response you cannot know, prefer a single ' +
'expect_error test with an unreachable placeholder value only if the API is ' +
'private; otherwise test against stable response fragments.\n' +
'\n' +
'Return only the JSON object.';

// Repair the structural near-misses models commonly emit.
function normalize(spec) {
  const p = spec.parameters;
  if (p == null || (isObj(p) && !Object.keys(p).length)) {
    spec.parameters = { type: 'object', properties: {} };
  } else if (isObj(p) && p.type !== 'object') {
    // bare {arg: schema} map instead of a JSON-schema object
    if (Object.values(p).every(isObj)) {
      spec.parameters = { type: 'object', properties: p };
    }
  } else if (isObj(p) && !isObj(p.properties)) {
    spec.parameters = { type: 'object', properties: {} };
  }
  if (typeof spec.timeout === 'string' && /^\d+$/.test(spec.timeout)) {
    spec.timeout = parseInt(spec.timeout, 10);
  }
  if (typeof spec.timeout === 'number' && !Number.isInteger(spec.timeout)) {
    spec.timeout = Math.trunc(spec.timeout);
  }
  return spec;
}

function parseDraft(raw, description, name, kind) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return { spec: null, problems: ['model returned no JSON object'] };
  let spec;
  try {
    spec = JSON.parse(m[0]);
  } catch (e) {
    return { spec: null, problems: [`model returned invalid JSON: ${e.message}`] };
  }
  if (name) spec.name = name;
  if (kind) spec.kind = kind;
  spec = normalize(spec);
  spec.enabled = false;
  spec.built_from = description;
  return { spec, problems: validateSpec(spec) };
}

// Draft a tool spec from a natural-language description.
//
// chatFn(system, user) -> Promise<assistant text> (the brain model).
// One self-repair round: if the draft fails validation, the model gets the
// problem list back and corrects it. Returns { spec, problems }; the caller
// always saves the spec DISABLED.
async function buildSpec(description, chatFn, { name = null, kind = null } = {}) {
  let user = `Tool: ${description}`;
  if (name) user += `\nUse name: "${name}"`;
  if (kind) user += `\nUse kind: "${kind}"`;
  const raw = await chatFn(BUILDER_SYSTEM, user);
  const first = parseDraft(raw, description, name, kind);
  if (!first.problems.length) return first;
  const repair = user + '\n\nYour previous draft:\n' + String(raw || '').slice(0, 4000) +
    '\n\nIt has these problems:\n- ' + first.problems.join('\n- ') +
    '\n\nReturn the corrected JSON object only.';
  const second = parseDraft(await chatFn(BUILDER_SYSTEM, repair), description, name, kind);
  return second.spec && !second.problems.length ? second : first;
}

module.exports = { KINDS, HTTP_METHODS, validateSpec, substitute, pyQuote, assertPublicHost, ToolRegistry, buildSpec };
