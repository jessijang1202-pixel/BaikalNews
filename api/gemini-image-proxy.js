// Server-side proxy for Gemini IMAGE generation (article hero images). See
// gemini-text-proxy.js for the rationale (no more browser-side API key).
// The caller (admin.js's generateGeminiImage) sends the fully-assembled
// prompt text already including all style/realism/no-text rule strings --
// this proxy does not know or care about that, it just forwards whatever
// prompt it's given and resolves an image-capable model server-side.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 텍스트가 들어가는 이미지(카드뉴스 인포그래픽)에서 한글이 심하게 깨지는
// 문제의 원인: 기존 로직이 "flash" 계열 모델을 최우선으로 골랐는데,
// 정작 비라틴 문자(한글 포함) 텍스트 렌더링 정확도가 압도적으로 높은
// 모델은 "Nano Banana Pro"(Gemini 3 Pro Image, 모델명에 "flash"가 없고
// "pro"가 들어감)라 이 로직에서 항상 밀려나고 있었다. 그래서 Pro급
// 이미지 모델을 최우선으로 찾고, 없으면 flash 계열(Nano Banana) ->
// 그 외 순으로 대체한다. "imagen"도 문자열에 "image"를 포함해 기존
// 필터에 걸리므로, 진짜 Gemini 멀티모달 이미지 모델을 우선하도록 순서를
// 명확히 한다.
async function resolveGeminiImageModel(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error('ListModels failed with status ' + res.status);
  const data = await res.json();
  const models = (data.models || []).filter(m =>
    (m.supportedGenerationMethods || []).includes('generateContent') && /image/i.test(m.name)
  );
  if (models.length === 0) throw new Error('No usable image models available');
  const chosen =
    models.find(m => /gemini-3[.-]?.*pro.*image/i.test(m.name)) ||
    models.find(m => /gemini.*flash.*image/i.test(m.name)) ||
    models.find(m => /flash/i.test(m.name)) ||
    models[0];
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

  const { prompt } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const model = await resolveGeminiImageModel(GEMINI_API_KEY);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `AI 이미지 생성 실패 (모델: ${model}): ${errText}` });
      return;
    }

    const data = await response.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const imagePart = parts.find(p => p.inlineData && p.inlineData.data);
    if (!imagePart) {
      res.status(502).json({ error: 'AI가 이미지를 반환하지 않았습니다. 프롬프트를 조금 더 구체적으로 작성해 보세요.' });
      return;
    }
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    // model도 함께 반환 -- 어떤 모델이 실제로 그렸는지 프론트/콘솔에서
    // 바로 확인할 수 있게 해서, 모델 선택 로직이 의도대로 동작하는지
    // (특히 텍스트 렌더링 품질 이슈) 나중에 다시 진단하기 쉽게 한다.
    res.status(200).json({ dataUri: `data:${mimeType};base64,${imagePart.inlineData.data}`, model });
  } catch (err) {
    console.error('gemini-image-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
