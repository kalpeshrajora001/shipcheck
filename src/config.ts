import * as vscode from 'vscode';

/**
 * Central configuration. Product name is configurable for easy rebranding
 * via `shipcheck.productName` setting (and COMMAND_PREFIX / VIEW_PREFIX constants).
 */
export const EXTENSION_ID = 'shipcheck';
export const COMMAND_PREFIX = 'shipcheck';
export const VIEW_PREFIX = 'shipcheck';
export const CONFIG_SECTION = 'shipcheck';

/** Default display name — override with shipcheck.productName */
export const DEFAULT_PRODUCT_NAME = 'ShipCheck';

export type ScanScope = 'changes' | 'workspace';

export interface ShipCheckSettings {
  productName: string;
  confirmScriptExecution: boolean;
  runTests: boolean;
  runSecurityScan: boolean;
  runRiskReview: boolean;
  includeUntracked: boolean;
  maxFileSizeKb: number;
  excludeGlobs: string[];
  skipTestFixturesInSecurityScan: boolean;
  showWelcomeOnStartup: boolean;
  dismissedFindings: string[];
}

export function getProductName(): string {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const name = cfg.get<string>('productName', DEFAULT_PRODUCT_NAME)?.trim();
  return name || DEFAULT_PRODUCT_NAME;
}

export function getSettings(): ShipCheckSettings {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    productName: getProductName(),
    confirmScriptExecution: cfg.get<boolean>('confirmScriptExecution', true),
    runTests: cfg.get<boolean>('runTests', true),
    runSecurityScan: cfg.get<boolean>('runSecurityScan', true),
    runRiskReview: cfg.get<boolean>('runRiskReview', true),
    includeUntracked: cfg.get<boolean>('includeUntracked', true),
    maxFileSizeKb: cfg.get<number>('maxFileSizeKb', 512),
    excludeGlobs: cfg.get<string[]>('excludeGlobs', [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/*.map',
      '**/reports/**',
    ]),
    skipTestFixturesInSecurityScan: cfg.get<boolean>(
      'skipTestFixturesInSecurityScan',
      true
    ),
    showWelcomeOnStartup: cfg.get<boolean>('showWelcomeOnStartup', true),
    dismissedFindings: cfg.get<string[]>('dismissedFindings', []),
  };
}

export async function addDismissedFinding(id: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const current = cfg.get<string[]>('dismissedFindings', []);
  if (!current.includes(id)) {
    await cfg.update(
      'dismissedFindings',
      [...current, id],
      vscode.ConfigurationTarget.Workspace
    );
  }
}

export async function clearDismissedFindings(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await cfg.update('dismissedFindings', [], vscode.ConfigurationTarget.Workspace);
}

export function cmd(name: string): string {
  return `${COMMAND_PREFIX}.${name}`;
}
