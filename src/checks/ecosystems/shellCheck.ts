import * as path from 'path';
import { CheckResult } from '../../types';
import { runCommand } from '../../utils/process';
import { findingsFromLines, notConfigured, unavailable } from './parseHelpers';

export async function runShellChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  if (files.length === 0) {
    return [notConfigured('shell', 'Shell', 'shellcheck', 'No shell scripts in scope')];
  }
  const start = Date.now();
  const base = {
    id: 'shellcheck',
    name: 'ShellCheck',
    description: 'shellcheck on changed shell scripts',
  };
  const rels = files.map((f) => path.relative(workspaceRoot, f));
  const r = await runCommand('shellcheck', {
    cwd: workspaceRoot,
    args: ['-f', 'gcc', ...rels],
    timeoutMs: 120_000,
    signal,
  });
  if (r.code === null && /not found|ENOENT/i.test(r.stderr)) {
    return [unavailable(base.id, base.name, base.description, 'shellcheck not found on PATH (optional)')];
  }
  if (r.cancelled) {
    return [{ ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start }];
  }
  const findings = findingsFromLines(
    base.id,
    'lint',
    'warning',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    'ShellCheck',
    'Fix the shell script issue (important for deploy/CMS hooks).'
  );
  return [
    {
      ...base,
      status: r.code === 0 ? 'PASSED' : 'FAILED',
      findings,
      summary: r.code === 0 ? 'ShellCheck passed' : `${findings.length || 1} ShellCheck issue(s)`,
      durationMs: Date.now() - start,
    },
  ];
}
