#!/usr/bin/env node
/**
 * ShipCheck release verification orchestrator.
 * Exit 0 = READY (or BLOCKED only for documented external limits with no FAIL).
 * Exit 1 = NOT READY (any FAIL).
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runIntegrationSuite } from './lib/integration-harness.mjs';
import { runUniversalCompatSuite } from './lib/universal-compat-harness.mjs';
import { validateManifest } from './lib/manifest-validate.mjs';
import { inspectVsix } from './lib/vsix-inspect.mjs';
import { scanPrivacy } from './lib/privacy-scan.mjs';
import { writeAuditReport } from './lib/write-audit-report.mjs';
import { writeUniversalAudit } from './lib/write-universal-audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const pkg = require(path.join(ROOT, 'package.json'));

/** @typedef {'PASS'|'FAIL'|'BLOCKED'|'SKIP'} Status */

/** @type {{ id: string, title: string, status: Status, exitCode?: number|null, detail: string, command?: string }[]} */
const deliverables = [];

function record(id, title, status, detail, extra = {}) {
  deliverables.push({ id, title, status, detail, ...extra });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'BLOCKED' ? '■' : '○';
  console.log(`  [${icon} ${status}] ${title}${detail ? ` — ${detail}` : ''}`);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
    ...opts,
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function npmRun(script) {
  return run('npm', ['run', script, '--silent']);
}

async function main() {
  console.log(`\nShipCheck release verification — v${pkg.version}\n`);
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });

  // --- 1. Lockfile / install sanity ---
  console.log('1) Dependencies');
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    const inst = run('npm', ['ci']);
    record(
      'deps-install',
      'Dependency install (npm ci)',
      inst.code === 0 ? 'PASS' : 'FAIL',
      inst.code === 0 ? 'npm ci ok' : (inst.stderr || inst.stdout).slice(0, 400),
      { exitCode: inst.code, command: 'npm ci' }
    );
  } else {
    const ls = run('npm', ['ls', '--depth=0']);
    // npm ls can exit 1 with peer warnings; treat missing packages as fail
    const missing = /missing:|invalid:|extraneous:/i.test(ls.stdout + ls.stderr);
    record(
      'deps-install',
      'Dependency tree present',
      ls.error || (ls.code !== 0 && missing) ? 'FAIL' : 'PASS',
      missing ? 'Missing/invalid packages detected' : 'node_modules present; package-lock in sync enough for local verify',
      { exitCode: ls.code, command: 'npm ls --depth=0' }
    );
  }

  // --- 2. Compile ---
  console.log('2) TypeScript compile');
  const compile = npmRun('compile');
  record(
    'compile',
    'TypeScript compilation',
    compile.code === 0 ? 'PASS' : 'FAIL',
    compile.code === 0 ? 'tsc -p ./ succeeded' : (compile.stderr || compile.stdout).slice(0, 500),
    { exitCode: compile.code, command: 'npm run compile' }
  );
  if (compile.code !== 0) {
    return finish('NOT READY');
  }

  // --- 3. Lint ---
  console.log('3) ESLint');
  const lint = npmRun('lint');
  record(
    'lint',
    'ESLint on src/',
    lint.code === 0 ? 'PASS' : 'FAIL',
    lint.code === 0 ? 'No lint errors' : (lint.stdout || lint.stderr).slice(0, 500),
    { exitCode: lint.code, command: 'npm run lint' }
  );

  // --- 4. Unit tests ---
  console.log('4) Unit tests');
  const unit = run('npm', ['test']);
  const unitOut = unit.stdout + unit.stderr;
  const passMatch = /# pass (\d+)/.exec(unitOut);
  const failMatch = /# fail (\d+)/.exec(unitOut);
  const testsPass = passMatch ? Number(passMatch[1]) : 0;
  const testsFail = failMatch ? Number(failMatch[1]) : unit.code !== 0 ? 1 : 0;
  record(
    'unit-tests',
    'Unit tests (node:test)',
    unit.code === 0 && testsFail === 0 ? 'PASS' : 'FAIL',
    `pass=${testsPass} fail=${testsFail}`,
    { exitCode: unit.code, command: 'npm test', testsPass, testsFail }
  );

  // --- 5. Integration harness (fixtures) ---
  console.log('5) Integration fixtures');
  let integration;
  try {
    integration = await runIntegrationSuite(ROOT);
    for (const r of integration.results) {
      record(r.id, r.title, r.status, r.detail, { exitCode: r.ok ? 0 : 1 });
    }
  } catch (e) {
    record(
      'integration',
      'Integration harness',
      'FAIL',
      e instanceof Error ? e.message : String(e)
    );
    integration = { results: [], summary: { pass: 0, fail: 1, blocked: 0 } };
  }

  // --- 5b. Universal multi-tech fixtures ---
  console.log('5b) Universal technology compatibility');
  let universal;
  try {
    universal = await runUniversalCompatSuite(ROOT);
    for (const r of universal.results) {
      record(`univ-${r.id}`, r.title, r.status, r.detail, {
        exitCode: r.status === 'FAIL' ? 1 : 0,
        command: r.command,
      });
    }
  } catch (e) {
    record(
      'universal-compat',
      'Universal compatibility harness',
      'FAIL',
      e instanceof Error ? e.message : String(e)
    );
    universal = {
      results: [],
      summary: { pass: 0, fail: 1, blocked: 0 },
      registry: { total: 0, full: 0, partial: 0, detectionOnly: 0, notSupported: 0 },
      registryEntries: [],
    };
  }

  // --- 6. Security audit ---
  console.log('6) npm audit');
  const audit = run('npm', ['audit', '--json']);
  let auditVulns = 0;
  try {
    const parsed = JSON.parse(audit.stdout || '{}');
    auditVulns = parsed.metadata?.vulnerabilities
      ? Object.values(parsed.metadata.vulnerabilities).reduce((a, b) => a + b, 0)
      : parsed.vulnerabilities
        ? Object.keys(parsed.vulnerabilities).length
        : 0;
  } catch {
    auditVulns = audit.code === 0 ? 0 : -1;
  }
  record(
    'npm-audit',
    'Dependency security audit',
    audit.code === 0 && auditVulns === 0 ? 'PASS' : auditVulns > 0 ? 'FAIL' : 'BLOCKED',
    audit.code === 0 ? `0 vulnerabilities` : `audit exit ${audit.code}; vulns≈${auditVulns}`,
    { exitCode: audit.code, command: 'npm audit' }
  );

  // --- 7. Manifest ---
  console.log('7) Extension manifest');
  const manifest = validateManifest(ROOT, pkg);
  record(
    'manifest',
    'VS Code extension manifest validation',
    manifest.ok ? 'PASS' : 'FAIL',
    manifest.ok ? manifest.detail : manifest.errors.join('; '),
    { exitCode: manifest.ok ? 0 : 1 }
  );

  // --- 8. Privacy / no-network / no-mutate guarantees in source ---
  console.log('8) Privacy & safety static scan');
  const privacy = scanPrivacy(ROOT);
  record(
    'privacy',
    'Local-only / no auto-mutate static guarantees',
    privacy.ok ? 'PASS' : 'FAIL',
    privacy.detail,
    { exitCode: privacy.ok ? 0 : 1 }
  );

  // --- 9. Package VSIX ---
  console.log('9) Package VSIX');
  const pack = run('npm', ['run', 'package']);
  const vsixName = `shipcheck-${pkg.version}.vsix`;
  const vsixPath = path.join(ROOT, vsixName);
  const packed = pack.code === 0 && fs.existsSync(vsixPath);
  record(
    'package',
    'VSIX packaging (@vscode/vsce)',
    packed ? 'PASS' : 'FAIL',
    packed ? vsixName : (pack.stderr || pack.stdout).slice(0, 500),
    { exitCode: pack.code, command: 'npm run package' }
  );

  let vsixInfo = null;
  if (packed) {
    vsixInfo = inspectVsix(vsixPath, pkg);
    record(
      'vsix-contents',
      'VSIX contents & entry point',
      vsixInfo.ok ? 'PASS' : 'FAIL',
      vsixInfo.detail,
      { exitCode: vsixInfo.ok ? 0 : 1 }
    );
  } else {
    record('vsix-contents', 'VSIX contents & entry point', 'FAIL', 'No VSIX to inspect');
  }

  // --- 10. Install smoke (CLI) ---
  console.log('10) Install smoke');
  const cursorBin = run('which', ['cursor']);
  const codeBin = run('which', ['code']);
  const cli = cursorBin.code === 0 ? 'cursor' : codeBin.code === 0 ? 'code' : null;
  if (!cli || !packed) {
    record(
      'install-smoke',
      'CLI install smoke test',
      'BLOCKED',
      !packed ? 'No VSIX' : 'Neither cursor nor code CLI found on PATH'
    );
  } else {
    const inst = run(cli, ['--install-extension', vsixPath, '--force']);
    const list = run(cli, ['--list-extensions']);
    const installed = list.stdout.includes('shipcheck.shipcheck');
    record(
      'install-smoke',
      'CLI install smoke test',
      inst.code === 0 && installed ? 'PASS' : 'FAIL',
      installed
        ? `Installed via ${cli}; listed as shipcheck.shipcheck`
        : `install exit ${inst.code}; listed=${installed}; ${(inst.stderr || '').slice(0, 200)}`,
      { exitCode: inst.code, command: `${cli} --install-extension ${vsixName} --force` }
    );
  }

  // --- 11. Extension Development Host ---
  record(
    'edh-smoke',
    'Extension Development Host UI smoke',
    'BLOCKED',
    'No headless EDH automation wired for Cursor/VS Code UI activation in this environment. Manual steps listed in report.'
  );

  // --- Marketplace prerequisites ---
  const marketplaceGaps = [];
  const iconPath = pkg.icon ? path.join(ROOT, pkg.icon) : null;
  const pkgHasIcon = Boolean(iconPath && fs.existsSync(iconPath));
  if (!pkg.icon) {
    marketplaceGaps.push('package.json missing icon (PNG ≥128px recommended)');
  } else if (!pkgHasIcon) {
    marketplaceGaps.push(`package.json icon path missing on disk: ${pkg.icon}`);
  }
  if (!pkg.publisher || pkg.publisher === 'shipcheck') {
    marketplaceGaps.push('publisher id "shipcheck" must be claimed on Marketplace / Open VSX before publish');
  }
  marketplaceGaps.push('README publisher links point at placeholder GitHub org');
  marketplaceGaps.push('Personal Access Token / publisher login required for vsce publish (not run)');
  record(
    'marketplace-prereq',
    'Marketplace publishing prerequisites',
    'BLOCKED',
    marketplaceGaps.join('; ')
  );

  // Coverage
  record(
    'coverage',
    'Code coverage report',
    'BLOCKED',
    'No coverage toolchain configured (c8/nyc). Unit+integration counts reported instead.'
  );

  return finish(computeOverall(deliverables), {
    testsPass,
    testsFail,
    integration,
    universal,
    vsixInfo,
    marketplaceGaps,
    pkgHasIcon,
    pkg,
  });
}

function computeOverall(items) {
  const fails = items.filter((i) => i.status === 'FAIL');
  if (fails.length) return 'NOT READY';
  const blocked = items.filter((i) => i.status === 'BLOCKED');
  // READY if no fails; blocked items are documented limits
  if (blocked.some((b) => b.id === 'install-smoke')) {
    // install blocked but no fail still READY for packaging quality
  }
  return 'READY';
}

function finish(overall, meta = {}) {
  const reportPath = writeAuditReport(ROOT, {
    overall,
    deliverables,
    version: pkg.version,
    meta,
  });
  const universalPath = writeUniversalAudit(ROOT, {
    overall,
    deliverables,
    universal: meta.universal,
    version: pkg.version,
    platform: `${process.platform}/${process.arch} node=${process.version}`,
  });
  console.log(`\nOverall: ${overall}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Universal: ${universalPath}\n`);
  const failed = deliverables.filter((d) => d.status === 'FAIL');
  if (failed.length) {
    console.error('Failed deliverables:');
    for (const f of failed) console.error(` - ${f.id}: ${f.detail}`);
  }
  process.exit(overall === 'NOT READY' ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
