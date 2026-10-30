import * as path from 'path';
import { CheckResult } from '../../types';
import { runCommand, fileExists } from '../../utils/process';
import { findingId, maskSecrets } from '../../utils/secrets';
import { findingsFromLines, notConfigured, unavailable } from './parseHelpers';

export async function runRustChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  if (files.length === 0) {
    return [notConfigured('rust', 'Rust', 'cargo check / fmt', 'No Rust files in scope')];
  }
  if (!fileExists(path.join(workspaceRoot, 'Cargo.toml'))) {
    return [notConfigured('rust', 'Rust', 'cargo check / fmt', 'No Cargo.toml found')];
  }
  const ver = await runCommand('cargo', {
    cwd: workspaceRoot,
    args: ['--version'],
    timeoutMs: 15_000,
    signal,
  });
  if (ver.code !== 0) {
    return [unavailable('rust', 'Rust', 'cargo tooling', 'cargo not found on PATH')];
  }

  return [await cargoCheck(workspaceRoot, signal), await cargoFmt(workspaceRoot, signal)];
}

async function cargoCheck(workspaceRoot: string, signal?: AbortSignal): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'cargo-check',
    name: 'Cargo check',
    description: 'cargo check --message-format=short',
  };
  const r = await runCommand('cargo', {
    cwd: workspaceRoot,
    args: ['check', '--message-format=short'],
    timeoutMs: 600_000,
    signal,
  });
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  const findings = findingsFromLines(
    base.id,
    'type',
    'error',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    'cargo',
    'Fix the Rust compile/type error.'
  );
  if (r.code !== 0 && findings.length === 0) {
    findings.push({
      id: findingId(base.id, undefined, undefined, 'cargo'),
      kind: 'type',
      severity: 'error',
      title: 'cargo check failed',
      message: maskSecrets((r.stderr || r.stdout).slice(0, 500)),
      suggestion: 'Fix cargo check errors.',
      checkId: base.id,
    });
  }
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'cargo check passed' : 'cargo check failed',
    durationMs: Date.now() - start,
  };
}

async function cargoFmt(workspaceRoot: string, signal?: AbortSignal): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'cargo-fmt',
    name: 'Rust fmt',
    description: 'cargo fmt --check (never writes)',
  };
  const r = await runCommand('cargo', {
    cwd: workspaceRoot,
    args: ['fmt', '--', '--check'],
    timeoutMs: 120_000,
    signal,
  });
  if (r.cancelled) {
    return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
  }
  if (r.code !== 0 && /no such command|fmt/i.test(r.stderr) && /not installed/i.test(r.stderr)) {
    return unavailable(base.id, base.name, base.description, 'rustfmt not installed');
  }
  const findings =
    r.code === 0
      ? []
      : [
          {
            id: findingId(base.id, undefined, undefined, 'fmt'),
            kind: 'format' as const,
            severity: 'warning' as const,
            title: 'rustfmt check failed',
            message: maskSecrets((r.stdout || r.stderr).trim().slice(0, 400) || 'Formatting differs from rustfmt'),
            suggestion: 'Run cargo fmt locally. ShipCheck will not modify files.',
            checkId: base.id,
          },
        ];
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'rustfmt clean' : 'rustfmt differences found',
    durationMs: Date.now() - start,
  };
}
