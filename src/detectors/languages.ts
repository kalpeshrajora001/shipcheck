import * as fs from 'fs';
import * as path from 'path';
import { ChangedFile } from '../types';
import { fileExists } from '../utils/process';

export type LanguageId =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'go'
  | 'php'
  | 'java'
  | 'kotlin'
  | 'rust'
  | 'ruby'
  | 'csharp'
  | 'shell'
  | 'web'
  | 'config'
  | 'other';

export interface LanguageBucket {
  id: LanguageId;
  label: string;
  files: string[];
}

const EXT_MAP: Array<{ id: LanguageId; re: RegExp }> = [
  { id: 'typescript', re: /\.tsx?$/i },
  { id: 'javascript', re: /\.(jsx?|mjs|cjs)$/i },
  { id: 'python', re: /\.py$/i },
  { id: 'go', re: /\.go$/i },
  { id: 'php', re: /\.php$/i },
  { id: 'java', re: /\.java$/i },
  { id: 'kotlin', re: /\.kt$/i },
  { id: 'rust', re: /\.rs$/i },
  { id: 'ruby', re: /\.rb$/i },
  { id: 'csharp', re: /\.cs$/i },
  { id: 'shell', re: /\.(sh|bash|zsh)$/i },
  {
    id: 'web',
    re: /\.(html?|css|scss|sass|less|vue|svelte|blade\.php|twig|liquid|hbs|ejs)$/i,
  },
  {
    id: 'config',
    re: /\.(json|ya?ml|toml|xml|ini|env)$/i,
  },
];

const LABELS: Record<LanguageId, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  php: 'PHP / CMS',
  java: 'Java',
  kotlin: 'Kotlin',
  rust: 'Rust',
  ruby: 'Ruby',
  csharp: 'C# / .NET',
  shell: 'Shell',
  web: 'Web / templates',
  config: 'Config',
  other: 'Other',
};

/** Broad regex for workspace enumeration across ecosystems. */
export const SUPPORTED_SOURCE_RE =
  /\.(jsx?|tsx?|mjs|cjs|py|go|php|java|kt|rs|rb|cs|sh|bash|zsh|html?|css|scss|sass|less|vue|svelte|twig|liquid|hbs|ejs|json|ya?ml|toml|xml)$/i;

export function languageOf(filePath: string): LanguageId {
  const base = path.basename(filePath);
  if (/(^|[\\/])\.env(\.|$)/i.test(filePath) || base.startsWith('.env')) {
    return 'config';
  }
  for (const { id, re } of EXT_MAP) {
    if (re.test(filePath) || re.test(base)) {
      return id;
    }
  }
  return 'other';
}

export function bucketChangedFiles(
  files: ChangedFile[],
  existingOnly = true
): LanguageBucket[] {
  const map = new Map<LanguageId, string[]>();
  for (const f of files) {
    if (f.status === 'deleted') {
      continue;
    }
    if (existingOnly) {
      try {
        if (!fs.existsSync(f.absolutePath)) {
          continue;
        }
      } catch {
        continue;
      }
    }
    const id = languageOf(f.absolutePath);
    if (id === 'other') {
      continue;
    }
    const list = map.get(id) ?? [];
    list.push(f.absolutePath);
    map.set(id, list);
  }
  return Array.from(map.entries()).map(([id, fileList]) => ({
    id,
    label: LABELS[id],
    files: fileList,
  }));
}

export function filesFor(
  buckets: LanguageBucket[],
  ...ids: LanguageId[]
): string[] {
  const set = new Set(ids);
  return buckets.filter((b) => set.has(b.id)).flatMap((b) => b.files);
}

export interface EcosystemHints {
  hasNode: boolean;
  hasPython: boolean;
  hasGo: boolean;
  hasPhp: boolean;
  hasJava: boolean;
  hasRust: boolean;
  hasRuby: boolean;
  hasDotnet: boolean;
  markers: string[];
}

/** Detect ecosystems from repo markers (CMS → enterprise). */
export function detectEcosystemHints(workspaceRoot: string): EcosystemHints {
  const markers: string[] = [];
  const has = (rel: string): boolean => {
    const ok = fileExists(path.join(workspaceRoot, rel));
    if (ok) {
      markers.push(rel);
    }
    return ok;
  };

  const hasNode = has('package.json');
  const hasPython =
    has('pyproject.toml') ||
    has('requirements.txt') ||
    has('setup.py') ||
    has('Pipfile') ||
    has('manage.py'); // Django
  const hasGo = has('go.mod');
  const hasPhp =
    has('composer.json') ||
    has('wp-config.php') ||
    has('artisan') || // Laravel
    fileExists(path.join(workspaceRoot, 'web', 'index.php')); // Drupal-ish
  const hasJava =
    has('pom.xml') ||
    has('build.gradle') ||
    has('build.gradle.kts') ||
    has('settings.gradle');
  const hasRust = has('Cargo.toml');
  const hasRuby = has('Gemfile') || has('Rakefile');
  const hasDotnet =
    has('global.json') ||
    fs
      .readdirSync(workspaceRoot)
      .some((n) => /\.(sln|csproj)$/i.test(n));

  if (markers.includes('wp-config.php') || fileExists(path.join(workspaceRoot, 'wp-content'))) {
    markers.push('WordPress');
  }
  if (markers.includes('artisan') || fileExists(path.join(workspaceRoot, 'artisan'))) {
    markers.push('Laravel');
  }
  if (markers.includes('manage.py') || fileExists(path.join(workspaceRoot, 'manage.py'))) {
    markers.push('Django');
  }

  return {
    hasNode,
    hasPython,
    hasGo,
    hasPhp,
    hasJava,
    hasRust,
    hasRuby,
    hasDotnet,
    markers,
  };
}

export function summarizeLanguages(buckets: LanguageBucket[]): string {
  if (!buckets.length) {
    return 'none';
  }
  return buckets.map((b) => `${b.label} (${b.files.length})`).join(', ');
}
