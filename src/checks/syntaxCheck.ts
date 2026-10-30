import * as fs from 'fs';
import * as path from 'path';
import { CheckResult, Finding } from '../types';
import { findingId, maskSecrets } from '../utils/secrets';
import { isJsTsFile, fileExists } from '../utils/process';

const CHECK_ID = 'syntax';

/**
 * Syntax check:
 * - JS: Node Function parse
 * - TS/TSX/JSX: TypeScript parser from the workspace when available
 *   (never use brace-counting heuristics — they false-fail on regexes/templates)
 */
export async function runSyntaxCheck(
  workspaceRoot: string,
  files: string[],
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const targets = files.filter(isJsTsFile);
  if (targets.length === 0) {
    return {
      id: CHECK_ID,
      name: 'Syntax',
      description: 'Parse JavaScript/TypeScript files for basic syntax errors',
      status: 'NOT_CHECKED',
      findings: [],
      summary: 'No JS/TS files to check',
      durationMs: Date.now() - start,
    };
  }

  const ts = loadWorkspaceTypescript(workspaceRoot);
  const findings: Finding[] = [];
  let deferredTs = 0;

  for (const file of targets) {
    if (signal?.aborted) {
      return cancelled(start);
    }
    try {
      const source = fs.readFileSync(file, 'utf8');
      const rel = path.relative(workspaceRoot, file).replace(/\\/g, '/');
      const isTsLike = /\.tsx?$/i.test(file) || /\.jsx$/i.test(file);

      let err: SyntaxErrorInfo | undefined;
      if (isTsLike) {
        if (ts) {
          err = checkWithTypescript(ts, source, file);
        } else {
          // Avoid false positives; the TypeScript check covers these files.
          deferredTs += 1;
          continue;
        }
      } else {
        // .mjs / ESM `import`/`export` cannot be parsed by `new Function`.
        const looksEsm =
          /\.mjs$/i.test(file) ||
          /^\s*(import|export)\s/m.test(source) ||
          /\bimport\s*\(/.test(source);
        if (looksEsm && ts) {
          err = checkWithTypescript(ts, source, file);
        } else if (looksEsm) {
          // No local TypeScript package: still validate ESM by stripping module
          // keywords then using Function parse (never silent-pass broken JS).
          err = checkJavaScriptEsm(source);
        } else {
          err = checkJavaScript(source);
          if (
            err &&
            ts &&
            /import statement|Unexpected token|export /i.test(err.message)
          ) {
            err = checkWithTypescript(ts, source, file);
          }
        }
      }

      if (err) {
        const title = 'Syntax error';
        findings.push({
          id: findingId(CHECK_ID, rel, err.line, title),
          kind: 'syntax',
          severity: 'error',
          title,
          message: maskSecrets(err.message),
          filePath: rel,
          line: err.line,
          column: err.column,
          suggestion: 'Fix the syntax error before committing.',
          checkId: CHECK_ID,
        });
      }
    } catch (e) {
      const rel = path.relative(workspaceRoot, file).replace(/\\/g, '/');
      findings.push({
        id: findingId(CHECK_ID, rel, undefined, 'read-error'),
        kind: 'syntax',
        severity: 'error',
        title: 'Could not read file',
        message: maskSecrets(e instanceof Error ? e.message : String(e)),
        filePath: rel,
        suggestion: 'Ensure the file exists and is readable.',
        checkId: CHECK_ID,
      });
    }
  }

  const checked = targets.length - deferredTs;
  let summary: string;
  if (findings.length > 0) {
    summary = `${findings.length} syntax issue(s) in ${targets.length} file(s)`;
  } else if (checked === 0 && deferredTs > 0) {
    summary = `TS/JSX syntax deferred to TypeScript check (${deferredTs} file(s))`;
  } else if (deferredTs > 0) {
    summary = `Parsed ${checked} file(s); ${deferredTs} TS/JSX file(s) covered by TypeScript check`;
  } else {
    summary = `Parsed ${targets.length} file(s) — no syntax errors`;
  }

  return {
    id: CHECK_ID,
    name: 'Syntax',
    description: 'Parse JavaScript/TypeScript files for basic syntax errors',
    status: findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary,
    detail:
      deferredTs > 0 && !ts
        ? 'Install typescript locally for dedicated TS syntax parsing, or rely on the TypeScript check.'
        : undefined,
    durationMs: Date.now() - start,
  };
}

function cancelled(start: number): CheckResult {
  return {
    id: CHECK_ID,
    name: 'Syntax',
    description: 'Parse JavaScript/TypeScript files for basic syntax errors',
    status: 'CANCELLED',
    findings: [],
    summary: 'Cancelled',
    durationMs: Date.now() - start,
  };
}

interface SyntaxErrorInfo {
  message: string;
  line?: number;
  column?: number;
}

interface TsModule {
  createSourceFile: (
    fileName: string,
    sourceText: string,
    languageVersion: number,
    setParentNodes?: boolean,
    scriptKind?: number
  ) => {
    parseDiagnostics?: Array<{
      messageText: string | { messageText: string };
      start?: number;
      file?: { getLineAndCharacterOfPosition: (pos: number) => { line: number; character: number } };
      category?: number;
      code?: number;
    }>;
  };
  ScriptTarget: { Latest: number };
  ScriptKind: { TS: number; TSX: number; JS: number; JSX: number };
  DiagnosticCategory: { Error: number };
}

function loadWorkspaceTypescript(workspaceRoot: string): TsModule | undefined {
  const candidate = path.join(workspaceRoot, 'node_modules', 'typescript');
  const tryRequire = (id: string): TsModule | undefined => {
    try {
      // Dynamic load — not a static dependency graph edge.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      return require(id) as TsModule;
    } catch {
      return undefined;
    }
  };
  if (fileExists(candidate)) {
    const local = tryRequire(candidate);
    if (local) {
      return local;
    }
  }
  // Fall back to any resolvable typescript (e.g. extension/dev host)
  return tryRequire('typescript');
}

function checkWithTypescript(
  ts: TsModule,
  source: string,
  filePath: string
): SyntaxErrorInfo | undefined {
  const kind = /\.tsx$/i.test(filePath)
    ? ts.ScriptKind.TSX
    : /\.jsx$/i.test(filePath)
      ? ts.ScriptKind.JSX
      : /\.ts$/i.test(filePath)
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;

  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind
  );

  const diags = (sf.parseDiagnostics ?? []).filter(
    (d) => d.category === undefined || d.category === ts.DiagnosticCategory.Error
  );
  if (!diags.length) {
    return undefined;
  }
  const d = diags[0];
  const message =
    typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText;
  let line: number | undefined;
  let column: number | undefined;
  if (d.start != null && d.file) {
    const loc = d.file.getLineAndCharacterOfPosition(d.start);
    line = loc.line + 1;
    column = loc.character + 1;
  }
  return { message: `TS${d.code ?? ''}: ${message}`.replace(/^TS:/, 'TS'), line, column };
}

function checkJavaScript(source: string): SyntaxErrorInfo | undefined {
  try {
    // eslint-disable-next-line no-new-func
    new Function(source);
    return undefined;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /:(\d+)(?::(\d+))?/.exec(msg) || /\((\d+):(\d+)\)/.exec(msg);
    return {
      message: msg,
      line: m ? Number(m[1]) : undefined,
      column: m && m[2] ? Number(m[2]) : undefined,
    };
  }
}

/** Best-effort ESM parse without a TS package: strip import/export then Function-parse. */
function checkJavaScriptEsm(source: string): SyntaxErrorInfo | undefined {
  const stripped = source
    .replace(/^\s*import\s+[\s\S]*?;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+\{[^}]*\}\s*;?/gm, '')
    .replace(/^\s*export\s+type\s+[\s\S]*?;?\s*$/gm, '')
    .replace(/^\s*export\s+(async\s+)?(function\*?|class|const|let|var)\s+/gm, '$1$2 ');
  return checkJavaScript(stripped);
}
