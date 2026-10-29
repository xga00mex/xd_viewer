import type { Bounds, DesignDocument, DesignNode, Paint } from '../core/model';
import { emptyStyle, flatten } from '../core/model';
import { escapeHtml as esc, safeId } from '../core/escape';
import { identity, multiply, round, transformBounds, union } from '../core/geometry';
import { fontRules, fontStack } from '../core/fonts';

export interface SvgOptions {
  removeRadius?: boolean;
  removeOpacity?: boolean;
  selection?: boolean;
  includeHidden?: boolean;
  padding?: number;
  embedFonts?: boolean;
}
interface Context {
  document: DesignDocument;
  options: SvgOptions;
  defs: string[];
  prefix: string;
}
const attrs = (values: Record<string, unknown>) =>
  Object.entries(values)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ');
const mat = (m: number[]) => `matrix(${m.map(round).join(' ')})`;

export function rectPath(b: Bounds, radii: number[]): string {
  const { x, y, width: w, height: h } = b;
  const factor = Math.min(
    1,
    ...[
      w / (radii[0] + radii[1] || 1),
      w / (radii[2] + radii[3] || 1),
      h / (radii[0] + radii[3] || 1),
      h / (radii[1] + radii[2] || 1),
    ]
  );
  const [a, c, d, e] = radii.map((r) => r * factor);
  return `M${x + a},${y}H${x + w - c}Q${x + w},${y} ${x + w},${y + c}V${y + h - d}Q${x + w},${y + h} ${x + w - d},${y + h}H${x + e}Q${x},${y + h} ${x},${y + h - e}V${y + a}Q${x},${y} ${x + a},${y}Z`;
}
function geometry(node: DesignNode, extra: Record<string, unknown>, removeRadius: boolean): string {
  const b = node.bounds;
  if (node.kind === 'ellipse')
    return `<ellipse ${attrs({ cx: b.x + b.width / 2, cy: b.y + b.height / 2, rx: b.width / 2, ry: b.height / 2, ...extra })}/>`;
  if (node.kind === 'path' || node.kind === 'line')
    return `<path ${attrs({ d: node.path ?? '', ...extra })}/>`;
  if (node.kind === 'rect' && !removeRadius && node.radius?.some((r) => r > 0))
    return `<path ${attrs({ d: rectPath(b, node.radius), ...extra })}/>`;
  return `<rect ${attrs({ ...b, ...extra })}/>`;
}
function clipGeometry(n: DesignNode, ctx: Context, parent = identity()): string {
  // clipPath only accepts geometry/text/use directly. A nested <g> is ignored
  // by SVG renderers, so compose matrices and flatten clipping primitives.
  const transform = multiply(parent, n.transform);
  return n.children.length
    ? n.children.map((c) => clipGeometry(c, ctx, transform)).join('')
    : geometry(n, { fill: 'black', transform: mat(transform) }, !!ctx.options.removeRadius);
}
export function htmlClipDefinition(document: DesignDocument, node: DesignNode, id: string): string {
  if (!node.clip) return '';
  const ctx: Context = { document, options: {}, defs: [], prefix: 'html-' };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;pointer-events:none" aria-hidden="true"><defs><clipPath id="${esc(id)}" clipPathUnits="userSpaceOnUse">${clipGeometry(node.clip, ctx, [1, 0, 0, 1, -node.bounds.x, -node.bounds.y])}</clipPath></defs></svg>`;
}
function fill(paint: Paint, node: DesignNode, ctx: Context): string {
  if (paint.type === 'none') return 'none';
  if (paint.type === 'solid') return paint.color;
  const id = ctx.prefix + safeId(node.id) + '-fill',
    b = node.bounds;
  if (paint.type === 'image') {
    const asset = ctx.document.assets[paint.assetId];
    if (!asset) return '#e4c6de';
    const aspect =
      paint.fit === 'stretch'
        ? 'none'
        : paint.fit === 'contain'
          ? 'xMidYMid meet'
          : 'xMidYMid slice';
    if (paint.transform && paint.width && paint.height) {
      ctx.defs.push(
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${paint.width}" height="${paint.height}" patternTransform="${mat(paint.transform)}"><image width="${paint.width}" height="${paint.height}" href="${esc(asset.data)}"/></pattern>`
      );
    } else
      ctx.defs.push(
        `<pattern id="${id}" width="1" height="1" viewBox="0 0 ${b.width || 1} ${b.height || 1}" preserveAspectRatio="none"><image width="${b.width || 1}" height="${b.height || 1}" preserveAspectRatio="${aspect}" href="${esc(asset.data)}"/></pattern>`
      );
  } else {
    const stops = paint.stops
      .map((s) => `<stop offset="${s.offset}" stop-color="${esc(s.color)}"/>`)
      .join('');
    if (paint.type === 'linear')
      ctx.defs.push(
        `<linearGradient id="${id}" x1="${paint.x1}" y1="${paint.y1}" x2="${paint.x2}" y2="${paint.y2}">${stops}</linearGradient>`
      );
    else
      ctx.defs.push(
        `<radialGradient id="${id}" cx="${paint.x1}" cy="${paint.y1}" r="${Math.hypot(paint.x2 - paint.x1, paint.y2 - paint.y1) || 0.5}">${stops}</radialGradient>`
      );
  }
  return `url(#${id})`;
}
function renderText(n: DesignNode, color: string): string {
  const t = n.text!;
  const lines = t.lines
    .map((line) => {
      const runs = t.runs.filter((r) => r.to > line.from && r.from < line.to);
      let cursor = line.from;
      const chunks: string[] = [];
      for (const r of runs) {
        const start = Math.max(cursor, r.from),
          end = Math.min(line.to, r.to);
        if (start > cursor) chunks.push(esc(t.value.slice(cursor, start)));
        if (end > start)
          chunks.push(
            `<tspan ${attrs({ 'font-family': fontStack(r.family), 'font-size': r.size, 'font-weight': r.weight, 'font-style': r.italic ? 'italic' : undefined, 'letter-spacing': r.spacing, fill: r.color })}>${esc(t.value.slice(start, end))}</tspan>`
          );
        cursor = Math.max(cursor, end);
      }
      chunks.push(esc(t.value.slice(cursor, line.to)));
      const content = chunks.join('');
      return `<tspan x="${line.x}" y="${line.y}">${content}</tspan>`;
    })
    .join('');
  return `<text ${attrs({ 'font-family': fontStack(t.family), 'font-size': t.size, 'font-weight': t.weight, 'font-style': t.italic ? 'italic' : undefined, 'letter-spacing': t.spacing, fill: color, 'xml:space': 'preserve' })}>${lines}</text>`;
}
function render(n: DesignNode, ctx: Context, transform = true): string {
  if (!n.visible && !ctx.options.includeHidden) return '';
  const id = ctx.prefix + safeId(n.id),
    group: Record<string, unknown> = {
      transform: transform ? mat(n.transform) : undefined,
      opacity: ctx.options.removeOpacity ? 1 : n.style.opacity,
    };
  if (ctx.options.selection) group['data-node-id'] = n.id;
  if (n.style.blendMode) group.style = `mix-blend-mode:${n.style.blendMode}`;
  if (n.clip) {
    ctx.defs.push(`<clipPath id="${id}-clip">${clipGeometry(n.clip, ctx)}</clipPath>`);
    group['clip-path'] = `url(#${id}-clip)`;
  }
  if (n.style.shadows.length) {
    const shadows = n.style.shadows
      .map(
        (s, i) =>
          `<feGaussianBlur in="SourceAlpha" stdDeviation="${s.blur / 2}" result="blur${i}"/><feOffset in="blur${i}" dx="${s.x}" dy="${s.y}" result="offset${i}"/><feFlood flood-color="${esc(s.color)}"/><feComposite in2="offset${i}" operator="in" result="s${i}"/>`
      )
      .join('');
    const merge = `<feMerge>${n.style.shadows.map((_, i) => `<feMergeNode in="s${i}"/>`).join('')}<feMergeNode in="SourceGraphic"/></feMerge>`;
    ctx.defs.push(
      `<filter id="${id}-shadow" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">${shadows}${merge}</filter>`
    );
    group.filter = `url(#${id}-shadow)`;
  }
  let content = '';
  if (n.kind === 'artboard') {
    ctx.defs.push(
      `<clipPath id="${id}-board"><rect ${attrs(n.bounds as unknown as Record<string, unknown>)}/></clipPath>`
    );
    group['clip-path'] = `url(#${id}-board)`;
    content = geometry(n, { fill: fill(n.style.fill, n, ctx) }, false);
  } else if (n.kind === 'text' && n.text) content = renderText(n, fill(n.style.fill, n, ctx));
  else if (n.kind !== 'group' && n.kind !== 'unsupported') {
    const color = fill(n.style.fill, n, ctx),
      stroke = n.style.stroke;
    content = geometry(n, { fill: color }, !!ctx.options.removeRadius);
    if (stroke && stroke.width > 0) {
      const strokeAttrs: Record<string, unknown> = {
        fill: 'none',
        stroke: stroke.color,
        'stroke-width': stroke.width,
        'stroke-dasharray': stroke.dash?.join(' '),
      };
      if (stroke.align === 'inside') {
        ctx.defs.push(
          `<clipPath id="${id}-inside">${geometry(n, {}, !!ctx.options.removeRadius)}</clipPath>`
        );
        strokeAttrs['clip-path'] = `url(#${id}-inside)`;
        strokeAttrs['stroke-width'] = stroke.width * 2;
      } else if (stroke.align === 'outside') {
        const b = n.bounds,
          pad = stroke.width * 3;
        ctx.defs.push(
          `<mask id="${id}-outside" maskUnits="userSpaceOnUse" x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}"><rect x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" fill="white"/>${geometry(n, { fill: 'black' }, !!ctx.options.removeRadius)}</mask>`
        );
        strokeAttrs.mask = `url(#${id}-outside)`;
        strokeAttrs['stroke-width'] = stroke.width * 2;
      }
      content += geometry(n, strokeAttrs, !!ctx.options.removeRadius);
    }
  } else if (n.kind === 'unsupported' && !n.children.length)
    content = geometry(n, { fill: '#f5ddeb', stroke: '#b96390', 'stroke-dasharray': '4 4' }, false);
  // Fixed controls scrolling behavior, not stacking. Background artwork can
  // also be fixed, so preserve the authored order for every artboard layer.
  content += n.children.map((c) => render(c, ctx)).join('');
  // A transparent hit target allows selecting whitespace in a text object.
  if (ctx.options.selection && n.kind === 'text')
    content += `<rect ${attrs({ ...n.bounds, fill: 'transparent' })}/>`;
  return `<g ${attrs(group)}>${content}</g>`;
}
export function renderBoard(
  document: DesignDocument,
  board: DesignNode,
  options: SvgOptions = {}
): string {
  const ctx: Context = { document, options, defs: [], prefix: 'board-' };
  const content = render(board, ctx);
  const fonts = options.embedFonts === false ? '' : fontRules(document, [board]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${board.bounds.width}" height="${board.bounds.height}" viewBox="0 0 ${board.bounds.width} ${board.bounds.height}" role="img" aria-label="${esc(board.name)}"><defs>${fonts ? `<style>${esc(fonts)}</style>` : ''}${ctx.defs.join('')}</defs>${content}</svg>`;
}
function visualBounds(node: DesignNode): Bounds {
  let b = node.bounds;
  if (!node.clip && node.children.length)
    b = union([
      b,
      ...node.children
        .filter((n) => n.visible)
        .map((n) => transformBounds(visualBounds(n), n.transform)),
    ]);
  const stroke = node.style.stroke;
  const outset = stroke
    ? stroke.align === 'inside'
      ? 0
      : stroke.align === 'center'
        ? stroke.width / 2
        : stroke.width
    : 0;
  b = {
    x: b.x - outset,
    y: b.y - outset,
    width: b.width + outset * 2,
    height: b.height + outset * 2,
  };
  return union([
    b,
    ...node.style.shadows.map((s) => ({
      x: b.x + s.x - s.blur * 2,
      y: b.y + s.y - s.blur * 2,
      width: b.width + s.blur * 4,
      height: b.height + s.blur * 4,
    })),
  ]);
}
export function renderAsset(
  document: DesignDocument,
  node: DesignNode,
  options: SvgOptions = {}
): string {
  const ctx: Context = { document, options, defs: [], prefix: 'asset-' };
  const copy = {
    ...node,
    visible: true,
    transform: [...node.transform.slice(0, 4), 0, 0] as DesignNode['transform'],
  };
  if (node.kind === 'artboard') return renderBoard(document, copy, options);
  const b = transformBounds(
    options.padding === undefined ? visualBounds(copy) : copy.bounds,
    copy.transform
  );
  const pad = options.padding ?? 0;
  const content = render(copy, ctx);
  const fonts = options.embedFonts === false ? '' : fontRules(document, [node]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, b.width + pad * 2)}" height="${Math.max(1, b.height + pad * 2)}" viewBox="${b.x - pad} ${b.y - pad} ${Math.max(1, b.width + pad * 2)} ${Math.max(1, b.height + pad * 2)}"><defs>${fonts ? `<style>${esc(fonts)}</style>` : ''}${ctx.defs.join('')}</defs>${content}</svg>`;
}
/** Keep the selected scene in board order, including its ancestor transforms/effects. */
export function renderMergedAsset(
  document: DesignDocument,
  nodes: DesignNode[],
  options: SvgOptions = {}
): string {
  if (!nodes.length) throw new Error('請先選取至少一個圖層。');
  const selected = new Set(nodes.map((n) => n.id));
  const board = document.artboards.find((b) => {
    const ids = new Set(flatten([b]).map((n) => n.id));
    return [...selected].every((id) => ids.has(id));
  });
  if (!board) throw new Error('合併匯出僅支援同一畫板內的圖層。');
  function keep(n: DesignNode, includeChildren = false): DesignNode | undefined {
    const chosen = selected.has(n.id),
      include = includeChildren || chosen;
    const children = n.children.flatMap((child) => {
      const kept = keep(child, include);
      return kept ? [kept] : [];
    });
    if (include) return { ...n, visible: chosen ? true : n.visible, children };
    if (!children.length) return undefined;
    let bounds = union(children.map((child) => transformBounds(child.bounds, child.transform)));
    if (n.clip) {
      const clip = transformBounds(n.clip.bounds, n.clip.transform);
      const x = Math.max(bounds.x, clip.x),
        y = Math.max(bounds.y, clip.y);
      bounds = {
        x,
        y,
        width: Math.max(0, Math.min(bounds.x + bounds.width, clip.x + clip.width) - x),
        height: Math.max(0, Math.min(bounds.y + bounds.height, clip.y + clip.height) - y),
      };
    }
    return {
      ...n,
      kind: 'group',
      visible: true,
      bounds,
      children,
      // Selecting layers does not implicitly export the artboard background.
      style: n.kind === 'artboard' ? emptyStyle() : n.style,
    };
  }
  return renderAsset(document, keep(board)!, options);
}
/** Render a leaf's local geometry. HTML wrappers own transform and opacity. */
export function renderLocalSvg(document: DesignDocument, node: DesignNode): string {
  return renderAsset(
    document,
    { ...node, transform: identity(), style: { ...node.style, opacity: 1, shadows: [] } },
    { padding: 0, embedFonts: false }
  );
}
