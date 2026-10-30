import * as path from 'path';
import * as fs from 'fs';
import { runCommand } from '../utils/process';
import { ChangedFile, FileChangeStatus } from '../types';

export interface GitContext {
  root: string;
  isRepo: boolean;
}

/**
 * Detect a Git repository by walking up from workspace root,
 * then enumerate modified / staged / untracked / deleted files.
 */
export async function detectGitRoot(startDir: string): Promise<GitContext> {
  let current = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return { root: current, isRepo: true };
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  // Fallback: ask git
  const result = await runCommand('git', {
    cwd: startDir,
    args: ['rev-parse', '--show-toplevel'],
    timeoutMs: 10_000,
  });
  if (result.code === 0 && result.stdout.trim()) {
    return { root: result.stdout.trim(), isRepo: true };
  }
  return { root: startDir, isRepo: false };
}

export async function getChangedFiles(
  gitRoot: string,
  includeUntracked: boolean,
  signal?: AbortSignal
): Promise<ChangedFile[]> {
  const files = new Map<string, ChangedFile>();

  // Porcelain status covers staged, unstaged, untracked, deleted, renamed
  const status = await runCommand('git', {
    cwd: gitRoot,
    args: ['status', '--porcelain', '-uall'],
    timeoutMs: 30_000,
    signal,
  });

  if (status.cancelled || status.code !== 0) {
    return [];
  }

  const lines = status.stdout.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (line.length < 4) {
      continue;
    }
    const x = line[0]; // index (staged)
    const y = line[1]; // work tree
    const rest = line.slice(3);

    // Renames: "R  old -> new"
    let relativePath = rest;
    if (rest.includes(' -> ')) {
      relativePath = rest.split(' -> ').pop()!.trim();
    }

    // Untracked
    if (x === '?' && y === '?') {
      if (!includeUntracked) {
        continue;
      }
      const abs = path.join(gitRoot, relativePath);
      files.set(relativePath, {
        absolutePath: abs,
        relativePath: relativePath.replace(/\\/g, '/'),
        status: 'untracked',
        staged: false,
      });
      continue;
    }

    const staged = x !== ' ' && x !== '?';
    const statusCode = staged ? x : y;
    const fileStatus = mapStatus(statusCode, y);
    const abs = path.join(gitRoot, relativePath);
    const existing = files.get(relativePath);
    if (existing) {
      existing.staged = existing.staged || staged;
      if (staged) {
        existing.status = fileStatus;
      }
    } else {
      files.set(relativePath, {
        absolutePath: abs,
        relativePath: relativePath.replace(/\\/g, '/'),
        status: fileStatus,
        staged,
      });
    }
  }

  return Array.from(files.values()).sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath)
  );
}

function mapStatus(code: string, workTree?: string): FileChangeStatus {
  switch (code) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'M':
      return 'modified';
    case 'U':
      return 'modified';
    default:
      if (workTree === 'D') {
        return 'deleted';
      }
      return 'modified';
  }
}

export function filterExistingJsTs(files: ChangedFile[]): ChangedFile[] {
  return files.filter((f) => {
    if (f.status === 'deleted') {
      return false;
    }
    if (!/\.(jsx?|tsx?|mjs|cjs)$/i.test(f.relativePath)) {
      return false;
    }
    try {
      return fs.existsSync(f.absolutePath);
    } catch {
      return false;
    }
  });
}
