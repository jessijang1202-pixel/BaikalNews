// 알리고(Aligo) 알림톡 연동 점검용 수동 테스트 엔드포인트 -- 관리자 화면의
// "카카오톡 발송용" 패널에서 전화번호 하나를 넣고 호출하면, 실제 발송
// 크론(api/send-kakao-briefing.js)과 똑같은 요청 형식으로 알리고에
// testMode='Y' 요청을 한 건 보낸다. API 키/발신프로필/템플릿 코드가 맞는지,
// 요청 형식이 알리고가 받아들이는 모양인지를 잔액 충전 전에 확인하는 용도.
//
// 실제로 알리고 서버에 진짜 알림톡 발송 요청을 보내는 엔드포인트이므로
// (testMode가 붙었을 뿐 요청 자체는 진짜다), 관리자 패널 밖으로 공개하거나
// 링크를 걸지 말 것. get-instagram-id.js처럼 곧바로 지울 파일은 아니고,
// 연동 점검이 필요할 때마다 다시 쓸 수 있게 남겨두는 도구다.
//
// Env vars required (실 발송 크론과 동일):
// ALIGO_API_KEY, ALIGO_USERID, ALIGO_SENDER_KEY, ALIGO_TEMPLATE_CODE,
// ALIGO_SENDER_PHONE

const { ProxyAgent } = require('undici');

const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

// QuotaGuard 정적 IP 프록시(QUOTAGUARDSTATIC_URL) -- 알리고가 호출 서버 IP를
// 화이트리스트로 검사하기 때문에 필요. setGlobalDispatcher로 전역 적용하지
// 않고 이 프록시 에이전트를 알리고 호출 한 곳에만 dispatcher로 지정하는
// 이유는, 전역 적용 시 이 함수 안의 Supabase 등 다른 fetch까지 종량제
// 프록시 대역폭을 소모하게 되기 때문이다. 아직 QuotaGuard 가입 전이라 env가
// 없으면 null로 두어 기존 동작(발송 실패)을 그대로 유지한다.
const aligoProxyAgent = process.env.QUOTAGUARDSTATIC_URL ? new ProxyAgent(process.env.QUOTAGUARDSTATIC_URL) : null;

const DEFAULT_TEST_CONTENT = '▩ 이것은 바이칼뉴스 3분 브리핑 발송 테스트입니다. 실제 발송이 정상 작동하는지 확인하는 메시지입니다.';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { phone, content } = body || {};

  // 번호 형식은 일부러 검증하지 않는다 -- 잘못된 번호를 알리고가 어떤
  // 코드/메시지로 되돌려주는지도 연동 점검에 유용한 신호이기 때문.
  if (!phone || !String(phone).trim()) {
    res.status(400).json({ error: '전화번호를 입력해 주세요.' });
    return;
  }

  const requiredEnv = ['ALIGO_API_KEY', 'ALIGO_USERID', 'ALIGO_SENDER_KEY', 'ALIGO_TEMPLATE_CODE', 'ALIGO_SENDER_PHONE'];
  const missing = requiredEnv.filter(name => !process.env[name]);
  if (missing.length > 0) {
    console.error('알리고(Aligo) 환경변수 누락:', missing.join(', '));
    res.status(500).json({ error: `알리고 환경변수가 설정되지 않았습니다: ${missing.join(', ')}` });
    return;
  }

  const message = (content && String(content).trim()) ? String(content) : DEFAULT_TEST_CONTENT;

  const params = new URLSearchParams({
    apikey: process.env.ALIGO_API_KEY,
    userid: process.env.ALIGO_USERID,
    senderkey: process.env.ALIGO_SENDER_KEY,
    tpl_code: process.env.ALIGO_TEMPLATE_CODE,
    sender: process.env.ALIGO_SENDER_PHONE,
    testMode: 'Y'
  });
  params.set('receiver_1', String(phone).trim());
  params.set('subject_1', '바이칼뉴스 3분 브리핑 (테스트)');
  params.set('message_1', message);

  try {
    const aligoRes = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      ...(aligoProxyAgent ? { dispatcher: aligoProxyAgent } : {})
    });
    // 알리고가 응답만 했다면 code가 0이 아니어도 그대로 돌려준다 -- 잔액 부족과
    // 템플릿 불일치를 구분하려면 알리고의 원본 code/message가 그대로 필요하다.
    const data = await aligoRes.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('알리고 테스트 발송 요청 실패:', err);
    res.status(500).json({ error: err.message });
  }
};
