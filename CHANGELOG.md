# Changelog

## 0.2.1

- Central technology capability registry (`src/capabilities/registry.ts`) with honest FULL/PARTIAL/DETECTION_ONLY levels
- Modular adapter registry for non-JS ecosystems
- Universal fixture suite + `SHIPCHECK_UNIVERSAL_COMPATIBILITY_AUDIT.md` via `npm run verify:release`
- Status vocabulary: NOT INSTALLED / NOT SUPPORTED (in addition to existing statuses)
- README capability matrix aligned to tested reality

## 0.2.0

- Multi-language verification: Python, Go, PHP/CMS, Java/Kotlin, Rust, Ruby, C#/.NET, Shell, web/CMS assets — plus existing JS/TS
- Detects project markers (WordPress, Laravel, Django, Maven, Gradle, Cargo, Composer, etc.)
- Security + risk review expanded beyond JavaScript

## 0.1.4

- Add `npm run verify:release` end-to-end release audit with fixture integration harness and `reports/SHIPCHECK_RELEASE_AUDIT.md`

## 0.1.3

- Fix **Open panel** doing nothing: always opens a results editor tab, and reveals the sidebar when possible
- Clearer **REVIEW REQUIRED** copy (suggestions, not failures)

## 0.1.2

- Fix false **Syntax FAILED** on valid TypeScript (regexes / templates). TS/JSX now use the real TypeScript parser.

## 0.1.1

- Friendlier first-run: welcome tip, **Open ShipCheck Panel**, **Getting Started** guide
- Sidebar renamed to **Start here** with plain-language steps and “what next”
- Status bar shows **Check now**; results name which checks failed
- No-Git and no-changes flows explain what to do instead of failing silently
- Secret scan skips test fixtures by default (stops false FAILED on sample keys)
- Auto-focuses the ShipCheck panel when you run a check

## 0.1.0

- Initial MVP: Git change detection, Check My Changes command and sidebar
- ESLint, TypeScript, Prettier, Jest, Vitest integration with auto-detection
- Local secret scan with masked evidence
- Heuristic risk review suggestions (auth, payments, DB, config, validation, errors)
- Results / security trees, dismissals, cancel, rerun, Markdown export
- Configurable product name via `shipcheck.productName`
