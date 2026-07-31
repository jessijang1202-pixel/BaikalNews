// Threads API OAuth redirect target -- exchanges the authorization code for
// a long-lived access token that can post to the connected Threads account
// on our behalf, then stores it server-side only.
//
// Unlike api/kakao-oauth-callback.js (which safely hardcodes the public
// anon key because kakao_subscribers is low-sensitivity contact data),
// this MUST use Supabase's service_role key. The anon key is embedded in
// the site's own client-side JS, so anything an anon-key RLS policy can
// read is effectively public -- and a Threads access token is a real
// posting credential, not just contact info. sns_connections has RLS
// enabled with zero policies, so only the service_role key (used here,
// never exposed to the browser) can touch it at all.
//
// Env vars required (set in Vercel): THREADS_APP_ID, THREADS_APP_SECRET,
// SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard -> Settings -> API --
// the SECRET service_role key, never the anon key, and never commit this
// one to source control the way the anon key is elsewhere in this repo).

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const REDIRECT_URI = "https://baikalnews.com/api/threads-oauth-callback";

function toStatusPage(res, status, reason) {
  const qs = reason ? `?status=${status}&reason=${encodeURIComponent(reason)}` : `?status=${status}`;
  res.writeHead(302, { Location: `/threads-callback.html${qs}` });
  res.end();
}

module.exports = async (req, res) => {
  const { code, error: threadsError } = req.query;

  if (threadsError) return toStatusPage(res, 'error', threadsError);
  if (!code) return toStatusPage(res, 'error', 'no_code');

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!serviceKey || !appId || !appSecret) {
    console.error('THREADS_APP_ID / THREADS_APP_SECRET / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
    return toStatusPage(res, 'error', 'server_error');
  }

  try {
    // 1) 인가 코드 -> 단기 액세스 토큰
    const shortRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code
      })
    });
    const shortData = await shortRes.json();
    if (!shortRes.ok || !shortData.access_token) {
      console.error('Threads 단기 토큰 교환 실패:', shortData);
      return toStatusPage(res, 'error', 'token_exchange_failed');
    }

    // 2) 단기 토큰 -> 장기 토큰 (60일 유효)
    const longUrl = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(shortData.access_token)}`;
    const longRes = await fetch(longUrl);
    const longData = await longRes.json();
    if (!longRes.ok || !longData.access_token) {
      console.error('Threads 장기 토큰 교환 실패:', longData);
      return toStatusPage(res, 'error', 'token_exchange_failed');
    }

    // 3) 계정 정보 조회 (관리자 화면에 표시할 username)
    const meRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(longData.access_token)}`);
    const meData = await meRes.json();
    const accountId = meData && meData.id ? String(meData.id) : String(shortData.user_id || '');
    const accountName = (meData && meData.username) || null;

    if (!accountId) {
      console.error('Threads 계정 정보 조회 실패:', meData);
      return toStatusPage(res, 'error', 'profile_fetch_failed');
    }

    const expiresAt = new Date(Date.now() + (longData.expires_in || 5184000) * 1000).toISOString();

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/sns_connections?on_conflict=platform,account_id`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        platform: 'threads',
        account_id: accountId,
        account_name: accountName,
        access_token: longData.access_token,
        token_expires_at: expiresAt
      })
    });

    if (!upsertRes.ok) {
      const errText = await upsertRes.text();
      console.error('Supabase sns_connections upsert 실패:', errText);
      return toStatusPage(res, 'error', 'save_failed');
    }

    return toStatusPage(res, 'success');
  } catch (err) {
    console.error('Threads OAuth callback error:', err);
    return toStatusPage(res, 'error', 'server_error');
  }
};
