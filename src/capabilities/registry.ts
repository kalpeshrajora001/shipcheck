/**
 * Central technology capability registry.
 * Support levels are honest: DETECTION_ONLY / PARTIAL / FULL based on real adapters.
 * Do not claim FULL without executable checks + fixture verification.
 */

export type CapabilityLevel =
  | 'FULL'
  | 'PARTIAL'
  | 'DETECTION_ONLY'
  | 'NOT_SUPPORTED';

export type CapabilityCategory =
  | 'language'
  | 'framework'
  | 'build'
  | 'linter'
  | 'formatter'
  | 'typechecker'
  | 'test'
  | 'security'
  | 'assets';

export interface TechnologyCapability {
  id: string;
  name: string;
  category: CapabilityCategory;
  /** Honest support level */
  level: CapabilityLevel;
  /** File / marker detection (not sufficient alone for FULL) */
  detection: {
    extensions?: string[];
    markers?: string[];
    notes?: string;
  };
  /** External tools required for execution (empty = built-in) */
  requiredTools: Array<{
    name: string;
    optional?: boolean;
    minVersion?: string;
  }>;
  /** Checks the adapter actually implements */
  checks: string[];
  /** High-level command shapes (no shell interpolation) */
  commands: string[];
  /** Adapter module key used by the runner */
  adapterId: string;
  /** Parsing / diagnostic notes */
  diagnostics: string;
  /** Explicit gaps */
  unsupported: string[];
}

