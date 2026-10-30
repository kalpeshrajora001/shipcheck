import * as vscode from 'vscode';
import { ChangedFile, Finding, VerificationReport } from '../types';

/**
 * In-memory verification state shared across views and commands.
 */
export class VerificationState {
  private _report: VerificationReport | undefined;
  private _changedFiles: ChangedFile[] = [];
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  get report(): VerificationReport | undefined {
    return this._report;
  }

  get changedFiles(): ChangedFile[] {
    return this._changedFiles;
  }

  setChangedFiles(files: ChangedFile[]): void {
    this._changedFiles = files;
    this._onDidChange.fire();
  }

  setReport(report: VerificationReport): void {
    this._report = report;
    this._changedFiles = report.changedFiles;
    this._onDidChange.fire();
  }

  dismissFinding(id: string): void {
    if (!this._report) {
      return;
    }
    this._report.findings = this._report.findings.filter((f) => f.id !== id);
    for (const check of this._report.checks) {
      check.findings = check.findings.filter((f) => f.id !== id);
    }
    this._onDidChange.fire();
  }

  getFinding(id: string): Finding | undefined {
    return this._report?.findings.find((f) => f.id === id);
  }

  clear(): void {
    this._report = undefined;
    this._changedFiles = [];
    this._onDidChange.fire();
  }
}

export const verificationState = new VerificationState();
