import { strToU8, zipSync } from 'fflate';
import type { DesignDocument, DesignNode } from '../core/model';
import { filename, safeId } from '../core/escape';
import { renderAsset, renderMergedAsset } from '../render/svg';
import { desktop } from '../platform/desktop';

export interface AssetOptions {
  format: 'svg' | 'png';
  scale: 1 | 2 | 3;
  removeRadius: boolean;
  removeOpacity?: boolean;
  merge?: boolean;
}
export async function svgToPng(svg: string, scale = 1): Promise<Uint8Array> {
  await document.fonts.ready;
  const blob = new Blob([svg], { type: 'image/svg+xml' }),
    url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = Math.ceil(image.width * scale),
      height = Math.ceil(image.height * scale);
    if (width > 16384 || height > 16384 || width * height > 64000000)
      throw new Error('PNG 尺寸超過 64 百萬像素或單邊 16384 px，請降低倍率或匯出 SVG。');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('瀏覽器不支援 Canvas。');
    ctx.drawImage(image, 0, 0, width, height);
    const output = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 轉換失敗。'))), 'image/png')
    );
    return new Uint8Array(await output.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function exportAssets(
  doc: DesignDocument,
  nodes: DesignNode[],
  options: AssetOptions
): Promise<{ name: string; bytes: Uint8Array; mime: string }> {
  if (!nodes.length) throw new Error('請先選取至少一個圖層。');
  if (options.merge && nodes.length > 1) {
    const svg = renderMergedAsset(doc, nodes, options);
    const bytes = options.format === 'svg' ? strToU8(svg) : await svgToPng(svg, options.scale);
    if (bytes.byteLength > 256 * 1024 * 1024) throw new Error('匯出素材超過 256 MB，請分批匯出。');
    return {
      name: `${filename(doc.name)}-merged.${options.format}`,
      bytes,
      mime: options.format === 'svg' ? 'image/svg+xml' : 'image/png',
    };
  }
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  for (const node of nodes) {
    const svg = renderAsset(doc, node, options);
    const data = options.format === 'svg' ? strToU8(svg) : await svgToPng(svg, options.scale);
    total += data.byteLength;
    if (total > 256 * 1024 * 1024) throw new Error('匯出素材超過 256 MB，請分批匯出。');
    files[`${filename(node.name)}-${safeId(node.id)}.${options.format}`] = data;
  }
  if (nodes.length === 1)
    return {
      name: Object.keys(files)[0],
      bytes: Object.values(files)[0],
      mime: options.format === 'svg' ? 'image/svg+xml' : 'image/png',
    };
  return {
    name: `${filename(doc.name)}-assets.zip`,
    bytes: zipSync(files, { level: 6 }),
    mime: 'application/zip',
  };
}
export async function download(
  bytes: Uint8Array | string,
  name: string,
  mime: string
): Promise<boolean> {
  const native = desktop();
  if (native) {
    const data =
      typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
    return native.saveFile(name, data.buffer);
  }
  const blob = new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], {
      type: mime,
    }),
    url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
