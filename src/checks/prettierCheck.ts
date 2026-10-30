import * as path from 'path';
import { CheckResult, Finding, ToolInfo } from '../types';
import { resolveRunner, runCommand, isJsTsFile } from '../utils/process';
import { findingId, maskSecrets } from '../utils/secrets';

const CHECK_ID = 'prettier';

/**
 * Runs Prettier in check mode only — never writes / formats files.
 */
export async function runPrettierCheck(
  workspaceRoot: string,
  files: string[],
  tool: ToolInfo,
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: CHECK_ID,
    name: 'Prettier',
    description: 'Check formatting with Prettier (read-only; never writes files)',
  };

  if (!tool.available) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      findings: [],
      summary: 'Prettier is not installed in this project',
      detail: tool.detail,
      durationMs: Date.now() - start,
    };
  }
  if (!tool.configured) {
    return {
      ...base,
      status: 'NOT_CONFIGURED',
      findings: [],
      summary: 'Prettier not configured',
      detail: tool.detail,
      durationMs: Date.now() - start,
    };
  }

  const targets = files.filter(isJsTsFile);
  if (targets.length === 0) {
    return {
      ...base,
      status: 'NOT_CHECKED',
      findings: [],
      summary: 'No JS/TS files to check',
      durationMs: Date.now() - start,
    };
  }

  const runner = resolveRunner(workspaceRoot, 'prettier');
  const relFiles = targets.map((f) => path.relative(workspaceRoot, f));
  const args = [...runner.prefixArgs, '--check', ...relFiles];

  const result = await runCommand(runner.command, {
    cwd: workspaceRoot,
    args,
    timeoutMs: 120_000,
    signal,
  });

  if (result.cancelled) {
    return {
      ...base,
      status: 'CANCELLED',
      findings: [],
      summary: 'Cancelled',
      durationMs: Date.now() - start,
    };
  }

  if (result.timedOut) {
    return {
      ...base,
      status: 'FAILED',
      findings: [
        {
          id: findingId(CHECK_ID, undefined, undefined, 'timeout'),
          kind: 'format',
          severity: 'error',
          title: 'Prettier timed out',
          message: 'Prettier check exceeded the time limit',
          suggestion: 'Rerun on a smaller set of files.',
          checkId: CHECK_ID,
        },
      ],
      summary: 'Prettier timed out',
      durationMs: Date.now() - start,
    };
  }

  const findings = parsePrettierOutput(
    `${result.stdout}\n${result.stderr}`,
    workspaceRoot
  );

  if (result.code !== 0 && result.code !== 1 && findings.length === 0) {
    return {
      ...base,
      status: 'FAILED',
      findings: [
        {
          id: findingId(CHECK_ID, undefined, undefined, 'exec'),
          kind: 'format',
          severity: 'error',
          title: 'Prettier failed to run',
          message: maskSecrets((result.stderr || result.stdout).slice(0, 500)),
          suggestion: 'Fix Prettier configuration and rerun.',
          checkId: CHECK_ID,
        },
      ],
      summary: 'Prettier execution failed',
      durationMs: Date.now() - start,
    };
  }

  return {
    ...base,
    status: findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary:
      findings.length === 0
        ? `Formatting OK for ${targets.length} file(s)`
        : `${findings.length} file(s) need formatting`,
    durationMs: Date.now() - start,
  };
}

function parsePrettierOutput(output: string, workspaceRoot: string): Finding[] {
  const findings: Finding[] = [];
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    // "Code style issues found in the above file(s)" or "[warn] path"
    const warn = /^\s*\[warn\]\s+(.+)$/.exec(line);
    const checked = warn
      ? warn[1]
      : line.includes('Code style issues found')
        ? null
        : null;
    if (warn) {
      let filePath = warn[1].trim();
      if (path.isAbsolute(filePath)) {
        filePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
      }
      const title = 'Formatting differs from Prettier';
      findings.push({
        id: findingId(CHECK_ID, filePath, undefined, title),
        kind: 'format',
        severity: 'warning',
        title,
        message: `${filePath} is not formatted according to Prettier`,
        filePath,
        suggestion:
          'Run Prettier locally to format the file. ShipCheck will not modify files for you.',
        checkId: CHECK_ID,
      });
    }
    void checked;
  }

  // Also catch "filename" lines listed before the summary
  if (findings.length === 0) {
    for (const line of lines) {
      const t = line.trim();
      if (
        t &&
        !t.startsWith('[') &&
        !t.toLowerCase().includes('checking') &&
        !t.toLowerCase().includes('code style') &&
        !t.toLowerCase().includes('all matched') &&
        /\.(jsx?|tsx?|mjs|cjs)$/i.test(t)
      ) {
        let filePath = t;
        if (path.isAbsolute(filePath)) {
          filePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
        }
        const title = 'Formatting differs from Prettier';
        findings.push({
          id: findingId(CHECK_ID, filePath, undefined, title),
          kind: 'format',
          severity: 'warning',
          title,
          message: `${filePath} is not formatted according to Prettier`,
          filePath,
          suggestion:
            'Run Prettier locally to format the file. ShipCheck will not modify files for you.',
          checkId: CHECK_ID,
        });
      }
    }
  }

  return findings;
}
