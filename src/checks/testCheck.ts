import * as vscode from 'vscode';
import { CheckResult, Finding, ToolAvailability } from '../types';
import { getTestScript } from '../detectors/toolDetector';
import { resolveRunner, runCommand } from '../utils/process';
import { findingId, maskSecrets } from '../utils/secrets';
import { getProductName } from '../config';

export async function runTestChecks(
  workspaceRoot: string,
  tools: ToolAvailability,
  options: {
    runTests: boolean;
    confirmScriptExecution: boolean;
    signal?: AbortSignal;
  }
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  if (!options.runTests) {
    results.push(skipped('jest', 'Jest', 'Test runs disabled in settings'));
    results.push(skipped('vitest', 'Vitest', 'Test runs disabled in settings'));
    return results;
  }

  const jestConfigured = tools.jest.available || tools.jest.configured;
  const vitestConfigured = tools.vitest.available || tools.vitest.configured;

  if (!jestConfigured && !vitestConfigured) {
    results.push({
      id: 'jest',
      name: 'Jest',
      description: 'Run Jest tests',
      status: 'NOT_CONFIGURED',
      findings: [],
      summary: 'Jest not detected',
      detail: tools.jest.detail,
    });
    results.push({
      id: 'vitest',
      name: 'Vitest',
      description: 'Run Vitest tests',
      status: 'NOT_CONFIGURED',
      findings: [],
      summary: 'Vitest not detected',
      detail: tools.vitest.detail,
    });
    return results;
  }

  // Prefer Vitest if both present and vitest is the clearer choice
  if (vitestConfigured) {
    results.push(
      await runOneTestFramework(workspaceRoot, 'vitest', tools, options)
    );
    if (jestConfigured && !tools.vitest.available) {
      results.push(
        await runOneTestFramework(workspaceRoot, 'jest', tools, options)
      );
    } else if (jestConfigured) {
      results.push({
        id: 'jest',
        name: 'Jest',
        description: 'Run Jest tests',
        status: 'SKIPPED',
        findings: [],
        summary: 'Skipped because Vitest is configured for this project',
        detail: 'Disable Vitest or run Jest separately if needed',
      });
    } else {
      results.push({
        id: 'jest',
        name: 'Jest',
        description: 'Run Jest tests',
        status: 'NOT_CONFIGURED',
        findings: [],
        summary: 'Jest not detected',
      });
    }
  } else {
    results.push(await runOneTestFramework(workspaceRoot, 'jest', tools, options));
    results.push({
      id: 'vitest',
      name: 'Vitest',
      description: 'Run Vitest tests',
      status: 'NOT_CONFIGURED',
      findings: [],
      summary: 'Vitest not detected',
    });
  }

  return results;
}

