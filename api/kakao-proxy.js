// Kakao 3분 브리핑 파이프라인의 non-OAuth endpoints, merged from what used
// to be generate-daily-briefing.js + send-kakao-briefing.js +
// test-kakao-send.js + create-brand-template.js + kakao-unsubscribe.js into
// one dispatched-by-action file. (api/kakao-oauth-callback.js stays a
// SEPARATE file -- Kakao's own developer console has that exact path
// registered as the OAuth redirect_uri, so it can't be folded in here
// without also updating that external registration.)
//
// Why merged: Vercel's Hobby plan caps a deployment at 12 Serverless
// Functions total (confirmed live 2026-10-01: "No more than 12 Serverless
// Functions can be added to a Deployment on the Hobby plan" build error,
// after the account was downgraded from Pro and the project had grown to
// 24 functions). Each file under api/ counts as one function regardless of
// how much logic it holds, so consolidating related endpoints behind a
// single dispatcher is the free way back under the cap -- no behavior
// changes, just fewer files. See also public-render.js, veo-proxy.js,
// gemini-video-proxy.js, threads-proxy.js, sns-proxy.js for the same
// pattern.
//
// The two Vercel Cron entries that used to hit generate-daily-briefing.js/
// send-kakao-briefing.js directly (no action needed, since GET from Cron
// has no body) were already removed from vercel.json earlier (the whole
// 3분 브리핑 pipeline was paused for AdSense review). admin.js's manual
// trigger buttons now send { action: '...' } in the POST body instead.

const { ProxyAgent } = require('undici');

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";

// 대부분의 action은 관리자 화면(editor815.baikalnews.com)에서만 호출되지만,
// action=unsubscribe는 공개 사이트(baikalnews.com)의 unsubscribe.html이
// 직접 호출한다 (kakao-unsubscribe.js가 따로 있었을 때와 동일). 고정
// origin 하나로는 둘 다 허용할 수 없어, 허용 목록에 있는 origin만 그대로
// 반사해주는 방식으로 바꿨다 -- preflight(OPTIONS)에도 동일하게 적용되도록
// action이 아니라 매 요청의 Origin 헤더를 본다.
const ALLOWED_ORIGINS = ['https://editor815.baikalnews.com', 'https://baikalnews.com'];

// QuotaGuard 정적 IP 프록시(QUOTAGUARDSTATIC_URL) -- 알리고가 호출 서버 IP를
// 화이트리스트로 검사하기 때문에 필요. setGlobalDispatcher로 전역 적용하지
// 않고 알리고 호출 한 곳에만 dispatcher로 지정하는 이유는, 전역 적용 시
// 종량제 프록시 대역폭이 Supabase 등 다른 fetch 호출에도 불필요하게 쓰이기
// 때문이다. 아직 QuotaGuard 가입 전이라 env가 없으면 null로 두어 기존
// 동작(발송 실패)을 그대로 유지한다.
const aligoProxyAgent = process.env.QUOTAGUARDSTATIC_URL ? new ProxyAgent(process.env.QUOTAGUARDSTATIC_URL) : null;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function todayKstDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// ==========================================================================
// action=generate-briefing (was generate-daily-briefing.js)
// ==========================================================================

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
// the localStorage cache (each invocation is a fresh process).
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

// 카카오 브랜드메시지 템플릿의 변수(#{brief}) 자리에 들어갈 압축판 --
// admin.js의 generateKakaoBriefing()과 완전히 동일한 프롬프트/재시도
// 로직을 서버 함수에도 그대로 포팅한다 (이 함수는 admin.js를 import할 수
// 없어 중복 유지). 구독취소 안내는 이제 승인된 템플릿 고정 문구 쪽에
// 포함되어 있어 여기서는 뉴스 본문만 다룬다 (알림톡→브랜드메시지 전환).
// 알림톡은 ~650자 하드 캡이 있었지만 브랜드메시지는 알리고 문서상 확인된
// 하드 캡이 없어, 아래 값은 실제 발송 테스트 전까지의 잠정 목표치다 --
// 알리고가 실제로 받아들이는 한도가 다르다고 확인되면 이 두 상수만
// 조정하면 된다. 초과 시 한 번 더 짧게 재시도하고 그래도 넘으면 절대
// 발송용으로 저장하지 않는다.
const KAKAO_BRIEFING_CHAR_LIMIT = 1500;
const KAKAO_BRIEFING_CHAR_TARGET_MIN = 1200;

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
아래는 오늘 바이칼 뉴스 웹사이트에 게시된 "3분 뉴스 브리핑"의 원문입니다. 같은 뉴스를 다시 수집하지 말고, 이 원문에 담긴 소식만을 바탕으로 카카오톡 "브랜드메시지"로 발송할 압축판 본문을 작성하십시오.

