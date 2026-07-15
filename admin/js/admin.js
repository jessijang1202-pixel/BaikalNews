// Baikal News - Admin CMS Javascript Logic
document.addEventListener("DOMContentLoaded", () => {
  initAdminDashboard();
  setupEventListeners();
  loadGeminiApiKey();
});

// Global state variables
let currentEditingId = null;
let currentStaticPageKey = 'about';
let selectedMediaImage = '';

// Default static contents (as backup fallback for the page manager editor)
const DEFAULT_PAGE_CONTENTS = {
  about: `<h1>회사 소개 / About Us</h1>
<div class="policy-meta-info">최종 수정일: 2026년 7월 11일</div>
<div class="policy-section">
  <h2>바이칼 뉴스 소개</h2>
  <p><strong>바이칼 뉴스(Baikal News)</strong>는 맑고 투명한 호수의 빙판처럼 거짓 없는 보도로 우리 사회를 맑게 비추고, 성급한 속보 경쟁보다는 깊이 있는 성찰적 보도를 생산하는 것을 최우선 가치로 삼는 디지털 대안 언론사입니다. 우리는 단편적인 단어의 나열이나 말초적인 자극을 완벽히 지양하며, 정직하고 투명한 저널리즘을 실현하여 독자를 존중하고자 노력합니다.</p>
</div>`,
  'editorial-policy': `<h1>편집 규약 / Editorial Policy</h1>
<div class="policy-meta-info">최종 공시일: 2026년 7월 11일 | 바이칼 뉴스 제정</div>
<div class="policy-section">
  <h2>제1조 목적 및 사명</h2>
  <p>본 규약은 바이칼 뉴스가 저널리즘 본연의 정직성과 공익성을 수호하고, 외부의 부당한 압력으로부터 편집의 독립성을 지킴으로써 독자의 알 권리와 신뢰를 충족시키는 것을 목적으로 합니다.</p>
</div>`,
  'privacy-policy': `<h1>개인정보처리방침 / Privacy Policy</h1>
<div class="policy-meta-info">최종 공시 및 시행일: 2026년 7월 11일</div>
<div class="policy-section">
  <h2>1. 수집하는 개인정보 항목</h2>
  <p>바이칼 뉴스는 뉴스레터 발송 및 독자 제보 처리를 위해 최소한의 이메일 주소를 수집합니다. Google AdSense 광고를 게재하며 쿠키를 사용할 수 있습니다.</p>
</div>`,
  terms: `<h1>이용약관 / Terms of Service</h1>
<div class="policy-meta-info">최종 개정 및 적용일: 2026년 7월 11일</div>
<div class="policy-section">
  <h2>제1조 목적</h2>
  <p>이 약관은 바이칼 뉴스가 제공하는 인터넷 정보 서비스 및 뉴스 콘텐츠를 이용자가 이용함에 있어 본지와 이용자 간의 권리와 책임을 규정합니다.</p>
</div>`,
  corrections: `<h1>오보 정정 및 개정 정책 / Corrections Policy</h1>
<div class="policy-meta-info">최종 제정 및 고시일: 2026년 7월 11일</div>
<div class="policy-section">
  <h2>신뢰와 투명성을 위한 약속</h2>
  <p>바이칼 뉴스는 실수를 숨기거나 묵인하는 대신, 신속하고 성실하게 오류를 수정하고 이를 독자에게 가감 없이 공개함으로써 언론사로서의 투명성을 유지합니다.</p>
</div>`,
  contact: `<h1>제보 및 문의 / Contact</h1>
<div class="policy-meta-info">귀하의 소중한 의견과 제보는 바이칼 뉴스의 가장 귀중한 자산입니다.</div>
<div class="policy-section">
  <h2>기사 제보 (Tips & Reports)</h2>
  <p>익명이 보장되는 기사 관련 제보는 baikalnews815@gmail.com 으로 송부해 주시기 바랍니다.</p>
</div>`
};

// 1. Initialize admin sections
async function initAdminDashboard() {
  // Switch to dashboard tab initially
  switchTab('dashboard');
  
  // Refresh data models
  await refreshStats();
  await renderArticlesList();
  await renderPendingList();
  await populateCurationDropdowns();
  await loadStaticPageContent();
  await renderAuditLogs();
}

// Sidebar Tab switching
function setupEventListeners() {
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  sidebarItems.forEach(item => {
    item.addEventListener("click", () => {
      const tab = item.getAttribute("data-tab");
      switchTab(tab);
      
      // Mobile: Close sidebar automatically after navigation
      const sidebar = document.querySelector(".admin-sidebar");
      const overlay = document.getElementById("sidebar-overlay");
      if (sidebar) sidebar.classList.remove("active");
      if (overlay) overlay.classList.remove("active");
    });
  });

  // Mobile Sidebar Toggle Event setup
  const toggleBtn = document.getElementById("sidebar-toggle");
  const sidebar = document.querySelector(".admin-sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  if (toggleBtn && sidebar && overlay) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("active");
      overlay.classList.toggle("active");
    });

    overlay.addEventListener("click", () => {
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
    });
  }
}

async function switchTab(tabName) {
  // Remove active from all sidebar links
  document.querySelectorAll(".sidebar-item").forEach(item => {
    item.classList.remove("active");
    if (item.getAttribute("data-tab") === tabName) {
      item.classList.add("active");
    }
  });

  // Hide all tab views
  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.remove("active");
  });

  // Show selected tab view
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) {
    targetTab.classList.add("active");
  }

  // Update header title
  const titles = {
    dashboard: "뉴스룸 현황 대시보드",
    articles: "기사 통합 데스크 관리",
    'ai-writer': "AI 어시스턴트 집필실",
    curation: "홈페이지 큐레이션 통제",
    pages: "정적 페이지 및 AdSense 신뢰성 문서 관리",
    audit: "보도 편집 감사 로그",
    supabase: "Supabase 클라우드 데이터베이스 연동"
  };
  const titleEl = document.getElementById("current-tab-title");
  if (titleEl) {
    titleEl.textContent = titles[tabName] || "바이칼 뉴스 어드민";
  }

  // Refresh lists if switching to specific tabs
  if (tabName === 'dashboard') {
    await refreshStats();
    await renderPendingList();
  } else if (tabName === 'articles') {
    await renderArticlesList();
  } else if (tabName === 'ai-writer') {
    loadGeminiApiKey();
    await loadWritingStyles();
  } else if (tabName === 'curation') {
    await populateCurationDropdowns();
  } else if (tabName === 'audit') {
    await renderAuditLogs();
  } else if (tabName === 'supabase') {
    loadSupabaseConfigForm();
  }
}

// 2. Audit Trail Log Helpers
async function logAudit(action, articleId, notes) {
  const newLog = {
    timestamp: new Date().toLocaleString("ko-KR"),
    role: "데스크 관리자 (최고 관리자)",
    action: action,
    articleId: articleId ? String(articleId) : "-",
    notes: notes || ""
  };
  
  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveAuditLog(newLog);
  }
  
  await renderAuditLogs();
}

async function renderAuditLogs() {
  const tableBody = document.getElementById("audit-table-body");
  if (!tableBody) return;

  let logs = [];
  if (window.SupabaseAdapter) {
    logs = await window.SupabaseAdapter.fetchAuditLogs();
  }

  if (logs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--admin-text-muted);">감사 로그가 비어 있습니다. 기사 활동이 발생하면 자동으로 기록됩니다.</td></tr>`;
    return;
  }

  tableBody.innerHTML = logs.map((log, index) => `
    <tr>
      <td>#${log.id || (logs.length - index)}</td>
      <td style="white-space: nowrap;">${log.timestamp}</td>
      <td><span class="profile-role-tag" style="background-color: var(--admin-bg-body); font-size: 0.65rem;">${log.role}</span></td>
      <td style="font-weight: 500; color: var(--admin-text-primary);">${log.action}</td>
      <td>${log.articleId}</td>
      <td style="font-size: 0.8rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${log.notes}</td>
    </tr>
  `).join('');
}

