import { CheckResult } from '../../types';
import { filesFor, LanguageBucket } from '../../detectors/languages';
import { TechnologyAdapter, TechnologyAdapterContext } from '../adapter';
import { runPythonChecks } from '../../checks/ecosystems/pythonCheck';
import { runGoChecks } from '../../checks/ecosystems/goCheck';
import { runPhpChecks } from '../../checks/ecosystems/phpCheck';
import { runJavaChecks } from '../../checks/ecosystems/javaCheck';
import { runRustChecks } from '../../checks/ecosystems/rustCheck';
import { runRubyChecks } from '../../checks/ecosystems/rubyCheck';
import { runDotnetChecks } from '../../checks/ecosystems/dotnetCheck';
import { runShellChecks } from '../../checks/ecosystems/shellCheck';
import { runWebAssetChecks } from '../../checks/ecosystems/webAssetsCheck';

function files(ctx: TechnologyAdapterContext, ...ids: Parameters<typeof filesFor>[1][]): string[] {
  return filesFor(ctx.buckets, ...ids);
}

const pythonAdapter: TechnologyAdapter = {
  id: 'python',
  capabilities: ['python', 'django'],
  detectRelevant: (ctx) => files(ctx, 'python').length > 0,
  run: async (ctx) => runPythonChecks(ctx.workspaceRoot, files(ctx, 'python'), ctx.signal),
};

const goAdapter: TechnologyAdapter = {
  id: 'go',
  capabilities: ['go'],
  detectRelevant: (ctx) => files(ctx, 'go').length > 0,
  run: async (ctx) => runGoChecks(ctx.workspaceRoot, files(ctx, 'go'), ctx.signal),
};

const phpAdapter: TechnologyAdapter = {
  id: 'php',
  capabilities: ['php', 'wordpress', 'laravel'],
  detectRelevant: (ctx) => files(ctx, 'php').length > 0,
  run: async (ctx) => runPhpChecks(ctx.workspaceRoot, files(ctx, 'php'), ctx.signal),
};

const javaAdapter: TechnologyAdapter = {
  id: 'java',
  capabilities: ['java', 'kotlin'],
  detectRelevant: (ctx) => files(ctx, 'java', 'kotlin').length > 0,
  run: async (ctx) =>
    runJavaChecks(ctx.workspaceRoot, files(ctx, 'java', 'kotlin'), ctx.signal),
};

const rustAdapter: TechnologyAdapter = {
  id: 'rust',
  capabilities: ['rust'],
  detectRelevant: (ctx) => files(ctx, 'rust').length > 0,
  run: async (ctx) => runRustChecks(ctx.workspaceRoot, files(ctx, 'rust'), ctx.signal),
};

const rubyAdapter: TechnologyAdapter = {
  id: 'ruby',
  capabilities: ['ruby'],
  detectRelevant: (ctx) => files(ctx, 'ruby').length > 0,
  run: async (ctx) => runRubyChecks(ctx.workspaceRoot, files(ctx, 'ruby'), ctx.signal),
};

const dotnetAdapter: TechnologyAdapter = {
  id: 'dotnet',
  capabilities: ['dotnet'],
  detectRelevant: (ctx) => files(ctx, 'csharp').length > 0,
  run: async (ctx) => runDotnetChecks(ctx.workspaceRoot, files(ctx, 'csharp'), ctx.signal),
};

const shellAdapter: TechnologyAdapter = {
  id: 'shell',
  capabilities: ['shell'],
  detectRelevant: (ctx) => files(ctx, 'shell').length > 0,
  run: async (ctx) => runShellChecks(ctx.workspaceRoot, files(ctx, 'shell'), ctx.signal),
};

const webAdapter: TechnologyAdapter = {
  id: 'web',
  capabilities: ['web-assets'],
  detectRelevant: (ctx) => files(ctx, 'web', 'config').length > 0,
  run: async (ctx) =>
    runWebAssetChecks(ctx.workspaceRoot, files(ctx, 'web', 'config'), ctx.signal),
};

/** Registered modular adapters — single place to extend new languages. */
export const TECHNOLOGY_ADAPTERS: TechnologyAdapter[] = [
  pythonAdapter,
  goAdapter,
  phpAdapter,
  javaAdapter,
  rustAdapter,
  rubyAdapter,
  dotnetAdapter,
  shellAdapter,
  webAdapter,
];

export async function runRegisteredAdapters(opts: {
  workspaceRoot: string;
  buckets: LanguageBucket[];
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
}): Promise<CheckResult[]> {
  const ctx: TechnologyAdapterContext = {
    workspaceRoot: opts.workspaceRoot,
    buckets: opts.buckets,
    files: opts.buckets.flatMap((b) => b.files),
    signal: opts.signal,
  };
  const out: CheckResult[] = [];
  const seen = new Set<string>();
  for (const adapter of TECHNOLOGY_ADAPTERS) {
    if (!adapter.detectRelevant(ctx)) {
      continue;
    }
    if (seen.has(adapter.id)) {
      continue;
    }
    seen.add(adapter.id);
    opts.onProgress?.(`Adapter: ${adapter.id}`);
    const results = await adapter.run(ctx);
    out.push(...results);
  }
  return out;
}
