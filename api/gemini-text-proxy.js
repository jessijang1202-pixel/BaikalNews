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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Gemini 모델은 가끔 "일시적인 과부하"(503 UNAVAILABLE)나 429(요청량 초과)를
// 돌려주는데, 이건 우리 쪽 코드/모델 선택이 잘못된 게 아니라 구글 서버가
// 잠깐 바쁜 것뿐이라 몇 초 뒤 재시도하면 대부분 성공한다. 이런 경우까지
// 관리자에게 그대로 에러창을 띄우는 대신, 서버에서 짧게 몇 번 재시도한
// 뒤에도 계속 실패할 때만 에러로 넘긴다. 그 외 상태 코드(4xx 등 우리 쪽
// 요청 자체가 잘못된 경우)는 재시도해도 똑같이 실패하므로 바로 던진다.
async function fetchWithRetry(url, options, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, options);
    if (response.ok || (response.status !== 503 && response.status !== 429) || attempt === maxAttempts) {
      return response;
    }
    await new Promise(r => setTimeout(r, attempt * 1000));
  }
}

async function resolveGeminiTextModel(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error('ListModels failed with status ' + res.status);
  const data = await res.json();
  const models = (data.models || []).filter(m =>
    (m.supportedGenerationMethods || []).includes('generateContent') &&
    !/embedding|tts|imagen|image-generation/i.test(m.name)
  );
  if (models.length === 0) throw new Error('No usable text models available');
  const pick = (predicate) => models.find(predicate);
  const chosen = pick(m => /flash-latest$/i.test(m.name)) || pick(m => /flash/i.test(m.name)) || models[0];
  return chosen.name.replace(/^models\//, '');
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
    const model = await resolveGeminiTextModel(GEMINI_API_KEY);
    const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
    if (systemInstruction) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `Gemini API 호출 실패 (모델: ${model}): ${errText}` });
      return;
    }

    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!text) {
      res.status(502).json({ error: 'Gemini API가 텍스트를 반환하지 않았습니다.' });
      return;
    }
    res.status(200).json({ text });
  } catch (err) {
    console.error('gemini-text-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
