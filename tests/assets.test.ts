import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
import { demoProject } from '../src/demo';
import { exportAssets } from '../src/export/assets';
import { renderAsset } from '../src/render/svg';
import type { DesignNode } from '../src/core/model';
import { emptyStyle } from '../src/core/model';

function mergeFixture() {
  const rect = (id: string, color: string): DesignNode => ({
    id,
    sourceId: id,
    name: id,
    kind: 'rect',
    visible: true,
    children: [],
    bounds: { x: 0, y: 0, width: 20, height: 20 },
    transform: [1, 0, 0, 1, 0, 0],
    style: { ...emptyStyle(), fill: { type: 'solid', color } },
  });
  const p = demoProject(),
    board = p.document.artboards[0];
  const red = rect('merge-red', '#ff0000'),
    blue = rect('merge-blue', '#0000ff');
  const unrelated = rect('merge-unrelated', '#00ff00');
  unrelated.transform[4] = 1000;
  const group: DesignNode = {
    ...rect('merge-parent', '#ffffff'),
    kind: 'group',
    style: { ...emptyStyle(), opacity: 0.5 },
    transform: [1, 0, 0, 1, 20, 10],
    bounds: { x: 0, y: 0, width: 1020, height: 20 },
    children: [red, unrelated],
  };
  blue.bounds.width = 10;
  blue.transform = [0, 1, -1, 0, 50, 20];
  board.children = [group, blue];
  return { doc: p.document, board, red, blue, group, rect };
}

describe('asset batches and visual extents', () => {
  it('merges selected layers into one SVG with world positions, stacking, rotation and ancestor opacity', async () => {
    const { doc, red, blue } = mergeFixture();
    const source = JSON.stringify(doc);
    const result = await exportAssets(doc, [blue, red], {
      format: 'svg',
      scale: 1,
      removeRadius: false,
      merge: true,
    });
    expect(result.mime).toBe('image/svg+xml');
    expect(result.name).toMatch(/\.svg$/);
    const svg = strFromU8(result.bytes);
    const { data, info } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([30, 20]);
    const pixel = (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
    ];
    expect(pixel(5, 5)).toEqual([255, 0, 0, 128]);
    expect(pixel(15, 15)).toEqual([0, 0, 255, 255]);
    expect(pixel(25, 5)[3]).toBe(0);
    expect(JSON.stringify(doc)).toBe(source);
  });

  it('retains an ancestor mask and avoids exporting a selected descendant twice', async () => {
    const { doc, red, blue, group, rect } = mergeFixture();
    group.clip = rect('merge-mask', '#000000');
    group.clip.bounds = { x: 0, y: 0, width: 10, height: 10 };
    const result = await exportAssets(doc, [red, blue], {
      format: 'svg',
      scale: 1,
      removeRadius: false,
      merge: true,
    });
    const { data, info } = await sharp(Buffer.from(result.bytes))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[(5 * info.width + 15) * 4 + 3]).toBe(0);
    const parent = await exportAssets(doc, [group, red], {
      format: 'svg',
      scale: 1,
      removeRadius: false,
      merge: true,
    });
    const svg = strFromU8(parent.bytes);
    expect(svg.match(/fill="#ff0000"/g)).toHaveLength(1);
  });

  it('composites selected siblings through a translucent group once', async () => {
    const { doc, board, red, blue, group } = mergeFixture();
    blue.transform = [1, 0, 0, 1, 10, 0];
    group.children = [red, blue];
    board.children = [group];
    const result = await exportAssets(doc, [red, blue], {
      format: 'svg',
      scale: 1,
      removeRadius: false,
      merge: true,
    });
    const { data, info } = await sharp(Buffer.from(result.bytes))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const overlap = (5 * info.width + 15) * 4;
    expect([...data.subarray(overlap, overlap + 4)]).toEqual([0, 0, 255, 128]);
  });
  it('exports duplicate layer names without collision and keeps vector masks square', async () => {
    const p = demoProject(),
      first = p.document.artboards[0].children[1].children[1],
      second = structuredClone(first);
    second.id = 'second-art';
    const result = await exportAssets(p.document, [first, second], {
      format: 'svg',
      scale: 1,
      removeRadius: true,
    });
    expect(result.mime).toBe('application/zip');
    const files = unzipSync(result.bytes);
    expect(Object.keys(files)).toHaveLength(2);
    expect(new Set(Object.keys(files)).size).toBe(2);
    for (const bytes of Object.values(files)) {
      const svg = strFromU8(bytes);
      expect(svg).toContain('<clipPath');
      const data = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
      expect(data[3]).toBe(255);
    }
    expect(first.clip?.radius).toEqual([18, 18, 18, 18]);
  });
  it('includes descendant shadow extents when exporting a group', async () => {
    const p = demoProject(),
      group = p.document.artboards[0].children[0].children[4],
      child = group.children[0];
    child.style.shadows = [{ x: 20, y: 10, blur: 8, color: '#000000' }];
    const svg = renderAsset(p.document, group);
    const metadata = await sharp(Buffer.from(svg)).metadata();
    expect(metadata.width).toBeGreaterThan(group.bounds.width + 20);
    expect(metadata.height).toBeGreaterThan(group.bounds.height + 10);
  });
  it('keeps selected hidden layers exportable without changing their visibility', async () => {
    const p = demoProject(),
      n = p.document.artboards[0].children[0].children[0];
    n.visible = false;
    const result = await exportAssets(p.document, [n], {
      format: 'svg',
      scale: 1,
      removeRadius: false,
    });
    expect(strFromU8(result.bytes)).toContain('roam.');
    expect(n.visible).toBe(false);
    await expect(
      exportAssets(p.document, [], { format: 'svg', scale: 1, removeRadius: false })
    ).rejects.toThrow('選取');
  });
});
