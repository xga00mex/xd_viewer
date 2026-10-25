import type { Project } from '../core/model';
import { escapeHtml as esc } from '../core/escape';
import { exportWeb } from './web';
import { viewerPageBridge, viewerRuntime } from './viewer-runtime';

const viewerCss = `*{box-sizing:border-box}body{margin:0;background:#17191e;color:#e3e5e9;font:13px "Segoe UI","Microsoft JhengHei",sans-serif;height:100dvh;display:grid;grid-template-rows:60px 1fr 44px}button,select{font:inherit;color:inherit;background:#292d35;border:1px solid #414752;border-radius:6px;padding:7px 12px;cursor:pointer}button:hover,button[aria-pressed=true]{background:#434b5d}button:disabled{opacity:.35;cursor:default}button:focus-visible,select:focus-visible{outline:2px solid #ebaf87;outline-offset:2px}header{display:flex;align-items:center;gap:16px;padding:0 22px;border-bottom:1px solid #353a44;background:#20232b}header strong{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:32vw}header small{font-size:10px;color:#929baa}.spacer{flex:1}main{min-height:0;display:flex}#review-stage{flex:1;min-width:0;overflow:auto;padding:32px;display:flex;align-items:flex-start;background-image:radial-gradient(#39404c .6px,transparent .6px);background-size:20px 20px}#device{position:relative;flex:none;margin:auto;box-shadow:0 8px 48px #0007;background:white}iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;background:white}footer{display:flex;align-items:center;justify-content:center;gap:12px;border-top:1px solid #353a44;background:#20232b;font-size:11px}footer button{padding:3px 12px}#review-size{position:absolute;right:20px;color:#99a2af}aside{display:none;width:220px;flex:none;overflow:auto;border-right:1px solid #353a44;padding:18px 12px;background:#20232b}.show-boards aside{display:block}aside h2{font-size:11px;font-weight:400;color:#929baa;margin:0 8px 18px}aside button{width:100%;text-align:left;margin:0 0 8px;white-space:normal;line-height:1.5}aside button.active{border-color:#dda27b;background:#44382f;color:#ffd5b7}.notice{font-size:11px;color:#b0a48e;padding:8px 12px;line-height:1.6}#review-board{max-width:220px}@media(max-width:760px){header{padding:0 10px;gap:7px}header small,header strong{display:none}button,select{font-size:11px;padding:6px}#review-size{display:none}#review-stage{padding:20px}aside{width:170px}}`;
function asData(bytes: Uint8Array, mime: string) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${mime};base64,${btoa(binary)}`;
}
export function exportViewer(project: Project): string {
  // Review mode preserves the source geometry; code export remains independently responsive.
  const bundle = exportWeb(project, { responsive: false, breakpoint: 768, scaleArtboard: false });
  const assets: Record<string, string> = {};
  const mime: Record<string, string> = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    otf: 'font/otf',
  };
  for (const [path, content] of Object.entries(bundle.files))
    if (path.startsWith('assets/'))
      assets[path] = asData(
        typeof content === 'string' ? new TextEncoder().encode(content) : content,
        mime[path.split('.').at(-1)!] ?? 'application/octet-stream'
      );
  const inlineAssets = (value: string) =>
    value.replace(/assets\/[a-zA-Z0-9.-]+/g, (path) => assets[path] ?? path);
  const css =
    inlineAssets(String(bundle.files['styles.css'])).replace(/</g, '\\3c ') +
    '\n.xd-hotspots [data-action]{outline:2px solid #8a7bff!important;outline-offset:2px;background-color:#8a7bff20!important}';
  const bridge = `(${viewerPageBridge.toString()})();`;
  const runtime = String(bundle.files['interactions.js']);
  const boards = project.document.artboards.map((board) => {
    const page = bundle.pages[board.id];
    const html = inlineAssets(String(bundle.files[page]))
      .replace('<link rel="stylesheet" href="styles.css" />', `<style>${css}</style>`)
      .replace('<script src="interactions.js" defer></script>', `<script>${bridge}</script>`)
      .replace('</body>', `<script>${runtime}</script></body>`);
    return {
      id: board.id,
      name: board.name,
      width: board.bounds.width,
      height: board.bounds.height,
      viewportHeight: board.viewportHeight ?? board.bounds.height,
      page,
      html,
    };
  });
  const data = JSON.stringify({ name: project.document.name, boards })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const warnings = [
    ...new Set([...project.document.diagnostics.map((d) => d.message), ...bundle.warnings]),
  ];
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'self' about:; connect-src 'none'; base-uri 'none'; object-src 'none'"><title>${esc(project.document.name)} · XD Local 檢視</title><style>${viewerCss}</style></head><body><header><button id="boards-toggle" aria-label="顯示或隱藏畫板">☷ 畫板</button><strong>${esc(project.document.name)}</strong><small>XD LOCAL · DESIGN REVIEW</small><span class="spacer"></span><select id="review-board" aria-label="畫板">${boards.map((b, i) => `<option value="${i}">${esc(b.name)}</option>`).join('')}</select><select id="review-zoom" aria-label="縮放"><option value="fit">符合視窗</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select><button id="hotspots" aria-pressed="false">熱區</button><button id="fullscreen">全螢幕</button></header><main><aside><h2>所有畫板 · ${boards.length}</h2>${boards.map((b, i) => `<button data-board="${i}">${i + 1}. ${esc(b.name)}</button>`).join('')}${warnings.length ? `<details class="notice"><summary>相容性提醒 (${warnings.length})</summary>${warnings.map((w) => `<p>${esc(w)}</p>`).join('')}</details>` : ''}</aside><div id="review-stage"><div id="device"><iframe id="prototype" title="設計原型" sandbox="allow-scripts"></iframe></div></div></main><footer><button id="restart" title="回到起始畫板">⌂</button><button id="back">返回</button><button id="previous" aria-label="上一個畫板">‹</button><span id="review-count"></span><button id="next" aria-label="下一個畫板">›</button><button id="replay">重新播放</button><span id="review-size"></span></footer><script id="viewer-data" type="application/json">${data}</script><script>(${viewerRuntime.toString()})();</script></body></html>`;
}
