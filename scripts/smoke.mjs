// Execute our production bundle in an in-memory DOM, never a browser or UI driver.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { Window } from 'happy-dom';

const window = new Window({
  url: 'http://127.0.0.1:4173',
  settings: { handleDisabledFileLoadingAsSuccess: true },
});
const releaseDirectory = path.resolve(process.env.XV_RELEASE_DIR || 'release');
window.document.body.innerHTML = '<div id="app"></div>';
for (const key of [
  'window',
  'document',
  'navigator',
  'MutationObserver',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLIFrameElement',
  'HTMLDialogElement',
  'KeyboardEvent',
  'Event',
  'MouseEvent',
  'Image',
  'AbortController',
]) {
  Object.defineProperty(globalThis, key, {
    value: key === 'window' ? window : window[key],
    configurable: true,
  });
}
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => {
  throw new Error('Production smoke test detected an unexpected network request');
};
const blobs = [];
URL.createObjectURL = (blob) => {
  blobs.push(blob);
  return 'blob:local-smoke/' + blobs.length;
};
URL.revokeObjectURL = () => {};
let completeSave;
let completeClose;
let menuAction;
let workspaceSaved = '';
const saveResult = new Promise((resolve) => {
  completeSave = resolve;
});
const closeResult = new Promise((resolve) => {
  completeClose = resolve;
});
window.xdDesktop = {
  openFile: async () => null,
  startupFile: async () => null,
  readWorkspace: async () => null,
  saveFile: async (name, bytes) => {
    completeSave({ name, bytes });
    return true;
  },
  writeWorkspace: async (json) => {
    workspaceSaved = json;
  },
  finishClose: async () => {
    completeClose();
  },
  onMenu: (listener) => {
    menuAction = listener;
    return () => {};
  },
};

try {
  const index = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const entry = index.match(/<script[^>]+src="([^"]+)"/)?.[1];
  assert(entry, 'Built entry script exists');
  await import(pathToFileURL(fileURLToPath(new URL('../dist' + entry, import.meta.url))).href);
  const root = window.document.getElementById('app');
  assert(root.querySelector('#design-stage svg'), 'Production bundle renders the demo SVG');
  root.querySelector('[data-layer="hero-button"]').click();
  root.querySelector('[data-action="interact"]').click();
  assert(
    root.querySelector('[data-field="hover.duration"]'),
    'Production inspector is interactive'
  );
  root.querySelector('[data-action="overview"]').click();
  assert(
    root.querySelector('#overview-boards svg[role="img"]'),
    'Production overview displays artboard artwork directly'
  );
  assert(
    root.querySelector('#preview-stage iframe').hidden,
    'Overview does not depend on iframe navigation'
  );
  // iframe resources remain disabled. We inspect the generated artifacts directly.
  const originalError = console.error;
  console.error = (...args) => {
    if (!String(args[0]).includes('Iframe page loading is disabled')) originalError(...args);
  };
  root.querySelector('[data-action="preview"]').click();
  console.error = originalError;
  const previewFrame = root.querySelector('#preview-stage iframe');
  assert(!previewFrame.hasAttribute('srcdoc'), 'Empty srcdoc cannot override the preview URL');
  const previewIndex = Number(previewFrame.src.split('/').at(-1)) - 1;
  const preview = await blobs[previewIndex].text();
  assert(preview.includes('<style>'), 'Preview embeds its CSS');
  assert(!/(?:src|href)="blob:/.test(preview), 'Opaque preview does not fetch Blob subresources');
  const scriptUrl = preview.match(/<script src="([^"]+)" defer>/)?.[1];
  assert(scriptUrl, 'Preview references the packaged runtime');
  const source = await readFile(
    new URL('../dist' + new URL(scriptUrl).pathname, import.meta.url),
    'utf8'
  );
  const sandbox = new Window();
  sandbox.document.body.innerHTML =
    '<button id="trigger" data-action="toggle" data-target="panel"></button><section id="panel" hidden></section><div id="state-trigger" data-xd-component="open" data-xd-state-target="closed"><div data-xd-state="open"></div><div id="closed-state" data-xd-state="closed" hidden></div></div>';
  runInNewContext(source, {
    window: sandbox,
    document: sandbox.document,
    KeyboardEvent: sandbox.KeyboardEvent,
    HTMLElement: sandbox.HTMLElement,
    parent: sandbox,
  });
  sandbox.document.getElementById('trigger').click();
  assert.equal(
    sandbox.document.getElementById('panel').hidden,
    false,
    'Minified runtime retains all dependencies'
  );
  sandbox.document.getElementById('state-trigger').click();
  assert.equal(
    sandbox.document.getElementById('closed-state').hidden,
    false,
    'Built runtime switches saved XD states'
  );
  assert(preview.includes('<main'), 'Preview contains the actual design');
  root.querySelector('[data-action="export"]').click();
  root.querySelector('[data-action="download-export"]').click();
  const saved = await saveResult;
  assert(saved.name.endsWith('.html'), 'Default export is a single review HTML');
  const html = new TextDecoder().decode(saved.bytes);
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(path.join(releaseDirectory, 'Demo-Review.html'), html);
  const review = new Window();
  review.document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
  const reviewScript = [...review.document.scripts].find(
    (script) => script.type !== 'application/json'
  );
  runInNewContext(reviewScript.textContent, { window: review, document: review.document });
  assert.equal(review.document.getElementById('review-count').textContent, '1 / 1');
  assert.equal(review.document.getElementById('prototype').style.height, '900px');
  const reviewData = JSON.parse(review.document.getElementById('viewer-data').textContent);
  const pageScript = [...reviewData.boards[0].html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const page = new Window();
  let navigation;
  page.document.body.innerHTML =
    '<button data-action="navigate" data-page="page-next.html">Next</button>';
  runInNewContext(pageScript, {
    window: page,
    document: page.document,
    KeyboardEvent: page.KeyboardEvent,
    parent: {
      postMessage: (message) => {
        navigation = message;
      },
    },
  });
  page.document.querySelector('button').click();
  assert.equal(navigation.page, 'page-next.html', 'Minified review bridge is self-contained');
  const overviewResult = new Promise((resolve) => {
    completeSave = resolve;
  });
  root.querySelector('[data-action="export"]').click();
  const exportMode = root.querySelector('[data-field="export.mode"]');
  exportMode.value = 'overview';
  exportMode.dispatchEvent(new window.Event('change', { bubbles: true }));
  root.querySelector('[data-action="download-export"]').click();
  const overview = new TextDecoder().decode((await overviewResult).bytes);
  assert(
    overview.includes('class="overview-card"'),
    'Built overview export contains the demo artboard'
  );
  assert(
    !/(?:src|href)="(?:assets\/|styles.css|interactions.js)/.test(overview),
    'Overview export is self-contained'
  );
  await writeFile(path.join(releaseDirectory, 'Demo-All-Artboards.html'), overview);
  // A settings edit immediately followed by closing must flush the debounce first.
  root.querySelector('[data-field="hover.duration"]').value = '320';
  root
    .querySelector('[data-field="hover.duration"]')
    .dispatchEvent(new window.Event('change', { bubbles: true }));
  menuAction('app-close');
  await closeResult;
  assert.equal(JSON.parse(workspaceSaved).interactions['hero-button'].hover.duration, 320);
  console.log(
    'Production smoke passed: startup, SVG scene, inspector, native save, close flush, preview, bundled runtime and standalone HTML review.'
  );
  await window.happyDOM.abort();
  await sandbox.happyDOM.abort();
  await review.happyDOM.abort();
  await page.happyDOM.abort();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
