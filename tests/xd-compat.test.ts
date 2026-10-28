import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import { parseXd } from '../src/parser/xd';
import { createProject, flatten } from '../src/core/model';
import { worldBounds } from '../src/core/geometry';
import { parseProject, serializeProject } from '../src/core/project';
import { renderAsset, renderBoard } from '../src/render/svg';
import { multiBoardXd } from './fixtures/multi-board';

const rect = (id: string, extra: object = {}) => ({
  type: 'shape',
  id,
  shape: { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
  style: { fill: { type: 'solid', color: { value: { r: 255, g: 0, b: 0 } } } },
  ...extra,
});
function archive(children: unknown[], resources: object = {}, metadata: object = {}) {
  return zipSync({
    'artwork/artboard-board/graphics/graphicContent.agc': strToU8(
      JSON.stringify({
        children: [{ type: 'artboard', id: 'board', artboard: { ref: 'board', children } }],
      })
    ),
    'resources/graphics/graphicContent.agc': strToU8(
      JSON.stringify({
        artboards: { board: { width: 100, height: 100, ...metadata } },
        resources,
      })
    ),
  });
}
async function pixel(svg: string, x: number, y: number) {
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
}

describe('XD coordinates and stored component instances', () => {
  it('separates saved state definitions from the 50,000 expanded scene-layer limit', () => {
    const doc = parseXd(
      archive([
        {
          type: 'group',
          id: 'library',
          group: { children: [rect('visible')] },
          meta: { ux: { states: Array.from({ length: 50000 }, (_, i) => rect(`state-${i}`)) } },
        },
      ])
    );
    expect(flatten(doc.artboards)).toHaveLength(3);
  });
  it('renders every offset artboard and resolves UID, Windows href, relative path and manifest images', async () => {
    const doc = parseXd(multiBoardXd());
    expect(doc.diagnostics.filter((d) => d.code === 'missing-image')).toEqual([]);
    expect(Object.keys(doc.assets)).toHaveLength(4);
    const colors = [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    ];
    for (const [i, board] of doc.artboards.entries()) {
      expect(board.bounds).toEqual({ x: 0, y: 0, width: 64, height: 64 });
      expect(board.viewportHeight).toBe(48);
      expect(worldBounds(board, `${board.id}-image`)).toEqual({
        x: 8,
        y: 8,
        width: 16,
        height: 16,
      });
      expect(await pixel(renderBoard(doc, board), 12, 12)).toEqual(colors[i]);
    }
  });
  it('normalizes pasteboard coordinates exactly once at the artboard boundary', async () => {
    const doc = parseXd(
      archive(
        [
          {
            type: 'group',
            id: 'parent',
            transform: { tx: 2030, ty: -480 },
            meta: { ux: { localTransform: { tx: 30, ty: 20 } } },
            group: { children: [rect('child', { transform: { tx: 5, ty: 7 } })] },
          },
          rect('fallback', { transform: { tx: 2010, ty: -490 } }),
        ],
        {},
        { x: 2000, y: -500 }
      )
    );
    const board = doc.artboards[0];
    expect(worldBounds(board, 'child')).toEqual({ x: 35, y: 27, width: 10, height: 10 });
    expect(worldBounds(board, 'fallback')).toEqual({ x: 10, y: 10, width: 10, height: 10 });
    expect(await pixel(renderBoard(doc, board), 36, 28)).toEqual([255, 0, 0, 255]);
  });

  it('resolves syncSourceGuid in UX symbols and preserves per-instance overrides', async () => {
    const doc = parseXd(
      archive(
        [
          {
            type: 'group',
            id: 'instance',
            transform: { tx: 20, ty: 30 },
            group: {
              children: [
                {
                  type: 'syncRef',
                  syncSourceGuid: 'source',
                  guid: 'copy',
                  shape: { width: 20 },
                  style: { opacity: 0.5 },
                },
                {
                  type: 'syncRef',
                  syncSourceGuid: 'source',
                  guid: 'copy-2',
                  transform: { tx: 30, ty: 5 },
                },
              ],
            },
          },
        ],
        {
          meta: {
            ux: {
              symbols: [
                {
                  type: 'group',
                  id: 'master',
                  group: { children: [rect('source', { transform: { tx: 5, ty: 5 } })] },
                },
              ],
            },
          },
        }
      )
    );
    const nodes = flatten(doc.artboards);
    expect(doc.diagnostics.filter((d) => d.code === 'component' || d.code === 'node-type')).toEqual(
      []
    );
    expect(nodes.find((n) => n.id === 'copy')).toMatchObject({
      kind: 'rect',
      bounds: { width: 20 },
      style: { opacity: 0.5 },
    });
    expect(worldBounds(doc.artboards[0], 'copy-2')).toMatchObject({ x: 50, y: 35 });
    expect(await pixel(renderBoard(doc, doc.artboards[0]), 51, 36)).toEqual([255, 0, 0, 255]);
    expect(parseProject(serializeProject(createProject(doc))).document).toEqual(doc);
  });

  it('finds sources inside compound shapes and guards cyclic references', () => {
    const doc = parseXd(
      archive(
        [
          { type: 'syncRef', syncSourceGuid: 'operand', guid: 'operand-copy' },
          { type: 'syncRef', syncSourceGuid: 'cycle', guid: 'bad-copy' },
        ],
        {
          meta: {
            ux: {
              symbols: [
                {
                  type: 'shape',
                  id: 'compound',
                  shape: { type: 'compound', path: 'M0 0H10V10Z', children: [rect('operand')] },
                },
                { type: 'syncRef', guid: 'cycle', syncSourceGuid: 'cycle' },
              ],
            },
          },
        }
      )
    );
    expect(doc.artboards[0].children[0].kind).toBe('rect');
    expect(doc.diagnostics.filter((d) => d.code === 'component')).toHaveLength(1);
  });

  it('uses the saved compound result without painting its subtracted operands', async () => {
    const doc = parseXd(
      archive([
        {
          ...rect('compound'),
          shape: {
            type: 'compound',
            operation: 'subtract',
            path: 'M0 0H20V20H0Z M5 5V15H15V5Z',
            children: [rect('operand')],
          },
        },
      ])
    );
    const n = doc.artboards[0].children[0];
    expect(await pixel(renderAsset(doc, n), 7, 7)).toEqual([0, 0, 0, 0]);
    expect(await pixel(renderAsset(doc, n), 2, 2)).toEqual([255, 0, 0, 255]);
  });

  it('reads gradient stops embedded in UX gradientResources', async () => {
    const doc = parseXd(
      archive([
        rect('gradient', {
          style: {
            fill: {
              type: 'gradient',
              gradient: {
                x1: 0,
                y1: 0,
                x2: 1,
                y2: 0,
                meta: {
                  ux: {
                    gradientResources: {
                      type: 'linear',
                      stops: [
                        { offset: 0, color: { value: { r: 255, g: 0, b: 0 } } },
                        { offset: 1, color: { value: { r: 0, g: 0, b: 255 } } },
                      ],
                    },
                  },
                },
              },
            },
          },
        }),
      ])
    );
    const n = doc.artboards[0].children[0];
    expect(n.style.fill).toMatchObject({
      type: 'linear',
      stops: [{ color: '#ff0000' }, { color: '#0000ff' }],
    });
    const left = await pixel(renderAsset(doc, n), 0, 5);
    expect(left[0]).toBeGreaterThan(220);
    expect(left[3]).toBe(255);
  });
});
