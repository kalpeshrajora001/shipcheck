import * as fs from 'node:fs';
import * as path from 'node:path';

export function writeUniversalAudit(root, payload) {
  const outPath = path.join(root, 'reports', 'SHIPCHECK_UNIVERSAL_COMPATIBILITY_AUDIT.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const { overall, deliverables, universal, version, platform } = payload;
  const lines = [];
  lines.push('# ShipCheck Universal Compatibility Audit');
  lines.push('');
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push(`- **Extension version:** ${version}`);
  lines.push(`- **Host:** ${platform}`);
  lines.push(`- **Overall:** **${overall}**`);
  lines.push('');
  lines.push('> Capability claims are taken from the central registry and verified against fixtures/adapters. Detection-only entries are not advertised as FULL.');
  lines.push('');

  const reg = universal?.registry || {};
  lines.push('## Technology totals (registry)');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Total registered | ${reg.total ?? 0} |`);
  lines.push(`| FULL | ${reg.full ?? 0} |`);
  lines.push(`| PARTIAL | ${reg.partial ?? 0} |`);
  lines.push(`| DETECTION ONLY | ${reg.detectionOnly ?? 0} |`);
  lines.push(`| NOT SUPPORTED | ${reg.notSupported ?? 0} |`);
  lines.push('');

  lines.push('## Capability matrix');
  lines.push('');
  lines.push('| Technology | Level | Detection | Checks | Adapter |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const t of universal?.registryEntries || []) {
    lines.push(
      `| ${t.name} (\`${t.id}\`) | **${t.level}** | ${t.category} | ${(t.checks || []).join('; ') || '—'} | \`${t.id}\` |`
    );
  }
  lines.push('');

  lines.push('## Fixture / execution results');
  lines.push('');
  lines.push('| ID | Result | Fixture | Command / detail |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of universal?.results || []) {
    lines.push(
      `| \`${r.id}\` | **${r.status}** | ${r.fixture || '—'} | ${esc(r.command || '')} — ${esc(r.detail || '')} |`
    );
  }
  lines.push('');

  lines.push('## Release deliverables (subset)');
  lines.push('');
  for (const d of deliverables || []) {
    lines.push(`- **${d.status}** \`${d.id}\`: ${d.detail}`);
  }
  lines.push('');

  lines.push('## Remaining limitations');
  lines.push('');
  lines.push('- Frameworks marked DETECTION_ONLY (WordPress, Laravel, Django) inherit language adapters; no framework-specific CLI yet.');
  lines.push('- Jest/Vitest/pytest/go test/phpunit/dotnet test require confirmation UI — not auto-run in headless verify.');
  lines.push('- Host tools absent on the verify machine are BLOCKED, not silently PASSED.');
  lines.push('- YAML/HTML checks are heuristic, not full language servers.');
  lines.push('- Extension Development Host UI journey remains manual.');
  lines.push('');

  lines.push('## Verdict');
  lines.push('');
  lines.push(`**${overall}**`);
  lines.push('');

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

function esc(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
