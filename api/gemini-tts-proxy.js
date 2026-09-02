// Server-side proxy for Gemini native TTS (shorts narration audio). See
// gemini-text-proxy.js for the rationale.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 이 API 키로 지금 쓸 수 있는 TTS 모델이 gemini-2.5-flash-preview-tts,
// gemini-2.5-pro-preview-tts, gemini-3.1-flash-tts-preview 셋인데,
// 예전엔 그냥 "이름에 flash가 들어간 첫 번째"를 골랐다 -- 그런데
// "flash"가 들어간 모델이 두 개(2.5와 3.1)라, ListModels가 매번 같은
// 순서로 응답한다는 보장이 없다면 나레이션 생성 요청마다(=숏폼 한
// 컷마다) 서로 다른 모델이 골라질 수 있었다. 같은 voiceName("Kore" 등)을
// 줘도 모델 버전이 다르면 음색 자체가 다르게 나오므로, 이게 "컷마다
// 목소리가 다르다"는 신고의 실제 원인이었을 가능성이 높다. 우선순위를
// 명시적으로 고정해, 같은 세대(3.1) 모델이 있으면 항상 그것만 쓰고
// 없으면 2.5 flash, 그다음 2.5 pro 순으로 -- 매 호출마다 항상 동일한
// 모델 하나만 결정되게 한다.
const TTS_MODEL_PRIORITY = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'];

async function resolveGeminiTtsModel(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error('ListModels failed with status ' + res.status);
  const data = await res.json();
  const models = (data.models || [])
    .filter(m => /tts/i.test(m.name))
    .map(m => m.name.replace(/^models\//, ''));
  if (models.length === 0) throw new Error('이 API 키로 사용 가능한 음성(TTS) 생성 모델을 찾지 못했습니다. Google AI Studio에서 TTS 모델 접근 권한을 확인해 주세요.');
  for (const name of TTS_MODEL_PRIORITY) {
    if (models.includes(name)) return name;
  }
  // 우선순위 목록에 없는 새 모델만 남아있는 경우에도(향후 목록이 바뀌어도)
  // 이름순 정렬 후 첫 번째로 항상 같은 것을 고르도록 -- find()가 배열
  // 순서에 좌우되는 문제를 다시 만들지 않는다.
  return models.slice().sort()[0];
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!GEMINI_API_KEY) { res.status(500).json({ error: 'GEMINI_API_KEY not configured' }); return; }

  const { text, voiceName } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text is required' }); return; }

  try {
    const model = await resolveGeminiTtsModel(GEMINI_API_KEY);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } } }
        }
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `나레이션 생성 실패 (모델: ${model}): ${errText}` });
      return;
    }
    const data = await response.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const audioPart = parts.find(p => p.inlineData && p.inlineData.data);
    if (!audioPart) {
      res.status(502).json({ error: 'AI가 음성 데이터를 반환하지 않았습니다.' });
      return;
    }
    res.status(200).json({ audioData: audioPart.inlineData.data, mimeType: audioPart.inlineData.mimeType || 'audio/L16;rate=24000' });
  } catch (err) {
    console.error('gemini-tts-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
