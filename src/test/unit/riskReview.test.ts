import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, before, after } from 'node:test';
import { runRiskReview } from '../../checks/riskReview';

describe('runRiskReview', () => {
  let dir: string;
  let file: string;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-risk-'));
    file = path.join(dir, 'auth.ts');
    fs.writeFileSync(
      file,
      'export function login() { return authenticate(user); }\n',
      'utf8'
    );
  });

  after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('emits review suggestions, not confirmed vulns', async () => {
    const result = await runRiskReview(dir, [file], 512);
    assert.strictEqual(result.status, 'REVIEW_REQUIRED');
    assert.ok(result.findings.length >= 1);
    assert.ok(result.findings.every((f) => f.isReviewSuggestion === true));
    assert.ok(
      result.findings.every((f) =>
        /not a confirmed vulnerability/i.test(f.message)
      )
    );
  });
});
