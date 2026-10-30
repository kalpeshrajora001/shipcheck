import { CheckResult } from '../types';
import { LanguageBucket } from '../detectors/languages';
import { TechnologyCapability } from './registry';

/**
 * Modular technology adapter contract.
 * Adapters must never claim PASSED when the tool is missing.
 */
export interface TechnologyAdapterContext {
  workspaceRoot: string;
  buckets: LanguageBucket[];
  files: string[];
  signal?: AbortSignal;
}

export interface TechnologyAdapter {
  /** Matches TechnologyCapability.adapterId */
  id: string;
  capabilities: string[];
  detectRelevant(ctx: TechnologyAdapterContext): boolean;
  run(ctx: TechnologyAdapterContext): Promise<CheckResult[]>;
}

export function emptyScopeResult(
  capability: TechnologyCapability,
  reason: string
): CheckResult {
  return {
    id: `${capability.id}-scope`,
    name: capability.name,
    description: capability.checks.join(', '),
    status: 'NOT_CHECKED',
    findings: [],
    summary: reason,
    detail: `Registry level: ${capability.level}`,
  };
}
