// Baikal News - Main Shared Scripts

// Canonical category display labels - the single source of truth for how
// category names are shown across the site. Rendering always prefers this
// map over a stored article.categoryLabel so already-saved articles display
// consistently even if they were created before this naming was unified.
const CATEGORY_LABELS = {
  culture: "문화·생활",
  economy: "경제·산업",
  tech: "기술·미디어",
  local: "지역·평택",
  opinion: "오피니언"
};

// Parses the site's "2026.07.02" date format into a comparable Date, for
// sorting articles by actual recency rather than array/insertion order.
function parseKoreanDate(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('.').map(s => parseInt(s, 10));
  if (parts.length < 3 || parts.some(isNaN)) return new Date(0);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// Returns the top `count` articles by view count -- membership is always
// automatic (highest views), but wherever curation.popularReadsIds still
// covers a current top article, that saved relative order is respected
// (set by admins reordering 많이 읽은 인기 기사 in the curation admin tab).
// Any newly-popular article not covered by the saved order is appended in
// view-rank order.
//
// The top-N is always computed from the FULL article pool first (not a
// per-page-filtered one) so the ranking is identical everywhere the widget
// appears; excludeId (the article page you're currently on, so it doesn't
// list itself) is only applied afterward, as a display-time filter -- it
// intentionally does NOT get backfilled with a 6th article, since doing so
// would make each article page compute a different top-5 depending on
// which article excluded itself, which is what caused the list to look
// different from page to page.
function getOrderedPopularArticles(published, curation, excludeId, count) {
  const topByViews = published.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, count);
  const topIds = new Set(topByViews.map(a => a.id));
  const orderIds = ((curation && curation.popularReadsIds) || []).filter(id => topIds.has(id));
  const ordered = orderIds.map(id => topByViews.find(a => a.id === id));
  const remaining = topByViews.filter(a => !orderIds.includes(a.id));
  const result = [...ordered, ...remaining];
  return excludeId ? result.filter(a => a.id !== excludeId) : result;
}

// A "scheduled" article becomes visible on its own once scheduledAt has passed --
// there's no server/cron to flip its status, so this check happens at render time.
function isArticleLive(article) {
  if (!article) return false;
  if (article.status === 'published') return true;
  if (article.status === 'scheduled' && article.scheduledAt) {
    return new Date(article.scheduledAt) <= new Date();
  }
  return false;
}

// 0. Database initialization via localStorage (Self-Executing)
(function initDatabase() {
  // Database version control to force reset old Baikal/Siberia geography articles
  const DB_VERSION = "v3_categories";
  if (localStorage.getItem("baikal_db_version") !== DB_VERSION) {
    localStorage.removeItem("baikal_articles");
    localStorage.removeItem("baikal_curation");
    localStorage.removeItem("baikal_media_library");
    localStorage.setItem("baikal_db_version", DB_VERSION);
  }

  // Check if articles exist in localStorage
  if (!localStorage.getItem("baikal_articles")) {
    // If not, seed database from default ARTICLES array (defined in articles.js)
    // Map initial articles to status = 'published' and set default approvers for AdSense compliance
    const initialArticles = (window.ARTICLES || []).map(art => ({
      ...art,
      categoryLabel: CATEGORY_LABELS[art.category] || art.categoryLabel,
      status: 'published',
      approver: art.id % 2 === 0 ? '장승희' : '최상락',
      byline: art.id % 2 === 0 ? '장승희 기자' : '최상락 기자',
      draftedBy: '홍길동',
      approvedAt: new Date(new Date().setDate(new Date().getDate() - (10 - art.id))).toISOString(),
      seoTitle: `${art.title} - 바이칼 뉴스`,
      seoMeta: art.lead,
      slug: `article-${art.id}`,
      isYMYL: art.category === 'economy' || art.category === 'tech'
    }));
    localStorage.setItem("baikal_articles", JSON.stringify(initialArticles));
  }
  
  // Reload window.ARTICLES to use the database in localStorage
  window.ARTICLES = JSON.parse(localStorage.getItem("baikal_articles"));

  // Check if homepage curation exists
  if (!localStorage.getItem("baikal_curation")) {
    const defaultCuration = {
      featuredHeroId: 1,
      editorsPicksIds: [5, 6, 7],
      popularReadsIds: [8, 9, 10],
      pinnedIds: []
    };
    localStorage.setItem("baikal_curation", JSON.stringify(defaultCuration));
  }

  // Check if static pages override database exists
  if (!localStorage.getItem("baikal_static_pages")) {
    localStorage.setItem("baikal_static_pages", JSON.stringify({}));
  }
})();

