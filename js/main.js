// Baikal News - Main Shared Scripts

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
    const catLabels = {
      culture: "문화 / 예술",
      economy: "경제 / 산업",
      tech: "기술 / 미디어",
      local: "지역 / 평택",
      opinion: "오피니언"
    };

    // If not, seed database from default ARTICLES array (defined in articles.js)
    // Map initial articles to status = 'published' and set default approvers for AdSense compliance
    const initialArticles = (window.ARTICLES || []).map(art => ({
      ...art,
      categoryLabel: catLabels[art.category] || art.categoryLabel,
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
  // Theme Toggle Initialization & Dynamic Injection
  const headerTop = document.querySelector(".header-top");
  if (headerTop) {
    const hasToggle = document.getElementById("theme-toggle-btn");
    if (!hasToggle) {
      const themeToggle = document.createElement("div");
      themeToggle.className = "theme-toggle-wrapper";
      themeToggle.innerHTML = `
        <button id="theme-toggle-btn" aria-label="테마 전환" class="theme-toggle-btn">
          <span class="theme-toggle-icon">🌙</span>
        </button>
      `;
      headerTop.appendChild(themeToggle);

      const themeBtn = document.getElementById("theme-toggle-btn");
      const savedTheme = localStorage.getItem("baikal-theme") || "light";
      document.documentElement.setAttribute("data-theme", savedTheme);
      
      const iconSpan = themeBtn.querySelector(".theme-toggle-icon");
      if (iconSpan) {
        iconSpan.textContent = savedTheme === "dark" ? "☀️" : "🌙";
      }

      themeBtn.addEventListener("click", () => {
        const activeTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = activeTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("baikal-theme", newTheme);
        if (iconSpan) {
          iconSpan.textContent = newTheme === "dark" ? "☀️" : "🌙";
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
    
    // If a custom override HTML is set in localStorage, replace the policy page content block
    if (overrides[pageKey]) {
      const policyContentEl = document.querySelector(".policy-page");
      if (policyContentEl) {
        policyContentEl.innerHTML = overrides[pageKey];
      }
    }
  }
}

// Helper: Get published articles in category
function getArticlesByCategory(category) {
  if (!window.ARTICLES) return [];
  return window.ARTICLES.filter(a => a.category === category && a.status === 'published');
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
          <img src="${imageUrl}" alt="${article.title}" class="card-image">
        </a>
        <div class="card-content">
          <span class="category-badge badge-${article.category}">${article.categoryLabel}</span>
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
          <img src="${imageUrl}" alt="${article.title}" class="card-image">
        </a>
        <div class="card-content">
          <span class="category-badge badge-${article.category}">${article.categoryLabel}</span>
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
        <span class="category-badge badge-${article.category}">${article.categoryLabel}</span>
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
          <img src="${imageUrl}" alt="${article.title}" class="card-image">
        </a>
        <div class="card-content">
          <span class="category-badge badge-${article.category}">${article.categoryLabel}</span>
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

  const published = window.ARTICLES.filter(a => a.status === 'published');
  if (published.length === 0) return;

  // Load Curation
  const curation = JSON.parse(localStorage.getItem("baikal_curation")) || {
    featuredHeroId: published[0].id,
    editorsPicksIds: [],
    popularReadsIds: []
  };

  // Feature #1: Hero/Featured Article
  const heroContainer = document.getElementById("featured-hero-container");
  if (heroContainer) {
    // Find designated hero or fallback to first published
    let heroArt = published.find(a => a.id === curation.featuredHeroId);
    if (!heroArt) heroArt = published[0];
    heroContainer.innerHTML = createArticleCardHTML(heroArt, 'hero');
  }

  // Feature #2: Latest Articles Grid (up to 4 items, excluding hero)
  const latestContainer = document.getElementById("latest-grid-container");
  if (latestContainer) {
    let heroArt = published.find(a => a.id === curation.featuredHeroId) || published[0];
    const latestItems = published.filter(a => a.id !== heroArt.id).slice(0, 4);
    
    if (latestItems.length > 0) {
      latestContainer.innerHTML = latestItems.map(art => createArticleCardHTML(art, 'standard')).join('');
    } else {
      latestContainer.innerHTML = `<p style="grid-column: span 2; color: var(--text-muted); text-align: center;">게시된 기사가 없습니다.</p>`;
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

  // Feature #4: Popular Reads
  const popularContainer = document.getElementById("popular-reads-container");
  if (popularContainer) {
    const popularItems = published.filter(a => curation.popularReadsIds.includes(a.id));
    if (popularItems.length > 0) {
      popularContainer.innerHTML = popularItems.map(art => createArticleCardHTML(art, 'minimal')).join('');
    } else {
      // Fallback
      const fallbackPopular = published.slice(Math.max(0, published.length - 3));
      popularContainer.innerHTML = fallbackPopular.map(art => createArticleCardHTML(art, 'minimal')).join('');
    }
  }

  // Feature #5: Category Highlights
  const cultureRow = document.getElementById("culture-row-container");
  if (cultureRow) {
    const cultureArticles = getArticlesByCategory("culture").slice(0, 2);
    if (cultureArticles.length > 0) {
      cultureRow.innerHTML = cultureArticles.map(a => createArticleCardHTML(a, 'standard')).join('');
    } else {
      cultureRow.innerHTML = `<p style="color: var(--text-muted);">등록된 문화 뉴스가 없습니다.</p>`;
    }
  }

  const localRow = document.getElementById("local-row-container");
  if (localRow) {
    const localArticles = getArticlesByCategory("local").slice(0, 2);
    if (localArticles.length > 0) {
      localRow.innerHTML = localArticles.map(a => createArticleCardHTML(a, 'standard')).join('');
    } else {
      localRow.innerHTML = `<p style="color: var(--text-muted);">등록된 지역 뉴스가 없습니다.</p>`;
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

  const catLabels = {
    culture: "문화 / 예술",
    economy: "경제 / 산업",
    tech: "기술 / 미디어",
    local: "지역 / 평택",
    opinion: "오피니언"
  };
  
  const catDescs = {
    culture: "일상 속 예술의 치유적 성격부터 현대 미술 아카이빙까지 사색을 통한 깊이 있는 삶의 가치를 기록합니다.",
    local: "지역 경제의 활성화와 환경 보호, 상생과 연대를 도모하는 로컬 시민 사회의 소식을 다룹니다.",
    economy: "순환 경제 모델, 지속 가능한 에너지 전환 등 미래 생태계 보존과 경제 성장의 균형을 다룹니다.",
    opinion: "자극과 속도 중심의 보도를 지양하고, 투명한 호수처럼 세상을 깊이 응시하는 지성적인 성찰을 모읍니다.",
    tech: "사물인터넷(IoT) 기술을 이용한 수질 모니터링부터 소멸 언어 보존까지 생태와 역사에 숨결을 불어넣는 기술을 보도합니다."
  };

  const titleText = catLabels[cat] || "Category";
  const descText = catDescs[cat] || "Baikal News Editorial Archives";

  document.title = `${titleText} - Baikal News`;
  const catTitleEl = document.getElementById("category-title");
  const catDescEl = document.getElementById("category-description");
  if (catTitleEl) catTitleEl.textContent = titleText;
  if (catDescEl) catDescEl.textContent = descText;

  const breadCategoryEl = document.getElementById("bread-category");
  if (breadCategoryEl) {
    breadCategoryEl.textContent = titleText;
    breadCategoryEl.className = `color-${cat}`;
  }

  const navId = `nav-${cat}`;
  const navEl = document.getElementById(navId);
  if (navEl) navEl.classList.add("active");

  const filtered = getArticlesByCategory(cat);
  const container = document.getElementById("category-articles-container");
  
  if (container) {
    if (filtered.length === 0) {
      container.innerHTML = `<p class="no-articles" style="grid-column: span 3; text-align: center; color: var(--text-muted); padding: 60px 0;">아직 게재된 기사가 없습니다.</p>`;
    } else {
      container.innerHTML = filtered.map(art => createArticleCardHTML(art, 'standard')).join('');
    }
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
  
  // Prevent reader access if not published, unless in preview mode
  if (!article || (article.status !== 'published' && !isPreview)) {
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
    previewBanner.innerHTML = `⚠️ [미리보기 모드] 이 기사는 현재 <strong>${article.status.toUpperCase()}</strong> 상태이며 승인 대기 중입니다. 일반 독자에게는 보이지 않습니다.`;
    
    const wrapper = document.getElementById("article-main-content");
    if (wrapper) {
      wrapper.prepend(previewBanner);
    }
  }

  // Set Page Title and SEO meta
  document.title = `${article.title} - Baikal News`;
  
  // Set meta description dynamically
  let metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content", article.seoMeta || article.lead);
  }

  // Set active class on navbar category
  const navId = `nav-${article.category}`;
  const navEl = document.getElementById(navId);
  if (navEl) navEl.classList.add("active");

  // Inject Breadcrumbs
  const breadCategoryEl = document.getElementById("bread-category");
  if (breadCategoryEl) {
    breadCategoryEl.textContent = article.categoryLabel;
    breadCategoryEl.href = `category.html?cat=${article.category}`;
    breadCategoryEl.className = `color-${article.category}`;
  }

  // Inject Header Details
  const categoryBadgeEl = document.getElementById("article-category-badge");
  const headlineEl = document.getElementById("article-title-text");
  const publishDateEl = document.getElementById("article-publish-date-text");
  const authorNameEl = document.getElementById("article-author-name");
  
  if (categoryBadgeEl) {
    categoryBadgeEl.textContent = article.categoryLabel;
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
    authorNameEl.textContent = `${bylineText} (${article.author.role})`;
  }

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
  if (leadEl) leadEl.textContent = article.lead;
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
    const email = article.approver ? `${article.approver === '최상락' ? 'sr.choi' : 'sh.jang'}@baikalnews.com` : article.author.email;
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

  // Render Related Articles Sidebar (same category, up to 3 articles, excluding current)
  const relatedContainer = document.getElementById("related-sidebar-container");
  if (relatedContainer) {
    const publishedList = window.ARTICLES.filter(a => a.status === 'published');
    const related = publishedList
      .filter(a => a.category === article.category && a.id !== article.id)
      .slice(0, 3);
    
    if (related.length === 0) {
      // Fallback
      const other = publishedList.filter(a => a.id !== article.id).slice(0, 3);
      relatedContainer.innerHTML = other.map(a => createArticleCardHTML(a, 'minimal')).join('');
    } else {
      relatedContainer.innerHTML = related.map(a => createArticleCardHTML(a, 'minimal')).join('');
    }
  }
}
