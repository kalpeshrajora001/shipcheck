# ShipCheck

**ShipCheck** is a local VS Code extension that verifies your changes before you commit or ship — from CMS stacks to large polyglot codebases. It detects languages in your Git diff and runs the matching local tools when they are installed, plus a secret scan and heuristic review suggestions.

**Temporary working name:** ShipCheck. Rebrand anytime with the `shipcheck.productName` setting (UI, status bar, notifications, and reports pick it up).

No API key. No cloud service. No account. No AI provider. Source never leaves your machine through this extension.

---

## Features

- **Git-aware change detection** — modified, staged, newly created (untracked), renamed, and deleted files
- **Primary action: “Check My Changes”** — activity-bar sidebar button, command palette, status bar, and editor title (JS/TS)
- **Automatic tool detection** — ESLint, TypeScript (`tsc`), Prettier, Jest, and Vitest (configs + local binaries)
- **Read-only checks** — never auto-formats, never modifies source, never stages/commits, never uploads code
- **Script confirmation** — asks before running project test scripts (treats scripts as untrusted input)
- **Local security scan** — API keys, passwords, tokens, private keys, and similar patterns; **secrets are masked** in results
- **Risk review suggestions** — auth, authorization, payments, database, configuration, validation, error handling — clearly labeled as **review suggestions, not confirmed vulnerabilities**
- **Clear statuses** — `PASSED`, `FAILED`, `REVIEW REQUIRED`, `NOT CHECKED`, plus `SKIPPED` / `UNAVAILABLE` / `NOT CONFIGURED` / `CANCELLED` per check
- **No safety score** — never invents an overall “security score” or claims that passing means secure code
- **Workflow actions** — open finding, dismiss finding, rerun, scan full workspace, cancel scan, export Markdown report

---

## Supported technologies (capability matrix)

Statuses are honest. **FULL** = detection + real execution adapters verified with fixtures. **PARTIAL** = real execution when tools exist; optional tools may be NOT INSTALLED. **DETECTION ONLY** = project markers only (inherits language adapter; no framework-specific CLI yet).

| Technology | Detection | Checks | Execution tested | Status |
| --- | --- | --- | --- | --- |
| JavaScript | `package.json`, `.js/.jsx/.mjs/.cjs` | Syntax, ESLint, Prettier `--check` | Yes (fixtures + unit) | **FULL** |
| TypeScript | `tsconfig.json`, `.ts/.tsx` | `tsc --noEmit`, ESLint, Prettier | Yes | **FULL** |
| Secret scan | Scannable sources/configs | Pattern scan + masking | Yes | **FULL** |
| Jest | jest config / scripts | Test run (confirmation) | Detector yes; UI confirm manual | **PARTIAL** |
| Vitest | vitest config / scripts | Test run (confirmation) | Detector yes; UI confirm manual | **PARTIAL** |
| Python | `.py`, pyproject/requirements/manage.py | `py_compile`, Ruff/Flake8, mypy | Yes when `python` on PATH | **PARTIAL** |
| Go | `.go`, `go.mod` | `go vet`, `gofmt -l`, `go build` | Yes when `go` on PATH | **PARTIAL** |
| PHP | `.php`, composer/artisan/wp-config | `php -l`, PHPStan/Psalm | Yes when `php` on PATH | **PARTIAL** |
| Java / Kotlin | `.java/.kt`, Maven/Gradle | compile via mvn/gradle/javac | Yes (javac fixtures; Maven/Gradle when present) | **PARTIAL** |
| Rust | `.rs`, `Cargo.toml` | `cargo check`, `fmt --check` | Fixture + NOT INSTALLED when cargo absent | **PARTIAL** |
| Ruby | `.rb`, Gemfile | `ruby -c`, RuboCop | Yes when `ruby` on PATH | **PARTIAL** |
| C# / .NET | `.cs`, `.sln/.csproj` | `dotnet build` | Fixture + NOT INSTALLED when SDK absent | **PARTIAL** |
| Shell | `.sh/.bash/.zsh` | ShellCheck | When `shellcheck` present | **PARTIAL** |
| Web / CMS assets | html/css/json/yaml/twig/liquid/vue | JSON parse, YAML/HTML heuristics | Yes (built-in) | **PARTIAL** |
| Risk review | Heuristics on sources | Review suggestions only | Yes | **PARTIAL** |
| WordPress | `wp-config.php`, `wp-content` | Inherits PHP | Marker only | **DETECTION ONLY** |
| Laravel | `artisan` | Inherits PHP | Marker only | **DETECTION ONLY** |
| Django | `manage.py` | Inherits Python | Marker only | **DETECTION ONLY** |

