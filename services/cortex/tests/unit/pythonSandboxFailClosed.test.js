'use strict';

// TASK-021 — fail-closed: even with the python-tools flag ENABLED, if the
// sandbox can't be established (interpreter/profile preflight fails, or
// sandbox-exec is absent) the tool REFUSES to run — it never falls back to
// unsandboxed python. Isolated in its own file so its pinned env (a bogus
// interpreter) doesn't affect the real sandbox suite.

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_PYTHON_TOOLS_ENABLED = 'true';
process.env.CORTEX_PYTHON_BIN = '/nonexistent/definitely/not/python';

const tl = require('../../src/engine/tools');

describe('python tool sandbox — fail closed', () => {
  const reg = new tl.ToolRegistry();
  const spec = {
    name: 'x', description: 'd', kind: 'python', timeout: 5,
    parameters: { type: 'object', properties: {} },
    code: 'def run(args):\n    return "should-never-run"\n',
  };

  test('preflight fails when the interpreter/sandbox cannot be established', () => {
    // On macOS this exercises a real preflight failure (bad interpreter);
    // off-macOS the platform guard makes preflight false anyway.
    expect(tl.preflight()).toBe(false);
  });

  test('runPython refuses (fail-closed) instead of running unsandboxed', async () => {
    await expect(reg.runPython(spec, {}))
      .rejects.toThrow(/fail-closed/);
  });
});
