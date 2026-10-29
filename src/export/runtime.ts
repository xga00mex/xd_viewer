/** Standalone browser runtime. Keep all dependencies inside this function so the
 * exact same implementation can run in a sandbox preview and exported files. */
export function interactionRuntime() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activate = (trigger: HTMLElement) => {
    if (trigger.dataset.xdStateTarget && !trigger.dataset.action) {
      const component = trigger.closest<HTMLElement>('[data-xd-component]');
      if (!component) return;
      const states = Array.from(component.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement && c.dataset.xdState !== undefined
      );
      const target = states.find((s) => s.dataset.xdState === trigger.dataset.xdStateTarget);
      if (!target) return;
      const next = target.hidden ? target.dataset.xdState : component.dataset.xdComponent;
      states.forEach((s) => (s.hidden = s.dataset.xdState !== next));
      trigger.setAttribute('aria-expanded', String(next !== component.dataset.xdComponent));
      return;
    }
    const target = document.getElementById(trigger.dataset.target ?? '');
    const action = trigger.dataset.action;
    if (action === 'navigate') {
      if (trigger.dataset.page) window.location.href = trigger.dataset.page;
      return;
    }
    if (!target) return;
    if (action === 'toggle') {
      target.hidden = !target.hidden;
      document.querySelectorAll<HTMLElement>('[data-action="toggle"]').forEach((control) => {
        if (control.dataset.target === target.id)
          control.setAttribute('aria-expanded', String(!target.hidden));
      });
    }
    if (action === 'scroll')
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  const selector = '[data-action],[data-xd-state-target]';
  document.querySelectorAll<HTMLElement>(selector).forEach((trigger) => {
    const target = document.getElementById(trigger.dataset.target ?? '');
    if (trigger.dataset.action === 'toggle' && target)
      trigger.setAttribute('aria-expanded', String(!target.hidden));
  });
  document.onclick = (event) => {
    const trigger = (event.target as Element).closest<HTMLElement>(selector);
    if (trigger) activate(trigger);
  };
  document.onkeydown = (event) => {
    const trigger = (event.target as Element).closest<HTMLElement>(selector);
    if (
      trigger &&
      trigger.tagName !== 'BUTTON' &&
      !event.repeat &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      activate(trigger);
    }
  };
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
      const available = element.parentElement!.clientWidth;
      // A hidden/unlaid-out iframe must not erase the design with scale(0).
      if (available <= 0 || width <= 0) return;
      const ratio = Math.min(1, available / width);
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
  `/* XV: native interactions, no external runtime dependencies. */\n(${interactionRuntime.toString()})();\n`;
