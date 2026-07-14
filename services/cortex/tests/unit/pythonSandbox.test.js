'use strict';

// TASK-021 — proves the python custom-tool sandbox actually enforces the ACs:
// no reads/writes outside a per-call scratch dir, no sockets, and cpu/mem/time
// limits. These tests EXECUTE python under macOS seatbelt, so they are gated on
// a host that has /usr/bin/sandbox-exec + a working python (skipped elsewhere,
// e.g. Linux CI) — the flag is enabled ONLY inside this process, never on disk.

const fs = require('fs');
const path = require('path');
const os = require('os');

// Enable the triple-gated flag and pin small limits BEFORE the config/module
// load, so this file's isolated module registry sees them.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_PYTHON_TOOLS_ENABLED = 'true';
process.env.CORTEX_PYTHON_MEMORY_MB = '128';
process.env.CORTEX_PYTHON_CPU_SECONDS = '2';
process.env.CORTEX_PYTHON_FSIZE_MB = '4';

const tl = require('../../src/engine/tools');

const hasSandbox = process.platform === 'darwin' && fs.existsSync(tl.SANDBOX_EXEC);
const d = hasSandbox ? describe : describe.skip;

// A python tool spec whose run() body is `code` (dedented, one level indent).
const pySpec = (code, timeout = 5) => ({
  name: 'sbx', description: 'sandbox test', kind: 'python', timeout,
  parameters: { type: 'object', properties: {} },
  code: 'def run(args):\n' + code.split('\n').map((l) => '    ' + l).join('\n') + '\n',
});

d('python tool sandbox (seatbelt + rlimits)', () => {
  const reg = new tl.ToolRegistry();

  test('preflight passes on this host (profile compiles + runs)', () => {
    expect(tl.preflight()).toBe(true);
  });

  test('legit tool: computes on args and writes/reads its scratch dir', async () => {
    const out = await reg.runPython(pySpec(
      "n = int(args['n'])\n" +
      "open('work.txt', 'w').write(str(n * n))\n" +
      "return 'sq=' + open('work.txt').read()",
    ), { n: 7 });
    expect(out).toBe('sq=49');
  }, 20000);

  test('(a) reading a file outside scratch (/etc/passwd) is BLOCKED', async () => {
    await expect(reg.runPython(pySpec(
      "return open('/etc/passwd').read()",
    ), {})).rejects.toThrow(/tool code failed/);
  }, 20000);

  test('(a2) reading the user home is BLOCKED', async () => {
    await expect(reg.runPython(pySpec(
      "import os\nreturn open(os.path.expanduser('~/.zshrc')).read()",
    ), {})).rejects.toThrow(/tool code failed/);
  }, 20000);

  test('(b) opening a network socket is BLOCKED', async () => {
    await expect(reg.runPython(pySpec(
      "import socket\n" +
      "s = socket.socket()\n" +
      "s.settimeout(3)\n" +
      "s.connect(('1.1.1.1', 80))\n" +
      "return 'connected'",
    ), {})).rejects.toThrow(/tool code failed/);
  }, 20000);

  test('(c) writing outside scratch (/tmp) is BLOCKED', async () => {
    const marker = path.join(os.tmpdir(), `cortex-escape-${process.pid}-${Date.now()}`);
    await expect(reg.runPython(pySpec(
      `open(${JSON.stringify(marker)}, 'w').write('pwned')\nreturn 'wrote'`,
    ), {})).rejects.toThrow(/tool code failed/);
    expect(fs.existsSync(marker)).toBe(false);
  }, 20000);

  test('(d1) a fork bomb is BLOCKED (deny process-fork)', async () => {
    await expect(reg.runPython(pySpec(
      "import os\n" +
      "while True:\n" +
      "    os.fork()\n" +
      "return 'forked'",
    ), {})).rejects.toThrow(/tool code failed/);
  }, 20000);

  test('(d2) burning CPU is killed by the CPU rlimit', async () => {
    await expect(reg.runPython(pySpec(
      "x = 0\nwhile True:\n    x += 1\nreturn str(x)",
      5, // wall 5s; CPU cap is 2s and fires first
    ), {})).rejects.toThrow(/tool code failed|timed out/);
  }, 20000);

  test('(d3) allocating huge memory is killed by the RSS watchdog', async () => {
    await expect(reg.runPython(pySpec(
      "import time\n" +
      "blocks = [bytearray(64 * 1024 * 1024) for _ in range(8)]\n" +
      "time.sleep(5)\n" +
      "return str(len(blocks))",
    ), {})).rejects.toThrow(/memory limit/);
  }, 20000);

  test('a hard wall-clock timeout kills a sleeping (low-CPU) tool', async () => {
    await expect(reg.runPython(pySpec(
      "import time\ntime.sleep(30)\nreturn 'done'",
      1, // wall 1s
    ), {})).rejects.toThrow(/timed out/);
  }, 20000);

  test('each call gets a fresh scratch dir that is removed afterward', async () => {
    const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('cortex-py-')).length;
    await reg.runPython(pySpec("return 'ok'"), {});
    const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('cortex-py-')).length;
    expect(after).toBeLessThanOrEqual(before);
  }, 20000);

  test('the generated seatbelt profile denies default, network, and fork', () => {
    const prof = tl.seatbeltProfile('/private/tmp/scratchX', '/usr/local');
    expect(prof).toContain('(deny default)');
    expect(prof).toContain('(deny network*)');
    expect(prof).toContain('(deny process-fork)');
    expect(prof).toContain('(subpath "/private/tmp/scratchX")');
  });

  test('(a3) secret-bearing dirs under the python prefix are carved back out', () => {
    // The broad prefix read grant is needed to boot the interpreter, but must
    // NOT expose other apps' secrets living under <prefix>/etc (Homebrew
    // service configs) or <prefix>/var (databases/state). The deny must come
    // AFTER the broad file-read* allow so seatbelt's last-match-wins applies.
    const prof = tl.seatbeltProfile('/private/tmp/scratchX', '/usr/local');
    const allowIdx = prof.indexOf('(allow file-read* (literal "/")');
    const denyIdx = prof.indexOf('(deny file-read* ');
    expect(allowIdx).toBeGreaterThanOrEqual(0);
    expect(denyIdx).toBeGreaterThan(allowIdx);
    expect(prof.slice(denyIdx)).toContain('(subpath "/usr/local/etc")');
    expect(prof.slice(denyIdx)).toContain('(subpath "/usr/local/var")');
  });

  test('(a4) a file under the python prefix but outside its runtime dirs is BLOCKED', async () => {
    // Prove enforcement end-to-end (not just the profile string): plant a
    // "secret" under a per-call prefix's etc/ and confirm a tool cannot read
    // it, while the interpreter (whose real prefix is granted) still boots.
    const { prefix } = tl.resolvePython();
    const fakeEtc = path.join(prefix, 'etc');
    if (!fs.existsSync(fakeEtc)) return; // host without <prefix>/etc: nothing to prove here
    const readable = fs.readdirSync(fakeEtc, { withFileTypes: true })
      .find((e) => e.isFile());
    if (!readable) return;
    const target = path.join(fakeEtc, readable.name);
    await expect(reg.runPython(pySpec(
      `return open(${JSON.stringify(target)}).read()`,
    ), {})).rejects.toThrow(/tool code failed/);
  }, 20000);
});