[웹사이트 게시용 브리핑 원문]
${sourceContent}

[작성 지침 -- 반드시 모두 지킬 것]
- (매우 중요) 원문에 담긴 모든 항목을 다 담으려 하지 마십시오. 아래 글자수 예산 안에서, 항목마다 제목만 반복하지 않고 그와 겹치지 않는 구체적인 사실(숫자·이름·장소·원인·결과 등)을 최소 하나는 반드시 넣을 수 있을 만큼만 항목을 선별하십시오. 덜 중요하거나 덜 흥미로운 항목은 과감히 제외하십시오 -- 항목 수를 줄여서라도 남긴 항목 하나하나의 정보량을 지키는 것이 항목을 다 담아 내용 없는 제목 나열이 되는 것보다 낫습니다. 원문에 없는 새로운 사실을 추가하거나 추측하지 마십시오.
- 공백 포함 ${KAKAO_BRIEFING_CHAR_TARGET_MIN}~${KAKAO_BRIEFING_CHAR_LIMIT}자 "사이"가 되도록 작성하십시오 (${KAKAO_BRIEFING_CHAR_LIMIT}자를 절대 넘기면 안 되지만, ${KAKAO_BRIEFING_CHAR_TARGET_MIN}자에 크게 못 미치게 짧게 끝내지도 마십시오).
- (매우 중요) 각 뉴스 항목은 "▩ "로 시작하십시오 (번호 대신 이 기호를 사용하십시오). "제목 줄"과 "설명 줄"을 따로 나누지 말고, 하나의 문장으로 바로 핵심 사실을 전달하십시오. 예를 들어 "▩ 밭일하던 100세 할머니 숨진 채 발견\n밭일을 하던 100세 할머니가 숨진 채 발견되었습니다." 처럼 제목을 쓰고 그 아래 줄에서 같은 내용을 다시 풀어 쓰는 방식은 같은 내용이 중복되어 글자를 낭비하므로 절대 금지합니다. 대신 "▩ 밭일하던 100세 할머니 숨진 채 발견됨, 당시 체온 42.2도로 측정돼 폭염 주의 당부됨"처럼 "▩ " 뒤에 바로 한 줄로 이어서 쓰십시오. 각 항목 사이에는 빈 줄을 하나씩 넣어 구분하십시오.
- 문장 종결은 "~습니다/합니다" 같은 정중체가 아니라, 뉴스 속보에서 쓰는 간결한 "음슴체"로 끝내십시오 (예: "발견되었습니다" → "발견됨", "결정했습니다" → "결정함", "확인됐습니다" → "확인됨", "별세했습니다" → "별세함", "비판했습니다" → "비판함"). 음슴체는 문장이 짧아져 글자수 예산도 더 아낄 수 있습니다.
- 이 메시지는 카카오 "브랜드메시지"로 발송되지만, 내용은 여전히 오늘의 뉴스 사실을 안내하는 정보성 문장으로만 구성하고 광고성 문구(할인/이벤트/쿠폰 안내, "지금 확인하세요"·"바로가기" 같은 행동 유도 문구, 특정 상품이나 서비스에 대한 홍보·추천)는 절대 포함하지 마십시오 -- 발송 채널의 정책 분류와 무관하게, 이건 뉴스 브리핑이지 광고가 아닙니다.
- (매우 중요) 인사말, 헤더, 마무리 문구, 날짜, "☀" 같은 장식적 이모지 타이틀을 절대 넣지 마십시오 -- 이미 승인된 고정 템플릿에 별도로 포함되어 있어, 여기서 또 넣으면 중복되고 글자 예산만 낭비됩니다. 첫 줄부터 바로 "▩ "로 시작하는 첫 번째 뉴스 항목으로 시작하십시오.
- 마크다운 문법(#, **, - 등) 없이 "▩ "와 줄바꿈만으로 구성하십시오.
- 다른 설명 없이, 뉴스 요약 본문 그 자체만 출력하십시오.
${extra || ''}`;
}

async function generateKakaoBriefingText(apiKey, sourceContent) {
  const systemInstruction = "당신은 웹사이트에 이미 게시된 3분 뉴스 브리핑 원문을 카카오 브랜드메시지 발송용으로 압축·재구성하는 편집자입니다. 원문에 없는 내용을 추가하지 말고, 절대 광고성/행동유도 문구를 쓰지 말고, 헤더나 인사말 없이 뉴스 항목으로 바로 시작하며, 주어진 글자수 범위를 반드시 지키십시오.";

  let resultText = stripLeakedKakaoBriefingHeader(
    (await callGeminiText(apiKey, buildKakaoBriefingPrompt(sourceContent), systemInstruction)).trim()
  );

  // 재시도는 admin.js의 generateKakaoBriefing()과 동일하게 각 방향으로 딱
  // 한 번만.
  if (resultText.length > KAKAO_BRIEFING_CHAR_LIMIT) {
    const retryExtra = `\n[중요] 방금 작성한 내용이 ${resultText.length}자로 ${KAKAO_BRIEFING_CHAR_LIMIT}자 제한을 넘었습니다. 항목 수를 더 줄여서라도 반드시 ${KAKAO_BRIEFING_CHAR_LIMIT}자 이내로 다시 작성하십시오.`;
    resultText = stripLeakedKakaoBriefingHeader(
      (await callGeminiText(apiKey, buildKakaoBriefingPrompt(sourceContent, retryExtra), systemInstruction)).trim()
    );
  } else if (resultText.length < KAKAO_BRIEFING_CHAR_TARGET_MIN) {
    const retryExtra = `\n[중요] 방금 작성한 내용이 ${resultText.length}자로 너무 짧습니다. 원문에 없는 내용을 새로 지어내지 말고, 원문에 이미 있는 각 항목의 설명을 조금 더 자세히 풀어서, 반드시 ${KAKAO_BRIEFING_CHAR_TARGET_MIN}~${KAKAO_BRIEFING_CHAR_LIMIT}자 사이가 되도록 다시 작성하십시오.`;
    resultText = stripLeakedKakaoBriefingHeader(
      (await callGeminiText(apiKey, buildKakaoBriefingPrompt(sourceContent, retryExtra), systemInstruction)).trim()
    );
  }

  return resultText;
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

    if (resultText.length > KAKAO_BRIEFING_CHAR_LIMIT) {
      console.error(`${date} 카카오 브리핑: 재시도에도 불구하고 ${resultText.length}자로 제한(${KAKAO_BRIEFING_CHAR_LIMIT}자) 초과 -- 발송용으로 저장하지 않음.`);
      await upsertKakaoBriefingFields(date, { kakao_status: 'error', kakao_error: 'char_limit_exceeded_after_retry' });
      return { ok: false, reason: 'char_limit_exceeded_after_retry', length: resultText.length };
    }

    await upsertKakaoBriefingFields(date, { kakao_content: resultText, kakao_status: 'draft' });
    console.log(`${date} 카카오 브리핑 자동 생성 완료 (초안 상태, ${resultText.length}자).`);
    // content도 함께 반환 -- 아래 카테고리별 변형 생성 단계에서 'all' 조합에
    // 그대로 재사용해, 동일한 무필터 소스로 Gemini를 또 호출하지 않기 위함.
    return { ok: true, length: resultText.length, content: resultText };
  } catch (err) {
    console.error(`${date} 카카오 브리핑 자동 생성 실패:`, err);
    return { ok: false, reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// Phase 2: 카테고리별 알림톡 변형 생성
//
// 위 generateAndSaveKakaoIfNeeded()는 지금까지처럼 무필터 'all' 조합 하나만
// news_briefings.kakao_content에 저장한다. 여기서부터는 그 결과를 재사용해
// 'all' 변형을 kakao_briefing_variants에도 저장하고, 실제 구독자들이 고른
// 카테고리 조합별로 추가 변형을 생성한다.
function canonicalCategoryKey(categories) {
  if (!categories || categories.length === 0 || categories.includes('all')) return 'all';
  return [...categories].sort().join(',');
}

// 웹 브리핑 원문을 "▩ " 항목 단위로 분리한다 (빈 줄 기준 split). 분류 대상과
// 카테고리별 재조합의 최소 단위가 된다.
function parseWebBriefingItems(content) {
  return content
    .split(/\n\n+/)
    .map(block => block.trim())
    .filter(block => block.startsWith('▩ '));
}

// 이미 튜닝된 웹 브리핑 생성 프롬프트는 건드리지 않고, 생성된 결과물을
// 대상으로 별도의 작은 Gemini 호출 하나로 항목별 카테고리만 분류한다.
async function classifyBriefingItemCategories(apiKey, items) {
  const numbered = items.map((t, i) => `${i + 1}. ${t.replace(/\n/g, ' ')}`).join('\n');
  const prompt = `다음은 오늘의 뉴스 브리핑 항목 목록입니다. 각 항목을 아래 카테고리 중 하나로 분류하십시오.

[카테고리 목록]
politics(정치), economy(경제), stock(증권), world(국제), society(사회), culture(문화), sports(스포츠), tech(기술/IT)

[뉴스 항목 목록]
${numbered}

다른 설명 없이, 각 항목의 카테고리 id를 순서대로 담은 JSON 배열만 출력하십시오 (항목 개수와 배열 길이가 반드시 같아야 합니다). 예: ["society","economy","world"]`;

  const raw = (await callGeminiText(apiKey, prompt)).trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`카테고리 분류 응답에서 JSON 배열을 찾지 못함: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }
  if (!Array.isArray(parsed) || parsed.length !== items.length) {
    throw new Error(`카테고리 분류 결과 개수 불일치 (항목 ${items.length}개, 결과 ${Array.isArray(parsed) ? parsed.length : 'non-array'}개)`);
  }
  return parsed;
}

