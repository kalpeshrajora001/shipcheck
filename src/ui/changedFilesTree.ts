import * as vscode from 'vscode';
import { ChangedFile } from '../types';
import { verificationState } from '../state/verificationState';
import { cmd } from '../config';

export class ChangedFilesTreeProvider
  implements vscode.TreeDataProvider<ChangedFileItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ChangedFileItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    verificationState.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChangedFileItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChangedFileItem): ChangedFileItem[] {
    if (element) {
      return [];
    }
    return verificationState.changedFiles.map((f) => new ChangedFileItem(f));
  }
}

export class ChangedFileItem extends vscode.TreeItem {
  constructor(public readonly file: ChangedFile) {
    super(file.relativePath, vscode.TreeItemCollapsibleState.None);
    const badge = statusBadge(file);
    this.description = badge;
    this.tooltip = `${file.relativePath}\nStatus: ${file.status}${file.staged ? ' (staged)' : ''}`;
    this.iconPath = new vscode.ThemeIcon(iconFor(file));
    this.contextValue = 'shipcheck.changedFile';
    if (file.status !== 'deleted') {
      this.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [vscode.Uri.file(file.absolutePath)],
      };
    }
  }
}

function statusBadge(file: ChangedFile): string {
  const parts = [file.status];
  if (file.staged) {
    parts.push('staged');
  }
  return parts.join(' · ');
}

function iconFor(file: ChangedFile): string {
  switch (file.status) {
    case 'added':
    case 'untracked':
      return 'diff-added';
    case 'deleted':
      return 'diff-removed';
    case 'renamed':
      return 'diff-renamed';
    default:
      return 'diff-modified';
  }
}

export function registerChangedFilesView(context: vscode.ExtensionContext): void {
  const provider = new ChangedFilesTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('shipcheck.changedFiles', provider),
    vscode.commands.registerCommand(cmd('refreshFiles'), async () => {
      const { detectGitRoot, getChangedFiles } = await import('../git/gitService');
      const { getSettings } = await import('../config');
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        return;
      }
      const git = await detectGitRoot(folder.uri.fsPath);
      if (!git.isRepo) {
        verificationState.setChangedFiles([]);
        return;
      }
      const settings = getSettings();
      const files = await getChangedFiles(git.root, settings.includeUntracked);
      verificationState.setChangedFiles(files);
    })
  );
}
