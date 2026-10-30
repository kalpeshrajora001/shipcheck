import * as path from 'path';
import * as vscode from 'vscode';
import {
  ChangedFile,
  CheckResult,
  Finding,
  VerificationReport,
  computeOverallStatus,
} from '../types';
import { ScanScope, ShipCheckSettings, getProductName, getSettings } from '../config';
import { detectGitRoot, filterExistingJsTs, getChangedFiles } from '../git/gitService';
import { detectTools } from '../detectors/toolDetector';
import {
  SUPPORTED_SOURCE_RE,
  bucketChangedFiles,
  detectEcosystemHints,
  filesFor,
  summarizeLanguages,
} from '../detectors/languages';
import { isExcluded, toRelative, walkFiles } from '../utils/paths';
import { runSyntaxCheck } from './syntaxCheck';
import { runEslintCheck } from './eslintCheck';
import { runTypescriptCheck } from './typescriptCheck';
import { runPrettierCheck } from './prettierCheck';
import { runTestChecks } from './testCheck';
import { runSecurityScan } from './securityScan';
import { runRiskReview } from './riskReview';
import { runEcosystemChecks } from './ecosystems/runEcosystems';

export interface RunOptions {
  scope: ScanScope;
  signal: AbortSignal;
  onProgress: (message: string, increment?: number) => void;
}

export class CheckRunner {
  private activeController: AbortController | undefined;

  isRunning(): boolean {
    return Boolean(this.activeController && !this.activeController.signal.aborted);
  }

  cancel(): void {
    this.activeController?.abort();
  }