// 오늘 실제 구독자들의 categories로부터 필요한 조합만 골라낸다 (255개
// 부분집합 전부가 아니라 실제 존재하는 것만). 'all'은 폴백 대상이기도
// 하므로 구독자가 없어도 항상 포함시킨다.
async function fetchNeededCategoryKeys() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kakao_subscribers?select=categories`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase kakao_subscribers 조회 실패: ${res.status}`);
  const rows = await res.json();
  const keys = new Set(['all']);
  rows.forEach(row => keys.add(canonicalCategoryKey(row.categories)));
  return keys;
}

async function fetchExistingVariantMap(date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kakao_briefing_variants?briefing_date=eq.${date}&select=category_key,content,status`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase kakao_briefing_variants 조회 실패: ${res.status}`);
  const rows = await res.json();
  const map = new Map();
  rows.forEach(r => map.set(r.category_key, r));
  return map;
}

// news_briefings와 달리 content/error 모두 nullable 컬럼이라, 부분 필드만
// 담은 POST upsert(on_conflict)도 NOT NULL 제약에 걸리지 않는다.
async function upsertKakaoBriefingVariant(date, categoryKey, fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kakao_briefing_variants?on_conflict=briefing_date,category_key`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(Object.assign({ briefing_date: date, category_key: categoryKey }, fields))
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase kakao_briefing_variants upsert 실패 (${categoryKey}): ${errText}`);
  }
}

