import * as fs from 'node:fs';
import * as path from 'node:path';

export function writeAuditReport(root, { overall, deliverables, version, meta }) {
  const outDir = path.join(root, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'SHIPCHECK_RELEASE_AUDIT.md');
  const now = new Date().toISOString();

  const by = (s) => deliverables.filter((d) => d.status === s);

  const lines = [];
  lines.push(`# ShipCheck Release Audit`);
  lines.push('');
  lines.push(`- **Generated:** ${now}`);
  lines.push(`- **Extension version:** ${version}`);
  lines.push(`- **Overall result:** **${overall}**`);
  lines.push('');
  lines.push(`> This report was produced by \`npm run verify:release\`. Statuses reflect executed checks, not documentation claims.`);
  lines.push('');

  lines.push(`## Summary counts`);
  lines.push('');
  lines.push(`| Status | Count |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| PASS | ${by('PASS').length} |`);
  lines.push(`| FAIL | ${by('FAIL').length} |`);
  lines.push(`| BLOCKED | ${by('BLOCKED').length} |`);
  lines.push(`| SKIP | ${by('SKIP').length} |`);
  lines.push('');

  lines.push(`## Deliverables`);
  lines.push('');
  lines.push(`| ID | Deliverable | Result | Exit | Detail |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  for (const d of deliverables) {
    lines.push(
      `| \`${d.id}\` | ${esc(d.title)} | **${d.status}** | ${d.exitCode ?? '—'} | ${esc(d.detail || '')} |`
    );
  }
  lines.push('');

  lines.push(`## Commands executed`);
  lines.push('');
  for (const d of deliverables.filter((x) => x.command)) {
    lines.push(`- \`${d.command}\` → exit **${d.exitCode ?? 'n/a'}** (${d.status})`);
  }
  lines.push('');

  lines.push(`## Tests`);
  lines.push('');
  lines.push(`- Unit tests pass: **${meta.testsPass ?? 'n/a'}**, fail: **${meta.testsFail ?? 'n/a'}**`);
  if (meta.integration?.summary) {
    lines.push(
      `- Integration fixtures: pass=${meta.integration.summary.pass}, fail=${meta.integration.summary.fail}, blocked=${meta.integration.summary.blocked}`
    );
  }
  lines.push(`- Coverage: not configured (see BLOCKED coverage deliverable)`);
  lines.push('');

  lines.push(`## VSIX package`);
  lines.push('');
  if (meta.vsixInfo) {
    const v = meta.vsixInfo;
    lines.push(`- **Name:** ${v.name}`);
    lines.push(`- **Version:** ${v.version}`);
    lines.push(`- **Size:** ${v.sizeKb} KB (${v.sizeBytes} bytes)`);
    lines.push(`- **Inspection:** ${v.detail}`);
  } else {
    lines.push(`- No VSIX inspected.`);
  }
  lines.push('');

  lines.push(`## Missing features / defects observed`);
  lines.push('');
  const fails = by('FAIL');
  if (fails.length === 0) {
    lines.push(`- No FAIL deliverables in this run.`);
  } else {
    for (const f of fails) lines.push(`- **${f.id}**: ${f.detail}`);
  }
  lines.push('');
  lines.push(`### Known product gaps (not necessarily FAIL)`);
  lines.push('');
  if (!meta.pkgHasIcon) {
    lines.push(`- No Marketplace \`icon\` PNG in package.json (SVG activity icon only).`);
  }
  lines.push(`- Jest/Vitest full execution paths require VS Code modal confirmation UI (covered via detector + skip/not-configured paths in fixtures; live modal is manual).`);
  lines.push(`- Risk review is heuristic and can surface REVIEW REQUIRED on framework code.`);
  lines.push(`- Multi-root workspaces use the first folder only.`);
  lines.push(`- No automated Extension Development Host UI suite.`);
  lines.push('');

  lines.push(`## Security & dependencies`);
  lines.push('');
  const audit = deliverables.find((d) => d.id === 'npm-audit');
  const privacy = deliverables.find((d) => d.id === 'privacy');
  lines.push(`- npm audit: ${audit ? audit.status + ' — ' + audit.detail : 'n/a'}`);
  lines.push(`- Privacy/static safety: ${privacy ? privacy.status + ' — ' + privacy.detail : 'n/a'}`);
  lines.push('');

  lines.push(`## Marketplace publishing prerequisites (outstanding)`);
  lines.push('');
  for (const g of meta.marketplaceGaps || []) lines.push(`- ${g}`);
  lines.push(`- Do **not** run \`vsce publish\` from this verify script.`);
  lines.push('');

  lines.push(`## Manual verification steps (cannot fully automate here)`);
  lines.push('');
  lines.push(`1. \`Developer: Reload Window\` after VSIX install.`);
  lines.push(`2. Confirm activity-bar shield / **ShipCheck: Open Results** opens UI.`);
  lines.push(`3. Run **Check My Changes** on a Git JS/TS repo; confirm progress notification + cancel.`);
  lines.push(`4. Click a finding → editor opens at line; dismiss finding; rerun.`);
  lines.push(`5. Export Markdown report via command and open the file.`);
  lines.push(`6. With \`confirmScriptExecution: true\`, confirm Jest/Vitest modal appears when those tools exist.`);
  lines.push(`7. Confirm Prettier/ESLint UNAVAILABLE vs FAILED messaging on a project without those tools.`);
  lines.push('');

  lines.push(`## Verdict`);
  lines.push('');
  lines.push(`**${overall}** — ${
    overall === 'READY'
      ? 'No FAIL deliverables. BLOCKED items are documented external/manual limits.'
      : overall === 'BLOCKED'
        ? 'External blocker prevented full proof; see BLOCKED rows.'
        : 'One or more FAIL deliverables must be fixed before release.'
  }`);
  lines.push('');

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

function esc(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
