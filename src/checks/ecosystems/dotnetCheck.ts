import * as fs from 'fs';
import { CheckResult } from '../../types';
import { runCommand } from '../../utils/process';
import { findingId, maskSecrets } from '../../utils/secrets';
import { findingsFromLines, notConfigured, unavailable } from './parseHelpers';

export async function runDotnetChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  if (files.length === 0) {
    return [notConfigured('dotnet', '.NET', 'dotnet build', 'No C# files in scope')];
  }
  const ver = await runCommand('dotnet', {
    cwd: workspaceRoot,
    args: ['--version'],
    timeoutMs: 20_000,
    signal,
  });
  if (ver.code !== 0) {
    return [unavailable('dotnet', '.NET', 'dotnet build', 'dotnet SDK not found on PATH')];
  }

  const project =
    fs.readdirSync(workspaceRoot).find((n) => /\.sln$/i.test(n)) ||
    fs.readdirSync(workspaceRoot).find((n) => /\.csproj$/i.test(n));

  const start = Date.now();
  const base = {
    id: 'dotnet-build',
    name: '.NET build',
    description: 'dotnet build --no-restore (or restore+build)',
  };
  const args = project
    ? ['build', project, '-v', 'q', '--nologo']
    : ['build', '-v', 'q', '--nologo'];
  const r = await runCommand('dotnet', {
    cwd: workspaceRoot,
    args,
    timeoutMs: 600_000,
    signal,
  });
  if (r.cancelled) {
    return [
      { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start },
    ];
  }
  const findings = findingsFromLines(
    base.id,
    'syntax',
    'error',
    workspaceRoot,
    `${r.stdout}\n${r.stderr}`,
    '.NET',
    'Fix the compile error.'
  );
  if (r.code !== 0 && findings.length === 0) {
    findings.push({
      id: findingId(base.id, undefined, undefined, 'dotnet'),
      kind: 'syntax',
      severity: 'error',
      title: 'dotnet build failed',
      message: maskSecrets((r.stderr || r.stdout).slice(0, 500)),
      suggestion: 'Fix build errors from the .NET SDK.',
      checkId: base.id,
    });
  }
  return [
    {
      ...base,
      status: r.code === 0 ? 'PASSED' : 'FAILED',
      findings,
      summary: r.code === 0 ? 'dotnet build passed' : 'dotnet build failed',
      durationMs: Date.now() - start,
    },
  ];
}