Missing tools are **NOT INSTALLED** / **NOT CONFIGURED** — never silent PASSED. Source of truth: `src/capabilities/registry.ts`.

### Release / compatibility verification

```bash
npm run verify:release
```

Produces:
- `reports/SHIPCHECK_RELEASE_AUDIT.md`
- `reports/SHIPCHECK_UNIVERSAL_COMPATIBILITY_AUDIT.md`

---

## Prerequisites

- Visual Studio Code **1.85+** (or compatible Cursor/VS Code fork that loads VS Code extensions)
- **Node.js 18+** (20 LTS recommended) for developing and packaging the extension
- A workspace folder opened in the editor
- For change-scoped scans: a **Git** repository
- Project-local installs of the tools you want checked (`eslint`, `typescript`, `prettier`, `jest`, `vitest`)

---

## Installation (from source)

```bash
git clone <this-repo> shipcheck
cd shipcheck
npm install
npm run compile
```

Then in VS Code/Cursor:

1. Open this folder
2. Press **F5** (launch **Run Extension**)
3. In the Extension Development Host, open a JS/TS Git project
4. Click the ShipCheck shield in the activity bar → **Check My Changes**

### Install a VSIX

```bash
npm run verify:release   # preferred: full audit + package
# or: npm run package
cursor --install-extension ./shipcheck-0.2.1.vsix --force
# or: code --install-extension ./shipcheck-0.2.1.vsix --force
```

---

## Development setup

```bash
npm install
npm run compile    # TypeScript → out/
npm run watch      # incremental compile
npm run lint       # ESLint on src/
npm run test       # unit tests
npm run test:integration  # temp Git/JS/TS/Prettier fixtures
npm run check      # compile + lint + unit tests
```

### Release verification (required before shipping a VSIX)

```bash
npm run verify:release
```

This command runs compile, lint, unit tests, fixture integration checks, `npm audit`, manifest validation, privacy/static safety scan, VSIX packaging, VSIX content inspection, and a CLI install smoke test when `cursor` or `code` is on your `PATH`.

- **Exit code `0`:** overall **READY** (BLOCKED items may still document manual/Marketplace limits)
- **Exit code `1`:** overall **NOT READY** (one or more FAIL deliverables)
- **Report:** [`reports/SHIPCHECK_RELEASE_AUDIT.md`](./reports/SHIPCHECK_RELEASE_AUDIT.md)

Do not treat documentation alone as proof — only this report’s PASS/FAIL/BLOCKED rows.

### Debug

- `.vscode/launch.json` — **Run Extension** starts an Extension Development Host
- Set breakpoints in `src/` (source maps enabled)

### Project layout

```
src/
  extension.ts          # activation & commands
  config.ts             # product name + settings (easy rename)
  types.ts              # shared domain types
  git/gitService.ts     # repo detection & changed files
  detectors/            # ESLint / tsc / Prettier / Jest / Vitest
  checks/               # individual check runners + orchestrator
  ui/                   # sidebar webview, trees, status bar
  report/               # Markdown export
  utils/                # process, secrets masking, paths
  test/unit/            # Node.js unit tests
media/                  # activity-bar & marketplace artwork
```

---

## Build and packaging

```bash
npm run compile
npm run package
```

`npm run package` runs `vsce package` and produces a `.vsix` in the repo root.

**Publishing (optional):**

```bash
npx @vscode/vsce publish
# or
npx ovsx publish shipcheck-*.vsix
```

