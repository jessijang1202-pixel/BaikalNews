// ONE-TIME SETUP TOOL -- 알림톡(AlimTalk)에서 카카오 브랜드메시지(Brand
// Message, 구 Friendtalk)로 전환하며 필요해진 새 템플릿을 알리고(Aligo)에
// 한 번 등록하고, 응답에 담긴 template_code를 그대로 돌려준다. 관리자가 이
// 값을 Vercel의 ALIGO_BRAND_TEMPLATE_CODE 환경변수로 붙여 넣으면 그 뒤로는
// 다시 호출할 필요가 없다 -- get-instagram-id.js처럼 반복 호출이 필요한
// 진단 도구가 아니라, 필요할 때(신규 템플릿 문구를 바꿔 재등록해야 할 때)만
// curl/Postman으로 직접 호출하는 관리자 전용 1회성 도구다. 공개 UI에서
// 링크로 노출하지 말 것.
//
// Env vars required (기존 알림톡 발송과 동일한 계정/채널):
// ALIGO_API_KEY, ALIGO_USERID, ALIGO_SENDER_KEY

const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

// 발송 직전 기계적으로 붙이던 구독취소 안내(admin.js/generate-daily-briefing.js의
// 옛 KAKAO_BRIEFING_UNSUBSCRIBE_FOOTER)를 이제 이 고정 템플릿 문구 쪽으로
// 옮겼다 -- 생성되는 본문(#{brief})마다 매번 다시 붙일 필요가 없어졌다.
const TEMPLATE_CONTENT = `[바이칼뉴스] 3분 뉴스 브리핑

#{brief}

▶ 더 이상 받고 싶지 않으시면 baikalnews.com에서 구독취소를 눌러주세요.`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const requiredEnv = ['ALIGO_API_KEY', 'ALIGO_USERID', 'ALIGO_SENDER_KEY'];
  const missing = requiredEnv.filter(name => !process.env[name]);
  if (missing.length > 0) {
    console.error('알리고(Aligo) 환경변수 누락:', missing.join(', '));
    res.status(500).json({ error: `알리고 환경변수가 설정되지 않았습니다: ${missing.join(', ')}` });
    return;
  }

  const params = new URLSearchParams({
    apikey: process.env.ALIGO_API_KEY,
    userid: process.env.ALIGO_USERID,
    senderkey: process.env.ALIGO_SENDER_KEY,
    template_type: 'TEXT',
    template_name: '바이칼뉴스 3분 브리핑',
    adult: 'N',
    template_content: TEMPLATE_CONTENT
  });

  try {
    const aligoRes = await fetch('https://kakaoapi.aligo.in/brandtalk/template/create/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    // 알리고 원본 응답을 그대로 돌려준다 -- template_code/send_variable/status를
    // 가공 없이 호출자(관리자)가 직접 확인해야 하기 때문.
    const data = await aligoRes.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('알리고 브랜드메시지 템플릿 생성 요청 실패:', err);
    res.status(500).json({ error: err.message });
  }
};