async function clearAuditLogs() {
  if (confirm("경고: 모든 신문 편집 감사 기록이 영구 삭제됩니다. 계속하시겠습니까?")) {
    localStorage.setItem("baikal_audit_logs", JSON.stringify([]));
    await logAudit("감사 로그 초기화", null, "시스템 감사 트레일 기록을 전체 정리함.");
    await renderAuditLogs();
  }
}

// 3. Stats calculations
async function refreshStats() {
  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  
  const draft = articles.filter(a => a.status === 'draft').length;
  const review = articles.filter(a => a.status === 'review').length;
  const published = articles.filter(a => a.status === 'published').length;
  
  document.getElementById("stat-draft-count").textContent = draft;
  document.getElementById("stat-review-count").textContent = review;
  document.getElementById("stat-published-count").textContent = published;
  document.getElementById("stat-total-count").textContent = articles.length;
}

// Render Dashboard Review list
async function renderPendingList() {
  const listEl = document.getElementById("dashboard-pending-list");
  if (!listEl) return;

  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  const pending = articles.filter(a => a.status === 'review');

  if (pending.length === 0) {
    listEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--admin-text-muted); padding: 24px 0;">검토 요청 대기 상태인 기사가 없습니다.</td></tr>`;
    return;
  }

  listEl.innerHTML = pending.map(art => `
    <tr>
      <td><span class="ai-tag" style="margin:0;">${art.categoryLabel}</span></td>
      <td style="font-weight: 500; color: var(--admin-text-primary);">${art.title}</td>
      <td>${art.author.name}</td>
      <td><span class="badge badge-review">검토 요청</span></td>
      <td class="action-links">
        <a onclick="editArticle(${art.id})">열기 및 승인/반려</a>
      </td>
    </tr>
  `).join('');
}

// 4. Article Management list & CRUD
async function renderArticlesList() {
  const tbody = document.getElementById("articles-table-body");
  if (!tbody) return;

  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  
  if (articles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--admin-text-muted);">등록된 기사가 없습니다. 새 기사를 추가하거나 AI로 작성해 보세요.</td></tr>`;
    return;
  }

  tbody.innerHTML = articles.map(art => `
    <tr>
      <td>${art.id}</td>
      <td><span class="ai-tag" style="margin: 0; font-size: 0.7rem;">${art.category.toUpperCase()}</span></td>
      <td style="font-weight: 500; color: var(--admin-text-primary); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${art.title}</td>
      <td>${art.author.name}</td>
      <td>${art.approver || '<span style="color: var(--admin-text-muted);">미지정</span>'}</td>
      <td><span class="badge badge-${art.status}">${art.status.toUpperCase()}</span></td>
      <td style="white-space: nowrap;">${art.date}</td>
      <td class="action-links">
        <a onclick="editArticle(${art.id})">편집</a>
        <a onclick="previewArticle(${art.id})">미리보기</a>
        <a onclick="duplicateArticle(${art.id})" style="color: var(--admin-text-secondary);">복사</a>
      </td>
    </tr>
  `).join('');
}

// Form view controls
function showArticleCreateForm() {
  document.getElementById("articles-list-view").style.display = "none";
  document.getElementById("articles-form-view").style.display = "block";
  document.getElementById("form-view-title").textContent = "새 기사 작성";
  
  // Reset form inputs
  document.getElementById("article-form").reset();
  currentEditingId = null;
  
  // Set default values
  document.getElementById("edit-article-id").value = "";
  document.getElementById("form-date").value = new Date().toLocaleDateString("ko-KR").replace(/\s/g, '').slice(0, -1); // "2026.07.11" format
  document.getElementById("form-image").value = "images/news_editorial.png";
  
  // Hide widgets
  document.getElementById("btn-soft-delete").style.display = "none";
  onStatusChangeInForm("draft");
}

function hideArticleForm() {
  document.getElementById("articles-form-view").style.display = "none";
  document.getElementById("articles-list-view").style.display = "block";
  currentEditingId = null;
  renderArticlesList();
}

function onStatusChangeInForm(status) {
  // Update selected status drop list in UI
  document.getElementById("form-status").value = status;
  
  // Visual Step active state update
  const steps = ["draft", "review", "approved", "published"];
  steps.forEach(s => {
    const stepEl = document.getElementById(`wf-step-${s}`);
    if (stepEl) stepEl.classList.remove("active");
  });
  
  // Highlights connections
  document.getElementById("wf-conn-review").classList.remove("active");
  document.getElementById("wf-conn-approved").classList.remove("active");
  document.getElementById("wf-conn-published").classList.remove("active");

  if (status === 'draft') {
    document.getElementById("wf-step-draft").classList.add("active");
  } else if (status === 'review') {
    document.getElementById("wf-step-draft").classList.add("active");
    document.getElementById("wf-step-review").classList.add("active");
    document.getElementById("wf-conn-review").classList.add("active");
  } else if (status === 'approved') {
    document.getElementById("wf-step-draft").classList.add("active");
    document.getElementById("wf-step-review").classList.add("active");
    document.getElementById("wf-step-approved").classList.add("active");
    document.getElementById("wf-conn-review").classList.add("active");
    document.getElementById("wf-conn-approved").classList.add("active");
  } else if (status === 'published') {
    document.getElementById("wf-step-draft").classList.add("active");
    document.getElementById("wf-step-review").classList.add("active");
    document.getElementById("wf-step-approved").classList.add("active");
    document.getElementById("wf-step-published").classList.add("active");
    document.getElementById("wf-conn-review").classList.add("active");
    document.getElementById("wf-conn-approved").classList.add("active");
    document.getElementById("wf-conn-published").classList.add("active");
  }

  // Show approver selector if status is approved or published
  const approverGroup = document.getElementById("approver-select-group");
  if (status === 'approved' || status === 'published') {
    approverGroup.style.display = "block";
    document.getElementById("form-approver").setAttribute("required", "required");
  } else {
    approverGroup.style.display = "none";
    document.getElementById("form-approver").removeAttribute("required");
  }

  // Show rejection note if status is draft and we had a previous review
  const rejectionGroup = document.getElementById("rejection-note-group");
  if (status === 'review') {
    rejectionGroup.style.display = "block";
  } else {
    rejectionGroup.style.display = "none";
  }
}

// Edit existing article
async function editArticle(id) {
  let art = null;
  if (window.SupabaseAdapter) {
    art = await window.SupabaseAdapter.fetchArticleById(id);
  }
  if (!art) return;

  currentEditingId = id;

  document.getElementById("articles-list-view").style.display = "none";
  document.getElementById("articles-form-view").style.display = "block";
  document.getElementById("form-view-title").textContent = `기사 편집 (ID: #${art.id})`;

  // Populate fields
  document.getElementById("edit-article-id").value = art.id;
  document.getElementById("form-title").value = art.title;
  document.getElementById("form-subtitle").value = art.subtitle || "";
  document.getElementById("form-lead").value = art.lead || "";
  document.getElementById("form-content").value = art.content || "";
  document.getElementById("form-category").value = art.category;
  document.getElementById("form-date").value = art.date;
  document.getElementById("form-ymyl").checked = art.isYMYL || false;
  document.getElementById("form-image").value = art.image || "images/news_editorial.png";
  
  document.getElementById("form-seo-title").value = art.seoTitle || "";
  document.getElementById("form-seo-meta").value = art.seoMeta || "";
  document.getElementById("form-slug").value = art.slug || "";
  
  document.getElementById("form-status").value = art.status;
  document.getElementById("form-approver").value = art.approver || "";
  
  // Show delete button
  document.getElementById("btn-soft-delete").style.display = "block";
  
  // Trigger status visual logic
  onStatusChangeInForm(art.status);
}

