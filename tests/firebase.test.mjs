import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createTranslationHandler } from '../functions/translate.mjs';

const origin = 'https://meoyaho.github.io';
async function cloudApp(t, options = {}) {
  const handler = createTranslationHandler({ allowedOrigins: [origin], ...options });
  const server = http.createServer(async (req, res) => {
    // Emulate Firebase consuming the body before invoking the function.
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    req.rawBody = Buffer.concat(chunks);
    await handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/translate`;
}

test('GitHub Pages preflight is allowed; arbitrary sites and subdomains are denied', async t => {
  let called = false;
  const url = await cloudApp(t, { fetchImpl: async () => { called = true; } });
  const headers = { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' };
  const allowed = await fetch(url, { method: 'OPTIONS', headers });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  assert.equal(allowed.headers.get('access-control-allow-methods'), 'POST');
  for (const other of ['https://evil.example', 'https://meoyaho.github.io.evil.example', 'https://other.github.io']) {
    const denied = await fetch(url, { method: 'OPTIONS', headers: { ...headers, Origin: other } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(called, false);
});

test('Firebase rawBody and lazy secret work with a cross-site Pages request', async t => {
  let secretReads = 0;
  const url = await cloudApp(t, {
    apiKey: () => { secretReads++; return 'test-only'; },
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      assert.equal(JSON.parse(options.body).input, '취업은 언제 하니?');
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '좋은 직장 만나서 하는 일 잘 풀려라.' }] }] }));
    },
  });
  assert.equal(secretReads, 0);
  const response = await fetch(url, {
    method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '취업은 언제 하니?' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.deepEqual(await response.json(), { text: '좋은 직장 만나서 하는 일 잘 풀려라.' });
  assert.equal(secretReads, 1);
});

test('Firebase parsed requests still reject invalid and oversized bodies with CORS errors readable by Pages', async t => {
  const url = await cloudApp(t);
  for (const [body, status] of [['invalid-json', 400], [JSON.stringify({ text: '가'.repeat(2000) }), 413]]) {
    const response = await fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
});
