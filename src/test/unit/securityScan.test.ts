import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, before, after } from 'node:test';
import { runSecurityScan } from '../../checks/securityScan';

describe('runSecurityScan', () => {
  let dir: string;
  let dirty: string;
  let clean: string;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-'));
    dirty = path.join(dir, 'dirty.js');
    clean = path.join(dir, 'clean.js');
    // Assemble at runtime so the repo never contains a contiguous Stripe-like token.
    const sampleSecret = ['sk', 'live', 'abcdefghijklmnopqrstuvwxyz1234'].join('_');
    fs.writeFileSync(dirty, `const api_key = "${sampleSecret}";\n`, 'utf8');
    fs.writeFileSync(clean, 'const x = process.env.API_KEY;\n', 'utf8');
  });

  after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('flags hardcoded secrets and masks evidence', async () => {
    const result = await runSecurityScan(dir, [dirty], 512);
    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.findings.length >= 1);
    const msg = result.findings.map((f) => f.message).join(' ');
    assert.ok(!msg.includes('abcdefghijklmnopqrstuvwxyz1234'));
    assert.ok(msg.includes('••••') || /sk_l/.test(msg));
  });

  it('ignores process.env usages', async () => {
    const result = await runSecurityScan(dir, [clean], 512);
    assert.strictEqual(result.status, 'PASSED');
    assert.strictEqual(result.findings.length, 0);
  });
});
