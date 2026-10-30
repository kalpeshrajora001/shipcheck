import * as path from 'path';
import { CheckResult } from '../../types';
import { resolveLocalBin, runCommand, fileExists } from '../../utils/process';
import { findingId, maskSecrets } from '../../utils/secrets';
import { findingsFromLines, notConfigured, unavailable } from './parseHelpers';

/**
 * PHP + common CMS stacks (WordPress/Laravel/Drupal markers detected upstream).
 */
export async function runPhpChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  if (files.length === 0) {
    return [notConfigured('php', 'PHP', 'PHP lint/static analysis', 'No PHP files in scope')];
  }
  const ver = await runCommand('php', {
    cwd: workspaceRoot,
    args: ['-v'],
    timeoutMs: 15_000,
    signal,
  });
  if (ver.code !== 0) {
    return [unavailable('php', 'PHP', 'PHP tooling', 'php not found on PATH')];
  }

  const results: CheckResult[] = [];
  results.push(await phpLint(workspaceRoot, files, signal));
  results.push(await phpstanOrPsalm(workspaceRoot, files, signal));
  return results;
}

async function phpLint(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'php-lint',
    name: 'PHP syntax',
    description: 'php -l on changed PHP files (CMS-safe, read-only)',
  };
  const findings = [];
  for (const file of files) {
    if (signal?.aborted) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    const rel = path.relative(workspaceRoot, file).replace(/\\/g, '/');
    const r = await runCommand('php', {
      cwd: workspaceRoot,
      args: ['-l', rel],
      timeoutMs: 60_000,
      signal,
    });
    if (r.cancelled) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    if (r.code !== 0) {
      const msg = maskSecrets((r.stderr || r.stdout).trim().slice(0, 400));
      const m = /on line (\d+)/i.exec(msg);
      findings.push({
        id: findingId(base.id, rel, m ? Number(m[1]) : undefined, 'php-l'),
        kind: 'syntax' as const,
        severity: 'error' as const,
        title: 'PHP syntax error',
        message: msg || 'php -l failed',
        filePath: rel,
        line: m ? Number(m[1]) : undefined,
        suggestion: 'Fix the PHP syntax error before deploying (critical for WordPress/Laravel/Drupal).',
        checkId: base.id,
      });
    }
  }
  return {
    ...base,
    status: findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary: findings.length ? `${findings.length} PHP syntax issue(s)` : `php -l clean on ${files.length} file(s)`,
    durationMs: Date.now() - start,
  };
}

async function phpstanOrPsalm(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: 'php-static',
    name: 'PHP static analysis',
    description: 'PHPStan or Psalm when available',
  };
  const phpstan =
    resolveLocalBin(workspaceRoot, 'phpstan') ||
    (fileExists(path.join(workspaceRoot, 'vendor', 'bin', 'phpstan'))
      ? path.join(workspaceRoot, 'vendor', 'bin', 'phpstan')
      : 'phpstan');
  const rels = files.map((f) => path.relative(workspaceRoot, f));
  const r = await runCommand(phpstan, {
    cwd: workspaceRoot,
    args: ['analyse', ...rels, '--error-format=raw', '--no-progress'],
    timeoutMs: 300_000,
    signal,
  });
  if (r.code === null && /not found|ENOENT/i.test(r.stderr)) {
    const psalm =
      resolveLocalBin(workspaceRoot, 'psalm') ||
      (fileExists(path.join(workspaceRoot, 'vendor', 'bin', 'psalm'))
        ? path.join(workspaceRoot, 'vendor', 'bin', 'psalm')
        : 'psalm');
    const p = await runCommand(psalm, {
      cwd: workspaceRoot,
      args: [...rels, '--output-format=text'],
      timeoutMs: 300_000,
      signal,
    });
    if (p.code === null && /not found|ENOENT/i.test(p.stderr)) {
      return unavailable(
        base.id,
        base.name,
        base.description,
        'PHPStan/Psalm not found (optional for CMS projects)'
      );
    }
    if (p.cancelled) {
      return { ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start };
    }
    const findings = findingsFromLines(
      base.id,
      'type',
      'error',
      workspaceRoot,
      `${p.stdout}\n${p.stderr}`,
      'Psalm',
      'Fix the Psalm finding.'
    );
    return {
      ...base,
      status: p.code === 0 ? 'PASSED' : 'FAILED',
      findings,
      summary: p.code === 0 ? 'Psalm passed' : `${findings.length || 1} Psalm issue(s)`,
      durationMs: Date.now() - start,
    };
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
    'PHPStan',
    'Fix the PHPStan finding.'
  );
  return {
    ...base,
    status: r.code === 0 ? 'PASSED' : 'FAILED',
    findings,
    summary: r.code === 0 ? 'PHPStan passed' : `${findings.length || 1} PHPStan issue(s)`,
    durationMs: Date.now() - start,
  };
}
