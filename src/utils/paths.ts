import * as path from 'path';
import * as fs from 'fs';
import { minimatch } from './minimatch';

/** Simple exclusion using glob-like patterns. */
export function isExcluded(relativePath: string, excludeGlobs: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return excludeGlobs.some(
    (g) => minimatch(normalized, g) || minimatch(normalized, g.replace(/^\*\*\//, ''))
  );
}

export function walkFiles(
  root: string,
  excludeGlobs: string[],
  extensions: RegExp,
  maxFiles = 5000
): string[] {
  const results: string[] = [];
  const stack: string[] = [root];

  while (stack.length > 0 && results.length < maxFiles) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).replace(/\\/g, '/');
      if (
        isExcluded(rel, excludeGlobs) ||
        entry.name === 'node_modules' ||
        entry.name === '.git'
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile() && extensions.test(entry.name)) {
        results.push(abs);
      }
    }
  }
  return results;
}

export function toRelative(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/');
}
