import { unzipSync, strFromU8 } from 'fflate';

export const MAX_FILE_SIZE = 128 * 1024 * 1024;
const MAX_EXPANDED_SIZE = 384 * 1024 * 1024;
export function openArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.length > MAX_FILE_SIZE) throw new Error('檔案超過 128 MB 上限。請先分割設計文件。');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error('這不是有效的 XD ZIP 封裝。雲端捷徑請先在 XD 另存為本機 .xd。');
  let total = 0,
    count = 0;
  try {
    return unzipSync(bytes, {
      filter: (entry) => {
        count++;
        if (count > 20000) throw new Error('封裝項目過多。');
        if (entry.name.includes('..') || entry.name.startsWith('/') || entry.name.includes('\\'))
          throw new Error('封裝含不安全的路徑。');
        total += entry.originalSize;
        if (entry.originalSize > MAX_FILE_SIZE || total > MAX_EXPANDED_SIZE)
          throw new Error('解壓縮後的資料過大。');
        return /(?:\.agc$|^manifest$|^resources\/|^preview\/|^thumbnail)/i.test(entry.name);
      },
    });
  } catch (error) {
    throw new Error(`無法解壓縮 XD：${error instanceof Error ? error.message : String(error)}`);
  }
}
export function readJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(`XD 資料損毀：${path} 不是有效 JSON。`);
  }
}
export function imageMime(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (strFromU8(bytes.subarray(0, 4)) === 'RIFF' && strFromU8(bytes.subarray(8, 12)) === 'WEBP')
    return 'image/webp';
  if (strFromU8(bytes.subarray(0, 3)) === 'GIF') return 'image/gif';
}
export function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${mime};base64,${btoa(binary)}`;
}
