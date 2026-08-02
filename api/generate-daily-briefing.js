// Vercel Cron target (see vercel.json's "crons" entry, "0 23 * * *" UTC =
// 08:00 KST daily) that auto-generates the "웹사이트 게시용" 3분 뉴스
// 브리핑 every morning so the admin doesn't have to remember to click
// "오늘의 브리핑 생성" themselves. This mirrors admin/js/admin.js's
// generateWebBriefing() (Naver ranking scrape -> Gemini summarize) but runs
// server-side, since a cron job has no browser/admin session to drive it.
//
// Deliberately does NOT auto-publish: the row is inserted with
// status='draft', so it stays invisible on the public briefing.html
// archive (which only reads status='published' rows) until an admin
// reviews it in the "웹사이트 게시용" panel and clicks "웹사이트에 게시".
// This was an explicit choice -- unreviewed AI output going straight to a
// public page unattended was judged too risky to skip human sign-off.
//
// Idempotent: if a row already exists for today's (KST) date -- whether
// it's a manually-generated draft or already published -- this exits
// without overwriting it, so a Vercel retry or an admin who already
// generated today's brief by hand can't clobber existing work.
//
// Env var required (set in Vercel): GEMINI_API_KEY (same key already used
// in the admin panel's AI 기사 집필실). Supabase URL/anon key below are
// already public (embedded client-side in js/supabase-config.js; access is
// governed by RLS, not key secrecy), so hardcoding them here isn't a new
// exposure -- same approach as api/kakao-oauth-callback.js.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";

function todayKstDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// AI가 지침을 어기고 "독자 여러분, 안녕하십니까..." 같은 인사말을
// 첫 줄에 슬쩍 넣는 경우에 대비한 방어적 백스톱 (admin.js의 동일 함수와
// 동작을 맞춘다 -- 이 서버 함수는 admin.js를 import할 수 없어 중복 유지).
function stripLeakedWebBriefingGreeting(text) {
  const lines = text.split('\n');
  if (lines.length === 0) return text;
  const firstLine = lines[0].trim();
  if (firstLine.startsWith('▩')) return text;

  const looksLikeGreeting = /안녕하십니까|독자 여러분|반갑습니다|찾아뵙|전달해 드립니다|브리핑입니다/.test(firstLine);
  if (!looksLikeGreeting) return text;

  const blankIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '');
  const rest = blankIdx === -1 ? [] : lines.slice(blankIdx + 1);
  return rest.join('\n').replace(/^\n+/, '');
}

// select=id,content,kakao_content 이유: 존재 여부뿐 아니라, 이미 존재하는
// 행이라면 그 웹 브리핑 본문(카카오 압축의 소스)과 카카오 브리핑이 이미
// 채워져 있는지까지 한 번에 알아야 아래 카카오 생성 단계에서 또 조회하지
// 않아도 된다.
async function fetchBriefingRowForDate(date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_briefings?briefing_date=eq.${date}&select=id,content,kakao_content,kakao_status`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase existence check failed: ${res.status}`);
  const rows = await res.json();
  return rows.length > 0 ? rows[0] : null;
}

// Same [title](url) markdown-link extraction as admin.js's
// parseNaverTrendingFromMarkdown() -- kept in sync manually since this
// serverless function can't import browser-oriented admin.js directly.
function parseNaverTrendingFromMarkdown(markdown) {
  const linkRegex = /\[([^\]]{8,80})\]\((https:\/\/n\.news\.naver\.com\/article\/[^)]+)\)/g;
  const seen = new Set();
  const unique = [];
  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    const title = match[1].trim();
    if (!seen.has(title)) {
      seen.add(title);
      unique.push(title);
    }
    if (unique.length >= 30) break;
  }
  return unique;
}

