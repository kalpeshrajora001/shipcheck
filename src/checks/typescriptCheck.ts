import * as path from 'path';
import { CheckResult, Finding, ToolInfo } from '../types';
import { resolveRunner, runCommand } from '../utils/process';
import { findingId, maskSecrets } from '../utils/secrets';

const CHECK_ID = 'typescript';

export async function runTypescriptCheck(
  workspaceRoot: string,
  tool: ToolInfo,
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: CHECK_ID,
    name: 'TypeScript',
    description: 'Type-check the project with tsc --noEmit',
  };

  if (!tool.configured) {
    return {
      ...base,
      status: 'NOT_CONFIGURED',
      findings: [],
      summary: 'No tsconfig.json found',
      detail: tool.detail,
      durationMs: Date.now() - start,
    };
  }
  if (!tool.available) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      findings: [],
      summary: 'TypeScript compiler not installed',
      detail: tool.detail,
      durationMs: Date.now() - start,
    };
  }

  const runner = resolveRunner(workspaceRoot, 'tsc');
  const args = [...runner.prefixArgs, '--noEmit', '--pretty', 'false'];
  if (tool.configPath) {
    args.push('-p', path.relative(workspaceRoot, tool.configPath));
  }

  const result = await runCommand(runner.command, {
    cwd: workspaceRoot,
    args,
    timeoutMs: 300_000,
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
          kind: 'type',
          severity: 'error',
          title: 'TypeScript check timed out',
          message: 'tsc exceeded the time limit',
          suggestion: 'Check for project references or reduce compile scope.',
          checkId: CHECK_ID,
        },
      ],
      summary: 'TypeScript timed out',
      durationMs: Date.now() - start,
    };
  }

  const output = `${result.stdout}\n${result.stderr}`;
  const findings = parseTscOutput(output, workspaceRoot);

  if (result.code !== 0 && findings.length === 0) {
    // Might be a config error
    const msg = maskSecrets(output.trim().slice(0, 500) || 'tsc failed');
    return {
      ...base,
      status: 'FAILED',
      findings: [
        {
          id: findingId(CHECK_ID, undefined, undefined, 'tsc-fail'),
          kind: 'type',
          severity: 'error',
          title: 'TypeScript compiler error',
          message: msg,
          suggestion: 'Fix tsconfig or compiler errors, then rerun.',
          checkId: CHECK_ID,
        },
      ],
      summary: 'tsc failed',
      durationMs: Date.now() - start,
    };
  }

  return {
    ...base,
    status: findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary:
      findings.length === 0
        ? 'TypeScript check passed'
        : `${findings.length} type error(s)`,
    durationMs: Date.now() - start,
  };
}

/** Parse `file(line,col): error TSxxxx: message` lines */
function parseTscOutput(output: string, workspaceRoot: string): Finding[] {
  const findings: Finding[] = [];
  const re =
    /(?:^|\n)([^\s].*?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) {
    let filePath = m[1].trim();
    if (path.isAbsolute(filePath)) {
      filePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
    } else {
      filePath = filePath.replace(/\\/g, '/');
    }
    const severity = m[4] === 'error' ? 'error' : 'warning';
    const code = m[5];
    const message = maskSecrets(m[6].trim());
    const title = `TypeScript ${code}`;
    const line = Number(m[2]);
    findings.push({
      id: findingId(CHECK_ID, filePath, line, title + message),
      kind: 'type',
      severity,
      title,
      message,
      filePath,
      line,
      column: Number(m[3]),
      suggestion: 'Fix the type error or adjust typings.',
      checkId: CHECK_ID,
    });
  }
  return findings;
}