// Preview before publishing
function previewArticle(id) {
  window.open(`https://baikalnews.com/article.html?id=${id}&preview=true`, '_blank');
}

function previewArticleInForm() {
  if (currentEditingId) {
    previewArticle(currentEditingId);
  } else {
    alert("실시간 레이아웃을 보려면 기사 초안을 먼저 작성(임시 저장)해 주세요.");
  }
}

// Duplicate article
async function duplicateArticle(id) {
  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  const art = articles.find(a => a.id === id);
  if (!art) return;

  const duplicated = {
    ...art,
    id: Math.max(...articles.map(a => a.id)) + 1,
    title: `[복사본] ${art.title}`,
    status: 'draft',
    approver: null,
    byline: "",
    approvedAt: null,
    revisionHistory: [{"date": new Date().toLocaleString("ko-KR"), "action": "기사 복제본 초안 생성"}]
  };

  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveArticle(duplicated);
  }
  await logAudit("기사 복제", duplicated.id, `기사 #${art.id}을 바탕으로 신규 초안 #${duplicated.id}을 만듦.`);
  await renderArticlesList();
}

// Save Article
async function saveArticle() {
  const idVal = document.getElementById("edit-article-id").value;
  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  
  const title = document.getElementById("form-title").value;
  const subtitle = document.getElementById("form-subtitle").value;
  const lead = document.getElementById("form-lead").value;
  const content = document.getElementById("form-content").value;
  const category = document.getElementById("form-category").value;
  const date = document.getElementById("form-date").value;
  const isYMYL = document.getElementById("form-ymyl").checked;
  const image = document.getElementById("form-image").value;
  
  const seoTitle = document.getElementById("form-seo-title").value || `${title} - 바이칼 뉴스`;
  const seoMeta = document.getElementById("form-seo-meta").value || lead;
  const slug = document.getElementById("form-slug").value || `article-${Date.now()}`;
  
  const status = document.getElementById("form-status").value;
  const approver = document.getElementById("form-approver").value;
  const rejectionNote = document.getElementById("form-rejection-note").value;

  // Category labels mapping
  const catLabels = {
    culture: "문화 / 예술",
    economy: "경제 / 산업",
    tech: "기술 / 미디어",
    local: "지역 / 평택",
    opinion: "오피니언"
  };

  // Critical Validation: Approval requires an Approver name
  if ((status === 'approved' || status === 'published') && !approver) {
    alert("승인 완료(Approved) 또는 발행 공개(Published) 상태로 전환하기 위해서는 검토에 책임을 질 최종 데스크 승인인(최상락 또는 장승희)을 반드시 지정해야 합니다.");
    return;
  }

  let art = null;
  let actionName = "";

  if (idVal) {
    // Edit Mode
    const id = parseInt(idVal, 10);
    art = articles.find(a => a.id === id);
    if (!art) return;

    // Log the change
    actionName = `기사 편집 및 상태 변경 (${status.toUpperCase()})`;
    let revisionMsg = `기사 내용 수정 및 보완 (상태: ${status})`;
    
    if (art.status !== status) {
      revisionMsg = `상태 변경: ${art.status} -> ${status}`;
      if (status === 'published') {
        revisionMsg = `보도 최종 승인 및 공개 발행 (승인인: ${approver})`;
      }
    }
    
    art.title = title;
    art.subtitle = subtitle;
    art.lead = lead;
    art.content = content;
    art.category = category;
    art.categoryLabel = catLabels[category];
    art.date = date;
    art.isYMYL = isYMYL;
    art.image = image;
    art.seoTitle = seoTitle;
    art.seoMeta = seoMeta;
    art.slug = slug;
    
    // Workflow updates
    if (status !== art.status) {
      art.status = status;
      if (status === 'approved' || status === 'published') {
        art.approver = approver;
        art.byline = `${approver} 기자`;
        art.approvedAt = new Date().toISOString();
      } else {
        art.approver = null;
        art.byline = "";
        art.approvedAt = null;
      }
    }
    
    // Add to revision log
    if (!art.revisionHistory) art.revisionHistory = [];
    art.revisionHistory.push({
      date: new Date().toLocaleString("ko-KR"),
      action: revisionMsg
    });

  } else {
    // Create Mode
    const newId = articles.length > 0 ? Math.max(...articles.map(a => a.id)) + 1 : 1;
    actionName = "신규 기사 초안 작성";
    
    art = {
      id: newId,
      title,
      subtitle,
      lead,
      content,
      category,
      categoryLabel: catLabels[category],
      date,
      status,
      image,
      author: {
        name: "홍길동",
        role: "취재기자",
        email: "gd.hong@baikalnews.com",
        bio: "바른 시각으로 우리 사회와 환경을 보도하는 저널리스트."
      },
      approver: (status === 'approved' || status === 'published') ? approver : null,
      byline: (status === 'approved' || status === 'published') ? `${approver} 기자` : "",
      draftedBy: "홍길동",
      approvedAt: (status === 'approved' || status === 'published') ? new Date().toISOString() : null,
      revisionHistory: [{
        date: new Date().toLocaleString("ko-KR"),
        action: `신규 초안 등록 (상태: ${status})`
      }],
      seoTitle,
      seoMeta,
      slug,
      isYMYL
    };
  }

  // Save via adapter
  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveArticle(art);
  }
  await logAudit(actionName, art.id, `제목: ${title} | 담당자 피드백: ${rejectionNote || '특이사항 없음'}`);
  
  alert("기사와 편집 설정이 정상적으로 저장되었습니다.");
  hideArticleForm();
}

// Soft delete
async function softDeleteArticleInForm() {
  if (!currentEditingId) return;
  
  if (confirm("본 기사를 아카이브 보관(Soft Delete) 상태로 전환하여 독자 사이트에서 숨기시겠습니까?")) {
    let art = null;
    if (window.SupabaseAdapter) {
      art = await window.SupabaseAdapter.fetchArticleById(currentEditingId);
    }
    if (art) {
      art.status = 'archived';
      if (!art.revisionHistory) art.revisionHistory = [];
      art.revisionHistory.push({
        date: new Date().toLocaleString("ko-KR"),
        action: "기사 아카이브 보관 처리 (휴지통 보냄)"
      });
      if (window.SupabaseAdapter) {
        await window.SupabaseAdapter.saveArticle(art);
      }
      await logAudit("기사 아카이브 보관", art.id, "기사를 비활성화하여 독자에게서 보이지 않게 처리함.");
    }
    hideArticleForm();
  }
}

// 5. AI Assisted Article Generation Engine (Simulated human-like drafts)
let activeAiMode = 'topic';
let generatedDraftData = null;

function switchAiMode(mode) {
  activeAiMode = mode;
  document.querySelectorAll(".ai-input-group").forEach(el => el.style.display = "none");
  document.getElementById(`ai-input-${mode}`).style.display = "block";
}

