// Vercel Cron target (see vercel.json's "crons" entry, "15 23 * * *" UTC =
// 08:15 KST daily -- 15분 뒤인 이유는 api/generate-daily-briefing.js가
// 08:00에 먼저 그 날의 카카오 브랜드메시지 본문(kakao_content)을 자동
// 생성해 두기 때문에, 그게 끝난 뒤 이 함수가 실행되도록 여유를 둔 것) that
// actually sends the day's 카카오 3분 브리핑 브랜드메시지(Brand Message,
// 구 Friendtalk)를 every real kakao_subscribers row에게 Aligo의 비즈메시지
// API로 보낸다. Only fires when the admin has switched "발송 방식" to 자동
// (app_settings.kakao_send_mode === 'auto') -- admin.js's
// setKakaoSendMode()가 그 값을 쓴다. 수동 모드일 때는 지금까지처럼 관리자가
// 직접 카카오 채널 관리자센터에서 예약 발송한다.
//
// 알림톡(AlimTalk)에서 브랜드메시지로 전환한 이유: 카카오 정책상 구독형
// 뉴스레터성 콘텐츠는 알림톡(특정 사용자 행동에 결부된 정보성 메시지 전용)
// 대상이 아니라 브랜드메시지(마케팅/채널 친구 동의 기반)로 보내야 한다.
// kakao_target: 'N'(채널 친구 대상)을 쓰므로, 카카오톡 채널 추가 동의가
// 필수 동의로 전환된 이후 가입한 구독자들이 실제 채널 친구가 되어 있어야
// 발송이 성립한다 -- 전화번호 수집 자체는 여전히 필요하다 (채널 친구
// 전체 브로드캐스트가 아니라, 알리고가 번호별로 채널 친구 여부를
// 교차 검증하는 방식이기 때문).
//
// Idempotent by design: a Vercel retry or a double cron fire must never
// double-send to real subscribers. news_briefings.kakao_status가 이미
// 'sent'면 즉시 종료하고, 발송 자체가 부분 실패했을 때는 'error'로
// 표시해 두어 다음 실행(들)이 또 시도하지 않도록 막는다 (일부 chunk만
// 발송된 상태로 남더라도, 이미 보낸 chunk에 다시 보내는 것보다는 안전).
//
// Env vars required (set in Vercel):
// - ALIGO_API_KEY, ALIGO_USERID, ALIGO_SENDER_KEY, ALIGO_BRAND_TEMPLATE_CODE,
//   ALIGO_SENDER_PHONE -- 알리고(Aligo) 비즈메시지 발송 계정/템플릿 정보.
//   ALIGO_BRAND_TEMPLATE_CODE는 api/create-brand-template.js를 한 번 호출해
//   얻는 브랜드메시지 전용 템플릿 코드로, 기존 알림톡용 ALIGO_TEMPLATE_CODE와
//   별개다 (그 값은 건드리지 않고 그대로 둔다).
// - SUPABASE_SERVICE_ROLE_KEY -- 실 구독자 전화번호 조회 및 발송 상태
//   기록은 anon 키의 permissive RLS에 기대지 않고 서비스 롤 키로 직접
//   수행한다 (돈이 나가는 실제 발송 동작이므로).
// SUPABASE_URL은 이미 공개된 값 (js/supabase-config.js에 클라이언트에도
// 노출되어 있음 -- 접근 통제는 키 자체의 비밀성이 아니라 RLS/서비스 롤
// 권한으로 이뤄짐), 다른 api/*.js 파일과 동일한 패턴으로 하드코딩한다.

const { ProxyAgent } = require('undici');

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";

// QuotaGuard 정적 IP 프록시(QUOTAGUARDSTATIC_URL) -- 알리고가 호출 서버 IP를
// 화이트리스트로 검사하기 때문에 필요. setGlobalDispatcher로 전역 적용하지
// 않고 알리고 발송 호출(sendAligoChunk) 한 곳에만 dispatcher로 지정하는
// 이유는, 전역 적용 시 이 함수 안의 Supabase 조회/갱신 fetch들까지 종량제
// 프록시 대역폭을 소모하게 되기 때문이다. 아직 QuotaGuard 가입 전이라 env가
// 없으면 null로 두어 기존 동작(발송 실패)을 그대로 유지한다.
const aligoProxyAgent = process.env.QUOTAGUARDSTATIC_URL ? new ProxyAgent(process.env.QUOTAGUARDSTATIC_URL) : null;

