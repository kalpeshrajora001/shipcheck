import * as path from 'path';
import { CheckResult } from '../../types';
import { runCommand, fileExists } from '../../utils/process';
import { findingId, maskSecrets } from '../../utils/secrets';
import { findingsFromLines, notConfigured, unavailable } from './parseHelpers';

export async function runGoChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  if (files.length === 0) {
    return [notConfigured('go', 'Go', 'Go vet/fmt/test', 'No Go files in scope')];
  }
  const hasMod = fileExists(path.join(workspaceRoot, 'go.mod'));
  const ver = await runCommand('go', {
    cwd: workspaceRoot,
    args: ['version'],
    timeoutMs: 15_000,
    signal,
  });
  if (ver.code !== 0) {
    return [unavailable('go', 'Go', 'Go tooling', 'go not found on PATH')];
  }

  const results: CheckResult[] = [];
  results.push(await goVet(workspaceRoot, files, signal));
  results.push(await goFmt(workspaceRoot, files, signal));
  if (hasMod) {
    results.push(await goBuild(workspaceRoot, signal));
  }
  return results;
}

async function goVet(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = { id: 'go-vet', name: 'Go vet', description: 'go vet on changed packages' };
  const pkgs = [...new Set(files.map((f) => './' + path.dirname(path.relative(workspaceRoot, f)).replace(/\\/g, '/') || '.'))];
  const r = await runCommand('go', {
    cwd: workspaceRoot,
    args: ['vet', ...pkgs],
    timeoutMs: 180_000,
    signal,
  });
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const findings = findingsFromLines(
    base.id,
    'lint',
    'error',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    'go vet',
    'Fix the go vet finding.'
  );
  if (r.code !== 0 && findings.length === 0) {
    findings.push({
      id: findingId(base.id, undefined, undefined, 'vet-fail'),
      kind: 'lint',
      severity: 'error',
      title: 'go vet failed',
      message: maskSecrets((r.stderr || r.stdout).slice(0, 400)),
      suggestion: 'Inspect go vet output and fix issues.',
      checkId: base.id,
    });
  }
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'go vet passed' : 'go vet reported issues',
    durationMs: Date.now() - start,
  };
}

async function goFmt(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'go-fmt',
    name: 'Go fmt',
    description: 'gofmt -l (read-only; never writes)',
  };
  const rels = files.map((f) => path.relative(workspaceRoot, f));
  const r = await runCommand('gofmt', {
    cwd: workspaceRoot,
    args: ['-l', ...rels],
    timeoutMs: 60_000,
    signal,
  });
  if (r.code === null && /not found|ENOENT/i.test(r.stderr)) {
    return unavailable(base.id, base.name, base.description, 'gofmt not found');
  }
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const dirty = r.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const findings = dirty.map((filePath) => ({
    id: findingId(base.id, filePath, undefined, 'gofmt'),
    kind: 'format' as const,
    severity: 'warning' as const,
    title: 'gofmt needed',
    message: `${filePath} is not gofmt-formatted`,
    filePath,
    suggestion: 'Run gofmt locally. ShipCheck will not modify files.',
    checkId: base.id,
  }));
  return {
    ...base,
    status: findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary: findings.length ? `${findings.length} file(s) need gofmt` : 'gofmt clean',
    durationMs: Date.now() - start,
  };
}

async function goBuild(workspaceRoot: string, signal?: AbortSignal): Promise<CheckResult> {
  const start = Date.now();
  const base = { id: 'go-build', name: 'Go build', description: 'go build ./... (compile check)' };
  const r = await runCommand('go', {
    cwd: workspaceRoot,
    args: ['build', './...'],
    timeoutMs: 300_000,
    signal,
  });
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const findings = findingsFromLines(
    base.id,
    'syntax',
    'error',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    'go build',
    'Fix compile errors.'
  );
  if (r.code !== 0 && findings.length === 0) {
    findings.push({
      id: findingId(base.id, undefined, undefined, 'build'),
      kind: 'syntax',
      severity: 'error',
      title: 'go build failed',
      message: maskSecrets((r.stderr || r.stdout).slice(0, 400)),
      suggestion: 'Fix compile errors.',
      checkId: base.id,
    });
  }
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'go build passed' : 'go build failed',
    durationMs: Date.now() - start,
  };
}
