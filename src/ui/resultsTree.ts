import * as vscode from 'vscode';
import { CheckResult, Finding, statusLabel } from '../types';
import { verificationState } from '../state/verificationState';
import { cmd } from '../config';

type Node = CheckNode | FindingNode;

export class ResultsTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    Node | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    verificationState.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Node): Node[] {
    const report = verificationState.report;
    if (!report) {
      return [];
    }
    if (!element) {
      return report.checks.map((c) => new CheckNode(c));
    }
    if (element instanceof CheckNode) {
      return element.check.findings
        .filter((f) => !f.dismissed && f.kind !== 'security' && f.kind !== 'risk_review')
        .map((f) => new FindingNode(f));
    }
    return [];
  }
}

export class CheckNode extends vscode.TreeItem {
  constructor(public readonly check: CheckResult) {
    super(
      check.name,
      check.findings.filter((f) => !f.dismissed && f.kind !== 'security' && f.kind !== 'risk_review')
        .length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );
    this.description = statusLabel(check.status);
    this.tooltip = `${check.description}\n${check.summary}${check.detail ? `\n${check.detail}` : ''}`;
    this.iconPath = new vscode.ThemeIcon(iconForStatus(check.status));
    this.contextValue = 'shipcheck.check';
  }
}

export class FindingNode extends vscode.TreeItem {
  constructor(public readonly finding: Finding) {
    super(finding.title, vscode.TreeItemCollapsibleState.None);
    const loc =
      finding.filePath != null
        ? `${finding.filePath}${finding.line != null ? `:${finding.line}` : ''}`
        : '';
    this.description = loc;
    this.tooltip = [
      finding.message,
      finding.suggestion ? `Next: ${finding.suggestion}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    this.iconPath = new vscode.ThemeIcon(iconForSeverity(finding.severity));
    this.contextValue = 'shipcheck.finding';
    this.command = {
      command: cmd('openFinding'),
      title: 'Open Finding',
      arguments: [finding.id],
    };
  }
}

function iconForStatus(status: string): string {
  switch (status) {
    case 'PASSED':
      return 'pass';
    case 'FAILED':
      return 'error';
    case 'REVIEW_REQUIRED':
      return 'warning';
    case 'SKIPPED':
      return 'debug-step-over';
    case 'UNAVAILABLE':
      return 'circle-slash';
    case 'NOT_CONFIGURED':
      return 'settings-gear';
    case 'CANCELLED':
      return 'debug-stop';
    default:
      return 'circle-outline';
  }
}

function iconForSeverity(severity: string): string {
  switch (severity) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'review':
      return 'eye';
    default:
      return 'info';
  }
}

export function registerResultsView(context: vscode.ExtensionContext): void {
  const provider = new ResultsTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('shipcheck.results', provider)
  );
}
