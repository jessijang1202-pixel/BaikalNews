// Server-side proxy for STARTING a Veo video-generation job (long-running,
// up to ~10 min total, so polled separately via veo-poll-proxy.js rather
// than held open in one function call). See gemini-text-proxy.js for why
// this exists (no browser-side Gemini key needed anymore for this feature).
// The caller (admin.js's generateVeoVideo) sends the fully-assembled prompt
// text already including the MEDIA_KOREAN_PEOPLE_RULE string -- this proxy
// just forwards whatever prompt it's given.

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

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!GEMINI_API_KEY) { res.status(500).json({ error: 'GEMINI_API_KEY not configured' }); return; }

  const { prompt, costSaving } = req.body || {};
  if (!prompt) { res.status(400).json({ error: 'prompt is required' }); return; }

  try {
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
  } catch (err) {
    console.error('veo-start-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
