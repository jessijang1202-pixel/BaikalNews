// Server-side proxy for STARTING a resumable upload to Gemini's Files API,
// used by the shorts "참고 숏폼 영상 업로드" style-reference feature
// (admin.js's uploadFileToGeminiFilesApi). This used to call Google's
// "start" endpoint directly from the browser with a client-stored Gemini
// key (see the old comment this replaced, near analyzeShortsStyleReference)
// -- the one AI feature left depending on that key after every other
// feature (image/text/TTS/Veo) moved to a server proxy, and the most likely
// reason "템플릿 형성하기" just stopped working outright on a browser that
// never had that separate client-side key saved.
//
// The actual video BYTES still go straight from the browser to Google's
// upload URL (unchanged) -- proxying those through this function would hit
// both generateContent's ~20MB inline-data cap and Vercel's request body
// limit, well under the up-to-2GB files this feature needs to support. Only
// this small "start" call (which needs the API key) and the status check
// (gemini-video-status-proxy.js) are proxied; the returned upload URL is a
// self-contained, pre-authorized session that doesn't need the key again.

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

  const { fileName, fileSize, mimeType } = req.body || {};
  if (!fileSize) { res.status(400).json({ error: 'fileSize is required' }); return; }

  try {
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
  } catch (err) {
    console.error('gemini-video-upload-start-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
