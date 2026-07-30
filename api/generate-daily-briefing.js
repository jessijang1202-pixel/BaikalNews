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

async function briefingExistsForDate(date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_briefings?briefing_date=eq.${date}&select=id`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase existence check failed: ${res.status}`);
  const rows = await res.json();
  return rows.length > 0;
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
    if (unique.length >= 15) break;
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
    if (unique.length >= 15) break;
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

module.exports = async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    return;
  }

  const today = todayKstDate();

  try {
    if (await briefingExistsForDate(today)) {
      console.log(`${today} 브리핑이 이미 존재합니다 (수동 생성 또는 이전 크론 실행). 건너뜁니다.`);
      res.status(200).json({ skipped: true, reason: 'already_exists', date: today });
      return;
    }

    const titles = await fetchNaverTrendingTitles();
    const newsListText = titles.slice(0, 20).map((t, i) => `${i + 1}. ${t}`).join('\n');
    const todayLabel = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul'
    });

    const prompt = `
아래는 오늘(${todayLabel}) 네이버 랭킹 뉴스 기준 화제가 된 뉴스 제목 목록입니다. 이를 바탕으로 바이칼 뉴스 웹사이트에 게시할 "3분 뉴스 브리핑" 글을 작성하십시오. 이것은 카카오톡 알림톡처럼 글자수 제한이 있는 짧은 글이 아니라, 웹페이지에 그대로 게시되는 정식 기사 형태의 글입니다.

[오늘의 화제 뉴스 제목 목록]
${newsListText}

[작성 지침]
- 맨 처음에 독자에게 인사를 건네는 짧은 도입 문장 1~2개를 정중한 뉴스 문체("~습니다/합니다")로 작성하십시오.
- 전체를 천천히 읽어도 3분 내외(도입부 포함, 공백 포함 1,300~1,800자 정도)에 읽을 수 있는 분량으로 작성하십시오.
- 오늘의 주요 뉴스를 10~14개 정도 선별하십시오 (적은 소식을 길게 쓰기보다, 많은 소식을 짧고 간결하게 다루는 것이 목표입니다).
- 각 뉴스 항목은 반드시 "▩ "로 시작하는 소제목 한 줄을 쓰고, 그 다음 줄에 설명을 1문장(최대 2문장)으로 짧게 압축해 작성하십시오. "▩ "는 웹사이트에서 굵게 강조되어 표시되므로 반드시 포함해야 합니다.
- 각 항목의 설명 문장은 "~습니다/합니다" 같은 정중체가 아니라, 뉴스 속보에서 쓰는 간결한 "음슴체"로 끝내십시오 (예: "발견되었습니다" → "발견됨", "결정했습니다" → "결정함", "확인됐습니다" → "확인됨", "발표했습니다" → "발표함"). 제목만으로 알 수 없는 내용은 추측하지 말고, 명백한 사실 위주로 작성하십시오.
- 각 항목 사이에는 빈 줄을 하나씩 넣어 구분하십시오.
- 광고성 문구나 특정 상품·서비스 홍보는 포함하지 마십시오.
- 마크다운 문법(#, **, - 등)은 사용하지 마십시오. "▩ "와 줄바꿈만으로 구조를 표현하십시오.
- 글 전체의 제목이 될 한 줄을 가장 먼저 "[제목] " 접두사와 함께 작성하십시오 (예: "[제목] 7월 29일, 오늘의 3분 뉴스"). 이 줄 다음에 도입 문장과 뉴스 항목들을 이어가십시오.
- 다른 설명 없이, 제목 줄과 본문만 출력하십시오.`;

    const systemInstruction = "당신은 바이칼 뉴스 웹사이트의 '3분 뉴스 브리핑' 코너를 작성하는 뉴스 큐레이터입니다. 도입부는 정중한 뉴스 문체로 쓰되, 각 뉴스 항목은 '▩ ' 소제목과 음슴체로 끝나는 짧은 설명으로 간결하게 작성하고, 사실 전달에만 집중해 3분 분량의 정리 기사를 작성하십시오.";

    let resultText = (await callGeminiText(apiKey, prompt, systemInstruction)).trim();

    let title = `${todayLabel} 3분 뉴스 브리핑`;
    const titleMatch = resultText.match(/^\[제목\]\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
      resultText = resultText.replace(/^\[제목\]\s*.+$/m, '').replace(/^\n+/, '').trim();
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
    res.status(200).json({ ok: true, date: today, length: resultText.length });
  } catch (err) {
    console.error('일일 브리핑 자동 생성 실패:', err);
    res.status(500).json({ error: err.message });
  }
};