// Mock AI daily news database for angle suggester
const DAILY_MAJOR_NEWS = {
  T1: {
    headline: "친환경 화물 열차 노선 통합 운임 협상 개시",
    local: {
      title: "글로벌 철도 요금 개편 and 평택항 배후단지의 물류 다각화 방안",
      lead: "글로벌 연계 화물 철도망의 요금 개편이 본격적으로 추진됨에 따라, 평택 포승 배후 물류단지 기업들의 장기 대안 마련이 촉구됩니다.",
      body: `<h2>평택항 연계 대륙 물류망의 변동성 예측</h2>
<p>세계 대륙 철도 연합과의 요금 개편 회의가 본 궤도에 오름에 따라 블라디보스토크를 거쳐 유럽으로 나아가는 철도 운송 단가가 조정 국면을 맞았습니다. 이는 평택항을 기점으로 자동차 부품 및 무역 기자재를 납품해오던 로컬 공급망 기업들에게 직접적인 손익 변화를 의미합니다.</p>
<h2>로컬 친환경 물류 경쟁력 강화를 위한 대안</h2>
<p>전문가들은 이번 물류비 요금 협상 결과에 따라 장기 운송 계약 건들에 대한 손실 보전 장치를 마련해야 한다고 진단합니다. 동시에 친환경 철도 연계망 인프라 활성화를 통해 해운 탄소세 위기를 예방하는 로컬 다각화 노력이 필요한 시점입니다.</p>`
    },
    culture: {
      title: "기차 운임 조정 회의와 철도 물류망 주변 원주민 보호 구역 소사",
      lead: "대륙 철도망 운임 협상이 추진되는 한편, 이 철로 건설 과정에서 삶의 터전을 옮겨야 했던 원주민 공동체의 잊혀진 문화적 기억들이 재조명받고 있습니다.",
      body: `<h2>거대 인프라에 가려진 원주민의 역사</h2>
<p>글로벌 대륙 철도망은 동서양을 하나로 이은 인류의 획기적 발명품이지만, 노선 통과 구역 원주민 공동체에게는 강제 해체와 문화 융합의 뼈아픈 역사를 수반합니다.</p>
<h2>시간을 잇는 정신적 유대를 그리다</h2>
<p>오늘날 지역 사회의 문학계와 미술가들은 철길 위를 달리는 차가운 기차 소리 속에서 생태의 소중함과 구전 설화를 결합하는 보전 작업을 이어가고 있습니다. 이는 단순한 하드웨어 개발에 머물지 않고 문명과 조화를 이루는 지적인 태도입니다.</p>`
    },
    economy: {
      title: "글로벌 철도 단가 재협상과 지속 가능 원목 원자재 수출 경제성 분석",
      lead: "철도 단가 협상이 가동되면서 국내 목재 및 물류 배후단지 원자재 공급망 단가에 미칠 경제적 여파를 수치 분석해 봅니다.",
      body: `<h2>원자재 운임 상승 압박과 공급망 타격</h2>
<p>이번 대륙 노선의 운임비 증가는 지속 가능 인증 삼림 지대에서 임가공되는 원목 자원을 국내로 수입해오던 유통 경제성에 비상등을 켰습니다. 운임이 5% 이상 상승할 경우 대체 공급로의 타당성 조사가 불가피합니다.</p>
<h2>에코 자원 공급망 보전을 위한 재정 지출</h2>
<p>지자체 친환경 가공 물류 허브 지국에서는 친환경 단가 협정을 연계해 지속 가능 인증 원자재에 대해서는 할인을 제공하는 특별 생태 요금제를 제안하고 있습니다. 이는 자원 보존과 실리를 결합하는 에코 비즈니스의 좋은 단서입니다.</p>`
    }
  },
  T2: {
    headline: "도심지 열섬 현상 심화와 대기 질소산화물 감시 규제 논의",
    local: {
      title: "도심 대기 오염 여파에 대응하는 평택 환경 보전 연대 포럼",
      lead: "도심 대기 온난화 및 배기가스 노출 위험성이 고조되면서 평택항 친환경 모니터링 연대도 학술 포럼을 출범하고 연대 대응에 나섰습니다.",
      body: `<h2>도시 기후 변화 위기와 평택 환경 정책의 연계</h2>
<p>기후 변화로 가속화되는 지구적 열돔 현상은 경기 서해안 일대의 평균 기온 변화와 해수면 고도 변화에 무관하지 않다는 연구가 제기되었습니다. 로컬 기후 거버넌스는 이러한 기후 변화 현안을 정밀 검토 중입니다.</p>`
    },
    culture: {
      title: "[칼럼] 급격한 동절기 이상고온과 지역 축제 안전 대책의 긴급성",
      lead: "급격한 기온 상승으로 얼음 두께가 얇아지면서 지역 주민 공동체의 겨울 야외 빙판 행사 개최에 안전 비상이 걸렸습니다.",
      body: `<h2>빙판 안전성 감소에 따른 실천적 대책 마련</h2>
<p>수백 년 동안 얼어붙은 영롱한 파란 빙판 위에서 말달리기와 전통 활쏘기를 연마하던 지역 겨울 행사가 빙판 균열 위험으로 전격 연기 및 취소되고 있습니다. 이는 기후 이변이 원주민 고유 문화 상속을 어떻게 물리적으로 단절시키는지를 보여줍니다.</p>`
    },
    economy: {
      title: "지구 대기 정밀 모니터링 시장 개막과 국내 중소기업 환경 감시 기술 제휴 기회",
      lead: "도심지 대기 상태 측정을 위한 정밀 센서 및 IoT 관제 시장이 글로벌 탄소 중립 모니터링 투자 계획과 맞물려 한국 벤처 기술에 기회 요인으로 작용하고 있습니다.",
      body: `<h2>위성과 저전력 IoT 대기·기후 센서 비즈니스 개화</h2>
<p>도심지 대기 환경 정밀 모니터링용 기후 센서 구축비가 국외 환경 재단으로부터 대량 조달되면서, 국내 초정밀 IoT 장비 공급망들의 비즈니스 수출 통로 확보가 유력하게 대두됩니다.</p>`
    }
  }
};

function onMajorTopicChange(topicVal) {
  // Can adapt interface dynamically if needed
}

