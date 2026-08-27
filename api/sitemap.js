// Dynamic sitemap.xml -- the previous sitemap was a static file listing only
// the homepage/category/policy pages, with NOT ONE of the 100+ published
// article URLs in it. Google's only path to discovering an article was
// crawling outbound links from the (client-side-rendered) homepage/category
// pages, which is slow and unreliable -- a very plausible contributor to the
// site barely showing up in Google's index at all, which in turn is a
// strong candidate for the recurring AdSense "가치가 별로 없는 콘텐츠"
// rejection (a reviewer/crawler that can't find or verify most of the
// site's actual content has no way to see its real value). This regenerates
// the sitemap on every request from the live article list in Supabase, so
// new articles show up automatically without a manual sitemap edit.

const SUPABASE_URL = "https://iyxzwrsgivvsgeqclchw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5eHp3cnNnaXZ2c2dlcWNsY2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzE5NzQsImV4cCI6MjA5OTMwNzk3NH0.PsS7tHy14d22KKWBHOi9TkZLTdVYfqolgMHcYJ2gkow";

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Article dates are stored as "2026.8.27" (no zero-padding) -- convert to
// a proper W3C date for <lastmod>.
function toIsoDate(dateStr) {
  const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(dateStr || '');
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const STATIC_URLS = [
  { loc: 'https://baikalnews.com/', changefreq: 'hourly', priority: '1.0' },
  { loc: 'https://baikalnews.com/category.html?cat=culture', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/category.html?cat=economy', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/category.html?cat=tech', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/category.html?cat=local', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/category.html?cat=opinion', changefreq: 'daily', priority: '0.8' },
  { loc: 'https://baikalnews.com/about.html', changefreq: 'monthly', priority: '0.5' },
  { loc: 'https://baikalnews.com/contact.html', changefreq: 'monthly', priority: '0.4' },
  { loc: 'https://baikalnews.com/editorial-policy.html', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://baikalnews.com/privacy-policy.html', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://baikalnews.com/terms.html', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://baikalnews.com/corrections.html', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://baikalnews.com/youth-protection.html', changefreq: 'yearly', priority: '0.3' }
];

module.exports = async (req, res) => {
  try {
    const supaRes = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?select=id,date&status=eq.published&order=id.desc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!supaRes.ok) throw new Error('Supabase fetch failed with status ' + supaRes.status);
    const articles = await supaRes.json();

    const articleEntries = articles.map(a => {
      const lastmod = toIsoDate(a.date);
      return `  <url>
    <loc>${escapeXml(`https://baikalnews.com/article.html?id=${a.id}`)}</loc>
${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    });

    const staticEntries = STATIC_URLS.map(u => `  <url>
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
    console.error('sitemap error:', err);
    // Fall back to just the static pages rather than a hard 500 -- a
    // sitemap missing articles is far better than no sitemap at all.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${STATIC_URLS.map(u => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>
`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(xml);
  }
};
