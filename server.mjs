import http from 'node:http';
import { createTranslationHandler } from './functions/translate.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
export function createApp(options = {}) {
  const translate = createTranslationHandler({ ...options, allowSameOrigin: true });
  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/api/translate') { await translate(req, res); return; }
      const file = publicFiles.get(path);
      if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
      const data = await readFile(resolve(root, file[0]));
      res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(400); res.end('Bad request'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('.env 파일을 읽을 수 없습니다.'); }
  const args = process.argv.slice(2);
  const port = Number(process.env.PORT || (args.includes('--port') ? args[args.indexOf('--port') + 1] : 3000));
  createApp({ apiKey: process.env.OPENAI_API_KEY || '' }).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`덕담 번역기 → http://localhost:${port}`));
}
