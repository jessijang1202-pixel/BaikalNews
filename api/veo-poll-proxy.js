// Server-side proxy for POLLING a Veo operation's status. Called repeatedly
// by the client (same 10s-interval loop it used to run against Google
// directly) until the operation is done. Each call is fast/cheap -- the
// long total duration is spread across many short polls, not one held-open
// request, so this fits fine within Vercel's per-invocation time limits.

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

  const { operationName } = req.body || {};
  if (!operationName) { res.status(400).json({ error: 'operationName is required' }); return; }

  try {
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
  } catch (err) {
    console.error('veo-poll-proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
