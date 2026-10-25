/** Standalone exported review shell. It uses no network and never reads iframe DOM. */
export function viewerRuntime() {
  const data = JSON.parse(document.getElementById('viewer-data')!.textContent!) as {
    name: string;
    boards: {
      id: string;
      name: string;
      width: number;
      height: number;
      viewportHeight: number;
      page: string;
      html: string;
    }[];
  };
  const frame = document.getElementById('prototype') as HTMLIFrameElement;
  const stage = document.getElementById('review-stage')!;
  const device = document.getElementById('device')!;
  const boardSelect = document.getElementById('review-board') as HTMLSelectElement;
  const zoomSelect = document.getElementById('review-zoom') as HTMLSelectElement;
  let index = 0,
    hotspots = false;
  const history: number[] = [];
  const fit = () => {
    const board = data.boards[index],
      height = Math.min(board.viewportHeight || board.height, board.height);
    const scale =
      zoomSelect.value === 'fit'
        ? Math.min((stage.clientWidth - 64) / board.width, (stage.clientHeight - 64) / height, 1)
        : Number(zoomSelect.value);
    const ratio = Math.max(0.05, scale);
    device.style.width = `${board.width * ratio}px`;
    device.style.height = `${height * ratio}px`;
    frame.style.width = `${board.width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${ratio})`;
    document.getElementById('review-size')!.textContent =
      `${board.width} × ${height} · ${Math.round(ratio * 100)}%`;
  };
  const show = (next: number, remember = true) => {
    if (next < 0 || next >= data.boards.length) return;
    if (remember && next !== index) history.push(index);
    index = next;
    boardSelect.value = String(next);
    frame.srcdoc = data.boards[next].html;
    document.getElementById('review-count')!.textContent = `${index + 1} / ${data.boards.length}`;
    (document.getElementById('previous') as HTMLButtonElement).disabled = index === 0;
    (document.getElementById('next') as HTMLButtonElement).disabled =
      index === data.boards.length - 1;
    (document.getElementById('back') as HTMLButtonElement).disabled = !history.length;
    document
      .querySelectorAll<HTMLButtonElement>('[data-board]')
      .forEach((b) => b.classList.toggle('active', Number(b.dataset.board) === index));
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
    fit();
  };
  document.getElementById('previous')!.addEventListener('click', () => show(index - 1));
  document.getElementById('next')!.addEventListener('click', () => show(index + 1));
  document.getElementById('back')!.addEventListener('click', () => {
    const previous = history.pop();
    if (previous !== undefined) show(previous, false);
  });
  document.getElementById('restart')!.addEventListener('click', () => {
    history.length = 0;
    show(0, false);
  });
  document.getElementById('replay')!.addEventListener('click', () => show(index, false));
  document.getElementById('fullscreen')!.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.getElementById('boards-toggle')!.addEventListener('click', () => {
    document.body.classList.toggle('show-boards');
    fit();
  });
  document.getElementById('hotspots')!.addEventListener('click', () => {
    hotspots = !hotspots;
    document.getElementById('hotspots')!.setAttribute('aria-pressed', String(hotspots));
    frame.contentWindow?.postMessage({ type: 'xd-viewer-hotspots', enabled: hotspots }, '*');
  });
  frame.addEventListener('load', () =>
    frame.contentWindow?.postMessage({ type: 'xd-viewer-hotspots', enabled: hotspots }, '*')
  );
  boardSelect.addEventListener('change', () => show(Number(boardSelect.value)));
  zoomSelect.addEventListener('change', fit);
  document
    .querySelectorAll<HTMLButtonElement>('[data-board]')
    .forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.board))));
  window.addEventListener('resize', fit);
  window.addEventListener('keydown', (event) => {
    if ((event.target as Element).closest('select,input')) return;
    if (event.key === 'ArrowRight') show(index + 1);
    if (event.key === 'ArrowLeft') show(index - 1);
  });
  window.addEventListener('message', (event) => {
    if (!frame.contentWindow || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'xd-viewer-navigate') {
      const next = data.boards.findIndex((b) => b.page === event.data.page);
      if (next >= 0) show(next);
    }
  });
  show(0, false);
}
export function viewerPageBridge() {
  const navigate = (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-action="navigate"]');
    if (!target) return;
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    parent.postMessage({ type: 'xd-viewer-navigate', page: target.dataset.page }, '*');
  };
  document.addEventListener('click', navigate, true);
  document.addEventListener('keydown', navigate, true);
  window.addEventListener('message', (event) => {
    if (event.source === parent && event.data?.type === 'xd-viewer-hotspots')
      document.documentElement.classList.toggle('xd-hotspots', event.data.enabled === true);
  });
}