export const TECHNOLOGY_REGISTRY: TechnologyCapability[] = [
  {
    id: 'javascript',
    name: 'JavaScript',
    category: 'language',
    level: 'FULL',
    detection: {
      extensions: ['.js', '.jsx', '.mjs', '.cjs'],
      markers: ['package.json'],
    },
    requiredTools: [
      { name: 'node' },
      { name: 'eslint', optional: true },
      { name: 'prettier', optional: true },
    ],
    checks: ['syntax', 'eslint', 'prettier-check'],
    commands: ['node Function-parse / tsc-js', 'eslint --format json', 'prettier --check'],
    adapterId: 'javascript',
    diagnostics: 'ESLint JSON; Prettier path list; JS syntax via parser',
    unsupported: ['auto-fix', 'webpack-specific analysis'],
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    category: 'language',
    level: 'FULL',
    detection: {
      extensions: ['.ts', '.tsx'],
      markers: ['tsconfig.json', 'package.json'],
    },
    requiredTools: [{ name: 'typescript (tsc)', optional: true }],
    checks: ['syntax', 'tsc --noEmit', 'eslint', 'prettier-check'],
    commands: ['tsc --noEmit -p tsconfig', 'eslint', 'prettier --check'],
    adapterId: 'javascript',
    diagnostics: 'tsc file(line,col): error TSxxxx',
    unsupported: ['incremental changed-file-only tsc'],
  },
  {
    id: 'jest',
    name: 'Jest',
    category: 'test',
    level: 'PARTIAL',
    detection: {
      markers: ['jest.config.*', 'package.json scripts with jest'],
    },
    requiredTools: [{ name: 'jest' }],
    checks: ['test run with confirmation'],
    commands: ['npm/yarn/pnpm run <test-script> or local jest'],
    adapterId: 'javascript-tests',
    diagnostics: 'FAIL suite path heuristics',
    unsupported: ['headless CI confirmation bypass without setting'],
  },
  {
    id: 'vitest',
    name: 'Vitest',
    category: 'test',
    level: 'PARTIAL',
    detection: {
      markers: ['vitest.config.*', 'package.json scripts with vitest'],
    },
    requiredTools: [{ name: 'vitest' }],
    checks: ['test run with confirmation'],
    commands: ['vitest run / npm script'],
    adapterId: 'javascript-tests',
    diagnostics: 'FAIL suite path heuristics',
    unsupported: ['browser-mode vitest'],
  },
  {
    id: 'python',
    name: 'Python',
    category: 'language',
    level: 'PARTIAL',
    detection: {
      extensions: ['.py'],
      markers: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile', 'manage.py'],
    },
    requiredTools: [
      { name: 'python3|python' },
      { name: 'ruff', optional: true },
      { name: 'flake8', optional: true },
      { name: 'mypy', optional: true },
    ],
    checks: ['py_compile', 'ruff|flake8', 'mypy'],
    commands: ['python -m py_compile', 'ruff check', 'flake8', 'mypy'],
    adapterId: 'python',
    diagnostics: 'line N / file:line:col parsers',
    unsupported: ['pytest auto-run without confirmation policy', 'poetry env isolation'],
  },
  {
    id: 'django',
    name: 'Django',
    category: 'framework',
    level: 'DETECTION_ONLY',
    detection: { markers: ['manage.py'] },
    requiredTools: [{ name: 'python' }],
    checks: ['inherits Python adapter'],
    commands: [],
    adapterId: 'python',
    diagnostics: 'Framework marker only',
    unsupported: ['django-admin check', 'migrate dry-run'],
  },
  {
    id: 'go',
    name: 'Go',
    category: 'language',
    level: 'PARTIAL',
    detection: {
      extensions: ['.go'],
      markers: ['go.mod'],
    },
    requiredTools: [{ name: 'go' }, { name: 'gofmt', optional: true }],
    checks: ['go vet', 'gofmt -l', 'go build'],
    commands: ['go vet', 'gofmt -l', 'go build ./...'],
    adapterId: 'go',
    diagnostics: 'compiler-style file:line:col',
    unsupported: ['go test auto-run without confirmation'],
  },
  {
    id: 'php',
    name: 'PHP',
    category: 'language',
    level: 'PARTIAL',
    detection: {
      extensions: ['.php'],
      markers: ['composer.json', 'artisan', 'wp-config.php'],
    },
    requiredTools: [
      { name: 'php' },
      { name: 'phpstan', optional: true },
      { name: 'psalm', optional: true },
    ],
    checks: ['php -l', 'phpstan|psalm'],
    commands: ['php -l', 'phpstan analyse', 'psalm'],
    adapterId: 'php',
    diagnostics: 'on line N / raw analysers',
    unsupported: ['phpunit without confirmation', 'WP-CLI'],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    category: 'framework',
    level: 'DETECTION_ONLY',
    detection: { markers: ['wp-config.php', 'wp-content'] },
    requiredTools: [{ name: 'php' }],
    checks: ['inherits PHP syntax/static'],
    commands: [],
    adapterId: 'php',
    diagnostics: 'CMS marker only',
    unsupported: ['plugin/theme specific rulesets'],
  },
  {
    id: 'laravel',
    name: 'Laravel',
    category: 'framework',
    level: 'DETECTION_ONLY',
    detection: { markers: ['artisan'] },
    requiredTools: [{ name: 'php' }],
    checks: ['inherits PHP adapter'],
    commands: [],
    adapterId: 'php',
    diagnostics: 'CMS/framework marker only',
    unsupported: ['php artisan route:list', 'pint auto-write'],
  },
  {
    id: 'java',
    name: 'Java',
    category: 'language',
    level: 'PARTIAL',
    detection: {
      extensions: ['.java'],
      markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    },
    requiredTools: [
      { name: 'mvn|gradle|javac' },
      { name: 'JDK' },
    ],
    checks: ['maven compile', 'gradle compile', 'javac best-effort'],
    commands: ['mvn -DskipTests compile', 'gradle compileJava', 'javac'],
    adapterId: 'java',
    diagnostics: 'javac/Maven/Gradle error lines',
    unsupported: ['Checkstyle/SpotBugs unless later added', 'test runs without confirm'],
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    category: 'language',
    level: 'PARTIAL',
    detection: {
      extensions: ['.kt'],
      markers: ['build.gradle.kts'],
    },
    requiredTools: [{ name: 'gradle' }],
    checks: ['gradle compileKotlin via Java adapter'],
    commands: ['gradle compileKotlin'],
    adapterId: 'java',
    diagnostics: 'Gradle diagnostics',
    unsupported: ['kotlinc standalone'],
  },
  {
    id: 'rust',
    name: 'Rust',
    category: 'language',
    level: 'PARTIAL',
    detection: {
      extensions: ['.rs'],
      markers: ['Cargo.toml'],
    },
    requiredTools: [{ name: 'cargo' }, { name: 'rustfmt', optional: true }],
    checks: ['cargo check', 'cargo fmt --check'],
    commands: ['cargo check --message-format=short', 'cargo fmt -- --check'],
    adapterId: 'rust',
    diagnostics: 'short cargo messages',
    unsupported: ['clippy gated', 'cargo test without confirm'],
  },
  {
    id: 'ruby',
    name: 'Ruby',
    category: 'language',
    level: 'PARTIAL',
    detection: {
      extensions: ['.rb'],
      markers: ['Gemfile', 'Rakefile'],
    },
    requiredTools: [{ name: 'ruby' }, { name: 'rubocop', optional: true }],
    checks: ['ruby -c', 'rubocop'],
    commands: ['ruby -c', 'rubocop --format clang'],
    adapterId: 'ruby',
    diagnostics: 'ruby -c line; rubocop clang',
    unsupported: ['rspec without confirm'],
  },
  {
    id: 'dotnet',
    name: 'C# / .NET',
    category: 'language',
    level: 'PARTIAL',
    detection: {
      extensions: ['.cs'],
      markers: ['*.sln', '*.csproj', 'global.json'],
    },
    requiredTools: [{ name: 'dotnet' }],
    checks: ['dotnet build'],
    commands: ['dotnet build'],
    adapterId: 'dotnet',
    diagnostics: 'file(line,col) style',
    unsupported: ['dotnet test without confirm', 'Analyzer pack specifics'],
  },
  {
    id: 'shell',
    name: 'Shell',
    category: 'language',
    level: 'PARTIAL',
    detection: { extensions: ['.sh', '.bash', '.zsh'] },
    requiredTools: [{ name: 'shellcheck', optional: true }],
    checks: ['shellcheck'],
    commands: ['shellcheck -f gcc'],
    adapterId: 'shell',
    diagnostics: 'gcc-format',
    unsupported: ['bash -n as primary when shellcheck missing (future)'],
  },
  {
    id: 'web-assets',
    name: 'Web / CMS assets',
    category: 'assets',
    level: 'PARTIAL',
    detection: {
      extensions: ['.html', '.css', '.json', '.yaml', '.yml', '.twig', '.liquid', '.vue', '.svelte'],
    },
    requiredTools: [],
    checks: ['json-parse', 'yaml-heuristic', 'html-tag-balance'],
    commands: ['built-in parsers (no external binary)'],
    adapterId: 'web',
    diagnostics: 'JSON.parse errors; heuristic YAML/HTML',
    unsupported: ['full CSS lint', 'Stylelint', 'exact Twig compiler'],
  },
  {
    id: 'security-secrets',
    name: 'Secret scan',
    category: 'security',
    level: 'FULL',
    detection: { notes: 'Runs on scannable source/config files in scope' },
    requiredTools: [],
    checks: ['pattern secret detection + masking'],
    commands: ['built-in regex scan'],
    adapterId: 'security',
    diagnostics: 'file:line evidence masked',
    unsupported: ['cloud secret brokers', 'entropy ML models'],
  },
  {
    id: 'risk-review',
    name: 'Risk review',
    category: 'security',
    level: 'PARTIAL',
    detection: { notes: 'Heuristic keyword scan' },
    requiredTools: [],
    checks: ['review suggestions (not vulns)'],
    commands: ['built-in heuristics'],
    adapterId: 'risk',
    diagnostics: 'REVIEW_REQUIRED suggestions',
    unsupported: ['confirmed vulnerability claims', 'SAST engines'],
  },
];

export function registryById(id: string): TechnologyCapability | undefined {
  return TECHNOLOGY_REGISTRY.find((t) => t.id === id);
}

export function registrySummary(): {
  total: number;
  full: number;
  partial: number;
  detectionOnly: number;
  notSupported: number;
} {
  return {
    total: TECHNOLOGY_REGISTRY.length,
    full: TECHNOLOGY_REGISTRY.filter((t) => t.level === 'FULL').length,
    partial: TECHNOLOGY_REGISTRY.filter((t) => t.level === 'PARTIAL').length,
    detectionOnly: TECHNOLOGY_REGISTRY.filter((t) => t.level === 'DETECTION_ONLY').length,
    notSupported: TECHNOLOGY_REGISTRY.filter((t) => t.level === 'NOT_SUPPORTED').length,
  };
}
