// Read-only local audit. Never print reference text or persist extracted content.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

const reference = process.env.XD_TEST_FILE;
if (!reference) throw new Error('Set XD_TEST_FILE to a local reference document.');
const entries = unzipSync(readFileSync(reference));
const text = new Set(),
  ids = new Set(),
  images = [];
function collect(value, key = '') {
  if (typeof value === 'string') {
    if (key === 'rawText' && value.trim().length >= 8) text.add(value.trim());
    if (/^(id|guid|uid|syncSourceGuid)$/i.test(key) && /^[\da-f-]{30,}$/i.test(value))
      ids.add(value);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, k);
  }
}
for (const [name, bytes] of Object.entries(entries)) {
  if (/\.(agc|json)$/.test(name)) {
    try {
      collect(JSON.parse(strFromU8(bytes)));
    } catch {}
  } else if (/\.(png|jpe?g|webp|gif)$/i.test(name)) images.push(Buffer.from(bytes));
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const imageHashes = new Set(images.map(hash));
const imagePrefixes = images
  .filter((image) => image.length > 128)
  .map((image) => image.toString('base64').slice(0, 512));
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'])
  .toString()
  .split('\0')
  .filter(Boolean);
// Optional generated text artifacts can be audited without adding them to Git.
files.push(...process.argv.slice(2));
const hits = [];
for (const file of new Set(files)) {
  if (!existsSync(file) || file.startsWith('tests/fixtures/')) continue;
  const bytes = readFileSync(file),
    source = bytes.includes(0) ? '' : bytes.toString('utf8');
  // Embedded font/image payloads cannot contain literal source text. Their image
  // prefixes and binary hashes are still checked against the untouched source.
  const literalSource = source.replace(/data:(?:font|image)\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g, '');
  const texts = [...text].filter((value) => literalSource.includes(value));
  const identifiers = [...ids].filter((value) => literalSource.includes(value));
  const embedded = imagePrefixes.some((prefix) => source.includes(prefix));
  if (texts.length || identifiers.length || embedded || imageHashes.has(hash(bytes)))
    hits.push({
      file,
      textMatches: texts.length,
      textHashes: texts.map(hash),
      identifierMatches: identifiers.length,
      imageMatch: embedded || imageHashes.has(hash(bytes)),
    });
}
console.log(JSON.stringify({ scannedFiles: files.length, findings: hits }, null, 2));
if (hits.length) process.exitCode = 1;
