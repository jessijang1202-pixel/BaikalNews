// Server-rendered version of /article.html for crawlers (search/ad review
// bots + social link previews) that don't execute JavaScript. Real browsers
// never hit this -- vercel.json rewrites only route here when the request's
// User-Agent matches a known bot (facebookexternalhit covers Facebook/
// Instagram/Threads AND KakaoTalk's own scraper, whose UA is literally
// "facebookexternalhit/1.1;kakaotalk-scrap/1.0"; Twitterbot/Slackbot for
// social previews; Googlebot/Mediapartners-Google for search indexing and
// AdSense review). Everything else falls through to the real SPA
// (article-app.html) unchanged.
//
// Why this exists: article.html is a static SPA shell -- the real title,
// byline, and body text only appear after a client-side Supabase fetch
// completes. A crawler that doesn't run that JS sees an empty shell (even
// the raw <title> tag reads "기사 읽기 - 바이칼 뉴스" and <h1> reads "기사
// 제목을 로딩 중입니다"), which is a strong candidate for why the AdSense
// "low value / thin content" rejection kept recurring even though the
// actual articles are substantial. This renders the same article data
// server-side into real, readable HTML instead -- same content a real
// browser eventually shows after JS runs, just pre-rendered (this is
// Google's own documented "dynamic rendering" pattern for JS-heavy sites,
// not cloaking, since the content is identical to what a user sees).

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

function isLive(article) {
  if (!article) return false;
  if (article.status === 'published' || article.status === 'correction') return true;
  if (article.status === 'scheduled' && article.scheduled_at) {
    return new Date(article.scheduled_at) <= new Date();
  }
  return false;
}

async function fetchArticle(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&select=id,title,lead,content,image,image_caption,category,category_label,date,status,approver,byline,approved_at,scheduled_at,seo_meta,revision_history`,
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

  if (!article || !isLive(article)) {
    // 아카이브(편집국이 명시적으로 내린) 기사는 "영구 삭제"(410)로,
    // 그 외(승인 대기 등 아직 존재하지 않거나 나중에 살아날 수 있는 경우)는
    // "찾을 수 없음"(404)으로 구분한다. 이전에는 둘 다 200 OK로 응답해
    // 예전에 색인됐던 기사 URL이 검색엔진 눈엔 "정상인데 내용이 없는"
    // 소프트 404로 보였다 -- 실제 상태 코드를 내려줘서 구글이 이런
    // URL을 빠르게, 명확하게 색인에서 제외하도록 한다.
    const isGone = article && article.status === 'archived';
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>기사를 찾을 수 없습니다 - 바이칼 뉴스</title>
<meta name="robots" content="noindex">
</head>
<body>
<h1>기사를 볼 수 없습니다</h1>
<p>본 기사는 삭제되었거나 편집국의 승인 대기 상태입니다.</p>
<p><a href="https://baikalnews.com/">홈으로 돌아가기</a></p>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(isGone ? 410 : 404).send(html);
    return;
  }

  const title = article.title;
  const description = article.seo_meta || article.lead || '';
  const image = article.image
    ? (/^https?:\/\//i.test(article.image) ? article.image : `https://baikalnews.com/${article.image}`)
    : 'https://baikalnews.com/images/logo-mark-new.png';
  const categoryLabel = CATEGORY_LABELS[article.category] || article.category_label || '';
  const byline = article.byline || (article.approver ? `${article.approver} 기자` : '바이칼뉴스');
  const captionText = article.image_caption || `${title} 관련 취재 자료.`;
  const publishedIso = article.approved_at || article.date;

  const correctionNotice = article.status === 'correction'
    ? `<p><strong>[기사 내용 정정]</strong> 이 기사는 게재 이후 일부 내용이 정정되었습니다.</p>`
    : '';

  let revisionHtml = '';
  if (Array.isArray(article.revision_history) && article.revision_history.length > 0) {
    revisionHtml = '<ul>' + article.revision_history.map(rev => {
      const action = (rev.action || '').replace(/\s*\(상태:\s*[^)]*\)/g, '');
      return `<li>${escapeHtml(rev.date)} - ${escapeHtml(action)}</li>`;
    }).join('') + '</ul>';
  }

  const ldJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": title,
    "description": description,
    "image": [image],
    "datePublished": publishedIso,
    "dateModified": publishedIso,
    "author": { "@type": "Person", "name": byline },
    "publisher": { "@type": "Organization", "name": "바이칼 뉴스" },
    "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl }
  });

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} - 바이칼 뉴스</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:site_name" content="바이칼 뉴스">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<script type="application/ld+json">${ldJson}</script>
</head>
<body>
<nav><a href="https://baikalnews.com/">바이칼 뉴스</a> &gt; <a href="https://baikalnews.com/category.html?cat=${encodeURIComponent(article.category)}">${escapeHtml(categoryLabel)}</a></nav>
<article>
<p>${escapeHtml(categoryLabel)}</p>
<h1>${escapeHtml(title)}</h1>
<p>게재일자: ${escapeHtml(article.date)} · ${escapeHtml(byline)}</p>
<figure>
<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
<figcaption>사진/보도: ${escapeHtml(captionText)} (ⓒ ${escapeHtml(byline)})</figcaption>
</figure>
${correctionNotice}
<p><strong>${escapeHtml(article.lead || '')}</strong></p>
${article.content || ''}
</article>
<section>
<h2>기자 소개</h2>
<p>${escapeHtml(byline)} · 바이칼 뉴스의 공식 편집위원 및 보도기자로서 투명하고 공정한 팩트 검증을 완료한 기사를 발행합니다.</p>
</section>
${revisionHtml ? `<section><h2>수정 이력</h2>${revisionHtml}</section>` : ''}
<p><a href="${escapeHtml(pageUrl)}">바이칼 뉴스에서 기사 보기</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(html);
};
