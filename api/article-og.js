// Bot-only Open Graph responder for /article.html?id=N. Real browsers never
// hit this -- vercel.json rewrites only route here when the request's
// User-Agent matches a known link-preview crawler (facebookexternalhit
// covers Facebook/Instagram/Threads AND KakaoTalk's own scraper, whose UA is
// literally "facebookexternalhit/1.1;kakaotalk-scrap/1.0"; Twitterbot/Slackbot
// added too). Everything else falls through to the plain catch-all rewrite
// that serves the real SPA (article-app.html) unchanged.
//
// Why this exists: article.html is a static SPA shell with a placeholder
// <img src="images/baikal_ice.png"> baked into the raw HTML, swapped for the
// real article image only after a client-side Supabase fetch completes.
// Link-preview crawlers never run that JS, so they were grabbing the
// placeholder photo (or no image at all) instead of the article's real
// image -- this function fetches the real article data server-side and
// returns a minimal HTML document with the correct <title>/description/
// og:* tags so shared links preview correctly everywhere.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchArticle(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&select=id,title,subtitle,lead,image,category_label`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.length > 0 ? rows[0] : null;
}

module.exports = async (req, res) => {
  const id = req.query.id;
  const article = id ? await fetchArticle(id) : null;

  const pageUrl = `https://baikalnews.com/article.html${id ? `?id=${encodeURIComponent(id)}` : ''}`;
  const title = article ? article.title : '바이칼 뉴스';
  const description = article ? (article.lead || article.subtitle || '') : '깊고 투명한 시선으로 세상을 비추다.';
  const image = article && article.image ? article.image : 'https://baikalnews.com/images/logo-mark-new.png';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)} - 바이칼 뉴스</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:site_name" content="바이칼 뉴스">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
<p><a href="${escapeHtml(pageUrl)}">바이칼 뉴스에서 기사 보기</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(html);
};
