import {
  createProject,
  defaultLayout,
  emptyStyle,
  type DesignNode,
  type Project,
} from './core/model';
import { identity, transformBounds, union } from './core/geometry';

function rect(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  r = 0
): DesignNode {
  return {
    id,
    sourceId: id,
    name,
    kind: 'rect',
    bounds: { x: 0, y: 0, width, height },
    transform: [1, 0, 0, 1, x, y],
    style: { ...emptyStyle(), fill: { type: 'solid', color } },
    visible: true,
    children: [],
    radius: [r, r, r, r],
  };
}
function text(
  id: string,
  value: string,
  x: number,
  y: number,
  size: number,
  color = '#242a24',
  weight = 400
): DesignNode {
  const n = rect(
    id,
    value,
    x,
    y,
    Array.from(value).reduce((w, c) => w + (/[\u2e80-\uffff]/.test(c) ? size : size * 0.56), 0),
    size * 1.3,
    color
  );
  n.kind = 'text';
  delete n.radius;
  n.text = {
    value,
    family: 'Arial, Microsoft JhengHei',
    size,
    weight,
    italic: false,
    spacing: 0,
    lineHeight: size * 1.3,
    align: 'left',
    lines: [{ from: 0, to: value.length, x: 0, y: size }],
    runs: [],
    estimatedBounds: false,
  };
  return n;
}
function group(id: string, name: string, x: number, y: number, children: DesignNode[]): DesignNode {
  return {
    id,
    sourceId: id,
    name,
    kind: 'group',
    bounds: union(children.map((n) => transformBounds(n.bounds, n.transform))),
    transform: [1, 0, 0, 1, x, y],
    style: emptyStyle(),
    visible: true,
    children,
  };
}
function circle(id: string, x: number, y: number, size: number, color: string): DesignNode {
  const n = rect(id, '圓形 / ' + id, x, y, size, size, color);
  n.kind = 'ellipse';
  return n;
}
function path(id: string, d: string, width: number, height: number, color: string): DesignNode {
  return {
    id,
    sourceId: id,
    name: '山形 / ' + id,
    kind: 'path',
    path: d,
    bounds: { x: 0, y: 0, width, height },
    transform: identity(),
    visible: true,
    children: [],
    style: { ...emptyStyle(), fill: { type: 'solid', color } },
  };
}
function landscape(id: string, width: number, height: number, palette: string[]): DesignNode {
  const n = group(id, '風景插畫', 0, 0, [
    rect(id + '-sky', '天空', 0, 0, width, height, palette[0], 18),
    circle(id + '-sun', width * 0.65, height * 0.15, height * 0.23, palette[1]),
    path(
      id + '-back',
      `M0 ${height * 0.7} Q${width * 0.2} ${height * 0.2} ${width * 0.5} ${height * 0.68} T${width} ${height * 0.5} V${height} H0Z`,
      width,
      height,
      palette[2]
    ),
    path(
      id + '-front',
      `M0 ${height * 0.85} Q${width * 0.45} ${height * 0.36} ${width} ${height * 0.8} V${height} H0Z`,
      width,
      height,
      palette[3]
    ),
  ]);
  n.bounds = { x: 0, y: 0, width, height };
  n.clip = rect(id + '-clip', '剪裁', 0, 0, width, height, '#ffffff', 18);
  return n;
}
export function demoProject(): Project {
  const header = group('header', '頁首導覽', 64, 40, [
    text('wordmark', 'roam.', 0, 0, 30, '#29382c', 700),
    text('nav-dest', '探索目的地', 550, 9, 14),
    text('nav-story', '旅人故事', 670, 9, 14),
    text('nav-about', '關於我們', 780, 9, 14),
    group('nav-button', '開始旅程', 924, 0, [
      rect('nav-pill', '按鈕底色', 0, 0, 148, 44, '#29382c', 22),
      text('nav-cta', '開始旅程 ↗', 30, 10, 14, '#ffffff'),
    ]),
  ]);
  const copy = group('hero-copy', '主視覺文案', 0, 22, [
    text('eyebrow', 'LESS PLANNING. MORE LIVING.', 0, 0, 12, '#79816a', 700),
    text('headline-1', '把靈感，', 0, 40, 52, '#29382c', 700),
    text('headline-2', '變成下一站。', 0, 106, 52, '#29382c', 700),
    text('description-1', '離開熟悉的日常，找到心裡嚮往的風景。', 0, 194, 16, '#7a7e71'),
    text('description-2', '從一個小小的念頭，開始你的下一段旅程。', 0, 222, 16, '#7a7e71'),
    group('hero-button', '探索精選旅程', 0, 276, [
      rect('hero-button-bg', '主按鈕', 0, 0, 184, 50, '#dd7754', 8),
      text('hero-button-text', '探索精選旅程  →', 26, 13, 15, '#ffffff', 700),
    ]),
  ]);
  const art = landscape('hero-art', 480, 352, ['#e7e3d0', '#dd7754', '#8c9c7c', '#4a6250']);
  art.transform = [1, 0, 0, 1, 592, 0];
  const hero = group('hero', '主視覺', 64, 156, [copy, art]);
  const section = group('section-title', '精選目的地標題', 64, 576, [
    text('section-heading', '值得出發的地方', 0, 0, 28, '#29382c', 700),
    text('section-caption', '精選每一段，剛剛好的旅程。', 0, 48, 14, '#7a7e71'),
    text('view-all', '查看全部  ↗', 974, 24, 14, '#68745f'),
  ]);
  const destinations = [
    ['山野之間', '南投・台灣', '03 DAYS', ['#e7dfc9', '#e3a36e', '#a2ab8a', '#657f63']],
    ['海風的方向', '花蓮・台灣', '04 DAYS', ['#dae6e5', '#f1c183', '#91b5b1', '#4f807f']],
    ['慢下來的日子', '台南・台灣', '02 DAYS', ['#efe0d1', '#d77e53', '#ba9c7a', '#8b7058']],
  ];
  const cards = group(
    'destinations',
    '目的地卡片',
    64,
    684,
    destinations.map((values, index) => {
      const [title, location, days, colors] = values as [string, string, string, string[]];
      const image = landscape(`card-${index}-image`, 336, 180, colors);
      return group(`card-${index}`, title, index * 368, 0, [
        rect(`card-${index}-base`, '卡片背景', 0, 0, 336, 284, '#ffffff', 16),
        image,
        text(`card-${index}-title`, title, 20, 198, 21, '#29382c', 700),
        text(`card-${index}-place`, location, 20, 240, 13, '#7a7e71'),
        text(`card-${index}-days`, days, 245, 243, 10, '#7a7e71', 700),
      ]);
    })
  );
  const board: DesignNode = {
    id: 'demo-board',
    sourceId: 'demo-board',
    name: 'Roam / 探索首頁',
    kind: 'artboard',
    bounds: { x: 0, y: 0, width: 1200, height: 1032 },
    transform: identity(),
    style: { ...emptyStyle(), fill: { type: 'solid', color: '#f7f6f0' } },
    visible: true,
    children: [header, hero, section, cards],
    viewportHeight: 900,
  };
  const project = createProject({
    version: 1,
    name: 'Roam — 旅行靈感',
    artboards: [board],
    assets: {},
    diagnostics: [],
    source: 'demo',
  });
  project.interactions['hero-button'] = {
    hover: { effect: 'lift', duration: 220 },
    click: { action: 'scroll', target: 'destinations' },
  };
  project.interactions['nav-button'] = {
    hover: { effect: 'scale', duration: 220 },
    click: { action: 'scroll', target: 'destinations' },
  };
  for (let i = 0; i < 3; i++)
    project.interactions[`card-${i}`] = {
      hover: { effect: 'lift', duration: 250 },
      scroll: { effect: 'reveal', threshold: 0.1, duration: 500 },
    };
  project.layouts['demo-board'] = { ...defaultLayout(), mode: 'column', padding: 64, gap: 56 };
  project.layouts['hero'] = { ...defaultLayout(), mode: 'row', gap: 70 };
  project.layouts['destinations'] = { ...defaultLayout(), mode: 'grid', columns: 3, gap: 32 };
  project.layouts['hero-copy'] = { ...defaultLayout(), responsive: 'stretch' };
  project.layouts['headline-1'] = { ...defaultLayout(), tag: 'h1' };
  return project;
}
