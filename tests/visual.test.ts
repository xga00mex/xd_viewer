import { it, expect } from 'vitest';
import sharp from 'sharp';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { parseXd } from '../src/parser/design';
import { renderBoard } from '../src/render/svg';
import { demoProject } from '../src/demo';

it('rasterizes the full real XD and demo without malformed SVG', async () => {
  const bytes = new Uint8Array(readFileSync('tests/fixtures/xd2svg/single.xd'));
  const doc = parseXd(bytes),
    demo = demoProject().document;
  for (const [name, document] of [
    ['real', doc],
    ['demo', demo],
  ] as const) {
    const svg = renderBoard(document, document.artboards[0]);
    const png = await sharp(Buffer.from(svg)).resize({ width: 960 }).png().toBuffer();
    expect(png.byteLength).toBeGreaterThan(10000);
    if (process.env.VISUAL_QA) {
      mkdirSync('.cache/visual', { recursive: true });
      writeFileSync(`.cache/visual/${name}.png`, png);
      writeFileSync(`.cache/visual/${name}.svg`, svg);
    }
  }
  if (process.env.VISUAL_QA) {
    const entries = unzipSync(bytes);
    if (entries['preview.png'])
      writeFileSync('.cache/visual/original-preview.png', entries['preview.png']);
  }
});
