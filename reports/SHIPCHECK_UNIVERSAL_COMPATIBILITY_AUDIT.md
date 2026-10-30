# ShipCheck Universal Compatibility Audit

- **Generated:** 2026-10-30T11:16:45.054Z
- **Extension version:** 0.2.1
- **Host:** darwin/arm64 node=v20.20.2
- **Overall:** **READY**

> Capability claims are taken from the central registry and verified against fixtures/adapters. Detection-only entries are not advertised as FULL.

## Technology totals (registry)

| Metric | Count |
| --- | ---: |
| Total registered | 19 |
| FULL | 3 |
| PARTIAL | 13 |
| DETECTION ONLY | 3 |
| NOT SUPPORTED | 0 |

## Capability matrix

| Technology | Level | Detection | Checks | Adapter |
| --- | --- | --- | --- | --- |
| JavaScript (`javascript`) | **FULL** | language | syntax; eslint; prettier-check | `javascript` |
| TypeScript (`typescript`) | **FULL** | language | syntax; tsc --noEmit; eslint; prettier-check | `typescript` |
| Jest (`jest`) | **PARTIAL** | test | test run with confirmation | `jest` |
| Vitest (`vitest`) | **PARTIAL** | test | test run with confirmation | `vitest` |
| Python (`python`) | **PARTIAL** | language | py_compile; ruff|flake8; mypy | `python` |
| Django (`django`) | **DETECTION_ONLY** | framework | inherits Python adapter | `django` |
| Go (`go`) | **PARTIAL** | language | go vet; gofmt -l; go build | `go` |
| PHP (`php`) | **PARTIAL** | language | php -l; phpstan|psalm | `php` |
| WordPress (`wordpress`) | **DETECTION_ONLY** | framework | inherits PHP syntax/static | `wordpress` |
| Laravel (`laravel`) | **DETECTION_ONLY** | framework | inherits PHP adapter | `laravel` |
| Java (`java`) | **PARTIAL** | language | maven compile; gradle compile; javac best-effort | `java` |
| Kotlin (`kotlin`) | **PARTIAL** | language | gradle compileKotlin via Java adapter | `kotlin` |
| Rust (`rust`) | **PARTIAL** | language | cargo check; cargo fmt --check | `rust` |
| Ruby (`ruby`) | **PARTIAL** | language | ruby -c; rubocop | `ruby` |
| C# / .NET (`dotnet`) | **PARTIAL** | language | dotnet build | `dotnet` |
| Shell (`shell`) | **PARTIAL** | language | shellcheck | `shell` |
| Web / CMS assets (`web-assets`) | **PARTIAL** | assets | json-parse; yaml-heuristic; html-tag-balance | `web-assets` |
| Secret scan (`security-secrets`) | **FULL** | security | pattern secret detection + masking | `security-secrets` |
| Risk review (`risk-review`) | **PARTIAL** | security | review suggestions (not vulns) | `risk-review` |

## Fixture / execution results

