// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { demoProject } from '../src/demo';
import { createPreview, exportWeb, webZip } from '../src/export/web';
import { interactionRuntime, runtimeSource } from '../src/export/runtime';
import { safeId } from '../src/core/escape';
import { createProject, defaultLayout } from '../src/core/model';
import { History } from '../src/core/history';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('maintainable web export', () => {
  it('allocates a navigable preview document and releases it when replaced', async () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const preview = createPreview(exportWeb(demoProject()), 'demo-board');
    expect(preview.url).toMatch(/^blob:/);
    const blob = create.mock.calls.at(-1)![0] as Blob;
    expect(await blob.text()).toBe(preview.html);
    expect(preview.html).toContain(`data-preview-id="${preview.id}"`);
    preview.dispose();
    expect(revoke).toHaveBeenCalledWith(preview.url);
  });
  it('gives the opaque sandbox a self-contained page without Blob subresources', () => {
    const preview = createPreview(exportWeb(demoProject()), 'demo-board');
    expect(preview).toHaveProperty('html');
    const html = (preview as unknown as { html: string }).html;
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/(?:src|href)="(?:blob:|assets\/|styles.css|interactions.js)/);
    expect(html.includes(`id="${safeId('hero-button')}"`)).toBe(true);
    preview.dispose();
  });
  it('exports every referenced local asset and stable classes, no external runtime', () => {
    const p = demoProject(),
      first = exportWeb(p),
      second = exportWeb(p);
    expect(first.files).toEqual(second.files);
    const zip = unzipSync(webZip(first));
    expect(Object.keys(zip)).toContain('index.html');
    expect(Object.keys(zip)).toContain('styles.css');
    expect(Object.keys(zip)).toContain('interactions.js');
    const html = strFromU8(zip['index.html']);
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
    for (const el of document.querySelectorAll('[src]'))
      expect(zip[el.getAttribute('src')!]).toBeDefined();
    expect(html).toContain('<main');
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(html).not.toMatch(/react|vue/i);
    expect(strFromU8(zip['styles.css'])).toContain('grid-template-columns: repeat(3');
    expect(strFromU8(zip['styles.css']).lastIndexOf('@media (max-width:')).toBeGreaterThan(
      strFromU8(zip['styles.css']).indexOf('/* 目的地卡片 */')
    );
    expect(first.files['README.md']).toContain('字型');
  });
  it('keeps mixed transforms, native text for flow, hidden state and responsive pins', () => {
    const p = demoProject(),
      board = p.document.artboards[0],
      n = board.children[0];
    p.layouts = {};
    n.transform = [0, 1, -1, 0, 50, 20];
    n.bounds.x = 10;
    n.bounds.y = 15;
    n.visible = false;
    p.layouts[n.id] = { ...defaultLayout(), responsive: 'right' };
    const result = exportWeb(p);
    document.body.innerHTML = String(result.files['index.html']).match(
      /<body>([\s\S]*)<\/body>/
    )![1];
    expect(document.getElementById(safeId(n.id))?.hidden).toBe(true);
    expect(result.files['styles.css']).toContain('matrix(0, 1, -1, 0, 0, 0)');
    expect(result.files['styles.css']).toContain('right:');
  });
  it('creates offline preview with a packaged script and exports the same runtime', () => {
    const bundle = exportWeb(demoProject());
    const preview = createPreview(bundle, 'demo-board');
    expect(preview.html).toMatch(/<script src="http:\/\/localhost[^\"]+" defer>/);
    expect(bundle.files['interactions.js']).toBe(runtimeSource());
    preview.dispose();
  });
  it('does not execute untrusted layer names or text in generated markup', () => {
    const p = demoProject(),
      n = p.document.artboards[0].children[0].children[0];
    n.name = '</style><script>window.pwned=true</script>';
    n.text!.value = '<img src=x onerror=alert(1)>';
    n.text!.lines = [{ from: 0, to: n.text!.value.length, x: 0, y: 30 }];
    const bundle = exportWeb(p);
    document.body.innerHTML = String(bundle.files['index.html']).match(
      /<body>([\s\S]*)<\/body>/
    )![1];
    expect(
      [...document.querySelectorAll('script')].every((s) => s.src.endsWith('interactions.js'))
    ).toBe(true);
    expect(document.querySelector('[onerror]')).toBeNull();
  });
});
describe('exported interactions', () => {
  it('does not collapse artwork to scale zero while its viewport is still hidden', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    document.body.innerHTML =
      '<div><main data-scale-width="100" data-scale-height="200"></main></div>';
    interactionRuntime();
    expect(document.querySelector('main')!.style.transform).not.toBe('scale(0)');
    Object.defineProperty(document.querySelector('main')!.parentElement, 'clientWidth', {
      value: 50,
    });
    window.dispatchEvent(new Event('resize'));
    expect(document.querySelector('main')!.style.transform).toBe('scale(0.5)');
  });
  it('handles nested toggle keyboard events once and synchronizes both controls', () => {
    document.body.innerHTML =
      '<div data-action="toggle" data-target="panel"><span id="inner" tabindex="0" data-action="toggle" data-target="panel"></span></div><button id="other" data-action="toggle" data-target="panel"></button><section id="panel" hidden></section>';
    interactionRuntime();
    document
      .getElementById('inner')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.getElementById('panel')!.hidden).toBe(false);
    expect(document.getElementById('other')!.getAttribute('aria-expanded')).toBe('true');
  });
  it('keeps keyboard navigation inside the sandbox preview protocol', async () => {
    document.body.innerHTML =
      '<div id="nav" data-action="navigate" data-page="next.html" tabindex="0"></div>';
    const postMessage = vi.fn();
    vi.stubGlobal('parent', { postMessage });
    await import('../src/export/preview-entry');
    document
      .getElementById('nav')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'xv-preview-navigate', page: 'next.html' },
      '*'
    );
  });
  it('toggles hidden targets by click and keyboard, preserves matrix transforms', () => {
    document.body.innerHTML =
      '<div id="trigger" tabindex="0" data-action="toggle" data-target="panel"></div><section id="panel" hidden></section>';
    interactionRuntime();
    const trigger = document.getElementById('trigger')!,
      panel = document.getElementById('panel')!;
    trigger.click();
    expect(panel.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(panel.hidden).toBe(true);
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(panel.hidden).toBe(false);
  });
  it('uses scroll target and respects reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    document.body.innerHTML =
      '<button id="trigger" data-action="scroll" data-target="target"></button><section id="target"></section><div data-reveal></div>';
    const scroll = vi.fn();
    document.getElementById('target')!.scrollIntoView = scroll;
    interactionRuntime();
    document.getElementById('trigger')!.click();
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(document.querySelector('[data-reveal]')?.classList.contains('reveal-pending')).toBe(
      false
    );
  });
  it('reveals once on intersection and then disconnects', () => {
    let callback: IntersectionObserverCallback | undefined;
    const observe = vi.fn(),
      disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe = observe;
        disconnect = disconnect;
      }
    );
    document.body.innerHTML = '<div id="target" data-reveal data-threshold="0.25"></div>';
    interactionRuntime();
    const node = document.getElementById('target')!;
    expect(node.classList.contains('reveal-pending')).toBe(true);
    expect(observe).toHaveBeenCalledWith(node);
    callback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(node.classList.contains('reveal-pending')).toBe(false);
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it('undoes and redoes interaction settings without copying embedded assets', () => {
    const p = createProject(demoProject().document),
      history = new History(),
      doc = p.document;
    history.push(p);
    p.interactions.x = { hover: { effect: 'scale', duration: 100 } };
    history.undo(p);
    expect(p.interactions.x).toBeUndefined();
    history.redo(p);
    expect(p.interactions.x.hover?.effect).toBe('scale');
    expect(p.document).toBe(doc);
  });
});
