// Kakao Login redirect target for the "카카오로 3분 뉴스 신청" button
// (js/main.js's startKakaoSubscribe()). This has to be a real server-side
// function, not a static page -- exchanging the authorization code for an
// access token requires KAKAO_CLIENT_SECRET, which must never be exposed
// to the browser. Runs entirely server-side: exchange code -> fetch the
// user's phone number -> save it to Supabase's kakao_subscribers table ->
// redirect the browser to a plain status page (kakao-callback.html).
//
// Env vars required (set in Vercel): KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET.
// Supabase URL/anon key below are already public (embedded client-side in
// js/supabase-config.js; access is governed by RLS, not key secrecy), so
// hardcoding them here isn't a new exposure.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";
const REDIRECT_URI = "https://baikalnews.com/api/kakao-oauth-callback";

function toStatusPage(res, status, reason) {
  const qs = reason ? `?status=${status}&reason=${encodeURIComponent(reason)}` : `?status=${status}`;
  res.writeHead(302, { Location: `/kakao-callback.html${qs}` });
  res.end();
}

// Kakao returns phone numbers like "+82 10-1234-5678" -- normalize to the
// domestic 010-1234-5678 format the rest of the admin/DB already uses.
function normalizeKakaoPhone(raw) {
  if (!raw) return null;
  return raw.replace(/^\+82\s?/, '0').replace(/\s+/g, '');
}

module.exports = async (req, res) => {
  const { code, error: kakaoError } = req.query;

  if (kakaoError) {
    return toStatusPage(res, 'error', kakaoError);
  }
  if (!code) {
    return toStatusPage(res, 'error', 'no_code');
  }

  try {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_REST_API_KEY,
        client_secret: process.env.KAKAO_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Kakao token exchange failed:', tokenData);
      return toStatusPage(res, 'error', 'token_exchange_failed');
    }

    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        property_keys: JSON.stringify(['kakao_account.phone_number'])
      })
    });
    const userData = await userRes.json();
    const phone = normalizeKakaoPhone(userData && userData.kakao_account && userData.kakao_account.phone_number);

    if (!phone) {
      console.error('Kakao user info missing phone_number:', userData);
      return toStatusPage(res, 'error', 'no_phone_number');
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/kakao_subscribers`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates'
      },
      body: JSON.stringify({ phone })
    });

    // A duplicate (already-subscribed number) is not a real failure --
    // Prefer: resolution=ignore-duplicates already makes that a 201/200,
    // but handle a raw 409 defensively too in case that header is ignored.
    if (!insertRes.ok && insertRes.status !== 409) {
      const errText = await insertRes.text();
      console.error('Supabase kakao_subscribers insert failed:', errText);
      return toStatusPage(res, 'error', 'save_failed');
    }

    return toStatusPage(res, 'success');
  } catch (err) {
    console.error('Kakao OAuth callback error:', err);
    return toStatusPage(res, 'error', 'server_error');
  }
};