async function fetchNaverTrendingTitles() {
  const targetUrl = 'https://news.naver.com/main/ranking/popularDay.naver';

  try {
    const res = await fetch(`https://r.jina.ai/${targetUrl}`);
    if (res.ok) {
      const markdown = await res.text();
      const titles = parseNaverTrendingFromMarkdown(markdown);
      if (titles.length > 0) return titles;
    }
  } catch (err) {
    console.warn('jina.ai reader 실패, 직접 HTML 파싱으로 재시도:', err);
  }

  // Fallback: server-side fetch has no CORS restriction, so we can hit
  // Naver directly and regex out headline links (no DOMParser in Node).
  const res = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Naver ranking page fetch failed: ${res.status}`);
  const html = await res.text();
  const linkRegex = /<a[^>]+href="([^"]*\/article\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const seen = new Set();
  const unique = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (title.length >= 8 && !seen.has(title)) {
      seen.add(title);
      unique.push(title);
    }
    if (unique.length >= 30) break;
  }
  if (unique.length === 0) throw new Error('네이버 랭킹 뉴스 목록을 파싱하지 못했습니다.');
  return unique;
}

// Same discovery approach as admin.js's resolveGeminiVisionModel(), without
// the localStorage cache (each cron invocation is a fresh process).
async function resolveGeminiModel(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
    const data = await res.json();
    const models = (data.models || []).filter(m =>
      (m.supportedGenerationMethods || []).includes('generateContent') &&
      !/embedding|tts|imagen|image-generation/i.test(m.name)
    );
    if (models.length === 0) throw new Error('No usable text models available');
    const pick = (predicate) => models.find(predicate);
    const chosen = pick(m => /flash-latest$/i.test(m.name)) || pick(m => /flash/i.test(m.name)) || models[0];
    return chosen.name.replace(/^models\//, '');
  } catch (err) {
    console.warn('Gemini 모델 자동 탐색 실패, 기본값 사용:', err);
    return 'gemini-flash-latest';
  }
}

async function callGeminiText(apiKey, prompt, systemInstruction) {
  const model = await resolveGeminiModel(apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
  if (systemInstruction) requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini 응답에서 텍스트를 찾을 수 없습니다.');
  return text;
}

// 카카오 알림톡 변수(#{brief}) 자리에 들어갈 압축판 -- admin.js의
// generateKakaoBriefing()과 완전히 동일한 프롬프트/재시도 로직을 서버
// 함수에도 그대로 포팅한다 (이 크론은 admin.js를 import할 수 없어 중복
// 유지). 650자를 넘기면 알림톡 발송 자체가 불가능한 기술적 제한이라,
// 한 번 더 짧게 재시도하고 그래도 넘으면 절대 발송용으로 저장하지 않는다.
const KAKAO_BRIEFING_VAR_CHAR_LIMIT = 650;
const KAKAO_BRIEFING_VAR_CHAR_TARGET_MIN = 550;

// 발송 직전 본문 끝에 기계적으로 붙이는 구독취소 안내 (admin.js의 동일 상수와
// 동작을 맞춘다 -- 이 서버 함수는 admin.js를 import할 수 없어 중복 유지).
// AI가 쓰는 문구가 아니라 생성 후 고정으로 덧붙이므로, 위 두 상수(전체
// 메시지 기준)에서 이 문구의 글자수만큼 뺀 범위를 AI에게 목표로 준다.
const KAKAO_BRIEFING_UNSUBSCRIBE_FOOTER = "\n\n▶ 더 이상 받고 싶지 않으시면 baikalnews.com에서 구독취소를 눌러주세요.";
const KAKAO_BRIEFING_AI_CHAR_TARGET_MIN = KAKAO_BRIEFING_VAR_CHAR_TARGET_MIN - KAKAO_BRIEFING_UNSUBSCRIBE_FOOTER.length;
const KAKAO_BRIEFING_AI_CHAR_LIMIT = KAKAO_BRIEFING_VAR_CHAR_LIMIT - KAKAO_BRIEFING_UNSUBSCRIBE_FOOTER.length;

function stripLeakedKakaoBriefingHeader(text) {
  const lines = text.split('\n');
  if (lines.length > 1) {
    const firstLine = lines[0].trim();
    const looksLikeHeader = /^[☀️🌅📰🔔]/.test(firstLine) || (/브리핑/.test(firstLine) && /\d{4}년|\d+월|\d+일/.test(firstLine));
    if (looksLikeHeader) {
      return lines.slice(1).join('\n').replace(/^\n+/, '');
    }
  }
  return text;
}

function buildKakaoBriefingPrompt(sourceContent, extra) {
  return `
아래는 오늘 바이칼 뉴스 웹사이트에 게시된 "3분 뉴스 브리핑"의 원문입니다. 같은 뉴스를 다시 수집하지 말고, 이 원문에 담긴 소식만을 바탕으로 카카오톡 "알림톡"으로 발송할 압축판 본문을 작성하십시오.

[웹사이트 게시용 브리핑 원문]
${sourceContent}

[작성 지침 -- 반드시 모두 지킬 것]
- 원문에 담긴 뉴스 항목을 빠짐없이 다루되, 각 항목을 짧은 한 문장(또는 이어지는 두 문장)으로 압축하십시오. 원문에 없는 새로운 사실을 추가하거나 추측하지 마십시오.
- 공백 포함 ${KAKAO_BRIEFING_AI_CHAR_TARGET_MIN}~${KAKAO_BRIEFING_AI_CHAR_LIMIT}자 "사이"가 되도록 작성하십시오 (${KAKAO_BRIEFING_AI_CHAR_LIMIT}자를 절대 넘기면 안 되지만, ${KAKAO_BRIEFING_AI_CHAR_TARGET_MIN}자에 크게 못 미치게 짧게 끝내지도 마십시오). 이것은 권장이 아니라 카카오 알림톡 발송 자체가 가능한지를 가르는 기술적 제한입니다.
- (매우 중요) 각 뉴스 항목은 "▩ "로 시작하십시오 (번호 대신 이 기호를 사용하십시오). "제목 줄"과 "설명 줄"을 따로 나누지 말고, 하나의 문장으로 바로 핵심 사실을 전달하십시오. 예를 들어 "▩ 밭일하던 100세 할머니 숨진 채 발견\n밭일을 하던 100세 할머니가 숨진 채 발견되었습니다." 처럼 제목을 쓰고 그 아래 줄에서 같은 내용을 다시 풀어 쓰는 방식은 같은 내용이 중복되어 글자를 낭비하므로 절대 금지합니다. 대신 "▩ 밭일하던 100세 할머니 숨진 채 발견됨, 당시 체온 42.2도로 측정돼 폭염 주의 당부됨"처럼 "▩ " 뒤에 바로 한 줄로 이어서 쓰십시오. 각 항목 사이에는 빈 줄을 하나씩 넣어 구분하십시오.
- 문장 종결은 "~습니다/합니다" 같은 정중체가 아니라, 뉴스 속보에서 쓰는 간결한 "음슴체"로 끝내십시오 (예: "발견되었습니다" → "발견됨", "결정했습니다" → "결정함", "확인됐습니다" → "확인됨", "별세했습니다" → "별세함", "비판했습니다" → "비판함"). 음슴체는 문장이 짧아져 글자수 예산도 더 아낄 수 있습니다.
- 이 메시지는 카카오 "알림톡"(정보성 메시지)으로 발송되므로, 광고성 문구(할인/이벤트/쿠폰 안내, "지금 확인하세요"·"바로가기" 같은 행동 유도 문구, 특정 상품이나 서비스에 대한 홍보·추천)를 절대 포함하지 마십시오. 오늘의 뉴스 사실을 안내하는 정보성 문장으로만 구성하십시오.
- (매우 중요) 인사말, 헤더, 마무리 문구, 날짜, "☀" 같은 장식적 이모지 타이틀을 절대 넣지 마십시오 -- 이미 승인된 고정 템플릿에 별도로 포함되어 있어, 여기서 또 넣으면 중복되고 글자 예산만 낭비됩니다. 첫 줄부터 바로 "▩ "로 시작하는 첫 번째 뉴스 항목으로 시작하십시오.
- 마크다운 문법(#, **, - 등) 없이 "▩ "와 줄바꿈만으로 구성하십시오.
- 다른 설명 없이, 뉴스 요약 본문 그 자체만 출력하십시오.
${extra || ''}`;
}

async function generateKakaoBriefingText(apiKey, sourceContent) {
  const systemInstruction = "당신은 웹사이트에 이미 게시된 3분 뉴스 브리핑 원문을 카카오 알림톡(정보성 메시지) 발송용으로 압축·재구성하는 편집자입니다. 원문에 없는 내용을 추가하지 말고, 절대 광고성/행동유도 문구를 쓰지 말고, 헤더나 인사말 없이 뉴스 항목으로 바로 시작하며, 주어진 글자수 범위를 반드시 지키십시오.";

  let resultText = stripLeakedKakaoBriefingHeader(
    (await callGeminiText(apiKey, buildKakaoBriefingPrompt(sourceContent), systemInstruction)).trim()
  );

  // AI 본문 자체는 고정 구독취소 문구를 뺀 예산(KAKAO_BRIEFING_AI_CHAR_*) 안에서
  // 판단한다 -- 전체 메시지 기준(650/550자) 최종 판정은 문구를 붙인 뒤
  // generateAndSaveKakaoIfNeeded()에서 따로 한다. 재시도는 admin.js의
  // generateKakaoBriefing()과 동일하게 각 방향으로 딱 한 번만.
  if (resultText.length > KAKAO_BRIEFING_AI_CHAR_LIMIT) {
    const retryExtra = `\n[중요] 방금 작성한 내용이 ${resultText.length}자로 ${KAKAO_BRIEFING_AI_CHAR_LIMIT}자 제한을 넘었습니다. 항목 수를 더 줄여서라도 반드시 ${KAKAO_BRIEFING_AI_CHAR_LIMIT}자 이내로 다시 작성하십시오.`;
    resultText = stripLeakedKakaoBriefingHeader(
      (await callGeminiText(apiKey, buildKakaoBriefingPrompt(sourceContent, retryExtra), systemInstruction)).trim()
    );
  } else if (resultText.length < KAKAO_BRIEFING_AI_CHAR_TARGET_MIN) {
    const retryExtra = `\n[중요] 방금 작성한 내용이 ${resultText.length}자로 너무 짧습니다. 원문에 없는 내용을 새로 지어내지 말고, 원문에 이미 있는 각 항목의 설명을 조금 더 자세히 풀어서, 반드시 ${KAKAO_BRIEFING_AI_CHAR_TARGET_MIN}~${KAKAO_BRIEFING_AI_CHAR_LIMIT}자 사이가 되도록 다시 작성하십시오.`;
    resultText = stripLeakedKakaoBriefingHeader(
      (await callGeminiText(apiKey, buildKakaoBriefingPrompt(sourceContent, retryExtra), systemInstruction)).trim()
    );
  }

  // 구독취소 안내는 AI가 쓰는 게 아니라 여기서 기계적으로 덧붙인다 -- 어느
  // 분기(그대로/길어서 재시도/짧아서 재시도)를 거쳤든 이 지점에서 한 번만
  // 붙이면 모든 성공 경로에 빠짐없이 적용된다.
  return resultText + KAKAO_BRIEFING_UNSUBSCRIBE_FOOTER;
}

// PATCH가 아니라 POST(on_conflict) upsert를 썼더니, title/content가 NOT NULL
// 컬럼이라 kakao_* 필드만 담은 요청이 "그 컬럼들을 NULL로 삽입 시도"로
// 해석되어 제약조건 위반 에러가 났다 (PostgREST가 INSERT ... ON CONFLICT로
// 변환하는 과정에서, 본문에 없는 NOT NULL 컬럼도 INSERT 값 구성 단계에서
// 검증되기 때문 -- ON CONFLICT DO UPDATE로 넘어가기도 전에 실패함). 이
// 함수가 호출되는 시점엔 이미 해당 날짜의 웹 브리핑 행이 항상 존재하므로
// (막 새로 만들었거나, existingRow 분기로 들어왔거나), upsert가 아니라
// 단순 UPDATE(PATCH)면 충분하고 이 문제 자체가 발생하지 않는다.
async function upsertKakaoBriefingFields(date, fields) {
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/news_briefings?briefing_date=eq.${date}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(fields)
  });
  if (!patchRes.ok) {
    const errText = await patchRes.text();
    throw new Error(`Supabase news_briefings kakao update failed: ${errText}`);
  }
}

// 웹 브리핑 생성/저장이 이미 성공한 뒤 호출되는 별도 단계 -- 이 함수
// 내부에서 실패가 나도 (자체 try/catch로) 절대 throw하지 않는다. 이미
// 저장된 웹 브리핑 응답까지 500으로 날려버리면 안 되기 때문.
async function generateAndSaveKakaoIfNeeded(apiKey, date, sourceContent) {
  try {
    const resultText = await generateKakaoBriefingText(apiKey, sourceContent);

    if (resultText.length > KAKAO_BRIEFING_VAR_CHAR_LIMIT) {
      console.error(`${date} 카카오 브리핑: 재시도에도 불구하고 ${resultText.length}자로 제한(${KAKAO_BRIEFING_VAR_CHAR_LIMIT}자) 초과 -- 발송용으로 저장하지 않음.`);
      await upsertKakaoBriefingFields(date, { kakao_status: 'error', kakao_error: 'char_limit_exceeded_after_retry' });
      return { ok: false, reason: 'char_limit_exceeded_after_retry', length: resultText.length };
    }

    await upsertKakaoBriefingFields(date, { kakao_content: resultText, kakao_status: 'draft' });
    console.log(`${date} 카카오 브리핑 자동 생성 완료 (초안 상태, ${resultText.length}자).`);
    return { ok: true, length: resultText.length };
  } catch (err) {
    console.error(`${date} 카카오 브리핑 자동 생성 실패:`, err);
    return { ok: false, reason: err.message };
  }
}

module.exports = async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    return;
  }

  const today = todayKstDate();

  try {
    const existingRow = await fetchBriefingRowForDate(today);

    if (existingRow) {
      // 웹 브리핑은 이미 있음(수동 생성 또는 이전 크론 실행) -- 이 행을
      // 덮어쓰지 않는다. 다만 카카오 압축본은 아직 없을 수 있으므로
      // (예: 관리자가 웹 브리핑만 수동 생성하고 카카오 탭은 안 연 경우),
      // kakao_content가 비어 있을 때만 그 기존 웹 본문을 소스로 카카오
      // 생성을 이어서 시도한다 -- 이미 있으면(관리자가 직접 수정했을 수도
      // 있으므로) 그대로 둔다.
      console.log(`${today} 브리핑이 이미 존재합니다 (수동 생성 또는 이전 크론 실행). 웹 브리핑 생성은 건너뜁니다.`);
      let kakaoResult = { skipped: 'already_has_kakao_content' };
      if (!existingRow.kakao_content) {
        kakaoResult = await generateAndSaveKakaoIfNeeded(apiKey, today, existingRow.content);
      } else {
        console.log(`${today} 카카오 브리핑도 이미 존재합니다. 건너뜁니다.`);
      }
      res.status(200).json({ skipped: true, reason: 'already_exists', date: today, kakao: kakaoResult });
      return;
    }

    const titles = await fetchNaverTrendingTitles();
    const newsListText = titles.slice(0, 30).map((t, i) => `${i + 1}. ${t}`).join('\n');
    const todayLabel = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul'
    });

    const prompt = `
아래는 오늘(${todayLabel}) 네이버 랭킹 뉴스 기준 화제가 된 뉴스 제목 목록입니다. 이를 바탕으로 바이칼 뉴스 웹사이트에 게시할 "3분 뉴스 브리핑" 글을 작성하십시오. 이것은 카카오톡 알림톡처럼 글자수 제한이 있는 짧은 글이 아니라, 웹페이지에 그대로 게시되는 정식 기사 형태의 글입니다.

[오늘의 화제 뉴스 제목 목록]
${newsListText}

[작성 지침]
- 전체를 천천히 읽어도 3분 정도(공백 포함 2,600~3,600자 정도)에 읽을 수 있는 분량으로 작성하십시오.
- 오늘의 주요 뉴스를 18~22개 정도 선별하십시오 (적은 소식을 길게 쓰기보다, 많은 소식을 짧고 간결하게 다루는 것이 목표입니다).
- 각 뉴스 항목은 반드시 "▩ "로 시작하는 소제목 한 줄을 쓰고, 그 다음 줄에 설명을 1문장(최대 2문장)으로 짧게 압축해 작성하십시오. "▩ "는 웹사이트에서 굵게 강조되어 표시되므로 반드시 포함해야 합니다.
- 각 항목의 설명 문장은 "~습니다/합니다" 같은 정중체가 아니라, 뉴스 속보에서 쓰는 간결한 "음슴체"로 끝내십시오 (예: "발견되었습니다" → "발견됨", "결정했습니다" → "결정함", "확인됐습니다" → "확인됨", "발표했습니다" → "발표함"). 제목만으로 알 수 없는 내용은 추측하지 말고, 명백한 사실 위주로 작성하십시오.
- 각 항목 사이에는 빈 줄을 하나씩 넣어 구분하십시오.
- 광고성 문구나 특정 상품·서비스 홍보는 포함하지 마십시오.
- 마크다운 문법(#, **, - 등)은 사용하지 마십시오. "▩ "와 줄바꿈만으로 구조를 표현하십시오.
- (매우 중요) "독자 여러분, 안녕하십니까" 같은 인사말이나 도입 문장, 마무리 인사를 절대 넣지 마십시오. 첫 줄부터 바로 "▩ "로 시작하는 첫 번째 뉴스 항목으로 시작하십시오.
- 글 전체의 제목이 될 한 줄을 가장 먼저 "[제목] " 접두사와 함께 작성하십시오 (예: "[제목] 7월 29일, 오늘의 3분 뉴스"). 이 줄 다음에 바로 뉴스 항목들을 이어가십시오.
- 다른 설명 없이, 제목 줄과 본문만 출력하십시오.`;

    const systemInstruction = "당신은 바이칼 뉴스 웹사이트의 '3분 뉴스 브리핑' 코너를 작성하는 뉴스 큐레이터입니다. 인사말이나 도입 문장 없이 뉴스 항목으로 바로 시작하며, 각 뉴스 항목은 '▩ ' 소제목과 음슴체로 끝나는 짧은 설명으로 간결하게 작성하고, 사실 전달에만 집중해 3분 분량의 정리 기사를 작성하십시오.";

    let resultText = stripLeakedWebBriefingGreeting((await callGeminiText(apiKey, prompt, systemInstruction)).trim());

    let title = `${todayLabel} 3분 뉴스 브리핑`;
    const titleMatch = resultText.match(/^\[제목\]\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
      resultText = stripLeakedWebBriefingGreeting(resultText.replace(/^\[제목\]\s*.+$/m, '').replace(/^\n+/, '').trim());
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/news_briefings?on_conflict=briefing_date`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ briefing_date: today, title, content: resultText, status: 'draft' })
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`Supabase news_briefings insert failed: ${errText}`);
    }

    console.log(`${today} 브리핑 자동 생성 완료 (초안 상태, ${resultText.length}자).`);

    // 웹 브리핑은 이미 저장이 끝난 뒤이므로, 카카오 생성이 실패해도 이미
    // 성공한 웹 브리핑 응답을 절대 막지 않는다 (generateAndSaveKakaoIfNeeded는
    // 자체적으로 에러를 삼키고 결과 객체를 반환함).
    const kakaoResult = await generateAndSaveKakaoIfNeeded(apiKey, today, resultText);

    res.status(200).json({ ok: true, date: today, length: resultText.length, kakao: kakaoResult });
  } catch (err) {
    console.error('일일 브리핑 자동 생성 실패:', err);
    res.status(500).json({ error: err.message });
  }
};