// Generate the draft
async function generateAiDraft() {
  document.getElementById("ai-empty-state").style.display = "none";
  document.getElementById("ai-draft-viewer").style.display = "none";
  document.getElementById("ai-loader").style.display = "flex";
  
  const loaderTitle = document.querySelector("#ai-loader h4");
  if (loaderTitle) loaderTitle.textContent = "AI 뉴스 초안 및 논조 분석 작업 중...";

  try {
    let headline = "";
    let lead = "";
    let body = "";
    let category = "culture";
    
    if (activeAiMode === 'topic') {
      const topic = document.getElementById("ai-topic-input").value.trim();
      category = document.getElementById("ai-topic-category").value;
      const selectedStyleId = document.getElementById("ai-style-select").value;
      
      if (!topic) {
        throw new Error("기사 주제 키워드를 입력해 주세요.");
      }
      
      let stylePrompt = "정직하고 깊이 있는 저널리즘 스타일로 작성해 주세요.";
      let fewShotPrompt = "";
      
      if (selectedStyleId) {
        const styles = await window.SupabaseAdapter.fetchWritingStyles();
        const style = styles.find(s => s.id === selectedStyleId);
        if (style) {
          stylePrompt = `
당신은 다음 스타일 가이드라인을 엄격하게 지켜 기사를 작성해야 합니다:
- 매체/논조 스타일: ${style.name}
- 주요 톤앤매너 설명: ${style.description}
- 반드시 준수해야 할 스타일 규칙:
${(style.styleRules || []).map(r => `  * ${r}`).join('\n')}
`;
          
          // Get few-shot samples
          const samples = await window.SupabaseAdapter.fetchWritingSamples(selectedStyleId);
          if (samples && samples.length > 0) {
            // Take up to 2 latest samples
            const latestSamples = samples.slice(0, 2);
            fewShotPrompt = `
아래는 당신이 모방해야 할 이 매체의 실제 기사 예시(Few-shot)입니다. 톤앤매너, 문체, 문장 구성, 헤드라인 느낌을 완벽하게 따라 하십시오.

${latestSamples.map((s, idx) => `
[기사 예시 ${idx + 1}]
- 제목: ${s.title}
- 본문 요약:
${s.content.substring(0, 800)}
---
`).join('\n')}
`;
          }
        }
      }
      
      const generationPrompt = `
제공된 주제와 지침을 바탕으로 신뢰감 있고 완성도 높은 뉴스 기사를 작성하십시오.

[작성할 기사 주제]
${topic}

[카테고리]
${category}

${fewShotPrompt}

[작성 지침]
반드시 다음 구조의 JSON 형식으로만 답변하십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 JSON 오브젝트 자체만 출력해야 합니다.
1. "title": 이 매체의 스타일을 완벽하게 따른 기사 제목 (오마이뉴스라면 따옴표를 활용한 서사체, 민들레라면 선명하고 날카로운 은유 등 스타일 반영)
2. "lead": 독자의 관심을 끄는 2~3문장의 흡입력 있는 리드 문단 (바이칼 뉴스 본문 구조에 적합한 형태)
3. "body": 2개 이상의 <h2> 소제목을 포함하고 적절한 <p> 단락들로 구성된 뉴스 본문 HTML 코드. 문장 어조 및 관점은 지정된 논조 스타일을 완벽하게 재현해야 합니다. (전체 분량 공백 제외 1500자 내외로 상세하게 작성)
`;
      
      const resultText = await callGeminiApi(generationPrompt, stylePrompt);
      let draftJson;
      try {
        const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        draftJson = JSON.parse(cleanedText);
      } catch (err) {
        console.error("Gemini output parsing failed. Raw text:", resultText);
        throw new Error("기사 초안 생성 결과 파싱에 실패했습니다: " + err.message);
      }
      
      headline = draftJson.title;
      lead = draftJson.lead;
      body = draftJson.body;
      
    } else if (activeAiMode === 'link') {
      const styleName = document.getElementById("ai-link-style-name").value.trim();
      const url = document.getElementById("ai-link-url").value.trim();
      const rawText = document.getElementById("ai-link-raw-text").value.trim();
      category = document.getElementById("ai-link-category").value;
      
      if (!styleName) {
        throw new Error("학습할 대상 매체/스타일 명칭을 입력해 주세요. (예: 오마이뉴스)");
      }
      if (!url && !rawText) {
        throw new Error("출처 링크(URL) 또는 기사 본문 텍스트 중 하나는 반드시 기재해야 합니다.");
      }
      
      let articleText = rawText;
      if (!articleText && url) {
        if (loaderTitle) loaderTitle.textContent = "외부 링크에서 본문을 크롤링하고 있습니다 (CORS Proxy 활용)...";
        try {
          articleText = await scrapeExternalLink(url);
        } catch (err) {
          throw new Error("CORS Proxy를 통한 외부 기사 크롤링에 실패했습니다. 본문 텍스트를 하단에 직접 복사해서 입력해 주세요.");
        }
      }
      
      if (!articleText || articleText.length < 50) {
        throw new Error("가져온 기사 본문이 너무 짧거나 비어 있습니다. 기사 본문을 직접 붙여넣어 주세요.");
      }
      
      // Step 1: Learn the style
      if (loaderTitle) loaderTitle.textContent = `'${styleName}' 스타일을 분석하고 학습 가이드를 도출 중...`;
      const learningResult = await learnWritingStyle(styleName, url, articleText);
      
      // Load newly updated styles to select list
      await loadWritingStyles();
      
      // Step 2: Generate alternative article with similar tone but slightly different content/focus
      if (loaderTitle) loaderTitle.textContent = `학습 완료! '${styleName}' 스타일로 유사한 새 기사를 집필하는 중...`;
      
      const stylePrompt = `
당신은 다음 스타일 가이드라인을 엄격하게 지켜 기사를 작성해야 합니다:
- 매체/논조 스타일: ${styleName}
- 주요 톤앤매너 설명: ${learningResult.description}
- 반드시 준수해야 할 스타일 규칙:
${(learningResult.rules || []).map(r => `  * ${r}`).join('\n')}
`;

      const rephrasePrompt = `
원천 기사 주제: "${learningResult.title}"

위 원천 기사의 핵심 사실관계나 주제와 유사하지만, 다른 각도(또는 다른 인물, 다른 지역, 다른 관점)에서 서술하는 새로운 독창적 기사를 작성하십시오. 절대 원본을 그대로 베껴서는 안 되며, 논조와 어조만 완벽히 모방하십시오.

[작성 지침]
반드시 다음 구조의 JSON 형식으로만 답변하십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 JSON 오브젝트 자체만 출력해야 합니다.
1. "title": 원천 기사의 톤앤매너를 본뜬 새로운 독창적 기사 제목
2. "lead": 독자의 관심을 이끄는 2~3문장의 리드 문단
3. "body": 2개 이상의 <h2> 소제목과 <p> 단락들로 구성된 뉴스 본문 HTML 코드 (오마이뉴스라면 경어체/독백체, 민들레라면 선명한 단어 사용 등 스타일 반영)
`;

      const resultText = await callGeminiApi(rephrasePrompt, stylePrompt);
      let rephrasedJson;
      try {
        const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        rephrasedJson = JSON.parse(cleanedText);
      } catch (err) {
        console.error("Gemini output parsing failed:", resultText);
        throw new Error("대안 기사 초안 생성 결과 파싱에 실패했습니다: " + err.message);
      }
      
      headline = rephrasedJson.title;
      lead = rephrasedJson.lead;
      body = rephrasedJson.body;
      
    } else if (activeAiMode === 'angles') {
      const major = document.getElementById("ai-major-topic-select").value;
      const angle = document.querySelector('input[name="ai-angle"]:checked').value;
      
      const source = DAILY_MAJOR_NEWS[major] || DAILY_MAJOR_NEWS.T1;
      const contentData = source[angle] || source.local;
      
      category = angle === 'local' ? 'local' : (angle === 'culture' ? 'culture' : 'economy');
      headline = contentData.title;
      lead = contentData.lead;
      body = contentData.body;
    }

    // Build generated object variables
    generatedDraftData = {
      title: headline,
      subtitle: `${category.toUpperCase()} 부문 심층 인공지능 초안`,
      lead: lead,
      content: body,
      category: category,
      date: new Date().toLocaleDateString("ko-KR").replace(/\s/g, '').slice(0, -1),
      image: "images/news_editorial.png",
      seoTitle: `${headline} - 바이칼 뉴스`,
      seoMeta: lead,
      slug: `ai-draft-${Date.now()}`
    };

    // Render inside generated panel UI
    document.getElementById("ai-out-headline").textContent = headline;
    document.getElementById("ai-out-lead").textContent = lead;
    document.getElementById("ai-out-body").innerHTML = body;
    document.getElementById("ai-out-seo-title").textContent = generatedDraftData.seoTitle;
    document.getElementById("ai-out-seo-meta").textContent = generatedDraftData.seoMeta;
    document.getElementById("ai-out-slug").textContent = generatedDraftData.slug;
    
    document.getElementById("ai-loader").style.display = "none";
    document.getElementById("ai-draft-viewer").style.display = "block";

  } catch (err) {
    console.error("AI Generation Error:", err);
    document.getElementById("ai-loader").style.display = "none";
    document.getElementById("ai-empty-state").style.display = "block";
    alert("AI 초안 생성 실패: " + err.message);
  }
}