document.addEventListener("DOMContentLoaded", async () => {
  // Sync database from Supabase in the background if configured
  if (window.SupabaseAdapter && window.SupabaseAdapter.isConfigured()) {
    try {
      const articles = await window.SupabaseAdapter.fetchArticles();
      localStorage.setItem("baikal_articles", JSON.stringify(articles));
      window.ARTICLES = articles;
      
      const curation = await window.SupabaseAdapter.fetchCuration();
      localStorage.setItem("baikal_curation", JSON.stringify(curation));
      
      const staticPages = await window.SupabaseAdapter.fetchStaticPages();
      localStorage.setItem("baikal_static_pages", JSON.stringify(staticPages));
    } catch (e) {
      console.warn("Background Supabase sync failed. Operating offline with cached local data.", e);
    }
  }

  initCommonFeatures();
  initStaticPageOverrides();
  
  // Determine which page we are on and route accordingly
  const pathname = window.location.pathname;
  const page = pathname.substring(pathname.lastIndexOf('/') + 1);
  
  if (page === 'index.html' || page === '') {
    renderHomepage();
  } else if (page === 'category.html') {
    renderCategoryPage();
  } else if (page === 'article.html') {
    renderArticlePage();
  }
});

// 1. Common features (Header, Footer, Mobile menu, Weather Widget)
function initCommonFeatures() {
  // Simple white line-icons (not emoji) so the toggle color stays fully
  // controllable via CSS instead of rendering in each OS's fixed emoji colors
  const MOON_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';
  const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

  // Theme Toggle Initialization & Dynamic Injection
  const headerTop = document.querySelector(".header-top");
  if (headerTop) {
    const hasToggle = document.getElementById("theme-toggle-btn");
    if (!hasToggle) {
      const themeToggle = document.createElement("div");
      themeToggle.className = "theme-toggle-wrapper";
      themeToggle.innerHTML = `
        <button id="theme-toggle-btn" aria-label="테마 전환" class="theme-toggle-btn">
          <span class="theme-toggle-icon">${MOON_ICON}</span>
        </button>
      `;
      headerTop.appendChild(themeToggle);

      const themeBtn = document.getElementById("theme-toggle-btn");
      const savedTheme = localStorage.getItem("baikal-theme") || "light";
      document.documentElement.setAttribute("data-theme", savedTheme);

      const iconSpan = themeBtn.querySelector(".theme-toggle-icon");
      if (iconSpan) {
        iconSpan.innerHTML = savedTheme === "dark" ? SUN_ICON : MOON_ICON;
      }

      themeBtn.addEventListener("click", () => {
        const activeTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = activeTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("baikal-theme", newTheme);
        if (iconSpan) {
          iconSpan.innerHTML = newTheme === "dark" ? SUN_ICON : MOON_ICON;
        }
      });
    }
  } else {
    // If headerTop is not present (for some inner pages that load main.js)
    const savedTheme = localStorage.getItem("baikal-theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }

  // Current Date display in Header (explicitly converted to Korea Standard Time - KST)
  const dateEl = document.getElementById("current-date");
  if (dateEl) {
    const options = { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" };
    const formatter = new Intl.DateTimeFormat("ko-KR", options);
    dateEl.textContent = formatter.format(new Date());
  }

  // Mobile Menu Navigation Toggle
  const toggleBtn = document.querySelector(".mobile-nav-toggle");
  const navBar = document.querySelector("nav.nav-bar");
  if (toggleBtn && navBar) {
    toggleBtn.addEventListener("click", () => {
      navBar.classList.toggle("active");
    });
  }

  // Pyeongtaek Weather Widget Logic (realistic monthly temperatures for Pyeongtaek, South Korea)
  const tempValEl = document.getElementById("baikal-temp-val");
  const tempDescEl = document.getElementById("baikal-temp-desc");
  const sidebarTempValEl = document.getElementById("sidebar-baikal-temp-val");
  const sidebarTempDescEl = document.getElementById("sidebar-baikal-temp-desc");
  
  if (tempValEl || sidebarTempValEl) {
    const now = new Date();
    const month = now.getMonth();
    let temp = 22.3;
    let desc = "맑음";
    
    if (month === 0) { temp = -2.4; desc = "맑고 한파"; }
    else if (month === 1) { temp = 0.4; desc = "맑고 건조함"; }
    else if (month === 2) { temp = 5.7; desc = "꽃샘추위, 맑음"; }
    else if (month === 3) { temp = 12.5; desc = "맑고 온화함"; }
    else if (month === 4) { temp = 18.0; desc = "맑고 선선함"; }
    else if (month === 5) { temp = 22.3; desc = "화창하고 맑음"; }
    else if (month === 6) { temp = 25.0; desc = "흐림, 고온다습"; }
    else if (month === 7) { temp = 25.7; desc = "무더위 기승"; }
    else if (month === 8) { temp = 21.0; desc = "맑고 쾌청함"; }
    else if (month === 9) { temp = 14.8; desc = "맑고 신선한 가을"; }
    else if (month === 10) { temp = 7.2; desc = "쌀쌀하고 구름 조금"; }
    else if (month === 11) { temp = 0.3; desc = "매우 춥고 맑음"; }
    
    const formattedTemp = `${temp > 0 ? '+' : ''}${temp.toFixed(1)}°C`;
    
    if (tempValEl) tempValEl.textContent = formattedTemp;
    if (tempDescEl) tempDescEl.textContent = desc;
    if (sidebarTempValEl) sidebarTempValEl.textContent = formattedTemp;
    if (sidebarTempDescEl) sidebarTempDescEl.textContent = desc;
  }
}

// Newsletter signup form (homepage #newsletter section)
async function handleNewsletterSubscribe(event) {
  event.preventDefault();
  const form = event.target;
  const emailInput = document.getElementById("newsletter-email");
  const submitBtn = document.getElementById("newsletter-submit-btn");
  const email = emailInput.value.trim();
  if (!email) return;

  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "처리 중...";

  try {
    await window.SupabaseAdapter.subscribeNewsletter(email);
    alert("구독해 주셔서 감사합니다! 앞으로 바이칼 뉴스레터를 이 이메일로 보내드립니다.");
    form.reset();
  } catch (err) {
    console.error("Newsletter subscribe failed:", err);
    alert(err.message || "구독 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

// 2. Dynamic Override for Static Policy Pages
function initStaticPageOverrides() {
  const pathname = window.location.pathname;
  const page = pathname.substring(pathname.lastIndexOf('/') + 1);
  
  // Check if we are on a static page
  const staticPages = ['about.html', 'editorial-policy.html', 'privacy-policy.html', 'terms.html', 'corrections.html', 'contact.html'];
  if (staticPages.includes(page)) {
    const pageKey = page.replace('.html', '');
    const overrides = JSON.parse(localStorage.getItem("baikal_static_pages") || "{}");
    
    // Highlight active menu tab for static pages
    const navId = `nav-${pageKey}`;
    const navEl = document.getElementById(navId);
    if (navEl) navEl.classList.add("active");
    
    // If a custom override HTML is set in localStorage, replace the page's content block
    // (about.html uses .about-page instead of the shared .policy-page wrapper)
    if (overrides[pageKey]) {
      const policyContentEl = document.querySelector(".policy-page, .about-page");
      if (policyContentEl) {
        policyContentEl.innerHTML = overrides[pageKey];
      }
    }
  }
}

// Helper: Get published articles in category
function getArticlesByCategory(category) {
  if (!window.ARTICLES) return [];
  return window.ARTICLES.filter(a => a.category === category && isArticleLive(a));
}

// Helper: Get URL query parameters
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Helper: Render Article card HTML
function createArticleCardHTML(article, mode = 'standard') {
  const imageUrl = article.image || 'images/baikal_ice.png';
  const bylineText = article.byline || (article.approver ? `${article.approver} 기자` : article.author.name);
  
  if (mode === 'hero') {
    return `
      <article class="card card-hero">
        <a href="article.html?id=${article.id}" class="card-image-wrapper">
          <img src="${imageUrl}" alt="${article.title}" class="card-image" loading="eager" fetchpriority="high" decoding="async">
        </a>
        <div class="card-content">
          <span class="category-badge badge-${article.category}">${CATEGORY_LABELS[article.category] || article.categoryLabel}</span>
          <h2 class="card-title"><a href="article.html?id=${article.id}">${article.title}</a></h2>
          <p class="card-excerpt">${article.lead}</p>
          <div class="card-meta">
            <span class="card-author">${bylineText}</span>
            <span class="card-date">${article.date}</span>
          </div>
        </div>
      </article>
    `;
  } else if (mode === 'row') {
    return `
      <article class="card card-row">
        <a href="article.html?id=${article.id}" class="card-image-wrapper">
          <img src="${imageUrl}" alt="${article.title}" class="card-image" loading="lazy" decoding="async">
        </a>
        <div class="card-content">
          <span class="category-badge badge-${article.category}">${CATEGORY_LABELS[article.category] || article.categoryLabel}</span>
          <h3 class="card-title"><a href="article.html?id=${article.id}">${article.title}</a></h3>
          <p class="card-excerpt">${article.lead}</p>
          <div class="card-meta">
            <span class="card-author">${bylineText}</span>
            <span class="card-date">${article.date}</span>
          </div>
        </div>
      </article>
    `;
  } else if (mode === 'minimal') {
    return `
      <article class="card card-minimal">
        <span class="category-badge badge-${article.category}">${CATEGORY_LABELS[article.category] || article.categoryLabel}</span>
        <h3 class="card-title"><a href="article.html?id=${article.id}">${article.title}</a></h3>
        <div class="card-meta">
          <span class="card-author">${bylineText}</span>
          <span class="card-date">${article.date}</span>
        </div>
      </article>
    `;
  } else { // Standard Grid Card
    return `
      <article class="card">
        <a href="article.html?id=${article.id}" class="card-image-wrapper">
          <img src="${imageUrl}" alt="${article.title}" class="card-image" loading="lazy" decoding="async">
        </a>
        <div class="card-content">
          <span class="category-badge badge-${article.category}">${CATEGORY_LABELS[article.category] || article.categoryLabel}</span>
          <h3 class="card-title"><a href="article.html?id=${article.id}">${article.title}</a></h3>
          <p class="card-excerpt">${article.lead}</p>
          <div class="card-meta">
            <span class="card-author">${bylineText}</span>
            <span class="card-date">${article.date}</span>
          </div>
        </div>
      </article>
    `;
  }
}

// 3. Render Homepage
function renderHomepage() {
  if (!window.ARTICLES || window.ARTICLES.length === 0) return;

  const published = window.ARTICLES.filter(a => isArticleLive(a));
  if (published.length === 0) return;

  // Load Curation
  const curation = JSON.parse(localStorage.getItem("baikal_curation")) || {
    featuredHeroId: published[0].id,
    editorsPicksIds: [],
    popularReadsIds: [],
    latestNewsIds: []
  };

  // Feature #1: Hero/Featured Article
  const heroContainer = document.getElementById("featured-hero-container");
  if (heroContainer) {
    // Find designated hero or fallback to first published
    let heroArt = published.find(a => a.id === curation.featuredHeroId);
    if (!heroArt) heroArt = published[0];
    heroContainer.innerHTML = createArticleCardHTML(heroArt, 'hero');
  }

  // Feature #2: Latest Articles Grid (secondary headlines, 5 items on desktop --
  // CSS hides the last 2 on mobile so it still shows 3 there). Uses the
  // manually curated 최신 보도 picks if set, auto-filling any remaining slots
  // with the most recently dated published articles (excluding the hero and
  // whatever's already picked).
  const latestContainer = document.getElementById("latest-grid-container");
  if (latestContainer) {
    let heroArt = published.find(a => a.id === curation.featuredHeroId) || published[0];
    const latestNewsIds = curation.latestNewsIds || [];
    const LATEST_NEWS_COUNT = 5;

    let latestItems = latestNewsIds
      .map(id => published.find(a => a.id === id))
      .filter(Boolean);

    if (latestItems.length < LATEST_NEWS_COUNT) {
      const usedIds = new Set([heroArt.id, ...latestItems.map(a => a.id)]);
      const autoFill = published
        .filter(a => !usedIds.has(a.id))
        .slice()
        .sort((a, b) => parseKoreanDate(b.date) - parseKoreanDate(a.date))
        .slice(0, LATEST_NEWS_COUNT - latestItems.length);
      latestItems = [...latestItems, ...autoFill];
    }

    if (latestItems.length > 0) {
      latestContainer.innerHTML = latestItems.map(art => createArticleCardHTML(art, 'standard')).join('');
    } else {
      latestContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center;">게시된 기사가 없습니다.</p>`;
    }
  }

  // Feature #3: Editor's Picks
  const picksContainer = document.getElementById("editors-picks-container");
  if (picksContainer) {
    const picksItems = published.filter(a => curation.editorsPicksIds.includes(a.id));
    if (picksItems.length > 0) {
      picksContainer.innerHTML = picksItems.map(art => createArticleCardHTML(art, 'minimal')).join('');
    } else {
      // Fallback
      const fallbackPicks = published.slice(0, 3);
      picksContainer.innerHTML = fallbackPicks.map(art => createArticleCardHTML(art, 'minimal')).join('');
    }
  }

  // Feature #4: Popular Reads (auto-selected by view count, admin-orderable)
  const popularContainer = document.getElementById("popular-reads-container");
  if (popularContainer) {
    const popularItems = getOrderedPopularArticles(published, curation, null, 5);
    popularContainer.innerHTML = popularItems.length > 0
      ? popularItems.map(art => createArticleCardHTML(art, 'minimal')).join('')
      : `<p style="color: var(--text-muted); text-align: center;">게시된 기사가 없습니다.</p>`;
  }

  // Feature #5: Category Highlights (5 full-width sections, 3 cards each).
  // A category with no articles yet is hidden entirely rather than shown
  // as an empty section.
  const categoryRows = [
    { id: "culture-row-container", cat: "culture" },
    { id: "economy-row-container", cat: "economy" },
    { id: "tech-row-container", cat: "tech" },
    { id: "local-row-container", cat: "local" },
    { id: "opinion-row-container", cat: "opinion" }
  ];

  categoryRows.forEach(row => {
    const container = document.getElementById(row.id);
    if (!container) return;

    const articles = getArticlesByCategory(row.cat).slice(0, 3);
    const sectionEl = container.closest('section') || container.parentElement;

    if (articles.length > 0) {
      container.innerHTML = articles.map(a => createArticleCardHTML(a, 'standard')).join('');
      if (sectionEl) sectionEl.style.display = '';
    } else {
      container.innerHTML = '';
      if (sectionEl) sectionEl.style.display = 'none';
    }
  });

  // Feature #6: Photo Gallery (last 4 published articles)
  const photoContainer = document.getElementById("photo-gallery-container");
  if (photoContainer) {
    const photoItems = published.slice(Math.max(0, published.length - 4));
    if (photoItems.length > 0) {
      photoContainer.innerHTML = photoItems.map(art => {
        const imageUrl = art.image || 'images/baikal_ice.png';
        return `
          <figure class="photo-item">
            <a class="photo-tile" href="article.html?id=${art.id}">
              <img src="${imageUrl}" alt="${art.title}" loading="lazy" decoding="async">
            </a>
            <p class="photo-caption">${art.title}</p>
          </figure>
        `;
      }).join('');
    } else {
      photoContainer.innerHTML = `<p style="color: var(--text-muted);">등록된 포토 기사가 없습니다.</p>`;
    }
  }
}

// 4. Render Category Archive Page
function renderCategoryPage() {
  const cat = getQueryParam("cat");
  if (!cat) {
    window.location.href = "index.html";
    return;
  }

  const catLabels = CATEGORY_LABELS;

  const catDescs = {
    culture: "얼어붙은 표면 아래 살아 숨 쉬는 온기처럼, 일상 속 예술이 지닌 치유의 힘과 문화의 결을 깊이 있게 기록합니다.",
    local: "바이칼처럼 마르지 않는 공동체의 연대와 상생을 지역 곳곳의 현장에서 길어 올립니다.",
    economy: "겨울 호수의 두꺼운 얼음처럼 단단한 지역경제의 기반과, 순환·재생 에너지로 나아가는 지속가능한 성장을 취재합니다.",
    opinion: "속도와 자극의 소음 위에서, 얼음처럼 냉철하고 투명한 시선으로 세상을 응시하는 지성의 목소리를 모읍니다.",
    tech: "호수 밑바닥까지 닿는 빛처럼, 첨단 기술이 환경과 역사에 새로운 시야를 밝히는 순간들을 보도합니다."
  };

  const titleText = catLabels[cat] || "Category";
  const descText = catDescs[cat] || "Baikal News Editorial Archives";

  document.title = `${titleText} - Baikal News`;
  const catTitleEl = document.getElementById("category-title");
  const catDescEl = document.getElementById("category-description");
  if (catTitleEl) catTitleEl.textContent = titleText;
  if (catDescEl) catDescEl.textContent = descText;

  const canonicalEl = document.getElementById("canonical-link");
  if (canonicalEl) canonicalEl.href = `https://baikalnews.com/category.html?cat=${cat}`;

  const breadCategoryEl = document.getElementById("bread-category");
  if (breadCategoryEl) {
    breadCategoryEl.textContent = titleText;
    breadCategoryEl.className = `color-${cat}`;
  }

  const navId = `nav-${cat}`;
  const navEl = document.getElementById(navId);
  if (navEl) navEl.classList.add("active");

  const curation = JSON.parse(localStorage.getItem("baikal_curation")) || { popularReadsIds: [] };
  const popularIds = curation.popularReadsIds || [];

  // Sort: 최신순 (newest date first) / 인기순 (highest view count first)
  const sort = getQueryParam("sort") === "popular" ? "popular" : "latest";
  let filtered = getArticlesByCategory(cat);
  if (sort === "popular") {
    filtered = filtered.slice().sort((a, b) => {
      const viewDiff = (b.views || 0) - (a.views || 0);
      return viewDiff !== 0 ? viewDiff : parseKoreanDate(b.date) - parseKoreanDate(a.date);
    });
  } else {
    filtered = filtered.slice().sort((a, b) => parseKoreanDate(b.date) - parseKoreanDate(a.date));
  }

  const sortLatestEl = document.getElementById("sort-latest");
  const sortPopularEl = document.getElementById("sort-popular");
  if (sortLatestEl) {
    sortLatestEl.href = `category.html?cat=${cat}&sort=latest`;
    sortLatestEl.classList.toggle("active", sort === "latest");
  }
  if (sortPopularEl) {
    sortPopularEl.href = `category.html?cat=${cat}&sort=popular`;
    sortPopularEl.classList.toggle("active", sort === "popular");
  }

  // Pagination
  const PAGE_SIZE = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  let page = parseInt(getQueryParam("page"), 10);
  if (!page || page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const container = document.getElementById("category-articles-container");
  if (container) {
    if (filtered.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 60px 0;">아직 게재된 기사가 없습니다.</p>`;
    } else {
      container.innerHTML = pageItems.map(art => createArticleCardHTML(art, 'row')).join('');
    }
  }

  const paginationEl = document.getElementById("category-pagination");
  if (paginationEl) {
    if (totalPages <= 1) {
      paginationEl.innerHTML = '';
    } else {
      let pagesHTML = '';
      for (let p = 1; p <= totalPages; p++) {
        pagesHTML += `<a href="category.html?cat=${cat}&sort=${sort}&page=${p}" class="page-link${p === page ? ' active' : ''}">${p}</a>`;
      }
      paginationEl.innerHTML = pagesHTML;
    }
  }

  // Sidebar ranking widget (실시간 인기기사 - reuses the same curation as the homepage)
  const rankingContainer = document.getElementById("category-ranking-container");
  if (rankingContainer) {
    const published = window.ARTICLES.filter(a => isArticleLive(a));
    let rankingItems = published.filter(a => popularIds.includes(a.id)).slice(0, 5);
    if (rankingItems.length === 0) {
      rankingItems = published.slice(Math.max(0, published.length - 5));
    }
    rankingContainer.innerHTML = rankingItems.map(a => createArticleCardHTML(a, 'minimal')).join('');
  }
}

// 5. Render Article Template Page
function renderArticlePage() {
  const idStr = getQueryParam("id");
  const id = parseInt(idStr, 10);
  const isPreview = getQueryParam("preview") === "true";
  
  if (isNaN(id)) {
    window.location.href = "index.html";
    return;
  }

  // Find article from the database (localStorage loaded window.ARTICLES)
  const article = window.ARTICLES.find(a => a.id === id);
  
  // Prevent reader access if not live yet, unless in preview mode
  if (!article || (!isArticleLive(article) && !isPreview)) {
    const container = document.getElementById("article-main-content");
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 100px 0;">
          <h2 style="font-family: var(--font-serif); margin-bottom: 20px;">기사를 볼 수 없습니다</h2>
          <p style="color: var(--text-secondary); margin-bottom: 30px;">본 기사는 삭제되었거나 편집국의 승인 대기 상태입니다.</p>
          <a href="index.html" class="btn btn-primary">홈으로 돌아가기</a>
        </div>
      `;
    }
    return;
  }

  // Count this as a real page view (skip preview mode so editors reviewing drafts don't inflate counts)
  if (!isPreview && window.SupabaseAdapter) {
    window.SupabaseAdapter.incrementArticleView(article.id);
    window.SupabaseAdapter.logPageView(article.id);
  }

  // If viewing preview, show preview banner at the top of the body
  if (isPreview) {
    const previewBanner = document.createElement("div");
    previewBanner.style.backgroundColor = "var(--bg-tertiary)";
    previewBanner.style.borderLeft = "4px solid var(--accent-cyan)";
    previewBanner.style.padding = "16px";
    previewBanner.style.marginBottom = "24px";
    previewBanner.style.fontSize = "0.9rem";
    previewBanner.style.fontWeight = "600";
    previewBanner.style.color = "var(--text-primary)";
    const statusMsg = article.status === 'scheduled' && article.scheduledAt
      ? `예약 발행 상태이며 ${new Date(article.scheduledAt).toLocaleString("ko-KR")}에 자동 공개됩니다`
      : `<strong>${article.status.toUpperCase()}</strong> 상태이며 승인 대기 중입니다`;
    previewBanner.innerHTML = `⚠️ [미리보기 모드] 이 기사는 현재 ${statusMsg}. 일반 독자에게는 보이지 않습니다.`;
    
    const wrapper = document.getElementById("article-main-content");
    if (wrapper) {
      wrapper.prepend(previewBanner);
    }
  }

  // Set Page Title and SEO meta
  document.title = `${article.title} - Baikal News`;

  const canonicalEl = document.getElementById("canonical-link");
  if (canonicalEl) {
    canonicalEl.href = article.canonicalUrl || `https://baikalnews.com/article.html?id=${article.id}`;
  }

  // Set meta description dynamically
  let metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content", article.seoMeta || article.lead);
  }

  // Set active class on navbar category
  const navId = `nav-${article.category}`;
  const navEl = document.getElementById(navId);
  if (navEl) navEl.classList.add("active");

  // Inject Header Details
  const categoryBadgeEl = document.getElementById("article-category-badge");
  const headlineEl = document.getElementById("article-title-text");
  const publishDateEl = document.getElementById("article-publish-date-text");
  const authorNameEl = document.getElementById("article-author-name");

  if (categoryBadgeEl) {
    categoryBadgeEl.textContent = CATEGORY_LABELS[article.category] || article.categoryLabel;
    categoryBadgeEl.href = `category.html?cat=${article.category}`;
  }
  if (headlineEl) headlineEl.textContent = article.title;
  
  // Format Date
  if (publishDateEl) {
    publishDateEl.textContent = `게재일자: ${article.date}`;
  }

  // Display Byline (selected approver is shown to reader)
  const bylineText = article.byline || (article.approver ? `${article.approver} 기자` : article.author.name);
  if (authorNameEl) {
    authorNameEl.textContent = bylineText;
  }

  // Inject NewsArticle structured data so crawlers (including the
  // AdSense reviewer) can read the article's real content/metadata
  // even before any images/JS-rendered elements finish painting
  const existingLd = document.getElementById("article-ld-json");
  if (existingLd) existingLd.remove();
  const ldScript = document.createElement("script");
  ldScript.type = "application/ld+json";
  ldScript.id = "article-ld-json";
  const articleImageUrl = new URL(article.image || 'images/baikal_ice.png', window.location.href).href;
  ldScript.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "description": article.seoMeta || article.lead,
    "image": [articleImageUrl],
    "datePublished": article.approvedAt || article.date,
    "dateModified": article.approvedAt || article.date,
    "author": { "@type": "Person", "name": bylineText },
    "publisher": { "@type": "Organization", "name": "바이칼 뉴스" },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": article.canonicalUrl || `https://baikalnews.com/article.html?id=${article.id}`
    }
  });
  document.head.appendChild(ldScript);

  // Featured Image
  const featuredImg = document.getElementById("article-main-image");
  const featuredImgCaption = document.getElementById("article-image-caption");
  if (featuredImg) {
    featuredImg.src = article.image || 'images/baikal_ice.png';
    featuredImg.alt = article.title;
  }
  if (featuredImgCaption) {
    featuredImgCaption.innerHTML = `<strong>사진/보도:</strong> ${article.title} 관련 현장 취재 자료. (ⓒ ${bylineText})`;
  }

  // Inject Article Content
  const leadEl = document.getElementById("article-lead-paragraph");
  const bodyEl = document.getElementById("article-body-text");
  if (leadEl) {
    leadEl.textContent = article.lead;
    leadEl.className = `article-lead lead-${article.category}`;
  }
  if (bodyEl) bodyEl.innerHTML = article.content;

  // Inject Reporter Bio Box
  const reporterAvatarEl = document.getElementById("reporter-avatar-char");
  const reporterNameBoxEl = document.getElementById("reporter-name-box");
  const reporterRoleEl = document.getElementById("reporter-role-box");
  const reporterBioEl = document.getElementById("reporter-bio-text");
  const reporterEmailEl = document.getElementById("reporter-email-link");
  
  if (reporterAvatarEl) {
    // Show the first letter of the byline reporter name
    reporterAvatarEl.textContent = bylineText.charAt(0);
  }
  if (reporterNameBoxEl) reporterNameBoxEl.textContent = bylineText;
  if (reporterRoleEl) {
    reporterRoleEl.textContent = article.approver ? "편집위원 / 보도기자" : article.author.role;
  }
  if (reporterBioEl) {
    reporterBioEl.textContent = article.approver 
      ? `바이칼 뉴스의 공식 편집위원 및 보도기자로서 투명하고 공정한 팩트 검증을 완료한 기사를 발행합니다.` 
      : article.author.bio;
  }
  if (reporterEmailEl) {
    const email = article.approver ? (article.approver === '최상락' ? 'baikalnews.choi@gmail.com' : 'baikalnews.jang@gmail.com') : article.author.email;
    reporterEmailEl.textContent = email;
    reporterEmailEl.href = `mailto:${email}`;
  }

  // Inject Revision History Log
  const revisionHistoryContainer = document.getElementById("revision-history-log");
  if (revisionHistoryContainer) {
    if (article.revisionHistory && article.revisionHistory.length > 0) {
      let logHTML = '';
      article.revisionHistory.forEach(rev => {
        logHTML += `
          <li class="revision-item">
            <span class="revision-date">${rev.date}</span>
            <span class="revision-action">${rev.action}</span>
          </li>
        `;
      });
      revisionHistoryContainer.innerHTML = logHTML;
    } else {
      revisionHistoryContainer.innerHTML = `
        <li class="revision-item">
          <span class="revision-date">${article.date}</span>
          <span class="revision-action">최초 보도 게재 (승인자: ${article.approver || '편집국'})</span>
        </li>
      `;
    }
  }

  // Render Related Articles (same category, up to 3 articles, excluding current)
  const relatedContainer = document.getElementById("related-sidebar-container");
  if (relatedContainer) {
    const publishedList = window.ARTICLES.filter(a => isArticleLive(a));
    const related = publishedList
      .filter(a => a.category === article.category && a.id !== article.id)
      .slice(0, 3);

    if (related.length === 0) {
      // Fallback
      const other = publishedList.filter(a => a.id !== article.id).slice(0, 3);
      relatedContainer.innerHTML = other.map(a => createArticleCardHTML(a, 'standard')).join('');
    } else {
      relatedContainer.innerHTML = related.map(a => createArticleCardHTML(a, 'standard')).join('');
    }
  }

  // Render Sidebar Ranking Widget (실시간 인기기사 - reuses homepage curation, excludes current article)
  const rankingContainer = document.getElementById("article-ranking-container");
  if (rankingContainer) {
    const curationData = JSON.parse(localStorage.getItem("baikal_curation")) || { popularReadsIds: [] };
    const publishedForRanking = window.ARTICLES.filter(a => isArticleLive(a));
    const rankingItems = getOrderedPopularArticles(publishedForRanking, curationData, article.id, 5);
    rankingContainer.innerHTML = rankingItems.map(a => createArticleCardHTML(a, 'minimal')).join('');
  }

  // Wire up share / copy-link / scrap buttons
  const shareRow = document.querySelector(".article-share-row");
  if (shareRow) {
    const copyBtn = shareRow.querySelector('[data-share-action="copy"]');
    const shareBtn = shareRow.querySelector('[data-share-action="share"]');
    const scrapBtn = document.getElementById("article-scrap-btn");

    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          const original = copyBtn.textContent;
          copyBtn.textContent = "복사됨";
          setTimeout(() => { copyBtn.textContent = original; }, 1500);
        } catch (e) {
          console.warn("클립보드 복사에 실패했습니다:", e);
        }
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener("click", async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: article.title, url: window.location.href });
          } catch (e) {
            // 사용자가 공유를 취소한 경우이므로 별도 처리하지 않음
          }
        } else if (copyBtn) {
          copyBtn.click();
        }
      });
    }

    if (scrapBtn) {
      const updateScrapLabel = () => {
        const saved = JSON.parse(localStorage.getItem("baikal_scraps") || "[]").includes(article.id);
        scrapBtn.textContent = saved ? "스크랩됨" : "스크랩";
        scrapBtn.classList.toggle("is-active", saved);
      };
      updateScrapLabel();
      scrapBtn.addEventListener("click", () => {
        let saved = JSON.parse(localStorage.getItem("baikal_scraps") || "[]");
        if (saved.includes(article.id)) {
          saved = saved.filter(id => id !== article.id);
        } else {
          saved.push(article.id);
        }
        localStorage.setItem("baikal_scraps", JSON.stringify(saved));
        updateScrapLabel();
      });
    }
  }
}
