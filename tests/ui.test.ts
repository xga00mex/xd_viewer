// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Studio } from '../src/ui/app';
import { demoProject } from '../src/demo';
import { createProject } from '../src/core/model';
import { parseXd } from '../src/parser/design';
import { multiBoardXd } from './fixtures/multi-board';
import { readFileSync } from 'node:fs';
const stylesheet = readFileSync('src/style.css', 'utf8');
import { download } from '../src/export/assets';

vi.mock('../src/export/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/export/assets')>()),
  download: vi.fn(async () => true),
}));

vi.mock('../src/core/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/project')>()),
  saveLocal: vi.fn(async () => {}),
}));
vi.mock('../src/export/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/export/web')>()),
  createPreview: vi.fn(() => ({
    html: '<p>Preview</p>',
    url: 'blob:preview-test',
    id: 'test-preview',
    dispose: vi.fn(),
  })),
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
function pointerViewport() {
  const viewport = document.querySelector<HTMLElement>('#canvas-viewport')!;
  const captured = new Set<number>();
  Object.defineProperty(viewport, 'setPointerCapture', {
    value: vi.fn((id: number) => captured.add(id)),
    configurable: true,
  });
  Object.defineProperty(viewport, 'hasPointerCapture', {
    value: (id: number) => captured.has(id),
    configurable: true,
  });
  Object.defineProperty(viewport, 'releasePointerCapture', {
    value: vi.fn((id: number) => captured.delete(id)),
    configurable: true,
  });
  return viewport;
}
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('IntersectionObserver', undefined);
  app = new Studio(document.getElementById('app')!, demoProject());
});
afterEach(() => {
  app.destroy();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('three-column local workbench DOM integration', () => {
  it('navigates to the preview document without an empty srcdoc overriding it and confirms readiness', () => {
    click('[data-action="preview"]');
    const frame = document.querySelector<HTMLIFrameElement>('iframe')!;
    expect(frame.hasAttribute('srcdoc')).toBe(false);
    expect(frame.src).toBe('blob:preview-test');
    expect(frame.hidden).toBe(false);
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: { type: 'xv-preview-ready', id: 'test-preview' },
      })
    );
    expect(document.querySelector<HTMLElement>('#preview-message')!.hidden).toBe(true);
    click('[data-action="design"]');
    expect(frame.hasAttribute('src')).toBe(false);
  });
  it('shows equally sized thumbnail cards and opens the chosen artboard', () => {
    const doc = parseXd(multiBoardXd());
    doc.artboards[1].bounds.height = 3000;
    app.setProject(createProject(doc), false);
    const style = document.createElement('style');
    style.textContent = stylesheet;
    document.head.append(style);
    try {
      click('[data-action="overview"]');
      const artworks = [...document.querySelectorAll<HTMLElement>('.overview-artwork')];
      expect(new Set(artworks.map((el) => getComputedStyle(el).height)).size).toBe(1);
      expect(getComputedStyle(artworks[0]).height).not.toBe('');
      click('[data-action="open-board"][data-id="second"]');
      expect(app.boardId).toBe('second');
      expect(document.querySelector<HTMLElement>('#canvas-viewport')!.hidden).toBe(false);
    } finally {
      style.remove();
    }
  });
  it('offers persistent grouping and selection export from the canvas context menu', () => {
    app.select('card-0');
    app.select('card-1', true);
    document
      .querySelector('[data-node-id="card-0"]')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 160 }));
    expect(document.querySelector<HTMLElement>('#canvas-menu')?.hidden).toBe(false);
    click('[data-action="group-selection"]');
    expect(app.current?.kind).toBe('group');
    expect(app.current?.children.map((n) => n.id)).toEqual(['card-0', 'card-1']);
    const id = app.current!.id;
    click('[data-action="undo"]');
    expect(
      app.project.document.artboards[0].children.flatMap((n) => n.children).some((n) => n.id === id)
    ).toBe(false);
    click('[data-action="redo"]');
    app.select(id);
    expect(app.current?.children.map((n) => n.id)).toEqual(['card-0', 'card-1']);
    click('[data-action="ungroup-selection"]');
    expect([...app.selected]).toEqual(['card-0', 'card-1']);
  });
  it('preserves multi-selection when right-clicking a selected descendant and exports that selection', () => {
    app.select('card-0');
    app.select('card-1', true);
    const target = document.querySelector('[data-node-id="card-0"] [data-node-id]')!;
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect([...app.selected]).toEqual(['card-0', 'card-1']);
    click('[data-action="context-export"]');
    expect(document.querySelector<HTMLSelectElement>('[data-field="export.scope"]')!.value).toBe(
      'selection'
    );
    expect(document.querySelector('.selection-summary')?.textContent).toContain('2');
  });
  it('offers optional opacity removal, unchecked by default', () => {
    click('[data-action="export-assets"]');
    const checkbox = document.querySelector<HTMLInputElement>(
      '[data-field="export.removeOpacity"]'
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox!.checked).toBe(false);
  });
  it('loads overview artwork near the viewport and releases it when leaving overview', () => {
    let callback: IntersectionObserverCallback = () => {};
    const targets: Element[] = [];
    const disconnect = vi.fn(),
      unobserve = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe(element: Element) {
          targets.push(element);
        }
        disconnect = disconnect;
        unobserve = unobserve;
      }
    );
    app.setProject(createProject(parseXd(multiBoardXd())), false);
    click('[data-action="overview"]');
    expect(targets).toHaveLength(4);
    expect(document.querySelectorAll('#overview-boards svg')).toHaveLength(0);
    callback(
      [{ target: targets[0], isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver
    );
    expect(document.querySelectorAll('#overview-boards svg')).toHaveLength(1);
    expect(unobserve).toHaveBeenCalledWith(targets[0]);
    click('[data-action="design"]');
    expect(disconnect).toHaveBeenCalled();
    expect(document.querySelectorAll('#overview-boards svg')).toHaveLength(0);
  });
  it('displays every artboard and its drawable artwork in the full-artboard view', () => {
    const doc = parseXd(multiBoardXd());
    app.setProject(createProject(doc), false);
    click('[data-action="overview"]');
    const stage = document.querySelector<HTMLElement>('#preview-stage')!;
    expect(stage.hidden).toBe(false);
    for (const board of doc.artboards) {
      const illustration = stage.querySelector(`svg[aria-label="${board.name}"]`);
      expect(illustration, board.name).not.toBeNull();
      expect(illustration!.querySelector('image')).not.toBeNull();
    }
  });
  it('opens the full-artboard page and exports all boards without a layer selection', async () => {
    app.setProject(createProject(parseXd(multiBoardXd())), false);
    app.selected.clear();
    click('[data-action="overview"]');
    expect(document.querySelectorAll('#overview-boards svg')).toHaveLength(4);
    expect(document.querySelector<HTMLElement>('#preview-stage')!.hidden).toBe(false);
    click('[data-action="export"]');
    click('[data-action="export-tab-assets"]');
    change('[data-field="export.scope"]', 'all');
    expect(
      document.querySelector<HTMLButtonElement>('[data-action="download-export"]')!.disabled
    ).toBe(false);
    click('[data-action="download-export"]');
    await vi.waitFor(() => expect(download).toHaveBeenCalled());
    const args = vi.mocked(download).mock.calls.at(-1)!;
    expect(args[1]).toMatch(/\.zip$/);
    const { unzipSync } = await import('fflate');
    expect(Object.keys(unzipSync(args[0] as Uint8Array))).toHaveLength(4);
    expect(app.selected.size).toBe(0);
  });
  it('drags the artboard with Space plus the left button without changing selection', () => {
    app.select('card-0');
    const viewport = pointerViewport();
    const target = document.querySelector('[data-node-id="hero-button-bg"]')!;
    viewport.scrollLeft = 100;
    viewport.scrollTop = 200;
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'Space', key: ' ' })
    );
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        buttons: 1,
        pointerId: 7,
        clientX: 500,
        clientY: 400,
      })
    );
    viewport.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        buttons: 1,
        pointerId: 7,
        clientX: 450,
        clientY: 350,
      })
    );
    expect(viewport.scrollLeft).toBe(150);
    expect(viewport.scrollTop).toBe(250);
    viewport.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
    viewport.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect([...app.selected]).toEqual(['card-0']);
    expect(viewport.classList.contains('panning')).toBe(false);
  });
  it('selects an enclosed range in either drag direction at the current zoom and adds with Shift', () => {
    const doc = parseXd(multiBoardXd());
    const board = doc.artboards[0];
    board.bounds = { x: 0, y: 0, width: 600, height: 600 };
    const first = board.children[0];
    first.id = 'range-first';
    first.bounds = { x: 0, y: 0, width: 20, height: 20 };
    first.transform = [1, 0, 0, 1, 10, 10];
    const second = structuredClone(first);
    second.id = 'range-second';
    second.transform[4] = 50;
    const hidden = structuredClone(first);
    hidden.id = 'range-hidden';
    hidden.visible = false;
    board.children = [first, second, hidden];
    app.setProject(createProject(doc), false);
    const viewport = pointerViewport();
    const paper = document.querySelector<HTMLElement>('#canvas-paper')!;
    const zoom = parseFloat(paper.style.width) / 600;
    vi.spyOn(paper, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 70 } as DOMRect);
    const drag = (from: number, to: number, shiftKey = false) => {
      viewport.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 20,
          clientX: 100 + from * zoom,
          clientY: 70,
          shiftKey,
        })
      );
      viewport.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 20,
          clientX: 100 + to * zoom,
          clientY: 70 + 40 * zoom,
          shiftKey,
        })
      );
      expect(document.querySelector('.marquee')).not.toBeNull();
      viewport.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 20 }));
      viewport.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    drag(40, 0);
    expect([...app.selected]).toEqual(['range-first']);
    drag(40, 80, true);
    expect([...app.selected]).toEqual(['range-first', 'range-second']);
    expect(viewport.scrollLeft).toBe(0);
    document
      .querySelector('[data-node-id="range-first"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect([...app.selected]).toEqual(['range-second']);
  });
  it('keeps click selection and modifier multi-selection when the pointer only jitters', () => {
    const viewport = pointerViewport();
    const target = document.querySelector('[data-node-id="hero-button-bg"]')!;
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 7,
        clientX: 50,
        clientY: 50,
      })
    );
    viewport.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: 52, clientY: 51 })
    );
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect([...app.selected]).toEqual(['hero-button-bg']);
    expect(viewport.setPointerCapture).not.toHaveBeenCalled();
    const other = document.querySelector('[data-node-id="hero-art-sun"]')!;
    other.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 8, ctrlKey: true })
    );
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(app.selected.has('hero-button-bg')).toBe(true);
    expect(app.selected.has('hero-art-sun')).toBe(true);
  });
  it('releases middle-button panning on pointer cancellation and window blur', () => {
    const viewport = pointerViewport();
    viewport.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 1,
        pointerId: 7,
        clientX: 200,
        clientY: 200,
      })
    );
    expect(viewport.classList.contains('panning')).toBe(true);
    viewport.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 7 }));
    expect(viewport.hasPointerCapture(7)).toBe(false);
    expect(viewport.classList.contains('panning')).toBe(false);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'Space', key: ' ' })
    );
    viewport.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 8 })
    );
    expect(viewport.classList.contains('panning')).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(viewport.hasPointerCapture(8)).toBe(false);
    expect(viewport.classList.contains('panning')).toBe(false);
  });
  it('exports multiple selected layers as one SVG when merge is checked', async () => {
    vi.mocked(download).mockClear();
    app.select('card-0');
    app.select('card-1', true);
    click('[data-action="export-assets"]');
    click('[data-field="export.merge"]');
    expect(document.querySelector('.selection-summary')?.textContent).toContain('單一素材');
    click('[data-action="download-export"]');
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [bytes, name, mime] = vi.mocked(download).mock.calls[0];
    expect(name).toMatch(/-merged\.svg$/);
    expect(mime).toBe('image/svg+xml');
    expect(new TextDecoder().decode(bytes as Uint8Array)).toContain('<svg');
  });
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
