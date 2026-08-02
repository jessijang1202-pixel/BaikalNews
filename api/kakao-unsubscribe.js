// 구독자 자가 구독취소 엔드포인트 -- unsubscribe.html(공개 사이트,
// baikalnews.com)에서 전화번호만 입력받아 곧바로 kakao_subscribers에서
// 해당 행을 삭제한다. 설계상 OTP/문자 인증 없음: 구독취소는 최대한
// 마찰 없이 되어야 한다는 원칙 + 인증 문자 발송 비용을 또 들이지
// 않기 위한 명시적 결정 (관리자 확인 완료).
//
// Supabase URL/anon key는 api/kakao-oauth-callback.js와 동일한 값 --
// js/supabase-config.js에 이미 클라이언트에 공개되어 있어 여기 하드코딩도
// 새로운 노출이 아니며, admin/js/supabase-adapter.js의
// deleteKakaoSubscriber()가 이미 anon key로 같은 테이블의 DELETE를
// 수행하고 있으므로 (RLS가 허용) 서버에서도 동일하게 동작한다.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";

// unsubscribe.html이 admin 서브도메인이 아니라 공개 사이트(baikalnews.com)
// 자체에서 호출하므로, test-kakao-send.js/sns-publish.js의 ADMIN_ORIGIN이
// 아니라 공개 사이트 origin으로 CORS를 연다.
const SITE_ORIGIN = 'https://baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 카카오 로그인이 저장하는 번호는 항상 010으로 시작하는 11자리 휴대전화
// 번호를 api/kakao-oauth-callback.js의 normalizeKakaoPhone()이 "010-1234-5678"
// 형태(3-4-4)로 저장해 둔 것이므로, DB에 존재 가능한 값도 이 패턴뿐이다.
// 이 형태가 아니면 조회해봐야 절대 일치할 수 없으므로 미리 400으로 막는다.
function normalizePhoneForUnsubscribe(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!/^010\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { phone } = body || {};

  const normalizedPhone = normalizePhoneForUnsubscribe(phone);
  if (!normalizedPhone) {
    res.status(400).json({ ok: false, error: '올바른 휴대전화 번호 형식이 아닙니다. (예: 010-1234-5678)' });
    return;
  }

  try {
    // Prefer: return=representation -- 삭제된 행을 응답 본문으로 그대로
    // 돌려받아야, "조회는 성공했지만 일치하는 행이 없음"(found: false)과
    // "실제로 삭제됨"(found: true)을 구분할 수 있다.
    const deleteRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kakao_subscribers?phone=eq.${encodeURIComponent(normalizedPhone)}`,
      {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: 'return=representation'
        }
      }
    );

    if (!deleteRes.ok) {
      const errText = await deleteRes.text();
      console.error('Supabase kakao_subscribers delete 실패:', errText);
      res.status(500).json({ ok: false, error: '구독 취소 처리 중 오류가 발생했습니다.' });
      return;
    }

    const deletedRows = await deleteRes.json();
    res.status(200).json({ ok: true, found: deletedRows.length > 0 });
  } catch (err) {
    console.error('구독 취소 요청 처리 실패:', err);
    res.status(500).json({ ok: false, error: '구독 취소 처리 중 오류가 발생했습니다.' });
  }
};
