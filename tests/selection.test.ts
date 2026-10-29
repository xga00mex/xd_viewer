import { it, expect } from 'vitest';
import sharp from 'sharp';
import { demoProject } from '../src/demo';
import { groupSelection, ungroupSelection, enclosedNodes } from '../src/core/selection';
import { worldBounds } from '../src/core/geometry';
import { parseProject, serializeProject } from '../src/core/project';
import { renderBoard, renderMergedAsset, renderAsset } from '../src/render/svg';
import { findNode } from '../src/core/model';
import { History } from '../src/core/history';

it('persists grouping, preserves transforms and artwork, and restores the scene through undo/redo', async () => {
  const p = demoProject(),
    board = p.document.artboards[0],
    history = new History();
  const selected = new Set(['card-0', 'card-1']);
  const bounds = [...selected].map((id) => worldBounds(board, id));
  const raster = async () =>
    sharp(Buffer.from(renderBoard(p.document, p.document.artboards[0])))
      .png()
      .toBuffer();
  const before = await raster();
  history.push(p);
  const id = groupSelection(p, board.id, selected);
  expect([...selected].map((id) => worldBounds(p.document.artboards[0], id))).toEqual(bounds);
  expect((await raster()).equals(before)).toBe(true);
  const reopened = parseProject(serializeProject(p));
  expect(findNode(reopened, id)?.children.map((n) => n.id)).toEqual([...selected]);
  history.undo(p);
  expect(p.document.artboards[0]).toBe(board);
  history.redo(p);
  expect(findNode(p, id)).toBeDefined();
  expect(ungroupSelection(p, board.id, new Set([id]))).toEqual([...selected]);
  expect((await raster()).equals(before)).toBe(true);
});

it('groups across nested parents without moving objects or losing ancestor masks and opacity', async () => {
  const p = demoProject(),
    board = p.document.artboards[0];
  const selected = new Set(['hero-art-sun', 'card-0']);
  const bounds = [...selected].map((id) => worldBounds(board, id));
  const before = await sharp(
    Buffer.from(
      renderMergedAsset(
        p.document,
        [...selected].map((id) => findNode(p, id)!)
      )
    )
  )
    .png()
    .toBuffer();
  const id = groupSelection(p, board.id, selected);
  expect([...selected].map((id) => worldBounds(p.document.artboards[0], id))).toEqual(bounds);
  expect(findNode(p, id)?.kind).toBe('group');
  expect(() => parseProject(serializeProject(p))).not.toThrow();
  const after = await sharp(Buffer.from(renderAsset(p.document, findNode(p, id)!)))
    .png()
    .toBuffer();
  expect(after.equals(before)).toBe(true);
});

it('selects complete containers once and ignores hidden descendants in a marquee', () => {
  const p = demoProject(),
    board = p.document.artboards[0];
  const card = findNode(p, 'card-0')!;
  expect(enclosedNodes(board, worldBounds(board, card.id)!)).toEqual([card.id]);
});
