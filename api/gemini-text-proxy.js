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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
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
