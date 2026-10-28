import type { Project } from '../core/model';
import { escapeHtml as esc } from '../core/escape';
import { exportWeb, inlineWebPage, type WebBundle } from './web';

export function overviewBundle(project: Project): WebBundle {
  const bundle = exportWeb(project, { responsive: false, breakpoint: 768, scaleArtboard: true });
  const cards = project.document.artboards
    .map((board) => {
      const body = String(bundle.files[bundle.pages[board.id]])
        .match(/<body>([\s\S]*?)<\/body>/)![1]
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
        .replaceAll('data-action="navigate"', 'data-action="scroll"');
      return `<article class="overview-card"><h2>${esc(board.name)} <small>${board.bounds.width} × ${board.bounds.height}</small></h2>${body}</article>`;
    })
    .join('');
  bundle.files['styles.css'] +=
    `\nbody{padding:24px;background:#17191e;color:#e3e5e9;font:14px sans-serif}.overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;align-items:start}.overview-card{min-width:0;overflow:hidden;background:white;border-radius:8px;color:#16191d}.overview-card h2{margin:0;padding:12px;background:#292d35;color:white;font-size:13px}.overview-card small{display:block;font-weight:normal;color:#c4c9d2;margin-top:4px}.overview-card .board-shell{width:100%;overflow:hidden}.overview-card [data-xd-fixed]{position:absolute!important}h1{font-size:20px}`;
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.document.name)} · 全畫板單頁預覽</title><link rel="stylesheet" href="styles.css" /></head><body><h1>${esc(project.document.name)} · ${project.document.artboards.length} 個畫板</h1><div class="overview-grid">${cards}</div><script src="interactions.js" defer></script></body></html>`;
  return {
    ...bundle,
    pages: { overview: 'overview.html' },
    files: { ...bundle.files, 'overview.html': html },
  };
}
export function exportOverview(project: Project): string {
  const bundle = overviewBundle(project);
  return inlineWebPage(bundle, 'overview.html').replace(
    '<head>',
    `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; object-src 'none'">`
  );
}
