import type { DesignDocument, DesignNode, FontAsset } from './model';
import { flatten } from './model';
import { cssString, safeId } from './escape';
import { dataUrl } from '../parser/archive';
import fallbackData from '../../assets/fonts/NotoSansTC.woff2?inline';
import fallbackLicense from '../../assets/fonts/OFL.txt?raw';

export const fallbackFamily = 'Noto Sans TC';
export const fontStack = (family: string) =>
  `${cssString(family)}, ${cssString(fallbackFamily)}, sans-serif`;
export const fallbackRule = `/* Noto Sans TC\n${fallbackLicense.replaceAll('*/', '* /')}\n*/\n@font-face { font-family: "Noto Sans TC"; src: url("${fallbackData}") format("woff2"); font-weight: 100 900; font-style: normal; font-display: block; }`;

/** FontFaceSet.check alone reports true for absent system fonts. Compare actual
 * metrics against multiple generic faces instead, without network requests. */
export function missingFonts(
  nodes: DesignNode[],
  fonts: Record<string, FontAsset> = {},
  available = systemFontAvailable
): string[] {
  const embedded = new Set(Object.values(fonts).map((f) => f.family));
  return usedFonts(nodes).filter((f) => f !== fallbackFamily && !embedded.has(f) && !available(f));
}
function systemFontAvailable(family: string): boolean {
  if (['serif', 'sans-serif', 'monospace', 'system-ui'].includes(family)) return true;
  if (typeof FontFace === 'undefined') return true;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;
  const sample = 'mmmmmmmmWWWWii123456漢字繁體';
  return ['monospace', 'serif', 'sans-serif'].some((generic) => {
    ctx.font = `72px ${generic}`;
    const baseline = ctx.measureText(sample).width;
    ctx.font = `72px ${cssString(family)}, ${generic}`;
    return Math.abs(ctx.measureText(sample).width - baseline) > 0.01;
  });
}

export function usedFonts(nodes: DesignNode[]): string[] {
  return [
    ...new Set(
      flatten(nodes)
        .flatMap((n) => (n.text ? [n.text.family, ...n.text.runs.map((r) => r.family)] : []))
        .concat(
          flatten(nodes).flatMap(
            (n) => n.component?.states.flatMap((s) => usedFonts([s.node])) ?? []
          )
        )
    ),
  ];
}
export function fontRules(
  document: DesignDocument,
  nodes?: DesignNode[],
  paths?: Record<string, string>
): string {
  const families = nodes ? new Set(usedFonts(nodes)) : undefined;
  return [
    !families || families.size ? fallbackRule : '',
    ...Object.values(document.fonts ?? {})
      .filter((f) => !families || families.has(f.family))
      .map(
        (font) =>
          `@font-face { font-family: ${cssString(font.family)}; src: url(${cssString(paths?.[font.id] ?? font.data)}); font-weight: ${font.weight}; font-style: ${font.style}; font-display: block; }`
      ),
  ].join('\n');
}
export async function readFont(
  file: File,
  family: string,
  weight: number,
  style: 'normal' | 'italic'
): Promise<FontAsset> {
  if (!family.trim() || family.length > 200)
    throw new Error('請輸入設計稿使用的字型名稱（最多 200 字）。');
  if (!Number.isFinite(weight) || weight < 100 || weight > 900)
    throw new Error('字重需介於 100–900。');
  if (file.size > 20 * 1024 * 1024) throw new Error('單一字型檔請勿超過 20 MB。');
  const bytes = new Uint8Array(await file.arrayBuffer()),
    signature = String.fromCharCode(...bytes.subarray(0, 4));
  const mime =
    signature === 'wOF2'
      ? 'font/woff2'
      : signature === 'wOFF'
        ? 'font/woff'
        : signature === 'OTTO'
          ? 'font/otf'
          : bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0
            ? 'font/ttf'
            : undefined;
  if (!mime) throw new Error('無法識別字型格式，請使用 WOFF2、WOFF、TTF 或 OTF。');
  return {
    id: safeId(`${family.trim()}-${weight}-${style}`),
    name: file.name,
    family: family.trim(),
    weight,
    style,
    mime,
    data: dataUrl(bytes, mime),
  };
}

/** Registers local faces for HTML text and waits before SVG/Canvas exports. */
export class FontRegistry {
  private faces: FontFace[] = [];
  private version = 0;
  async load(fonts: Record<string, FontAsset> = {}): Promise<void> {
    const version = ++this.version;
    const loaded: FontFace[] = [];
    try {
      if (typeof FontFace !== 'undefined') {
        const fallback = new FontFace(fallbackFamily, `url("${fallbackData}")`, {
          weight: '100 900',
        });
        await fallback.load();
        loaded.push(fallback);
      }
      for (const font of Object.values(fonts)) {
        const face = new FontFace(font.family, `url(${cssString(font.data)})`, {
          weight: String(font.weight),
          style: font.style,
        });
        await face.load();
        loaded.push(face);
      }
    } catch {
      throw new Error('字型無法載入。請確認檔案有效，且字重與字型名稱設定正確。');
    }
    if (version !== this.version) return;
    this.faces.forEach((face) => document.fonts.delete(face));
    this.faces = loaded;
    loaded.forEach((face) => document.fonts.add(face));
  }
  clear() {
    this.version++;
    this.faces.forEach((face) => document.fonts.delete(face));
    this.faces = [];
  }
}
