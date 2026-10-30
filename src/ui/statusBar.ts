import * as vscode from 'vscode';
import { getProductName, cmd } from '../config';
import { verificationState } from '../state/verificationState';
import { statusLabel } from '../types';

export function registerStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  item.command = cmd('checkMyChanges');
  update(item);
  item.show();

  context.subscriptions.push(
    item,
    verificationState.onDidChange(() => update(item)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('shipcheck')) {
        update(item);
      }
    })
  );
}

function update(item: vscode.StatusBarItem): void {
  const product = getProductName();
  const report = verificationState.report;
  if (!report) {
    item.text = `$(shield) ${product}: Check now`;
    item.tooltip = `Click to run ${product} on your Git changes`;
    item.backgroundColor = undefined;
    return;
  }
  const label = statusLabel(report.overallStatus);
  item.text = `$(shield) ${product}: ${label}`;
  item.tooltip = `Last result: ${label}. Click to run again.`;
  if (report.overallStatus === 'FAILED') {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (report.overallStatus === 'REVIEW_REQUIRED') {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    item.backgroundColor = undefined;
  }
}
