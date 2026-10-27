import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import { parseXd } from '../src/parser/xd';
import { renderBoard } from '../src/render/svg';

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
