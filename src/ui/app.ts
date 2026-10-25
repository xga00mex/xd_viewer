import type { DesignNode, Interaction, Layout, Project } from '../core/model';
import { defaultLayout, findNode, flatten, createProject } from '../core/model';
import { escapeHtml as esc, filename } from '../core/escape';
import { round, worldBounds, measure } from '../core/geometry';
import { History } from '../core/history';
import { parseProject, serializeProject, restoreLocal, saveLocal } from '../core/project';
import { importXd } from '../parser/import';
import { inspectCss, paintCss } from '../export/css';
import { download, exportAssets, type AssetOptions } from '../export/assets';
import {
  createPreview,
  defaultWebOptions,
  exportWeb,
  webZip,
  type WebOptions,
  type WebBundle,
} from '../export/web';
import { renderBoard } from '../render/svg';
import { demoProject } from '../demo';
import { icon } from './icons';

const kindLabel: Record<string, string> = {
  artboard: '畫板',
  group: '群組',
  rect: '矩形',
  ellipse: '橢圓',
  text: '文字',
  path: '路徑',
  line: '線段',
  unsupported: '未支援',
};
const kindIcon = (n: DesignNode) =>
  n.style.fill.type === 'image'
    ? 'image'
    : {
        artboard: 'board',
        group: 'folder',
        rect: 'rect',
        ellipse: 'circle',
        text: 'text',
        path: 'path',
        line: 'path',
        unsupported: 'rect',
      }[n.kind];
const button = (action: string, label: string, iconName?: string, cls = '', attrs = '') =>
  `<button type="button" data-action="${action}" class="${cls}" ${attrs}>${iconName ? icon(iconName) : ''}${label}</button>`;
