// @vitest-environment happy-dom
import { it, expect } from 'vitest';
import { demoProject } from '../src/demo';
import { exportOverview, overviewBundle } from '../src/export/overview';
import { createPreview } from '../src/export/web';
import { safeId } from '../src/core/escape';

it('shows all full-height artboards together and makes cross-board links scroll locally', () => {
  const p = demoProject(),
    second = structuredClone(p.document.artboards[0]);
  second.id = 'board-two';
  second.name = '第二畫板';
  second.children = [];
  p.document.artboards.push(second);
  p.interactions['hero-button'] = { click: { action: 'navigate', target: second.id } };
  const bundle = overviewBundle(p),
    html = exportOverview(p);
  document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)![1];
  expect(document.querySelectorAll('.overview-card')).toHaveLength(2);
  expect(document.querySelectorAll('[data-scale-width]')).toHaveLength(2);
  expect(document.querySelector('[data-scale-height]')?.getAttribute('data-scale-height')).toBe(
    '1032'
  );
  expect(document.getElementById(safeId('hero-button'))?.dataset.action).toBe('scroll');
  expect(html.includes('data:font/woff2;base64,')).toBe(true);
  expect(/(?:src|href)="(?:assets\/|styles.css|interactions.js)/.test(html)).toBe(false);
  expect(createPreview(bundle, 'overview').html.includes('第二畫板')).toBe(true);
});
