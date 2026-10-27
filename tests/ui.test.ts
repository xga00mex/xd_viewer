// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Studio } from '../src/ui/app';
import { demoProject } from '../src/demo';
import { createProject } from '../src/core/model';
import { parseXd } from '../src/parser/xd';
import { multiBoardXd } from './fixtures/multi-board';

vi.mock('../src/core/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/project')>()),
  saveLocal: vi.fn(async () => {}),
}));
vi.mock('../src/export/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/export/web')>()),
  createPreview: vi.fn(() => ({ url: 'about:blank', dispose: vi.fn() })),
}));
let app: Studio;
const click = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element, selector).not.toBeNull();
  if (element instanceof HTMLElement) element.click();
  else element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const change = (selector: string, value: string) => {
  const element = document.querySelector<HTMLInputElement>(selector)!;
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
};
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  app = new Studio(document.getElementById('app')!, demoProject());
});
afterEach(() => {
  app.destroy();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('three-column local workbench DOM integration', () => {
  it('switches repeatedly between imported artboards without dropping images or keeping the previous scene', () => {
    app.destroy();
    app = new Studio(document.getElementById('app')!, createProject(parseXd(multiBoardXd())));
    for (const id of ['second', 'third', 'fourth', 'first', 'second']) {
      const viewport = document.querySelector<HTMLElement>('#canvas-viewport')!;
      viewport.scrollLeft = 500;
      viewport.scrollTop = 500;
      change('#boards', id);
      expect(app.boardId).toBe(id);
      expect(document.querySelector('#board-caption')?.textContent).toBe(id);
      const stage = document.querySelector('#design-stage')!;
      expect(stage.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 64 64');
      expect(stage.querySelectorAll('image')).toHaveLength(1);
      expect(stage.querySelector('image')?.getAttribute('href')).toMatch(
        /^data:image\/png;base64,/
      );
      expect(stage.querySelector(`[data-node-id="${id}-image"]`)?.getAttribute('transform')).toBe(
        'matrix(1 0 0 1 8 8)'
      );
      expect(viewport.scrollLeft).toBe(0);
      expect(viewport.scrollTop).toBe(0);
    }
  });
  it('starts with real layers, selects the SVG node and inspects CSS', () => {
    expect(document.querySelectorAll('.panel')).toHaveLength(2);
    expect(document.querySelector('#design-stage svg')).not.toBeNull();
    click('[data-layer="hero-button-bg"]');
    expect(app.current?.id).toBe('hero-button-bg');
    expect(document.querySelector('#inspector pre')?.textContent).toContain('border-radius: 8px');
    expect(document.querySelector('#selection-overlay rect')).not.toBeNull();
    click('[data-node-id="hero-art-sun"] circle, [data-node-id="hero-art-sun"] ellipse');
    expect(app.current?.id).toBe('hero-art-sun');
  });
  it('measures multiple selections and filters layer names', () => {
    app.select('card-0');
    app.select('card-1', true);
    expect(app.selected.size).toBe(2);
    expect(document.querySelector('#canvas-status')?.textContent).toContain('32 px');
    const search = document.querySelector<HTMLInputElement>('#layer-search')!;
    search.value = '主按鈕';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelectorAll('[data-layer]')).toHaveLength(1);
  });
  it('updates interaction duration and supports undo/redo', () => {
    app.select('hero-button');
    click('[data-action="interact"]');
    change('[data-field="hover.duration"]', '350');
    expect(app.project.interactions['hero-button'].hover?.duration).toBe(350);
    click('[data-action="undo"]');
    expect(app.project.interactions['hero-button'].hover?.duration).toBe(220);
    click('[data-action="redo"]');
    expect(app.project.interactions['hero-button'].hover?.duration).toBe(350);
    click('[data-action="remove-interactions"]');
    expect(app.project.interactions['hero-button']).toBeUndefined();
  });
  it('enables each interaction and configures responsive layout', () => {
    app.select('header');
    click('[data-action="interact"]');
    for (const key of ['click', 'hover', 'scroll', 'position', 'animation'])
      click(`[data-field="enable.${key}"]`);
    expect(Object.keys(app.project.interactions.header)).toHaveLength(5);
    change('[data-field="position.mode"]', 'fixed');
    expect(app.project.interactions.header.position?.mode).toBe('fixed');
    click('[data-action="layout"]');
    change('[data-field="layout.mode"]', 'grid');
    change('[data-field="layout.columns"]', '2');
    expect(app.project.layouts.header).toMatchObject({ mode: 'grid', columns: 2 });
    click('[data-action="reset-layout"]');
    expect(app.project.layouts.header).toBeUndefined();
  });
  it('opens batch asset export options and preserves selected layers', () => {
    app.select('card-0');
    app.select('card-1', true);
    click('[data-action="export-assets"]');
    const modal = document.querySelector<HTMLDialogElement>('#modal')!;
    expect(modal.open).toBe(true);
    expect(modal.textContent).toContain('2');
    click('[data-field="export.removeRadius"]');
    change('[data-field="export.format"]', 'png');
    expect(app.selected.size).toBe(2);
    click('[data-action="close"]');
    expect(modal.open).toBe(false);
  });
  it('supports keyboard layer selection and reports unsupported design details', () => {
    const row = document.querySelector<HTMLElement>('[data-layer="header"]')!;
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(app.current?.id).toBe('header');
    app.project.document.diagnostics.push({ code: 'filter', message: '背景模糊尚未支援' });
    click('[data-action="diagnostics"]');
    expect(document.querySelector('#modal')?.textContent).toContain('背景模糊尚未支援');
  });
});
