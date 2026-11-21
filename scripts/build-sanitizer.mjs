import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'api/_lib/vendor');
await mkdir(out, { recursive: true });
const result = await build({ absWorkingDir: root, entryPoints: ['sanitize-html'], bundle: true,
  platform: 'node', format: 'cjs', target: 'node22', outfile: join(out, 'sanitize-html.cjs'),
  legalComments: 'linked', metafile: true });
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const prefix = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1];
  if (prefix) packages.add(prefix);
}
const licenses = [];
for (const directory of packages) {
  const dir = join(root, directory);
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  for (const name of await readdir(dir)) {
    if (/^(license|licence|copying)(\.|$)/i.test(name)) {
      licenses.push(`${pkg.name}@${pkg.version}\n${await readFile(join(dir, name), 'utf8')}`);
    }
  }
}
await writeFile(join(out, 'sanitize-html-LICENSES.txt'), licenses.join('\n\n--------------------\n\n'));
console.log('Sanitize-html compiled for Node 22 without require(esm).');
