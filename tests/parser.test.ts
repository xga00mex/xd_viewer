import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { parseXd } from '../src/parser/xd';
import { flatten } from '../src/core/model';
import { parseProject, serializeProject } from '../src/core/project';
import { createProject } from '../src/core/model';
import { transformBounds, multiply, measure } from '../src/core/geometry';

export function fixture(children: unknown[], resources: object = {}) {
  return zipSync({
    'artwork/artboard-test/graphics/graphicContent.agc': strToU8(
      JSON.stringify({
        version: '1.5.0',
        children: [{ type: 'artboard', id: 'test', artboard: { ref: 'metadata-key', children } }],
      })
    ),
    'resources/graphics/graphicContent.agc': strToU8(
      JSON.stringify({
        artboards: { 'metadata-key': { name: '測試畫板', width: 800, height: 600 } },
        resources,
      })
    ),
  });
}
describe('XD adapter', () => {
  it('reads a real licensed XD with nested layers, text and embedded images', () => {
    const doc = parseXd(
      new Uint8Array(readFileSync('tests/fixtures/xd2svg/single.xd')),
      'single.xd'
    );
    expect(doc.artboards).toHaveLength(1);
    expect(doc.artboards[0].bounds).toEqual({ x: 0, y: 0, width: 1920, height: 6163 });
    const nodes = flatten(doc.artboards);
    expect(nodes.filter((n) => n.kind === 'text')).toHaveLength(91);
    expect(nodes.filter((n) => n.kind === 'group')).toHaveLength(41);
    expect(Object.values(doc.assets)).toHaveLength(12);
    expect(nodes.some((n) => !n.visible)).toBe(true);
    expect(nodes.find((n) => n.name === 'About Us')?.text?.value).toBe('About Us');
    expect(doc.diagnostics.filter((d) => d.code === 'missing-image')).toHaveLength(0);
    expect(
      parseProject(serializeProject(createProject(doc))).document.artboards[0].bounds.height
    ).toBe(6163);
  });
  it('resolves shared gradients and clip resources, keeps baseline and area bounds', () => {
    const bytes = fixture(
      [
        {
          type: 'shape',
          id: 'gradient',
          shape: { type: 'rect', x: 4, y: 8, width: 100, height: 50, r: [1, 2, 3, 4] },
          style: {
            fill: { type: 'gradient', gradient: { ref: 'g', x1: 0, y1: 0, x2: 1, y2: 1.4 } },
            clipPath: { ref: 'c' },
          },
        },
        {
          type: 'text',
          id: 'area',
          style: { font: { size: 20, family: 'sans-serif' } },
          text: {
            rawText: 'Hello',
            frame: { type: 'area', width: 200, height: 30 },
            paragraphs: [{ lines: [[{ from: 0, to: 5, x: 0, y: 20 }]] }],
          },
        },
      ],
      {
        gradients: {
          g: {
            type: 'linear',
            stops: [
              { offset: 0, color: { value: { r: 255, g: 0, b: 0 } } },
              { offset: 1, color: { value: { r: 0, g: 0, b: 255 } } },
            ],
          },
        },
        clipPaths: {
          c: {
            type: 'clipPath',
            children: [
              {
                type: 'shape',
                id: 'clip',
                shape: { type: 'rect', x: 0, y: 0, width: 90, height: 40 },
              },
            ],
          },
        },
      }
    );
    const nodes = parseXd(bytes).artboards[0].children;
    expect(nodes[0].style.fill).toMatchObject({
      type: 'linear',
      y2: 1.4,
      stops: [{ color: '#ff0000' }, { color: '#0000ff' }],
    });
    expect(nodes[0].clip?.children[0].bounds.width).toBe(90);
    expect(nodes[1].bounds).toEqual({ x: 0, y: 0, width: 200, height: 30 });
    expect(nodes[1].text?.lines[0].y).toBe(20);
  });
  it('rejects corrupt files and unsafe paths without fetching referenced files', () => {
    expect(() => parseXd(strToU8('not a zip'))).toThrow('ZIP');
    expect(() => parseXd(zipSync({ '../outside': strToU8('no') }))).toThrow('不安全');
    expect(() => parseXd(zipSync({ 'artwork/x.agc': strToU8('{') }))).toThrow('JSON');
    const doc = parseXd(
      fixture([
        {
          type: 'shape',
          id: 'remote',
          shape: { type: 'rect', width: 1, height: 1 },
          style: {
            fill: { type: 'pattern', pattern: { href: 'https://example.com/tracking.png' } },
          },
        },
      ])
    );
    expect(doc.diagnostics.some((d) => d.code === 'missing-image')).toBe(true);
  });
  it('reports unknown types instead of pretending full fidelity', () => {
    const doc = parseXd(fixture([{ type: 'mesh', id: 'unknown' }]));
    expect(doc.diagnostics.find((d) => d.nodeId === 'unknown')?.code).toBe('node-type');
  });
});
describe('geometry', () => {
  it('composes nested rotation and translations and measures edge gaps', () => {
    const m = multiply([0, 1, -1, 0, 100, 50], [1, 0, 0, 1, 10, 20]);
    expect(transformBounds({ x: 0, y: 0, width: 30, height: 10 }, m)).toEqual({
      x: 70,
      y: 60,
      width: 10,
      height: 30,
    });
    expect(
      measure({ x: 0, y: 0, width: 10, height: 10 }, { x: 30, y: 40, width: 10, height: 10 })
    ).toMatchObject({ horizontal: 20, vertical: 30 });
  });
});
