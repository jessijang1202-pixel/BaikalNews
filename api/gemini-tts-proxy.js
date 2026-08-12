// Server-side proxy for Gemini native TTS (shorts narration audio). See
// gemini-text-proxy.js for the rationale.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function resolveGeminiTtsModel(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error('ListModels failed with status ' + res.status);
  const data = await res.json();
  const models = (data.models || []).filter(m => /tts/i.test(m.name));
  if (models.length === 0) throw new Error('이 API 키로 사용 가능한 음성(TTS) 생성 모델을 찾지 못했습니다. Google AI Studio에서 TTS 모델 접근 권한을 확인해 주세요.');
  const chosen = models.find(m => /flash/i.test(m.name)) || models[0];
  return chosen.name.replace(/^models\//, '');
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
