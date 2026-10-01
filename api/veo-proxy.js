// Server-side proxy for the whole Veo video-generation pipeline (start the
// long-running job / poll its status / download the finished clip's bytes),
// merged from what used to be veo-start-proxy.js + veo-poll-proxy.js +
// veo-download-proxy.js into one dispatched-by-action file.
//
// Why merged: Vercel's Hobby plan caps a deployment at 12 Serverless
// Functions total (confirmed live 2026-10-01: "No more than 12 Serverless
// Functions can be added to a Deployment on the Hobby plan" build error,
// after the account was downgraded from Pro and the project had grown to
// 24 functions). Each file under api/ counts as one function regardless of
// how much logic it holds, so consolidating related endpoints behind a
// single dispatcher is the free way back under the cap -- no behavior
// changes, just fewer files. See also og-proxy.js, gemini-video-proxy.js,
// kakao-proxy.js, threads-proxy.js, sns-proxy.js for the same pattern.
//
// Admin.js's generateVeoVideo() calls this three times in sequence with
// action: 'start' | 'poll' | 'download'.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function resolveVeoModel(apiKey, costSaving) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error('ListModels failed with status ' + res.status);
  const data = await res.json();
  const models = (data.models || []).filter(m => /veo/i.test(m.name));
  if (models.length === 0) throw new Error('이 API 키로 사용 가능한 Veo 영상 생성 모델을 찾지 못했습니다. Google AI Studio/Cloud 콘솔에서 Veo 접근 권한(별도 결제 활성화)이 있는지 확인해 주세요.');
  const chosen = costSaving
    ? (models.find(m => /lite/i.test(m.name)) || models.find(m => /fast/i.test(m.name)) || models.find(m => /veo-3/i.test(m.name)) || models[0])
    : (models.find(m => /veo-3/i.test(m.name)) || models[0]);
  return chosen.name.replace(/^models\//, '');
}

async function handleStart(req, res) {
  const { prompt, costSaving } = req.body || {};
  if (!prompt) { res.status(400).json({ error: 'prompt is required' }); return; }

  const model = await resolveVeoModel(GEMINI_API_KEY, !!costSaving);
  // 8초는 이미 고정값이고, 현재 이 키로 쓸 수 있는 Veo 모델은 전부
  // 3.1세대(veo-3.1-generate-preview/fast/lite)라 셋 다 1080p+8초 조합을
  // 지원한다 (구글 문서: "1080p"는 8초 길이에서만 지원). 이전엔 해상도를
  // 지정하지 않아 기본값(더 낮은 해상도)으로 나왔던 것으로 보임 --
  // 다운로드해서 유튜브/SNS에 올렸을 때 화질이 안 좋다는 신고의 원인.
  const startRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { aspectRatio: '9:16', durationSeconds: 8, resolution: '1080p' }
    })
  });
  if (!startRes.ok) {
    const errText = await startRes.text();
    res.status(startRes.status).json({ error: `Veo 영상 생성 요청 실패 (모델: ${model}): ${errText}` });
    return;
  }
  const operation = await startRes.json();
  if (!operation.name) {
    res.status(502).json({ error: 'Veo 작업 ID를 받지 못했습니다: ' + JSON.stringify(operation) });
    return;
  }
  res.status(200).json({ operationName: operation.name });
}

async function handlePoll(req, res) {
  const { operationName } = req.body || {};
  if (!operationName) { res.status(400).json({ error: 'operationName is required' }); return; }

  const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GEMINI_API_KEY}`);
  if (!pollRes.ok) {
    const errText = await pollRes.text();
    res.status(pollRes.status).json({ error: `Veo 진행상황 확인 실패: ${errText}` });
    return;
  }
  const operation = await pollRes.json();
  if (!operation.done) {
    res.status(200).json({ done: false });
    return;
  }
  if (operation.error) {
    res.status(200).json({ done: true, error: operation.error.message || JSON.stringify(operation.error) });
    return;
  }
  const genResponse = operation.response || {};
  const samples = (genResponse.generateVideoResponse && genResponse.generateVideoResponse.generatedSamples)
    || genResponse.generatedSamples
    || genResponse.videos;
  const firstSample = samples && samples[0];
  const videoUri = firstSample && (
    (firstSample.video && firstSample.video.uri) || firstSample.uri || firstSample.video
  );
  if (!videoUri) {
    res.status(200).json({ done: true, error: 'Veo 응답에서 영상 URI를 찾지 못했습니다: ' + JSON.stringify(genResponse).substring(0, 500) });
    return;
  }
  res.status(200).json({ done: true, videoUri });
}

// Vercel 서버리스 함수(Node.js 런타임)는 응답 크기에 상한이 있다
// (역사적으로 ~4.5MB). 8초짜리 9:16 클립은 보통 그보다 작지만 항상
// 보장되진 않는다 -- 특정 클립 다운로드 단계에서만 500이 난다면 이게
// 원인일 가능성이 높고, 이 함수 하나만 다른 호스팅 방식으로 바꾸지
// 않는 한 완전한 해결책은 없다 (지금은 범위 밖).
async function handleDownload(req, res) {
  const { videoUri } = req.body || {};
  if (!videoUri) { res.status(400).json({ error: 'videoUri is required' }); return; }

  const videoUrl = videoUri.includes('key=') ? videoUri : `${videoUri}${videoUri.includes('?') ? '&' : '?'}key=${GEMINI_API_KEY}`;
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    res.status(videoRes.status).json({ error: `Veo 영상 파일 다운로드 실패 (HTTP ${videoRes.status})` });
    return;
  }
  const arrayBuffer = await videoRes.arrayBuffer();
  const contentType = videoRes.headers.get('content-type') || 'video/mp4';
  res.setHeader('Content-Type', contentType);
  res.status(200).send(Buffer.from(arrayBuffer));
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!GEMINI_API_KEY) { res.status(500).json({ error: 'GEMINI_API_KEY not configured' }); return; }

  const { action } = req.body || {};
  try {
    if (action === 'start') { await handleStart(req, res); return; }
    if (action === 'poll') { await handlePoll(req, res); return; }
    if (action === 'download') { await handleDownload(req, res); return; }
    res.status(400).json({ error: 'action must be one of: start, poll, download' });
  } catch (err) {
    console.error(`veo-proxy (action=${action}) error:`, err);
    res.status(500).json({ error: err.message });
  }
};
