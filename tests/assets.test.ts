import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
import { demoProject } from '../src/demo';
import { exportAssets } from '../src/export/assets';
import { renderAsset } from '../src/render/svg';

describe('asset batches and visual extents', () => {
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
