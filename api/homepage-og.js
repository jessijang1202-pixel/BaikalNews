// Server-rendered version of the homepage (/ and /index.html) for crawlers,
// same rationale as article-og.js/category-og.js -- index.html's article
// sections are empty "불러오는 중입니다" placeholders until client JS runs.
// This renders a real list of recent published articles across all
// categories server-side so crawlers see actual content and real internal
// links to every article/category, instead of an empty shell.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";

const CATEGORY_LABELS = {
  culture: "문화·생활",
  economy: "경제·산업",
  tech: "기술·미디어",
  local: "지역·평택",
  opinion: "오피니언"
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchLatestArticles() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?status=eq.published&select=id,title,lead,date,category&order=date.desc,id.desc&limit=30`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) return [];
  return res.json();
}

module.exports = async (req, res) => {
  const articles = await fetchLatestArticles();
  const hero = articles[0];
  const rest = articles.slice(1);

  const heroHtml = hero ? `
<article>
<h2><a href="https://baikalnews.com/article.html?id=${hero.id}">${escapeHtml(hero.title)}</a></h2>
<p>${escapeHtml(CATEGORY_LABELS[hero.category] || hero.category)} · ${escapeHtml(hero.date)}</p>
<p>${escapeHtml(hero.lead || '')}</p>
</article>` : '';

  const listHtml = rest.map(a => `
<article>
<h2><a href="https://baikalnews.com/article.html?id=${a.id}">${escapeHtml(a.title)}</a></h2>
<p>${escapeHtml(CATEGORY_LABELS[a.category] || a.category)} · ${escapeHtml(a.date)}</p>
<p>${escapeHtml(a.lead || '')}</p>
</article>`).join('\n');

  const categoryLinks = Object.entries(CATEGORY_LABELS)
    .map(([key, label]) => `<a href="https://baikalnews.com/category.html?cat=${key}">${escapeHtml(label)}</a>`)
    .join(' | ');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>바이칼 뉴스 - 깊고 투명한 시선으로 세상을 비추다</title>
<meta name="description" content="문화·생활, 경제·산업, 기술·미디어, 지역·평택, 오피니언을 깊고 투명한 시선으로 보도하는 바이칼 뉴스입니다.">
<link rel="canonical" href="https://baikalnews.com/">
<meta property="og:type" content="website">
<meta property="og:url" content="https://baikalnews.com/">
<meta property="og:site_name" content="바이칼 뉴스">
<meta property="og:title" content="바이칼 뉴스 - 깊고 투명한 시선으로 세상을 비추다">
<meta property="og:description" content="문화·생활, 경제·산업, 기술·미디어, 지역·평택, 오피니언을 깊고 투명한 시선으로 보도하는 바이칼 뉴스입니다.">
</head>
<body>
<header>
<h1><a href="https://baikalnews.com/">바이칼 뉴스</a></h1>
<p>깊고 투명한 시선으로 세상을 비추다</p>
<nav>${categoryLinks}</nav>
</header>
<section>
<h2>최신 보도</h2>
${heroHtml}
${listHtml || '<p>아직 게시된 기사가 없습니다.</p>'}
</section>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(html);
};
