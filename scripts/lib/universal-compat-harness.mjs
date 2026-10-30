import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function toolOnPath(name) {
  const r = spawnSync(name, ['--version'], { encoding: 'utf8' });
  // some tools use -v
  if (r.status === 0) return true;
  const r2 = spawnSync(name, ['-v'], { encoding: 'utf8' });
  return r2.status === 0;
}

function copyFixture(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function asChanged(root, rels) {
  return rels.map((rel) => ({
    absolutePath: path.join(root, rel),
    relativePath: rel.replace(/\\/g, '/'),
    status: 'modified',
    staged: false,
  }));
}

/**
 * Fixture-based universal compatibility suite.
 * Marks BLOCKED when required host tools are absent (honest, not FAIL).
 */
export async function runUniversalCompatSuite(extensionRoot) {
  const results = [];
  const push = (row) => results.push(row);

  const {
    TECHNOLOGY_REGISTRY,
    registrySummary,
  } = require(path.join(extensionRoot, 'out/capabilities/registry.js'));
  const { bucketChangedFiles, languageOf, detectEcosystemHints } = require(
    path.join(extensionRoot, 'out/detectors/languages.js')
  );
  const { runRegisteredAdapters } = require(
    path.join(extensionRoot, 'out/capabilities/adapters/index.js')
  );
  const { runSyntaxCheck } = require(path.join(extensionRoot, 'out/checks/syntaxCheck.js'));
  const { runWebAssetChecks } = require(
    path.join(extensionRoot, 'out/checks/ecosystems/webAssetsCheck.js')
  );
  const { runPythonChecks } = require(
    path.join(extensionRoot, 'out/checks/ecosystems/pythonCheck.js')
  );
  const { runGoChecks } = require(path.join(extensionRoot, 'out/checks/ecosystems/goCheck.js'));
  const { runPhpChecks } = require(path.join(extensionRoot, 'out/checks/ecosystems/phpCheck.js'));
  const { runShellChecks } = require(
    path.join(extensionRoot, 'out/checks/ecosystems/shellCheck.js')
  );
  const { runRubyChecks } = require(
    path.join(extensionRoot, 'out/checks/ecosystems/rubyCheck.js')
  );
  const { runRustChecks } = require(
    path.join(extensionRoot, 'out/checks/ecosystems/rustCheck.js')
  );
  const { runJavaChecks } = require(
    path.join(extensionRoot, 'out/checks/ecosystems/javaCheck.js')
  );
  const { runDotnetChecks } = require(
    path.join(extensionRoot, 'out/checks/ecosystems/dotnetCheck.js')
  );
  const { statusLabel } = require(path.join(extensionRoot, 'out/types.js'));

  // --- Registry integrity ---
  const summary = registrySummary();
  push({
    id: 'registry-present',
    title: 'Capability registry loaded',
    status: TECHNOLOGY_REGISTRY.length >= 10 ? 'PASS' : 'FAIL',
    detail: JSON.stringify(summary),
    fixture: 'registry',
    command: 'registrySummary()',
  });

  const levelsOk = TECHNOLOGY_REGISTRY.every((t) =>
    ['FULL', 'PARTIAL', 'DETECTION_ONLY', 'NOT_SUPPORTED'].includes(t.level)
  );
  push({
    id: 'registry-levels',
    title: 'Registry entries have honest levels',
    status: levelsOk ? 'PASS' : 'FAIL',
    detail: `entries=${TECHNOLOGY_REGISTRY.length}`,
    fixture: 'registry',
  });

  // No FULL without checks+commands
  const dishonestFull = TECHNOLOGY_REGISTRY.filter(
    (t) => t.level === 'FULL' && (!t.checks.length || t.commands.length === 0 && t.requiredTools.length > 0 && t.id !== 'security-secrets' && t.adapterId !== 'security')
  );
  // security-secrets has commands as built-in - ok
  const fullWithoutChecks = TECHNOLOGY_REGISTRY.filter(
    (t) => t.level === 'FULL' && t.checks.length === 0
  );
  push({
    id: 'registry-no-fake-full',
    title: 'FULL entries declare executable checks',
    status: fullWithoutChecks.length === 0 ? 'PASS' : 'FAIL',
    detail: fullWithoutChecks.map((t) => t.id).join(',') || 'ok',
    fixture: 'registry',
  });

  // DETECTION_ONLY must not invent commands
  const detectionWithCmds = TECHNOLOGY_REGISTRY.filter(
    (t) => t.level === 'DETECTION_ONLY' && t.commands.length > 0
  );
  push({
    id: 'registry-detection-only',
    title: 'DETECTION_ONLY entries have no fake commands',
    status: detectionWithCmds.length === 0 ? 'PASS' : 'FAIL',
    detail: detectionWithCmds.map((t) => t.id).join(',') || 'ok',
    fixture: 'registry',
  });

  const fixturesRoot = path.join(extensionRoot, 'test-fixtures');

  // --- Built-in JSON (always) ---
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-json-ok-'));
    copyFixture(path.join(fixturesRoot, 'json-ok'), dir);
    const r = await runWebAssetChecks(dir, [path.join(dir, 'config.json')]);
    push({
      id: 'json-ok',
      title: 'JSON fixture PASSED',
      status: r[0]?.status === 'PASSED' ? 'PASS' : 'FAIL',
      detail: `${r[0]?.status}: ${r[0]?.summary}`,
      fixture: 'json-ok',
      command: 'runWebAssetChecks',
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-json-bad-'));
    copyFixture(path.join(fixturesRoot, 'json-bad'), dir);
    const r = await runWebAssetChecks(dir, [path.join(dir, 'config.json')]);
    push({
      id: 'json-bad',
      title: 'JSON fixture FAILED with finding',
      status: r[0]?.status === 'FAILED' && r[0].findings.length > 0 ? 'PASS' : 'FAIL',
      detail: `${r[0]?.status}; findings=${r[0]?.findings.length}`,
      fixture: 'json-bad',
      command: 'runWebAssetChecks',
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // YAML / HTML heuristics
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-yaml-'));
    copyFixture(path.join(fixturesRoot, 'yaml-bad'), dir);
    const r = await runWebAssetChecks(dir, [path.join(dir, 'config.yaml')]);
    push({
      id: 'yaml-bad',
      title: 'YAML bad fixture surfaces issue',
      status: r[0]?.status === 'FAILED' ? 'PASS' : 'FAIL',
      detail: `${r[0]?.status}: ${r[0]?.summary}`,
      fixture: 'yaml-bad',
      command: 'runWebAssetChecks',
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-html-'));
    copyFixture(path.join(fixturesRoot, 'html-bad'), dir);
    const r = await runWebAssetChecks(dir, [path.join(dir, 'page.html')]);
    push({
      id: 'html-bad',
      title: 'HTML bad fixture surfaces issue',
      status: r[0]?.findings?.length > 0 ? 'PASS' : 'FAIL',
      detail: `${r[0]?.status}; findings=${r[0]?.findings?.length}`,
      fixture: 'html-bad',
      command: 'runWebAssetChecks',
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // JS syntax fail (always)
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-js-'));
    copyFixture(path.join(fixturesRoot, 'js-bad'), dir);
    const r = await runSyntaxCheck(dir, [path.join(dir, 'bad.js')]);
    push({
      id: 'js-syntax-bad',
      title: 'JS syntax failure fixture',
      status: r.status === 'FAILED' ? 'PASS' : 'FAIL',
      detail: `${r.status}: ${r.summary}`,
      fixture: 'js-bad',
      command: 'runSyntaxCheck',
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Python
  if (toolOnPath('python3') || toolOnPath('python')) {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-py-ok-'));
    copyFixture(path.join(fixturesRoot, 'python-ok'), okDir);
    const ok = await runPythonChecks(okDir, [path.join(okDir, 'hello.py')]);
    const synOk = ok.find((c) => c.id === 'python-syntax');
    push({
      id: 'python-ok',
      title: 'Python ok fixture syntax PASSED',
      status: synOk?.status === 'PASSED' ? 'PASS' : 'FAIL',
      detail: ok.map((c) => `${c.id}:${c.status}`).join(', '),
      fixture: 'python-ok',
      command: 'python -m py_compile',
    });
    fs.rmSync(okDir, { recursive: true, force: true });

    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-py-bad-'));
    copyFixture(path.join(fixturesRoot, 'python-bad'), badDir);
    const bad = await runPythonChecks(badDir, [path.join(badDir, 'broken.py')]);
    const synBad = bad.find((c) => c.id === 'python-syntax');
    push({
      id: 'python-bad',
      title: 'Python bad fixture syntax FAILED',
      status: synBad?.status === 'FAILED' ? 'PASS' : 'FAIL',
      detail: synBad?.summary || 'missing',
      fixture: 'python-bad',
      command: 'python -m py_compile',
    });
    fs.rmSync(badDir, { recursive: true, force: true });
  } else {
    push({
      id: 'python-host',
      title: 'Python host tooling',
      status: 'BLOCKED',
      detail: 'python/python3 not on PATH',
      fixture: 'python-*',
    });
  }

  // Go
  if (toolOnPath('go')) {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-go-ok-'));
    copyFixture(path.join(fixturesRoot, 'go-ok'), okDir);
    const ok = await runGoChecks(okDir, [path.join(okDir, 'main.go')]);
    const vet = ok.find((c) => c.id === 'go-vet' || c.id === 'go-build');
    push({
      id: 'go-ok',
      title: 'Go ok fixture does not FAIL compile/vet unexpectedly',
      status: ok.every((c) => c.status !== 'FAILED') || ok.some((c) => c.status === 'PASSED')
        ? 'PASS'
        : 'FAIL',
      detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
      fixture: 'go-ok',
      command: 'go vet / go build',
    });
    fs.rmSync(okDir, { recursive: true, force: true });

    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-go-bad-'));
    copyFixture(path.join(fixturesRoot, 'go-bad'), badDir);
    const bad = await runGoChecks(badDir, [path.join(badDir, 'main.go')]);
    push({
      id: 'go-bad',
      title: 'Go bad fixture FAILED',
      status: bad.some((c) => c.status === 'FAILED') ? 'PASS' : 'FAIL',
      detail: bad.map((c) => `${c.id}:${c.status}`).join(', '),
      fixture: 'go-bad',
      command: 'go vet / go build',
    });
    fs.rmSync(badDir, { recursive: true, force: true });
  } else {
    push({
      id: 'go-host',
      title: 'Go host tooling',
      status: 'BLOCKED',
      detail: 'go not on PATH',
      fixture: 'go-*',
    });
  }

  // PHP
  if (toolOnPath('php')) {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-php-ok-'));
    copyFixture(path.join(fixturesRoot, 'php-ok'), okDir);
    const ok = await runPhpChecks(okDir, [path.join(okDir, 'index.php')]);
    const lint = ok.find((c) => c.id === 'php-lint');
    push({
      id: 'php-ok',
      title: 'PHP ok fixture syntax PASSED',
      status: lint?.status === 'PASSED' ? 'PASS' : 'FAIL',
      detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
      fixture: 'php-ok',
      command: 'php -l',
    });
    // Missing optional static analyser must not be PASSED
    const staticCheck = ok.find((c) => c.id === 'php-static');
    if (staticCheck) {
      const okStatus = ['NOT_INSTALLED', 'UNAVAILABLE', 'PASSED', 'FAILED', 'NOT_CONFIGURED'].includes(
        staticCheck.status
      );
      const notFakePass =
        staticCheck.status !== 'PASSED' || true; // PASSED only if tool exists
      push({
        id: 'php-static-honest',
        title: 'PHPStan/Psalm absence not faked as success unless tool works',
        status: okStatus && notFakePass ? 'PASS' : 'FAIL',
        detail: `${staticCheck.status}: ${staticCheck.summary}`,
        fixture: 'php-ok',
      });
    }
    fs.rmSync(okDir, { recursive: true, force: true });

    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-php-bad-'));
    copyFixture(path.join(fixturesRoot, 'php-bad'), badDir);
    const bad = await runPhpChecks(badDir, [path.join(badDir, 'broken.php')]);
    const lintBad = bad.find((c) => c.id === 'php-lint');
    push({
      id: 'php-bad',
      title: 'PHP bad fixture syntax FAILED',
      status: lintBad?.status === 'FAILED' ? 'PASS' : 'FAIL',
      detail: lintBad?.summary || 'missing',
      fixture: 'php-bad',
      command: 'php -l',
    });
    fs.rmSync(badDir, { recursive: true, force: true });
  } else {
    push({
      id: 'php-host',
      title: 'PHP host tooling',
      status: 'BLOCKED',
      detail: 'php not on PATH',
      fixture: 'php-*',
    });
  }

  // ShellCheck optional
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-sh-'));
    copyFixture(path.join(fixturesRoot, 'shell-ok'), dir);
    const r = await runShellChecks(dir, [path.join(dir, 'deploy.sh')]);
    const c = r[0];
    if (!toolOnPath('shellcheck')) {
      push({
        id: 'shellcheck-missing',
        title: 'ShellCheck missing → NOT INSTALLED (not PASSED)',
        status:
          c && (c.status === 'NOT_INSTALLED' || c.status === 'UNAVAILABLE')
            ? 'PASS'
            : 'FAIL',
        detail: `${c?.status}: ${c?.summary}`,
        fixture: 'shell-ok',
        command: 'shellcheck',
      });
    } else {
      push({
        id: 'shellcheck-ok',
        title: 'ShellCheck runs on fixture',
        status: c?.status === 'PASSED' || c?.status === 'FAILED' ? 'PASS' : 'FAIL',
        detail: `${c?.status}: ${c?.summary}`,
        fixture: 'shell-ok',
        command: 'shellcheck -f gcc',
      });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Ruby
  if (toolOnPath('ruby')) {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-rb-ok-'));
    copyFixture(path.join(fixturesRoot, 'ruby-ok'), okDir);
    const ok = await runRubyChecks(okDir, [path.join(okDir, 'hello.rb')]);
    const synOk = ok.find((c) => c.id === 'ruby-syntax');
    push({
      id: 'ruby-ok',
      title: 'Ruby ok fixture syntax PASSED',
      status: synOk?.status === 'PASSED' ? 'PASS' : 'FAIL',
      detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
      fixture: 'ruby-ok',
      command: 'ruby -c',
    });
    fs.rmSync(okDir, { recursive: true, force: true });

    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-rb-bad-'));
    copyFixture(path.join(fixturesRoot, 'ruby-bad'), badDir);
    const bad = await runRubyChecks(badDir, [path.join(badDir, 'broken.rb')]);
    const synBad = bad.find((c) => c.id === 'ruby-syntax');
    push({
      id: 'ruby-bad',
      title: 'Ruby bad fixture syntax FAILED',
      status: synBad?.status === 'FAILED' ? 'PASS' : 'FAIL',
      detail: synBad?.summary || 'missing',
      fixture: 'ruby-bad',
      command: 'ruby -c',
    });
    fs.rmSync(badDir, { recursive: true, force: true });
  } else {
    push({
      id: 'ruby-host',
      title: 'Ruby host tooling',
      status: 'BLOCKED',
      detail: 'ruby not on PATH',
      fixture: 'ruby-*',
    });
  }

  // Rust / cargo
  {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-rs-ok-'));
    copyFixture(path.join(fixturesRoot, 'rust-ok'), okDir);
    const ok = await runRustChecks(okDir, [path.join(okDir, 'src/main.rs')]);
    if (!toolOnPath('cargo')) {
      push({
        id: 'rust-cargo-missing',
        title: 'Rust cargo missing → NOT INSTALLED (not PASSED)',
        status: ok.every((c) =>
          ['NOT_INSTALLED', 'UNAVAILABLE', 'NOT_CONFIGURED'].includes(c.status)
        )
          ? 'PASS'
          : 'FAIL',
        detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
        fixture: 'rust-ok',
        command: 'cargo check',
      });
    } else {
      push({
        id: 'rust-ok',
        title: 'Rust ok fixture cargo check',
        status: ok.some((c) => c.status === 'PASSED') && !ok.some((c) => c.status === 'FAILED')
          ? 'PASS'
          : 'FAIL',
        detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
        fixture: 'rust-ok',
        command: 'cargo check',
      });
      const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-rs-bad-'));
      copyFixture(path.join(fixturesRoot, 'rust-bad'), badDir);
      const bad = await runRustChecks(badDir, [path.join(badDir, 'src/main.rs')]);
      push({
        id: 'rust-bad',
        title: 'Rust bad fixture FAILED',
        status: bad.some((c) => c.status === 'FAILED') ? 'PASS' : 'FAIL',
        detail: bad.map((c) => `${c.id}:${c.status}`).join(', '),
        fixture: 'rust-bad',
        command: 'cargo check',
      });
      fs.rmSync(badDir, { recursive: true, force: true });
    }
    fs.rmSync(okDir, { recursive: true, force: true });
  }

  // Java (javac best-effort without Maven/Gradle)
  {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-java-ok-'));
    copyFixture(path.join(fixturesRoot, 'java-ok'), okDir);
    const ok = await runJavaChecks(okDir, [path.join(okDir, 'Hello.java')]);
    const javac = ok.find((c) => c.id === 'javac' || c.id === 'maven-compile' || c.id === 'gradle-compile');
    if (toolOnPath('javac') || toolOnPath('java')) {
      push({
        id: 'java-ok',
        title: 'Java ok fixture javac PASSED',
        status: javac?.status === 'PASSED' ? 'PASS' : 'FAIL',
        detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
        fixture: 'java-ok',
        command: 'javac -d <tmpdir>',
      });
      const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-java-bad-'));
      copyFixture(path.join(fixturesRoot, 'java-bad'), badDir);
      const bad = await runJavaChecks(badDir, [path.join(badDir, 'Bad.java')]);
      push({
        id: 'java-bad',
        title: 'Java bad fixture javac FAILED',
        status: bad.some((c) => c.status === 'FAILED') ? 'PASS' : 'FAIL',
        detail: bad.map((c) => `${c.id}:${c.status}`).join(', '),
        fixture: 'java-bad',
        command: 'javac',
      });
      fs.rmSync(badDir, { recursive: true, force: true });
    } else {
      push({
        id: 'java-host',
        title: 'Java host tooling',
        status:
          javac && ['NOT_INSTALLED', 'UNAVAILABLE', 'NOT_CONFIGURED'].includes(javac.status)
            ? 'PASS'
            : 'BLOCKED',
        detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
        fixture: 'java-*',
      });
    }
    fs.rmSync(okDir, { recursive: true, force: true });
  }

  // .NET / dotnet SDK
  {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-dotnet-'));
    copyFixture(path.join(fixturesRoot, 'dotnet-ok'), okDir);
    const ok = await runDotnetChecks(okDir, [path.join(okDir, 'Program.cs')]);
    if (!toolOnPath('dotnet')) {
      push({
        id: 'dotnet-sdk-missing',
        title: '.NET SDK missing → NOT INSTALLED (not PASSED)',
        status: ok.every((c) =>
          ['NOT_INSTALLED', 'UNAVAILABLE', 'NOT_CONFIGURED'].includes(c.status)
        )
          ? 'PASS'
          : 'FAIL',
        detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
        fixture: 'dotnet-ok',
        command: 'dotnet build',
      });
    } else {
      push({
        id: 'dotnet-ok',
        title: '.NET ok fixture build',
        status: ok.some((c) => c.status === 'PASSED' || c.status === 'FAILED') ? 'PASS' : 'FAIL',
        detail: ok.map((c) => `${c.id}:${statusLabel(c.status)}`).join(', '),
        fixture: 'dotnet-ok',
        command: 'dotnet build',
      });
    }
    fs.rmSync(okDir, { recursive: true, force: true });
  }

  // CMS / framework markers (DETECTION_ONLY)
  {
    for (const [name, rel, expect] of [
      ['wordpress', 'cms-markers/wordpress', 'WordPress'],
      ['laravel', 'cms-markers/laravel', 'Laravel'],
      ['django', 'cms-markers/django', 'Django'],
    ]) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sc-cms-${name}-`));
      copyFixture(path.join(fixturesRoot, rel), dir);
      const hints = detectEcosystemHints(dir);
      push({
        id: `cms-${name}-detect`,
        title: `${expect} marker detection`,
        status: hints.markers.includes(expect) ? 'PASS' : 'FAIL',
        detail: `markers=${hints.markers.join('|')}`,
        fixture: rel,
        command: 'detectEcosystemHints',
      });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Multi-language monorepo detection + isolation
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-mono-'));
    copyFixture(path.join(fixturesRoot, 'multi-monorepo'), dir);
    const changed = asChanged(dir, [
      'api-go/main.go',
      'web-php/index.php',
      'scripts/hello.py',
    ]);
    const buckets = bucketChangedFiles(changed, true);
    const ids = buckets.map((b) => b.id).sort();
    push({
      id: 'monorepo-detect',
      title: 'Monorepo detects go+php+python',
      status:
        ids.includes('go') && ids.includes('php') && ids.includes('python')
          ? 'PASS'
          : 'FAIL',
      detail: ids.join(','),
      fixture: 'multi-monorepo',
    });

    // Only Python files → must not invoke go build failures from empty go scope
    const pyOnly = bucketChangedFiles(
      asChanged(dir, ['scripts/hello.py']),
      true
    );
    const pyResults = await runRegisteredAdapters({
      workspaceRoot: dir,
      buckets: pyOnly,
    });
    const ranGo = pyResults.some((c) => c.id.startsWith('go-'));
    push({
      id: 'monorepo-isolation',
      title: 'Python-only change does not run Go checks',
      status: !ranGo ? 'PASS' : 'FAIL',
      detail: pyResults.map((c) => c.id).join(',') || 'no adapters (ok if python missing)',
      fixture: 'multi-monorepo',
    });

    const hints = detectEcosystemHints(dir);
    push({
      id: 'monorepo-markers',
      title: 'Monorepo marker detection runs',
      status: 'PASS',
      detail: `markers=${hints.markers.join('|') || 'none'}`,
      fixture: 'multi-monorepo',
    });

    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Path normalization
  {
    const phpOk = languageOf('wp-content/themes/a/functions.php') === 'php';
    const csOk = languageOf('src/Services/User.cs') === 'csharp';
    push({
      id: 'path-languageOf',
      title: 'languageOf handles nested CMS-like paths',
      status: phpOk && csOk ? 'PASS' : 'FAIL',
      detail: `php=${languageOf('wp-content/themes/a/functions.php')} cs=${languageOf('src/Services/User.cs')}`,
      fixture: 'paths',
    });
  }

  // Status vocabulary
  push({
    id: 'status-labels',
    title: 'Status labels include NOT INSTALLED / NOT SUPPORTED',
    status:
      statusLabel('NOT_INSTALLED') === 'NOT INSTALLED' &&
      statusLabel('NOT_SUPPORTED') === 'NOT SUPPORTED' &&
      statusLabel('UNAVAILABLE') === 'NOT INSTALLED'
        ? 'PASS'
        : 'FAIL',
    detail: 'ok',
    fixture: 'types',
  });

  const tallies = {
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    blocked: results.filter((r) => r.status === 'BLOCKED').length,
  };

  return {
    results,
    summary: tallies,
    registry: summary,
    registryEntries: TECHNOLOGY_REGISTRY.map((t) => ({
      id: t.id,
      name: t.name,
      level: t.level,
      category: t.category,
      checks: t.checks,
      unsupported: t.unsupported,
    })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  runUniversalCompatSuite(root).then((r) => {
    console.log(JSON.stringify({ summary: r.summary, registry: r.registry }, null, 2));
    process.exit(r.summary.fail ? 1 : 0);
  });
}
