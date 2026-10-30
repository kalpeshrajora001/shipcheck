import * as vscode from 'vscode';
import * as path from 'path';
import {
  cmd,
  getProductName,
  getSettings,
  addDismissedFinding,
  clearDismissedFindings,
} from './config';
import { CheckRunner, resolveAbsolute } from './checks/checkRunner';
import { verificationState } from './state/verificationState';
import { getSidebarProvider, registerSidebar } from './ui/sidebarProvider';
import { registerChangedFilesView } from './ui/changedFilesTree';
import { registerResultsView } from './ui/resultsTree';
import { registerSecurityView } from './ui/securityTree';
import { registerStatusBar } from './ui/statusBar';
import { openResultsEditorPanel } from './ui/resultsPanel';
import { buildMarkdownReport } from './report/markdownExport';
import { statusLabel } from './types';

let runner: CheckRunner;
let lastScope: 'changes' | 'workspace' = 'changes';

export function activate(context: vscode.ExtensionContext): void {
  runner = new CheckRunner();

  registerSidebar(context);
  registerChangedFilesView(context);
  registerResultsView(context);
  registerSecurityView(context);
  registerStatusBar(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(cmd('showPanel'), async () => {
      await showShipCheckPanel({ forceEditorTab: true });
    }),
    vscode.commands.registerCommand(cmd('gettingStarted'), async () => {
      await showGettingStarted();
    }),
    vscode.commands.registerCommand(cmd('checkMyChanges'), async () => {
      await showShipCheckPanel();
      lastScope = 'changes';
      await runScan('changes');
    }),
    vscode.commands.registerCommand(cmd('scanWorkspace'), async () => {
      const product = getProductName();
      const confirm = await vscode.window.showWarningMessage(
        `${product}: scan every JS/TS file in this folder? This is slower than checking only your Git changes.`,
        { modal: true },
        'Scan workspace',
        'Cancel'
      );
      if (confirm !== 'Scan workspace') {
        return;
      }
      await showShipCheckPanel();
      lastScope = 'workspace';
      await runScan('workspace');
    }),
    vscode.commands.registerCommand(cmd('cancelScan'), () => {
      if (!runner.isRunning()) {
        void vscode.window.showInformationMessage(
          `${getProductName()}: no scan is running right now.`
        );
        return;
      }
      runner.cancel();
      void vscode.window.showInformationMessage(`${getProductName()}: cancelling…`);
    }),
    vscode.commands.registerCommand(cmd('rerunChecks'), async () => {
      await showShipCheckPanel();
      await runScan(lastScope);
    }),
    vscode.commands.registerCommand(cmd('exportReport'), async () => {
      await exportReport();
    }),
    vscode.commands.registerCommand(cmd('openFinding'), async (findingId?: string) => {
      await openFinding(findingId);
    }),
    vscode.commands.registerCommand(
      cmd('dismissFinding'),
      async (item?: { finding?: { id: string } } | string) => {
        const id = typeof item === 'string' ? item : item?.finding?.id;
        if (!id) {
          return;
        }
        await addDismissedFinding(id);
        verificationState.dismissFinding(id);
      }
    ),
    vscode.commands.registerCommand(cmd('clearDismissed'), async () => {
      await clearDismissedFindings();
      void vscode.window.showInformationMessage(
        `${getProductName()}: cleared dismissed findings. Rerun checks to refresh.`
      );
    }),
    vscode.commands.registerCommand(cmd('openSettings'), async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'shipcheck');
    })
  );

  void vscode.commands.executeCommand(cmd('refreshFiles'));
  void maybeShowWelcome(context);
}

async function maybeShowWelcome(context: vscode.ExtensionContext): Promise<void> {
  const settings = getSettings();
  if (!settings.showWelcomeOnStartup) {
    return;
  }
  const seen = context.globalState.get<boolean>('shipcheck.welcomeSeen.v011');
  if (seen) {
    return;
  }
  await context.globalState.update('shipcheck.welcomeSeen.v011', true);
  const product = getProductName();
  const pick = await vscode.window.showInformationMessage(
    `${product} is ready. Click the shield on the left activity bar, or use the buttons below.`,
    'Open ShipCheck',
    'Check My Changes',
    'How it works'
  );
  if (pick === 'Open ShipCheck') {
    await showShipCheckPanel();
  } else if (pick === 'Check My Changes') {
    await vscode.commands.executeCommand(cmd('checkMyChanges'));
  } else if (pick === 'How it works') {
    await showGettingStarted();
  }
}

async function showShipCheckPanel(options?: { forceEditorTab?: boolean }): Promise<void> {
  // 1) Open the activity-bar container (creates/resolves the webview if needed)
  await safeExecute('workbench.view.extension.shipcheck');
  await safeExecute('shipcheck.sidebar.focus');
  await safeExecute('shipcheck.results.focus');

  // 2) Reveal via API when the webview has already been resolved
  const revealed = getSidebarProvider()?.reveal() ?? false;

  // 3) Always open an editor tab when requested, or when sidebar reveal failed
  if (options?.forceEditorTab || !revealed) {
    await openResultsEditorPanel();
  }
}

