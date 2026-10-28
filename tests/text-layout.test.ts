import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import { parseXd } from '../src/parser/xd';
import { renderBoard } from '../src/render/svg';
import { renderAsset } from '../src/render/svg';

function textDocument(fragmented: boolean) {
  const firstLine = fragmented
    ? [
        { from: 0, to: 2, x: 10, y: 35 },
        { from: 2, to: 5, y: 35 },
        { from: 5, to: 7, y: 35 },
      ]
    : [{ from: 0, to: 7, x: 10, y: 35 }];
  return parseXd(
    zipSync({
      'artwork/artboard-b/graphics/graphicContent.agc': strToU8(
        JSON.stringify({
          artboards: { b: { width: 200, height: 110 } },
          children: [
            {
              type: 'artboard',
              id: 'b',
              artboard: {
                ref: 'b',
                children: [
                  {
                    type: 'text',
                    id: 'freight',
                    style: {
                      fill: { type: 'solid', color: { value: { r: 0, g: 0, b: 0 } } },
                      font: { family: 'Arial', size: 20 },
                    },
                    meta: {
                      ux: {
                        rangedStyles: [
                          { length: 2, fontFamily: 'Arial', fontSize: 20 },
                          { length: 3, fontFamily: 'Arial', fontSize: 32, fontStyle: 'Bold' },
                          { length: 5, fontFamily: 'Arial', fontSize: 20 },
                        ],
                      },
                    },
                    text: {
                      rawText: 'AB100CD\nEF',
                      frame: { type: 'positioned' },
                      paragraphs: [{ lines: [firstLine, [{ from: 8, to: 10, x: 10, y: 80 }]] }],
                    },
                  },
                ],
              },
            },
          ],
        })
      ),
    })
  );
}

describe('positioned mixed-style text', () => {
  it('preserves every character when XD style lengths are stale after an edit', () => {
    const doc = textDocument(false),
      node = doc.artboards[0].children[0];
    node.text!.value = '加入購物車 $1,280';
    node.text!.lines = [{ from: 0, to: 12, x: 0, y: 30 }];
    node.text!.runs = [{ ...node.text!.runs[0], from: 0, to: 4 }];
    const svg = renderAsset(doc, node);
    const content = svg.match(/<text\b[^>]*>([\s\S]*?)<\/text>/)![1].replace(/<[^>]*>/g, '');
    expect(content).toBe(node.text!.value);
  });
  it('continues fragments without x instead of restarting them at the left edge', async () => {
    const fragmented = textDocument(true),
      control = textDocument(false);
    const rasterize = (doc: typeof control) =>
      sharp(Buffer.from(renderBoard(doc, doc.artboards[0])))
        .raw()
        .toBuffer();
    expect((await rasterize(fragmented)).equals(await rasterize(control))).toBe(true);
    expect(fragmented.artboards[0].children[0].text?.lines).toEqual([
      { from: 0, to: 7, x: 10, y: 35 },
      { from: 8, to: 10, x: 10, y: 80 },
    ]);
  });
});
