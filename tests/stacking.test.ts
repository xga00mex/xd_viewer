import { it, expect } from 'vitest';
import sharp from 'sharp';
import { demoProject } from '../src/demo';
import { emptyStyle, type DesignNode } from '../src/core/model';
import { renderBoard } from '../src/render/svg';
import { createProject } from '../src/core/model';
import { exportWeb } from '../src/export/web';

function rect(id: string, color: string, width: number, height: number, fixed = false): DesignNode {
  return {
    id,
    sourceId: id,
    name: id,
    kind: 'rect',
    bounds: { x: 0, y: 0, width, height },
    transform: [1, 0, 0, 1, 0, 0],
    style: { ...emptyStyle(), fill: { type: 'solid', color } },
    visible: true,
    children: [],
    fixed,
  };
}
it('keeps product artwork above an authored fixed background and below a later fixed cart', async () => {
  const doc = demoProject().document,
    board = doc.artboards[0];
  board.bounds = { x: 0, y: 0, width: 100, height: 100 };
  const product = rect('product', '#ff0000', 30, 30),
    cart = rect('cart', '#ffffff', 30, 20, true);
  cart.transform[5] = 60;
  board.children = [rect('fixed-background', '#eeeeee', 100, 100, true), product, cart];
  const { data, info } = await sharp(Buffer.from(renderBoard(doc, board, { embedFonts: false })))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [
    ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
  ];
  expect(pixel(10, 10)).toEqual([255, 0, 0, 255]);
  expect(pixel(10, 70)).toEqual([255, 255, 255, 255]);
  expect(pixel(80, 80)).toEqual([238, 238, 238, 255]);
  const css = String(exportWeb(createProject(doc)).files['styles.css']);
  const backgroundRule = css.split('/* fixed-background */')[1].split('}')[0];
  expect(backgroundRule.includes('z-index')).toBe(false);
});
