import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as os from 'node:os';

export function inspectVsix(vsixPath, pkg) {
  const stat = fs.statSync(vsixPath);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-vsix-'));
  try {
    const unzip = spawnSync('unzip', ['-l', vsixPath], { encoding: 'utf8' });
    if (unzip.status !== 0) {
      return {
        ok: false,
        detail: `unzip -l failed: ${(unzip.stderr || unzip.stdout).slice(0, 200)}`,
        sizeBytes: stat.size,
        name: path.basename(vsixPath),
        files: [],
      };
    }
    const listing = unzip.stdout;
    const requiredPatterns = [
      'extension/package.json',
      'extension/out/extension.js',
      'extension/media/activity-bar.svg',
    ];
    // vsce lowercases README/CHANGELOG; LICENSE becomes LICENSE.txt
    const hasReadme =
      listing.toLowerCase().includes('extension/readme.md');
    const hasLicense =
      listing.includes('extension/LICENSE') ||
      listing.toLowerCase().includes('license.txt');
    const missing = requiredPatterns.filter((f) => !listing.includes(f));
    if (!hasReadme) missing.push('extension/readme.md');
    if (!hasLicense) missing.push('extension/LICENSE.txt');
    // Must NOT ship tests, src, or verify scripts
    const banned = [];
    if (listing.includes('extension/src/')) banned.push('src/ leaked into VSIX');
    if (listing.includes('extension/out/test/')) banned.push('out/test/ leaked into VSIX');
    if (listing.includes('extension/scripts/')) banned.push('scripts/ leaked into VSIX');
    if (listing.includes('node_modules/')) banned.push('node_modules leaked (unexpected with --no-dependencies)');

    const ok = missing.length === 0 && banned.length === 0;
    return {
      ok,
      name: path.basename(vsixPath),
      version: pkg.version,
      sizeBytes: stat.size,
      sizeKb: Math.round(stat.size / 1024),
      detail: ok
        ? `${path.basename(vsixPath)} ${Math.round(stat.size / 1024)}KB; entry out/extension.js present; no src/test leakage`
        : `missing=${missing.join(',') || 'none'}; banned=${banned.join(',') || 'none'}`,
      files: listing.split('\n').filter((l) => l.includes('extension/')).slice(0, 80),
      listingSnippet: listing.slice(0, 1500),
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
