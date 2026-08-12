// Server-side proxy for all Claude (Anthropic) text calls (article drafts,
// self-check grading, writing-style analysis, shorts script self-check).
// See gemini-text-proxy.js for the rationale. Needs a NEW Vercel env var,
// CLAUDE_API_KEY, that the admin must add themselves (not something this
// code can set) -- naming matches the existing GEMINI_API_KEY convention.
//
// The 'anthropic-dangerous-direct-browser-access' header the old
// browser-side caller needed is intentionally dropped here -- it only
// exists for direct browser-to-Anthropic calls, which this proxy removes.

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function resolveClaudeModel(apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  });
  if (!res.ok) throw new Error('ListModels failed with status ' + res.status);
  const data = await res.json();
  const models = data.data || [];
  if (models.length === 0) throw new Error('No models available');
  const pick = (predicate) => models.find(predicate);
  return (pick(m => /sonnet-5/i.test(m.id)) || pick(m => /sonnet/i.test(m.id)) || models[0]).id;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!CLAUDE_API_KEY) {
    res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });
    return;
  }

  const { prompt, systemInstruction } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const model = await resolveClaudeModel(CLAUDE_API_KEY);
    const requestBody = { model, max_tokens: 8192, messages: [{ role: 'user', content: prompt }] };
    if (systemInstruction) requestBody.system = systemInstruction;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `Claude API 호출 실패 (모델: ${model}): ${errText}` });
      return;
    }

    const data = await response.json();
    const textBlock = Array.isArray(data.content) ? data.content.find(b => b && b.type === 'text' && b.text) : null;
    if (!textBlock) {
      console.error('Claude API 응답 형식이 예상과 다릅니다:', data);
      res.status(502).json({ error: 'Claude API가 올바른 응답 양식을 반환하지 않았습니다: ' + JSON.stringify(data).slice(0, 300) });
      return;
    }
    res.status(200).json({ text: textBlock.text });
  } catch (err) {
    console.error('claude-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
