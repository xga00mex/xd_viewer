// Execute our production bundle in an in-memory DOM, never a browser or UI driver.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

const window = new Window({
  url: 'http://127.0.0.1:4173',
  settings: { handleDisabledFileLoadingAsSuccess: true },
});
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
  // iframe resources remain disabled. We inspect the generated artifacts directly.
  const originalError = console.error;
  console.error = (...args) => {
    if (!String(args[0]).includes('Iframe page loading is disabled')) originalError(...args);
  };
  root.querySelector('[data-action="preview"]').click();
  console.error = originalError;
  const runtime = blobs.find((blob) => blob.type === 'text/javascript');
  assert(runtime, 'Preview generated a standalone runtime');
  const source = await runtime.text();
  const sandbox = new Window();
  sandbox.document.body.innerHTML =
    '<button id="trigger" data-action="toggle" data-target="panel"></button><section id="panel" hidden></section>';
  runInNewContext(source, { window: sandbox, document: sandbox.document });
  sandbox.document.getElementById('trigger').click();
  assert.equal(
    sandbox.document.getElementById('panel').hidden,
    false,
    'Minified runtime retains all dependencies'
  );
  assert(
    blobs.some((blob) => blob.type === 'text/html'),
    'Preview generated HTML'
  );
  console.log(
    'Production smoke passed: startup, SVG scene, inspector, preview artifacts, bundled click runtime.'
  );
  await window.happyDOM.abort();
  await sandbox.happyDOM.abort();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
