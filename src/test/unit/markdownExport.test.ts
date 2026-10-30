import * as assert from 'assert';
import { describe, it } from 'node:test';
import { buildMarkdownReport } from '../../report/markdownExport';
import { VerificationReport } from '../../types';

describe('buildMarkdownReport', () => {
  it('includes statuses and disclaimer without a safety score', () => {
    const report: VerificationReport = {
      productName: 'ShipCheck',
      createdAt: '2026-01-01T00:00:00.000Z',
      scope: 'changes',
      workspaceRoot: '/tmp/proj',
      changedFiles: [
        {
          absolutePath: '/tmp/proj/a.ts',
          relativePath: 'a.ts',
          status: 'modified',
          staged: false,
        },
      ],
      checks: [
        {
          id: 'eslint',
          name: 'ESLint',
          description: 'lint',
          status: 'PASSED',
          findings: [],
          summary: 'ok',
          durationMs: 12,
        },
      ],
      findings: [],
      overallStatus: 'PASSED',
      cancelled: false,
    };
    const md = buildMarkdownReport(report);
    assert.ok(md.includes('# ShipCheck Verification Report'));
    assert.ok(md.includes('PASSED'));
    assert.ok(md.includes('does **not** provide a safety score'));
    assert.ok(!/safety score:\s*\d/i.test(md));
  });
});