// 웹 브리핑 저장(그리고 'all' 카카오 본문 생성)이 이미 끝난 뒤 호출되는 완전히
// 별도의 단계 -- 이 함수 전체가 실패해도 절대 throw하지 않는다 (이미 성공한
// 웹 브리핑 + 'all' 카카오 본문까지 되돌리면 안 되기 때문. 이미
// generateAndSaveKakaoIfNeeded에 적용된 것과 동일한 격리 원칙).
async function generateAndSaveCategoryVariants(apiKey, date, sourceContent, allVariantContent) {
  try {
    const existingMap = await fetchExistingVariantMap(date);

    // 'all' 조합: 새로 Gemini를 부르지 않고, 위에서 이미 생성된(무필터 소스
    // 기준) 카카오 본문을 그대로 재사용해 저장한다.
    const existingAll = existingMap.get('all');
    if (existingAll && existingAll.content) {
      console.log(`${date} 카카오 브리핑 변형(all)은 이미 존재합니다. 건너뜁니다.`);
    } else if (allVariantContent) {
      await upsertKakaoBriefingVariant(date, 'all', { content: allVariantContent, status: 'draft' });
      console.log(`${date} 카카오 브리핑 변형(all) 저장 완료 (${allVariantContent.length}자).`);
    } else {
      console.warn(`${date} 카카오 브리핑 변형(all): 재사용할 소스가 없어 저장하지 못함 (상위 'all' 생성이 실패했을 가능성).`);
    }

    const neededKeys = await fetchNeededCategoryKeys();
    const specificKeys = [...neededKeys].filter(k => k !== 'all');
    if (specificKeys.length === 0) {
      console.log(`${date}: 구독자 전원이 'all'이라 카테고리별 추가 변형이 필요 없습니다.`);
      return;
    }

    const items = parseWebBriefingItems(sourceContent);
    if (items.length === 0) {
      console.warn(`${date}: 웹 브리핑에서 '▩ ' 항목을 파싱하지 못해 카테고리별 변형 생성을 건너뜁니다 (all만 사용 가능).`);
      return;
    }

    let categoryOfItem;
    try {
      categoryOfItem = await classifyBriefingItemCategories(apiKey, items);
    } catch (err) {
      // 분류 실패 시: 잘못 추측/부분 배정하지 않고 카테고리별 변형 생성 전체를
      // 건너뛴다 (all은 이미 위에서 처리됨).
      console.error(`${date} 카테고리 분류 실패, 카테고리별 변형 생성을 건너뜁니다:`, err);
      return;
    }

    for (const key of specificKeys) {
      const existing = existingMap.get(key);
      if (existing && existing.content) {
        console.log(`${date} 카카오 브리핑 변형(${key})은 이미 존재합니다. 건너뜁니다.`);
        continue;
      }
      try {
        const wantedCats = new Set(key.split(','));
        const matchedItems = items.filter((_, i) => wantedCats.has(categoryOfItem[i]));
        if (matchedItems.length === 0) {
          console.log(`${date} 카카오 브리핑 변형(${key}): 해당 카테고리의 항목이 오늘 없어 생성을 건너뜁니다 (발송 시 all로 대체됨).`);
          continue;
        }
        const filteredSource = matchedItems.join('\n\n');
        const resultText = await generateKakaoBriefingText(apiKey, filteredSource);

        if (resultText.length > KAKAO_BRIEFING_CHAR_LIMIT) {
          console.error(`${date} 카카오 브리핑 변형(${key}): 재시도에도 불구하고 ${resultText.length}자로 제한(${KAKAO_BRIEFING_CHAR_LIMIT}자) 초과 -- 발송용으로 저장하지 않음.`);
          await upsertKakaoBriefingVariant(date, key, { status: 'error', error: 'char_limit_exceeded_after_retry', content: null });
          continue;
        }

        await upsertKakaoBriefingVariant(date, key, { content: resultText, status: 'draft' });
        console.log(`${date} 카카오 브리핑 변형(${key}) 저장 완료 (${resultText.length}자, 항목 ${matchedItems.length}개).`);
      } catch (err) {
        // 한 조합의 실패가 나머지 조합 생성을 막지 않도록 조합별로 개별 격리.
        console.error(`${date} 카카오 브리핑 변형(${key}) 생성 실패:`, err);
      }
    }
  } catch (err) {
    console.error(`${date} 카테고리별 카카오 브리핑 변형 생성 단계 실패 (웹 브리핑/all 카카오 본문에는 영향 없음):`, err);
  }
}

