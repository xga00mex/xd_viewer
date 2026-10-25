import type { DesignNode, Paint } from '../core/model';
import { cssString } from '../core/escape';
import { round } from '../core/geometry';

export function paintCss(p: Paint): string {
  if (p.type === 'solid') return p.color;
  if (p.type === 'none' || p.type === 'image') return 'transparent';
  const stops = p.stops.map((s) => `${s.color} ${round(s.offset * 100)}%`).join(', ');
  return p.type === 'linear'
    ? `linear-gradient(${round((Math.atan2(p.x2 - p.x1, -(p.y2 - p.y1)) * 180) / Math.PI)}deg, ${stops})`
    : `radial-gradient(circle at ${p.x1 * 100}% ${p.y1 * 100}%, ${stops})`;
}
export function appearance(node: DesignNode): Record<string, string> {
  const style: Record<string, string> = { opacity: String(round(node.style.opacity)) };
  if (node.kind === 'text' && node.text) {
    const t = node.text;
    Object.assign(style, {
      'font-family': `${cssString(t.family)}, sans-serif`,
      'font-size': `${t.size}px`,
      'font-weight': String(t.weight),
      'font-style': t.italic ? 'italic' : 'normal',
      'line-height': `${t.lineHeight}px`,
      'letter-spacing': `${round(t.spacing)}px`,
      'text-align': t.align,
      color: paintCss(node.style.fill),
      'white-space': 'pre-wrap',
    });
  } else style.background = paintCss(node.style.fill);
  if (node.radius) style['border-radius'] = node.radius.map((r) => `${round(r)}px`).join(' ');
  if (node.kind === 'ellipse') style['border-radius'] = '50%';
  if (node.style.stroke)
    style.border = `${round(node.style.stroke.width)}px solid ${node.style.stroke.color}`;
  if (node.style.shadows.length)
    style['box-shadow'] = node.style.shadows
      .map((s) => `${round(s.x)}px ${round(s.y)}px ${round(s.blur)}px ${s.color}`)
      .join(', ');
  if (node.style.blendMode) style['mix-blend-mode'] = node.style.blendMode;
  return style;
}
export const declarations = (styles: Record<string, string>) =>
  Object.entries(styles)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
export function inspectCss(node: DesignNode): string {
  const b = node.bounds,
    m = node.transform;
  return declarations({
    position: 'absolute',
    left: `${round(m[4] + m[0] * b.x + m[2] * b.y)}px`,
    top: `${round(m[5] + m[1] * b.x + m[3] * b.y)}px`,
    width: `${round(b.width)}px`,
    height: `${round(b.height)}px`,
    ...appearance(node),
    ...(m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 1
      ? {
          transform: `matrix(${m.slice(0, 4).map(round).join(', ')}, 0, 0)`,
          'transform-origin': '0 0',
        }
      : {}),
  }).trimStart();
}
