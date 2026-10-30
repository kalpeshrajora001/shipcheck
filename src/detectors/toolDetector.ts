import * as fs from 'fs';
import * as path from 'path';
import { ToolAvailability, ToolInfo } from '../types';
import { fileExists, resolveLocalBin } from '../utils/process';

const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.eslintrc',
];

const PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
];

export function detectTools(workspaceRoot: string): ToolAvailability {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  let pkg: Record<string, unknown> = {};
  if (fileExists(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    } catch {
      pkg = {};
    }
  }

  const deps = {
    ...(typeof pkg.dependencies === 'object' && pkg.dependencies ? pkg.dependencies : {}),
    ...(typeof pkg.devDependencies === 'object' && pkg.devDependencies ? pkg.devDependencies : {}),
  } as Record<string, string>;

  const scripts = (pkg.scripts ?? {}) as Record<string, string>;

  return {
    eslint: detectEslint(workspaceRoot, deps, pkg),
    typescript: detectTypescript(workspaceRoot, deps),
    prettier: detectPrettier(workspaceRoot, deps, pkg),
    jest: detectJest(workspaceRoot, deps, scripts),
    vitest: detectVitest(workspaceRoot, deps, scripts),
    packageManager: detectPackageManager(workspaceRoot),
    packageJsonPath: fileExists(pkgPath) ? pkgPath : undefined,
  };
}

function detectEslint(
  root: string,
  deps: Record<string, string>,
  pkg: Record<string, unknown>
): ToolInfo {
  const configPath = ESLINT_CONFIGS.map((f) => path.join(root, f)).find(fileExists);
  const hasPkgConfig = Boolean(pkg.eslintConfig);
  const inDeps = Boolean(deps.eslint);
  const bin = resolveLocalBin(root, 'eslint');
  const configured = Boolean(configPath || hasPkgConfig);
  const available = Boolean(bin || inDeps);
  return {
    available,
    configured,
    command: bin,
    configPath: configPath ?? (hasPkgConfig ? path.join(root, 'package.json') : undefined),
    detail: !available
      ? 'ESLint not found in node_modules'
      : !configured
        ? 'No ESLint config file detected'
        : `Config: ${configPath ? path.basename(configPath) : 'package.json'}`,
  };
}

function detectTypescript(root: string, deps: Record<string, string>): ToolInfo {
  const tsconfig = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.build.json']
    .map((f) => path.join(root, f))
    .find(fileExists);
  const bin = resolveLocalBin(root, 'tsc');
  const inDeps = Boolean(deps.typescript);
  return {
    available: Boolean(bin || inDeps),
    configured: Boolean(tsconfig),
    command: bin,
    configPath: tsconfig,
    detail: !tsconfig
      ? 'No tsconfig.json found'
      : !bin && !inDeps
        ? 'TypeScript not installed locally'
        : `Config: ${path.basename(tsconfig!)}`,
  };
}

function detectPrettier(
  root: string,
  deps: Record<string, string>,
  pkg: Record<string, unknown>
): ToolInfo {
  const configPath = PRETTIER_CONFIGS.map((f) => path.join(root, f)).find(fileExists);
  const hasPkg = Boolean(pkg.prettier);
  const prettierIgnore = fileExists(path.join(root, '.prettierignore'));
  const bin = resolveLocalBin(root, 'prettier');
  const inDeps = Boolean(deps.prettier);
  const configured = Boolean(configPath || hasPkg || prettierIgnore || inDeps);
  return {
    available: Boolean(bin || inDeps),
    configured,
    command: bin,
    configPath: configPath ?? (hasPkg ? path.join(root, 'package.json') : undefined),
    detail: !bin && !inDeps
      ? 'Prettier not found in node_modules'
      : configured
        ? 'Prettier available'
        : 'Prettier present but no project config (defaults will apply for check)',
  };
}

function detectJest(
  root: string,
  deps: Record<string, string>,
  scripts: Record<string, string>
): ToolInfo {
  const configs = [
    'jest.config.js',
    'jest.config.cjs',
    'jest.config.mjs',
    'jest.config.ts',
    'jest.config.json',
  ]
    .map((f) => path.join(root, f))
    .find(fileExists);
  const bin = resolveLocalBin(root, 'jest');
  const inDeps = Boolean(deps.jest) || Boolean(deps['@jest/core']);
  const scriptHint = Object.entries(scripts).find(
    ([, v]) => /\bjest\b/.test(v) && !/\bvitest\b/.test(v)
  );
  const available = Boolean(bin || inDeps || scriptHint);
  const configured = Boolean(configs || inDeps || scriptHint);
  return {
    available,
    configured,
    command: bin,
    configPath: configs,
    detail: !available
      ? 'Jest not detected'
      : scriptHint
        ? `Script: npm run ${scriptHint[0]}`
        : configs
          ? `Config: ${path.basename(configs)}`
          : 'Jest dependency present',
  };
}

function detectVitest(
  root: string,
  deps: Record<string, string>,
  scripts: Record<string, string>
): ToolInfo {
  const configs = [
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mjs',
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mjs',
  ]
    .map((f) => path.join(root, f))
    .find(fileExists);
  const bin = resolveLocalBin(root, 'vitest');
  const inDeps = Boolean(deps.vitest);
  const scriptHint = Object.entries(scripts).find(([, v]) => /\bvitest\b/.test(v));
  const available = Boolean(bin || inDeps || scriptHint);
  const configured = Boolean(configs || inDeps || scriptHint);
  return {
    available,
    configured,
    command: bin,
    configPath: configs,
    detail: !available
      ? 'Vitest not detected'
      : scriptHint
        ? `Script: npm run ${scriptHint[0]}`
        : configs
          ? `Config: ${path.basename(configs)}`
          : 'Vitest dependency present',
  };
}

function detectPackageManager(root: string): 'npm' | 'yarn' | 'pnpm' | 'none' {
  if (fileExists(path.join(root, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fileExists(path.join(root, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fileExists(path.join(root, 'package-lock.json')) || fileExists(path.join(root, 'package.json'))) {
    return 'npm';
  }
  return 'none';
}

export function getTestScript(
  workspaceRoot: string,
  prefer: 'jest' | 'vitest'
): { scriptName: string; command: string } | undefined {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (!fileExists(pkgPath)) {
    return undefined;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    const needle = prefer === 'vitest' ? /\bvitest\b/ : /\bjest\b/;
    // Prefer dedicated test script that matches
    for (const name of ['test', 'test:unit', 'test:ci', prefer]) {
      if (scripts[name] && needle.test(scripts[name])) {
        return { scriptName: name, command: scripts[name] };
      }
    }
    const entry = Object.entries(scripts).find(([, v]) => needle.test(v));
    if (entry) {
      return { scriptName: entry[0], command: entry[1] };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
