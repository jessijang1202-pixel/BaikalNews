// Server-rendered public pages for crawlers (search/ad review bots + social
// link previews) that don't execute JavaScript, merged from what used to be
// article-og.js + category-og.js + homepage-og.js + sitemap.js into one
// dispatched-by-type file.
//
// Why merged: Vercel's Hobby plan caps a deployment at 12 Serverless
// Functions total (confirmed live 2026-10-01: "No more than 12 Serverless
// Functions can be added to a Deployment on the Hobby plan" build error,
// after the account was downgraded from Pro and the project had grown to
// 24 functions). Each file under api/ counts as one function regardless of
// how much logic it holds, so consolidating related endpoints behind a
// single dispatcher is the free way back under the cap -- no behavior
// changes, just fewer files. See also veo-proxy.js, gemini-video-proxy.js,
// kakao-proxy.js, threads-proxy.js, sns-proxy.js for the same pattern.
//
// vercel.json's rewrites now point at this file with ?type=article|
// category|home|sitemap appended to the destination -- Vercel merges that
// with the original request's own query string (e.g. ?id=176), so
// req.query still carries both `type` and the original params unchanged.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";

// 2026-10-01 개정 (check.md v2 "평택 지역 + 생활 밀착" 정체성에 맞춰 재편):
// culture/economy/opinion은 키를 유지한 채 레이블만 바꿨고, local ->
// pyeongtaek으로 키 자체를 바꾸고 tech는 economy로 흡수했다 (Supabase
// 마이그레이션으로 기존 기사도 일괄 변경). life(생활정보)는 완전히 새
// 카테고리. js/main.js의 CATEGORY_LABELS와 동일하게 유지할 것 -- 이
// 서버리스 함수는 그 파일을 import할 수 없어 중복 보관한다.
const CATEGORY_LABELS = {
  pyeongtaek: "평택소식",
  life: "생활정보",
  economy: "경제·산업·환경",
  culture: "문화·행사",
  opinion: "오피니언"
};
const CATEGORY_DESCS = {
  pyeongtaek: "바이칼처럼 마르지 않는 공동체의 연대와 상생을 평택 곳곳의 현장에서 길어 올립니다.",
  life: "하루하루를 지탱하는 잔잔한 물결처럼, 세금·복지·교통·건강 등 독자의 일상에 곧장 닿는 실용 정보를 길어 올립니다.",
  economy: "겨울 호수의 두꺼운 얼음처럼 단단한 지역경제의 기반과, 첨단 산업과 재생에너지로 나아가는 환경의 변화까지 두루 취재합니다.",
  culture: "얼어붙은 표면 아래 살아 숨 쉬는 온기처럼, 지역의 축제와 행사, 일상 속 예술이 지닌 치유의 힘을 깊이 있게 기록합니다.",
  opinion: "속도와 자극의 소음 위에서, 얼음처럼 냉철하고 투명한 시선으로 세상을 응시하는 지성의 목소리를 모읍니다."
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function supaFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// ========================================================================
// type=article -- article.html, real title/byline/body pre-rendered (the
// SPA shell is empty until client JS fetches Supabase).
// ========================================================================

function isLive(article) {
  if (!article) return false;
  if (article.status === 'published' || article.status === 'correction') return true;
  if (article.status === 'scheduled' && article.scheduled_at) {
    return new Date(article.scheduled_at) <= new Date();
  }
  return false;
}

async function fetchArticle(id) {
  const rows = await supaFetch(`articles?id=eq.${encodeURIComponent(id)}&select=id,title,lead,content,image,image_caption,category,category_label,date,status,approver,byline,approved_at,scheduled_at,seo_meta,revision_history`);
  return rows && rows.length > 0 ? rows[0] : null;
}

// Same-category recent articles, excluding this one -- Googlebot otherwise
// finds ZERO links to other articles on this page: home/category pages only
// expose their most recent items with no pagination link, so once a bot
// crawls into an article it was a dead end, leaving sitemap.xml as the only
// discovery path for anything older. Confirmed live via Search Console
// (2026-09-16): 65 of 70 unindexed pages were "발견됨 - 현재 색인이 생성되지
// 않음" (Discovered, not yet indexed).
async function fetchRelatedArticles(category, excludeId) {
  const rows = await supaFetch(`articles?select=id,title,date&category=eq.${encodeURIComponent(category)}&status=eq.published&id=neq.${encodeURIComponent(excludeId)}&order=id.desc&limit=6`);
  return rows || [];
}

async function renderArticle(req, res) {
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

  const relatedArticles = await fetchRelatedArticles(article.category, article.id);
  const relatedHtml = relatedArticles.length > 0
    ? `<section>
<h2>관련 기사</h2>
<ul>
${relatedArticles.map(r => `<li><a href="https://baikalnews.com/article.html?id=${r.id}">${escapeHtml(r.title)}</a></li>`).join('\n')}
</ul>
</section>`
    : '';

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
${relatedHtml}
<p><a href="${escapeHtml(pageUrl)}">바이칼 뉴스에서 기사 보기</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(html);
}

// ========================================================================
// type=category -- category.html listing
// ========================================================================

// limit=100: culture already had 54 published articles with no pagination
// link anywhere on this page (confirmed live 2026-09-16) -- kept comfortably
// above every category's current count.
async function fetchCategoryArticles(cat) {
  const rows = await supaFetch(`articles?category=eq.${encodeURIComponent(cat)}&status=eq.published&select=id,title,lead,date&order=date.desc,id.desc&limit=100`);
  return rows || [];
}

async function renderCategory(req, res) {
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
}

// ========================================================================
// type=home -- / and /index.html
// ========================================================================

async function fetchLatestArticles() {
  const rows = await supaFetch(`articles?status=eq.published&select=id,title,lead,date,category&order=date.desc,id.desc&limit=30`);
  return rows || [];
}

async function renderHome(req, res) {
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
<meta name="description" content="평택소식, 생활정보, 경제·산업·환경, 문화·행사, 오피니언을 깊고 투명한 시선으로 보도하는 바이칼 뉴스입니다.">
<link rel="canonical" href="https://baikalnews.com/">
<meta property="og:type" content="website">
<meta property="og:url" content="https://baikalnews.com/">
<meta property="og:site_name" content="바이칼 뉴스">
<meta property="og:title" content="바이칼 뉴스 - 깊고 투명한 시선으로 세상을 비추다">
<meta property="og:description" content="평택소식, 생활정보, 경제·산업·환경, 문화·행사, 오피니언을 깊고 투명한 시선으로 보도하는 바이칼 뉴스입니다.">
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
}

// ========================================================================
// type=sitemap -- /sitemap.xml
// ========================================================================

function toIsoDate(dateStr) {
  const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(dateStr || '');
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const SITEMAP_STATIC_URLS = [
  { loc: 'https://baikalnews.com/', changefreq: 'hourly', priority: '1.0' },
  { loc: 'https://baikalnews.com/category.html?cat=pyeongtaek', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/category.html?cat=life', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/category.html?cat=economy', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/category.html?cat=culture', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/category.html?cat=opinion', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/about.html', changefreq: 'monthly', priority: '0.5' },
  { loc: 'https://baikalnews.com/contact.html', changefreq: 'monthly', priority: '0.4' },
  { loc: 'https://baikalnews.com/editorial-policy.html', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://baikalnews.com/privacy-policy.html', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://baikalnews.com/terms.html', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://baikalnews.com/corrections.html', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://baikalnews.com/youth-protection.html', changefreq: 'yearly', priority: '0.3' }
];

async function renderSitemap(req, res) {
  try {
    const articles = await supaFetch(`articles?select=id,date&status=eq.published&order=id.desc`);
    if (!articles) throw new Error('Supabase fetch failed');

    const articleEntries = articles.map(a => {
      const lastmod = toIsoDate(a.date);
      return `  <url>
    <loc>${escapeXml(`https://baikalnews.com/article.html?id=${a.id}`)}</loc>
${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    });

    const staticEntries = SITEMAP_STATIC_URLS.map(u => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...articleEntries].join('\n')}
</urlset>
`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(xml);
  } catch (err) {
    console.error('public-render (type=sitemap) error:', err);
    // Fall back to just the static pages rather than a hard 500 -- a
    // sitemap missing articles is far better than no sitemap at all.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_STATIC_URLS.map(u => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>
`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(xml);
  }
}

module.exports = async (req, res) => {
  const type = req.query.type;
  try {
    if (type === 'article') { await renderArticle(req, res); return; }
    if (type === 'category') { await renderCategory(req, res); return; }
    if (type === 'home') { await renderHome(req, res); return; }
    if (type === 'sitemap') { await renderSitemap(req, res); return; }
    res.status(400).send('type must be one of: article, category, home, sitemap');
  } catch (err) {
    console.error(`public-render (type=${type}) error:`, err);
    res.status(500).send('Internal Server Error');
  }
};
