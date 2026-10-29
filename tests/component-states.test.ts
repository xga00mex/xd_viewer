// @vitest-environment happy-dom
import { it, expect, vi, afterEach } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseXd } from '../src/parser/design';
import { createProject } from '../src/core/model';
import { parseProject, serializeProject } from '../src/core/project';
import { exportWeb } from '../src/export/web';
import { interactionRuntime } from '../src/export/runtime';
import { safeId } from '../src/core/escape';

const rect = (id: string, color: number) => ({
  type: 'shape',
  id,
  shape: { type: 'rect', width: 40, height: 40 },
  style: { fill: { type: 'solid', color: { value: { r: color, g: 0, b: 0 } } } },
});
function toggleDocument() {
  return parseXd(
    zipSync({
      'artwork/a.agc': strToU8(
        JSON.stringify({
          artboards: { b: { width: 100, height: 100 } },
          children: [
            {
              type: 'artboard',
              id: 'b',
              artboard: {
                ref: 'b',
                children: [
                  {
                    type: 'group',
                    id: 'ad',
                    meta: {
                      ux: {
                        fixed: true,
                        stateId: 'default',
                        interactions: [
                          { enabled: true, valid: true, guid: 'toggle-link', inherited: true },
                        ],
                        states: [
                          {
                            type: 'group',
                            id: 'closed-instance',
                            meta: { ux: { stateId: 'closed' } },
                            group: { children: [rect('closed-shape', 50)] },
                          },
                        ],
                      },
                    },
                    group: { children: [rect('open-shape', 255)] },
                  },
                ],
              },
            },
          ],
        })
      ),
      'interactions/interactions.json': strToU8(
        JSON.stringify({
          interactions: {
            ad: [
              {
                id: 'toggle-link',
                triggerEvent: 'tap',
                action: 'state-transition',
                properties: { destination: 'closed' },
              },
            ],
          },
        })
      ),
    })
  );
}
afterEach(() => vi.unstubAllGlobals());
it('imports and round-trips a two-state advertisement without losing fixed stacking', () => {
  const doc = toggleDocument(),
    n = doc.artboards[0].children[0];
  expect(n).toMatchObject({
    fixed: true,
    component: { defaultState: 'default', states: [{ id: 'closed' }] },
  });
  expect(parseProject(serializeProject(createProject(doc))).document).toEqual(doc);
});
it('switches the saved toggle state and returns on the next tap or keyboard activation', () => {
  const bundle = exportWeb(createProject(toggleDocument()), {
    responsive: false,
    breakpoint: 768,
    scaleArtboard: false,
  });
  document.body.innerHTML = String(bundle.files['index.html']).match(
    /<body>([\s\S]*?)<\/body>/
  )![1];
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  interactionRuntime();
  const ad = document.getElementById(safeId('ad'))!;
  expect(ad.querySelectorAll('[data-xd-state]')).toHaveLength(2);
  ad.click();
  expect(ad.querySelector<HTMLElement>('[data-xd-state="closed"]')!.hidden).toBe(false);
  ad.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(ad.querySelector<HTMLElement>('[data-xd-state="closed"]')!.hidden).toBe(true);
});
