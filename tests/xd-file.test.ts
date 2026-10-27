import { describe, expect, it } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import sharp from 'sharp';
import { parseXd } from '../src/parser/xd';
import { createProject, flatten } from '../src/core/model';
import { worldBounds } from '../src/core/geometry';
import { renderBoard } from '../src/render/svg';
import { parseProject, serializeProject } from '../src/core/project';
import { exportWeb } from '../src/export/web';
import { exportViewer } from '../src/export/viewer';

// Opt in with XD_TEST_FILE; private design files are never committed as fixtures.
const path = process.env.XD_TEST_FILE;
describe.skipIf(!path)('supplied XD file verification', () => {
  const doc = path ? parseXd(new Uint8Array(readFileSync(path)), basename(path)) : undefined!;

  it('resolves embedded images and stored components', async () => {
    const counts = Object.fromEntries(
      [...new Set(doc.diagnostics.map((d) => d.code))].map((code) => [
        code,
        doc.diagnostics.filter((d) => d.code === code).length,
      ])
    );
    const unsupported = new Set(['missing-image', 'component', 'node-type', 'gradient-type']);
    expect(doc.diagnostics.filter((d) => unsupported.has(d.code))).toEqual([]);
    expect(parseProject(serializeProject(createProject(doc))).document.artboards).toEqual(
      doc.artboards
    );
    for (const asset of Object.values(doc.assets)) {
      const metadata = await sharp(Buffer.from(asset.data.split(',')[1], 'base64')).metadata();
      expect(metadata.width).toBeGreaterThan(0);
    }
    mkdirSync('.cache/xd-verification', { recursive: true });
    writeFileSync(
      '.cache/xd-verification/report.json',
      JSON.stringify(
        {
          boards: doc.artboards.length,
          assets: Object.keys(doc.assets).length,
          layers: flatten(doc.artboards).length,
          diagnostics: counts,
        },
        null,
        2
      )
    );
  });

  it('keeps artwork inside each artboard instead of at pasteboard coordinates', () => {
    const ratios = doc.artboards.map((board) => {
      const images = flatten(board.children).filter(
        (n) => n.visible && n.style.fill.type === 'image'
      );
      const inside = images.filter((n) => {
        const b = worldBounds(board, n.id)!;
        return (
          b.x < board.bounds.width &&
          b.x + b.width > 0 &&
          b.y < board.bounds.height &&
          b.y + b.height > 0
        );
      });
      return { name: board.name, total: images.length, inside: inside.length };
    });
    expect(ratios.filter((b) => b.total > 0 && b.inside === 0)).toHaveLength(0);
  });

  it('keeps the mixed-style freight notice on one continuous baseline', () => {
    const notices = flatten(doc.artboards).filter((n) => n.text?.value.includes('即可享免運優惠'));
    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) expect(notice.text?.lines, notice.id).toHaveLength(1);
  });

  it('rasterizes every artboard with visible content', async () => {
    mkdirSync('.cache/xd-verification', { recursive: true });
    for (const board of doc.artboards) {
      const svg = renderBoard(doc, board);
      const png = await sharp(Buffer.from(svg)).resize({ width: 640 }).png().toBuffer();
      const stats = await sharp(png).stats();
      expect(
        stats.channels.slice(0, 3).some((channel) => channel.stdev > 5),
        board.name
      ).toBe(true);
      if (process.env.VISUAL_QA) writeFileSync(`.cache/xd-verification/${board.id}.png`, png);
    }
  }, 30000);

  it('exports all pages with resolved assets and embeds a representative review', () => {
    const bundle = exportWeb(createProject(doc), {
      responsive: false,
      breakpoint: 768,
      scaleArtboard: false,
    });
    expect(Object.keys(bundle.pages)).toHaveLength(doc.artboards.length);
    for (const [name, content] of Object.entries(bundle.files)) {
      if (typeof content !== 'string' || name.endsWith('.md')) continue;
      for (const [path] of content.matchAll(/assets\/[a-zA-Z0-9.-]+/g))
        expect(bundle.files[path], `${name}: ${path}`).toBeDefined();
    }
    const html = exportViewer(createProject({ ...doc, artboards: doc.artboards.slice(0, 1) }));
    const data = JSON.parse(
      html.match(/<script id="viewer-data" type="application\/json">([\s\S]*?)<\/script>/)![1]
    );
    expect(data.boards).toHaveLength(1);
    expect(data.boards[0].html).toContain('data:image/');
    expect(data.boards[0].html).not.toMatch(/(?:src|href)="assets\//);
    expect(data.boards[0].html).not.toMatch(/url\(["']?assets\//);
  }, 30000);
});