  async run(scope: ScanScope): Promise<VerificationReport | undefined> {
    if (this.activeController && !this.activeController.signal.aborted) {
      void vscode.window.showWarningMessage(
        `${getProductName()}: a scan is already running. Cancel it first or wait.`
      );
      return undefined;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      void vscode.window.showErrorMessage(
        `${getProductName()}: open a workspace folder to verify changes.`
      );
      return undefined;
    }

    const controller = new AbortController();
    this.activeController = controller;
    const settings = getSettings();

    try {
      const report = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: getProductName(),
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => controller.abort());
          return this.execute(folder.uri.fsPath, scope, settings, {
            scope,
            signal: controller.signal,
            onProgress: (message, increment) =>
              progress.report({ message, increment }),
          });
        }
      );
      return report;
    } finally {
      if (this.activeController === controller) {
        this.activeController = undefined;
      }
    }
  }

  private async execute(
    workspaceRoot: string,
    scope: ScanScope,
    settings: ShipCheckSettings,
    options: RunOptions
  ): Promise<VerificationReport> {
    const productName = getProductName();
    options.onProgress('Detecting Git repository…', 2);

    const git = await detectGitRoot(workspaceRoot);
    let changedFiles: ChangedFile[] = [];

    if (scope === 'changes') {
      if (!git.isRepo) {
        const choice = await vscode.window.showWarningMessage(
          `${productName}: this folder is not a Git repository yet.\n\nCheck My Changes needs Git so it can see what you edited. You can scan the whole workspace instead, or initialize Git first.`,
          { modal: true },
          'Scan whole workspace',
          'Cancel'
        );
        if (choice === 'Scan whole workspace') {
          return this.execute(workspaceRoot, 'workspace', settings, {
            ...options,
            scope: 'workspace',
          });
        }
        return emptyReport(productName, workspaceRoot, scope, true);
      }
      options.onProgress('Collecting changed files…', 5);
      changedFiles = await getChangedFiles(
        git.root,
        settings.includeUntracked,
        options.signal
      );
      changedFiles = changedFiles.filter(
        (f) => !isExcluded(f.relativePath, settings.excludeGlobs)
      );
    } else {
      options.onProgress('Enumerating workspace files…', 5);
      const absFiles = walkFiles(
        workspaceRoot,
        settings.excludeGlobs,
        SUPPORTED_SOURCE_RE
      );
      changedFiles = absFiles.map((abs) => ({
        absolutePath: abs,
        relativePath: toRelative(workspaceRoot, abs),
        status: 'modified' as const,
        staged: false,
      }));
    }

    if (options.signal.aborted) {
      return cancelledReport(productName, workspaceRoot, scope, changedFiles);
    }

    const buckets = bucketChangedFiles(changedFiles);
    const langSummary = summarizeLanguages(buckets);
    const hints = detectEcosystemHints(workspaceRoot);

    if (scope === 'changes' && buckets.length === 0) {
      void vscode.window.showInformationMessage(
        `${productName}: no supported source files changed.\n\nEdit and save code (JS/TS, Python, Go, PHP, Java, Rust, Ruby, C#, shell, web/CMS assets…), then check again.`,
        'OK'
      );
      return {
        productName,
        createdAt: new Date().toISOString(),
        scope,
        workspaceRoot,
        changedFiles,
        checks: [
          {
            id: 'ready',
            name: 'Ready',
            description: 'Waiting for supported source changes',
            status: 'NOT_CHECKED',
            findings: [],
            summary:
              'No supported language files in the change set. Edit a source file, save, then Check My Changes.',
            detail: hints.markers.length
              ? `Project markers: ${hints.markers.join(', ')}`
              : undefined,
          },
        ],
        findings: [],
        overallStatus: 'NOT_CHECKED',
        cancelled: false,
      };
    }

    const jsTsFiles = filterExistingJsTs(changedFiles).map((f) => f.absolutePath);
    const allSourceFiles = buckets.flatMap((b) => b.files);
    const extraForSecurity = changedFiles
      .filter(
        (f) =>
          f.status !== 'deleted' &&
          (/\.env/i.test(f.relativePath) ||
            /\.(json|ya?ml|toml|xml|tf|sql|php|py|env)$/i.test(f.relativePath))
      )
      .map((f) => f.absolutePath);

    options.onProgress(`Detecting tools… (${langSummary})`, 8);
    const tools = detectTools(workspaceRoot);

    const checks: CheckResult[] = [];
    const step = 8;

    // Language inventory check (always informative)
    checks.push({
      id: 'languages',
      name: 'Languages detected',
      description: 'Ecosystems present in this scan',
      status: 'PASSED',
      findings: [],
      summary: langSummary || 'none',
      detail: hints.markers.length
        ? `Markers: ${hints.markers.join(', ')}`
        : 'No special framework markers',
    });

    // --- JavaScript / TypeScript stack (when present) ---
    if (jsTsFiles.length > 0 || hints.hasNode) {
      options.onProgress('JavaScript/TypeScript checks…', step);
      if (jsTsFiles.length > 0) {
        checks.push(await runSyntaxCheck(workspaceRoot, jsTsFiles, options.signal));
        if (options.signal.aborted) {
          return finalize(productName, workspaceRoot, scope, changedFiles, checks, true, settings);
        }
        checks.push(
          await runEslintCheck(workspaceRoot, jsTsFiles, tools.eslint, options.signal)
        );
        if (options.signal.aborted) {
          return finalize(productName, workspaceRoot, scope, changedFiles, checks, true, settings);
        }
        checks.push(
          await runPrettierCheck(workspaceRoot, jsTsFiles, tools.prettier, options.signal)
        );
      }
      checks.push(await runTypescriptCheck(workspaceRoot, tools.typescript, options.signal));
      if (options.signal.aborted) {
        return finalize(productName, workspaceRoot, scope, changedFiles, checks, true, settings);
      }
    }

    // --- Other ecosystems ---
    options.onProgress('Multi-language ecosystem checks…', step);
    const eco = await runEcosystemChecks({
      workspaceRoot,
      buckets,
      signal: options.signal,
      onProgress: (message) => options.onProgress(message, 2),
    });
    checks.push(...eco.checks);
    if (options.signal.aborted) {
      return finalize(productName, workspaceRoot, scope, changedFiles, checks, true, settings);
    }

    if (settings.runSecurityScan) {
      options.onProgress('Running security scan…', step);
      const securityFiles = [...new Set([...allSourceFiles, ...extraForSecurity])];
      checks.push(
        await runSecurityScan(
          workspaceRoot,
          securityFiles,
          settings.maxFileSizeKb,
          options.signal,
          { skipTestFixtures: settings.skipTestFixturesInSecurityScan }
        )
      );
    } else {
      checks.push({
        id: 'security',
        name: 'Security scan',
        description: 'Local secret/credential pattern scan',
        status: 'SKIPPED',
        findings: [],
        summary: 'Disabled in settings',
      });
    }
    if (options.signal.aborted) {
      return finalize(productName, workspaceRoot, scope, changedFiles, checks, true, settings);
    }

    if (settings.runRiskReview) {
      options.onProgress('Running risk review…', step);
      checks.push(
        await runRiskReview(
          workspaceRoot,
          allSourceFiles,
          settings.maxFileSizeKb,
          options.signal
        )
      );
    } else {
      checks.push({
        id: 'risk_review',
        name: 'Risk review',
        description: 'Heuristic review suggestions',
        status: 'SKIPPED',
        findings: [],
        summary: 'Disabled in settings',
      });
    }
    if (options.signal.aborted) {
      return finalize(productName, workspaceRoot, scope, changedFiles, checks, true, settings);
    }

    if (jsTsFiles.length > 0 || hints.hasNode) {
      options.onProgress('Running JS tests (if configured)…', step);
      const testResults = await runTestChecks(workspaceRoot, tools, {
        runTests: settings.runTests,
        confirmScriptExecution: settings.confirmScriptExecution,
        signal: options.signal,
      });
      checks.push(...testResults);
    }

    // Touch filesFor to keep import used when only markers exist
    void filesFor(buckets, 'javascript');

    return finalize(
      productName,
      workspaceRoot,
      scope,
      changedFiles,
      checks,
      options.signal.aborted,
      settings
    );
  }
}

