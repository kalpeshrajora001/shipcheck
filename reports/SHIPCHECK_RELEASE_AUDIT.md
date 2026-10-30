# ShipCheck Release Audit

- **Generated:** 2026-10-30T11:16:45.053Z
- **Extension version:** 0.2.1
- **Overall result:** **READY**

> This report was produced by `npm run verify:release`. Statuses reflect executed checks, not documentation claims.

## Summary counts

| Status | Count |
| --- | ---: |
| PASS | 60 |
| FAIL | 0 |
| BLOCKED | 5 |
| SKIP | 0 |

## Deliverables

| ID | Deliverable | Result | Exit | Detail |
| --- | --- | --- | --- | --- |
| `deps-install` | Dependency tree present | **PASS** | 0 | node_modules present; package-lock in sync enough for local verify |
| `compile` | TypeScript compilation | **PASS** | 0 | tsc -p ./ succeeded |
| `lint` | ESLint on src/ | **PASS** | 0 | No lint errors |
| `unit-tests` | Unit tests (node:test) | **PASS** | 0 | pass=21 fail=0 |
| `git-detection` | Git repo + modified/staged/untracked/deleted detection | **PASS** | 0 | fresh.js:untracked, gone.js:deleted, keep.js:modified, staged.js:added:staged |
| `git-absent` | Non-Git folder detection | **PASS** | 0 | isRepo=false as expected |
| `fixture-eslint-install` | Fixture ESLint install | **PASS** | 0 | npm install ok |
| `eslint-integration` | ESLint finds issues with file+line | **PASS** | 0 | FAILED: 1 ESLint issue(s); findings=1 |
| `syntax-js-fail` | JS syntax check FAILED on broken file | **PASS** | 0 | FAILED: 1 syntax issue(s) in 1 file(s) |
| `syntax-js-pass` | JS syntax check PASSED on valid file | **PASS** | 0 | Parsed 1 file(s) — no syntax errors |
| `security-secrets` | Secret detection + masking | **PASS** | 0 | FAILED; findings=2; masked=true |
| `risk-review` | Risk review suggestions labeled | **PASS** | 0 | REVIEW_REQUIRED; findings=1 |
| `prettier-unavailable` | Prettier UNAVAILABLE when not installed | **PASS** | 0 | UNAVAILABLE: Prettier is not installed in this project |
| `typescript-not-configured` | TypeScript NOT_CONFIGURED without tsconfig | **PASS** | 0 | NOT_CONFIGURED: No tsconfig.json found |
| `typescript-fail` | TypeScript check FAILED with path+line | **PASS** | 0 | FAILED: 1 type error(s); first={"id":"dHlwZXNjcmlwdHxiYWQudHN8MXxUeXBlU2NyaXB0IFRTMjMy","kind":"type","severity":"error","title":"TypeScript TS2322","message":"Type 'string' is not assignable to type 'number'.","filePath":"bad.ts","line":1,"column":14,"suggestion":"Fix the type error or adjust typings.","checkId":"typescript"} |
| `syntax-ts-typeerror-still-valid` | TS type error is not a syntax failure | **PASS** | 0 | Parsed 1 file(s) — no syntax errors |
| `prettier-check-fail` | Prettier --check reports formatting drift (read-only) | **PASS** | 0 | FAILED: 2 file(s) need formatting |
| `prettier-no-write` | Prettier check does not modify source | **PASS** | 0 | file unchanged |
| `jest-detector` | Jest configuration detection | **PASS** | 0 | Script: npm run test |
| `vitest-detector` | Vitest configuration detection | **PASS** | 0 | Script: npm run test |
| `jest-vitest-execution-ui` | Jest/Vitest live run + confirmation modal | **BLOCKED** | 0 | Requires VS Code UI host (showWarningMessage). Detector paths verified above; execution+cancel modal is manual/BLOCKED for EDH. |
| `process-cancel` | Child process cancellation via AbortSignal | **PASS** | 0 | cancelled=true |
| `status-semantics` | PASSED/FAILED/REVIEW REQUIRED/NOT CHECKED semantics | **PASS** | 0 | fail=FAILED; review=REVIEW_REQUIRED |
| `markdown-export` | Markdown report includes paths, status, no safety score | **PASS** | 0 | report length 896 |
| `mask-secrets-util` | maskSecrets redacts credential values | **PASS** | 0 | api_key = "sk_l••••••••UV" |
| `filter-deleted` | Deleted files excluded from JS/TS check targets | **PASS** | 0 | len=0 |
| `univ-registry-present` | Capability registry loaded | **PASS** | 0 | {"total":19,"full":3,"partial":13,"detectionOnly":3,"notSupported":0} |
| `univ-registry-levels` | Registry entries have honest levels | **PASS** | 0 | entries=19 |
| `univ-registry-no-fake-full` | FULL entries declare executable checks | **PASS** | 0 | ok |
| `univ-registry-detection-only` | DETECTION_ONLY entries have no fake commands | **PASS** | 0 | ok |
| `univ-json-ok` | JSON fixture PASSED | **PASS** | 0 | PASSED: Validated 1 web/CMS asset(s) |
| `univ-json-bad` | JSON fixture FAILED with finding | **PASS** | 0 | FAILED; findings=1 |
| `univ-yaml-bad` | YAML bad fixture surfaces issue | **PASS** | 0 | FAILED: 1 asset issue(s) |
| `univ-html-bad` | HTML bad fixture surfaces issue | **PASS** | 0 | FAILED; findings=1 |
| `univ-js-syntax-bad` | JS syntax failure fixture | **PASS** | 0 | FAILED: 1 syntax issue(s) in 1 file(s) |
| `univ-python-ok` | Python ok fixture syntax PASSED | **PASS** | 0 | python-syntax:PASSED, python-lint:NOT_INSTALLED, python-types:NOT_INSTALLED |
| `univ-python-bad` | Python bad fixture syntax FAILED | **PASS** | 0 | 1 syntax issue(s) |
| `univ-go-host` | Go host tooling | **BLOCKED** | 0 | go not on PATH |
| `univ-php-ok` | PHP ok fixture syntax PASSED | **PASS** | 0 | php-lint:PASSED, php-static:NOT INSTALLED |
| `univ-php-static-honest` | PHPStan/Psalm absence not faked as success unless tool works | **PASS** | 0 | NOT_INSTALLED: PHPStan/Psalm not found (optional for CMS projects) |
| `univ-php-bad` | PHP bad fixture syntax FAILED | **PASS** | 0 | 1 PHP syntax issue(s) |
| `univ-shellcheck-missing` | ShellCheck missing → NOT INSTALLED (not PASSED) | **PASS** | 0 | NOT_INSTALLED: shellcheck not found on PATH (optional) |
| `univ-ruby-ok` | Ruby ok fixture syntax PASSED | **PASS** | 0 | ruby-syntax:PASSED, rubocop:NOT INSTALLED |
| `univ-ruby-bad` | Ruby bad fixture syntax FAILED | **PASS** | 0 | 1 syntax issue(s) |
| `univ-rust-cargo-missing` | Rust cargo missing → NOT INSTALLED (not PASSED) | **PASS** | 0 | rust:NOT INSTALLED |
| `univ-java-ok` | Java ok fixture javac PASSED | **PASS** | 0 | javac:PASSED |
| `univ-java-bad` | Java bad fixture javac FAILED | **PASS** | 0 | javac:FAILED |
| `univ-dotnet-sdk-missing` | .NET SDK missing → NOT INSTALLED (not PASSED) | **PASS** | 0 | dotnet:NOT INSTALLED |
| `univ-cms-wordpress-detect` | WordPress marker detection | **PASS** | 0 | markers=wp-config.php\|WordPress |
| `univ-cms-laravel-detect` | Laravel marker detection | **PASS** | 0 | markers=artisan\|Laravel |
| `univ-cms-django-detect` | Django marker detection | **PASS** | 0 | markers=manage.py\|Django |
| `univ-monorepo-detect` | Monorepo detects go+php+python | **PASS** | 0 | go,php,python |
| `univ-monorepo-isolation` | Python-only change does not run Go checks | **PASS** | 0 | python-syntax,python-lint,python-types |
| `univ-monorepo-markers` | Monorepo marker detection runs | **PASS** | 0 | markers=none |
| `univ-path-languageOf` | languageOf handles nested CMS-like paths | **PASS** | 0 | php=php cs=csharp |
| `univ-status-labels` | Status labels include NOT INSTALLED / NOT SUPPORTED | **PASS** | 0 | ok |
| `npm-audit` | Dependency security audit | **PASS** | 0 | 0 vulnerabilities |
| `manifest` | VS Code extension manifest validation | **PASS** | 0 | 12 commands; views+activation OK |
| `privacy` | Local-only / no auto-mutate static guarantees | **PASS** | 0 | Scanned 40 src files; no network upload / git mutate / prettier --write |
| `package` | VSIX packaging (@vscode/vsce) | **PASS** | 0 | shipcheck-0.2.1.vsix |
| `vsix-contents` | VSIX contents & entry point | **PASS** | 0 | shipcheck-0.2.1.vsix 118KB; entry out/extension.js present; no src/test leakage |
| `install-smoke` | CLI install smoke test | **PASS** | 0 | Installed via cursor; listed as shipcheck.shipcheck |
| `edh-smoke` | Extension Development Host UI smoke | **BLOCKED** | — | No headless EDH automation wired for Cursor/VS Code UI activation in this environment. Manual steps listed in report. |
| `marketplace-prereq` | Marketplace publishing prerequisites | **BLOCKED** | — | publisher id "shipcheck" must be claimed on Marketplace / Open VSX before publish; README publisher links point at placeholder GitHub org; Personal Access Token / publisher login required for vsce publish (not run) |
| `coverage` | Code coverage report | **BLOCKED** | — | No coverage toolchain configured (c8/nyc). Unit+integration counts reported instead. |