| ID | Result | Fixture | Command / detail |
| --- | --- | --- | --- |
| `registry-present` | **PASS** | registry | registrySummary() — {"total":19,"full":3,"partial":13,"detectionOnly":3,"notSupported":0} |
| `registry-levels` | **PASS** | registry |  — entries=19 |
| `registry-no-fake-full` | **PASS** | registry |  — ok |
| `registry-detection-only` | **PASS** | registry |  — ok |
| `json-ok` | **PASS** | json-ok | runWebAssetChecks — PASSED: Validated 1 web/CMS asset(s) |
| `json-bad` | **PASS** | json-bad | runWebAssetChecks — FAILED; findings=1 |
| `yaml-bad` | **PASS** | yaml-bad | runWebAssetChecks — FAILED: 1 asset issue(s) |
| `html-bad` | **PASS** | html-bad | runWebAssetChecks — FAILED; findings=1 |
| `js-syntax-bad` | **PASS** | js-bad | runSyntaxCheck — FAILED: 1 syntax issue(s) in 1 file(s) |
| `python-ok` | **PASS** | python-ok | python -m py_compile — python-syntax:PASSED, python-lint:NOT_INSTALLED, python-types:NOT_INSTALLED |
| `python-bad` | **PASS** | python-bad | python -m py_compile — 1 syntax issue(s) |
| `go-host` | **BLOCKED** | go-* |  — go not on PATH |
| `php-ok` | **PASS** | php-ok | php -l — php-lint:PASSED, php-static:NOT INSTALLED |
| `php-static-honest` | **PASS** | php-ok |  — NOT_INSTALLED: PHPStan/Psalm not found (optional for CMS projects) |
| `php-bad` | **PASS** | php-bad | php -l — 1 PHP syntax issue(s) |
| `shellcheck-missing` | **PASS** | shell-ok | shellcheck — NOT_INSTALLED: shellcheck not found on PATH (optional) |
| `ruby-ok` | **PASS** | ruby-ok | ruby -c — ruby-syntax:PASSED, rubocop:NOT INSTALLED |
| `ruby-bad` | **PASS** | ruby-bad | ruby -c — 1 syntax issue(s) |
| `rust-cargo-missing` | **PASS** | rust-ok | cargo check — rust:NOT INSTALLED |
| `java-ok` | **PASS** | java-ok | javac -d <tmpdir> — javac:PASSED |
| `java-bad` | **PASS** | java-bad | javac — javac:FAILED |
| `dotnet-sdk-missing` | **PASS** | dotnet-ok | dotnet build — dotnet:NOT INSTALLED |
| `cms-wordpress-detect` | **PASS** | cms-markers/wordpress | detectEcosystemHints — markers=wp-config.php\|WordPress |
| `cms-laravel-detect` | **PASS** | cms-markers/laravel | detectEcosystemHints — markers=artisan\|Laravel |
| `cms-django-detect` | **PASS** | cms-markers/django | detectEcosystemHints — markers=manage.py\|Django |
| `monorepo-detect` | **PASS** | multi-monorepo |  — go,php,python |
| `monorepo-isolation` | **PASS** | multi-monorepo |  — python-syntax,python-lint,python-types |
| `monorepo-markers` | **PASS** | multi-monorepo |  — markers=none |
| `path-languageOf` | **PASS** | paths |  — php=php cs=csharp |
| `status-labels` | **PASS** | types |  — ok |

## Release deliverables (subset)

