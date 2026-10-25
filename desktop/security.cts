import path from 'node:path';

export const APP_URL = 'xd-local://app/index.html';
export function trustedRenderer(url: string): boolean {
  return url === APP_URL;
}
export function assetPath(root: string, url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'xd-local:' || parsed.hostname !== 'app') return;
    const pathname = decodeURIComponent(parsed.pathname);
    if (pathname.includes('\\') || pathname.includes('\0')) return;
    const result = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, result);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return;
    return result;
  } catch {
    return;
  }
}
export function safeSaveName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('無效檔名');
  return (
    value
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .replace(/[. ]+$/g, '')
      .slice(0, 150) || 'export'
  );
}
export function validateWorkspace(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 180 * 1024 * 1024) throw new Error('工作檔過大');
  const parsed = JSON.parse(value);
  if (parsed?.format !== 'xd-local-project' || parsed?.version !== 1)
    throw new Error('工作檔格式不符');
}
