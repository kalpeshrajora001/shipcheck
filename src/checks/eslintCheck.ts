import * as path from 'path';
import { CheckResult, Finding, ToolInfo } from '../types';
import { resolveRunner, runCommand, isJsTsFile } from '../utils/process';
import { findingId, maskSecrets } from '../utils/secrets';

const CHECK_ID = 'eslint';

export async function runEslintCheck(
  workspaceRoot: string,
  files: string[],
  tool: ToolInfo,
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: CHECK_ID,
    name: 'ESLint',
    description: 'Lint JavaScript/TypeScript with project ESLint config',
  };

  if (!tool.available) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      findings: [],
      summary: 'ESLint is not installed in this project',
      detail: tool.detail,
      durationMs: Date.now() - start,
    };
  }
  if (!tool.configured) {
    return {
      ...base,
      status: 'NOT_CONFIGURED',
      findings: [],
      summary: 'No ESLint configuration found',
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
      summary: 'No JS/TS files to lint',
      durationMs: Date.now() - start,
    };
  }

  const runner = resolveRunner(workspaceRoot, 'eslint');
  const relFiles = targets.map((f) => path.relative(workspaceRoot, f));
  const args = [
    ...runner.prefixArgs,
    ...relFiles,
    '--format',
    'json',
    '--no-error-on-unmatched-pattern',
  ];

  const result = await runCommand(runner.command, {
    cwd: workspaceRoot,
    args,
    timeoutMs: 180_000,
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
          kind: 'lint',
          severity: 'error',
          title: 'ESLint timed out',
          message: 'ESLint exceeded the time limit',
          suggestion: 'Narrow the file set or increase resources, then rerun.',
          checkId: CHECK_ID,
        },
      ],
      summary: 'ESLint timed out',
      durationMs: Date.now() - start,
    };
  }

  const findings = parseEslintJson(result.stdout || result.stderr, workspaceRoot);

  // Exit code 1 = lint errors; 0 = clean; other = tool failure
  if (result.code !== 0 && result.code !== 1 && findings.length === 0) {
    return {
      ...base,
      status: 'FAILED',
      findings: [
        {
          id: findingId(CHECK_ID, undefined, undefined, 'exec-error'),
          kind: 'lint',
          severity: 'error',
          title: 'ESLint failed to run',
          message: maskSecrets((result.stderr || result.stdout || 'Unknown error').slice(0, 500)),
          suggestion: 'Fix ESLint configuration or install missing plugins.',
          checkId: CHECK_ID,
        },
      ],
      summary: 'ESLint execution failed',
      durationMs: Date.now() - start,
    };
  }

  return {
    ...base,
    status: findings.some((f) => f.severity === 'error') ? 'FAILED' : findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary:
      findings.length === 0
        ? `ESLint passed on ${targets.length} file(s)`
        : `${findings.length} ESLint issue(s)`,
    durationMs: Date.now() - start,
  };
}

interface EslintMessage {
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity?: number;
  message?: string;
  ruleId?: string | null;
}

interface EslintFileResult {
  filePath?: string;
  messages?: EslintMessage[];
}

function parseEslintJson(raw: string, workspaceRoot: string): Finding[] {
  const findings: Finding[] = [];
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) {
    return findings;
  }
  try {
    const data = JSON.parse(trimmed) as EslintFileResult[];
    for (const file of data) {
      const abs = file.filePath ?? '';
      const rel = path.relative(workspaceRoot, abs).replace(/\\/g, '/') || abs;
      for (const msg of file.messages ?? []) {
        const severity = msg.severity === 2 ? 'error' : 'warning';
        const title = msg.ruleId ? `ESLint: ${msg.ruleId}` : 'ESLint issue';
        findings.push({
          id: findingId(CHECK_ID, rel, msg.line, title + (msg.message ?? '')),
          kind: 'lint',
          severity,
          title,
          message: maskSecrets(msg.message ?? ''),
          filePath: rel,
          line: msg.line,
          column: msg.column,
          endLine: msg.endLine,
          endColumn: msg.endColumn,
          suggestion: 'Resolve the lint issue or adjust the ESLint rule if appropriate.',
          checkId: CHECK_ID,
        });
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return findings;
}
