/** Standalone browser runtime. Keep all dependencies inside this function so the
 * exact same implementation can run in a sandbox preview and exported files. */
export function interactionRuntime() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activate = (trigger: HTMLElement) => {
    const target = document.getElementById(trigger.dataset.target ?? '');
    const action = trigger.dataset.action;
    if (action === 'navigate') {
      if (trigger.dataset.page) window.location.href = trigger.dataset.page;
      return;
    }
    if (!target) return;
    if (action === 'toggle') {
      target.hidden = !target.hidden;
      trigger.setAttribute('aria-expanded', String(!target.hidden));
    }
    if (action === 'scroll')
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  document.querySelectorAll<HTMLElement>('[data-action]').forEach((trigger) => {
    const target = document.getElementById(trigger.dataset.target ?? '');
    if (trigger.dataset.action === 'toggle' && target)
      trigger.setAttribute('aria-expanded', String(!target.hidden));
    trigger.addEventListener('click', (event) => {
      if ((event.target as Element).closest('[data-action]') === trigger) activate(trigger);
    });
    if (trigger.tagName !== 'BUTTON')
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate(trigger);
        }
      });
  });
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
    if (reduced || !('IntersectionObserver' in window)) return;
    element.classList.add('reveal-pending');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.remove('reveal-pending');
          observer.disconnect();
        }
      },
      { threshold: Number(element.dataset.threshold ?? 0.15) }
    );
    observer.observe(element);
  });
  // Fluid scaling keeps the source geometry and computes only the outer height.
  document.querySelectorAll<HTMLElement>('[data-scale-width]').forEach((element) => {
    const update = () => {
      const width = Number(element.dataset.scaleWidth),
        height = Number(element.dataset.scaleHeight);
      const ratio = Math.min(1, element.parentElement!.clientWidth / width);
      element.style.transform = `scale(${ratio})`;
      element.parentElement!.style.height = `${height * ratio}px`;
    };
    update();
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver(update).observe(element.parentElement!);
    else window.addEventListener('resize', update);
  });
}
export const runtimeSource = () =>
  `/* XD Local: native interactions, no external runtime dependencies. */\n(${interactionRuntime.toString()})();\n`;
