import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
}

export interface RunOptions {
  cwd: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** Absolute paths only — never pass untrusted shell strings */
  shell?: boolean;
  signal?: AbortSignal;
  maxBuffer?: number;
}

/**
 * Run a local binary securely without a shell by default.
 * Treats project scripts as untrusted: no shell interpolation.
 */
export function runCommand(
  command: string,
  options: RunOptions
): Promise<RunResult> {
  const {
    cwd,
    args = [],
    env,
    timeoutMs = 120_000,
    shell = false,
    signal,
    maxBuffer = 8 * 1024 * 1024,
  } = options;

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ code: null, stdout: '', stderr: 'Cancelled', timedOut: false, cancelled: true });
      return;
    }

    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let stdout = '';
    let stderr = '';

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env, FORCE_COLOR: '0', CI: '1' },
      shell,
      windowsHide: true,
    } as SpawnOptionsWithoutStdio);

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 2000).unref?.();
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    const onAbort = (): void => {
      cancelled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxBuffer) {
        stdout += chunk.toString('utf8');
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxBuffer) {
        stderr += chunk.toString('utf8');
      }
    });

    const finish = (code: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, stdout, stderr, timedOut, cancelled });
    };

    child.on('error', (err) => {
      stderr += err.message;
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

/** Resolve a local node_modules/.bin binary if present. */
export function resolveLocalBin(workspaceRoot: string, binName: string): string | undefined {
  const candidates = [
    path.join(workspaceRoot, 'node_modules', '.bin', binName),
    path.join(workspaceRoot, 'node_modules', '.bin', `${binName}.cmd`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return undefined;
}

/** Prefer local bin; fall back to npx with explicit package (still no shell). */
export function resolveRunner(
  workspaceRoot: string,
  binName: string
): { command: string; prefixArgs: string[] } {
  const local = resolveLocalBin(workspaceRoot, binName);
  if (local) {
    return { command: local, prefixArgs: [] };
  }
  return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', prefixArgs: ['--no-install', binName] };
}

export function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function readFileSafe(p: string, maxBytes = 512 * 1024): string | undefined {
  try {
    const stat = fs.statSync(p);
    if (!stat.isFile() || stat.size > maxBytes) {
      return undefined;
    }
    return fs.readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

export function isJsTsFile(filePath: string): boolean {
  return /\.(jsx?|tsx?|mjs|cjs)$/i.test(filePath);
}

/** Text-like sources across ecosystems for secret/risk scans. */
export function isScannableSourceFile(filePath: string): boolean {
  return (
    isJsTsFile(filePath) ||
    /\.(py|go|php|java|kt|rs|rb|cs|sh|bash|zsh|html?|css|scss|vue|svelte|twig|liquid|hbs|ejs|json|ya?ml|toml|xml|tf|sql)$/i.test(
      filePath
    ) ||
    /(^|[\\/])\.env(\.|$)/i.test(filePath)
  );
}