async function safeExecute(command: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(command);
  } catch {
    /* command may be unavailable in some hosts */
  }
}

async function showGettingStarted(): Promise<void> {
  const product = getProductName();
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: `# ${product} — How to use it

## 30-second path

1. Open a project folder that uses **Git** (any stack: Node, Python, Go, PHP/CMS, Java, Rust, Ruby, .NET…).
2. Edit a supported source file and **save** it.
3. Click the **shield** icon on the left (or press \`Cmd+Shift+P\` → **ShipCheck: Check My Changes**).
4. Read results in the ShipCheck side panel / **Open results** tab.

## Where is the panel?

- Left activity bar → **shield** icon  
- Or \`Cmd+Shift+P\` → **ShipCheck: Open ShipCheck Panel**  
- Or click **$(shield) ${product}: Check now** in the bottom status bar

## What do the statuses mean?

| Status | Meaning |
| --- | --- |
| **PASSED** | That check found no problems |
| **FAILED** | That check found problems — open **Results** / **Security** |
| **REVIEW REQUIRED** | Suggestions only (not confirmed bugs) |
| **NOT CHECKED / UNAVAILABLE** | Tool missing or nothing to scan — usually fine |

Passing does **not** mean the code is perfectly secure.

## Tips

- Prefer **Check My Changes** (Git diffs) over full workspace scans.
- Test files with sample fake keys are skipped in the secret scan by default.
- ${product} never edits, commits, or uploads your source.
`,
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function runScan(scope: 'changes' | 'workspace'): Promise<void> {
  const product = getProductName();
  const report = await runner.run(scope);
  if (!report) {
    return;
  }
  verificationState.setReport(report);
  await showShipCheckPanel();

  const label = statusLabel(report.overallStatus);
  if (report.cancelled) {
    void vscode.window.showWarningMessage(`${product}: scan cancelled.`);
    return;
  }

  if (report.overallStatus === 'NOT_CHECKED') {
    void vscode.window.showInformationMessage(
      `${product}: nothing to verify yet. Edit & save a JS/TS file, then check again.`,
      'How it works'
    ).then((pick) => {
      if (pick === 'How it works') {
        void showGettingStarted();
      }
    });
    return;
  }

  const findingCount = report.findings.length;
  const failed = report.checks.filter((c) => c.status === 'FAILED').map((c) => c.name);
  const reviewOnly = report.overallStatus === 'REVIEW_REQUIRED';

  const detail =
    failed.length > 0
      ? `Failed: ${failed.join(', ')}. Click Open results for file + line details.`
      : reviewOnly
        ? `${findingCount} review suggestion(s) — not confirmed bugs. Click Open results to read them.`
        : `${report.checks.length} check(s), ${findingCount} finding(s).`;

  const msg = `${product}: ${label}. ${detail}`;

  const show = async (
    kind: 'info' | 'warn' | 'error',
    text: string
  ): Promise<void> => {
    const buttons = ['Open results', 'How it works'] as const;
    const pick =
      kind === 'error'
        ? await vscode.window.showErrorMessage(text, ...buttons)
        : kind === 'warn'
          ? await vscode.window.showWarningMessage(text, ...buttons)
          : await vscode.window.showInformationMessage(text, ...buttons);
    if (pick === 'Open results') {
      await showShipCheckPanel({ forceEditorTab: true });
    } else if (pick === 'How it works') {
      await showGettingStarted();
    }
  };

  if (report.overallStatus === 'FAILED') {
    await show('error', msg);
  } else if (reviewOnly) {
    await show('warn', msg);
  } else {
    await show('info', msg);
  }
}

async function openFinding(findingId?: string): Promise<void> {
  if (!findingId) {
    return;
  }
  const finding = verificationState.getFinding(findingId);
  const report = verificationState.report;
  if (!finding || !report || !finding.filePath) {
    return;
  }
  const abs = resolveAbsolute(report.workspaceRoot, finding.filePath);
  const uri = vscode.Uri.file(abs);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  if (finding.line != null) {
    const line = Math.max(0, finding.line - 1);
    const col = Math.max(0, (finding.column ?? 1) - 1);
    const pos = new vscode.Position(line, col);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenter
    );
  }
}

async function exportReport(): Promise<void> {
  const product = getProductName();
  const report = verificationState.report;
  if (!report) {
    void vscode.window.showWarningMessage(
      `${product}: run a check before exporting a report.`
    );
    return;
  }

  const markdown = buildMarkdownReport(report);
  const defaultName = `${product.toLowerCase().replace(/\s+/g, '-')}-report.md`;
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(report.workspaceRoot, defaultName)),
    filters: { Markdown: ['md'] },
    saveLabel: 'Export report',
  });
  if (!uri) {
    return;
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown, 'utf8'));
  void vscode.window.showInformationMessage(`${product}: report saved.`);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
}

export function deactivate(): void {
  runner?.cancel();
}
