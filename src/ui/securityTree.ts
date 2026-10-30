import * as vscode from 'vscode';
import { Finding } from '../types';
import { verificationState } from '../state/verificationState';
import { cmd } from '../config';

type Node = SectionNode | FindingNode;

export class SecurityTreeProvider implements vscode.TreeDataProvider<Node> {
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
    const security = report.findings.filter(
      (f) => !f.dismissed && f.kind === 'security'
    );
    const review = report.findings.filter(
      (f) => !f.dismissed && f.kind === 'risk_review'
    );

    if (!element) {
      const nodes: Node[] = [];
      if (security.length) {
        nodes.push(new SectionNode('Security findings', 'security', security.length));
      }
      if (review.length) {
        nodes.push(
          new SectionNode(
            'Review suggestions (not confirmed vulns)',
            'review',
            review.length
          )
        );
      }
      return nodes;
    }

    if (element instanceof SectionNode) {
      const list =
        element.section === 'security'
          ? security
          : review;
      return list.map((f) => new FindingNode(f));
    }
    return [];
  }
}

class SectionNode extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly section: 'security' | 'review',
    count: number
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = String(count);
    this.iconPath = new vscode.ThemeIcon(
      section === 'security' ? 'shield' : 'eye'
    );
    this.contextValue = 'shipcheck.section';
  }
}

class FindingNode extends vscode.TreeItem {
  constructor(public readonly finding: Finding) {
    super(finding.title, vscode.TreeItemCollapsibleState.None);
    const loc =
      finding.filePath != null
        ? `${finding.filePath}${finding.line != null ? `:${finding.line}` : ''}`
        : '';
    this.description = loc;
    this.tooltip = [
      finding.isReviewSuggestion
        ? 'REVIEW SUGGESTION — not a confirmed vulnerability'
        : 'SECURITY FINDING',
      finding.message,
      finding.suggestion ? `Next: ${finding.suggestion}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    this.iconPath = new vscode.ThemeIcon(
      finding.kind === 'security' ? 'key' : 'eye'
    );
    this.contextValue = 'shipcheck.finding';
    this.command = {
      command: cmd('openFinding'),
      title: 'Open Finding',
      arguments: [finding.id],
    };
  }
}

export function registerSecurityView(context: vscode.ExtensionContext): void {
  const provider = new SecurityTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('shipcheck.security', provider)
  );
}
