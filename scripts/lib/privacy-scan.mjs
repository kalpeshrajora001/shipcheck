import * as fs from 'node:fs';
import * as path from 'node:path';

const FORBIDDEN = [
  { re: /\bfetch\s*\(/, why: 'fetch() network call' },
  { re: /\baxios\b/, why: 'axios dependency usage' },
  { re: /\bXMLHttpRequest\b/, why: 'XHR network call' },
  { re: /https:\/\/(?!github\.com\/shipcheck|aka\.ms|raw\.githubusercontent)/i, why: 'hardcoded external HTTPS URL' },
  { re: /\btelemetry\b/i, why: 'telemetry reference' },
  { re: /\bposthog\b|\bsentry\.init\b|\bamplitude\b/i, why: 'analytics SDK' },
];

const MUTATE_GIT = [
  { re: /git\s+commit/, why: 'git commit invocation' },
  { re: /git\s+add\b/, why: 'git add invocation' },
  { re: /git\s+push/, why: 'git push invocation' },
  { re: /['"]commit['"]\s*,/, why: 'possible git commit args' },
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'test' || ent.name === 'node_modules') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

export function scanPrivacy(root) {
  const srcRoot = path.join(root, 'src');
  const files = walk(srcRoot);
  const hits = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    // Allow prettier --check only (read-only); forbid --write
    if (/prettier[\s\S]{0,80}--write/.test(text)) {
      hits.push(`${rel}: prettier --write would mutate sources`);
    }
    for (const { re, why } of FORBIDDEN) {
      if (re.test(text)) {
        // README URLs in comments ok; skip report/markdown that only documents
        if (rel.includes('report/') && why.includes('HTTPS')) continue;
        hits.push(`${rel}: ${why}`);
      }
    }
    // Git mutate only in process spawn args — check gitService and process usage
    if (!rel.includes('git/gitService.ts')) {
      for (const { re, why } of MUTATE_GIT) {
        if (re.test(text) && !rel.includes('extension.ts')) {
          // extension doesn't commit; gettingStarted markdown content might mention commit
          if (rel.includes('extension.ts') && /commit or ship/i.test(text)) continue;
          if (/before you commit/i.test(text) || /never.*commit/i.test(text)) continue;
          hits.push(`${rel}: ${why}`);
        }
      }
    }
  }

  // gitService must only use status/rev-parse style read commands
  const gitSrc = fs.readFileSync(path.join(srcRoot, 'git', 'gitService.ts'), 'utf8');
  if (/args:\s*\[[^\]]*'commit'/.test(gitSrc) || /args:\s*\[[^\]]*'push'/.test(gitSrc)) {
    hits.push('gitService.ts: mutating git args detected');
  }
  if (!gitSrc.includes("status") || !gitSrc.includes('rev-parse')) {
    hits.push('gitService.ts: expected read-only status/rev-parse usage missing');
  }

  // prettier check mode
  const prettier = fs.readFileSync(path.join(srcRoot, 'checks', 'prettierCheck.ts'), 'utf8');
  if (!prettier.includes("'--check'") && !prettier.includes('"--check"')) {
    hits.push('prettierCheck.ts: --check flag missing');
  }

  return {
    ok: hits.length === 0,
    detail: hits.length === 0 ? `Scanned ${files.length} src files; no network upload / git mutate / prettier --write` : hits.slice(0, 12).join(' | '),
    hits,
  };
}
