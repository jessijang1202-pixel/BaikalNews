// Unified SNS auto-publish endpoint -- posts pre-formatted text (+ optional
// image) to Facebook, Instagram, or Threads. Called from the admin SNS
// 관리 tab, which runs on editor815.baikalnews.com -- a different origin
// than this function's own domain (baikalnews.com), so CORS headers are
// required (the browser preflights any POST with a JSON body via OPTIONS).
//
// Threads works today via a manually-generated long-lived token
// (THREADS_TEST_ACCESS_TOKEN -- see api/threads-test-post.js for how it
// was obtained; the proper OAuth flow in api/threads-oauth-callback.js is
// still blocked by a Meta console form-save bug). Facebook/Instagram
// aren't connected yet (no Page/Business account linked), so those two
// branches report {ok:false, error:'not_configured'} until
// FACEBOOK_PAGE_ID/FACEBOOK_PAGE_ACCESS_TOKEN and
// INSTAGRAM_BUSINESS_ID/INSTAGRAM_ACCESS_TOKEN exist -- this is a real,
// working branch waiting on credentials, not a stub to fill in later.

const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Threads (like Instagram's Content Publishing API) needs a short beat to
// finish processing a container before it can be published -- publishing
// immediately 404s with "Media Not Found" (error_subcode 4279009).
async function pollThreadsContainer(containerId, token) {
  let status = 'IN_PROGRESS';
  for (let attempt = 0; attempt < 4 && status === 'IN_PROGRESS'; attempt++) {
    await new Promise(r => setTimeout(r, 1500));
    const statusRes = await fetch(`https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(token)}`);
    const statusData = await statusRes.json();
    status = statusData.status || 'IN_PROGRESS';
    if (status === 'ERROR') throw new Error(statusData.error_message || 'Threads 컨테이너 처리 실패');
  }
  if (status !== 'FINISHED') throw new Error(`컨테이너가 시간 내에 완료되지 않았습니다 (상태: ${status})`);
}

async function publishThreads(text, imageUrl) {
  const token = process.env.THREADS_TEST_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'not_configured' };

  const meRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id&access_token=${encodeURIComponent(token)}`);
  const meData = await meRes.json();
  if (!meRes.ok || !meData.id) return { ok: false, error: (meData.error && meData.error.message) || 'me 조회 실패' };

  const params = imageUrl
    ? { media_type: 'IMAGE', image_url: imageUrl, text, access_token: token }
    : { media_type: 'TEXT', text, access_token: token };

  const createRes = await fetch(`https://graph.threads.net/v1.0/${meData.id}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) return { ok: false, error: (createData.error && createData.error.message) || '컨테이너 생성 실패' };

  try {
    await pollThreadsContainer(createData.id, token);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const publishRes = await fetch(`https://graph.threads.net/v1.0/${meData.id}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: createData.id, access_token: token })
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok) return { ok: false, error: (publishData.error && publishData.error.message) || '발행 실패' };
  return { ok: true, postId: publishData.id };
}

// A System User token works directly for Instagram, but posting straight
// to /{page-id}/photos with it reliably fails with a stale, misleading
// "(#200) publish_actions ... deprecated" error. Facebook Page posting
// actually wants the PAGE-scoped token that /me/accounts hands back for
// that specific page (distinct from the System User's own token), so
// fetch that first and post with it instead.
async function getPageAccessToken(pageId, systemUserToken) {
  const res = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(systemUserToken)}`);
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || '페이지 목록 조회 실패');
  const page = (data.data || []).find(p => p.id === pageId);
  if (!page) throw new Error('이 토큰이 접근 가능한 페이지 중 FACEBOOK_PAGE_ID와 일치하는 페이지가 없습니다.');
  return page.access_token;
}

async function publishFacebook(text, imageUrl) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const systemUserToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !systemUserToken) return { ok: false, error: 'not_configured' };

  let pageToken;
  try {
    pageToken = await getPageAccessToken(pageId, systemUserToken);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const endpoint = imageUrl
    ? `https://graph.facebook.com/v21.0/${pageId}/photos`
    : `https://graph.facebook.com/v21.0/${pageId}/feed`;
  const params = imageUrl
    ? { url: imageUrl, caption: text, access_token: pageToken }
    : { message: text, access_token: pageToken };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: (data.error && data.error.message) || '페이스북 게시 실패' };
  return { ok: true, postId: data.post_id || data.id };
}

async function publishInstagram(text, imageUrl) {
  const igId = process.env.INSTAGRAM_BUSINESS_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!igId || !token) return { ok: false, error: 'not_configured' };
  if (!imageUrl) return { ok: false, error: '인스타그램은 이미지가 반드시 필요합니다.' };

  const createRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: imageUrl, caption: text, access_token: token })
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) return { ok: false, error: (createData.error && createData.error.message) || '컨테이너 생성 실패' };

  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: createData.id, access_token: token })
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok) return { ok: false, error: (publishData.error && publishData.error.message) || '발행 실패' };
  return { ok: true, postId: publishData.id };
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { platform, text, imageUrl } = body || {};

  try {
    let result;
    if (platform === 'threads') result = await publishThreads(text, imageUrl);
    else if (platform === 'facebook') result = await publishFacebook(text, imageUrl);
    else if (platform === 'instagram') result = await publishInstagram(text, imageUrl);
    else { res.status(400).json({ ok: false, error: 'unknown platform' }); return; }

    res.status(result.ok ? 200 : 500).json(result);
  } catch (err) {
    console.error('SNS 발행 오류:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
