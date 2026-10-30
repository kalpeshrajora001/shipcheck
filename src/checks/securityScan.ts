import * as fs from 'fs';
import * as path from 'path';
import { CheckResult, Finding } from '../types';
import { findingId, maskSecrets, maskValue } from '../utils/secrets';
import { isScannableSourceFile } from '../utils/process';

const CHECK_ID = 'security';

interface SecretPattern {
  id: string;
  title: string;
  regex: RegExp;
  suggestion: string;
}

const PATTERNS: SecretPattern[] = [
  {
    id: 'aws-key',
    title: 'Possible AWS Access Key ID',
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    suggestion: 'Remove the key from source; use environment variables or a secret manager.',
  },
  {
    id: 'aws-secret',
    title: 'Possible AWS secret access key assignment',
    regex:
      /(?:aws_secret_access_key|secretAccessKey|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*['"]([A-Za-z0-9/+=]{30,})['"]/gi,
    suggestion: 'Do not hardcode AWS secrets. Rotate if this value was real.',
  },
  {
    id: 'generic-api-key',
    title: 'Possible API key assignment',
    regex:
      /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]([A-Za-z0-9_-]{16,})['"]/gi,
    suggestion: 'Move API keys to environment variables or a secrets store.',
  },
  {
    id: 'password',
    title: 'Possible hardcoded password',
    regex:
      /(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{6,})['"]/gi,
    suggestion: 'Remove hardcoded passwords. Use secrets management.',
  },
  {
    id: 'token',
    title: 'Possible hardcoded token',
    regex:
      /(?:auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer[_-]?token|private[_-]?token)\s*[=:]\s*['"]([A-Za-z0-9_.-]{12,})['"]/gi,
    suggestion: 'Remove hardcoded tokens from source control.',
  },
  {
    id: 'jwt',
    title: 'Possible JWT token',
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    suggestion: 'JWTs should not be committed. Revoke if this token is valid.',
  },
  {
    id: 'private-key',
    title: 'Possible private key material',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    suggestion: 'Never commit private keys. Rotate the key immediately if it was exposed.',
  },
  {
    id: 'slack-token',
    title: 'Possible Slack token',
    regex: /\b(xox[baprs]-[0-9A-Za-z-]{10,})\b/g,
    suggestion: 'Revoke the Slack token and store it outside the repository.',
  },
  {
    id: 'github-pat',
    title: 'Possible GitHub personal access token',
    regex: /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    suggestion: 'Revoke the GitHub token and use a secret store.',
  },
  {
    id: 'stripe',
    title: 'Possible Stripe secret key',
    regex: /\b(sk_live_[A-Za-z0-9]{16,}|sk_test_[A-Za-z0-9]{16,})\b/g,
    suggestion: 'Rotate the Stripe key and keep it out of source.',
  },
  {
    id: 'generic-secret',
    title: 'Possible hardcoded secret',
    regex:
      /(?:client[_-]?secret|app[_-]?secret|secret[_-]?key)\s*[=:]\s*['"]([A-Za-z0-9_-]{12,})['"]/gi,
    suggestion: 'Remove hardcoded secrets from the codebase.',
  },
];

const FALSE_POSITIVE_HINTS =
  /example|sample|placeholder|your[_-]?api|xxx+|TODO|changeme|dummy|fake|test[_-]?key|process\.env/i;

function isTestFixturePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    /(^|\/)(test|tests|__tests__)(\/|$)/i.test(normalized) ||
    /\.(test|spec)\.(jsx?|tsx?|mjs|cjs)$/i.test(normalized)
  );
}

export async function runSecurityScan(
  workspaceRoot: string,
  files: string[],
  maxFileSizeKb: number,
  signal?: AbortSignal,
  options?: { skipTestFixtures?: boolean }
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: CHECK_ID,
    name: 'Security scan',
    description:
      'Local pattern scan for exposed API keys, passwords, tokens, and private keys',
  };

  const skipTests = options?.skipTestFixtures !== false;
  const scanTargets = files.filter((f) => {
    if (skipTests && isTestFixturePath(f)) {
      return false;
    }
    return isScannableSourceFile(f);
  });

  if (scanTargets.length === 0) {
    return {
      ...base,
      status: 'NOT_CHECKED',
      findings: [],
      summary: 'No eligible files to scan',
      durationMs: Date.now() - start,
    };
  }

  const findings: Finding[] = [];
  const maxBytes = maxFileSizeKb * 1024;

  for (const file of scanTargets) {
    if (signal?.aborted) {
      return {
        ...base,
        status: 'CANCELLED',
        findings: [],
        summary: 'Cancelled',
        durationMs: Date.now() - start,
      };
    }
    let content: string;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > maxBytes) {
        continue;
      }
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const rel = path.relative(workspaceRoot, file).replace(/\\/g, '/');
    const lines = content.split(/\r?\n/);

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        if (FALSE_POSITIVE_HINTS.test(line) && !/PRIVATE KEY|sk_live_|ghp_/.test(line)) {
          continue;
        }
        pattern.regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.regex.exec(line)) !== null) {
          const raw = m[1] ?? m[0];
          if (isLikelyFalsePositive(raw, line)) {
            continue;
          }
          const masked = maskValue(raw);
          const evidence = maskSecrets(line.trim()).slice(0, 200);
          findings.push({
            id: findingId(CHECK_ID, rel, lineIdx + 1, pattern.id + masked),
            kind: 'security',
            severity: 'error',
            title: pattern.title,
            message: `Evidence (masked): ${evidence}`,
            filePath: rel,
            line: lineIdx + 1,
            column: (m.index ?? 0) + 1,
            suggestion: pattern.suggestion,
            checkId: CHECK_ID,
          });
        }
      }
    }
  }

  return {
    ...base,
    status: findings.length ? 'FAILED' : 'PASSED',
    findings,
    summary:
      findings.length === 0
        ? `No obvious secrets in ${scanTargets.length} file(s)`
        : `${findings.length} potential secret(s) found (values masked)`,
    durationMs: Date.now() - start,
    detail:
      'Pattern-based scan only. Passing does not guarantee the absence of secrets or vulnerabilities.',
  };
}

function isLikelyFalsePositive(value: string, line: string): boolean {
  if (/process\.env|import\.meta\.env|os\.environ/i.test(line)) {
    return true;
  }
  if (/^\$\{/.test(value) || value.includes('${')) {
    return true;
  }
  // Repeated characters / placeholders
  if (/^(x+|your[_-].+|changeme|secret|password|token)$/i.test(value)) {
    return true;
  }
  return false;
}
