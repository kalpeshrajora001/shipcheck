import { CheckResult } from '../../types';
import {
  LanguageBucket,
  detectEcosystemHints,
  summarizeLanguages,
} from '../../detectors/languages';
import { runRegisteredAdapters } from '../../capabilities/adapters';

export interface EcosystemRunContext {
  workspaceRoot: string;
  buckets: LanguageBucket[];
  signal?: AbortSignal;
  onProgress: (message: string) => void;
}

/**
 * Run non-JS ecosystem adapters based on languages present in the change set.
 * Uses the modular adapter registry (no scattered hardcoded branches here).
 */
export async function runEcosystemChecks(
  ctx: EcosystemRunContext
): Promise<{ checks: CheckResult[]; languagesSummary: string; markers: string[] }> {
  const { workspaceRoot, buckets, signal, onProgress } = ctx;
  const hints = detectEcosystemHints(workspaceRoot);

  const checks = await runRegisteredAdapters({
    workspaceRoot,
    buckets,
    signal,
    onProgress,
  });

  return {
    checks,
    languagesSummary: summarizeLanguages(buckets),
    markers: hints.markers,
  };
}