async function handleGenerateBriefing(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    return;
  }

  const today = todayKstDate();

  const existingRow = await fetchBriefingRowForDate(today);

  if (existingRow) {
    // 웹 브리핑은 이미 있음(수동 생성 또는 이전 자동 생성) -- 이 행을
    // 덮어쓰지 않는다. 다만 카카오 압축본은 아직 없을 수 있으므로
    // (예: 관리자가 웹 브리핑만 수동 생성하고 카카오 탭은 안 연 경우),
    // kakao_content가 비어 있을 때만 그 기존 웹 본문을 소스로 카카오
    // 생성을 이어서 시도한다 -- 이미 있으면(관리자가 직접 수정했을 수도
    // 있으므로) 그대로 둔다.
    console.log(`${today} 브리핑이 이미 존재합니다 (수동 생성 또는 이전 실행). 웹 브리핑 생성은 건너뜁니다.`);
    let kakaoResult = { skipped: 'already_has_kakao_content' };
    if (!existingRow.kakao_content) {
      kakaoResult = await generateAndSaveKakaoIfNeeded(apiKey, today, existingRow.content);
    } else {
      console.log(`${today} 카카오 브리핑도 이미 존재합니다. 건너뜁니다.`);
    }
    // 'all' 변형의 소스: 방금 생성했다면 그 결과, 이미 있었다면 기존
    // kakao_content를 그대로 재사용 (Gemini 중복 호출 방지).
    const allVariantContent = (kakaoResult.ok && kakaoResult.content) || existingRow.kakao_content || null;
    await generateAndSaveCategoryVariants(apiKey, today, existingRow.content, allVariantContent);
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
    body: JSON.stringify({ briefing_date: today, title, content: resultText, status: 'published' })
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    throw new Error(`Supabase news_briefings insert failed: ${errText}`);
  }

  console.log(`${today} 브리핑 자동 생성 완료 (검수 없이 즉시 게시, ${resultText.length}자).`);

  // 웹 브리핑은 이미 저장이 끝난 뒤이므로, 카카오 생성이 실패해도 이미
  // 성공한 웹 브리핑 응답을 절대 막지 않는다 (generateAndSaveKakaoIfNeeded는
  // 자체적으로 에러를 삼키고 결과 객체를 반환함).
  const kakaoResult = await generateAndSaveKakaoIfNeeded(apiKey, today, resultText);
  await generateAndSaveCategoryVariants(apiKey, today, resultText, kakaoResult.ok ? kakaoResult.content : null);

  res.status(200).json({ ok: true, date: today, length: resultText.length, kakao: kakaoResult });
}

