import * as path from 'path';
import { CheckResult } from '../../types';
import { runCommand } from '../../utils/process';
import { findingId, maskSecrets } from '../../utils/secrets';
import { findingsFromLines, notConfigured, unavailable } from './parseHelpers';

export async function runRubyChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  if (files.length === 0) {
    return [notConfigured('ruby', 'Ruby', 'ruby -c / rubocop', 'No Ruby files in scope')];
  }
  const ver = await runCommand('ruby', {
    cwd: workspaceRoot,
    args: ['-v'],
    timeoutMs: 15_000,
    signal,
  });
  if (ver.code !== 0) {
    return [unavailable('ruby', 'Ruby', 'Ruby tooling', 'ruby not found on PATH')];
  }
  return [await rubySyntax(workspaceRoot, files, signal), await rubocop(workspaceRoot, files, signal)];
}

async function rubySyntax(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = { id: 'ruby-syntax', name: 'Ruby syntax', description: 'ruby -c on changed files' };
  const findings = [];
  for (const file of files) {
    if (signal?.aborted) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    const rel = path.relative(workspaceRoot, file).replace(/\\/g, '/');
    const r = await runCommand('ruby', {
      cwd: workspaceRoot,
      args: ['-c', rel],
      timeoutMs: 60_000,
      signal,
    });
    if (r.cancelled) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    if (r.code !== 0) {
      const msg = maskSecrets((r.stderr || r.stdout).trim().slice(0, 400));
      const m = /:(\d+):/.exec(msg);
      findings.push({
        id: findingId(base.id, rel, m ? Number(m[1]) : undefined, 'ruby-c'),
        kind: 'syntax' as const,
        severity: 'error' as const,
        title: 'Ruby syntax error',
        message: msg || 'ruby -c failed',
        filePath: rel,
        line: m ? Number(m[1]) : undefined,
        suggestion: 'Fix the Ruby syntax error before committing.',
        checkId: base.id,
      });
    }
  }
  return {
    ...base,
    status: findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary: findings.length ? `${findings.length} syntax issue(s)` : `ruby -c clean on ${files.length} file(s)`,
    durationMs: Date.now() - start,
  };
}

async function rubocop(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = { id: 'rubocop', name: 'RuboCop', description: 'RuboCop when available (read-only)' };
  const rels = files.map((f) => path.relative(workspaceRoot, f));
  const r = await runCommand('rubocop', {
    cwd: workspaceRoot,
    args: [...rels, '--format', 'clang'],
    timeoutMs: 180_000,
    signal,
  });
  if (r.code === null && /not found|ENOENT/i.test(r.stderr)) {
    return unavailable(base.id, base.name, base.description, 'rubocop not found (optional)');
  }
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const findings = findingsFromLines(
    base.id,
    'lint',
    'error',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    'RuboCop',
    'Fix the RuboCop offense or disable the rule intentionally.'
  );
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'RuboCop passed' : `${findings.length || 1} RuboCop offense(s)`,
    durationMs: Date.now() - start,
  };
}
