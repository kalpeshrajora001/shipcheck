import * as vscode from 'vscode';
import { getProductName } from '../config';
import { verificationState } from '../state/verificationState';
import { statusLabel } from '../types';

/**
 * Always-visible editor tab fallback when the activity-bar webview cannot be focused
 * (common in some Cursor builds).
 */
export async function openResultsEditorPanel(): Promise<void> {
  const product = getProductName();
  const report = verificationState.report;
  const panel = vscode.window.createWebviewPanel(
    'shipcheck.resultsPanel',
    `${product} results`,
    vscode.ViewColumn.Beside,
    { enableScripts: false, retainContextWhenHidden: true }
  );

  const overall = report ? statusLabel(report.overallStatus) : 'Not run yet';
  const checks = report?.checks ?? [];
  const findings = report?.findings ?? [];

  const checkRows = checks
    .map(
      (c) =>
        `<tr><td>${esc(c.name)}</td><td><strong>${esc(statusLabel(c.status))}</strong></td><td>${esc(c.summary)}</td></tr>`
    )
    .join('');

  const findingRows = findings
    .map((f) => {
      const loc =
        f.filePath != null
          ? `${f.filePath}${f.line != null ? `:${f.line}` : ''}`
          : '—';
      return `<tr>
        <td>${esc(f.title)}</td>
        <td>${esc(f.severity)}</td>
        <td><code>${esc(loc)}</code></td>
        <td>${esc(f.message)}</td>
        <td>${esc(f.suggestion ?? '')}</td>
      </tr>`;
    })
    .join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
  h1 { margin-top: 0; }
  .banner {
    padding: 12px 14px; margin: 12px 0 18px;
    border-left: 4px solid var(--vscode-button-background);
    background: var(--vscode-editor-inactiveSelectionBackground);
  }
  table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; font-size: 13px; }
  th, td { border: 1px solid var(--vscode-widget-border, #444); padding: 8px; text-align: left; vertical-align: top; }
  th { background: var(--vscode-editor-inactiveSelectionBackground); }
  code { font-size: 12px; }
  .muted { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h1>${esc(product)} results</h1>
  <div class="banner">
    <div><strong>Status:</strong> ${esc(overall)}</div>
    <p class="muted" style="margin:8px 0 0">
      <strong>REVIEW REQUIRED</strong> means suggestions to look at — not confirmed bugs or vulnerabilities.<br/>
      <strong>FAILED</strong> means a concrete check problem (lint, types, secrets, tests).<br/>
      Use the lists below, or the ShipCheck shield on the left activity bar.
    </p>
  </div>

  <h2>Checks</h2>
  <table>
    <thead><tr><th>Check</th><th>Status</th><th>Summary</th></tr></thead>
    <tbody>${checkRows || '<tr><td colspan="3">No checks yet.</td></tr>'}</tbody>
  </table>

  <h2>Findings (${findings.length})</h2>
  <table>
    <thead><tr><th>Title</th><th>Severity</th><th>Location</th><th>Evidence</th><th>Next action</th></tr></thead>
    <tbody>${findingRows || '<tr><td colspan="5">No open findings.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