- **PASS** `deps-install`: node_modules present; package-lock in sync enough for local verify
- **PASS** `compile`: tsc -p ./ succeeded
- **PASS** `lint`: No lint errors
- **PASS** `unit-tests`: pass=21 fail=0
- **PASS** `git-detection`: fresh.js:untracked, gone.js:deleted, keep.js:modified, staged.js:added:staged
- **PASS** `git-absent`: isRepo=false as expected
- **PASS** `fixture-eslint-install`: npm install ok
- **PASS** `eslint-integration`: FAILED: 1 ESLint issue(s); findings=1
- **PASS** `syntax-js-fail`: FAILED: 1 syntax issue(s) in 1 file(s)
- **PASS** `syntax-js-pass`: Parsed 1 file(s) — no syntax errors
- **PASS** `security-secrets`: FAILED; findings=2; masked=true
- **PASS** `risk-review`: REVIEW_REQUIRED; findings=1
- **PASS** `prettier-unavailable`: UNAVAILABLE: Prettier is not installed in this project
- **PASS** `typescript-not-configured`: NOT_CONFIGURED: No tsconfig.json found
- **PASS** `typescript-fail`: FAILED: 1 type error(s); first={"id":"dHlwZXNjcmlwdHxiYWQudHN8MXxUeXBlU2NyaXB0IFRTMjMy","kind":"type","severity":"error","title":"TypeScript TS2322","message":"Type 'string' is not assignable to type 'number'.","filePath":"bad.ts","line":1,"column":14,"suggestion":"Fix the type error or adjust typings.","checkId":"typescript"}
- **PASS** `syntax-ts-typeerror-still-valid`: Parsed 1 file(s) — no syntax errors
- **PASS** `prettier-check-fail`: FAILED: 2 file(s) need formatting
- **PASS** `prettier-no-write`: file unchanged
- **PASS** `jest-detector`: Script: npm run test
- **PASS** `vitest-detector`: Script: npm run test
- **BLOCKED** `jest-vitest-execution-ui`: Requires VS Code UI host (showWarningMessage). Detector paths verified above; execution+cancel modal is manual/BLOCKED for EDH.
- **PASS** `process-cancel`: cancelled=true
- **PASS** `status-semantics`: fail=FAILED; review=REVIEW_REQUIRED
- **PASS** `markdown-export`: report length 896
- **PASS** `mask-secrets-util`: api_key = "sk_l••••••••UV"
- **PASS** `filter-deleted`: len=0
- **PASS** `univ-registry-present`: {"total":19,"full":3,"partial":13,"detectionOnly":3,"notSupported":0}
- **PASS** `univ-registry-levels`: entries=19
- **PASS** `univ-registry-no-fake-full`: ok
- **PASS** `univ-registry-detection-only`: ok
- **PASS** `univ-json-ok`: PASSED: Validated 1 web/CMS asset(s)
- **PASS** `univ-json-bad`: FAILED; findings=1
- **PASS** `univ-yaml-bad`: FAILED: 1 asset issue(s)
- **PASS** `univ-html-bad`: FAILED; findings=1
- **PASS** `univ-js-syntax-bad`: FAILED: 1 syntax issue(s) in 1 file(s)
- **PASS** `univ-python-ok`: python-syntax:PASSED, python-lint:NOT_INSTALLED, python-types:NOT_INSTALLED
- **PASS** `univ-python-bad`: 1 syntax issue(s)
- **BLOCKED** `univ-go-host`: go not on PATH
- **PASS** `univ-php-ok`: php-lint:PASSED, php-static:NOT INSTALLED
- **PASS** `univ-php-static-honest`: NOT_INSTALLED: PHPStan/Psalm not found (optional for CMS projects)
- **PASS** `univ-php-bad`: 1 PHP syntax issue(s)
- **PASS** `univ-shellcheck-missing`: NOT_INSTALLED: shellcheck not found on PATH (optional)
- **PASS** `univ-ruby-ok`: ruby-syntax:PASSED, rubocop:NOT INSTALLED
- **PASS** `univ-ruby-bad`: 1 syntax issue(s)
- **PASS** `univ-rust-cargo-missing`: rust:NOT INSTALLED
- **PASS** `univ-java-ok`: javac:PASSED
- **PASS** `univ-java-bad`: javac:FAILED
- **PASS** `univ-dotnet-sdk-missing`: dotnet:NOT INSTALLED
- **PASS** `univ-cms-wordpress-detect`: markers=wp-config.php|WordPress
- **PASS** `univ-cms-laravel-detect`: markers=artisan|Laravel
- **PASS** `univ-cms-django-detect`: markers=manage.py|Django
- **PASS** `univ-monorepo-detect`: go,php,python
- **PASS** `univ-monorepo-isolation`: python-syntax,python-lint,python-types
- **PASS** `univ-monorepo-markers`: markers=none
- **PASS** `univ-path-languageOf`: php=php cs=csharp
- **PASS** `univ-status-labels`: ok
- **PASS** `npm-audit`: 0 vulnerabilities
- **PASS** `manifest`: 12 commands; views+activation OK
- **PASS** `privacy`: Scanned 40 src files; no network upload / git mutate / prettier --write
- **PASS** `package`: shipcheck-0.2.1.vsix
- **PASS** `vsix-contents`: shipcheck-0.2.1.vsix 118KB; entry out/extension.js present; no src/test leakage
- **PASS** `install-smoke`: Installed via cursor; listed as shipcheck.shipcheck
- **BLOCKED** `edh-smoke`: No headless EDH automation wired for Cursor/VS Code UI activation in this environment. Manual steps listed in report.
- **BLOCKED** `marketplace-prereq`: publisher id "shipcheck" must be claimed on Marketplace / Open VSX before publish; README publisher links point at placeholder GitHub org; Personal Access Token / publisher login required for vsce publish (not run)
- **BLOCKED** `coverage`: No coverage toolchain configured (c8/nyc). Unit+integration counts reported instead.

## Remaining limitations

- Frameworks marked DETECTION_ONLY (WordPress, Laravel, Django) inherit language adapters; no framework-specific CLI yet.
- Jest/Vitest/pytest/go test/phpunit/dotnet test require confirmation UI — not auto-run in headless verify.
- Host tools absent on the verify machine are BLOCKED, not silently PASSED.
- YAML/HTML checks are heuristic, not full language servers.
- Extension Development Host UI journey remains manual.

## Verdict

**READY**
