import pathBounds from 'svg-path-bounds';
import type {
  Asset,
  Bounds,
  DesignDocument,
  DesignNode,
  Diagnostic,
  Matrix,
  NodeStyle,
  Paint,
  TextData,
  TextRun,
} from '../core/model';
import { identity, transformBounds, union } from '../core/geometry';
import { openArchive, readJson, imageMime, dataUrl } from './archive';

// AGC is an undocumented versioned wire format. Its untrusted dynamic shape is
// contained in this adapter; the rest of the application sees only DesignNode.
type Raw = Record<string, any>;
const obj = (v: unknown): Raw =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.slice(0, 2000000) : fallback);
const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e7, Math.min(1e7, v)) : fallback;
const positive = (v: unknown, fallback = 0) => Math.max(0, num(v, fallback));
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function parseColor(input: unknown, fallback = '#000000'): string {
  const color = obj(input),
    value = color.value;
  if (typeof value === 'number') {
    const c = value >>> 0;
    return `rgba(${(c >>> 16) & 255}, ${(c >>> 8) & 255}, ${c & 255}, ${((c >>> 24) & 255) / 255})`;
  }
  const v = obj(value);
  if ('r' in v || 'g' in v || 'b' in v) {
    const channels = [v.r, v.g, v.b].map((x) => Math.round(Math.max(0, Math.min(255, num(x)))));
    const a = clamp(num(color.alpha, 1));
    return a === 1
      ? '#' + channels.map((x) => x.toString(16).padStart(2, '0')).join('')
      : `rgba(${channels.join(', ')}, ${a})`;
  }
  return fallback;
}
function matrix(raw: unknown): Matrix {
  const m = obj(raw);
  return [num(m.a, 1), num(m.b), num(m.c), num(m.d, 1), num(m.tx ?? m.e), num(m.ty ?? m.f)];
}
function weight(style: string): number {
  const s = style.toLowerCase();
  if (/black|heavy/.test(s)) return 900;
  if (/extra.?bold/.test(s)) return 800;
  if (/semi.?bold|demi/.test(s)) return 600;
  if (/bold/.test(s)) return 700;
  if (/medium/.test(s)) return 500;
  if (/thin/.test(s)) return 100;
  if (/extra.?light/.test(s)) return 200;
  if (/light/.test(s)) return 300;
  return 400;
}