// Transfer AI draft to form editor
function transferAiDraftToEditor() {
  if (!generatedDraftData) return;

  switchTab('articles');
  showArticleCreateForm();

  // Populate editor form with AI draft data
  document.getElementById("form-title").value = generatedDraftData.title;
  document.getElementById("form-subtitle").value = generatedDraftData.subtitle;
  document.getElementById("form-lead").value = generatedDraftData.lead;
  document.getElementById("form-content").value = generatedDraftData.content;
  document.getElementById("form-category").value = generatedDraftData.category;
  document.getElementById("form-date").value = generatedDraftData.date;
  document.getElementById("form-image").value = generatedDraftData.image;
  document.getElementById("form-seo-title").value = generatedDraftData.seoTitle;
  document.getElementById("form-seo-meta").value = generatedDraftData.seoMeta;
  document.getElementById("form-slug").value = generatedDraftData.slug;
  
  // Set draft state
  document.getElementById("form-status").value = "draft";
  onStatusChangeInForm("draft");
  
  alert("인공지능 초안 데이터가 편집기 폼으로 안전하게 전송되었습니다. 오탈자를 다듬고 추가 취재를 반영한 후 검토 요청 및 최종 데스크 서명을 획득하세요.");
}

// 6. Homepage News Curation Panel
async function populateCurationDropdowns() {
  const publishedSelects = [
    "curate-hero",
    "curate-pick-1", "curate-pick-2", "curate-pick-3",
    "curate-pop-1", "curate-pop-2", "curate-pop-3"
  ];
  
  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  const published = articles.filter(a => a.status === 'published');

  publishedSelects.forEach(selectId => {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;
    
    if (published.length === 0) {
      selectEl.innerHTML = `<option value="">발행된 기사가 없습니다.</option>`;
      return;
    }

    // Populate option tags
    let optionsHTML = '<option value="">-- 기사를 선택해 주세요 --</option>';
    published.forEach(art => {
      optionsHTML += `<option value="${art.id}">[ID: #${art.id}] [${art.category.toUpperCase()}] ${art.title}</option>`;
    });
    selectEl.innerHTML = optionsHTML;
  });

  // Load currently set values
  let curation = {};
  if (window.SupabaseAdapter) {
    curation = await window.SupabaseAdapter.fetchCuration();
  }
  
  if (curation.featuredHeroId) document.getElementById("curate-hero").value = curation.featuredHeroId;
  
  if (curation.editorsPicksIds) {
    if (curation.editorsPicksIds[0]) document.getElementById("curate-pick-1").value = curation.editorsPicksIds[0];
    if (curation.editorsPicksIds[1]) document.getElementById("curate-pick-2").value = curation.editorsPicksIds[1];
    if (curation.editorsPicksIds[2]) document.getElementById("curate-pick-3").value = curation.editorsPicksIds[2];
  }

  if (curation.popularReadsIds) {
    if (curation.popularReadsIds[0]) document.getElementById("curate-pop-1").value = curation.popularReadsIds[0];
    if (curation.popularReadsIds[1]) document.getElementById("curate-pop-2").value = curation.popularReadsIds[1];
    if (curation.popularReadsIds[2]) document.getElementById("curate-pop-3").value = curation.popularReadsIds[2];
  }
}

async function saveCurationSettings() {
  const heroId = parseInt(document.getElementById("curate-hero").value, 10);
  
  const pick1 = parseInt(document.getElementById("curate-pick-1").value, 10);
  const pick2 = parseInt(document.getElementById("curate-pick-2").value, 10);
  const pick3 = parseInt(document.getElementById("curate-pick-3").value, 10);
  
  const pop1 = parseInt(document.getElementById("curate-pop-1").value, 10);
  const pop2 = parseInt(document.getElementById("curate-pop-2").value, 10);
  const pop3 = parseInt(document.getElementById("curate-pop-3").value, 10);

  if (isNaN(heroId)) {
    alert("최소한 메인 추천 탑 뉴스는 1건 지정해야 홈화면 배포가 가능합니다.");
    return;
  }

  const newCuration = {
    featuredHeroId: heroId,
    editorsPicksIds: [pick1, pick2, pick3].filter(id => !isNaN(id)),
    popularReadsIds: [pop1, pop2, pop3].filter(id => !isNaN(id)),
    pinnedIds: []
  };

  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveCuration(newCuration);
  }
  await logAudit("홈페이지 큐레이션 개정", null, `헤드라인 기사 ID: #${heroId}로 정렬 배포함.`);
  alert("홈페이지 뉴스 배치 큐레이션이 정상 배포되었습니다. 독자 사이트에서 즉시 노출이 갱신됩니다.");
}

// 7. Static Page Management Module
async function switchPageTab(key, btnEl) {
  currentStaticPageKey = key;
  
  // Highlight active sub-tab
  document.querySelectorAll(".page-tab-btn").forEach(btn => btn.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  const titleMap = {
    about: "회사 소개",
    'editorial-policy': "편집 규약",
    'privacy-policy': "개인정보처리방침",
    terms: "이용약관",
    corrections: "오보 정정 및 개정 정책",
    contact: "제보 및 문의"
  };

  document.getElementById("page-editor-title").textContent = titleMap[key] || "정적 페이지 편집";
  await loadStaticPageContent();
}

async function loadStaticPageContent() {
  let overrides = {};
  if (window.SupabaseAdapter) {
    overrides = await window.SupabaseAdapter.fetchStaticPages();
  }
  const editorEl = document.getElementById("page-html-editor");
  
  if (editorEl) {
    // Load custom text if override exists, otherwise load default static template fallback
    editorEl.value = overrides[currentStaticPageKey] || DEFAULT_PAGE_CONTENTS[currentStaticPageKey] || "";
  }
}

async function saveStaticPages() {
  const text = document.getElementById("page-html-editor").value;

  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveStaticPage(currentStaticPageKey, text);
  }
  
  await logAudit("정적 페이지 법률선언 개정", null, `문서 키: ${currentStaticPageKey} 의 HTML 내용을 수정함.`);
  alert(`정적 문서 '${currentStaticPageKey.toUpperCase()}' 변경사항이 정상 공시되었습니다.`);
}

// 8. Media Library Selector & simulated image prompts generator
let modalMode = 'select'; // select | generate

function openMediaLibraryModal() {
  document.getElementById("media-library-modal").classList.add("active");
  switchModalMediaTab('select');
  renderMediaLibraryGrid();
}

function closeMediaLibraryModal() {
  document.getElementById("media-library-modal").classList.remove("active");
}

function switchModalMediaTab(mode) {
  modalMode = mode;
  document.getElementById("modal-media-select").style.display = mode === 'select' ? 'block' : 'none';
  document.getElementById("modal-media-generate").style.display = mode === 'generate' ? 'block' : 'none';
  
  const selectBtn = document.getElementById("modal-tab-select");
  const genBtn = document.getElementById("modal-tab-generate");
  
  if (mode === 'select') {
    selectBtn.className = "btn-admin btn-admin-primary";
    genBtn.className = "btn-admin btn-admin-secondary";
  } else {
    selectBtn.className = "btn-admin btn-admin-secondary";
    genBtn.className = "btn-admin btn-admin-primary";
  }
}

const DEFAULT_MEDIA_ASSETS = [
  "images/news_editorial.png",
  "images/culture_shamanism.png",
  "images/culture_art.png",
  "images/local_center.png",
  "images/local_port.png",
  "images/economy_eco.png",
  "images/economy_energy.png",
  "images/opinion_editor.png",
  "images/opinion_climate.png",
  "images/tech_satellite.png",
  "images/tech_archiving.png"
];