Configure `publisher` in `package.json` before marketplace publish.

---

## Usage

1. Open a Git-backed JS/TS project.
2. Open the **ShipCheck** activity-bar view.
3. Click **Check My Changes** (or run **ShipCheck: Check My Changes** from the command palette).
4. Review:
   - **Verification** sidebar — overall status and per-check summary
   - **Changed Files** — Git status list
   - **Results** — lint/type/format/test findings
   - **Security & Review** — masked secret hits and review suggestions
5. Click a finding to open the file at the reported line.
6. Dismiss noise via the finding context action; clear dismissals from the command palette.
7. **Export Markdown Report** when you want a shareable local artifact.
8. **Cancel Scan** stops in-flight work; **Rerun** repeats the last scope.

### Commands

| Command | ID |
| --- | --- |
| Check My Changes | `shipcheck.checkMyChanges` |
| Scan Full Workspace | `shipcheck.scanWorkspace` |
| Cancel Scan | `shipcheck.cancelScan` |
| Rerun Checks | `shipcheck.rerunChecks` |
| Export Markdown Report | `shipcheck.exportReport` |
| Clear Dismissed Findings | `shipcheck.clearDismissed` |
| Open Settings | `shipcheck.openSettings` |
| Refresh Changed Files | `shipcheck.refreshFiles` |

### Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `shipcheck.productName` | `ShipCheck` | Display name (easy rebrand) |
| `shipcheck.confirmScriptExecution` | `true` | Confirm before running test scripts |
| `shipcheck.runTests` | `true` | Enable Jest/Vitest integration |
| `shipcheck.runSecurityScan` | `true` | Local secret pattern scan |
| `shipcheck.runRiskReview` | `true` | Heuristic review suggestions |
| `shipcheck.includeUntracked` | `true` | Include untracked files |
| `shipcheck.maxFileSizeKb` | `512` | Skip larger files in text scans |
| `shipcheck.excludeGlobs` | `node_modules`, `dist`, … | Paths to ignore |

---

## Security and privacy

- **Fully local** — checks run as child processes on your machine; no ShipCheck backend.
- **No telemetry / accounts / API keys** required by this extension.
- **Untrusted input** — repository scripts and configs are not shell-interpolated; commands use `spawn` with argument arrays. Test scripts require explicit confirmation by default.
- **Secrets masking** — findings redact credential-like values in messages and reports.
- **No auto-writes** — Prettier runs with `--check` only; the extension does not stage, commit, or push.
- **Honest framing** — review items are suggestions; a green run is not a security guarantee.

---

## Limitations

- MVP focuses on **JavaScript/TypeScript** ecosystems.
- Security scanning is **pattern-based**, not a full SAST/DAST product; expect false positives and negatives.
- Risk review is **heuristic** and intentionally noisy in sensitive areas.
- TypeScript check uses the **project** `tsconfig` (whole program), not a custom incremental subset.
- Tests may run the **project’s** configured script (broader than “changed files only”).
- Multi-root workspaces use the **first** folder.
- Does not replace code review, threat modeling, or dedicated security tooling.

---

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| No changed files | Confirm Git repo; run **Refresh Changed Files**; check `includeUntracked` |
| ESLint UNAVAILABLE | `npm i -D eslint` and ensure a config file exists |
| TypeScript NOT CONFIGURED | Add `tsconfig.json` and `typescript` |
| Prettier UNAVAILABLE | Install `prettier` locally |
| Tests SKIPPED | Approve the confirmation dialog, or disable confirmation in settings |
| Scan hangs | **Cancel Scan**; exclude large generated trees via `excludeGlobs` |
| Findings reappear | Clear dismissed list or rerun after fixing |

---

## Future roadmap

- Broader language packs (Python, Go, etc.) via pluggable checkers
- Richer SARIF import/export
- Optional CI companion CLI sharing the same engines
- Baseline / suppressions file committed with the repo
- Incremental `tsc` for changed files only
- Custom check plugins

---

## License

MIT — see [LICENSE](./LICENSE).
