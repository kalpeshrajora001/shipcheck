import * as assert from 'assert';
import { describe, it } from 'node:test';
import {
  TECHNOLOGY_REGISTRY,
  registrySummary,
} from '../../capabilities/registry';

describe('capability registry', () => {
  it('has entries with required fields', () => {
    assert.ok(TECHNOLOGY_REGISTRY.length >= 10);
    for (const t of TECHNOLOGY_REGISTRY) {
      assert.ok(t.id && t.name && t.level && t.adapterId);
      assert.ok(Array.isArray(t.checks));
      assert.ok(Array.isArray(t.commands));
      assert.ok(Array.isArray(t.unsupported));
    }
  });

  it('does not mark DETECTION_ONLY with fake commands', () => {
    const bad = TECHNOLOGY_REGISTRY.filter(
      (t) => t.level === 'DETECTION_ONLY' && t.commands.length > 0
    );
    assert.deepStrictEqual(bad, []);
  });

  it('summary counts match', () => {
    const s = registrySummary();
    assert.strictEqual(
      s.total,
      s.full + s.partial + s.detectionOnly + s.notSupported
    );
  });
});
