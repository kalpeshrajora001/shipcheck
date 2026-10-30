import * as fs from 'node:fs';
import * as path from 'node:path';

export function validateManifest(root, pkg) {
  const errors = [];
  if (pkg.main !== './out/extension.js') {
    errors.push(`main must be ./out/extension.js (got ${pkg.main})`);
  }
  if (!fs.existsSync(path.join(root, 'out', 'extension.js'))) {
    errors.push('out/extension.js missing after compile');
  }
  if (!pkg.engines?.vscode) errors.push('engines.vscode missing');
  if (!pkg.contributes?.commands?.length) errors.push('no commands contributed');
  if (!pkg.contributes?.viewsContainers?.activitybar?.length) {
    errors.push('activity bar container missing');
  }
  const requiredCmds = [
    'shipcheck.checkMyChanges',
    'shipcheck.scanWorkspace',
    'shipcheck.cancelScan',
    'shipcheck.rerunChecks',
    'shipcheck.exportReport',
    'shipcheck.openFinding',
    'shipcheck.dismissFinding',
    'shipcheck.showPanel',
  ];
  const have = new Set((pkg.contributes.commands || []).map((c) => c.command));
  for (const c of requiredCmds) {
    if (!have.has(c)) errors.push(`missing command ${c}`);
  }
  const icon = path.join(root, 'media', 'activity-bar.svg');
  if (!fs.existsSync(icon)) errors.push('media/activity-bar.svg missing');
  if (!fs.existsSync(path.join(root, 'LICENSE'))) errors.push('LICENSE missing');
  if (!fs.existsSync(path.join(root, 'README.md'))) errors.push('README.md missing');
  if (!fs.existsSync(path.join(root, 'CHANGELOG.md'))) errors.push('CHANGELOG.md missing');

  // Activation: onStartupFinished is valid; also ensure extension.ts exports activate
  const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  if (!/export function activate/.test(ext)) errors.push('activate() not exported');
  if (!/export function deactivate/.test(ext)) errors.push('deactivate() not exported');

  // Command registration coverage
  for (const c of requiredCmds) {
    const short = c.replace(/^shipcheck\./, '');
    if (!ext.includes(`cmd('${short}')`) && !ext.includes(`"${c}"`)) {
      // refreshFiles may be in changedFilesTree
      if (short === 'refreshFiles') continue;
      const elsewhere = fs
        .readdirSync(path.join(root, 'src'), { recursive: true })
        .filter((f) => String(f).endsWith('.ts'))
        .some((f) =>
          fs
            .readFileSync(path.join(root, 'src', f), 'utf8')
            .includes(`cmd('${short}')`)
        );
      if (!elsewhere && short !== 'refreshFiles') {
        errors.push(`command ${c} not registered in source`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    detail: errors.length === 0 ? `${have.size} commands; views+activation OK` : '',
  };
}
