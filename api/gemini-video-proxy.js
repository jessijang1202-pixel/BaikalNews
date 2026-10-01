// Server-side proxy for the shorts "참고 숏폼 영상 업로드" style-reference
// feature's whole Gemini Files API flow (start upload / check processing
// status / analyze the finished upload), merged from what used to be
// gemini-video-upload-start-proxy.js + gemini-video-status-proxy.js +
// gemini-video-analyze-proxy.js into one dispatched-by-action file.
//
// Why merged: Vercel's Hobby plan caps a deployment at 12 Serverless
// Functions total (confirmed live 2026-10-01: "No more than 12 Serverless
// Functions can be added to a Deployment on the Hobby plan" build error,
// after the account was downgraded from Pro and the project had grown to
// 24 functions). Each file under api/ counts as one function regardless of
// how much logic it holds, so consolidating related endpoints behind a
// single dispatcher is the free way back under the cap -- no behavior
// changes, just fewer files. See also public-render.js, veo-proxy.js,
// kakao-proxy.js, threads-proxy.js, sns-proxy.js for the same pattern.
//
// This used to call Google's Files API "start" endpoint directly from the
// browser with a separate client-stored Gemini key -- the one AI feature
// left depending on that after every other feature (image/text/TTS/Veo)
// moved to a server proxy, and the most likely reason "템플릿 형성하기"
// stopped working outright on a browser that never had that separate key
// saved. The actual video BYTES still go straight from the browser to
// Google's upload URL (unchanged) -- proxying those through this function
// would hit both generateContent's ~20MB inline-data cap and Vercel's
// request body limit, well under the up-to-2GB files this feature needs to
// support. Only the small "start" call (which needs the API key) and the
// status/analyze calls are proxied; the returned upload URL is a self-
// contained, pre-authorized session that doesn't need the key again.
//
// admin.js's uploadFileToGeminiFilesApi()/analyzeShortsStyleReference()
// call this with action: 'start' | 'status' | 'analyze'.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';
const CANDIDATE_TIMEOUT_MS = 30000; // video analysis is slower than a plain text call
const MAX_CANDIDATES = 8;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function handleStart(req, res) {
  const { fileName, fileSize, mimeType } = req.body || {};
  if (!fileSize) { res.status(400).json({ error: 'fileSize is required' }); return; }

  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileSize),
      'X-Goog-Upload-Header-Content-Type': mimeType || 'video/mp4',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: fileName || 'reference-video' } })
  });
  if (!startRes.ok) {
    const errText = await startRes.text();
    res.status(startRes.status).json({ error: `영상 업로드 시작 실패: ${errText}` });
    return;
  }
  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    res.status(502).json({ error: '영상 업로드 URL을 받지 못했습니다.' });
    return;
  }
  res.status(200).json({ uploadUrl });
}

async function handleStatus(req, res) {
  const { fileName } = req.body || {};
  if (!fileName) { res.status(400).json({ error: 'fileName is required' }); return; }

  const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
  if (!checkRes.ok) {
    const errText = await checkRes.text();
    res.status(checkRes.status).json({ error: `영상 처리 상태 확인 실패: ${errText}` });
    return;
  }
  const fileInfo = await checkRes.json();
  res.status(200).json({ state: fileInfo.state, uri: fileInfo.uri, mimeType: fileInfo.mimeType });
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

async function handleAnalyze(req, res) {
  const { prompt, fileUri, mimeType } = req.body || {};
  if (!prompt || !fileUri) { res.status(400).json({ error: 'prompt and fileUri are required' }); return; }

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
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!GEMINI_API_KEY) { res.status(500).json({ error: 'GEMINI_API_KEY not configured' }); return; }

  const { action } = req.body || {};
  try {
    if (action === 'start') { await handleStart(req, res); return; }
    if (action === 'status') { await handleStatus(req, res); return; }
    if (action === 'analyze') { await handleAnalyze(req, res); return; }
    res.status(400).json({ error: 'action must be one of: start, status, analyze' });
  } catch (err) {
    console.error(`gemini-video-proxy (action=${action}) error:`, err);
    res.status(500).json({ error: err.message });
  }
};