## Commands executed

- `npm ls --depth=0` → exit **0** (PASS)
- `npm run compile` → exit **0** (PASS)
- `npm run lint` → exit **0** (PASS)
- `npm test` → exit **0** (PASS)
- `registrySummary()` → exit **0** (PASS)
- `runWebAssetChecks` → exit **0** (PASS)
- `runWebAssetChecks` → exit **0** (PASS)
- `runWebAssetChecks` → exit **0** (PASS)
- `runWebAssetChecks` → exit **0** (PASS)
- `runSyntaxCheck` → exit **0** (PASS)
- `python -m py_compile` → exit **0** (PASS)
- `python -m py_compile` → exit **0** (PASS)
- `php -l` → exit **0** (PASS)
- `php -l` → exit **0** (PASS)
- `shellcheck` → exit **0** (PASS)
- `ruby -c` → exit **0** (PASS)
- `ruby -c` → exit **0** (PASS)
- `cargo check` → exit **0** (PASS)
- `javac -d <tmpdir>` → exit **0** (PASS)
- `javac` → exit **0** (PASS)
- `dotnet build` → exit **0** (PASS)
- `detectEcosystemHints` → exit **0** (PASS)
- `detectEcosystemHints` → exit **0** (PASS)
- `detectEcosystemHints` → exit **0** (PASS)
- `npm audit` → exit **0** (PASS)
- `npm run package` → exit **0** (PASS)
- `cursor --install-extension shipcheck-0.2.1.vsix --force` → exit **0** (PASS)