function renderMediaLibraryGrid() {
  const gridEl = document.getElementById("modal-media-grid");
  if (!gridEl) return;

  // Load currently available images
  const mediaList = JSON.parse(localStorage.getItem("baikal_media_library") || JSON.stringify(DEFAULT_MEDIA_ASSETS));
  
  gridEl.innerHTML = mediaList.map(src => {
    const filename = src.substring(src.lastIndexOf('/') + 1);
    const isSelected = selectedMediaImage === src;
    return `
      <div class="media-card ${isSelected ? 'selected' : ''}" onclick="selectMediaCard(this, '${src}')">
        <img src="https://baikalnews.com/${src}" class="media-img" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
        <div class="media-card-info">${filename}</div>
      </div>
    `;
  }).join('');
}

function selectMediaCard(cardEl, src) {
  selectedMediaImage = src;
  document.querySelectorAll(".media-card").forEach(c => c.classList.remove("selected"));
  cardEl.classList.add("selected");
}

function confirmSelectedImage() {
  if (!selectedMediaImage) {
    alert("라이브러리에서 적용할 이미지를 먼저 탭해 주세요.");
    return;
  }
  document.getElementById("form-image").value = selectedMediaImage;
  closeMediaLibraryModal();
  alert(`기사 대표 이미지로 '${selectedMediaImage}' 파일이 적용되었습니다.`);
}

function triggerAiImageGeneration() {
  const prompt = document.getElementById("ai-image-prompt").value;
  if (!prompt) {
    alert("프롬프트를 간략하게 입력해 주세요.");
    return;
  }

  const loader = document.getElementById("ai-image-loader");
  loader.style.display = "flex";

  setTimeout(() => {
    loader.style.display = "none";
    
    // Simulate generating a new asset from the prompt
    const newAssetSrc = `images/news_editorial.png`; // Fallback asset
    
    // Register into the list
    const mediaList = JSON.parse(localStorage.getItem("baikal_media_library") || JSON.stringify(DEFAULT_MEDIA_ASSETS));
    
    const simulatedFilename = `images/ai_gen_${Date.now()}.png`;
    mediaList.unshift(simulatedFilename);
    localStorage.setItem("baikal_media_library", JSON.stringify(mediaList));

    selectedMediaImage = simulatedFilename;
    switchModalMediaTab('select');
    renderMediaLibraryGrid();
    
    alert(`AI 이미지 엔진: 프롬프트에 입각한 정갈한 에디토리얼 이미지가 빌드되어 '${simulatedFilename}' 파일명으로 미디어 라이브러리에 자동 보관되었습니다.`);
  }, 1800);
}

// 9. Supabase settings configuration forms logic
function loadSupabaseConfigForm() {
  const url = localStorage.getItem("baikal_supabase_url") || "";
  const key = localStorage.getItem("baikal_supabase_key") || "";
  
  document.getElementById("db-url").value = url;
  document.getElementById("db-anon-key").value = key;
  
  updateSupabaseStatusUI();
}

function updateSupabaseStatusUI() {
  const badge = document.getElementById("db-status-badge");
  if (!badge) return;
  
  if (window.SupabaseAdapter && window.SupabaseAdapter.isConfigured()) {
    badge.textContent = "연결됨 (원격 데이터베이스 모드 작동 중)";
    badge.style.backgroundColor = "var(--status-published)";
  } else {
    badge.textContent = "오프라인 (로컬 브라우저 저장소 모드 작동 중)";
    badge.style.backgroundColor = "var(--status-draft)";
  }
}

async function saveSupabaseConfig() {
  const url = document.getElementById("db-url").value.trim();
  const key = document.getElementById("db-anon-key").value.trim();
  
  if (!url || !key) {
    alert("Supabase URL과 Anon Key를 모두 입력하십시오.");
    return;
  }
  
  localStorage.setItem("baikal_supabase_url", url);
  localStorage.setItem("baikal_supabase_key", key);
  
  // Reinitialize client
  window.supabaseClient = null;
  
  // Sync to local
  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.syncLocalArticles();
  }
  
  updateSupabaseStatusUI();
  alert("수파베이스(Supabase) 연동 정보가 설정되었습니다. 원격 데이터베이스로부터 최신 기사 레코드를 동기화했습니다.");
  await logAudit("데이터베이스 접속 설정", null, `원격 프로젝트 URL: ${url} 등록함.`);
}

async function testSupabaseConnection() {
  const url = document.getElementById("db-url").value.trim();
  const key = document.getElementById("db-anon-key").value.trim();
  
  if (!url || !key) {
    alert("테스트 전에 Supabase URL과 Key를 입력하십시오.");
    return;
  }
  
  if (typeof supabase === 'undefined') {
    alert("Supabase 라이브러리를 로드하지 못했습니다.");
    return;
  }
  
  try {
    const tempClient = supabase.createClient(url, key);
    // Attempt simple query
    const { data, error } = await tempClient
      .from('articles')
      .select('id')
      .limit(1);
      
    if (error) throw error;
    alert("연결 테스트 성공! 수파베이스(Supabase) 데이터베이스와 정상적으로 양방향 통신할 수 있습니다.");
  } catch (err) {
    console.error(err);
    alert(`연결 실패: ${err.message || err}\n테이블을 생성하고, API 키와 URL이 정확한지 확인하십시오.`);
  }
}

async function disconnectSupabase() {
  if (confirm("수파베이스(Supabase) 연결을 해제하시겠습니까? 데이터는 삭제되지 않으며, 즉시 로컬 브라우저 저장소 백업 모드로 전환됩니다.")) {
    localStorage.removeItem("baikal_supabase_url");
    localStorage.removeItem("baikal_supabase_key");
    window.supabaseClient = null;
    
    updateSupabaseStatusUI();
    alert("원격 연동이 해제되었습니다. 로컬 기기 저장소 모드로 복귀했습니다.");
    await logAudit("데이터베이스 접속 해제", null, "Supabase 원격 모드를 비활성화하고 로컬로 복귀함.");
  }
}

// ==========================================================
// Gemini API Settings & AI Writing Styles Learning / Generation Logic
// ==========================================================

function toggleApiConfig() {
  const content = document.getElementById("api-config-content");
  const icon = document.getElementById("api-config-toggle-icon");
  if (content.style.display === "none" || !content.style.display) {
    content.style.display = "block";
    icon.textContent = "▲";
  } else {
    content.style.display = "none";
    icon.textContent = "▼";
  }
}

function saveGeminiApiKey() {
  const keyInput = document.getElementById("ai-gemini-key").value.trim();
  if (keyInput) {
    localStorage.setItem("baikal_gemini_key", keyInput);
    document.getElementById("api-key-status").textContent = "API Key가 안전하게 저장되었습니다.";
    document.getElementById("api-key-status").style.color = "#10b981"; // green
  } else {
    localStorage.removeItem("baikal_gemini_key");
    document.getElementById("api-key-status").textContent = "API Key가 제거되었습니다.";
    document.getElementById("api-key-status").style.color = "#ef4444"; // red
  }
}

function loadGeminiApiKey() {
  const savedKey = localStorage.getItem("baikal_gemini_key");
  const keyInput = document.getElementById("ai-gemini-key");
  const statusSpan = document.getElementById("api-key-status");
  if (savedKey && keyInput && statusSpan) {
    keyInput.value = savedKey;
    statusSpan.textContent = "API Key 연동 중";
    statusSpan.style.color = "#10b981"; // green
  } else if (keyInput && statusSpan) {
    keyInput.value = "";
    statusSpan.textContent = "API Key가 설정되지 않았습니다. AI 기능을 사용하려면 등록하십시오.";
    statusSpan.style.color = "#fbbf24"; // yellow
  }
}