const select = (key: string, label: string, value: string, options: [string, string][]) =>
  `<label class="field">${label}<select data-field="${key}">${options.map(([id, title]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;
const numeric = (key: string, label: string, value: number, min = 0, max = 30000, step = 1) =>
  `<label class="field">${label}<span class="number-input"><input data-field="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" /><span>${key.includes('duration') ? 'ms' : key === 'scroll.threshold' ? '比例' : 'px'}</span></span></label>`;

export class Studio {
  project: Project;
  selected = new Set<string>();
  boardId: string;
  private tab: 'inspect' | 'interact' | 'layout' = 'inspect';
  private sidebarTab: 'layers' | 'assets' = 'layers';
  private mode: 'design' | 'preview' = 'design';
  private zoom = 0.6;
  private collapsed = new Set<string>();
  private search = '';
  private history = new History();
  private preview?: ReturnType<typeof createPreview>;
  private bundle?: WebBundle;
  private viewportWidth = 1200;
  private webOptions: WebOptions = defaultWebOptions();
  private saveTimer?: ReturnType<typeof setTimeout>;
  private previewTimer?: ReturnType<typeof setTimeout>;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private saveRevision = 0;
  private busy = false;
  private space = false;
  private pan?: { x: number; y: number; left: number; top: number };
  private exportTab: 'web' | 'assets' = 'web';
  private assetOptions: AssetOptions = { format: 'svg', scale: 1, removeRadius: false };
  private abort = new AbortController();
  constructor(
    private root: HTMLElement,
    project = demoProject()
  ) {
    this.project = project;
    this.boardId = project.document.artboards[0].id;
    this.viewportWidth = this.board.bounds.width;
    this.selected.add(project.document.artboards[0].children[1]?.children[0]?.id ?? this.boardId);
    this.shell();
    this.bind();
    this.renderAll();
    requestAnimationFrame(() => this.fit());
  }
  get board() {
    return this.project.document.artboards.find((b) => b.id === this.boardId)!;
  }
  get current() {
    return findNode(this.project, [...this.selected].at(-1) ?? '');
  }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }
  async restore() {
    const version = this.generation;
    try {
      const saved = await restoreLocal();
      if (saved && this.generation === version) {
        this.setProject(saved, false);
        this.toast('已還原上次的本機工作檔');
      }
    } catch {
      this.el('#save-state').textContent = '自動儲存不可用';
      this.toast('無法還原本機快取；可使用「開啟」讀取工作檔。');
    }
  }
  private shell() {
    this.root.innerHTML = `<header class="topbar"><div class="brand"><span class="brand-mark">xd<span>↗</span></span><div>XD Local<small>本機切版工作台</small></div></div><div class="document-name"><span id="doc-title"></span><span class="file-tag" id="source-tag"></span></div><div class="top-actions"><span class="save-state" id="save-state">完全本機運作</span>${button('help', '', 'info', 'icon-button', 'aria-label="使用說明" title="使用說明"')}${button('open', '開啟檔案', 'import', 'secondary')}${button('save', '儲存工作檔', 'save', 'secondary')}${button('export', '匯出', 'export', 'primary')}</div></header>
      <div class="workspace"><aside class="left-panel panel"><div class="panel-tabs"><button data-action="layers" class="active">${icon('layers')}圖層</button><button data-action="assets">${icon('image')}素材</button></div><div class="board-control"><label for="boards">畫板</label><select id="boards" aria-label="切換畫板"></select></div><div class="search-box">${icon('search')}<input id="layer-search" placeholder="搜尋圖層…" aria-label="搜尋圖層"/><kbd>⌕</kbd></div><div class="layer-meta"><span id="layer-count"></span>${button('select-all', '全選', undefined, 'text-button')}</div><nav id="layer-tree" aria-label="圖層樹"></nav><div class="left-footer"><span class="local-dot"></span><span>檔案留在這台電腦</span>${button('diagnostics', '', 'info', 'icon-button', 'aria-label="匯入相容性報告"')}</div></aside>
      <main class="center-panel"><div class="canvas-toolbar"><div class="mode-switch">${button('design', '檢視', 'cursor', 'active')}${button('preview', '互動預覽', 'play')}</div><div class="toolbar-spacer"></div><div id="preview-tools" hidden><select id="viewport-width" aria-label="預覽裝置寬度"><option value="375">手機 · 375</option><option value="768">平板 · 768</option><option value="1200">桌面 · 1200</option><option value="original">原始尺寸</option></select>${button('refresh-preview', '重播', undefined, 'text-button')}</div><div id="zoom-tools">${button('zoom-out', '−', undefined, 'icon-button', 'aria-label="縮小"')}<button data-action="zoom-reset" id="zoom-label">60%</button>${button('zoom-in', '+', undefined, 'icon-button', 'aria-label="放大"')}${button('fit', '', 'fit', 'icon-button', 'aria-label="符合視窗" title="符合視窗 (F)"')}</div></div>
      <div class="canvas-viewport" id="canvas-viewport"><div class="canvas-paper" id="canvas-paper"><div id="board-caption"></div><div id="design-stage"></div><svg id="selection-overlay" xmlns="http://www.w3.org/2000/svg"></svg></div></div><div id="preview-stage" hidden><iframe title="本機互動預覽" sandbox="allow-scripts" srcdoc=""></iframe></div><div class="canvas-bottom"><span id="canvas-status">Ctrl／⌘ 多選 · Alt 測距 · 空白鍵拖曳</span><div>${button('undo', '', 'undo', 'icon-button', 'aria-label="復原" title="Ctrl+Z"')}${button('redo', '', 'redo', 'icon-button', 'aria-label="重做" title="Ctrl+Shift+Z"')}<span class="divider"></span><span id="dimensions"></span></div></div></main>
      <aside class="right-panel panel"><div class="panel-tabs inspector-tabs"><button data-action="inspect" class="active">屬性</button><button data-action="interact">互動</button><button data-action="layout">排版</button></div><div id="inspector"></div></aside></div>
      <footer class="statusbar"><span>LOCAL FIRST <span class="status-separator">/</span> 無需 Adobe XD</span><button id="diagnostic-button" data-action="diagnostics"></button><span>v0.1.0 · TypeScript</span></footer>
      <input type="file" id="file-input" accept=".xd,.xdlocal,.json" hidden /><div id="toast" role="status" aria-live="polite" hidden></div><div id="drop-overlay" hidden>${icon('import', 48)}<strong>放開以匯入設計稿</strong><span>.xd 或 .xdlocal 工作檔</span></div><div id="busy-overlay" hidden><span class="spinner"></span><strong id="busy-label">正在解析設計稿…</strong><span>所有處理都在本機進行</span></div><dialog id="modal"></dialog>`;
  }
  private bind() {
    const signal = this.abort.signal;
    this.root.addEventListener(
      'click',
      (event) => {
        const target = event.target as Element;
        const action = target.closest<HTMLElement>('[data-action]');
        if (action) {
          void this.action(action.dataset.action!, action);
          return;
        }
        const row = target.closest<HTMLElement>('[data-layer]');
        if (row) {
          this.select(row.dataset.layer!, event.ctrlKey || event.metaKey || event.shiftKey);
          return;
        }
        const node = target.closest<SVGElement>('[data-node-id]');
        if (node && !this.space && !this.pan) {
          this.select(node.dataset.nodeId!, event.ctrlKey || event.metaKey || event.shiftKey);
          return;
        }
        if (target.id === 'canvas-viewport') {
          this.selected.clear();
          this.renderSelection();
          this.renderInspector();
          this.renderTree();
        }
      },
      { signal }
    );
    this.el<HTMLInputElement>('#file-input').addEventListener(
      'change',
      (event) => {
        const input = event.target as HTMLInputElement;
        if (input.files?.[0]) void this.load(input.files[0]);
        input.value = '';
      },
      { signal }
    );
    this.el<HTMLInputElement>('#layer-search').addEventListener(
      'input',
      (event) => {
        this.search = (event.target as HTMLInputElement).value;
        this.renderTree();
      },
      { signal }
    );
    this.el<HTMLSelectElement>('#boards').addEventListener(
      'change',
      (event) => this.changeBoard((event.target as HTMLSelectElement).value),
      { signal }
    );
    this.el<HTMLSelectElement>('#viewport-width').addEventListener(
      'change',
      (event) => {
        const value = (event.target as HTMLSelectElement).value;
        this.viewportWidth = value === 'original' ? this.board.bounds.width : Number(value);
        this.resizePreview();
      },
      { signal }
    );
    this.root.addEventListener(
      'change',
      (event) => {
        const target = event.target as HTMLInputElement;
        if (target.dataset.field)
          this.changeField(target.dataset.field, target.value, target.checked);
      },
      { signal }
    );
    const viewport = this.el('#canvas-viewport');
    viewport.addEventListener(
      'wheel',
      (event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.setZoom(this.zoom * (event.deltaY < 0 ? 1.12 : 0.89));
        }
      },
      { passive: false, signal }
    );
    viewport.addEventListener(
      'pointerdown',
      (event) => {
        if (this.space || event.button === 1) {
          event.preventDefault();
          this.pan = {
            x: event.clientX,
            y: event.clientY,
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
          };
          viewport.setPointerCapture(event.pointerId);
          viewport.classList.add('panning');
        }
      },
      { signal }
    );
    viewport.addEventListener(
      'pointermove',
      (event) => {
        if (this.pan) {
          viewport.scrollLeft = this.pan.left - (event.clientX - this.pan.x);
          viewport.scrollTop = this.pan.top - (event.clientY - this.pan.y);
          return;
        }
        if (event.altKey) {
          const target = (event.target as Element).closest<SVGElement>('[data-node-id]');
          this.renderSelection(target?.dataset.nodeId ?? this.boardId);
        }
      },
      { signal }
    );
    viewport.addEventListener(
      'pointerup',
      () => {
        this.pan = undefined;
        viewport.classList.remove('panning');
      },
      { signal }
    );
    viewport.addEventListener('pointerleave', () => this.renderSelection(), { signal });
    window.addEventListener('keydown', (event) => this.keydown(event), { signal });
    window.addEventListener(
      'keyup',
      (event) => {
        if (event.code === 'Space') this.space = false;
        if (event.key === 'Alt') this.renderSelection();
      },
      { signal }
    );
    window.addEventListener(
      'blur',
      () => {
        this.space = false;
        this.pan = undefined;
      },
      { signal }
    );
    let dragDepth = 0;
    window.addEventListener(
      'dragenter',
      (event) => {
        if (event.dataTransfer?.types.includes('Files')) {
          event.preventDefault();
          dragDepth++;
          this.el('#drop-overlay').hidden = false;
        }
      },
      { signal }
    );
    window.addEventListener(
      'dragover',
      (event) => {
        if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
      },
      { signal }
    );
    window.addEventListener(
      'dragleave',
      () => {
        if (--dragDepth <= 0) this.el('#drop-overlay').hidden = true;
      },
      { signal }
    );
    window.addEventListener(
      'drop',
      (event) => {
        event.preventDefault();
        dragDepth = 0;
        this.el('#drop-overlay').hidden = true;
        const file = event.dataTransfer?.files[0];
        if (file) void this.load(file);
      },
      { signal }
    );
    window.addEventListener(
      'message',
      (event) => {
        if (
          event.source !== this.el<HTMLIFrameElement>('iframe').contentWindow ||
          event.data?.type !== 'xd-preview-navigate'
        )
          return;
        const entry = Object.entries(this.bundle?.pages ?? {}).find(
          ([, path]) => path === event.data.page
        );
        if (entry) this.changeBoard(entry[0]);
      },
      { signal }
    );
    window.addEventListener('resize', () => this.resizePreview(), { signal });
    this.el<HTMLDialogElement>('#modal').addEventListener(
      'click',
      (event) => {
        if (event.target === event.currentTarget) this.el<HTMLDialogElement>('#modal').close();
      },
      { signal }
    );
  }
  private keydown(event: KeyboardEvent) {
    if (this.el<HTMLDialogElement>('#modal').open) return;
    if ((event.target as Element)?.closest('input,textarea,select,[contenteditable]')) return;
    const mod = event.ctrlKey || event.metaKey;
    const layer = (event.target as Element)?.closest<HTMLElement>('[data-layer]');
    if (layer && (event.key === 'Enter' || event.code === 'Space')) {
      event.preventDefault();
      this.select(layer.dataset.layer!, mod || event.shiftKey);
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      this.space = true;
    } else if (mod && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      this.el<HTMLInputElement>('#file-input').click();
    } else if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.action('save');
    } else if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void this.action(event.shiftKey ? 'redo' : 'undo');
    } else if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      void this.action('select-all');
    } else if (event.key === 'Escape') {
      this.selected.clear();
      this.renderTree();
      this.renderInspector();
      this.renderSelection();
    } else if (event.key === '+' || event.key === '=') this.setZoom(this.zoom * 1.2);
    else if (event.key === '-') this.setZoom(this.zoom / 1.2);
    else if (event.key === '0') this.setZoom(1);
    else if (event.key.toLowerCase() === 'f') this.fit();
  }
  private async action(action: string, target?: HTMLElement) {
    try {
      if (action === 'open') this.el<HTMLInputElement>('#file-input').click();
      else if (action === 'save') {
        download(
          serializeProject(this.project),
          filename(this.project.document.name) + '.xdlocal',
          'application/json'
        );
        this.toast('已匯出工作檔，含原始圖層、素材及互動設定');
      } else if (action === 'demo') {
        this.el<HTMLDialogElement>('#modal').close();
        this.setProject(demoProject());
      } else if (action === 'layers' || action === 'assets') {
        this.sidebarTab = action;
        this.renderTree();
        this.root
          .querySelectorAll('.left-panel .panel-tabs button')
          .forEach((b) =>
            b.classList.toggle('active', (b as HTMLElement).dataset.action === action)
          );
      } else if (action === 'inspect' || action === 'interact' || action === 'layout') {
        this.tab = action;
        this.renderInspector();
      } else if (action === 'collapse') {
        const id = target!.dataset.id!;
        this.collapsed.has(id) ? this.collapsed.delete(id) : this.collapsed.add(id);
        this.renderTree();
      } else if (action === 'select-all') {
        this.selected = new Set(
          this.visibleNodes()
            .filter(
              (n) => n.kind !== 'artboard' && (this.sidebarTab === 'assets' || !n.children.length)
            )
            .map((n) => n.id)
        );
        this.renderTree();
        this.renderSelection();
        this.renderInspector();
      } else if (action === 'design' || action === 'preview') {
        this.mode = action;
        this.renderMode();
      } else if (action === 'zoom-in') this.setZoom(this.zoom * 1.2);
      else if (action === 'zoom-out') this.setZoom(this.zoom / 1.2);
      else if (action === 'zoom-reset') this.setZoom(1);
      else if (action === 'fit') this.fit();
      else if (action === 'copy-css' && this.current) {
        await navigator.clipboard.writeText(inspectCss(this.current));
        this.toast('CSS 已複製');
      } else if (action === 'copy-color' && target) {
        await navigator.clipboard.writeText(target.dataset.color!);
        this.toast('色碼已複製');
      } else if (action === 'undo' || action === 'redo') {
        this.history[action](this.project);
        this.afterEdit();
        this.renderInspector();
      } else if (action === 'remove-interactions' && this.current) {
        this.history.push(this.project);
        delete this.project.interactions[this.current.id];
        this.afterEdit();
        this.renderInspector();
      } else if (action === 'reset-layout' && this.current) {
        this.history.push(this.project);
        delete this.project.layouts[this.current.id];
        this.afterEdit();
        this.renderInspector();
      } else if (action === 'refresh-preview') this.renderPreview();
      else if (action === 'diagnostics') this.diagnostics();
      else if (action === 'help') this.help();
      else if (action === 'close') this.el<HTMLDialogElement>('#modal').close();
      else if (action === 'export' || action === 'export-assets') {
        this.exportTab = action === 'export' ? 'web' : 'assets';
        this.exportDialog();
      } else if (action === 'export-tab-web' || action === 'export-tab-assets') {
        this.exportTab = action === 'export-tab-web' ? 'web' : 'assets';
        this.exportDialog();
      } else if (action === 'download-export') await this.performExport();
    } catch (error) {
      this.toast(error instanceof Error ? error.message : String(error), true);
    }
  }
  private async load(file: File) {
    if (this.busy) return;
    this.setBusy(true, '正在解析 ' + file.name + '…');
    const version = ++this.generation;
    try {
      if (file.size > 128 * 1024 * 1024) throw new Error('檔案超過 128 MB 上限。');
      let project: Project;
      if (/\.xd$/i.test(file.name)) project = createProject(await importXd(file));
      else if (/\.(xdlocal|json)$/i.test(file.name)) project = parseProject(await file.text());
      else throw new Error('請選擇 .xd 或 .xdlocal 工作檔。');
      if (version !== this.generation) return;
      this.setProject(project);
      this.toast(
        `已匯入 ${project.document.artboards.length} 個畫板 · ${flatten(project.document.artboards).length - project.document.artboards.length} 個圖層`
      );
    } catch (error) {
      this.toast(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.setBusy(false);
    }
  }
  private setBusy(value: boolean, label = '') {
    this.busy = value;
    this.el('#busy-overlay').hidden = !value;
    this.el('#busy-label').textContent = label;
  }
  setProject(project: Project, save = true) {
    this.generation++;
    this.project = project;
    this.boardId = project.document.artboards[0].id;
    this.selected = new Set([this.boardId]);
    this.collapsed.clear();
    this.history.clear();
    this.search = '';
    this.el<HTMLInputElement>('#layer-search').value = '';
    this.viewportWidth = this.board.bounds.width;
    this.renderAll();
    this.fit();
    if (save) this.scheduleSave();
  }
  private changeBoard(id: string) {
    this.boardId = id;
    this.selected = new Set([id]);
    this.renderAll();
    this.fit();
  }
  select(id: string, multiple = false) {
    this.generation++;
    if (multiple) {
      this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
    } else this.selected = new Set([id]);
    this.renderTree();
    this.renderSelection();
    this.renderInspector();
  }
  private renderAll() {
    this.el('#doc-title').textContent = this.project.document.name;
    this.el('#source-tag').textContent =
      this.project.document.source === 'demo' ? '範例文件' : 'XD';
    this.el<HTMLSelectElement>('#boards').innerHTML = this.project.document.artboards
      .map(
        (b) =>
          `<option value="${esc(b.id)}" ${b.id === this.boardId ? 'selected' : ''}>${esc(b.name)}</option>`
      )
      .join('');
    this.el('#diagnostic-button').textContent = this.project.document.diagnostics.length
      ? `${this.project.document.diagnostics.length} 項相容性提醒`
      : '文件已就緒';
    this.el('#dimensions').textContent = `${this.board.bounds.width} × ${this.board.bounds.height}`;
    this.renderTree();
    this.renderCanvas();
    this.renderInspector();
    this.renderMode();
    this.updateHistory();
  }
  private visibleNodes() {
    const nodes = flatten([this.board]);
    return nodes.filter(
      (n) =>
        (this.sidebarTab === 'layers' || ['rect', 'ellipse', 'path'].includes(n.kind)) &&
        (!this.search || n.name.toLowerCase().includes(this.search.toLowerCase()))
    );
  }
  private renderTree() {
    const filtered = new Set(this.visibleNodes().map((n) => n.id));
    const render = (n: DesignNode, depth: number): string => {
      const matching = filtered.has(n.id),
        hasMatching = n.children.some((c) => flatten([c]).some((d) => filtered.has(d.id)));
      if (!matching && !hasMatching) return '';
      const expanded = !this.collapsed.has(n.id) || !!this.search;
      const row = `<div class="layer-row ${this.selected.has(n.id) ? 'selected' : ''} ${!n.visible ? 'muted-layer' : ''}" style="--depth:${depth}" data-layer="${esc(n.id)}" role="treeitem" aria-selected="${this.selected.has(n.id)}" ${n.children.length ? `aria-expanded="${expanded}"` : ''} tabindex="0" title="${esc(n.name)}">${n.children.length ? button('collapse', '', 'chevron', `tree-toggle ${expanded ? 'expanded' : ''}`, `data-id="${esc(n.id)}" aria-label="展開或收合 ${esc(n.name)}"`) : '<span class="tree-spacer"></span>'}${icon(kindIcon(n))}<span class="layer-name">${esc(n.name)}</span>${this.project.interactions[n.id] ? '<span class="interaction-dot" title="已設定互動"></span>' : ''}${this.selected.has(n.id) ? '<span class="selection-mark">✓</span>' : ''}</div>`;
      return (
        (matching ? row : '') +
        (expanded ? n.children.map((c) => render(c, depth + (matching ? 1 : 0))).join('') : '')
      );
    };
    this.el('#layer-count').textContent =
      this.sidebarTab === 'assets'
        ? `${filtered.size} 個可匯出素材`
        : `${flatten([this.board]).length - 1} 個圖層`;
    this.el('#layer-tree').innerHTML =
      `<div role="tree" aria-label="${this.sidebarTab === 'assets' ? '素材' : '圖層'}">${render(this.board, 0) || '<p class="empty-small">沒有符合的圖層</p>'}</div>`;
  }
  private renderCanvas() {
    this.el('#board-caption').textContent = this.board.name;
    this.el('#design-stage').innerHTML = renderBoard(this.project.document, this.board, {
      selection: true,
    });
    this.applyZoom();
  }
  private fit() {
    const el = this.el('#canvas-viewport');
    const width = el.clientWidth || 900,
      height = el.clientHeight || 680;
    this.setZoom(
      Math.min(
        (width - 112) / this.board.bounds.width,
        (height - 110) /
          Math.min(this.board.bounds.height, this.board.viewportHeight ?? this.board.bounds.height),
        1
      )
    );
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }
  private setZoom(value: number) {
    this.zoom = Math.max(0.05, Math.min(4, value));
    this.applyZoom();
  }
  private applyZoom() {
    const { width, height } = this.board.bounds;
    this.el('#canvas-paper').style.width = `${width * this.zoom}px`;
    this.el('#canvas-paper').style.height = `${height * this.zoom}px`;
    this.el('#design-stage').style.transform = `scale(${this.zoom})`;
    this.el('#zoom-label').textContent = `${Math.round(this.zoom * 100)}%`;
    this.renderSelection();
  }
  private renderSelection(hoverId?: string) {
    const { width, height } = this.board.bounds;
    const overlay = this.el('#selection-overlay');
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    overlay.setAttribute('width', String(width * this.zoom));
    overlay.setAttribute('height', String(height * this.zoom));
    const stroke = 1.5 / this.zoom,
      font = 11 / this.zoom;
    let content = [...this.selected]
      .map((id) => {
        const b = worldBounds(this.board, id);
        if (!b) return '';
        return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="#ee9b68" stroke-width="${stroke}"/>${[
          [b.x, b.y],
          [b.x + b.width, b.y],
          [b.x, b.y + b.height],
          [b.x + b.width, b.y + b.height],
        ]
          .map(
            ([x, y]) =>
              `<rect x="${x - 2.5 / this.zoom}" y="${y - 2.5 / this.zoom}" width="${5 / this.zoom}" height="${5 / this.zoom}" fill="#f9f4ec" stroke="#d8814c" stroke-width="${1 / this.zoom}"/>`
          )
          .join('')}`;
      })
      .join('');
    const ids = [...this.selected],
      other = hoverId && hoverId !== ids[0] ? hoverId : ids[1];
    const a = ids[0] ? worldBounds(this.board, ids[0]) : undefined,
      b = other ? worldBounds(this.board, other) : undefined;
    if (a && b) {
      const gap = measure(a, b),
        ax = a.x + a.width,
        ay = a.y + a.height;
      const hx =
        b.x >= ax
          ? [ax, b.x]
          : a.x >= b.x + b.width
            ? [b.x + b.width, a.x]
            : [Math.max(a.x, b.x), Math.max(a.x, b.x)];
      const vy =
        b.y >= ay
          ? [ay, b.y]
          : a.y >= b.y + b.height
            ? [b.y + b.height, a.y]
            : [Math.max(a.y, b.y), Math.max(a.y, b.y)];
      content += `<g stroke="#ef677d" stroke-width="${stroke}" fill="none"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" stroke-dasharray="${4 / this.zoom} ${4 / this.zoom}"/><path d="M${hx[0]} ${a.y + a.height / 2}H${hx[1]} M${a.x + a.width / 2} ${vy[0]}V${vy[1]}"/></g><g fill="#ef677d" font-size="${font}" font-family="Arial" text-anchor="middle"><text x="${(hx[0] + hx[1]) / 2}" y="${a.y + a.height / 2 - 6 / this.zoom}">${round(gap.horizontal)} px</text><text x="${a.x + a.width / 2 + 26 / this.zoom}" y="${(vy[0] + vy[1]) / 2}">${round(gap.vertical)} px</text></g>`;
      this.el('#canvas-status').textContent =
        `間距 ↔ ${round(gap.horizontal)} px   ↕ ${round(gap.vertical)} px  ·  位置差 ${round(gap.deltaX)}, ${round(gap.deltaY)}`;
    } else
      this.el('#canvas-status').textContent = this.selected.size
        ? `已選取 ${this.selected.size} 個圖層 · Ctrl／⌘ 多選 · Alt 測距`
        : 'Ctrl／⌘ 多選 · Alt 測距 · 空白鍵拖曳';
    overlay.innerHTML = content;
  }
  private renderInspector() {
    this.root
      .querySelectorAll('.inspector-tabs button')
      .forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.action === this.tab));
    const n = this.current;
    if (!n) {
      this.el('#inspector').innerHTML =
        `<div class="empty-inspector">${icon('cursor', 32)}<h3>選取一個圖層</h3><p>在預覽或左側圖層樹中選取，<br/>查看屬性、設定互動或匯出素材。</p></div>`;
      return;
    }
    const heading = `<div class="inspector-heading"><span class="node-icon">${icon(kindIcon(n), 20)}</span><div><h2>${esc(n.name)}</h2><span>${kindLabel[n.kind]}${this.selected.size > 1 ? ` · 共選取 ${this.selected.size} 個` : ''}</span></div></div>`;
    this.el('#inspector').innerHTML =
      heading +
      (this.tab === 'inspect'
        ? this.properties(n)
        : this.tab === 'interact'
          ? this.interactions(n)
          : this.layout(n));
  }
  private properties(n: DesignNode) {
    const b = worldBounds(this.board, n.id) ?? n.bounds,
      s = n.style,
      css = inspectCss(n),
      color =
        s.fill.type === 'solid'
          ? s.fill.color
          : s.fill.type === 'image'
            ? '圖片填色'
            : s.fill.type === 'none'
              ? '無填色'
              : '漸層填色';
    const position = `<section class="property-section"><h3>尺寸與位置 <small>畫板座標 · px</small></h3><div class="property-grid">${[
      ['X', b.x],
      ['Y', b.y],
      ['W', b.width],
      ['H', b.height],
    ]
      .map(
        ([label, value]) =>
          `<div class="property-value"><span>${label}</span><strong>${round(Number(value))}</strong></div>`
      )
      .join(
        ''
      )}</div>${n.text?.estimatedBounds ? '<p class="hint">文字框為估算值，保留 XD 原始基線；請先安裝對應字型。</p>' : ''}<div class="property-grid mini-grid"><div class="property-value"><span>透明度</span><strong>${Math.round(s.opacity * 100)}%</strong></div><div class="property-value"><span>圓角</span><strong>${n.radius ? n.radius.map(round).join(' / ') : '—'}</strong></div></div></section>`;
    const fill = `<section class="property-section"><h3>填色</h3><button class="color-row" data-action="copy-color" data-color="${esc(color)}"><span class="color-chip" style="background:${esc(paintCss(s.fill))}"></span><code>${esc(color)}</code>${icon('copy', 14)}</button>${s.stroke ? `<div class="detail-row"><span>描邊</span><code>${s.stroke.width} px · ${esc(s.stroke.color)}</code></div>` : ''}${s.shadows.map((sh) => `<div class="detail-row"><span>陰影</span><code>${sh.x} ${sh.y} ${sh.blur} · ${esc(sh.color)}</code></div>`).join('')}</section>`;
    const type = n.text
      ? `<section class="property-section"><h3>文字樣式</h3><p class="font-name">${esc(n.text.family)}</p><div class="property-grid"><div class="property-value"><span>字級</span><strong>${n.text.size}px</strong></div><div class="property-value"><span>字重</span><strong>${n.text.weight}</strong></div></div><div class="detail-row"><span>行高 / 字距</span><code>${round(n.text.lineHeight)} / ${round(n.text.spacing)} px</code></div><p class="text-content">${esc(n.text.value)}</p></section>`
      : '';
    return (
      position +
      fill +
      type +
      `<section class="property-section css-section"><h3>${icon('code')} CSS 屬性 ${button('copy-css', '複製', 'copy', 'text-button')}</h3><pre><code>${esc(css)}</code></pre><p class="hint">位置相對父圖層；上方尺寸為畫板上的外接框。圖片與向量請使用素材匯出。</p></section><section class="property-section"><h3>素材匯出</h3><p class="hint">PNG / SVG · 1×–3× · 可移除圓角<br/>${this.selected.size > 1 ? '多選圖層將打包為 ZIP' : '支援群組與畫板'}</p>${button('export-assets', `匯出${this.selected.size > 1 ? ' ' + this.selected.size + ' 個素材' : '此圖層'}`, 'export', 'secondary full-width')}</section>`
    );
  }
  private interactions(n: DesignNode) {
    const i = this.project.interactions[n.id] ?? {},
      targets = flatten([this.board]).map((n) => [n.id, n.name] as [string, string]);
    const enabled = (key: keyof Interaction, label: string, description: string, fields: string) =>
      `<section class="property-section"><label class="effect-toggle"><span><strong>${label}</strong><small>${description}</small></span><input type="checkbox" data-field="enable.${key}" ${i[key] ? 'checked' : ''} role="switch"/></label>${i[key] ? `<div class="effect-fields">${fields}</div>` : ''}</section>`;
    return (
      `<p class="panel-intro">設定後切換「互動預覽」立即體驗。匯出使用相同的原生 JS 與 CSS。</p>` +
      enabled(
        'click',
        'Click · 點擊',
        '切換顯示、捲動或切換畫板',
        select('click.action', '動作', i.click?.action ?? 'toggle', [
          ['toggle', '切換目標顯示'],
          ['scroll', '捲動至圖層'],
          ['navigate', '切換畫板'],
        ]) +
          select(
            'click.target',
            '目標圖層',
            i.click?.target ?? n.id,
            i.click?.action === 'navigate'
              ? this.project.document.artboards.map((b) => [b.id, b.name])
              : targets
          )
      ) +
      enabled(
        'hover',
        'Hover · 滑入',
        '滑鼠滑入與鍵盤聚焦效果',
        select('hover.effect', '效果', i.hover?.effect ?? 'lift', [
          ['lift', '向上浮動'],
          ['scale', '微幅放大'],
          ['fade', '降低透明度'],
        ]) + numeric('hover.duration', '過渡時間', i.hover?.duration ?? 220)
      ) +
      enabled(
        'scroll',
        'Scroll · 捲動進場',
        '元素進入可視範圍時淡入',
        numeric('scroll.threshold', '可見比例', i.scroll?.threshold ?? 0.15, 0, 1, 0.05) +
          numeric('scroll.duration', '過渡時間', i.scroll?.duration ?? 500)
      ) +
      enabled(
        'position',
        'Sticky / Fixed · 定位',
        '黏附容器或固定於視窗',
        select('position.mode', '模式', i.position?.mode ?? 'sticky', [
          ['sticky', 'Sticky · 捲動黏附'],
          ['fixed', 'Fixed · 固定視窗'],
        ]) +
          numeric('position.top', '距離視窗頂端', i.position?.top ?? 0, -10000, 10000) +
          `<p class="hint">Sticky 建議搭配父群組的流式排版；固定元素請放在無變形的容器中。</p>`
      ) +
      enabled(
        'animation',
        'Animation · 動畫',
        '載入頁面時自動播放',
        select('animation.effect', '效果', i.animation?.effect ?? 'fade', [
          ['fade', '淡入'],
          ['slide', '上移淡入'],
          ['pulse', '呼吸縮放'],
        ]) +
          numeric('animation.duration', '播放時間', i.animation?.duration ?? 800, 1) +
          `<label class="checkbox-field"><input type="checkbox" data-field="animation.repeat" ${i.animation?.repeat ? 'checked' : ''}/>循環播放</label>`
      ) +
      `<section class="property-section">${button('remove-interactions', '清除此圖層互動', undefined, 'secondary full-width')}<p class="hint">遵循系統「減少動態效果」設定。修改支援 Ctrl+Z 復原。</p></section>`
    );
  }
  private layout(n: DesignNode) {
    const l = this.project.layouts[n.id] ?? defaultLayout();
    return `<p class="panel-intro">原始設計保持不變，這些設定套用於互動預覽與網頁匯出。請以不同裝置寬度檢查結果。</p><section class="property-section"><h3>HTML 結構</h3>${select(
      'layout.tag',
      '語意標籤',
      l.tag,
      [
        'div',
        'section',
        'header',
        'footer',
        'nav',
        'main',
        'article',
        'button',
        'h1',
        'h2',
        'p',
      ].map((s) => [s, `<${s}>`])
    )}</section><section class="property-section"><h3>響應式約束</h3>${select(
      'layout.responsive',
      '相對父容器',
      l.responsive,
      [
        ['fixed', '保留原始尺寸與座標'],
        ['scale', '水平位置及寬度等比'],
        ['stretch', '左右固定，寬度延展'],
        ['right', '靠右固定'],
        ['center', '維持與中心的距離'],
      ]
    )}<p class="hint">流式容器中的子元素由 Flex / Grid 排列，這些定位約束只用於絕對定位。</p></section>${
      n.children.length
        ? `<section class="property-section"><h3>容器排版</h3>${select(
            'layout.mode',
            '排版方式',
            l.mode,
            [
              ['absolute', '精準定位 · 保留 XD 座標'],
              ['row', 'Flex · 橫向排列'],
              ['column', 'Flex · 縱向排列'],
              ['grid', 'Grid · 網格'],
            ]
          )}${l.mode !== 'absolute' ? `${numeric('layout.gap', '元素間距', l.gap, 0, 1000)}${numeric('layout.padding', '內距', l.padding, 0, 1000)}${l.mode === 'grid' ? numeric('layout.columns', '欄數', l.columns, 1, 12) : ''}<label class="checkbox-field"><input type="checkbox" data-field="layout.mobileStack" ${l.mobileStack ? 'checked' : ''}/>在手機斷點改為單欄</label><p class="hint">排版順序沿用 XD 圖層順序。背景圖層亦會參與排版，請只對適合的內容群組啟用。</p>` : ''}</section>`
        : ''
    }<section class="property-section">${button('reset-layout', '重設此圖層排版', undefined, 'secondary full-width')}</section>`;
  }
  private changeField(key: string, value: string, checked: boolean) {
    if (key.startsWith('export.')) {
      const field = key.slice(7);
      if (field === 'format') this.assetOptions.format = value as AssetOptions['format'];
      else if (field === 'scale') this.assetOptions.scale = Number(value) as 1 | 2 | 3;
      else if (field === 'removeRadius') this.assetOptions.removeRadius = checked;
      else if (field === 'responsive') this.webOptions.responsive = checked;
      else if (field === 'scaleArtboard') this.webOptions.scaleArtboard = checked;
      else if (field === 'breakpoint')
        this.webOptions.breakpoint = Math.max(320, Math.min(1600, Number(value) || 768));
      if (this.mode === 'preview') this.renderPreview();
      return;
    }
    const n = this.current;
    if (!n) return;
    this.history.push(this.project);
    if (key.startsWith('layout.')) {
      const l = this.project.layouts[n.id] ?? defaultLayout(),
        field = key.slice(7) as keyof Layout;
      const converted = ['gap', 'padding', 'columns'].includes(field)
        ? Math.max(
            field === 'columns' ? 1 : 0,
            Math.min(field === 'columns' ? 12 : 1000, Number(value) || 0)
          )
        : field === 'mobileStack'
          ? checked
          : value;
      this.project.layouts[n.id] = { ...l, [field]: converted };
    } else {
      const i = structuredClone(this.project.interactions[n.id] ?? {});
      const [category, field] = key.split('.');
      const defaults: Required<Interaction> = {
        click: {
          action: 'toggle',
          target: this.board.children.find((c) => c.id !== n.id)?.id ?? this.boardId,
        },
        hover: { effect: 'lift', duration: 220 },
        scroll: { effect: 'reveal', threshold: 0.15, duration: 500 },
        position: { mode: 'sticky', top: 0 },
        animation: { effect: 'fade', duration: 800, repeat: false },
      };
      if (category === 'enable') {
        if (checked) Object.assign(i, { [field]: defaults[field as keyof Interaction] });
        else delete i[field as keyof Interaction];
      } else {
        let converted: string | number | boolean = value;
        if (field === 'duration')
          converted = Math.max(
            category === 'animation' ? 1 : 0,
            Math.min(30000, Number(value) || 0)
          );
        if (field === 'threshold') converted = Math.max(0, Math.min(1, Number(value) || 0));
        if (field === 'top') converted = Math.max(-10000, Math.min(10000, Number(value) || 0));
        if (field === 'repeat') converted = checked;
        const previous =
          i[category as keyof Interaction] ?? defaults[category as keyof Interaction];
        Object.assign(i, { [category]: { ...previous, [field]: converted } });
        if (category === 'click' && field === 'action' && i.click)
          i.click.target =
            value === 'navigate'
              ? this.boardId
              : (this.board.children.find((c) => c.id !== n.id)?.id ?? this.boardId);
      }
      this.project.interactions[n.id] = i;
    }
    this.afterEdit();
    this.renderInspector();
  }
  private afterEdit() {
    this.generation++;
    this.updateHistory();
    this.renderTree();
    this.scheduleSave();
    if (this.mode === 'preview') {
      clearTimeout(this.previewTimer);
      this.previewTimer = setTimeout(() => this.renderPreview(), 200);
    }
  }
  private updateHistory() {
    this.el<HTMLButtonElement>('[data-action="undo"]').disabled = !this.history.canUndo;
    this.el<HTMLButtonElement>('[data-action="redo"]').disabled = !this.history.canRedo;
  }
  private scheduleSave() {
    clearTimeout(this.saveTimer);
    const revision = ++this.saveRevision;
    this.el('#save-state').textContent = '儲存中…';
    this.saveTimer = setTimeout(async () => {
      try {
        await saveLocal(this.project);
        if (revision === this.saveRevision) this.el('#save-state').textContent = '已儲存在本機';
      } catch {
        this.el('#save-state').textContent = '請另存工作檔';
        this.toast('瀏覽器儲存空間不足或未開放，請使用「儲存工作檔」。', true);
      }
    }, 400);
  }
  private renderMode() {
    const preview = this.mode === 'preview';
    this.el('#canvas-viewport').hidden = preview;
    this.el('#preview-stage').hidden = !preview;
    this.el('#zoom-tools').hidden = preview;
    this.el('#preview-tools').hidden = !preview;
    this.el('[data-action="design"]').classList.toggle('active', !preview);
    this.el('[data-action="preview"]').classList.toggle('active', preview);
    if (preview) this.renderPreview();
    else {
      this.preview?.dispose();
      this.preview = undefined;
      this.el<HTMLIFrameElement>('iframe').srcdoc = '';
      this.el<HTMLIFrameElement>('iframe').removeAttribute('src');
    }
  }
  private renderPreview() {
    try {
      this.preview?.dispose();
      this.bundle = exportWeb(this.project, this.webOptions);
      this.preview = createPreview(this.bundle, this.boardId);
      const frame = this.el<HTMLIFrameElement>('iframe');
      frame.removeAttribute('srcdoc');
      frame.src = this.preview.url;
      this.resizePreview();
      this.el('#canvas-status').textContent =
        '互動預覽 · 修改右側設定即可更新 · 使用原生 HTML / CSS / JS';
    } catch (error) {
      this.toast('預覽失敗：' + (error instanceof Error ? error.message : String(error)), true);
    }
  }
  private resizePreview() {
    const frame = this.el<HTMLIFrameElement>('iframe');
    frame.style.width = `${this.viewportWidth}px`;
    this.el('#preview-stage').style.setProperty('--preview-width', `${this.viewportWidth}px`);
  }
  private dialog(content: string) {
    const dialog = this.el<HTMLDialogElement>('#modal');
    dialog.innerHTML = content;
    if (!dialog.open) dialog.showModal();
  }
  private modalHeading(title: string, subtitle: string) {
    return `<div class="modal-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${button('close', '', 'close', 'icon-button', 'aria-label="關閉"')}</div>`;
  }
  private diagnostics() {
    const diagnostics = this.project.document.diagnostics;
    this.dialog(
      this.modalHeading('匯入相容性報告', '精度限制會明確列出，請依設計需求檢查。') +
        `<div class="modal-body">${diagnostics.length ? `<ul class="diagnostic-list">${diagnostics.map((d) => `<li><code>${esc(d.code)}</code><p>${esc(d.message)}</p>${d.nodeId ? `<small>${esc(findNode(this.project, d.nodeId)?.name ?? d.nodeId)}</small>` : ''}</li>`).join('')}</ul>` : '<div class="empty-report">✓ 此文件目前沒有相容性提醒。</div>'}<p class="hint">本工具仍在擴充 XD 格式相容性。模糊、複雜布林運算、元件覆寫及原始原型連線可能無法完整還原；請以實際稿件驗證。</p></div>`
    );
  }
  private help() {
    this.dialog(
      this.modalHeading(
        '從設計稿，到可維護的網頁',
        '完全本機 · 無雲端上傳 · 無 Adobe XD 執行依賴'
      ) +
        `<div class="modal-body help-content"><ol><li><strong>開啟 .xd</strong><p>拖入本機 XD 檔。解析後可切換畫板，並查看相容性提醒。</p></li><li><strong>檢查與量測</strong><p>點選圖層；Ctrl／⌘ 或 Shift 多選，選兩個元素量測間距。Alt 懸停可臨時比較；空白鍵拖曳平移。</p></li><li><strong>互動與響應式</strong><p>右側設定 Click、Hover、Scroll、Sticky、Fixed、Animation。排版面板指定 Flex、Grid 與約束，再在互動預覽切換裝置。</p></li><li><strong>匯出與保存</strong><p>匯出 PNG／SVG 支援去除圓角；多選打包 ZIP。網頁匯出包含 HTML、CSS、JS 與素材，可直接本機開啟。工作檔使用 .xdlocal，不覆寫原始 XD。</p></li></ol><div class="shortcut-grid"><span>Ctrl / ⌘ + O</span><span>開啟</span><span>Ctrl / ⌘ + S</span><span>儲存工作檔</span><span>Ctrl / ⌘ + Z</span><span>復原設定</span><span>+ / − / 0 / F</span><span>縮放 / 100% / 符合視窗</span></div><p class="hint">本機字型缺失會影響外觀。定位式文字框為估算值；SVG 保留原始文字基線。去圓角無法補回已烘焙進點陣圖的透明像素。</p>${button('demo', '載入範例文件', 'layers', 'secondary full-width')}<p class="hint">載入範例會替換目前工作階段；可先儲存 .xdlocal。</p></div>`
    );
  }
  private exportDialog() {
    const web = this.exportTab === 'web';
    this.dialog(
      this.modalHeading(
        '匯出作品',
        web ? '乾淨的原生檔案，準備好進入你的開發流程。' : '素材在本機產生，原始設計不會被修改。'
      ) +
        `<div class="export-tabs">${button('export-tab-web', '網頁程式碼', 'code', web ? 'active' : '')}${button('export-tab-assets', '設計素材', 'image', !web ? 'active' : '')}</div><div class="modal-body">${
          web
            ? `<div class="export-summary"><span class="file-badge">HTML</span><span class="file-badge">CSS</span><span class="file-badge">JS</span><span>+ assets + design tokens</span></div><label class="checkbox-field"><input data-field="export.responsive" type="checkbox" ${this.webOptions.responsive ? 'checked' : ''}/>套用排版面板中的響應式設定</label>${numeric('export.breakpoint', '手機斷點', this.webOptions.breakpoint, 320, 1600)}<label class="checkbox-field"><input data-field="export.scaleArtboard" type="checkbox" ${this.webOptions.scaleArtboard ? 'checked' : ''}/>整張畫板等比縮小以符合視窗</label><p class="hint">等比縮小適合展示精準設計；可維護的響應式網站建議配置 Flex / Grid。未設定的元素保留原始座標。輸出 ${this.project.document.artboards.length} 個畫板頁面。</p>`
            : `<p class="selection-summary">已選取 <strong>${this.selected.size}</strong> 個圖層${this.selected.size > 1 ? '，將打包為 ZIP' : ''}</p>${select(
                'export.format',
                '檔案格式',
                this.assetOptions.format,
                [
                  ['svg', 'SVG · 保留向量'],
                  ['png', 'PNG · 透明背景'],
                ]
              )}${select('export.scale', 'PNG 匯出倍率', String(this.assetOptions.scale), [
                ['1', '1× 原始尺寸'],
                ['2', '2× 高解析度'],
                ['3', '3× 高解析度'],
              ])}<label class="checkbox-field"><input data-field="export.removeRadius" type="checkbox" ${this.assetOptions.removeRadius ? 'checked' : ''}/>移除矩形與遮罩的圓角</label><p class="hint">包含群組內的圓角。已烘焙進圖片本身的圓角無法還原。SVG 保留可編輯文字，開啟時需要原字型。</p>`
        }</div><div class="modal-footer"><span>所有處理都在本機完成</span>${button('download-export', web ? '下載網頁 ZIP' : '下載素材', 'export', 'primary', !web && !this.selected.size ? 'disabled' : '')}</div>`
    );
  }
  private async performExport() {
    const trigger = this.el<HTMLButtonElement>('[data-action="download-export"]');
    if (trigger.disabled) return;
    trigger.disabled = true;
    trigger.textContent = '正在產生…';
    try {
      if (this.exportTab === 'web') {
        const bundle = exportWeb(this.project, this.webOptions);
        download(
          webZip(bundle),
          filename(this.project.document.name) + '-web.zip',
          'application/zip'
        );
        this.toast(`已匯出網頁${bundle.warnings.length ? '；注意事項已附在 README.md' : ''}`);
      } else {
        const nodes = [...this.selected]
          .map((id) => findNode(this.project, id))
          .filter((n): n is DesignNode => !!n);
        const result = await exportAssets(this.project.document, nodes, this.assetOptions);
        download(result.bytes, result.name, result.mime);
        this.toast('素材已匯出');
      }
      this.el<HTMLDialogElement>('#modal').close();
    } catch (error) {
      this.toast(error instanceof Error ? error.message : String(error), true);
      this.exportDialog();
    }
  }
  private toast(message: string, error = false) {
    clearTimeout(this.toastTimer);
    const toast = this.el('#toast');
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.hidden = false;
    this.toastTimer = setTimeout(() => (toast.hidden = true), error ? 8000 : 4000);
  }
  destroy() {
    this.abort.abort();
    this.preview?.dispose();
    clearTimeout(this.saveTimer);
    clearTimeout(this.previewTimer);
    clearTimeout(this.toastTimer);
    this.root.innerHTML = '';
  }
}
