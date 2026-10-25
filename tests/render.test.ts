import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { parseXd } from '../src/parser/xd';
import { zipSync, strToU8 } from 'fflate';
import { renderAsset, renderBoard } from '../src/render/svg';
import { createProject } from '../src/core/model';
import { parseProject, serializeProject } from '../src/core/project';
import { demoProject } from '../src/demo';

const documentWith = (node: unknown) =>
  parseXd(
    zipSync({
      'artwork/a/graphicContent.agc': strToU8(
        JSON.stringify({
          children: [{ type: 'artboard', id: 'board', artboard: { ref: 'b', children: [node] } }],
          artboards: { b: { width: 60, height: 60 } },
        })
      ),
    })
  );
describe('SVG rendering and project boundary', () => {
  it('removes all rounded corners for exports without changing source', async () => {
    const doc = documentWith({
      type: 'shape',
      id: 'r',
      shape: { type: 'rect', x: 0, y: 0, width: 40, height: 40, r: [16, 16, 16, 16] },
      style: { fill: { type: 'solid', color: { value: { r: 255, g: 0, b: 0 } } } },
    });
    const n = doc.artboards[0].children[0];
    const rounded = await sharp(Buffer.from(renderAsset(doc, n)))
      .ensureAlpha()
      .raw()
      .toBuffer();
    const square = await sharp(Buffer.from(renderAsset(doc, n, { removeRadius: true })))
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(rounded[3]).toBe(0);
    expect(square[3]).toBe(255);
    expect(n.radius).toEqual([16, 16, 16, 16]);
  });
  it('renders nested clipping and escapes untrusted layer names and text', async () => {
    const project = demoProject(),
      board = project.document.artboards[0];
    const svg = renderBoard(project.document, board, { selection: true });
    const info = await sharp(Buffer.from(svg)).png().metadata();
    expect(info.width).toBe(1200);
    expect(info.height).toBe(1032);
    expect(svg).toContain('clipPath');
    board.name = '"/><script>alert(1)</script>';
    expect(renderBoard(project.document, board)).not.toContain('<script>');
    expect(parseProject(serializeProject(project)).document.artboards[0].name).toBe(board.name);
  });
  it('retains clipped artwork pixels and removes a nested rounded mask', async () => {
    const p = demoProject(),
      art = p.document.artboards[0].children[1].children[1];
    const { data, info } = await sharp(Buffer.from(renderAsset(p.document, art)))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const center = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
    expect(data[center + 3]).toBe(255);
    expect(data[3]).toBe(0);
    const square = await sharp(Buffer.from(renderAsset(p.document, art, { removeRadius: true })))
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(square[3]).toBe(255);
  });
  it('rejects injected CSS/image URLs and duplicate layer IDs in work files', () => {
    const project = createProject(
      documentWith({ type: 'shape', id: 'r', shape: { type: 'rect', width: 20, height: 20 } })
    );
    const raw = JSON.parse(serializeProject(project));
    raw.document.artboards[0].style.fill = {
      type: 'solid',
      color: 'red; background:url(https://example.com)',
    };
    expect(() => parseProject(JSON.stringify(raw))).toThrow('工作檔');
    const duplicate = JSON.parse(serializeProject(project));
    duplicate.document.artboards[0].children.push(duplicate.document.artboards[0].children[0]);
    expect(() => parseProject(JSON.stringify(duplicate))).toThrow('重複');
  });
});