// ==========================================================================
// action=send-briefing (was send-kakao-briefing.js)
// ==========================================================================

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

async function fetchSendBriefingRow(serviceRoleKey, date) {
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

async function handleSendBriefing(req, res) {
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

  const sendMode = await getAppSetting(serviceRoleKey, 'kakao_send_mode');
  if (sendMode !== 'auto') {
    console.log(`카카오 발송 모드가 '${sendMode || 'manual'}'이라 자동 발송을 건너뜁니다.`);
    res.status(200).json({ skipped: 'manual_mode', date: today });
    return;
  }

  const row = await fetchSendBriefingRow(serviceRoleKey, today);
  if (!row) {
    console.log(`${today} 브리핑 행이 아직 없어 발송을 건너뜁니다.`);
    res.status(200).json({ skipped: 'no_briefing_row', date: today });
    return;
  }
  if (row.kakao_status === 'sent') {
    console.log(`${today} 브리핑은 이미 발송 완료(kakao_status='sent') 상태입니다. 중복 발송 방지를 위해 건너뜁니다.`);
    res.status(200).json({ skipped: 'already_sent', date: today });
    return;
  }

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
}

// ==========================================================================
// action=test-send (was test-kakao-send.js) -- 알리고 연동 점검용 1건
// 테스트 발송. 관리자 화면의 "카카오톡 발송용" 패널에서 호출.
// ==========================================================================

const DEFAULT_TEST_CONTENT = '▩ 이것은 바이칼뉴스 3분 브리핑 발송 테스트입니다. 실제 발송이 정상 작동하는지 확인하는 메시지입니다.';

async function handleTestSend(req, res) {
  const { phone, content } = req.body || {};

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
}

// ==========================================================================
// action=create-brand-template (was create-brand-template.js) -- 1회성
// 관리자 전용 도구. 공개 UI에서 링크로 노출하지 말 것 -- 필요할 때만
// curl/Postman으로 { action: 'create-brand-template' } 직접 호출.
// ==========================================================================

// 발송 직전 기계적으로 붙이던 구독취소 안내를 이 고정 템플릿 문구 쪽으로
// 옮겼다 -- 생성되는 본문(#{brief})마다 매번 다시 붙일 필요가 없어졌다.
const BRAND_TEMPLATE_CONTENT = `[바이칼뉴스] 3분 뉴스 브리핑

#{brief}

▶ 더 이상 받고 싶지 않으시면 baikalnews.com에서 구독취소를 눌러주세요.`;

async function handleCreateBrandTemplate(req, res) {
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
    template_content: BRAND_TEMPLATE_CONTENT
  });

  const aligoRes = await fetch('https://kakaoapi.aligo.in/brandtalk/template/create/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    ...(aligoProxyAgent ? { dispatcher: aligoProxyAgent } : {})
  });
  // 알리고 원본 응답을 그대로 돌려준다 -- template_code/send_variable/status를
  // 가공 없이 호출자(관리자)가 직접 확인해야 하기 때문.
  const data = await aligoRes.json();
  res.status(200).json(data);
}

