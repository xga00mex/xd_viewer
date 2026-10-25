import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
const { assetPath, trustedRenderer, safeSaveName, validateWorkspace } = createRequire(
  import.meta.url
)('../desktop-dist/security.cjs') as typeof import('../desktop/security.cjs');

describe('desktop trust boundaries', () => {
  it('permits only the main bundled UI as an IPC caller', () => {
    expect(trustedRenderer('xd-local://app/index.html')).toBe(true);
    for (const url of [
      'https://example.com',
      'file:///index.html',
      'about:srcdoc',
      'xd-local://app/index.html#untrusted',
      'xd-local://other/index.html',
    ])
      expect(trustedRenderer(url)).toBe(false);
  });
  it('resolves assets only within the bundle', () => {
    const root = path.resolve('dist');
    expect(assetPath(root, 'xd-local://app/assets/main.js')).toBe(
      path.join(root, 'assets/main.js')
    );
    for (const url of [
      'https://example.com/assets.js',
      'xd-local://other/index.html',
      'xd-local://app/..%5csecrets',
      'xd-local://app/%00',
      'xd-local://app/%',
    ])
      expect(assetPath(root, url)).toBeUndefined();
  });
  it('bounds workspace saves and sanitizes default filenames', () => {
    expect(safeSaveName('../abc:bad.html')).toBe('..-abc-bad.html');
    expect(() => validateWorkspace('{"format":"xd-local-project","version":1}')).not.toThrow();
    expect(() => validateWorkspace('{"format":"other"}')).toThrow();
    expect(() => validateWorkspace(12)).toThrow();
  });
});
