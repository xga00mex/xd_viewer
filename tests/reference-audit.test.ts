import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { strToU8, zipSync } from 'fflate';

it('audits generated artifacts without exposing reference text and still detects embedded images', () => {
  const folder = mkdtempSync(join(tmpdir(), 'xv-audit-'));
  try {
    const reference = join(folder, 'synthetic.xd');
    const artifact = join(folder, 'generated.html');
    const rawText = 'Synthetic confidential ' + randomUUID();
    const id = randomUUID();
    const image = randomBytes(256);
    writeFileSync(
      reference,
      zipSync({
        'artwork/content.agc': strToU8(JSON.stringify({ text: { rawText }, id })),
        'resources/example.png': image,
      })
    );
    const run = () =>
      spawnSync(process.execPath, ['scripts/audit-reference.mjs', artifact], {
        encoding: 'utf8',
        env: { ...process.env, XD_TEST_FILE: reference },
      });
    writeFileSync(
      artifact,
      '<p>Original demonstration</p><style>src:url(data:font/woff2;base64,' +
        randomBytes(1024).toString('base64') +
        ')</style>'
    );
    const clean = run();
    expect(clean.status, clean.stderr).toBe(0);
    expect(JSON.parse(clean.stdout).findings).toEqual([]);
    writeFileSync(
      artifact,
      `<p id="${id}">${rawText}</p><img src="data:image/png;base64,${image.toString('base64')}">`
    );
    const contaminated = run();
    expect(contaminated.status).toBe(1);
    expect(contaminated.stdout).not.toContain(rawText);
    expect(JSON.parse(contaminated.stdout).findings).toEqual([
      expect.objectContaining({ textMatches: 1, identifierMatches: 1, imageMatch: true }),
    ]);
  } finally {
    if (!resolve(folder).startsWith(resolve(tmpdir()) + sep + 'xv-audit-'))
      throw new Error('Unexpected audit temporary directory');
    rmSync(folder, { recursive: true, force: true });
  }
});
