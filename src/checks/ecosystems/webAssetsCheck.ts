import * as fs from 'fs';
import * as path from 'path';
import { CheckResult, Finding } from '../../types';
import { findingId, maskSecrets } from '../../utils/secrets';
import { notConfigured } from './parseHelpers';

/**
 * CMS / front-of-site assets: JSON, YAML, HTML/XML-ish templates.
 * Intentionally conservative — validates structure, does not rewrite files.
 */
export async function runWebAssetChecks(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult[]> {
  const targets = files.filter((f) =>
    /\.(json|ya?ml|html?|xml|twig|liquid|hbs|ejs|vue|svelte)$/i.test(f)
  );
  if (!targets.length) {
    return [
      notConfigured(
        'web-assets',
        'Web / CMS assets',
        'JSON/YAML/HTML structure checks',
        'No web/CMS asset files in scope'
      ),
    ];
  }

  const start = Date.now();
  const base = {
    id: 'web-assets',
    name: 'Web / CMS assets',
    description: 'Validate JSON/YAML parse + basic HTML/template structure',
  };
  const findings: Finding[] = [];

  for (const file of targets) {
    if (signal?.aborted) {
      return [{ ...base, status: 'CANCELLED', findings: [], summary: 'Cancelled', durationMs: Date.now() - start }];
    }
    const rel = path.relative(workspaceRoot, file).replace(/\\/g, '/');
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (e) {
      findings.push({
        id: findingId(base.id, rel, undefined, 'read'),
        kind: 'syntax',
        severity: 'error',
        title: 'Could not read asset',
        message: maskSecrets(e instanceof Error ? e.message : String(e)),
        filePath: rel,
        suggestion: 'Ensure the file exists and is readable.',
        checkId: base.id,
      });
      continue;
    }

    if (/\.json$/i.test(file)) {
      try {
        JSON.parse(content);
      } catch (e) {
        findings.push({
          id: findingId(base.id, rel, undefined, 'json'),
          kind: 'syntax',
          severity: 'error',
          title: 'Invalid JSON',
          message: maskSecrets(e instanceof Error ? e.message : String(e)),
          filePath: rel,
          suggestion: 'Fix JSON syntax (common in CMS config / theme manifests).',
          checkId: base.id,
        });
      }
      continue;
    }

    if (/\.ya?ml$/i.test(file)) {
      const err = basicYamlCheck(content);
      if (err) {
        findings.push({
          id: findingId(base.id, rel, err.line, 'yaml'),
          kind: 'syntax',
          severity: 'error',
          title: 'Possible YAML structure issue',
          message: err.message,
          filePath: rel,
          line: err.line,
          suggestion: 'Validate YAML indentation/structure (CI, Drupal, K8s, etc.).',
          checkId: base.id,
        });
      }
      continue;
    }

    // HTML / templates — check rough tag balance excluding void tags
    const balance = roughHtmlBalance(content);
    if (balance) {
      findings.push({
        id: findingId(base.id, rel, balance.line, 'html'),
        kind: 'syntax',
        severity: 'warning',
        title: 'Possible unclosed HTML/template tag',
        message: balance.message,
        filePath: rel,
        line: balance.line,
        suggestion: 'Review template markup (Twig/Liquid/Blade/HTML).',
        checkId: base.id,
      });
    }
  }

  return [
    {
      ...base,
      status: findings.some((f) => f.severity === 'error')
        ? 'FAILED'
        : findings.length
          ? 'FAILED'
          : 'PASSED',
      findings,
      summary: findings.length
        ? `${findings.length} asset issue(s)`
        : `Validated ${targets.length} web/CMS asset(s)`,
      durationMs: Date.now() - start,
    },
  ];
}

function basicYamlCheck(content: string): { message: string; line?: number } | undefined {
  const lines = content.split(/\r?\n/);
  const indentStack: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (/^\t/.test(line)) {
      return { message: 'Tab indentation detected (YAML prefers spaces)', line: i + 1 };
    }
    if (indent > indentStack[indentStack.length - 1] + 8) {
      return { message: 'Suspicious indentation jump', line: i + 1 };
    }
    while (indentStack.length && indent < indentStack[indentStack.length - 1]) {
      indentStack.pop();
    }
    if (indent > indentStack[indentStack.length - 1]) {
      indentStack.push(indent);
    }
  }
  // Odd quote counts on a line
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].replace(/''/g, '').replace(/""/g, '');
    const singles = (t.match(/'/g) || []).length;
    const doubles = (t.match(/"/g) || []).length;
    if (singles % 2 === 1 || doubles % 2 === 1) {
      return { message: 'Unbalanced quotes on line', line: i + 1 };
    }
  }
  return undefined;
}

function roughHtmlBalance(content: string): { message: string; line?: number } | undefined {
  const voidTags = new Set([
    'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr',
  ]);
  const stack: { tag: string; line: number }[] = [];
  const re = /<\/?([A-Za-z][\w:-]*)\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    if (full.startsWith('<!--') || tag.startsWith('!')) {
      continue;
    }
    const line = content.slice(0, m.index).split(/\r?\n/).length;
    if (full.startsWith('</')) {
      const top = stack.pop();
      if (!top || top.tag !== tag) {
        return { message: `Unexpected closing </${tag}>`, line };
      }
    } else if (full.endsWith('/>') || voidTags.has(tag)) {
      continue;
    } else {
      stack.push({ tag, line });
    }
  }
  if (stack.length) {
    const top = stack[stack.length - 1];
    return { message: `Unclosed <${top.tag}>`, line: top.line };
  }
  return undefined;
}
