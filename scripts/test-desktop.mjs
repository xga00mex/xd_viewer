// Verify the Electron runtime and packaged resources via APIs, without creating a window.
import { spawn } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dev = process.argv.includes('--development');
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const exe = path.resolve(
  dev ? 'node_modules/electron/dist/electron.exe' : `release/XV-${version}-Windows-x64.exe`
);
const report = path.resolve(
  dev ? '.cache/desktop/development-verification.json' : 'release/desktop-verification.json'
);
await mkdir(path.dirname(report), { recursive: true });
await rm(report, { force: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = [...(dev ? ['.'] : []), '--self-test', `--diagnostic-report=${report}`];
await new Promise((resolve, reject) => {
  const child = spawn(exe, args, { env, windowsHide: true, stdio: 'inherit' });
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error('Desktop diagnostic timed out'));
  }, 90000);
  child.on('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.on('exit', (code) => {
    clearTimeout(timeout);
    code === 0 ? resolve() : reject(new Error(`Desktop diagnostic exit ${code}`));
  });
});
const result = JSON.parse(await readFile(report, 'utf8'));
assert.equal(result.ok, true);
assert.equal(result.packaged, !dev);
assert(result.assets >= 2);
console.log(JSON.stringify(result, null, 2));
