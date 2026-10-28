// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFont, fontRules, usedFonts, missingFonts, fontStack } from '../src/core/fonts';
import { demoProject } from '../src/demo';
import { exportWeb, createPreview } from '../src/export/web';
import { renderBoard } from '../src/render/svg';
import { parseProject, serializeProject } from '../src/core/project';

afterEach(() => vi.restoreAllMocks());
describe('local fonts', () => {
  it('preserves XD family names and reports missing system faces with an embedded TC fallback', () => {
    const p = demoProject();
    const n = p.document.artboards[0].children[0].children[0];
    n.text!.family = 'Missing Design Font';
    const missing = missingFonts(p.document.artboards, {}, (f) => f !== 'Missing Design Font');
    expect(missing).toEqual(['Missing Design Font']);
    expect(fontStack(n.text!.family)).toBe('"Missing Design Font", "Noto Sans TC", sans-serif');
    const rules = fontRules(p.document);
    expect(rules.includes('data:font/woff2;base64,')).toBe(true);
    expect(rules.includes('font-weight: 100 900')).toBe(true);
    expect(rules.includes('SIL OPEN FONT LICENSE')).toBe(true);
  });
  it('detects supported font signatures and rejects arbitrary files', async () => {
    const font = await readFont(
      new File(['wOF2fixture'], 'local.woff2'),
      'Local Sans',
      700,
      'normal'
    );
    expect(font.mime).toBe('font/woff2');
    expect(font.data).toMatch(/^data:font\/woff2;base64,/);
    await expect(readFont(new File(['<script>'], 'bad.ttf'), 'X', 400, 'normal')).rejects.toThrow(
      '格式'
    );
    await expect(readFont(new File(['wOF2'], 'ok.woff2'), '', 400, 'normal')).rejects.toThrow(
      '名稱'
    );
  });
  it('preserves fonts in work files and packages safe paths with correct preview MIME', async () => {
    const p = demoProject(),
      family = usedFonts(p.document.artboards)[0];
    const font = await readFont(new File(['wOF2fixture'], 'local.woff2'), family, 400, 'normal');
    font.id = '../../malicious';
    p.document.fonts = { font };
    const restored = parseProject(serializeProject(p));
    expect(restored.document.fonts?.font.family).toBe(family);
    const bundle = exportWeb(p),
      fontPath = Object.keys(bundle.files).find((p) => p.endsWith('.woff2'))!;
    expect(fontPath).not.toContain('..');
    expect(bundle.files['styles.css']).toContain(`url("${fontPath}")`);
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (!(blob instanceof Blob)) throw new Error('Expected Blob');
      blobs.push(blob);
      return 'blob:test/' + blobs.length;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const preview = createPreview(bundle, 'demo-board');
    expect(preview.html).toContain('data:font/woff2;base64,');
    preview.dispose();
  });
  it('embeds safe CSS in standalone SVG and lets inline SVG use registered fonts', async () => {
    const p = demoProject(),
      family = 'Local & "Special" </style>';
    const font = await readFont(new File(['wOF2fixture'], 'local.woff2'), family, 400, 'normal');
    p.document.artboards[0].children[0].children[0].text!.family = family;
    p.document.fonts = { [font.id]: font };
    const svg = renderBoard(p.document, p.document.artboards[0]);
    const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const host = document.createElement('div');
    host.innerHTML = renderBoard(p.document, p.document.artboards[0], { embedFonts: false });
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.querySelector('style')?.textContent).toBe(fontRules(p.document));
    expect(host.querySelector('style')).toBeNull();
    expect(host.querySelectorAll('script')).toHaveLength(0);
  });
});
