// Server-rendered version of /category.html for crawlers, same rationale as
// article-og.js -- category.html is an empty SPA shell until client JS
// fetches from Supabase, so a crawler that doesn't run that JS sees a
// "불러오는 중입니다" placeholder with zero article links. This renders a
// real list of published articles in the requested category server-side.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";

const CATEGORY_LABELS = {
  culture: "문화·생활",
  economy: "경제·산업",
  tech: "기술·미디어",
  local: "지역·평택",
  opinion: "오피니언"
};
const CATEGORY_DESCS = {
  culture: "얼어붙은 표면 아래 살아 숨 쉬는 온기처럼, 일상 속 예술이 지닌 치유의 힘과 문화의 결을 깊이 있게 기록합니다.",
  local: "바이칼처럼 마르지 않는 공동체의 연대와 상생을 지역 곳곳의 현장에서 길어 올립니다.",
  economy: "겨울 호수의 두꺼운 얼음처럼 단단한 지역경제의 기반과, 순환·재생 에너지로 나아가는 지속가능한 성장을 취재합니다.",
  opinion: "속도와 자극의 소음 위에서, 얼음처럼 냉철하고 투명한 시선으로 세상을 응시하는 지성의 목소리를 모읍니다.",
  tech: "호수 밑바닥까지 닿는 빛처럼, 첨단 기술이 환경과 역사에 새로운 시야를 밝히는 순간들을 보도합니다."
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchCategoryArticles(cat) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?category=eq.${encodeURIComponent(cat)}&status=eq.published&select=id,title,lead,date&order=date.desc,id.desc&limit=40`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) return [];
  return res.json();
}

module.exports = async (req, res) => {
  const cat = req.query.cat;
  const label = CATEGORY_LABELS[cat];

  if (!cat || !label) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>바이칼 뉴스</title></head><body><p>카테고리를 찾을 수 없습니다.</p></body></html>');
    return;
  }

  const articles = await fetchCategoryArticles(cat);
  const description = CATEGORY_DESCS[cat] || '바이칼 뉴스 카테고리 아카이브';
  const pageUrl = `https://baikalnews.com/category.html?cat=${encodeURIComponent(cat)}`;

  const listHtml = articles.map(a => `
<article>
<h2><a href="https://baikalnews.com/article.html?id=${a.id}">${escapeHtml(a.title)}</a></h2>
<p>${escapeHtml(a.date)}</p>
<p>${escapeHtml(a.lead || '')}</p>
</article>`).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(label)} - 바이칼 뉴스</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:site_name" content="바이칼 뉴스">
<meta property="og:title" content="${escapeHtml(label)} - 바이칼 뉴스">
<meta property="og:description" content="${escapeHtml(description)}">
</head>
<body>
<nav><a href="https://baikalnews.com/">바이칼 뉴스</a></nav>
<h1>${escapeHtml(label)}</h1>
<p>${escapeHtml(description)}</p>
${listHtml || '<p>아직 게시된 기사가 없습니다.</p>'}
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(html);
};
