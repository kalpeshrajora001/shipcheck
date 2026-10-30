import * as path from 'path';
import { Finding, FindingKind, Severity } from '../../types';
import { findingId, maskSecrets } from '../../utils/secrets';

/** Generic `file:line:col: message` / `file(line,col): message` parsers. */
export function findingsFromLines(
  checkId: string,
  kind: FindingKind,
  severity: Severity,
  workspaceRoot: string,
  output: string,
  titlePrefix: string,
  suggestion: string
): Finding[] {
  const findings: Finding[] = [];
  const patterns = [
    /(?:^|\n)(.+?):(\d+)(?::(\d+))?:\s*(.+)/g,
    /(?:^|\n)(.+?)\((\d+),(\d+)\):\s*(.+)/g,
  ];
  const seen = new Set<string>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      let filePath = m[1].trim().replace(/^"|"$/g, '');
      if (path.isAbsolute(filePath)) {
        filePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
      } else {
        filePath = filePath.replace(/\\/g, '/');
      }
      if (!filePath || filePath.startsWith('http')) {
        continue;
      }
      const line = Number(m[2]);
      const column = m[3] ? Number(m[3]) : undefined;
      const message = maskSecrets(m[4].trim());
      const key = `${filePath}:${line}:${message}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const title = `${titlePrefix}`;
      findings.push({
        id: findingId(checkId, filePath, line, title + message),
        kind,
        severity,
        title,
        message,
        filePath,
        line,
        column,
        suggestion,
        checkId,
      });
    }
  }
  return findings;
}

export function notConfigured(
  id: string,
  name: string,
  description: string,
  detail: string
) {
  return {
    id,
    name,
    description,
    status: 'NOT_CONFIGURED' as const,
    findings: [],
    summary: detail,
    detail,
  };
}

export function skipped(
  id: string,
  name: string,
  description: string,
  reason: string
) {
  return {
    id,
    name,
    description,
    status: 'SKIPPED' as const,
    findings: [],
    summary: reason,
  };
}

export function unavailable(
  id: string,
  name: string,
  description: string,
  detail: string
) {
  return {
    id,
    name,
    description,
    status: 'NOT_INSTALLED' as const,
    findings: [],
    summary: detail,
    detail,
  };
}

export function notSupported(
  id: string,
  name: string,
  description: string,
  detail: string
) {
  return {
    id,
    name,
    description,
    status: 'NOT_SUPPORTED' as const,
    findings: [],
    summary: detail,
    detail,
  };
}
