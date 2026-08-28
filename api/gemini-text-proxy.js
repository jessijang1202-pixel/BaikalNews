// Server-side proxy for Gemini text generation, so the admin panel (and any
// device it's opened from, especially phones) doesn't need its own copy of
// the Gemini API key in browser localStorage/devtools. Mirrors the exact
// request/response shape admin.js's callGeminiTextApi() used to build
// directly against Google -- same model-picking logic as
// resolveGeminiVisionModel() there, just run here so the key never reaches
// the browser. Scope: text only. Image generation, Veo video, and TTS each
// have their own proxy (gemini-image-proxy.js, veo-start/poll/download-proxy.js,
// gemini-tts-proxy.js); only the shorts style-reference-video upload/analysis
// still uses the browser-side key -- deliberate, see admin.js comments near
// analyzeShortsStyleReference().
//
// Deliberately does NOT do the 24h client-side model-name caching admin.js
// used to do (localStorage isn't available server-side, and serverless
// instances aren't guaranteed to persist between invocations) -- re-lists
// models on every call instead. Google's ListModels endpoint is fast, so
// this adds well under a second of latency.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';
const CANDIDATE_TIMEOUT_MS = 20000;
// How many candidate models to try before giving up. Raised from 3 to 8
// after a second admin started depending on this (2026-08-27) -- a single
// stuck/overloaded model used to be able to exhaust all 3 tries and surface
// a hard error; trying more, different candidates makes that far less
// likely, since Gemini's rotating model lineup means the one that's
// struggling right now usually isn't the only usable one.
const MAX_CANDIDATES = 8;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// A model call can fail two very different ways: a clean error response
// (bad request, model not found, rate-limited) or a network-level hang with
// no response at all. The latter was observed live on 2026-08-25 -- Google's
// "gemini-flash-latest" rolling alias silently repointed at a brand-new model
// that wasn't fully serving yet, so calls to it just hung forever instead of
// erroring, and the admin panel's "프롬프트 자동생성" button spun with no
// feedback. Node's fetch has no default timeout, so without this the whole
// serverless function -- and the button -- would hang indefinitely.
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CANDIDATE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Gemini 모델은 가끔 "일시적인 과부하"(503 UNAVAILABLE)나 429(요청량 초과)를
// 돌려주는데, 이건 우리 쪽 코드/모델 선택이 잘못된 게 아니라 구글 서버가
// 잠깐 바쁜 것뿐이라 몇 초 뒤 재시도하면 대부분 성공한다. 이런 경우까지
// 관리자에게 그대로 에러창을 띄우는 대신, 서버에서 짧게 재시도한 뒤에도
// 계속 실패하거나 응답 자체가 없을 때만(타임아웃) 다음 후보 모델로 넘어간다.
async function tryModel(model, requestBody) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response;
    try {
      response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
    } catch (err) {
      // Timed out or network error -- this model isn't answering, give up on it.
      return { ok: false, timedOut: true };
    }
    if (response.ok) return { ok: true, response };
    if ((response.status === 503 || response.status === 429) && attempt === 1) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    return { ok: false, response };
  }
}

function versionOf(name) {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)-flash$/i);
  return m ? parseFloat(m[1]) : 0;
}

// Returns candidate models in priority order. Concrete numbered flash models
// ("gemini-3.6-flash") come first -- they're the most stable, and sorted
// newest-first. The "-latest" rolling alias and bare "flash" matches (which
// can include brand-new "-preview" models not yet fully rolled out) are kept
// only as fallbacks, tried in order until one actually answers.
async function listCandidateTextModels(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error('ListModels failed with status ' + res.status);
  const data = await res.json();
  const names = (data.models || [])
    .filter(m =>
      (m.supportedGenerationMethods || []).includes('generateContent') &&
      !/embedding|tts|imagen|image-generation|robotics|deep-research|lyria|gemma|antigravity|computer-use/i.test(m.name)
    )
    .map(m => m.name.replace(/^models\//, ''));
  if (names.length === 0) throw new Error('No usable text models available');

  const numbered = names
    .filter(n => /^gemini-\d+(\.\d+)?-flash$/i.test(n))
    .sort((a, b) => versionOf(b) - versionOf(a));
  const latestAlias = names.filter(n => !numbered.includes(n) && /flash-latest$/i.test(n));
  const otherFlash = names.filter(n => !numbered.includes(n) && !latestAlias.includes(n) && /flash/i.test(n));
  const rest = names.filter(n => !numbered.includes(n) && !latestAlias.includes(n) && !otherFlash.includes(n));

  return [...numbered, ...latestAlias, ...otherFlash, ...rest];
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    return;
  }

  const { prompt, systemInstruction } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const candidates = await listCandidateTextModels(GEMINI_API_KEY);
    const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
    if (systemInstruction) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    let lastFailure = null;
    for (const model of candidates.slice(0, MAX_CANDIDATES)) {
      const result = await tryModel(model, requestBody);
      if (result.ok) {
        const data = await result.response.json();
        const text = data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text;
        if (text) {
          res.status(200).json({ text });
          return;
        }
        lastFailure = { model, error: 'Gemini API가 텍스트를 반환하지 않았습니다.' };
        continue;
      }
      if (result.timedOut) {
        lastFailure = { model, error: `모델(${model})이 응답하지 않았습니다 (타임아웃).` };
        continue;
      }
      const errText = await result.response.text();
      // A clean 4xx/5xx from a specific model (e.g. deprecated/not-found) --
      // try the next candidate rather than failing the whole request on it.
      lastFailure = { model, status: result.response.status, error: `Gemini API 호출 실패 (모델: ${model}): ${errText}` };
    }

    res.status(502).json({ error: lastFailure ? lastFailure.error : 'AI가 텍스트를 생성하지 못했습니다.' });
  } catch (err) {
    console.error('gemini-text-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
