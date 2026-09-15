// Server-side proxy for checking a Gemini Files API upload's processing
// state (video files need server-side processing before they can be
// referenced in a generateContent call). Companion to
// gemini-video-upload-start-proxy.js -- see that file for why this feature
// moved off the browser-side Gemini key. Polled repeatedly by the client,
// same short-interval loop it used to run against Google directly; each
// call is small/fast so this fits comfortably within Vercel's per-
// invocation time limit.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!GEMINI_API_KEY) { res.status(500).json({ error: 'GEMINI_API_KEY not configured' }); return; }

  const { fileName } = req.body || {};
  if (!fileName) { res.status(400).json({ error: 'fileName is required' }); return; }

  try {
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
    if (!checkRes.ok) {
      const errText = await checkRes.text();
      res.status(checkRes.status).json({ error: `영상 처리 상태 확인 실패: ${errText}` });
      return;
    }
    const fileInfo = await checkRes.json();
    res.status(200).json({ state: fileInfo.state, uri: fileInfo.uri, mimeType: fileInfo.mimeType });
  } catch (err) {
    console.error('gemini-video-status-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
