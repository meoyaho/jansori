import { mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
const target = new URL('../.pages/', import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
// Only browser assets go into the public Pages artifact; never the project root.
for (const file of ['index.html', 'app.js', 'style.css']) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, target));
}
await writeFile(new URL('.nojekyll', target), '');
console.log('GitHub Pages files prepared in .pages/');