export function parseXd(bytes: Uint8Array, name = '未命名.xd'): DesignDocument {
  const entries = openArchive(bytes),
    diagnostics: Diagnostic[] = [];
  const agcs: Record<string, Raw> = {};
  for (const [path, data] of Object.entries(entries))
    if (path.endsWith('.agc')) agcs[path] = obj(readJson(data, path));
  if (!Object.keys(agcs).length)
    throw new Error('找不到 graphicContent.agc；此 XD 版本或雲端文件格式尚不支援。');
  const resources = agcs['resources/graphics/graphicContent.agc'] ?? {};
  const artboardMeta: Raw = { ...obj(resources.artboards) };
  for (const agc of Object.values(agcs))
    if (!agc.artboards?.href) Object.assign(artboardMeta, obj(agc.artboards));
  const manifest = entries.manifest ? obj(readJson(entries.manifest, 'manifest')) : {};
  const manifestBoards: Raw = {};
  function readManifest(n: Raw) {
    if (n['uxdesign#bounds'])
      manifestBoards[str(n.path).replace('artboard-', '')] = {
        ...obj(n['uxdesign#bounds']),
        name: n.name,
      };
    arr(n.children).forEach((c) => readManifest(obj(c)));
  }
  readManifest(manifest);
  const assets: Record<string, Asset> = {};
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith('resources/')) continue;
    const mime = imageMime(data);
    if (mime) {
      const id = path.split('/').at(-1)!;
      assets[id] = { id, name: id, mime, data: dataUrl(data, mime) };
    }
  }
  const symbols = new Map<string, Raw>();
  const shared: Raw = { gradients: {}, clipPaths: {} };
  for (const agc of Object.values(agcs))
    for (const key of ['gradients', 'clipPaths'])
      Object.assign(shared[key], obj(agc.resources?.[key]));
  for (const agc of Object.values(agcs))
    for (const symbol of arr(agc.resources?.symbols)) symbols.set(str(symbol.id), obj(symbol));
  let sequence = 0;
  const used = new Set<string>();
  const warn = (code: string, message: string, nodeId?: string) => {
    if (diagnostics.length < 2000) diagnostics.push({ code, message, nodeId });
  };
  function paint(raw: unknown, id: string): Paint {
    const p = obj(raw);
    if (!p.type || p.type === 'none') return { type: 'none' };
    if (p.type === 'solid') return { type: 'solid', color: parseColor(p.color) };
    if (p.type === 'pattern') {
      const pattern = obj(p.pattern),
        ux = obj(pattern.meta?.ux);
      const assetId = str(ux.uid || pattern.href?.split('/').at(-1));
      if (!assets[assetId])
        warn('missing-image', `找不到內嵌圖片 ${assetId || '（無識別碼）'}，以佔位色呈現。`, id);
      return {
        type: 'image',
        assetId,
        fit:
          ux.scaleBehavior === 'contain'
            ? 'contain'
            : ux.scaleBehavior === 'stretch'
              ? 'stretch'
              : 'cover',
        ...(pattern.transform
          ? {
              transform: matrix(pattern.transform),
              width: positive(pattern.width),
              height: positive(pattern.height),
            }
          : {}),
      };
    }
    if (p.type === 'gradient') {
      const definition = obj(p.gradient),
        g = { ...obj(shared.gradients[definition.ref]), ...definition },
        coords = { ...g, ...obj(g.coords) };
      const type = /radial/.test(str(g.type)) ? 'radial' : 'linear';
      if (!/^(linear|radial)$/.test(str(g.type)))
        warn('gradient-type', `漸層 ${g.type} 以線性漸層近似。`, id);
      return {
        type,
        stops: arr(g.stops).map((s) => ({
          offset: clamp(num(s.offset ?? s.position)),
          color: parseColor(s.color),
        })),
        x1: num(coords.x1 ?? g.x1),
        y1: num(coords.y1 ?? g.y1),
        x2: num(coords.x2 ?? g.x2, 1),
        y2: num(coords.y2 ?? g.y2, 1),
      };
    }
    warn('fill', `尚未支援的填色：${str(p.type)}`, id);
    return { type: 'none' };
  }
  function style(raw: unknown, id: string): NodeStyle {
    const s = obj(raw),
      stroke = obj(s.stroke);
    const result: NodeStyle = {
      fill: paint(s.fill, id),
      opacity: clamp(num(s.opacity, 1)),
      shadows: [],
    };
    const dash = stroke.dashArray ?? stroke.dash;
    if (stroke.type && stroke.type !== 'none')
      result.stroke = {
        color: parseColor(stroke.color),
        width: positive(stroke.width, 1),
        align: ['inside', 'outside'].includes(stroke.align) ? stroke.align : 'center',
        ...(Array.isArray(dash) ? { dash: dash.map((n: unknown) => positive(n)) } : {}),
      };
    for (const filter of arr(s.filters)) {
      if (filter.visible === false || filter.enabled === false) continue;
      if (filter.type === 'dropShadow') {
        for (const shadow of arr(filter.params?.dropShadows))
          if (shadow.visible !== false)
            result.shadows.push({
              x: num(shadow.dx),
              y: num(shadow.dy),
              blur: positive(shadow.r),
              color: parseColor(shadow.color),
            });
      } else warn('filter', `尚未支援的效果：${str(filter.type)}。`, id);
    }
    if (s.blendMode && s.blendMode !== 'normal' && s.blendMode !== 'pass-through') {
      if (
        [
          'multiply',
          'screen',
          'overlay',
          'darken',
          'lighten',
          'color-dodge',
          'color-burn',
          'hard-light',
          'soft-light',
          'difference',
          'exclusion',
          'hue',
          'saturation',
          'color',
          'luminosity',
        ].includes(s.blendMode)
      )
        result.blendMode = s.blendMode;
      else warn('blend', `尚未支援的混合模式：${str(s.blendMode)}`, id);
    }
    return result;
  }
  function textData(raw: Raw): TextData {
    const t = obj(raw.text),
      f = obj(raw.style?.font),
      ux = obj(raw.meta?.ux),
      ps = obj(raw.style?.paragraph);
    const value = str(t.rawText ?? t.text),
      size = positive(f.size, 16),
      family = str(f.family, 'sans-serif');
    const lines = arr(t.paragraphs).flatMap((p) =>
      arr(p.lines).flatMap((line) =>
        arr(line).map((s) => ({ from: num(s.from), to: num(s.to), x: num(s.x), y: num(s.y) }))
      )
    );
    const runs: TextRun[] = [];
    let from = 0;
    for (const r of arr(ux.rangedStyles)) {
      const to = from + positive(r.length);
      runs.push({
        from,
        to,
        family: str(r.fontFamily, family),
        size: positive(r.fontSize, size),
        weight: weight(str(r.fontStyle, str(f.style))),
        italic: /italic|oblique/i.test(str(r.fontStyle, str(f.style))),
        spacing: (num(r.charSpacing) / 1000) * positive(r.fontSize, size),
        color: parseColor(r.fill, parseColor(raw.style?.fill?.color)),
      });
      from = to;
    }
    const lineHeight = positive(ps.lineHeight ?? ux.lineSpacing, size * 1.2);
    if (!lines.length) {
      let offset = 0;
      value.split('\n').forEach((line, i) => {
        lines.push({ from: offset, to: offset + line.length, x: 0, y: i * lineHeight });
        offset += line.length + 1;
      });
    }
    return {
      value,
      family,
      size,
      weight: weight(str(f.style)),
      italic: /italic|oblique/i.test(str(f.style)),
      spacing: (num(f.charSpacing) / 1000) * size,
      lineHeight,
      align: ps.align === 'center' ? 'center' : ps.align === 'right' ? 'right' : 'left',
      lines,
      runs,
      estimatedBounds: !t.frame?.width,
    };
  }
  function node(raw: Raw, depth = 0, chain: string[] = []): DesignNode {
    if (depth > 100 || ++sequence > 50000) throw new Error('圖層數量或巢狀深度超過安全上限。');
    let sourceId = str(raw.id, `layer-${sequence}`),
      id = sourceId;
    if (used.has(id)) id = `${sourceId}-${sequence}`;
    used.add(id);
    const type = str(raw.type),
      shape = obj(raw.shape),
      s = style(raw.style, id);
    let kind: DesignNode['kind'] = ['artboard', 'group', 'text'].includes(type)
      ? (type as DesignNode['kind'])
      : type === 'shape' && ['rect', 'ellipse', 'path', 'line'].includes(shape.type)
        ? shape.type
        : type === 'shape' && shape.type === 'circle'
          ? 'ellipse'
          : type === 'shape' && shape.type === 'compound' && shape.path
            ? 'path'
            : 'unsupported';
    const n: DesignNode = {
      id,
      sourceId,
      name: str(raw.name, kind === 'artboard' ? '未命名畫板' : sourceId),
      kind,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      transform: matrix(raw.transform),
      style: s,
      visible: raw.visible !== false,
      children: [],
    };
    if (type === 'syncRef') {
      const ref = str(raw.ref),
        symbol = symbols.get(ref);
      if (symbol && !chain.includes(ref)) {
        const resolved = node(
          {
            ...symbol,
            id: raw.id,
            name: raw.name ?? symbol.name,
            transform: raw.transform ?? symbol.transform,
          },
          depth + 1,
          [...chain, ref]
        );
        warn(
          'component-override',
          '元件已展開主元件；實例覆寫與狀態切換尚未完整支援。',
          resolved.id
        );
        return resolved;
      }
      warn('component', '找不到元件主定義或偵測到循環參照。', id);
    }
    if (type === 'symbol') n.kind = 'group';
    const rawChildren = arr(raw.children ?? raw[type]?.children ?? raw.group?.children);
    n.children = rawChildren.map((c) => node(obj(c), depth + 1, chain));
    const styleClip = shared.clipPaths[raw.style?.clipPath?.ref];
    if (styleClip)
      n.clip = node(
        { ...styleClip, type: 'group', id: `${id}-clip`, group: { children: styleClip.children } },
        depth + 1,
        chain
      );
    if (n.kind === 'artboard') {
      const meta = obj(
        artboardMeta[raw.artboard?.ref] ?? artboardMeta[sourceId] ?? manifestBoards[sourceId]
      );
      n.name = str(meta.name, n.name);
      n.bounds = {
        x: 0,
        y: 0,
        width: positive(meta.width ?? raw.artboard?.width, 1440),
        height: positive(meta.height ?? raw.artboard?.height, 900),
      };
      if (!meta.width && !raw.artboard?.width)
        warn('artboard-size', '缺少畫板尺寸，暫用 1440 × 900。', id);
      n.transform = identity(); // Document-space artboard offsets are not child offsets.
      n.viewportHeight = positive(meta.viewportHeight, n.bounds.height);
      if (s.fill.type === 'none') n.style.fill = { type: 'solid', color: '#ffffff' };
    } else if (n.kind === 'group') {
      const clipRaw = raw.group?.clipPath ?? raw.clipPath;
      if (clipRaw) {
        if (typeof clipRaw === 'string') {
          n.clip = n.children.find((c) => c.sourceId === clipRaw);
          n.children = n.children.filter((c) => c !== n.clip);
        } else n.clip = node(obj(clipRaw), depth + 1, chain);
      }
      n.bounds = n.clip
        ? transformBounds(n.clip.bounds, n.clip.transform)
        : union(n.children.map((c) => transformBounds(c.bounds, c.transform)));
    } else if (n.kind === 'rect') {
      n.bounds = {
        x: num(shape.x),
        y: num(shape.y),
        width: positive(shape.width),
        height: positive(shape.height),
      };
      const radius = Array.isArray(shape.r)
        ? shape.r
        : [
            shape.r ?? shape.rx ?? 0,
            shape.r ?? shape.rx ?? 0,
            shape.r ?? shape.rx ?? 0,
            shape.r ?? shape.rx ?? 0,
          ];
      n.radius = [0, 1, 2, 3].map((i) => positive(radius[i])) as [number, number, number, number];
    } else if (n.kind === 'ellipse') {
      n.bounds = {
        x: num(shape.cx) - positive(shape.rx ?? shape.r),
        y: num(shape.cy) - positive(shape.ry ?? shape.r),
        width: positive(shape.rx ?? shape.r) * 2,
        height: positive(shape.ry ?? shape.r) * 2,
      };
    } else if (n.kind === 'path' || n.kind === 'line') {
      n.path =
        n.kind === 'line'
          ? `M ${num(shape.x1)} ${num(shape.y1)} L ${num(shape.x2)} ${num(shape.y2)}`
          : str(shape.path ?? shape.d);
      try {
        const [x, y, x2, y2] = pathBounds(n.path);
        n.bounds = { x, y, width: x2 - x, height: y2 - y };
        if (!Object.values(n.bounds).every(Number.isFinite)) throw new Error();
      } catch {
        n.bounds = { x: 0, y: 0, width: 1, height: 1 };
        warn('path-bounds', '向量路徑邊界無法計算。', id);
      }
    } else if (n.kind === 'text') {
      n.text = textData(raw);
      const t = n.text,
        frame = obj(raw.text?.frame);
      const textBounds = t.lines.map((line) => ({
        x: line.x,
        y: line.y - t.size * 0.82,
        width: Math.max(
          1,
          Array.from(t.value.slice(line.from, line.to)).reduce(
            (w, char) => w + (/[\u2e80-\uffff]/.test(char) ? t.size : t.size * 0.56) + t.spacing,
            0
          )
        ),
        height: t.size * 1.2,
      }));
      n.bounds = union(textBounds);
      if (frame.type === 'area') {
        n.bounds.x = 0;
        n.bounds.y = 0;
      }
      if (frame.width) n.bounds.width = positive(frame.width);
      if (frame.height) n.bounds.height = positive(frame.height);
    } else {
      n.bounds = union(n.children.map((c) => transformBounds(c.bounds, c.transform)));
      if (!n.bounds.width) n.bounds = { x: 0, y: 0, width: 100, height: 40 };
      warn('node-type', `尚未支援的圖層：${type}${shape.type ? ` / ${shape.type}` : ''}。`, id);
    }
    if (raw.meta?.ux?.repeatGrid) warn('repeat-grid', '重複格線以儲存的子圖層呈現。', id);
    return n;
  }
  const artboards: DesignNode[] = [];
  for (const [path, agc] of Object.entries(agcs)) {
    if (!path.startsWith('artwork/')) continue;
    for (const raw of arr(agc.children)) {
      if (raw.type === 'artboard') artboards.push(node(obj(raw)));
      else if (!path.includes('pasteboard')) warn('root-node', `畫板根節點 ${raw.type} 尚不支援。`);
    }
    if (path.includes('pasteboard') && arr(agc.children).some((n) => n.type !== 'artboard'))
      warn('pasteboard', '畫板外的貼上區內容未匯入。');
  }
  if (!artboards.length) throw new Error('此檔案沒有可讀取的畫板。請確認含有本機保存的畫板內容。');
  if (Object.values(agcs).some((a) => arr(a.children).length)) {
    warn(
      'fonts',
      '字型使用本機已安裝字型。XD 通常不內嵌字型；缺字型會影響字寬。定位式文字的尺寸是估算值，基線位置仍保留。'
    );
    warn('prototype', '原始 XD 原型連線未匯入；請在「互動」面板設定此工具的互動。');
  }
  return {
    version: 1,
    name: name.replace(/\.xd$/i, ''),
    artboards,
    assets,
    diagnostics,
    source: 'xd',
  };
}
