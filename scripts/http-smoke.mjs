import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { request } from 'node:http';

const origin = `http://127.0.0.1:${process.env.XD_LOCAL_PORT || 4173}`;
const response = await fetch(origin);
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type'), /text\/html/);
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
assert.match(await response.text(), /XV/);
for (const filename of await readdir(new URL('../dist/assets/', import.meta.url))) {
  const asset = await fetch(`${origin}/assets/${filename}`);
  assert.equal(asset.status, 200, filename);
  assert((await asset.arrayBuffer()).byteLength > 0, filename);
}
assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
assert.equal((await fetch(origin + '/..%5cpackage.json')).status, 403);
assert.equal((await fetch(origin + '/missing')).status, 404);
const untrustedHostStatus = await new Promise((resolve, reject) => {
  const req = request(origin, { headers: { host: 'untrusted.example' } }, (response) => {
    response.resume();
    resolve(response.statusCode);
  });
  req.on('error', reject);
  req.end();
});
assert.equal(untrustedHostStatus, 403);
const head = await fetch(origin, { method: 'HEAD' });
assert.equal(head.status, 200);
assert.equal(await head.text(), '');
console.log(
  'Local HTTP smoke passed: HTML/assets, HEAD, method restriction, host validation, path isolation.'
);