function finalize(
  productName: string,
  workspaceRoot: string,
  scope: ScanScope,
  changedFiles: ChangedFile[],
  checks: CheckResult[],
  cancelled: boolean,
  settings: ShipCheckSettings
): VerificationReport {
  const dismissed = new Set(settings.dismissedFindings);
  const allFindings: Finding[] = [];
  for (const c of checks) {
    for (const f of c.findings) {
      if (dismissed.has(f.id)) {
        f.dismissed = true;
      } else {
        allFindings.push(f);
      }
    }
  }

  return {
    productName,
    createdAt: new Date().toISOString(),
    scope,
    workspaceRoot,
    changedFiles,
    checks,
    findings: allFindings,
    overallStatus: computeOverallStatus(checks, cancelled),
    cancelled,
  };
}

function emptyReport(
  productName: string,
  workspaceRoot: string,
  scope: ScanScope,
  _noGit: boolean
): VerificationReport {
  return {
    productName,
    createdAt: new Date().toISOString(),
    scope,
    workspaceRoot,
    changedFiles: [],
    checks: [],
    findings: [],
    overallStatus: 'NOT_CHECKED',
    cancelled: false,
  };
}

function cancelledReport(
  productName: string,
  workspaceRoot: string,
  scope: ScanScope,
  changedFiles: ChangedFile[]
): VerificationReport {
  return {
    productName,
    createdAt: new Date().toISOString(),
    scope,
    workspaceRoot,
    changedFiles,
    checks: [],
    findings: [],
    overallStatus: 'CANCELLED',
    cancelled: true,
  };
}

export function resolveAbsolute(
  workspaceRoot: string,
  relativePath: string
): string {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(workspaceRoot, relativePath);
}
