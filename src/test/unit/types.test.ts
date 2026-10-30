import * as assert from 'assert';
import { describe, it } from 'node:test';
import { CheckResult, computeOverallStatus, statusLabel } from '../../types';

function check(status: CheckResult['status']): CheckResult {
  return {
    id: 'x',
    name: 'X',
    description: '',
    status,
    findings: [],
    summary: '',
  };
}

describe('computeOverallStatus', () => {
  it('returns CANCELLED when cancelled', () => {
    assert.strictEqual(computeOverallStatus([check('PASSED')], true), 'CANCELLED');
  });

  it('returns FAILED when any actionable check failed', () => {
    assert.strictEqual(
      computeOverallStatus([check('PASSED'), check('FAILED')], false),
      'FAILED'
    );
  });

  it('returns REVIEW_REQUIRED when review needed and no failures', () => {
    assert.strictEqual(
      computeOverallStatus([check('PASSED'), check('REVIEW_REQUIRED')], false),
      'REVIEW_REQUIRED'
    );
  });

  it('returns PASSED when all actionable passed', () => {
    assert.strictEqual(
      computeOverallStatus([check('PASSED'), check('SKIPPED')], false),
      'PASSED'
    );
  });

  it('returns NOT_CHECKED when only skipped/unavailable', () => {
    assert.strictEqual(
      computeOverallStatus([check('SKIPPED'), check('NOT_CONFIGURED')], false),
      'NOT_CHECKED'
    );
  });
});

describe('statusLabel', () => {
  it('formats REVIEW_REQUIRED', () => {
    assert.strictEqual(statusLabel('REVIEW_REQUIRED'), 'REVIEW REQUIRED');
  });
});