async function runOneTestFramework(
  workspaceRoot: string,
  framework: 'jest' | 'vitest',
  tools: ToolAvailability,
  options: { confirmScriptExecution: boolean; signal?: AbortSignal }
): Promise<CheckResult> {
  const start = Date.now();
  const name = framework === 'jest' ? 'Jest' : 'Vitest';
  const checkId = framework;
  const base = {
    id: checkId,
    name,
    description: `Run ${name} tests (requires confirmation when enabled)`,
  };

  const tool = framework === 'jest' ? tools.jest : tools.vitest;
  if (!tool.available && !tool.configured) {
    return {
      ...base,
      status: 'NOT_CONFIGURED',
      findings: [],
      summary: `${name} not detected`,
      detail: tool.detail,
      durationMs: Date.now() - start,
    };
  }

  const script = getTestScript(workspaceRoot, framework);
  const product = getProductName();

  if (options.confirmScriptExecution) {
    const detail = script
      ? `This will run: npm run ${script.scriptName}\n(${script.command})`
      : `This will run the local ${name} binary against the project.`;
    const pick = await vscode.window.showWarningMessage(
      `${product}: run ${name} tests? Project scripts are untrusted input.`,
      { modal: true, detail },
      'Run tests',
      'Skip'
    );
    if (pick !== 'Run tests') {
      return {
        ...base,
        status: 'SKIPPED',
        findings: [],
        summary: 'Skipped — execution not confirmed',
        durationMs: Date.now() - start,
      };
    }
  }

  if (options.signal?.aborted) {
    return {
      ...base,
      status: 'CANCELLED',
      findings: [],
      summary: 'Cancelled',
      durationMs: Date.now() - start,
    };
  }

  let command: string;
  let args: string[];

  if (script) {
    // Run via package manager script name only (no shell interpolation of script body)
    const pm =
      tools.packageManager === 'yarn'
        ? 'yarn'
        : tools.packageManager === 'pnpm'
          ? 'pnpm'
          : 'npm';
    if (pm === 'npm') {
      command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      args = ['run', script.scriptName, '--', '--passWithNoTests'];
      if (framework === 'vitest') {
        args = ['run', script.scriptName, '--', 'run'];
      }
    } else if (pm === 'yarn') {
      command = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
      args =
        framework === 'vitest'
          ? [script.scriptName, 'run']
          : [script.scriptName, '--passWithNoTests'];
    } else {
      command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
      args =
        framework === 'vitest'
          ? ['run', script.scriptName, 'run']
          : ['run', script.scriptName, '--', '--passWithNoTests'];
    }
  } else {
    const runner = resolveRunner(workspaceRoot, framework);
    command = runner.command;
    args =
      framework === 'vitest'
        ? [...runner.prefixArgs, 'run']
        : [...runner.prefixArgs, '--passWithNoTests'];
  }

  const result = await runCommand(command, {
    cwd: workspaceRoot,
    args,
    timeoutMs: 300_000,
    signal: options.signal,
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

  const output = `${result.stdout}\n${result.stderr}`;
  const findings = parseTestOutput(output, checkId, name);

  if (result.timedOut) {
    findings.push({
      id: findingId(checkId, undefined, undefined, 'timeout'),
      kind: 'test',
      severity: 'error',
      title: `${name} timed out`,
      message: 'Test run exceeded the time limit',
      suggestion: 'Run a smaller suite or fix hanging tests.',
      checkId,
    });
  }

  if (result.code !== 0 && findings.length === 0) {
    findings.push({
      id: findingId(checkId, undefined, undefined, 'fail'),
      kind: 'test',
      severity: 'error',
      title: `${name} failed`,
      message: maskSecrets(summarizeOutput(output)),
      suggestion: 'Inspect the test output in the terminal and fix failing tests.',
      checkId,
    });
  }

  return {
    ...base,
    status: result.code === 0 && !result.timedOut ? 'PASSED' : 'FAILED',
    findings,
    summary:
      result.code === 0 && !result.timedOut
        ? `${name} tests passed`
        : `${name} tests failed`,
    detail: script ? `Ran script: ${script.scriptName}` : `Ran ${name} binary`,
    durationMs: Date.now() - start,
  };
}

function skipped(id: string, name: string, reason: string): CheckResult {
  return {
    id,
    name,
    description: `Run ${name} tests`,
    status: 'SKIPPED',
    findings: [],
    summary: reason,
  };
}

function summarizeOutput(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const interesting = lines.filter(
    (l) =>
      /FAIL|Error|●|✕|×|failed|AssertionError/i.test(l) &&
      !/node_modules/.test(l)
  );
  const slice = (interesting.length ? interesting : lines.slice(-20)).slice(0, 15);
  return slice.join('\n').slice(0, 800);
}

function parseTestOutput(output: string, checkId: string, name: string): Finding[] {
  const findings: Finding[] = [];
  // Jest/Vitest file failure lines
  const failFile = /(?:FAIL|×|✕)\s+(.+\.(?:jsx?|tsx?))/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = failFile.exec(output)) !== null) {
    const filePath = m[1].trim().replace(/\\/g, '/');
    if (seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    const title = `${name} failure`;
    findings.push({
      id: findingId(checkId, filePath, undefined, title),
      kind: 'test',
      severity: 'error',
      title,
      message: maskSecrets(`Failing suite: ${filePath}`),
      filePath,
      suggestion: 'Open the failing test file and fix assertions or code under test.',
      checkId,
    });
  }
  return findings;
}
