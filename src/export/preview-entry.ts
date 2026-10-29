import { interactionRuntime } from './runtime';

// Built as a separate, trusted script. Sandboxed preview pages can load it from
// the application without depending on Blob subresources or inline script CSP.
function navigate(event: Event) {
  const target = (event.target as Element).closest<HTMLElement>('[data-action="navigate"]');
  if (!target || (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key))) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  parent.postMessage({ type: 'xv-preview-navigate', page: target.dataset.page }, '*');
}
document.addEventListener('click', navigate, true);
document.addEventListener('keydown', navigate, true);
const report = (type: string, message?: string) =>
  parent.postMessage(
    {
      type,
      id: document.documentElement.dataset.previewId,
      message,
    },
    '*'
  );
try {
  interactionRuntime();
  report('xv-preview-ready');
} catch (error) {
  report('xv-preview-error', error instanceof Error ? error.message : String(error));
}
