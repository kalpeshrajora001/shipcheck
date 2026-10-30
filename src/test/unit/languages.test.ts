import * as assert from 'assert';
import { describe, it } from 'node:test';
import {
  bucketChangedFiles,
  languageOf,
  summarizeLanguages,
} from '../../detectors/languages';

describe('languages', () => {
  it('maps extensions across ecosystems', () => {
    assert.strictEqual(languageOf('app/models/user.py'), 'python');
    assert.strictEqual(languageOf('cmd/server/main.go'), 'go');
    assert.strictEqual(languageOf('wp-content/themes/x/functions.php'), 'php');
    assert.strictEqual(languageOf('src/Main.java'), 'java');
    assert.strictEqual(languageOf('src/lib.rs'), 'rust');
    assert.strictEqual(languageOf('app/models/user.rb'), 'ruby');
    assert.strictEqual(languageOf('Services/UserService.cs'), 'csharp');
    assert.strictEqual(languageOf('deploy.sh'), 'shell');
    assert.strictEqual(languageOf('templates/page.twig'), 'web');
    assert.strictEqual(languageOf('config/services.yaml'), 'config');
    assert.strictEqual(languageOf('src/app.ts'), 'typescript');
  });

  it('buckets existing changed files', () => {
    const buckets = bucketChangedFiles(
      [
        {
          absolutePath: '/tmp/a.py',
          relativePath: 'a.py',
          status: 'modified',
          staged: false,
        },
        {
          absolutePath: '/tmp/missing.go',
          relativePath: 'missing.go',
          status: 'modified',
          staged: false,
        },
      ],
      false
    );
    assert.ok(buckets.some((b) => b.id === 'python'));
    assert.ok(buckets.some((b) => b.id === 'go'));
    assert.ok(summarizeLanguages(buckets).includes('Python'));
  });
});
