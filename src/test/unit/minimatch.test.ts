import * as assert from 'assert';
import { describe, it } from 'node:test';
import { minimatch } from '../../utils/minimatch';

describe('minimatch', () => {
  it('matches ** globs', () => {
    assert.ok(minimatch('node_modules/foo/index.js', '**/node_modules/**'));
    assert.ok(minimatch('src/a.ts', '**/*.ts'));
    assert.ok(!minimatch('src/a.js', '**/*.ts'));
  });

  it('matches simple stars', () => {
    assert.ok(minimatch('file.min.js', '*.min.js'));
    assert.ok(!minimatch('dir/file.min.js', '*.min.js'));
  });
});
