import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function sh(cwd, cmd, args) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'ShipCheck CI', GIT_AUTHOR_EMAIL: 'ci@shipcheck.local', GIT_COMMITTER_NAME: 'ShipCheck CI', GIT_COMMITTER_EMAIL: 'ci@shipcheck.local' } });
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

/**
 * @returns {Promise<{ results: Array<{id:string,title:string,status:string,detail:string,ok:boolean}>, summary: {pass:number,fail:number,blocked:number} }>}
 */
export async function runIntegrationSuite(extensionRoot) {
  const results = [];
  const push = (id, title, ok, detail, status) => {
    results.push({
      id,
      title,
      status: status || (ok ? 'PASS' : 'FAIL'),
      detail,
      ok,
    });
  };

  const {
    detectGitRoot,
    getChangedFiles,
    filterExistingJsTs,
  } = require(path.join(extensionRoot, 'out/git/gitService.js'));
  const { runSyntaxCheck } = require(path.join(extensionRoot, 'out/checks/syntaxCheck.js'));
  const { runEslintCheck } = require(path.join(extensionRoot, 'out/checks/eslintCheck.js'));
  const { runTypescriptCheck } = require(path.join(extensionRoot, 'out/checks/typescriptCheck.js'));
  const { runPrettierCheck } = require(path.join(extensionRoot, 'out/checks/prettierCheck.js'));
  const { runSecurityScan } = require(path.join(extensionRoot, 'out/checks/securityScan.js'));
  const { runRiskReview } = require(path.join(extensionRoot, 'out/checks/riskReview.js'));
  const { detectTools } = require(path.join(extensionRoot, 'out/detectors/toolDetector.js'));
  const { buildMarkdownReport } = require(path.join(extensionRoot, 'out/report/markdownExport.js'));
  const { computeOverallStatus, statusLabel } = require(path.join(extensionRoot, 'out/types.js'));
  const { maskSecrets } = require(path.join(extensionRoot, 'out/utils/secrets.js'));
  const { runCommand } = require(path.join(extensionRoot, 'out/utils/process.js'));

  // --- A. Git change detection fixture ---
  const gitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-git-'));
  try {
    sh(gitDir, 'git', ['init', '-b', 'main']);
    sh(gitDir, 'git', ['config', 'user.email', 'ci@shipcheck.local']);
    sh(gitDir, 'git', ['config', 'user.name', 'ShipCheck CI']);
    write(gitDir, 'keep.js', 'export const ok = 1;\n');
    write(gitDir, 'gone.js', 'export const gone = true;\n');
    sh(gitDir, 'git', ['add', '.']);
    sh(gitDir, 'git', ['commit', '-m', 'init']);

    write(gitDir, 'keep.js', 'export const ok = 2;\n'); // modified
    write(gitDir, 'fresh.js', 'export const fresh = true;\n'); // untracked
    fs.unlinkSync(path.join(gitDir, 'gone.js')); // deleted
    write(gitDir, 'staged.js', 'export const staged = true;\n');
    sh(gitDir, 'git', ['add', 'staged.js']);

    const git = await detectGitRoot(gitDir);
    const files = await getChangedFiles(git.root, true);
    const rels = files.map((f) => `${f.relativePath}:${f.status}${f.staged ? ':staged' : ''}`);
    const hasMod = files.some((f) => f.relativePath === 'keep.js' && f.status === 'modified');
    const hasUntracked = files.some((f) => f.relativePath === 'fresh.js' && f.status === 'untracked');
    const hasDeleted = files.some((f) => f.relativePath === 'gone.js' && f.status === 'deleted');
    const hasStaged = files.some((f) => f.relativePath === 'staged.js' && f.staged);
    const ok = git.isRepo && hasMod && hasUntracked && hasDeleted && hasStaged;
    push(
      'git-detection',
      'Git repo + modified/staged/untracked/deleted detection',
      ok,
      ok ? rels.join(', ') : `git.isRepo=${git.isRepo}; got=${rels.join(' | ')}`
    );
  } finally {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }

  // --- B. Non-git folder ---
  const nongit = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-nongit-'));
  try {
    const g = await detectGitRoot(nongit);
    push(
      'git-absent',
      'Non-Git folder detection',
      g.isRepo === false,
      g.isRepo ? 'incorrectly detected as repo' : 'isRepo=false as expected'
    );
  } finally {
    fs.rmSync(nongit, { recursive: true, force: true });
  }

  // --- C. JS project fixture: syntax fail + eslint + secrets + risk + prettier unavailable ---
  const jsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-js-'));
  try {
    write(
      jsDir,
      'package.json',
      JSON.stringify(
        {
          name: 'fixture-js',
          private: true,
          devDependencies: { eslint: '^8.57.0' },
        },
        null,
        2
      )
    );
    write(
      jsDir,
      '.eslintrc.json',
      JSON.stringify({ env: { es2022: true, node: true }, extends: ['eslint:recommended'] })
    );
    write(jsDir, 'bad.js', 'export const x = ;\n'); // syntax error
    write(jsDir, 'lint.js', 'unused_var = 1\n'); // lint error (no-undef + assign)
    // Build sample secret at runtime so this harness source does not contain a
    // contiguous sk_live_… token (avoids false Security FAILED when scanning ShipCheck itself).
    const sampleSecret = ['sk', 'live', 'abcdefghijklmnopqrstuvwxyz1234'].join('_');
    write(jsDir, 'secret.js', `const api_key = "${sampleSecret}";\n`);
    write(jsDir, 'auth.js', 'export function login() { return authenticate(user); }\n');

    // Install eslint only in fixture (network) — may BLOCKED if offline
    const inst = sh(jsDir, 'npm', ['install', '--no-fund', '--no-audit']);
    if (inst.status !== 0) {
      push(
        'fixture-eslint-install',
        'Fixture ESLint install',
        false,
        (inst.stderr || inst.stdout).slice(0, 300),
        'BLOCKED'
      );
    } else {
      push('fixture-eslint-install', 'Fixture ESLint install', true, 'npm install ok');

      const tools = detectTools(jsDir);
      const eslintResult = await runEslintCheck(
        jsDir,
        [path.join(jsDir, 'lint.js')],
        tools.eslint
      );
      const eslintOk =
        eslintResult.status === 'FAILED' &&
        eslintResult.findings.some((f) => f.filePath?.includes('lint.js') && f.line);
      push(
        'eslint-integration',
        'ESLint finds issues with file+line',
        eslintOk,
        `${eslintResult.status}: ${eslintResult.summary}; findings=${eslintResult.findings.length}`
      );
    }

    const syn = await runSyntaxCheck(jsDir, [path.join(jsDir, 'bad.js')]);
    push(
      'syntax-js-fail',
      'JS syntax check FAILED on broken file',
      syn.status === 'FAILED' && syn.findings.length > 0,
      `${syn.status}: ${syn.summary}`
    );

    const synOk = await runSyntaxCheck(jsDir, [path.join(jsDir, 'secret.js')]);
    push(
      'syntax-js-pass',
      'JS syntax check PASSED on valid file',
      synOk.status === 'PASSED',
      synOk.summary
    );

    const sec = await runSecurityScan(jsDir, [path.join(jsDir, 'secret.js')], 512);
    const masked =
      sec.findings.length > 0 &&
      !sec.findings.some((f) => f.message.includes('abcdefghijklmnopqrstuvwxyz1234'));
    push(
      'security-secrets',
      'Secret detection + masking',
      sec.status === 'FAILED' && masked,
      `${sec.status}; findings=${sec.findings.length}; masked=${masked}`
    );

    const risk = await runRiskReview(jsDir, [path.join(jsDir, 'auth.js')], 512);
    push(
      'risk-review',
      'Risk review suggestions labeled',
      risk.status === 'REVIEW_REQUIRED' &&
        risk.findings.every((f) => f.isReviewSuggestion) &&
        risk.findings.every((f) => /not a confirmed vulnerability/i.test(f.message)),
      `${risk.status}; findings=${risk.findings.length}`
    );

    const tools2 = detectTools(jsDir);
    const prettier = await runPrettierCheck(
      jsDir,
      [path.join(jsDir, 'secret.js')],
      tools2.prettier
    );
    push(
      'prettier-unavailable',
      'Prettier UNAVAILABLE when not installed',
      prettier.status === 'UNAVAILABLE' || prettier.status === 'NOT_CONFIGURED',
      `${prettier.status}: ${prettier.summary}`
    );

    const tsTools = detectTools(jsDir);
    const tsc = await runTypescriptCheck(jsDir, tsTools.typescript);
    push(
      'typescript-not-configured',
      'TypeScript NOT_CONFIGURED without tsconfig',
      tsc.status === 'NOT_CONFIGURED' || tsc.status === 'UNAVAILABLE',
      `${tsc.status}: ${tsc.summary}`
    );
  } finally {
    fs.rmSync(jsDir, { recursive: true, force: true });
  }

  // --- D. TypeScript fixture with real error ---
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-ts-'));
  try {
    write(
      tsDir,
      'package.json',
      JSON.stringify({
        name: 'fixture-ts',
        private: true,
        devDependencies: { typescript: '^5.3.3' },
      })
    );
    write(tsDir, 'tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ['*.ts'] }));
    write(tsDir, 'bad.ts', 'export const n: number = "nope";\n');
    const inst = sh(tsDir, 'npm', ['install', '--no-fund', '--no-audit']);
    if (inst.status !== 0) {
      push('fixture-tsc-install', 'Fixture TypeScript install', false, (inst.stderr || '').slice(0, 200), 'BLOCKED');
    } else {
      const tools = detectTools(tsDir);
      const r = await runTypescriptCheck(tsDir, tools.typescript);
      const ok =
        r.status === 'FAILED' &&
        r.findings.some((f) => f.filePath?.includes('bad.ts') && f.line && f.message);
      push(
        'typescript-fail',
        'TypeScript check FAILED with path+line',
        ok,
        `${r.status}: ${r.summary}; first=${JSON.stringify(r.findings[0] || {})}`
      );

      const syn = await runSyntaxCheck(tsDir, [path.join(tsDir, 'bad.ts')]);
      // type error is still valid syntax — should PASS syntax
      push(
        'syntax-ts-typeerror-still-valid',
        'TS type error is not a syntax failure',
        syn.status === 'PASSED',
        syn.summary
      );
    }
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }

  // --- E. Prettier check mode fixture ---
  const prDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-prettier-'));
  try {
    write(
      prDir,
      'package.json',
      JSON.stringify({ name: 'fixture-prettier', private: true, devDependencies: { prettier: '^3.2.0' } })
    );
    // Deliberately violate Prettier defaults (no semicolons + weird spacing)
    // so --check is deterministic across Prettier major versions.
    write(
      prDir,
      '.prettierrc',
      JSON.stringify({ semi: true, singleQuote: true, printWidth: 40 })
    );
    const uglySource =
      "export const a={foo:'bar',baz:'qux',longer:'value that exceeds print width intentionally'}\n";
    write(prDir, 'ugly.js', uglySource);
    const inst = sh(prDir, 'npm', ['install', '--no-fund', '--no-audit']);
    if (inst.status !== 0) {
      push('fixture-prettier-install', 'Fixture Prettier install', false, (inst.stderr || '').slice(0, 200), 'BLOCKED');
    } else {
      const tools = detectTools(prDir);
      const r = await runPrettierCheck(prDir, [path.join(prDir, 'ugly.js')], tools.prettier);
      push(
        'prettier-check-fail',
        'Prettier --check reports formatting drift (read-only)',
        r.status === 'FAILED' && r.findings.length > 0,
        `${r.status}: ${r.summary}`
      );
      // Ensure source unchanged
      const after = fs.readFileSync(path.join(prDir, 'ugly.js'), 'utf8');
      push(
        'prettier-no-write',
        'Prettier check does not modify source',
        after === uglySource,
        after === uglySource ? 'file unchanged' : 'file was mutated'
      );
    }
  } finally {
    fs.rmSync(prDir, { recursive: true, force: true });
  }

  // --- F. Jest/Vitest detector paths ---
  const jestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-jest-'));
  try {
    write(
      jestDir,
      'package.json',
      JSON.stringify({
        name: 'fixture-jest',
        private: true,
        scripts: { test: 'jest' },
        devDependencies: { jest: '^29.7.0' },
      })
    );
    const tools = detectTools(jestDir);
    push(
      'jest-detector',
      'Jest configuration detection',
      tools.jest.configured === true,
      tools.jest.detail || JSON.stringify(tools.jest)
    );
  } finally {
    fs.rmSync(jestDir, { recursive: true, force: true });
  }

  const vitestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-vitest-'));
  try {
    write(
      vitestDir,
      'package.json',
      JSON.stringify({
        name: 'fixture-vitest',
        private: true,
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^1.0.0' },
      })
    );
    write(vitestDir, 'vitest.config.ts', 'export default { test: {} }\n');
    const tools = detectTools(vitestDir);
    push(
      'vitest-detector',
      'Vitest configuration detection',
      tools.vitest.configured === true,
      tools.vitest.detail || JSON.stringify(tools.vitest)
    );
  } finally {
    fs.rmSync(vitestDir, { recursive: true, force: true });
  }

  push(
    'jest-vitest-execution-ui',
    'Jest/Vitest live run + confirmation modal',
    true,
    'Requires VS Code UI host (showWarningMessage). Detector paths verified above; execution+cancel modal is manual/BLOCKED for EDH.',
    'BLOCKED'
  );

  // --- G. Cancellation ---
  const ac = new AbortController();
  ac.abort();
  const cancelled = await runCommand('sleep', {
    cwd: extensionRoot,
    args: ['5'],
    signal: ac.signal,
    timeoutMs: 2000,
  });
  push(
    'process-cancel',
    'Child process cancellation via AbortSignal',
    cancelled.cancelled === true,
    `cancelled=${cancelled.cancelled}`
  );

  // --- H. Status labels + overall ---
  const overallFail = computeOverallStatus(
    [
      { id: 'a', name: 'A', description: '', status: 'PASSED', findings: [], summary: '' },
      { id: 'b', name: 'B', description: '', status: 'FAILED', findings: [], summary: '' },
    ],
    false
  );
  const overallReview = computeOverallStatus(
    [
      { id: 'a', name: 'A', description: '', status: 'PASSED', findings: [], summary: '' },
      { id: 'b', name: 'B', description: '', status: 'REVIEW_REQUIRED', findings: [], summary: '' },
    ],
    false
  );
  push(
    'status-semantics',
    'PASSED/FAILED/REVIEW REQUIRED/NOT CHECKED semantics',
    overallFail === 'FAILED' &&
      overallReview === 'REVIEW_REQUIRED' &&
      statusLabel('REVIEW_REQUIRED') === 'REVIEW REQUIRED' &&
      statusLabel('NOT_CHECKED') === 'NOT CHECKED',
    `fail=${overallFail}; review=${overallReview}`
  );

  // --- I. Markdown export ---
  const md = buildMarkdownReport({
    productName: 'ShipCheck',
    createdAt: new Date().toISOString(),
    scope: 'changes',
    workspaceRoot: '/tmp/fixture',
    changedFiles: [
      { absolutePath: '/tmp/fixture/a.ts', relativePath: 'a.ts', status: 'modified', staged: false },
    ],
    checks: [
      {
        id: 'eslint',
        name: 'ESLint',
        description: 'lint',
        status: 'FAILED',
        findings: [],
        summary: '1 issue',
        durationMs: 10,
      },
    ],
    findings: [
      {
        id: '1',
        kind: 'lint',
        severity: 'error',
        title: 'ESLint: no-undef',
        message: 'Evidence',
        filePath: 'a.ts',
        line: 2,
        column: 1,
        suggestion: 'Define the variable',
        checkId: 'eslint',
      },
    ],
    overallStatus: 'FAILED',
    cancelled: false,
  });
  push(
    'markdown-export',
    'Markdown report includes paths, status, no safety score',
    md.includes('a.ts') &&
      md.includes('FAILED') &&
      md.includes('Define the variable') &&
      md.includes('does **not** provide a safety score') &&
      !/safety score:\s*\d/i.test(md),
    'report length ' + md.length
  );

  // --- J. maskSecrets unit path ---
  const maskSample =
    'api_key = "' + ['sk', 'live', 'ABCDEFGHIJKLMNOPQRSTUV'].join('_') + '"';
  const masked = maskSecrets(maskSample);
  push(
    'mask-secrets-util',
    'maskSecrets redacts credential values',
    !masked.includes('ABCDEFGHIJKLMNOPQRSTUV') && masked.includes('••••'),
    masked
  );

  // --- K. filterExistingJsTs skips deleted ---
  const filtered = filterExistingJsTs([
    {
      absolutePath: '/nope/deleted.js',
      relativePath: 'deleted.js',
      status: 'deleted',
      staged: false,
    },
  ]);
  push(
    'filter-deleted',
    'Deleted files excluded from JS/TS check targets',
    filtered.length === 0,
    `len=${filtered.length}`
  );

  const summary = {
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    blocked: results.filter((r) => r.status === 'BLOCKED').length,
  };
  return { results, summary };
}

// Allow direct run
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  runIntegrationSuite(root).then((r) => {
    console.log(JSON.stringify(r.summary, null, 2));
    process.exit(r.summary.fail ? 1 : 0);
  });
}