// ==========================================================================
// action=unsubscribe (was kakao-unsubscribe.js) -- 구독자 자가 구독취소.
// unsubscribe.html(공개 사이트)에서 전화번호만 입력받아 곧바로
// kakao_subscribers에서 해당 행을 삭제한다. 설계상 OTP/문자 인증 없음:
// 구독취소는 최대한 마찰 없이 되어야 한다는 원칙 + 인증 문자 발송 비용을
// 또 들이지 않기 위한 명시적 결정 (관리자 확인 완료).
// ==========================================================================

// 카카오 로그인이 저장하는 번호는 항상 010으로 시작하는 11자리 휴대전화
// 번호를 kakao-oauth-callback.js의 normalizeKakaoPhone()이 "010-1234-5678"
// 형태(3-4-4)로 저장해 둔 것이므로, DB에 존재 가능한 값도 이 패턴뿐이다.
// 이 형태가 아니면 조회해봐야 절대 일치할 수 없으므로 미리 400으로 막는다.
function normalizePhoneForUnsubscribe(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!/^010\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

async function handleUnsubscribe(req, res) {
  const { phone } = req.body || {};

  const normalizedPhone = normalizePhoneForUnsubscribe(phone);
  if (!normalizedPhone) {
    res.status(400).json({ ok: false, error: '올바른 휴대전화 번호 형식이 아닙니다. (예: 010-1234-5678)' });
    return;
  }

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
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  req.body = body || {};
  const { action } = req.body;
  try {
    if (action === 'generate-briefing') { await handleGenerateBriefing(req, res); return; }
    if (action === 'send-briefing') { await handleSendBriefing(req, res); return; }
    if (action === 'test-send') { await handleTestSend(req, res); return; }
    if (action === 'create-brand-template') { await handleCreateBrandTemplate(req, res); return; }
    if (action === 'unsubscribe') { await handleUnsubscribe(req, res); return; }
    res.status(400).json({ error: 'action must be one of: generate-briefing, send-briefing, test-send, create-brand-template, unsubscribe' });
  } catch (err) {
    console.error(`kakao-proxy (action=${action}) error:`, err);
    res.status(500).json({ error: err.message });
  }
};
