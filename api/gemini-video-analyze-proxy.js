// Server-side proxy for the actual Gemini multimodal analyzeContent call on
// an already-uploaded reference video (admin.js's analyzeShortsStyleReference,
// called after gemini-video-upload-start-proxy.js + gemini-video-status-proxy.js).
// Mirrors gemini-text-proxy.js's model-candidate/retry logic -- same filtered
// model set works for this (plain text-generating models that also accept
// multimodal fileData parts), just with a fileData part prepended to the prompt.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';
const CANDIDATE_TIMEOUT_MS = 30000; // video analysis is slower than a plain text call
const MAX_CANDIDATES = 8;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CANDIDATE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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

// Same candidate-ordering logic as gemini-text-proxy.js's
// listCandidateTextModels -- kept as its own copy (rather than a shared
// import) to match this codebase's existing one-proxy-per-file convention.
async function listCandidateModels(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error('ListModels failed with status ' + res.status);
  const data = await res.json();
  const names = (data.models || [])
    .filter(m =>
      (m.supportedGenerationMethods || []).includes('generateContent') &&
      !/embedding|tts|imagen|image-generation|robotics|deep-research|lyria|gemma|antigravity|computer-use/i.test(m.name)
    )
    .map(m => m.name.replace(/^models\//, ''));
  if (names.length === 0) throw new Error('No usable multimodal models available');

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
  if (!GEMINI_API_KEY) { res.status(500).json({ error: 'GEMINI_API_KEY not configured' }); return; }

  const { prompt, fileUri, mimeType } = req.body || {};
  if (!prompt || !fileUri) { res.status(400).json({ error: 'prompt and fileUri are required' }); return; }

  try {
    const candidates = await listCandidateModels(GEMINI_API_KEY);
    const requestBody = {
      contents: [{
        parts: [
          { fileData: { fileUri, mimeType: mimeType || 'video/mp4' } },
          { text: prompt }
        ]
      }]
    };

    let lastFailure = null;
    for (const model of candidates.slice(0, MAX_CANDIDATES)) {
      const result = await tryModel(model, requestBody);
      if (result.ok) {
        const data = await result.response.json();
        const text = data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text;
        if (text) {
          res.status(200).json({ text: text.trim() });
          return;
        }
        lastFailure = { model, error: '영상 분석 결과를 받지 못했습니다.' };
        continue;
      }
      if (result.timedOut) {
        lastFailure = { model, error: `모델(${model})이 응답하지 않았습니다 (타임아웃).` };
        continue;
      }
      const errText = await result.response.text();
      lastFailure = { model, status: result.response.status, error: `영상 분석 실패 (모델: ${model}): ${errText}` };
    }

    res.status(502).json({ error: lastFailure ? lastFailure.error : 'AI가 영상을 분석하지 못했습니다.' });
  } catch (err) {
    console.error('gemini-video-analyze-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
