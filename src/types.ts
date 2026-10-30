/**
 * Shared domain types for ShipCheck verification.
 */

export type CheckStatus =
  | 'PASSED'
  | 'FAILED'
  | 'REVIEW_REQUIRED'
  | 'NOT_CHECKED'
  | 'SKIPPED'
  | 'UNAVAILABLE'
  | 'NOT_INSTALLED'
  | 'NOT_CONFIGURED'
  | 'NOT_SUPPORTED'
  | 'CANCELLED';

export type Severity = 'error' | 'warning' | 'info' | 'review';

export type FindingKind =
  | 'lint'
  | 'type'
  | 'format'
  | 'syntax'
  | 'test'
  | 'security'

  | 'risk_review';

export type FileChangeStatus =
  | 'modified'
  | 'staged'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'copied';

export interface ChangedFile {
  absolutePath: string;
  relativePath: string;
  status: FileChangeStatus;
  staged: boolean;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: Severity;
  /** Human-readable title */
  title: string;
  /** Short message / evidence (secrets already masked) */
  message: string;
  filePath?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  /** Suggested next action for the developer */
  suggestion?: string;
  /** True for risk-review items — not confirmed vulnerabilities */
  isReviewSuggestion?: boolean;
  checkId: string;
  dismissed?: boolean;
}

export interface CheckResult {
  id: string;
  name: string;
  description: string;
  status: CheckStatus;
  findings: Finding[];
  /** Brief summary for UI */
  summary: string;
  durationMs?: number;
  /** Why skipped / unavailable / not configured */
  detail?: string;
}

export interface VerificationReport {
  productName: string;
  createdAt: string;
  scope: 'changes' | 'workspace';
  workspaceRoot: string;
  changedFiles: ChangedFile[];
  checks: CheckResult[];
  findings: Finding[];
  /** Aggregate labels — never an arbitrary safety score */
  overallStatus: OverallStatus;
  cancelled: boolean;
}

export type OverallStatus =
  | 'PASSED'
  | 'FAILED'
  | 'REVIEW_REQUIRED'
  | 'NOT_CHECKED'
  | 'CANCELLED'
  | 'MIXED';

export interface ToolAvailability {
  eslint: ToolInfo;
  typescript: ToolInfo;
  prettier: ToolInfo;
  jest: ToolInfo;
  vitest: ToolInfo;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'none';
  packageJsonPath?: string;
}

export interface ToolInfo {
  available: boolean;
  configured: boolean;
  /** Local binary or npx command hint */
  command?: string;
  configPath?: string;
  detail?: string;
}

export interface ProgressReporter {
  report(message: string, increment?: number): void;
  isCancellationRequested(): boolean;
}

export function computeOverallStatus(checks: CheckResult[], cancelled: boolean): OverallStatus {
  if (cancelled) {
    return 'CANCELLED';
  }
  if (checks.length === 0) {
    return 'NOT_CHECKED';
  }
  const actionable = checks.filter(
    (c) =>
      c.status !== 'SKIPPED' &&
      c.status !== 'UNAVAILABLE' &&
      c.status !== 'NOT_INSTALLED' &&
      c.status !== 'NOT_CONFIGURED' &&
      c.status !== 'NOT_SUPPORTED' &&
      c.status !== 'NOT_CHECKED' &&
      c.status !== 'CANCELLED'
  );
  if (actionable.length === 0) {
    return 'NOT_CHECKED';
  }
  const hasFailed = actionable.some((c) => c.status === 'FAILED');
  const hasReview = actionable.some((c) => c.status === 'REVIEW_REQUIRED');
  const allPassed = actionable.every((c) => c.status === 'PASSED');
  if (hasFailed) {
    return 'FAILED';
  }
  if (hasReview) {
    return 'REVIEW_REQUIRED';
  }
  if (allPassed) {
    return 'PASSED';
  }
  return 'MIXED';
}

export function statusLabel(status: CheckStatus | OverallStatus): string {
  switch (status) {
    case 'PASSED':
      return 'PASSED';
    case 'FAILED':
      return 'FAILED';
    case 'REVIEW_REQUIRED':
      return 'REVIEW REQUIRED';
    case 'NOT_CHECKED':
      return 'NOT CHECKED';
    case 'SKIPPED':
      return 'SKIPPED';
    case 'UNAVAILABLE':
    case 'NOT_INSTALLED':
      return 'NOT INSTALLED';
    case 'NOT_CONFIGURED':
      return 'NOT CONFIGURED';
    case 'NOT_SUPPORTED':
      return 'NOT SUPPORTED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'MIXED':
      return 'MIXED';
    default:
      return String(status);
  }
}
