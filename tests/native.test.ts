// @vitest-environment happy-dom
import { afterEach, it, expect, vi } from 'vitest';
import { download } from '../src/export/assets';
import { saveLocal, restoreLocal } from '../src/core/project';
import { demoProject } from '../src/demo';
import type { DesktopBridge } from '../src/platform/desktop';
afterEach(() => {
  delete window.xdDesktop;
});
it('uses native save dialogs and native workspace storage, including cancel', async () => {
  let saved = '';
  const bridge: DesktopBridge = {
    openFile: vi.fn(async () => null),
    startupFile: vi.fn(async () => null),
    saveFile: vi.fn(async () => false),
    readWorkspace: async () => saved,
    writeWorkspace: async (json) => {
      saved = json;
    },
    finishClose: vi.fn(async () => {}),
    onMenu: () => () => {},
  };
  window.xdDesktop = bridge;
  expect(await download('test', 'test.html', 'text/html')).toBe(false);
  expect(bridge.saveFile).toHaveBeenCalledWith('test.html', expect.any(ArrayBuffer));
  const p = demoProject();
  await saveLocal(p);
  expect((await restoreLocal())?.document.name).toBe(p.document.name);
});