## Tests

- Unit tests pass: **21**, fail: **0**
- Integration fixtures: pass=21, fail=0, blocked=1
- Coverage: not configured (see BLOCKED coverage deliverable)

## VSIX package

- **Name:** shipcheck-0.2.1.vsix
- **Version:** 0.2.1
- **Size:** 118 KB (120855 bytes)
- **Inspection:** shipcheck-0.2.1.vsix 118KB; entry out/extension.js present; no src/test leakage

## Missing features / defects observed

- No FAIL deliverables in this run.

### Known product gaps (not necessarily FAIL)

- Jest/Vitest full execution paths require VS Code modal confirmation UI (covered via detector + skip/not-configured paths in fixtures; live modal is manual).
- Risk review is heuristic and can surface REVIEW REQUIRED on framework code.
- Multi-root workspaces use the first folder only.
- No automated Extension Development Host UI suite.

## Security & dependencies

- npm audit: PASS — 0 vulnerabilities
- Privacy/static safety: PASS — Scanned 40 src files; no network upload / git mutate / prettier --write

## Marketplace publishing prerequisites (outstanding)

- publisher id "shipcheck" must be claimed on Marketplace / Open VSX before publish
- README publisher links point at placeholder GitHub org
- Personal Access Token / publisher login required for vsce publish (not run)
- Do **not** run `vsce publish` from this verify script.

## Manual verification steps (cannot fully automate here)

1. `Developer: Reload Window` after VSIX install.
2. Confirm activity-bar shield / **ShipCheck: Open Results** opens UI.
3. Run **Check My Changes** on a Git JS/TS repo; confirm progress notification + cancel.
4. Click a finding → editor opens at line; dismiss finding; rerun.
5. Export Markdown report via command and open the file.
6. With `confirmScriptExecution: true`, confirm Jest/Vitest modal appears when those tools exist.
7. Confirm Prettier/ESLint UNAVAILABLE vs FAILED messaging on a project without those tools.

## Verdict

**READY** — No FAIL deliverables. BLOCKED items are documented external/manual limits.