// 관리자 화면(editor815.baikalnews.com)의 "지금 카카오 발송" 버튼이 이
// 함수를 fetch()로 직접 호출할 수 있도록 CORS 허용 (Vercel Cron 자체는
// 서버-대-서버 호출이라 CORS의 영향을 받지 않음 -- 브라우저의 교차 출처
// fetch/XHR에만 적용되는 제약이므로, 이 헤더 추가는 기존 크론 동작에는
// 아무 영향이 없음). api/test-kakao-send.js와 동일한 패턴.
const ADMIN_ORIGIN = 'https://editor815.baikalnews.com';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function todayKstDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function serviceRoleHeaders(serviceRoleKey, extra) {
  return Object.assign(
    { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    extra || {}
  );
}

// api/generate-daily-briefing.js의 동일 함수와 byte-identical하게 유지 (서로
// import할 수 없는 별개의 서버리스 함수라 이 코드베이스의 기존 관례대로 중복).
function canonicalCategoryKey(categories) {
  if (!categories || categories.length === 0 || categories.includes('all')) return 'all';
  return [...categories].sort().join(',');
}

async function getAppSetting(serviceRoleKey, key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/app_settings?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: serviceRoleHeaders(serviceRoleKey) }
  );
  if (!res.ok) throw new Error(`Supabase app_settings 조회 실패: ${res.status}`);
  const rows = await res.json();
  return rows.length > 0 ? rows[0].value : null;
}

async function fetchBriefingRowForDate(serviceRoleKey, date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_briefings?briefing_date=eq.${date}&select=id,kakao_content,kakao_status`,
    { headers: serviceRoleHeaders(serviceRoleKey) }
  );
  if (!res.ok) throw new Error(`Supabase news_briefings 조회 실패: ${res.status}`);
  const rows = await res.json();
  return rows.length > 0 ? rows[0] : null;
}

async function fetchAllKakaoSubscribers(serviceRoleKey) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kakao_subscribers?select=id,phone,name,categories`,
    { headers: serviceRoleHeaders(serviceRoleKey) }
  );
  if (!res.ok) throw new Error(`Supabase kakao_subscribers 조회 실패: ${res.status}`);
  return res.json();
}

// 오늘 날짜의 카테고리별 알림톡 변형을 category_key -> 행 맵으로 가져온다.
async function fetchVariantsForDate(serviceRoleKey, date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kakao_briefing_variants?briefing_date=eq.${date}&select=category_key,content,status`,
    { headers: serviceRoleHeaders(serviceRoleKey) }
  );
  if (!res.ok) throw new Error(`Supabase kakao_briefing_variants 조회 실패: ${res.status}`);
  const rows = await res.json();
  const map = new Map();
  rows.forEach(r => map.set(r.category_key, r));
  return map;
}

// 구독자 한 명에게 실제로 보낼 콘텐츠를 정한다: 자기 조합의 변형이 있으면
// 그것을, 없거나(status !== 'draft' 이거나 content가 비어 있어) 쓸 수 없으면
// 'all' 변형으로 대체한다. 'all'조차 쓸 수 없으면 null(이번 발송에서 제외).
function resolveSubscriberVariant(sub, variantMap) {
  const key = canonicalCategoryKey(sub.categories);
  const own = variantMap.get(key);
  if (own && own.status === 'draft' && own.content) {
    return { categoryKey: key, content: own.content };
  }
  if (key !== 'all') {
    console.log(`구독자 ${sub.id}: '${key}' 변형을 사용할 수 없어(${own ? `status=${own.status}` : '없음'}) 'all'로 대체합니다.`);
  }
  const all = variantMap.get('all');
  if (all && all.status === 'draft' && all.content) {
    return { categoryKey: 'all', content: all.content };
  }
  console.log(`구독자 ${sub.id}: 'all' 변형도 사용할 수 없어 이번 발송에서 제외합니다.`);
  return null;
}

// 실제로 발송에 쓰인 카테고리 조합들을 'sent'로 표시한다 (실패해도 발송
// 자체는 이미 끝난 뒤이므로 개별 로그만 남기고 계속 진행).
async function markVariantsSent(serviceRoleKey, date, categoryKeys) {
  const now = new Date().toISOString();
  for (const key of categoryKeys) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/kakao_briefing_variants?briefing_date=eq.${date}&category_key=eq.${encodeURIComponent(key)}`,
      {
        method: 'PATCH',
        headers: serviceRoleHeaders(serviceRoleKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: 'sent', sent_at: now })
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error(`카카오 브리핑 변형(${key}) 발송 상태 갱신 실패: ${errText}`);
    }
  }
}