let loadedWritingStyles = [];

async function loadWritingStyles() {
  const select = document.getElementById("ai-style-select");
  const help = document.getElementById("ai-style-status-help");
  
  if (!select) return;
  
  try {
    loadedWritingStyles = await window.SupabaseAdapter.fetchWritingStyles();
    
    // Clear select, keep only first option
    select.innerHTML = '<option value="">-- 기본 스타일 (중립) --</option>';
    
    if (loadedWritingStyles && loadedWritingStyles.length > 0) {
      loadedWritingStyles.forEach(style => {
        const option = document.createElement("option");
        option.value = style.id;
        option.textContent = `${style.name} (${style.styleRules ? style.styleRules.length : 0}개 규칙)`;
        select.appendChild(option);
      });
      help.textContent = `현재 ${loadedWritingStyles.length}개의 학습된 스타일이 등록되어 있습니다.`;
      help.style.color = "var(--admin-text-secondary)";
    } else {
      help.textContent = "아직 등록된 학습 스타일이 없습니다. '외부 기사/링크 재구성' 탭에서 학습을 먼저 진행해 주세요.";
      help.style.color = "#fbbf24";
    }
  } catch (err) {
    console.error("Failed to load writing styles:", err);
    help.textContent = "스타일을 불러오는 중 오류가 발생했습니다.";
    help.style.color = "#ef4444";
  }
}

function onStyleSelectChange(styleId) {
  // Can expand logic if needed
}

// CORS Proxy Scraper helper
async function scrapeExternalLink(url) {
  if (!url) return "";
  try {
    // Use Allorigins proxy to fetch raw HTML (cors bypass)
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("HTTP error " + response.status);
    const html = await response.text();
    
    // Parse HTML to extract text content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    // Extract main text: clean tags like script, style, nav, footer
    const removes = doc.querySelectorAll("script, style, nav, footer, header, iframe, noscript");
    removes.forEach(el => el.remove());
    
    // Target main article elements if possible (general news sites)
    let bodyText = "";
    const articleSelectors = [
      "article", ".article", "#articleBody", "#article_body", 
      ".article_body", ".news_body", "#news_body_area", ".story-content",
      ".view_txt", ".article-body", "[itemprop='articleBody']", "main"
    ];
    
    let mainEl = null;
    for (const selector of articleSelectors) {
      mainEl = doc.querySelector(selector);
      if (mainEl) break;
    }
    
    if (mainEl) {
      bodyText = mainEl.innerText || mainEl.textContent || "";
    } else {
      bodyText = doc.body.innerText || doc.body.textContent || "";
    }
    
    // Simple text cleanup: excessive whitespaces
    return bodyText.replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.error("CORS Scraper error for URL: " + url, err);
    throw err;
  }
}

// Gemini API Caller
async function callGeminiApi(prompt, systemInstruction = "") {
  const apiKey = localStorage.getItem("baikal_gemini_key");
  if (!apiKey) {
    throw new Error("Gemini API Key가 등록되지 않았습니다. AI 집필실 상단에서 먼저 등록해 주세요.");
  }
  
  // Using gemini-2.5-flash which has system instruction support
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ]
  };
  
  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [
        { text: systemInstruction }
      ]
    };
  }
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 호출 실패 (HTTP ${response.status}): ${errText}`);
  }
  
  const data = await response.json();
  if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
    return data.candidates[0].content.parts[0].text;
  } else {
    throw new Error("Gemini API가 올바른 응답 양식을 반환하지 않았습니다.");
  }
}

// Learning style loop
async function learnWritingStyle(styleName, sourceUrl, textContent) {
  if (!styleName || !textContent) {
    throw new Error("스타일 이름과 분석할 본문 텍스트가 모두 필요합니다.");
  }
  
  // Step 1: Query existing styles to check if styleName already exists
  const styles = await window.SupabaseAdapter.fetchWritingStyles();
  let existingStyle = styles.find(s => s.name.trim() === styleName.trim());
  
  // Step 2: Use Gemini to analyze the writing style
  const analysisPrompt = `
당신은 베테랑 언론사 데스크이자 문체 분석가입니다. 아래 제공되는 기사 본문 텍스트를 정밀 분석하여, 작성 기자가 사용하는 독특한 문체적 특징(스타일 가이드라인)을 도출하십시오.

[기사 본문]
${textContent}

[분석 지침]
다음 4가지 요소를 세밀하게 도출하여 JSON 형식으로만 답변해주십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 유효한 JSON 오브젝트만 반환해야 합니다.

1. "description": 이 글의 전체적인 논조와 어조에 대한 2~3문장 요약. (예: 진보 성향의 매체로, 권력 비판적이며 지적이고 선명한 어조를 가집니다.)
2. "rules": 기사 작성 시 지켜야 할 구체적인 문체/어조/서사 특징 규칙들의 리스트 (최소 5개 이상). 각 규칙은 짧고 가독성 높게 작성하십시오. (예: ["따옴표를 활용한 대화체 제목 선호", "일상의 현장 스케치로 서사 시작", "단정적이면서 감정적인 수식어 절제", "대안적이고 시민 연대를 호소하는 결론"])
3. "title": 이 기사의 원래 제목 (도출하거나 분석해서 작성)
4. "summary": 이 기사의 간략한 팩트/내용 요약
`;

  const analysisResultText = await callGeminiApi(analysisPrompt, "You are a professional writing style analyzer. Answer strictly in JSON format matching the specifications.");
  
  let analysisJson;
  try {
    const cleanedText = analysisResultText.replace(/```json/g, '').replace(/```/g, '').trim();
    analysisJson = JSON.parse(cleanedText);
  } catch (err) {
    console.error("Gemini JSON parse failed. Raw response:", analysisResultText);
    throw new Error("스타일 분석 결과 파싱에 실패했습니다: " + err.message);
  }
  
  let styleId;
  if (existingStyle) {
    styleId = existingStyle.id;
    
    // Merge rules (avoid duplicates)
    const currentRules = existingStyle.styleRules || [];
    const newRules = analysisJson.rules || [];
    const mergedRules = Array.from(new Set([...currentRules, ...newRules]));
    
    existingStyle.description = analysisJson.description || existingStyle.description;
    existingStyle.styleRules = mergedRules;
    
    await window.SupabaseAdapter.saveWritingStyle(existingStyle);
  } else {
    styleId = crypto.randomUUID ? crypto.randomUUID() : 'style-' + Date.now();
    const newStyle = {
      id: styleId,
      name: styleName,
      description: analysisJson.description || `${styleName} 기사 스타일`,
      styleRules: analysisJson.rules || []
    };
    await window.SupabaseAdapter.saveWritingStyle(newStyle);
  }
  
  // Step 3: Save writing sample as few-shot data
  const sampleId = crypto.randomUUID ? crypto.randomUUID() : 'sample-' + Date.now();
  const newSample = {
    id: sampleId,
    styleId: styleId,
    url: sourceUrl || "",
    title: analysisJson.title || "분석된 기사",
    content: textContent.substring(0, 1500),
    analysis: JSON.stringify(analysisJson.rules || []),
    createdAt: new Date().toISOString()
  };
  await window.SupabaseAdapter.saveWritingSample(newSample);
  
  return {
    styleId: styleId,
    description: analysisJson.description,
    rules: analysisJson.rules,
    title: analysisJson.title
  };
}
