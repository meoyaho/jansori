import { instructions } from './prompt.mjs';

// Shared by the local Node server and Firebase's HTTP function.
export function createTranslationHandler({
  apiKey = '', fetchImpl = fetch, timeoutMs = 25000,
  allowedOrigins = [], allowSameOrigin = false,
} = {}) {
  const cache = new Map();
  let active = 0, windowStart = Date.now(), requests = 0;
  function json(res, status, data) {
    if (res.destroyed) return;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(data));
  }
  return async (req, res) => {
    try {
      const origin = req.headers.origin;
      const sameOrigin = allowSameOrigin && origin && new URL(origin).host === req.headers.host;
      const allowed = origin && (allowedOrigins.includes(origin) || sameOrigin);
      if ((origin && !allowed) || (!origin && req.headers['sec-fetch-site'] === 'cross-site')) {
        json(res, 403, { error: '허용되지 않은 요청입니다.' }); return;
      }
      res.setHeader('Vary', 'Origin');
      if (allowed) res.setHeader('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        if (!allowed || req.headers['access-control-request-method'] !== 'POST') {
          json(res, 403, { error: '허용되지 않은 요청입니다.' }); return;
        }
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '3600');
        res.writeHead(204); res.end(); return;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        json(res, 405, { error: 'POST 요청만 지원합니다.' }); return;
      }
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
        json(res, 415, { error: 'JSON 요청이 필요합니다.' }); return;
      }
      let raw;
      if (Buffer.isBuffer(req.rawBody)) {
        // Firebase has already consumed the request stream.
        raw = req.rawBody;
      } else {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4096) { json(res, 413, { error: '입력은 300자 이내로 작성해 주세요.' }); return; }
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks);
      }
      if (raw.length > 4096) { json(res, 413, { error: '입력은 300자 이내로 작성해 주세요.' }); return; }
      let body;
      try { body = JSON.parse(raw.toString('utf8')); }
      catch { json(res, 400, { error: '잘못된 요청입니다.' }); return; }
      if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 300 || Object.keys(body).some(key => key !== 'text')) {
        json(res, 400, { error: '잔소리를 1~300자로 입력해 주세요.' }); return;
      }
      const key = typeof apiKey === 'function' ? apiKey() : apiKey;
      if (!key?.trim()) { json(res, 503, { error: 'API 키 설정이 필요합니다.', code: 'API_KEY_MISSING' }); return; }
      const text = body.text.trim();
      const cached = cache.get(text);
      if (cached && cached.expires > Date.now()) { json(res, 200, { text: cached.text }); return; }
      if (Date.now() - windowStart >= 60000) { requests = 0; windowStart = Date.now(); }
      if (requests >= 30 || active >= 3) {
        res.setHeader('Retry-After', '10'); json(res, 429, { error: '잠시 후 다시 번역해 주세요.' }); return;
      }
      requests++; active++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onClose = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', onClose);
      try {
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: 'gpt-5-nano', instructions, input: text,
            reasoning: { effort: 'minimal' }, text: { verbosity: 'low' },
            max_output_tokens: 512, store: false,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = response.status === 429 ? 'API 사용량 또는 요청 한도에 도달했어요.' : [401, 403].includes(response.status) ? 'API 키 또는 모델 접근 권한을 확인해 주세요.' : '번역 서비스에 연결하지 못했어요.';
          json(res, response.status === 429 ? 429 : 502, { error }); return;
        }
        const data = await response.json();
        const result = data.output?.filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
        if (data.status !== 'completed' || !result) { json(res, 502, { error: '번역을 완료하지 못했어요. 다시 시도해 주세요.' }); return; }
        cache.set(text, { text: result, expires: Date.now() + 10 * 60 * 1000 });
        if (cache.size > 100) cache.delete(cache.keys().next().value);
        json(res, 200, { text: result });
      } catch {
        json(res, controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? '번역 시간이 초과됐어요. 다시 시도해 주세요.' : '번역 서비스에 연결하지 못했어요.' });
      } finally { active--; clearTimeout(timer); res.off('close', onClose); }
    } catch { json(res, 400, { error: '요청을 처리하지 못했어요.' }); }
  };
}
