// Vercel Cron target (see vercel.json's "crons" entry, "15 23 * * *" UTC =
// 08:15 KST daily -- 15분 뒤인 이유는 api/generate-daily-briefing.js가
// 08:00에 먼저 그 날의 카카오 알림톡 본문(kakao_content)을 자동 생성해
// 두기 때문에, 그게 끝난 뒤 이 함수가 실행되도록 여유를 둔 것) that
// actually sends the day's 카카오 3분 브리핑 알림톡 to every real
// kakao_subscribers row via Aligo's bizmessage API. Only fires when the
// admin has switched "발송 방식" to 자동 (app_settings.kakao_send_mode ===
// 'auto') -- admin.js's setKakaoSendMode()가 그 값을 쓴다. 수동 모드일 때는
// 지금까지처럼 관리자가 직접 카카오 채널 관리자센터에서 예약 발송한다.
//
// Idempotent by design: a Vercel retry or a double cron fire must never
// double-send to real subscribers. news_briefings.kakao_status가 이미
// 'sent'면 즉시 종료하고, 발송 자체가 부분 실패했을 때는 'error'로
// 표시해 두어 다음 실행(들)이 또 시도하지 않도록 막는다 (일부 chunk만
// 발송된 상태로 남더라도, 이미 보낸 chunk에 다시 보내는 것보다는 안전).
//
// Env vars required (set in Vercel):
// - ALIGO_API_KEY, ALIGO_USERID, ALIGO_SENDER_KEY, ALIGO_TEMPLATE_CODE,
//   ALIGO_SENDER_PHONE -- 알리고(Aligo) 비즈메시지 발송 계정/템플릿 정보.
// - SUPABASE_SERVICE_ROLE_KEY -- 실 구독자 전화번호 조회 및 발송 상태
//   기록은 anon 키의 permissive RLS에 기대지 않고 서비스 롤 키로 직접
//   수행한다 (돈이 나가는 실제 발송 동작이므로).
// SUPABASE_URL은 이미 공개된 값 (js/supabase-config.js에 클라이언트에도
// 노출되어 있음 -- 접근 통제는 키 자체의 비밀성이 아니라 RLS/서비스 롤
// 권한으로 이뤄짐), 다른 api/*.js 파일과 동일한 패턴으로 하드코딩한다.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";

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
    `${SUPABASE_URL}/rest/v1/kakao_subscribers?select=id,phone,name`,
    { headers: serviceRoleHeaders(serviceRoleKey) }
  );
  if (!res.ok) throw new Error(`Supabase kakao_subscribers 조회 실패: ${res.status}`);
  return res.json();
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

// 한 번의 API 호출로 최대 500명까지 -- receiver_N/recvname_N/subject_N/
// message_N 넘버링 파라미터로 묶어 보낸다 (알리고 API 스펙). message는
// 모든 수신자에게 동일한 브로드캐스트라 매번 같은 문자열을 반복해서 넣는다.
async function sendAligoChunk(subscribers, briefingContent) {
  const params = new URLSearchParams({
    apikey: process.env.ALIGO_API_KEY,
    userid: process.env.ALIGO_USERID,
    senderkey: process.env.ALIGO_SENDER_KEY,
    tpl_code: process.env.ALIGO_TEMPLATE_CODE,
    sender: process.env.ALIGO_SENDER_PHONE
  });
  subscribers.forEach((sub, idx) => {
    const n = idx + 1;
    params.set(`receiver_${n}`, sub.phone);
    if (sub.name) params.set(`recvname_${n}`, sub.name);
    params.set(`subject_${n}`, '바이칼뉴스 3분 브리핑');
    params.set(`message_${n}`, briefingContent);
  });

  const res = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const data = await res.json();
  return data;
}

module.exports = async (req, res) => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
    return;
  }
  const aligoConfigured = process.env.ALIGO_API_KEY && process.env.ALIGO_USERID &&
    process.env.ALIGO_SENDER_KEY && process.env.ALIGO_TEMPLATE_CODE && process.env.ALIGO_SENDER_PHONE;
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
    if (!row.kakao_content || !row.kakao_content.trim()) {
      console.log(`${today} 브리핑에 카카오 본문(kakao_content)이 비어 있어 발송을 건너뜁니다.`);
      res.status(200).json({ skipped: 'no_kakao_content', date: today });
      return;
    }
    if (row.kakao_status === 'sent') {
      console.log(`${today} 브리핑은 이미 발송 완료(kakao_status='sent') 상태입니다. 중복 발송 방지를 위해 건너뜁니다.`);
      res.status(200).json({ skipped: 'already_sent', date: today });
      return;
    }
    if (row.kakao_status === 'error') {
      console.log(`${today} 브리핑은 kakao_status='error' 상태라 발송을 건너뜁니다 (관리자 확인/수동 재시도 필요).`);
      res.status(200).json({ skipped: 'kakao_status_error', date: today });
      return;
    }

    const subscribers = await fetchAllKakaoSubscribers(serviceRoleKey);
    if (subscribers.length === 0) {
      console.log('카카오 구독자가 0명이라 발송할 대상이 없습니다.');
      res.status(200).json({ skipped: 'no_subscribers', date: today });
      return;
    }

    const chunks = chunkArray(subscribers, 500);
    const mids = [];
    let sentCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let result;
      try {
        result = await sendAligoChunk(chunk, row.kakao_content);
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
      if (result.info && result.info.mid) mids.push(result.info.mid);
      console.log(`알리고 발송 성공 (chunk ${i + 1}/${chunks.length}, ${chunk.length}명, mid=${result.info && result.info.mid}).`);
    }

    await updateBriefingKakaoStatus(serviceRoleKey, today, { kakao_status: 'sent', kakao_sent_at: new Date().toISOString() });
    console.log(`${today} 카카오 브리핑 발송 완료: 총 ${sentCount}명, ${chunks.length}건.`);
    res.status(200).json({ ok: true, date: today, sentCount, mid: mids });
  } catch (err) {
    console.error('카카오 브리핑 발송 처리 중 오류:', err);
    res.status(500).json({ error: err.message });
  }
};
