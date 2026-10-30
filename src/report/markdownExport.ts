import { VerificationReport, statusLabel, Finding } from '../types';

export function buildMarkdownReport(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push(`# ${report.productName} Verification Report`);
  lines.push('');
  lines.push(`- **Generated:** ${report.createdAt}`);
  lines.push(`- **Workspace:** \`${report.workspaceRoot}\``);
  lines.push(`- **Scope:** ${report.scope}`);
  lines.push(`- **Overall status:** ${statusLabel(report.overallStatus)}`);
  lines.push('');
  lines.push(
    '> This report lists check outcomes and findings. It does **not** provide a safety score. Passing checks does **not** guarantee secure or correct code.'
  );
  lines.push('');

  lines.push('## Changed files');
  lines.push('');
  if (report.changedFiles.length === 0) {
    lines.push('_No changed files recorded._');
  } else {
    lines.push('| Path | Status | Staged |');
    lines.push('| --- | --- | --- |');
    for (const f of report.changedFiles) {
      lines.push(
        `| \`${f.relativePath}\` | ${f.status} | ${f.staged ? 'yes' : 'no'} |`
      );
    }
  }
  lines.push('');

  lines.push('## Checks');
  lines.push('');
  lines.push('| Check | Status | Summary | Duration |');
  lines.push('| --- | --- | --- | --- |');
  for (const c of report.checks) {
    const dur = c.durationMs != null ? `${c.durationMs} ms` : '—';
    lines.push(
      `| ${c.name} | ${statusLabel(c.status)} | ${escapeCells(c.summary)} | ${dur} |`
    );
  }
  lines.push('');

  lines.push('## Findings');
  lines.push('');
  const findings = report.findings.filter((f) => !f.dismissed);
  if (findings.length === 0) {
    lines.push('_No open findings._');
  } else {
    for (const f of findings) {
      lines.push(formatFinding(f));
      lines.push('');
    }
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- Secrets in evidence are masked.');
  lines.push(
    '- Items labeled as review suggestions are heuristics, not confirmed vulnerabilities.'
  );
  lines.push(
    '- Source was not modified, staged, committed, or uploaded by this tool.'
  );
  lines.push('');

  return lines.join('\n');
}

function formatFinding(f: Finding): string {
  const loc =
    f.filePath != null
      ? `\`${f.filePath}\`${f.line != null ? `:${f.line}` : ''}${f.column != null ? `:${f.column}` : ''}`
      : '_n/a_';
  const parts = [
    `### ${f.title}`,
    '',
    `- **Kind:** ${f.kind}`,
    `- **Severity:** ${f.severity}`,
    `- **Location:** ${loc}`,
    `- **Evidence:** ${f.message}`,
  ];
  if (f.isReviewSuggestion) {
    parts.push(
      '- **Note:** Review suggestion only — **not** a confirmed vulnerability.'
    );
  }
  if (f.suggestion) {
    parts.push(`- **Suggested next action:** ${f.suggestion}`);
  }
  return parts.join('\n');
}

function escapeCells(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
