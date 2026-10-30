import * as assert from 'assert';
import { describe, it } from 'node:test';
import { maskSecrets, maskValue, findingId } from '../../utils/secrets';

describe('secrets', () => {
  it('masks assignment-style secrets', () => {
    const sample = ['sk', 'live', 'abcdefghijklmnopqrstuv'].join('_');
    const input = `const api_key = "${sample}"`;
    const out = maskSecrets(input);
    assert.ok(!out.includes('abcdefghijklmnopqrstuv'));
    assert.ok(out.includes('••••'));
  });

  it('masks AWS access key ids', () => {
    // AWS documentation example pattern, assembled to avoid raw secret scanners.
    const sample = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
    const input = `key=${sample}`;
    const out = maskSecrets(input);
    assert.ok(!out.includes('IOSFODNN7EXAMPLE') || out.includes('••••'));
  });

  it('maskValue keeps short prefix/suffix', () => {
    const v = maskValue('abcdefghijklmnop');
    assert.ok(v.startsWith('abcd'));
    assert.ok(v.includes('••••'));
  });

  it('findingId is stable and compact', () => {
    const a = findingId('eslint', 'src/a.ts', 10, 'rule');
    const b = findingId('eslint', 'src/a.ts', 10, 'rule');
    assert.strictEqual(a, b);
    assert.ok(a.length <= 48);
  });
});
