// Server-side proxy for downloading the finished Veo clip's bytes. This is
// the one step in the Veo pipeline with real platform risk: Vercel
// serverless functions (Node.js runtime) cap response payload size
// (historically ~4.5MB). An 8-second 9:16 clip is usually well under that,
// but isn't guaranteed for every generation. If this starts failing with
// 500s specifically at the download step for a particular clip, that's the
// likely cause -- there's no full fix for it without a different hosting
// approach for just this one download (out of scope for now).

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

  const { videoUri } = req.body || {};
  if (!videoUri) { res.status(400).json({ error: 'videoUri is required' }); return; }

  try {
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
  } catch (err) {
    console.error('veo-download-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