async function updateBriefingKakaoStatus(serviceRoleKey, date, fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/news_briefings?briefing_date=eq.${date}`, {
    method: 'PATCH',
    headers: serviceRoleHeaders(serviceRoleKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(fields)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase news_briefings 발송 상태 갱신 실패: ${errText}`);
  }
}

// 한 번의 API 호출로 최대 500명까지 -- receiver_N/receiver_N_message
// 넘버링 파라미터로 묶어 보낸다 (알리고 브랜드메시지 API 스펙). 알림톡의
// message_N(평문 문자열)과 달리, 브랜드메시지는 receiver_N_message에
// "템플릿 변수명 -> 값" 매핑을 담은 JSON 문자열을 넣는다 -- 이 템플릿은
// #{brief} 변수 하나만 쓰므로 매번 { "#{brief}": item.content } 하나만
// 채운다. kakao_target: 'N'(채널 친구 대상)은 설계상 고정값이라 구독자별로
// 달라지지 않는다.
async function sendAligoChunk(resolvedChunk) {
  const params = new URLSearchParams({
    apikey: process.env.ALIGO_API_KEY,
    userid: process.env.ALIGO_USERID,
    senderkey: process.env.ALIGO_SENDER_KEY,
    template_code: process.env.ALIGO_BRAND_TEMPLATE_CODE,
    sender: process.env.ALIGO_SENDER_PHONE,
    kakao_target: 'N',
    advert_yn: 'Y',
    failoverYn: 'N'
  });
  resolvedChunk.forEach((item, idx) => {
    const n = idx + 1;
    params.set(`receiver_${n}`, item.sub.phone);
    params.set(`receiver_${n}_message`, JSON.stringify({ '#{brief}': item.content }));
  });

  const res = await fetch('https://kakaoapi.aligo.in/brandtalk/template/send/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    ...(aligoProxyAgent ? { dispatcher: aligoProxyAgent } : {})
  });
  const data = await res.json();
  return data;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
    return;
  }
  const aligoConfigured = process.env.ALIGO_API_KEY && process.env.ALIGO_USERID &&
    process.env.ALIGO_SENDER_KEY && process.env.ALIGO_BRAND_TEMPLATE_CODE && process.env.ALIGO_SENDER_PHONE;
  if (!aligoConfigured) {
    console.error('알리고(Aligo) 관련 환경변수가 하나 이상 설정되지 않았습니다.');
    res.status(500).json({ error: 'Aligo env vars not configured' });
    return;
  }

  const today = todayKstDate();

  try {
    const sendMode = await getAppSetting(serviceRoleKey, 'kakao_send_mode');
    if (sendMode !== 'auto') {
      console.log(`카카오 발송 모드가 '${sendMode || 'manual'}'이라 자동 발송을 건너뜁니다.`);
      res.status(200).json({ skipped: 'manual_mode', date: today });
      return;
    }

    const row = await fetchBriefingRowForDate(serviceRoleKey, today);
    if (!row) {
      console.log(`${today} 브리핑 행이 아직 없어 발송을 건너뜁니다 (08:00 생성 크론이 아직 실행 전이거나 실패했을 수 있음).`);
      res.status(200).json({ skipped: 'no_briefing_row', date: today });
      return;
    }
    if (row.kakao_status === 'sent') {
      console.log(`${today} 브리핑은 이미 발송 완료(kakao_status='sent') 상태입니다. 중복 발송 방지를 위해 건너뜁니다.`);
      res.status(200).json({ skipped: 'already_sent', date: today });
      return;
    }
    // 참고(Phase 2): news_briefings.kakao_content/kakao_status는 이제 'all'
    // 조합 하나만 나타낸다. 예전에는 이 값이 비어있거나 'error'면 전체
    // 발송을 건너뛰었지만, 이제는 'all'이 실패해도 각자 카테고리 조합의
    // 변형이 정상 생성된 구독자에게는 정상 발송해야 하므로, 이 두 조건으로
    // 전체를 막지 않는다 -- 실제 발송 가능 여부는 아래 구독자별 변형
    // 매칭(+ all 폴백) 결과로 판단한다.

    const subscribers = await fetchAllKakaoSubscribers(serviceRoleKey);
    if (subscribers.length === 0) {
      console.log('카카오 구독자가 0명이라 발송할 대상이 없습니다.');
      res.status(200).json({ skipped: 'no_subscribers', date: today });
      return;
    }

    const variantMap = await fetchVariantsForDate(serviceRoleKey, today);
    const resolved = [];
    const skippedSubscriberIds = [];
    subscribers.forEach(sub => {
      const r = resolveSubscriberVariant(sub, variantMap);
      if (r) resolved.push({ sub, categoryKey: r.categoryKey, content: r.content });
      else skippedSubscriberIds.push(sub.id);
    });

    if (resolved.length === 0) {
      console.log(`${today}: 발송 가능한 콘텐츠(카테고리 변형 또는 all)가 있는 구독자가 한 명도 없어 발송을 건너뜁니다.`);
      res.status(200).json({ skipped: 'no_kakao_content', date: today, skippedSubscriberIds });
      return;
    }
    if (skippedSubscriberIds.length > 0) {
      console.log(`${today}: 콘텐츠가 없어 이번 발송에서 제외된 구독자 ${skippedSubscriberIds.length}명: ${skippedSubscriberIds.join(', ')}`);
    }

    const chunks = chunkArray(resolved, 500);
    const mids = [];
    let sentCount = 0;
    const usedCategoryKeys = new Set();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let result;
      try {
        result = await sendAligoChunk(chunk);
      } catch (sendErr) {
        console.error(`알리고 발송 호출 자체가 실패했습니다 (chunk ${i + 1}/${chunks.length}):`, sendErr);
        await updateBriefingKakaoStatus(serviceRoleKey, today, { kakao_status: 'error', kakao_error: `send_request_failed: ${sendErr.message}` });
        res.status(200).json({ ok: false, reason: 'aligo_request_failed', message: sendErr.message, date: today, sentCount });
        return;
      }

      if (result.code !== 0) {
        console.error(`알리고 발송 실패 (chunk ${i + 1}/${chunks.length}, 코드 ${result.code}): ${result.message}`);
        await updateBriefingKakaoStatus(serviceRoleKey, today, { kakao_status: 'error', kakao_error: result.message || `aligo_error_code_${result.code}` });
        res.status(200).json({ ok: false, reason: 'aligo_send_failed', message: result.message, date: today, sentCount });
        return;
      }

      sentCount += chunk.length;
      chunk.forEach(item => usedCategoryKeys.add(item.categoryKey));
      if (result.info && result.info.mid) mids.push(result.info.mid);
      console.log(`알리고 발송 성공 (chunk ${i + 1}/${chunks.length}, ${chunk.length}명, mid=${result.info && result.info.mid}).`);
    }

    await markVariantsSent(serviceRoleKey, today, usedCategoryKeys);

    await updateBriefingKakaoStatus(serviceRoleKey, today, { kakao_status: 'sent', kakao_sent_at: new Date().toISOString() });
    console.log(`${today} 카카오 브리핑 발송 완료: 총 ${sentCount}명, ${chunks.length}건, 카테고리 조합 ${[...usedCategoryKeys].join(', ')}.`);
    res.status(200).json({
      ok: true,
      date: today,
      sentCount,
      mid: mids,
      categoryKeys: [...usedCategoryKeys],
      skippedSubscriberIds
    });
  } catch (err) {
    console.error('카카오 브리핑 발송 처리 중 오류:', err);
    res.status(500).json({ error: err.message });
  }
};
