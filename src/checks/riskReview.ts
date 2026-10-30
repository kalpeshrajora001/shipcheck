import * as fs from 'fs';
import * as path from 'path';
import { CheckResult, Finding } from '../types';
import { findingId, maskSecrets } from '../utils/secrets';
import { isScannableSourceFile } from '../utils/process';

const CHECK_ID = 'risk_review';

interface RiskRule {
  id: string;
  category: string;
  title: string;
  regex: RegExp;
  suggestion: string;
}

/**
 * Heuristic review suggestions — clearly labeled as NOT confirmed vulnerabilities.
 */
const RULES: RiskRule[] = [
  {
    id: 'auth',
    category: 'Authentication',
    title: 'Authentication-related change',
    regex:
      /\b(authenticate|authentication|login|logout|signIn|signOut|passport|oauth|openid|jwt\.sign|bcrypt|argon2|session\.login|wp_signon|Auth::|Devise|django\.contrib\.auth|HttpSecurity)\b/i,
    suggestion:
      'Manually review authentication flows, session handling, and credential storage.',
  },
  {
    id: 'authz',
    category: 'Authorization',
    title: 'Authorization-related change',
    regex:
      /\b(authorize|authorization|rbac|acl|permission|isAdmin|requireRole|canAccess|guards?|middleware.*auth)\b/i,
    suggestion:
      'Confirm authorization checks cover every sensitive path and cannot be bypassed.',
  },
  {
    id: 'payments',
    category: 'Payments',
    title: 'Payment-related change',
    regex:
      /\b(stripe|paypal|braintree|payment|checkout|billing|chargeCard|invoice|subscription)\b/i,
    suggestion:
      'Review amount calculation, idempotency, webhook verification, and PCI scope carefully.',
  },
  {
    id: 'database',
    category: 'Database',
    title: 'Database-related change',
    regex:
      /\b(mongoose|sequelize|prisma|knex|typeorm|mongodb|sql\b|queryRaw|migrate|DROP TABLE|ALTER TABLE|INSERT INTO|UPDATE\s+\w+\s+SET|ActiveRecord|Eloquent|SQLAlchemy|gorm\.|EntityManager|wpdb)\b/i,
    suggestion:
      'Review migrations, query parameterization, and data integrity implications.',
  },
  {
    id: 'config',
    category: 'Configuration',
    title: 'Configuration / environment change',
    regex:
      /\b(process\.env|dotenv|config\(|featureFlag|FEATURE_|NODE_ENV|CORS|helmet)\b/i,
    suggestion:
      'Verify configuration defaults are safe for production and secrets stay out of source.',
  },
  {
    id: 'validation',
    category: 'Validation',
    title: 'Input validation-related change',
    regex:
      /\b(zod|joi|yup|class-validator|sanitize|escapeHtml|validate\(|validator\.|req\.body|req\.query|req\.params)\b/i,
    suggestion:
      'Ensure all untrusted inputs are validated and rejected safely on failure.',
  },
  {
    id: 'errors',
    category: 'Error handling',
    title: 'Error handling-related change',
    regex:
      /\b(catch\s*\(|\.catch\(|try\s*\{|throw new|errorHandler|unhandledRejection|process\.on\(['"]uncaught)/i,
    suggestion:
      'Avoid leaking internals in error responses; ensure failures fail closed where needed.',
  },
];

export async function runRiskReview(
  workspaceRoot: string,
  files: string[],
  maxFileSizeKb: number,
  signal?: AbortSignal
): Promise<CheckResult> {
  const start = Date.now();
  const base = {
    id: CHECK_ID,
    name: 'Risk review',
    description:
      'Heuristic review suggestions for auth, payments, DB, config, validation, and errors',
  };

  const targets = files.filter(isScannableSourceFile);
  if (targets.length === 0) {
    return {
      ...base,
      status: 'NOT_CHECKED',
      findings: [],
      summary: 'No JS/TS files to review',
      durationMs: Date.now() - start,
    };
  }

  const findings: Finding[] = [];
  const maxBytes = maxFileSizeKb * 1024;
  const seen = new Set<string>();

  for (const file of targets) {
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

    for (const rule of RULES) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        rule.regex.lastIndex = 0;
        if (!rule.regex.test(line)) {
          continue;
        }
        // One finding per file+category to reduce noise
        const key = `${rel}|${rule.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const title = `[Review suggestion] ${rule.category}: ${rule.title}`;
        findings.push({
          id: findingId(CHECK_ID, rel, i + 1, rule.id),
          kind: 'risk_review',
          severity: 'review',
          title,
          message: maskSecrets(
            `Matched pattern near: ${line.trim().slice(0, 160)}. This is a review suggestion, not a confirmed vulnerability.`
          ),
          filePath: rel,
          line: i + 1,
          suggestion: rule.suggestion,
          isReviewSuggestion: true,
          checkId: CHECK_ID,
        });
      }
    }
  }

  return {
    ...base,
    status: findings.length ? 'REVIEW_REQUIRED' : 'PASSED',
    findings,
    summary:
      findings.length === 0
        ? 'No high-risk review areas flagged'
        : `${findings.length} review suggestion(s) — not confirmed vulnerabilities`,
    detail:
      'These are heuristic review suggestions only. They are not confirmed security vulnerabilities.',
    durationMs: Date.now() - start,
  };
}
