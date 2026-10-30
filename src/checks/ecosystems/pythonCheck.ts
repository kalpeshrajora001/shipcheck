import * as path from 'path';
import { CheckResult } from '../../types';
import { resolveLocalBin, runCommand, fileExists } from '../../utils/process';
import { findingId, maskSecrets } from '../../utils/secrets';
import { findingsFromLines, notConfigured, unavailable } from './parseHelpers';

export async function runPythonChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  if (files.length === 0) {
    return [
      notConfigured('python', 'Python', 'Python lint/type/syntax', 'No Python files in scope'),
    ];
  }

  const results: CheckResult[] = [];
  results.push(await runPythonSyntax(workspaceRoot, files, signal));
  results.push(await runRuffOrFlake(workspaceRoot, files, signal));
  results.push(await runMypy(workspaceRoot, files, signal));
  return results;
}

async function runPythonSyntax(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'python-syntax',
    name: 'Python syntax',
    description: 'python -m py_compile on changed files',
  };
  const py = await runCommand('python3', {
    cwd: workspaceRoot,
    args: ['--version'],
    timeoutMs: 10_000,
    signal,
  });
  const bin = py.code === 0 ? 'python3' : 'python';
  if (py.code !== 0) {
    const py2 = await runCommand('python', {
      cwd: workspaceRoot,
      args: ['--version'],
      timeoutMs: 10_000,
      signal,
    });
    if (py2.code !== 0) {
      return unavailable(base.id, base.name, base.description, 'python/python3 not found on PATH');
    }
  }

  const findings = [];
  for (const file of files) {
    if (signal?.aborted) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    const rel = path.relative(workspaceRoot, file).replace(/\\/g, '/');
    const r = await runCommand(bin, {
      cwd: workspaceRoot,
      args: ['-m', 'py_compile', rel],
      timeoutMs: 60_000,
      signal,
    });
    if (r.cancelled) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    if (r.code !== 0) {
      const msg = maskSecrets((r.stderr || r.stdout).trim().slice(0, 400));
      const m = /line (\d+)/i.exec(msg);
      findings.push({
        id: findingId(base.id, rel, m ? Number(m[1]) : undefined, 'py-syntax'),
        kind: 'syntax' as const,
        severity: 'error' as const,
        title: 'Python syntax error',
        message: msg || 'py_compile failed',
        filePath: rel,
        line: m ? Number(m[1]) : undefined,
        suggestion: 'Fix the syntax error before committing.',
        checkId: base.id,
      });
    }
  }
  return {
    ...base,
    status: findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary: findings.length ? `${findings.length} syntax issue(s)` : `Compiled ${files.length} file(s)`,
    durationMs: Date.now() - start,
  };
}

async function runRuffOrFlake(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'python-lint',
    name: 'Python lint',
    description: 'Ruff or Flake8 when available',
  };
  const ruff = resolveLocalBin(workspaceRoot, 'ruff') || 'ruff';
  const flake = resolveLocalBin(workspaceRoot, 'flake8') || 'flake8';
  const rels = files.map((f) => path.relative(workspaceRoot, f));

  const ruffTry = await runCommand(ruff, {
    cwd: workspaceRoot,
    args: ['check', ...rels, '--output-format', 'concise'],
    timeoutMs: 120_000,
    signal,
  });
  if (!ruffTry.stderr.includes('ENOENT') && ruffTry.code !== null) {
    if (ruffTry.cancelled) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    const findings = findingsFromLines(
      base.id,
      'lint',
      'error',
      workspaceRoot,
      `${ruffTry.stdout}\n${ruffTry.stderr}`,
      'Ruff',
      'Fix the Ruff finding or adjust the rule.'
    );
    return {
      ...base,
      status: ruffTry.code === 0 ? 'PASSED' : 'FAILED',
      findings,
      summary: ruffTry.code === 0 ? 'Ruff passed' : `${findings.length || 1} Ruff issue(s)`,
      durationMs: Date.now() - start,
    };
  }

  const flakeTry = await runCommand(flake, {
    cwd: workspaceRoot,
    args: [...rels],
    timeoutMs: 120_000,
    signal,
  });
  if (flakeTry.code === null && /not found|ENOENT/i.test(flakeTry.stderr)) {
    return unavailable(base.id, base.name, base.description, 'Neither ruff nor flake8 found');
  }
  if (flakeTry.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const findings = findingsFromLines(
    base.id,
    'lint',
    'error',
    workspaceRoot,
    `${flakeTry.stdout}\n${flakeTry.stderr}`,
    'Flake8',
    'Fix the Flake8 finding or adjust the rule.'
  );
  return {
    ...base,
    status: flakeTry.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: flakeTry.code === 0 ? 'Flake8 passed' : `${findings.length || 1} Flake8 issue(s)`,
    durationMs: Date.now() - start,
  };
}

async function runMypy(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'python-types',
    name: 'Python types (mypy)',
    description: 'mypy when configured/installed',
  };
  const configured =
    fileExists(path.join(workspaceRoot, 'mypy.ini')) ||
    fileExists(path.join(workspaceRoot, '.mypy.ini')) ||
    fileExists(path.join(workspaceRoot, 'pyproject.toml'));
  const bin = resolveLocalBin(workspaceRoot, 'mypy') || 'mypy';
  const rels = files.map((f) => path.relative(workspaceRoot, f));
  const r = await runCommand(bin, {
    cwd: workspaceRoot,
    args: [...rels],
    timeoutMs: 180_000,
    signal,
  });
  if (r.code === null && /not found|ENOENT/i.test(r.stderr)) {
    return unavailable(base.id, base.name, base.description, 'mypy not found');
  }
  if (!configured && r.code !== 0 && /No.*files|usage:/i.test(r.stderr + r.stdout)) {
    return notConfigured(base.id, base.name, base.description, 'mypy not clearly configured');
  }
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const findings = findingsFromLines(
    base.id,
    'type',
    'error',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    'mypy',
    'Fix the type error or adjust typing.'
  );
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'mypy passed' : `${findings.length || 1} mypy issue(s)`,
    durationMs: Date.now() - start,
  };
}
