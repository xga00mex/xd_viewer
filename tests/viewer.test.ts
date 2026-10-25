// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { exportViewer } from '../src/export/viewer';
import { viewerRuntime } from '../src/export/viewer-runtime';
import { demoProject } from '../src/demo';
import { exportWeb } from '../src/export/web';
import { safeId } from '../src/core/escape';
import { flatten } from '../src/core/model';
import { readFont } from '../src/core/fonts';

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
function setup() {
  const project = demoProject(),
    board = structuredClone(project.document.artboards[0]);
  board.id = 'second-board';
  board.name = '第二頁';
  board.children = [];
  project.document.artboards.push(board);
  project.interactions['hero-button'].click = { action: 'navigate', target: board.id };
  const html = exportViewer(project);
  // Seed an empty srcdoc so the memory DOM never attempts to load about:blank.
  document.body.innerHTML = html
    .match(/<body>([\s\S]*)<\/body>/)![1]
    .replace('<iframe ', '<iframe srcdoc="&lt;!doctype html&gt;" ');
  const stage = document.getElementById('review-stage')!;
  Object.defineProperty(stage, 'clientWidth', { value: 1400 });
  Object.defineProperty(stage, 'clientHeight', { value: 1000 });
  return { project, html };
}
describe('single HTML XD-style review', () => {
  it('embeds image and font bytes so the saved HTML remains portable', async () => {
    const p = demoProject();
    p.document.assets.pixel = {
      id: 'pixel',
      name: 'pixel.png',
      mime: 'image/png',
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a83sAAAAASUVORK5CYII=',
    };
    flatten(p.document.artboards).find((n) => n.id === 'hero-button-bg')!.style.fill = {
      type: 'image',
      assetId: 'pixel',
      fit: 'cover',
    };
    const font = await readFont(new File(['wOF2fixture'], 'local.woff2'), 'Arial', 400, 'normal');
    p.document.fonts = { [font.id]: font };
    const html = exportViewer(p),
      data = JSON.parse(
        html.match(/<script id="viewer-data" type="application\/json">([\s\S]*?)<\/script>/)![1]
      );
    expect(data.boards[0].html).toContain(p.document.assets.pixel.data);
    expect(data.boards[0].html).toContain(font.data);
    expect(data.boards[0].html).not.toMatch(/url\(["']?assets\//);
  });
  it('embeds every page and asset without a localhost server or sidecar files', () => {
    const { html } = setup();
    const data = JSON.parse(document.getElementById('viewer-data')!.textContent!);
    expect(data.boards).toHaveLength(2);
    expect(data.boards[0].viewportHeight).toBe(900);
    for (const board of data.boards) {
      expect(board.html).not.toMatch(/(?:src|href)="(?:assets\/|styles.css|interactions.js)/);
      expect(board.html).toContain('data-action');
      expect(board.html).toContain('xd-viewer-navigate');
    }
    expect(html).not.toContain('127.0.0.1');
    expect(html).toContain('全螢幕');
    expect(html).toContain('熱區');
  });
  it('preserves nested masked node interactions instead of flattening them', () => {
    const p = demoProject();
    p.interactions['hero-art-sun'] = {
      hover: { effect: 'scale', duration: 200 },
      click: { action: 'scroll', target: 'destinations' },
    };
    const bundle = exportWeb(p, { responsive: false, breakpoint: 768, scaleArtboard: false });
    document.body.innerHTML = String(bundle.files['index.html']).match(
      /<body>([\s\S]*)<\/body>/
    )![1];
    expect(document.getElementById(safeId('hero-art-sun'))?.dataset.action).toBe('scroll');
    expect(bundle.files['styles.css']).toContain('clip-path: url(#clip-');
    expect(document.querySelector('clipPath')).not.toBeNull();
  });
  it('navigates, goes back and uses an actual viewport height for scrolling', () => {
    setup();
    viewerRuntime();
    const frame = document.getElementById('prototype') as HTMLIFrameElement;
    expect(frame.style.height).toBe('900px');
    document.getElementById('next')!.click();
    expect(document.getElementById('review-count')!.textContent).toBe('2 / 2');
    document.getElementById('back')!.click();
    expect(document.getElementById('review-count')!.textContent).toBe('1 / 2');
    const zoom = document.getElementById('review-zoom') as HTMLSelectElement;
    zoom.value = '1';
    zoom.dispatchEvent(new Event('change'));
    expect(frame.style.transform).toBe('scale(1)');
    document.getElementById('hotspots')!.click();
    expect(document.getElementById('hotspots')!.getAttribute('aria-pressed')).toBe('true');
  });
  it('accepts navigation only from its own preview and known pages', () => {
    const { project } = setup();
    viewerRuntime();
    const frame = document.getElementById('prototype') as HTMLIFrameElement;
    Object.defineProperty(frame, 'contentWindow', { value: window });
    const page = exportWeb(project).pages['second-board'];
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'xd-viewer-navigate', page } })
    );
    expect(document.getElementById('review-count')!.textContent).toBe('1 / 2');
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: { type: 'xd-viewer-navigate', page },
      })
    );
    expect(document.getElementById('review-count')!.textContent).toBe('2 / 2');
  });
  it('escapes names and embedded HTML out of the shell data script', () => {
    const p = demoProject();
    p.document.name = '</script><script>bad()</script>';
    p.document.artboards[0].name = p.document.name;
    const html = exportViewer(p);
    expect(html).not.toContain('<script>bad()');
    document.body.innerHTML = html
      .match(/<body>([\s\S]*)<\/body>/)![1]
      .replace('<iframe ', '<iframe srcdoc="&lt;!doctype html&gt;" ');
    expect(JSON.parse(document.getElementById('viewer-data')!.textContent!).name).toBe(
      p.document.name
    );
  });
});
