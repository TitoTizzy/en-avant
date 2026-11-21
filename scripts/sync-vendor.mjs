import { copyFile, mkdir } from 'node:fs/promises';
await mkdir(new URL('../js/vendor/', import.meta.url), { recursive: true });
for (const [source, target] of [['dist/purify.min.js', 'purify.min.js'], ['LICENSE', 'DOMPurify-LICENSE']]) {
  await copyFile(new URL('../node_modules/dompurify/' + source, import.meta.url),
    new URL('../js/vendor/' + target, import.meta.url));
}
console.log('DOMPurify synchronisé.');
