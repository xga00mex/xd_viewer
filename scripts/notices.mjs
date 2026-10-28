import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const require = createRequire(import.meta.url),
  seen = new Set(),
  sections = [];
const mit = await readFile(new URL('node_modules/fflate/LICENSE', root), 'utf8');
async function collect(name) {
  if (seen.has(name)) return;
  seen.add(name);
  let directory = path.dirname(require.resolve(name)),
    packagePath;
  while (directory !== path.dirname(directory)) {
    const candidate = path.join(directory, 'package.json');
    try {
      if (JSON.parse(await readFile(candidate, 'utf8')).name === name) {
        packagePath = candidate;
        break;
      }
    } catch {}
    directory = path.dirname(directory);
  }
  if (!packagePath) throw new Error('Missing metadata for ' + name);
  const folder = path.dirname(packagePath),
    metadata = JSON.parse(await readFile(packagePath, 'utf8'));
  const file = (await readdir(folder)).find((name) => /^licen[cs]e(?:\.|$)/i.test(name));
  let license;
  if (file) license = await readFile(path.join(folder, file), 'utf8');
  else if (metadata.license === 'MIT') {
    const readme = await readFile(path.join(folder, 'readme.md'), 'utf8');
    const notice =
      readme.match(/MIT ©[^\r\n]+/)?.[0] ??
      (metadata.author
        ? `MIT License\nAuthor: ${typeof metadata.author === 'string' ? metadata.author : metadata.author.name}`
        : undefined);
    if (!notice) throw new Error('Missing copyright notice for ' + name);
    license = notice + '\n\n' + mit.slice(mit.indexOf('Permission is hereby granted'));
  } else throw new Error('Missing license for ' + name);
  sections.push(
    `${name} ${metadata.version}\n${typeof metadata.repository === 'string' ? metadata.repository : (metadata.repository?.url ?? '')}\n\n${license.trim()}`
  );
  for (const dep of Object.keys(metadata.dependencies ?? {})) await collect(dep);
}
for (const name of Object.keys(pkg.dependencies)) await collect(name);
sections.push(
  'Noto Sans TC — bundled offline fallback (WOFF2)\nhttps://github.com/google/fonts/tree/main/ofl/notosanstc\n\n' +
    (await readFile(new URL('assets/fonts/OFL.txt', root), 'utf8'))
);
await writeFile(
  new URL('THIRD_PARTY_NOTICES.txt', root),
  'XD Local bundled renderer dependencies\nElectron and Chromium notices are also included with the packaged runtime.\n\n' +
    sections
      .map((s) =>
        s
          .trim()
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .join('\n')
      )
      .join('\n\n----------------------------------------\n\n') +
    '\n'
);
