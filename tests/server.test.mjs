import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { instructions } from '../functions/prompt.mjs';

async function app(t, options = {}) {
  const server = createApp({ fetchImpl: async () => { throw Error('Unexpected upstream call'); }, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, post: (data, headers = {}) => fetch(`${url}/api/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) }) };
}
const completed = text => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text }] }] }), { status: 200 });

test('key is required; secrets and server source are never served', async t => {
  const { url, post } = await app(t);
  assert.equal((await post({ text: '결혼은 언제 하니?' })).status, 503);
  for (const path of ['/.env', '/.env.example', '/server.mjs', '/tests/server.test.mjs', '/package.json']) assert.equal((await fetch(url + path)).status, 404);
  assert.equal((await fetch(url + '/')).status, 200);
});

test('invalid text, oversized bodies and direction overrides never call OpenAI', async t => {
  const { post } = await app(t, { apiKey: 'test-only' });
  for (const body of [null, {}, { text: ' ' }, { text: 12 }, { text: '가'.repeat(301) }, { text: '좋은 하루', direction: 'reverse' }, { text: '안녕', model: 'other' }]) assert.equal((await post(body)).status, 400);
  assert.equal((await post({ text: '가'.repeat(3000) })).status, 413);
  assert.equal((await post({ text: '안녕' }, { Origin: 'https://unrelated.example' })).status, 403);
});

test('fixed Luna model and configured instructions; identical input reuses result', async t => {
  let calls = 0;
  const { post } = await app(t, { apiKey: 'test-only', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5.6-luna'); assert.equal(body.store, false);
    assert.equal(body.reasoning.effort, 'none'); assert.equal(body.max_output_tokens, 512);
    assert.equal(body.instructions, instructions);
    assert.equal(body.input, '결혼은 언제 하니?');
    return completed('좋은 인연 만나서 서로 아끼고 잘 살면 좋겠다.');
  } });
  for (let i = 0; i < 2; i++) assert.deepEqual(await (await post({ text: '결혼은 언제 하니?' })).json(), { text: '좋은 인연 만나서 서로 아끼고 잘 살면 좋겠다.' });
  assert.equal(calls, 1);
});

test('upstream error details do not leak into browser response', async t => {
  const { post } = await app(t, { apiKey: 'test-only', fetchImpl: async () => new Response('sensitive upstream error', { status: 401 }) });
  const res = await post({ text: '취업은?' });
  assert.equal(res.status, 502); assert.doesNotMatch(await res.text(), /sensitive|test-only/);
});

test('incomplete generation is an error, never a canned or partial translation', async t => {
  const { post } = await app(t, { apiKey: 'test-only', fetchImpl: async () => new Response(JSON.stringify({ status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial' }] }] })) });
  const res = await post({ text: '취업은?' });
  assert.equal(res.status, 502); assert.doesNotMatch(await res.text(), /partial/);
});

test('upstream timeout ends the request', async t => {
  const { post } = await app(t, { apiKey: 'test-only', timeoutMs: 20, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })) });
  assert.equal((await post({ text: '취업은?' })).status, 504);
});
