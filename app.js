const paths = {
  star:'<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/>',
  history:'<path d="M3 3v6h6M3.5 9A9 9 0 1 1 3 15M12 7v5l3 2"/>',
  mic:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  translate:'<path d="M3 5h12M9 3v2M5 5c1 6 5 8 8 10M12 5c-1 6-5 9-9 11M14 21l4-10 4 10M15.5 17h5"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.2.8-1.5 1-1.5 2.5M12 17h.01"/>',
  keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  volume:'<path d="m11 4-6 5H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  audio:'<path d="M3 10v4M7 6v12M12 3v18M17 7v10M21 10v4"/>',
  shield:'<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  corner:'<path d="M5 4v8h13m-5-5 5 5-5 5"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12a24 24 0 0 0 18 0M10 12h4v4h-4z"/>',
  sprout:'<path d="M12 21v-9M12 15C4 15 3 9 3 6c7 0 9 4 9 9ZM12 11c0-7 5-8 9-8 0 6-4 9-9 8Z"/>',
};
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[el.dataset.icon] || ''}</svg>`; });
const $ = id => document.getElementById(id);
let current = null;
let recognition = null;
let listenTimeout, translationTimer, toastTimer;
let composing = false;
let pendingTranslation = null;
let requestVersion = 0;
const translationCache = new Map();
let collection = 'saved';
function readRecords(storage, key) {
  try {
    const data = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(data) ? data.filter(x => x && typeof x.source === 'string' && typeof x.result === 'string').slice(0, 100) : [];
  } catch { return []; }
}
let saved = [];
let history = [];
try { saved = readRecords(localStorage, 'deokdam-saved'); } catch {}
try { history = readRecords(sessionStorage, 'deokdam-history'); } catch {}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800);
}
function updateInput() {
  const length = $('source').value.length;
  $('char-count').textContent = `${length} / 300`;
  $('char-count').hidden = !length;
  $('clear').hidden = !length;
}
function updateSave() {
  $('save').setAttribute('aria-pressed', String(!!current && saved.some(x => x.source === current.source && x.result === current.result)));
}
function display(record) {
  current = record;
  $('result').textContent = record ? record.result : '번역';
  $('result').classList.toggle('placeholder', !record);
  $('save').hidden = !record;
  $('result-actions').hidden = !record;
  updateSave();
}
function cancelTranslation() {
  clearTimeout(translationTimer);
  translationTimer = null;
  requestVersion++;
  pendingTranslation?.controller.abort();
  pendingTranslation = null;
  $('result').setAttribute('aria-busy', 'false');
}
function remember(record) {
  display(record);
  history = [record, ...history.filter(x => x.source !== record.source)].slice(0, 30);
  try { sessionStorage.setItem('deokdam-history', JSON.stringify(history)); } catch {}
}
async function translate() {
  clearTimeout(translationTimer);
  translationTimer = null;
  const source = $('source').value.trim();
  if (pendingTranslation?.source === source) return;
  cancelTranslation();
  if (!source) { display(null); return; }
  if (translationCache.has(source)) {
    remember({ source, result: translationCache.get(source), date: Date.now() }); return;
  }
  const version = requestVersion;
  const controller = new AbortController();
  pendingTranslation = { source, controller };
  const timer = setTimeout(() => controller.abort(), 30000);
  display(null);
  $('result').textContent = '번역 중…';
  $('result').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: source }), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '번역하지 못했어요.');
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('번역 결과가 비어 있어요.');
    if (version !== requestVersion) return;
    translationCache.set(source, data.text);
    if (translationCache.size > 50) translationCache.delete(translationCache.keys().next().value);
    remember({ source, result: data.text, date: Date.now() });
  } catch (error) {
    if (version !== requestVersion) return;
    display(null);
    $('result').textContent = '번역하지 못했어요';
    toast(error.name === 'AbortError' ? '번역 시간이 초과됐어요. 다시 시도해 주세요.' : error.message);
  } finally {
    clearTimeout(timer);
    if (version === requestVersion) { pendingTranslation = null; $('result').setAttribute('aria-busy', 'false'); }
  }
}
function queueTranslation() {
  cancelTranslation();
  updateInput();
  display(null);
  if (!composing && $('source').value.trim()) translationTimer = setTimeout(translate, 1100);
}
$('source').addEventListener('input', () => { stopListening(); queueTranslation(); });
$('source').addEventListener('compositionstart', () => { composing = true; cancelTranslation(); });
$('source').addEventListener('compositionend', () => { composing = false; queueTranslation(); });
$('source').addEventListener('keydown', event => {
  if (!event.isComposing && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); translate(); }
});
$('clear').onclick = () => {
  cancelTranslation(); stopListening();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  $('source').value = ''; updateInput(); display(null); $('source').focus();
};
function setMode(voice) {
  $('text-mode').classList.toggle('active', !voice);
  $('voice-mode').classList.toggle('active', voice);
  $('text-mode').setAttribute('aria-pressed', String(!voice));
  $('voice-mode').setAttribute('aria-pressed', String(voice));
}
$('edit').onclick = $('text-mode').onclick = () => { stopListening(); $('source').focus(); };
$('save').onclick = () => {
  if (!current) return;
  const index = saved.findIndex(x => x.source === current.source && x.result === current.result);
  const next = [...saved];
  if (index >= 0) next.splice(index, 1); else next.unshift({ ...current });
  try { localStorage.setItem('deokdam-saved', JSON.stringify(next.slice(0, 100))); saved = next.slice(0, 100); updateSave(); toast(index >= 0 ? '저장 해제됨' : '저장됨'); }
  catch { toast('저장할 수 없어요. 복사를 이용해 주세요.'); }
};
$('copy').onclick = async () => {
  if (!current) return;
  try { await navigator.clipboard.writeText(current.result.replaceAll('\n', ' ')); toast('복사됨'); }
  catch { toast('문장을 선택해 복사해 주세요.'); }
};
$('speak').onclick = () => {
  if (!current) return;
  if (!('speechSynthesis' in window)) { toast('음성 재생을 지원하지 않아요.'); return; }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(current.result);
  utterance.lang = 'ko-KR'; utterance.rate = .9;
  utterance.onerror = event => { if (!['interrupted', 'canceled'].includes(event.error)) toast('음성을 재생하지 못했어요.'); };
  speechSynthesis.speak(utterance);
};
function renderCollection() {
  $('collection-title').textContent = collection === 'saved' ? '저장된 번역' : '기록';
  const records = collection === 'saved' ? saved : history;
  const list = $('collection-list'); list.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p'); empty.className = 'collection-empty';
    empty.textContent = collection === 'saved' ? '저장된 번역이 없습니다.' : '번역 기록이 없습니다.';
    list.append(empty); return;
  }
  records.forEach(item => {
    const row = document.createElement('article'); row.className = 'record';
    const content = document.createElement('button'); content.className = 'record-content';
    const source = document.createElement('span'); source.textContent = item.source;
    const result = document.createElement('strong'); result.textContent = item.result;
    content.append(source, result);
    content.onclick = () => { cancelTranslation(); $('source').value = item.source; updateInput(); display(item); $('collection-dialog').close(); };
    const remove = document.createElement('button'); remove.className = 'icon-button'; remove.setAttribute('aria-label', `${item.source} 삭제`); remove.title = '삭제';
    remove.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths.close}</svg>`;
    remove.onclick = () => {
      const next = records.filter(x => x !== item);
      try {
        if (collection === 'saved') { localStorage.setItem('deokdam-saved', JSON.stringify(next)); saved = next; }
        else { sessionStorage.setItem('deokdam-history', JSON.stringify(next)); history = next; }
        updateSave(); renderCollection();
      } catch { toast('삭제하지 못했어요. 다시 시도해 주세요.'); }
    };
    row.append(content, remove); list.append(row);
  });
}
for (const kind of ['saved', 'history']) $(kind).onclick = () => {
  stopListening();
  collection = kind; renderCollection(); $('collection-dialog').showModal();
};
$('help').onclick = () => { stopListening(); $('help-dialog').showModal(); };
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
}));
function resetMic() {
  clearTimeout(listenTimeout);
  $('listen').classList.remove('listening'); $('listen').setAttribute('aria-pressed', 'false');
  $('listen').setAttribute('aria-label', '잔소리 듣기'); $('listen').title = '잔소리 듣기';
  $('listening-status').hidden = true; setMode(false);
}
function stopListening() {
  const instance = recognition; recognition = null;
  if (instance) instance.abort();
  resetMic();
}
function listen() {
  if (recognition) { stopListening(); return; }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { toast('음성 인식을 지원하지 않아요. 직접 입력해 주세요.'); $('source').focus(); return; }
  cancelTranslation();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const instance = new SpeechRecognition(); recognition = instance;
  instance.lang = 'ko-KR'; instance.interimResults = true; instance.continuous = false;
  $('listen').classList.add('listening'); $('listen').setAttribute('aria-pressed', 'true');
  $('listen').setAttribute('aria-label', '듣기 중지'); $('listen').title = '듣기 중지';
  $('listening-status').hidden = false; setMode(true);
  instance.onresult = event => {
    if (recognition !== instance) return;
    $('source').value = Array.from(event.results).map(r => r[0].transcript).join('').slice(0, 300);
    updateInput(); display(null);
    if (event.results[event.results.length - 1].isFinal) translate();
  };
  instance.onerror = event => {
    if (recognition !== instance || event.error === 'aborted') return;
    const messages = { 'not-allowed': '마이크 권한을 허용해 주세요.', 'no-speech': '말소리가 들리지 않았어요.', network: '음성 인식에 연결할 수 없어요.', 'audio-capture': '마이크를 찾을 수 없어요.' };
    toast(messages[event.error] || '음성을 인식하지 못했어요.');
  };
  instance.onend = () => { if (recognition === instance) { recognition = null; resetMic(); } };
  try { instance.start(); listenTimeout = setTimeout(stopListening, 30000); }
  catch { stopListening(); toast('마이크를 시작하지 못했어요.'); }
}
$('listen').onclick = $('voice-mode').onclick = listen;
document.addEventListener('visibilitychange', () => { if (document.hidden) stopListening(); });
updateInput(); display(null);
