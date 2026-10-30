import * as vscode from 'vscode';
import { cmd, getProductName, getSettings } from '../config';
import { verificationState } from '../state/verificationState';
import { statusLabel } from '../types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'shipcheck.sidebar';
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {
    verificationState.onDidChange(() => this.refresh());
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewView.webview.html = this.renderHtml();
    webviewView.webview.onDidReceiveMessage(async (msg: { type: string }) => {
      switch (msg.type) {
        case 'checkMyChanges':
          await vscode.commands.executeCommand(cmd('checkMyChanges'));
          break;
        case 'scanWorkspace':
          await vscode.commands.executeCommand(cmd('scanWorkspace'));
          break;
        case 'cancel':
          await vscode.commands.executeCommand(cmd('cancelScan'));
          break;
        case 'rerun':
          await vscode.commands.executeCommand(cmd('rerunChecks'));
          break;
        case 'export':
          await vscode.commands.executeCommand(cmd('exportReport'));
          break;
        case 'settings':
          await vscode.commands.executeCommand(cmd('openSettings'));
          break;
        case 'help':
          await vscode.commands.executeCommand(cmd('gettingStarted'));
          break;
        default:
          break;
      }
    });
  }

  refresh(): void {
    if (this.view) {
      this.view.webview.html = this.renderHtml();
    }
  }

  /** Reveal the sidebar webview (works when Open panel / status actions run). */
  reveal(): boolean {
    if (!this.view) {
      return false;
    }
    this.refresh();
    try {
      this.view.show?.(true);
      return true;
    } catch {
      return false;
    }
  }

  private renderHtml(): string {
    const product = getProductName();
    const report = verificationState.report;
    const settings = getSettings();
    const overall = report ? statusLabel(report.overallStatus) : 'Not run yet';
    const overallClass = statusClass(report?.overallStatus ?? 'NOT_CHECKED');
    const fileCount = verificationState.changedFiles.length;
    const findingCount = report?.findings.length ?? 0;
    const checks = report?.checks ?? [];

    const failedNames = checks
      .filter((c) => c.status === 'FAILED')
      .map((c) => c.name);
    const nextStep = !report
      ? 'Click the green button below. That’s all you need for a first check.'
      : report.overallStatus === 'NOT_CHECKED'
        ? 'Edit and save a .js/.ts file, then click Check My Changes again.'
        : failedNames.length
          ? `Look under Results / Security for: ${failedNames.join(', ')}. Click a finding to open the file.`
          : report.overallStatus === 'REVIEW_REQUIRED'
            ? 'Optional review suggestions are listed under Security & Review — not confirmed bugs.'
            : 'Looks good for the checks that ran. You can still review the lists below.';

    const checkRows = checks
      .map((c) => {
        const st = statusLabel(c.status);
        return `<div class="check-row">
          <span class="check-name">${esc(c.name)}</span>
          <span class="pill ${statusClass(c.status)}">${esc(st)}</span>
        </div>
        <div class="check-summary">${esc(c.summary)}</div>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 14px 12px 20px;
    margin: 0;
    line-height: 1.45;
  }
  h1 { font-size: 1.2rem; font-weight: 650; margin: 0 0 6px; }
  .sub { color: var(--vscode-descriptionForeground); margin: 0 0 14px; }
  .steps {
    background: var(--vscode-editor-inactiveSelectionBackground);
    padding: 10px 12px;
    margin-bottom: 14px;
    border-left: 3px solid var(--vscode-button-background);
  }
  .steps ol { margin: 6px 0 0; padding-left: 18px; }
  .steps li { margin: 4px 0; }
  .primary {
    display: block; width: 100%; box-sizing: border-box;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; padding: 12px; font-weight: 700; font-size: 14px;
    cursor: pointer; margin-bottom: 10px;
  }
  .primary:hover { background: var(--vscode-button-hoverBackground); }
  .secondary {
    display: block; width: 100%; box-sizing: border-box;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none; padding: 8px 12px; cursor: pointer; margin-bottom: 6px;
  }
  .secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; }
  .status-card {
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    padding: 12px; margin: 14px 0;
  }
  .status-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground); margin-bottom: 4px;
  }
  .status-value { font-size: 1.15rem; font-weight: 700; }
  .next {
    margin-top: 8px; font-size: 12.5px;
    color: var(--vscode-descriptionForeground);
  }
  .meta { margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 12px; }
  .pill {
    font-size: 10px; font-weight: 700; padding: 2px 6px; white-space: nowrap;
  }
  .PASSED { color: var(--vscode-testing-iconPassed, #3fb950); }
  .FAILED { color: var(--vscode-testing-iconFailed, #f85149); }
  .REVIEW_REQUIRED { color: var(--vscode-editorWarning-foreground, #d29922); }
  .NOT_CHECKED, .SKIPPED, .UNAVAILABLE, .NOT_INSTALLED, .NOT_CONFIGURED, .NOT_SUPPORTED, .CANCELLED, .MIXED {
    color: var(--vscode-descriptionForeground);
  }
  .check-row {
    display: flex; justify-content: space-between; align-items: center;
    gap: 8px; margin-top: 10px;
  }
  .check-name { font-weight: 600; }
  .check-summary { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 2px; }
  .section-title {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground); margin: 14px 0 4px;
  }
  .disclaimer {
    margin-top: 16px; font-size: 11px; color: var(--vscode-descriptionForeground);
    border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    padding-top: 10px;
  }
</style>
</head>
<body>
  <h1>${esc(product)}</h1>
  <p class="sub">Checks local edits across JS/TS, Python, Go, PHP/CMS, Java, Rust, Ruby, .NET, shell, and web assets. Nothing leaves your machine.</p>

  <div class="steps">
    <strong>Do this</strong>
    <ol>
      <li>Save a change in any supported source file</li>
      <li>Click <strong>Check My Changes</strong></li>
      <li>Read the status and lists below</li>
    </ol>
  </div>

  <button class="primary" id="btn-check">Check My Changes</button>
  <div class="row">
    <button class="secondary" id="btn-help">How it works</button>
    <button class="secondary" id="btn-rerun">Rerun</button>
  </div>
  <div class="row">
    <button class="secondary" id="btn-workspace">Scan whole folder</button>
    <button class="secondary" id="btn-cancel">Cancel</button>
  </div>
  <button class="secondary" id="btn-export">Export report</button>
  <button class="secondary" id="btn-settings">Settings</button>

  <div class="status-card">
    <div class="status-label">Your status</div>
    <div class="status-value ${overallClass}">${esc(overall)}</div>
    <div class="next"><strong>Next:</strong> ${esc(nextStep)}</div>
    <div class="meta">
      Changed files: ${fileCount} · Findings: ${findingCount}
      ${report ? `<br/>Last run: ${esc(new Date(report.createdAt).toLocaleString())}` : ''}
    </div>
  </div>

  <div class="section-title">Each check</div>
  ${
    checkRows ||
    '<div class="check-summary">No results yet — use the green button above.</div>'
  }

  <p class="disclaimer">
    <strong>FAILED</strong> = open Results / Security and fix or dismiss.<br/>
    <strong>REVIEW REQUIRED</strong> = suggestions only, not confirmed vulnerabilities.<br/>
    Unavailable tools (e.g. Prettier not installed) are skipped — that is normal.
    ${settings.confirmScriptExecution ? ' Tests ask for confirmation before running.' : ''}
  </p>

  <script>
    const vscode = acquireVsCodeApi();
    const bind = (id, type) => document.getElementById(id).addEventListener('click', () => vscode.postMessage({ type }));
    bind('btn-check', 'checkMyChanges');
    bind('btn-workspace', 'scanWorkspace');
    bind('btn-cancel', 'cancel');
    bind('btn-rerun', 'rerun');
    bind('btn-export', 'export');
    bind('btn-settings', 'settings');
    bind('btn-help', 'help');
  </script>
</body>
</html>`;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusClass(status: string): string {
  return status.replace(/\s+/g, '_');
}

let sidebarInstance: SidebarProvider | undefined;

export function getSidebarProvider(): SidebarProvider | undefined {
  return sidebarInstance;
}

export function registerSidebar(context: vscode.ExtensionContext): SidebarProvider {
  const provider = new SidebarProvider(context);
  sidebarInstance = provider;
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
  return provider;
}
