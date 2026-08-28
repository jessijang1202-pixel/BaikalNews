// Baikal News - Admin CMS Javascript Logic
document.addEventListener("DOMContentLoaded", () => {
  initAdminAuth();
  setupEventListeners();
  loadGeminiApiKey();
});

// 0. Login gate (client-side only: validated against the registered admin account list)
const DEFAULT_ADMINS = [
  { name: "최상락", email: "baikalnews.choi@gmail.com", password: "815!815" },
  { name: "장승희", email: "baikalnews.jang@gmail.com", password: "815!815" }
];

function getAdmins() {
  let admins = JSON.parse(localStorage.getItem("baikal_admins") || "null");
  if (!admins) {
    admins = DEFAULT_ADMINS;
    localStorage.setItem("baikal_admins", JSON.stringify(admins));
  }
  return admins;
}

function saveAdmins(admins) {
  localStorage.setItem("baikal_admins", JSON.stringify(admins));
}

function getAdminSession() {
  try {
    return JSON.parse(localStorage.getItem("baikal_admin_session") || "null");
  } catch (e) {
    return null;
  }
}

function initAdminAuth() {
  // Unconditional, on every page load -- not just after a fresh login. A
  // returning admin with an already-persisted session skips handleAdminLogin()
  // entirely (goes straight to showAdminApp() below), so a reset placed only
  // inside handleAdminLogin() never ran for that far more common case,
  // leaving whatever the browser autofilled into the hidden login form as
  // the last thing Chrome saw -- which is what kept re-triggering the
  // "update saved password?" prompt on unrelated later actions.
  const loginFormEl = document.getElementById("admin-login-form");
  if (loginFormEl) loginFormEl.reset();

  const session = getAdminSession();
  if (session) {
    showAdminApp(session);
  } else {
    showLoginScreen();
  }

  const loginForm = document.getElementById("admin-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleAdminLogin();
    });
  }
}

function showLoginScreen() {
  document.getElementById("admin-login-screen").style.display = "flex";
  document.getElementById("admin-app").style.display = "none";
}

async function showAdminApp(session) {
  document.getElementById("admin-login-screen").style.display = "none";
  document.getElementById("admin-app").style.display = "";

  const labelEl = document.getElementById("sidebar-user-label");
  if (labelEl) labelEl.textContent = `로그인 사용자: ${session.name}`;
  const nameEl = document.getElementById("header-profile-name");
  if (nameEl) nameEl.textContent = session.name;
  const roleEl = document.getElementById("header-profile-role");
  if (roleEl) {
    const roleLabel = session.name === "최상락" ? "발행인"
      : session.name === "장승희" ? "편집인"
      : "최고 관리자";
    roleEl.textContent = roleLabel;
  }

  await initAdminDashboard();
}

async function handleAdminLogin() {
  const name = document.getElementById("login-name").value.trim();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!name || !email || !password) return;

  const matched = getAdmins().find(a =>
    a.name === name && a.email.toLowerCase() === email.toLowerCase() && a.password === password
  );

  if (!matched) {
    alert("등록된 관리자 정보와 일치하지 않습니다. 이름·이메일·비밀번호를 확인해 주세요.");
    return;
  }

  const session = { name: matched.name, email: matched.email, loginAt: new Date().toISOString() };
  localStorage.setItem("baikal_admin_session", JSON.stringify(session));

  // The login form stays in the DOM (just hidden) after this -- if its
  // password field kept its typed value, Chrome's "update saved password?"
  // heuristic can fire on ANY later, unrelated form submit anywhere on the
  // page (e.g. saving an expense edit), since it scans the whole document
  // for a filled password field rather than just the form actually
  // submitted. Clearing it here removes that trigger.
  const loginFormEl = document.getElementById("admin-login-form");
  if (loginFormEl) loginFormEl.reset();

  await showAdminApp(session);
  await logAudit("관리자 로그인", null, `${matched.name} (${matched.email}) 님이 로그인했습니다.`);
}

function handleAdminLogout() {
  localStorage.removeItem("baikal_admin_session");
  location.reload();
}

// 관리자 계정 관리 (Admin account management tab)
function renderAdminsList() {
  const tbody = document.getElementById("admins-table-body");
  if (!tbody) return;

  const admins = getAdmins();
  tbody.innerHTML = admins.map((a, i) => `
    <tr>
      <td>${a.name}</td>
      <td>${a.email}</td>
      <td><button type="button" class="btn-admin btn-admin-danger" onclick="deleteAdmin(${i})">삭제</button></td>
    </tr>
  `).join("");
}

async function addAdmin() {
  const nameEl = document.getElementById("new-admin-name");
  const emailEl = document.getElementById("new-admin-email");
  const passwordEl = document.getElementById("new-admin-password");

  const name = nameEl.value.trim();
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  if (!name || !email || !password) {
    alert("이름, 이메일, 비밀번호를 모두 입력하세요.");
    return;
  }

  const admins = getAdmins();
  if (admins.some(a => a.email.toLowerCase() === email.toLowerCase())) {
    alert("이미 등록된 이메일입니다.");
    return;
  }

  admins.push({ name, email, password });
  saveAdmins(admins);
  renderAdminsList();

  nameEl.value = "";
  emailEl.value = "";
  passwordEl.value = "";

  await logAudit("관리자 계정 추가", null, `${name} (${email}) 계정이 추가되었습니다.`);
}

async function deleteAdmin(index) {
  const admins = getAdmins();
  const target = admins[index];
  if (!target) return;

  if (admins.length <= 1) {
    alert("최소 1명 이상의 관리자 계정이 필요합니다.");
    return;
  }
  if (!confirm(`${target.name} (${target.email}) 계정을 삭제하시겠습니까?`)) return;

  admins.splice(index, 1);
  saveAdmins(admins);
  renderAdminsList();

  await logAudit("관리자 계정 삭제", null, `${target.name} (${target.email}) 계정이 삭제되었습니다.`);
}

// Global state variables
let currentEditingId = null;
let currentStaticPageKey = 'about';
let selectedMediaImage = '';

// Default static contents (as backup fallback for the page manager editor)
// Mirrors the real, currently-live content of each public page's content block,
// so the admin editor opens showing exactly what readers see.
const DEFAULT_PAGE_CONTENTS = {
  about: `<section class="about-hero">
  <span class="kicker">회사 소개</span>
  <h1>바이칼 호수처럼, 깊고 투명한 세상을 향합니다</h1>
  <p>바이칼미디어그룹은 지역과 세계를 잇는 소식을 정확하고 투명하게 전달하는 것을 목표로 합니다. 두꺼운 눈 아래에서도 에메랄드빛으로 맑게 비치는 바이칼의 얼음처럼, 우리는 겉으로 드러나지 않는 이야기까지 가장 깊은 곳부터 들여다봅니다.</p>
</section>

<section class="about-hero-image">
  <img src="images/baikal_ice.png" alt="바이칼뉴스" fetchpriority="high" decoding="async">
</section>

<section class="about-values">
  <div class="value-card">
    <div class="value-icon"></div>
    <h3>투명성</h3>
    <p>취재 과정과 정보의 출처를 가능한 한 명확히 공개하며, 오보 발생 시 정정 이력을 기사 하단에 상시 공시합니다.</p>
  </div>
  <div class="value-card">
    <div class="value-icon"></div>
    <h3>깊이</h3>
    <p>세계에서 가장 깊은 호수처럼, 단순한 사실 나열을 넘어 사건 이면의 맥락과 원인을 끝까지 추적합니다.</p>
  </div>
  <div class="value-card">
    <div class="value-icon"></div>
    <h3>절제된 신뢰</h3>
    <p>자극적이고 선정적인 보도를 지양하며, 오직 취재원 확인과 편집국 교차 검수를 거친 인간 기자의 글만을 싣습니다.</p>
  </div>
</section>

<section class="about-stats">
  <div class="stat">
    <div class="stat-value">2026년 7월 11일</div>
    <div class="stat-label">창간일</div>
  </div>
  <div class="stat">
    <div class="stat-value">5개</div>
    <div class="stat-label">취재 부문</div>
  </div>
  <div class="stat">
    <div class="stat-value">2022년 12월 12일</div>
    <div class="stat-label">등록일</div>
  </div>
</section>

<section class="about-team">
  <h2>편집진 소개</h2>
  <div class="team-grid">
    <div class="team-item">
      <h4>최상락</h4>
      <p class="team-role">발행인</p>
      <p>바른 언론을 지향하며, 모든 보도의 최종 편집 검수와 승인을 담당합니다.</p>
    </div>
    <div class="team-item">
      <h4>장승희</h4>
      <p class="team-role">편집인</p>
      <p>바른 언론을 지향하며, 모든 보도의 최종 편집 검수와 승인을 담당합니다.</p>
    </div>
  </div>
</section>

<section class="about-pubinfo">
  <h2>발행 정보</h2>
  <div class="pubinfo-grid">
    <div class="pubinfo-item"><span class="pubinfo-label">발행인</span><span class="pubinfo-value">최상락</span></div>
    <div class="pubinfo-item"><span class="pubinfo-label">편집인</span><span class="pubinfo-value">장승희</span></div>
    <div class="pubinfo-item"><span class="pubinfo-label">청소년보호책임자</span><span class="pubinfo-value">최상락</span></div>
    <div class="pubinfo-item"><span class="pubinfo-label">등록번호</span><span class="pubinfo-value">경기-아53480</span></div>
    <div class="pubinfo-item"><span class="pubinfo-label">등록일</span><span class="pubinfo-value">2022년 12월 12일</span></div>
    <div class="pubinfo-item"><span class="pubinfo-label">주소</span><span class="pubinfo-value">경기도 평택시 지제로 65-4, 105호(지제동)</span></div>
    <div class="pubinfo-item"><span class="pubinfo-label">대표전화</span><span class="pubinfo-value">010-4282-3393</span></div>
  </div>
</section>

<section class="about-contact">
  <h2>문의 정보</h2>
  <div class="contact-box">
    취재 의뢰, 광고·협업 문의, 오보 정정 요청, 제보는 아래 연락처로 접수해 주세요.<br>
    대표이메일 <strong>baikalnews815@gmail.com</strong><br>
    제보이메일 <strong>baikalnews.jebo@gmail.com</strong><br>
    대표전화 <strong>010-4282-3393</strong>
  </div>
</section>`,
  'editorial-policy': `<h1>편집 규약</h1>
<div class="policy-meta-info">최종 공시일: 2026년 7월 11일 | 바이칼 뉴스 제정</div>

<div class="policy-section">
  <h2>제1조 목적 및 사명</h2>
  <p>
    본 규약은 바이칼 뉴스(이하 "본지")가 저널리즘 본연의 정직성과 공익성을 수호하고, 외부의 부당한 압력으로부터 편집의 독립성을 지킴으로써 독자의 알 권리와 신뢰를 충족시키는 것을 목적으로 합니다.
    본지는 "깊고 투명한 시선으로 세상을 비추다"라는 슬로건 아래, 자극적인 편견이나 도그마에 얽매이지 않고 세상을 있는 그대로 투명하게 보도할 의무를 가집니다.
  </p>
</div>

<div class="policy-section">
  <h2>제2조 편집권의 독립 및 중립성</h2>
  <p>
    1. 본지의 기사 취재 및 편집 행위는 정치 권력, 종교 단체, 광고주 및 기타 사적 이익 집단으로부터 완벽히 독립하여 이루어집니다.<br>
    2. 편집인은 경영진의 부당한 기사 개입 요구나 배제 지시를 거부할 권리와 의무를 집니다.<br>
    3. 기자의 자유로운 취재 활동과 전문적 양심에 따른 보도는 본지의 양심 수호 메커니즘을 통해 철저히 보호받습니다.
  </p>
</div>

<div class="policy-section">
  <h2>제3조 철저한 팩트체크 및 기사의 정확성</h2>
  <p>
    1. 모든 기사는 객관적으로 입증할 수 있는 신뢰도 높은 정보원(Source)을 기반으로 작성되어야 하며, 중요한 팩트는 복수의 대조 수단을 거쳐 교차 확인하는 것을 기본으로 합니다.<br>
    2. 정파적이거나 일방적인 주장을 보도할 경우, 상대측의 입장과 해명을 동일한 수준의 지면과 비중으로 다루어야 합니다.<br>
    3. 기자는 취재 과정에서 획득한 자료와 기록을 신뢰성 검증 목적으로 일정 기간 철저히 안전하게 보관하여 보도의 정직성을 증빙할 준비를 마칩니다.
  </p>
</div>

<div class="policy-section">
  <h2>제4조 선정주의 배제 및 어조의 신중함</h2>
  <p>
    1. 독자의 호기심을 유도하여 트래픽을 늘릴 목적으로 극적인 조장, 의도적인 유포, 자극적 단어 선택 등의 클릭베이트(Clickbait) 행위를 완벽히 금지합니다.<br>
    2. 범죄 보도나 비극적 사고 취재 시 자극적인 수식을 쓰지 않으며 피해자의 2차 피해 방지를 위해 최소한의 중립적 단어를 채택합니다.<br>
    3. 기사 표제(Headline)는 본문 내용을 허위로 확장하거나 왜곡하지 않고 본질을 명확히 요약해야 합니다.
  </p>
</div>

<div class="policy-section">
  <h2>제5조 투명한 정보 제공 및 수정 이력 관리</h2>
  <p>
    1. 취재원이나 기사 내부의 인용구가 보도 이후 사실 관계 오류로 확인된 경우, 본지는 지체 없이 정정 보도나 수정을 반영해야 합니다.<br>
    2. 기사의 핵심적 내용이 수정되었을 때, 수정 사실과 구체적인 개정 사유를 기사 본문 하단에 '수정 이력(Revision Log)'으로 고정 게시하여 독자에게 명확한 투명성을 제공합니다.<br>
    3. 오보 수정 절차에 대한 세부 사항은 본지의 <a href="corrections.html">오보정정정책</a>에 따릅니다.
  </p>
</div>

<div class="policy-section">
  <h2>제6조 독자 인권 존중 및 사생활 보호</h2>
  <p>
    1. 본지는 공익적인 정당성 없이 개인의 명예나 사생활 영역을 침해하지 않으며, 초상권과 성명권을 전적으로 존중합니다.<br>
    2. 제보자의 신원 비밀 보호는 본지의 가장 엄격한 법률적·윤리적 책무로, 법원이나 공공기관의 강제적 요하에서도 제보자의 안전과 명예를 지키기 위해 비공개 원칙을 고수합니다.
  </p>
</div>

<div class="policy-section">
  <h2>제7조 인공지능(AI) 자동 작성 배제 및 인간 저널리즘 원칙</h2>
  <p>
    1. 본지는 인터넷 공간의 무분별한 정보 복제 및 AI(인공지능) 기반 기사 자동 생성·송출 시스템을 엄격히 금지합니다.<br>
    2. 모든 보도 기사는 취재 기자의 실제 사실 확인(현장 확인, 관계자 인터뷰, 문헌 검토 등)과 데스크(최상락, 장승희)의 교차 편집 검수 및 승인을 거쳐 게시되는 인간 저널리즘 무결성 보도만을 취급합니다.<br>
    3. 기사 본문에 들어가는 모든 표현은 생성형 인공지능에 의한 맹목적 텍스트 복제를 배제하며, 독창적이고 심도 깊은 분석을 기반으로 작성되어야 합니다.
  </p>
</div>`,
  'privacy-policy': `<h1>개인정보처리방침</h1>
<div class="policy-meta-info">최종 공시 및 시행일: 2026년 7월 11일</div>

<div class="policy-section">
  <h2>1. 수집하는 개인정보 항목 및 수집 방법</h2>
  <p>
    바이칼 뉴스(이하 "본지")는 독자에게 최적의 읽기 환경을 제공하고, 뉴스레터 발송 및 독자 제보 처리를 위해 필요 최소한의 개인정보를 수집하고 있습니다.<br>
    • <strong>수집 항목 (뉴스레터 구독 신청 시)</strong>: 이메일 주소<br>
    • <strong>수집 항목 (온라인 제보 및 제보 양식 작성 시)</strong>: 성명(닉네임 가능), 이메일 주소, 첨부 문서 내 기재된 개인정보<br>
    • <strong>자동 수집 항목</strong>: 서비스 이용 과정에서 IP 주소, 쿠키(Cookie), 방문 일시, 기기 OS 종류 및 브라우저 정보가 자동으로 생성되어 수집될 수 있습니다.
  </p>
</div>

<div class="policy-section">
  <h2>2. 쿠키(Cookie) 및 제3자 광고 파트너 정보 (Google AdSense)</h2>
  <p>
    본지는 독자의 서비스 사용 양상을 분석하고 편의성을 높이기 위해 '쿠키(Cookie)'를 저장하고 수시로 찾아내는 기술을 사용합니다. 쿠키란 본지의 웹사이트를 운영하는데 이용되는 서버가 독자의 브라우저에 보내는 아주 작은 텍스트 파일로 독자의 컴퓨터 하드디스크에 저장됩니다.
  </p>
  <p>
    <strong>[중요 공시 - 제3자 광고 게재 및 쿠키 사용]</strong><br>
    1. <strong>Google AdSense 광고 탑재</strong>: Google을 비롯한 제3자 판매자는 쿠키를 사용하여 독자가 본 웹사이트 또는 다른 웹사이트를 이전 방문한 이력을 바탕으로 광고를 게재합니다.<br>
    2. <strong>광고 쿠키의 사용</strong>: Google의 광고 쿠키 사용을 통해 Google과 파트너사는 독자의 본 웹사이트 방문 및 인터넷 상의 타 사이트 방문 정보를 바탕으로 맞춤형 광고를 제공할 수 있습니다.<br>
    3. <strong>쿠키 거부 권리</strong>: 독자는 브라우저의 옵션 설정을 조정하거나, <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Google 광고 설정 페이지</a>를 방문하여 맞춤형 광고 게재를 거부(Opt-out)할 수 있습니다.
  </p>
</div>

<div class="policy-section">
  <h2>3. 개인정보의 수집 및 이용 목적</h2>
  <p>
    본지가 수집한 개인정보는 다음의 목적 이외의 용도로는 사용되지 않으며, 이용 목적이 변경될 시에는 독자에게 사전에 명확히 공시하고 동의를 구할 예정입니다.<br>
    • 뉴스레터 구독자에 대한 뉴스 및 정기 배포 서비스 제공<br>
    • 독자의 제보 내용에 대한 팩트 확인 및 개별 회신<br>
    • 방문 통계 분석을 통한 서비스 개선 및 트래픽 품질 관리
  </p>
</div>

<div class="policy-section">
  <h2>4. 개인정보의 보유 및 파기 절차</h2>
  <p>
    본지는 원칙적으로 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 파기 절차 및 방법은 다음과 같습니다.<br>
    • <strong>파기 절차</strong>: 이용자가 입력한 이메일 등의 정보는 목적이 달성된 후 별도의 DB로 옮겨져 관련 법령에 의한 정보보호 사유에 따라 일정 기간 저장된 후 파기됩니다.<br>
    • <strong>파기 방법</strong>: 전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 영구 삭제하며, 종이 문서의 경우 분쇄하거나 소각합니다.
  </p>
</div>

<div class="policy-section">
  <h2>5. 이용자의 권리 및 거부권 행사 방법</h2>
  <p>
    독자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며, 뉴스레터 수신 동의 철회 및 개인정보 삭제(가입 탈퇴)를 요청할 권리가 있습니다. 이메일(<a href="mailto:baikalnews815@gmail.com">baikalnews815@gmail.com</a>)로 연락주시면 지체 없이 필요한 조치를 취하겠습니다.
  </p>
</div>

<div class="policy-section">
  <h2>6. 개인정보보호책임자 및 상담창구</h2>
  <p>
    본지는 독자의 개인정보를 보호하고 개인정보와 관련한 불만을 처리하기 위하여 아래와 같이 개인정보보호책임자를 지정하고 있습니다.<br>
    • <strong>개인정보보호책임자:</strong> 최상락 (발행인)<br>
    • <strong>이메일:</strong> <a href="mailto:baikalnews815@gmail.com">baikalnews815@gmail.com</a><br>
    • <strong>전화번호:</strong> 010-4282-3393
  </p>
</div>`,
  terms: `<h1>이용약관</h1>
<div class="policy-meta-info">최종 개정 및 적용일: 2026년 7월 11일</div>

<div class="policy-section">
  <h2>제1조 목적</h2>
  <p>
    이 이용약관(이하 "약관")은 바이칼 뉴스(이하 "본지")가 제공하는 인터넷 정보 서비스 및 뉴스 콘텐츠(이하 "서비스")를 이용자가 이용함에 있어 본지와 이용자 간의 권리, 의무, 책임 사항 및 서비스 이용에 관한 제반 사항을 규정함을 목적으로 합니다.
  </p>
</div>

<div class="policy-section">
  <h2>제2조 콘텐츠 저작권 및 사용 조건</h2>
  <p>
    1. 본지가 생산하고 서비스하는 모든 뉴스 기사, 텍스트, 사진, 동영상, 이미지, 디자인 요소 및 소스 코드는 관련 저작권법에 의해 보호받는 본지의 지적 재산입니다.<br>
    2. 이용자는 본지의 명시적인 사전 서면 승인 없이 본지 콘텐츠의 전부 혹은 일부를 복제, 배포, 전재, 방송하거나 영리적 목적으로 사용할 수 없습니다.<br>
    3. 비상업적 목적의 단순 링크 공유나 SNS 인용 보도의 경우, 반드시 '바이칼 뉴스'라는 명확한 출처 표기와 해당 기사의 URL 링크를 포함해야 합니다.
  </p>
</div>

<div class="policy-section">
  <h2>제3조 서비스 이용 제한 및 금지 행위</h2>
  <p>
    이용자는 서비스를 이용할 때 다음 각 호에 해당하는 행위를 해서는 안 됩니다.<br>
    • 타인의 개인정보를 도용하거나 사칭하는 행위<br>
    • 서비스 설비에 위해를 가하거나 안정적인 운영을 방해하는 행위<br>
    • 본지의 동의 없이 서비스를 이용한 광고 또는 영업 활동을 하는 행위<br>
    • 본지의 명예를 훼손하거나 저작권 등 제3자의 지적 재산권을 침해하는 행위
  </p>
</div>

<div class="policy-section">
  <h2>제4조 면책 조항</h2>
  <p>
    1. 본지는 천재지변, 전시, 정전, 기간통신사업자의 회선 중단 등 불가항력적인 외부 원인으로 서비스를 제공할 수 없는 경우 이에 대한 책임을 지지 않습니다.<br>
    2. 본지는 뉴스 및 칼럼 기사에 수록된 정보의 신뢰성과 정확성을 기하기 위해 최선의 노력을 다하지만, 독자가 기사 내용을 신뢰하여 행한 주식 투자, 부동산 계약 등의 경제적 결정에 따른 결과적 손실에 대해서는 책임지지 않습니다.<br>
    3. 본지는 외부 기고 및 독자 투고의 주장에 대해 중립을 지키며, 기고문 내의 개인적 견해는 본지의 공식적인 편집 방향과 다를 수 있습니다.
  </p>
</div>

<div class="policy-section">
  <h2>제5조 약관의 개정 및 분쟁 해결</h2>
  <p>
    1. 본지는 관계 법령의 개정 또는 합리적인 운영상의 사유가 있을 경우 본 약관을 개정할 수 있으며, 개정된 약관은 웹사이트 공시를 통해 효력을 발생합니다.<br>
    2. 서비스 이용과 관련하여 본지와 이용자 간에 발생한 분쟁에 대하여는 대한민국의 관련 법령을 적용하며, 본지 소재지의 관할 법원을 합의 관할 법원으로 합니다.
  </p>
</div>`,
  corrections: `<h1>오보 정정 및 개정 정책</h1>
<div class="policy-meta-info">최종 제정 및 고시일: 2026년 7월 11일</div>

<div class="policy-section">
  <h2>신뢰와 투명성을 위한 약속</h2>
  <p>
    바이칼 뉴스(이하 "본지")는 팩트 검증을 최우선으로 삼지만, 보도 과정에서 예기치 못한 사실 오인이나 오타, 정보원의 왜곡된 진술로 오류가 발생할 수 있음을 겸허히 인정합니다.
    본지는 실수를 숨기거나 묵인하는 대신, 신속하고 성실하게 오류를 수정하고 이를 독자에게 가감 없이 공개함으로써 언론사로서의 투명한 책임성과 품격을 유지합니다.
  </p>
</div>

<div class="policy-section">
  <h2>수정 이력 표시제</h2>
  <p>
    본지는 단순한 텍스트 침묵 수정을 금지하고, 의미 있는 사실 정정이 있을 시 개정 이력을 투명하게 남깁니다.
  </p>
  <ul>
    <li><strong>단순 오탈자 및 문법 교정</strong>: 기사의 핵심적 맥락에 영향을 미치지 않는 단순 오타, 맞춤법 교정 등은 별도의 이력 고지 없이 수정될 수 있습니다.</li>
    <li><strong>핵심 팩트 및 정보 정정</strong>: 수치, 인명, 일시, 기관명, 논리 구조 등 기사의 맥락을 바꾸는 중요한 수정 사항이 발생한 경우, 기사 하단의 <strong>[보도 정정 및 수정 이력 (Revision Log)]</strong> 영역에 수정 반영 일시 및 구체적인 수정 내용과 사유를 기록하여 영구히 남깁니다.</li>
    <li><strong>공식 정정 및 반론 보도</strong>: 언론중재위원회의 직권 결정이나 당사자 간의 합의에 의해 작성된 공식 정정 보도문 및 반론 보도문은 해당 기사의 최상단 혹은 최초 게재 지면과 매칭되는 동일 비중의 뉴스 리스트에 직접 게재합니다.</li>
  </ul>
</div>

<div class="policy-section">
  <h2>오보 정정 및 조치 요청 절차</h2>
  <p>
    본지의 보도로 인해 권익을 침해당했거나 사실 관계의 위배를 목격하신 이용자는 다음과 같은 절차에 따라 정정 신청을 하실 수 있습니다.
  </p>
  <p>
    1. <strong>신청 방법</strong>: 제보 및 문의 페이지의 온라인 접수 양식을 이용하시거나, 정정요청 이메일(<a href="mailto:baikalnews.jebo@gmail.com">baikalnews.jebo@gmail.com</a>)로 접수해 주십시오.<br>
    2. <strong>제출 서류</strong>: 정정을 요청하시는 기사의 링크, 문제가 되는 본문 단락, 올바른 사실관계를 증빙할 수 있는 신뢰성 있는 객관적 자료(공문서, 팩트 자료, 통계 자료 등)를 첨부해 주십시오.<br>
    3. <strong>심의 및 결과 회신</strong>: 편집국 데스크가 접수 즉시 팩트 검증을 재실행하며, 접수 후 48시간 이내에 반영 여부 및 향후 반영 조치 계획을 신청인에게 서면(이메일)으로 정중히 전달합니다.
  </p>
</div>

<div class="policy-section">
  <h2>기사 삭제에 관한 원칙</h2>
  <p>
    본지는 역사적 공익성과 저널리즘 아카이빙의 의무를 다하기 위해, 게재 완료된 기사의 자의적인 완전 영구 삭제는 지양합니다.
    다만, 형사소송법상 무죄가 확정된 당사자의 사생활권 보호, 명예훼손에 따른 강력한 피해 유발 등 법률적인 구제 필요가 극명한 예외적 상황에 한해서만 편집위원회의 치열한 토론과 합의를 거쳐 제한적으로 비공개 또는 삭제 조치를 실행합니다.
  </p>
</div>`,
  contact: `<h1>제보 및 문의</h1>
<div class="policy-meta-info">귀하의 소중한 의견과 제보는 바이칼 뉴스의 가장 귀중한 자산입니다.</div>

<p style="font-size: 0.95rem; line-height: 1.6; color: var(--text-secondary); margin-bottom: 32px;">
  바이칼 뉴스는 권력과 자본으로부터의 완전한 독립과 독자 보호를 위해 제보자의 익명성과 신원을 법률 이상으로 엄격히 보호합니다.
  보도 오류에 대한 정정 요청, 기사 제보, 제휴 문의는 아래 양식 혹은 이메일을 통해 접수해 주시면 담당 데스크가 24시간 이내에 검토 및 답변 드립니다.
</p>

<div class="contact-info-block">
  <div class="contact-method">
    <h3>기사 제보</h3>
    <p>익명이 보장되는 기사 관련 제보는 아래 이메일로 관련 첨부 자료 및 정황 문서를 송부해 주시기 바랍니다.</p>
    <p style="margin-top: 4px; font-weight: 600; color: var(--accent-cyan);">baikalnews.jebo@gmail.com</p>
  </div>

  <div class="contact-method">
    <h3>일반 문의 및 광고/제휴</h3>
    <p>언론사 제휴, 뉴스 제공 계약 및 광고 관련 문의는 경영관리팀으로 접수해 주십시오.</p>
    <p style="margin-top: 4px; font-weight: 600; color: var(--accent-blue);">baikalnews815@gmail.com</p>
  </div>

  <div class="contact-method">
    <h3>우편 접수 및 내방</h3>
    <p>경기도 평택시 지제로 65-4, 105호(지제동), 바이칼 뉴스 2층 편집국</p>
  </div>
</div>`
};

// 1. Initialize admin sections
async function initAdminDashboard() {
  // Restore whichever tab/view the URL hash points to (defaults to dashboard
  // if there's none) instead of always resetting to the dashboard on load.
  await applyHashRoute();

  // Refresh data models
  await refreshStats();
  await renderArticlesList();
  await renderPendingList();
  await renderTopViewedList();
  await renderViewsChart();
  await renderScheduledList();
  await populateCurationDropdowns();
  await loadStaticPageContent();
  await renderAuditLogs();
  renderAdminsList();
}

// ==========================================================
// Hash-based routing: keeps the URL in sync with the current tab/view
// so a page refresh or the browser back/forward buttons restore the
// exact screen instead of always landing back on the dashboard.
// ==========================================================
let suppressHashUpdate = false;
// Tracks the hash our own code most recently claimed as "already applied",
// so a hashchange event that only fires later (e.g. after a blocking
// alert()) doesn't re-run the destructive form-reset navigation functions
// for a screen we're already correctly showing with extra data on top.
let lastAppliedHash = null;

function setRouteHash(hash) {
  lastAppliedHash = hash;
  if (suppressHashUpdate) return;
  if (location.hash === hash) return;
  location.hash = hash;
}

async function applyHashRoute() {
  const currentHash = location.hash || '#dashboard';
  if (currentHash === lastAppliedHash) {
    // Stale event for a state we've already rendered ourselves -- skip.
    return;
  }
  lastAppliedHash = currentHash;

  const raw = currentHash.replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean);
  const validTabs = ['dashboard', 'articles', 'article-editor', 'web-briefing', 'ai-writer', 'ai-training', 'shorts', 'letter-send', 'sns', 'subscribers', 'curation', 'expenses', 'settings'];
  const tab = validTabs.includes(parts[0]) ? parts[0] : 'dashboard';

  suppressHashUpdate = true;
  try {
    if (tab === 'article-editor') {
      // showArticleCreateForm/editArticle switch to this tab themselves
      if (parts[1] === 'edit' && parts[2]) {
        await editArticle(parseInt(parts[2], 10));
      } else {
        await showArticleCreateForm();
      }
    } else {
      await switchTab(tab);
    }
  } finally {
    suppressHashUpdate = false;
  }
}

window.addEventListener('hashchange', applyHashRoute);

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
  // AI 글쓰기 학습 has no sidebar entry of its own -- it's reached via the
  // banner inside AI 기사 집필실, so that merged menu item stays highlighted.
  const sidebarHighlightTab = tabName === 'ai-training' ? 'ai-writer' : tabName;

  // Remove active from all sidebar links
  document.querySelectorAll(".sidebar-item").forEach(item => {
    item.classList.remove("active");
    if (item.getAttribute("data-tab") === sidebarHighlightTab) {
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
    'article-editor': "새 기사 작성 / 편집",
    'web-briefing': "3분 뉴스 브리핑 (웹사이트 게시용)",
    'ai-writer': "AI 어시스턴트 집필실",
    'ai-training': "AI 글쓰기 학습",
    shorts: "숏폼 생성",
    'letter-send': "뉴스레터 발송",
    sns: "SNS 카드뉴스 발행",
    subscribers: "구독자 현황",
    curation: "홈화면 큐레이션 통제",
    expenses: "비용 관리",
    settings: "설정"
  };
  const titleEl = document.getElementById("current-tab-title");
  if (titleEl) {
    titleEl.textContent = titles[tabName] || "바이칼 뉴스 어드민";
  }

  // Refresh lists if switching to specific tabs
  if (tabName === 'dashboard') {
    await syncScheduledArticlesToPublished();
    await refreshStats();
    await renderPendingList();
    await renderTopViewedList();
    await renderViewsChart();
    await renderScheduledList();
  } else if (tabName === 'articles') {
    await syncScheduledArticlesToPublished();
    await renderArticlesList();
  } else if (tabName === 'web-briefing') {
    loadGeminiApiKey();
    await loadOrGenerateWebBriefing();
  } else if (tabName === 'ai-writer') {
    loadGeminiApiKey();
    await loadWritingStyles();
  } else if (tabName === 'ai-training') {
    loadGeminiApiKey();
    await populateTrainingStyleSelect();
  } else if (tabName === 'shorts') {
    loadGeminiApiKey();
    await renderShortsList();
  } else if (tabName === 'letter-send') {
    await loadOrGenerateNewsletterDraft();
    loadGeminiApiKey();
    renderKakaoSendModeUI();
    await loadKakaoSendModeFromServer();
    // 카카오 압축은 웹사이트 원문을 소스로 쓰므로, 이 탭에 웹 브리핑
    // 패널이 더는 없어도 최신 webBriefingDraft를 미리 로드해 둔다.
    await loadOrGenerateWebBriefing();
    await loadOrGenerateKakaoBriefing();
  } else if (tabName === 'sns') {
    await initSnsTab();
  } else if (tabName === 'subscribers') {
    await renderNewsletterSubscriberBriefing();
    await renderKakaoSubscriberBriefing();
  } else if (tabName === 'curation') {
    await populateCurationDropdowns();
  } else if (tabName === 'expenses') {
    await renderExpensesTab();
  }

  setRouteHash('#' + tabName);
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
  
  const scheduled = articles.filter(a => a.status === 'scheduled').length;
  const review = articles.filter(a => a.status === 'review').length;
  const published = articles.filter(a => a.status === 'published').length;
  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);

  document.getElementById("stat-scheduled-count").textContent = scheduled;
  document.getElementById("stat-review-count").textContent = review;
  document.getElementById("stat-published-count").textContent = published;
  document.getElementById("stat-total-count").textContent = articles.length;
  document.getElementById("stat-total-views").textContent = totalViews.toLocaleString("ko-KR");

  if (window.SupabaseAdapter) {
    const subscribers = await window.SupabaseAdapter.fetchNewsletterSubscribers();
    document.getElementById("stat-subscriber-count").textContent = subscribers.length.toLocaleString("ko-KR");

    const totalVisitors = await window.SupabaseAdapter.fetchTotalUniqueVisitors();
    document.getElementById("stat-total-visitors").textContent = totalVisitors.toLocaleString("ko-KR");
  }
}

// Catches up any 'scheduled' article whose scheduledAt has already passed --
// there's no server-side cron watching the clock, so this runs on every
// dashboard/articles tab visit instead. Reuses saveArticle()'s normal upsert
// path (not a lightweight status-only update) so it goes through the exact
// same Supabase sync + localStorage mirror as a manual edit would.
async function syncScheduledArticlesToPublished() {
  if (!window.SupabaseAdapter) return;
  let articles = [];
  try {
    articles = await window.SupabaseAdapter.fetchArticles();
  } catch (err) {
    console.error("예약 기사 자동 발행 확인 실패 (목록 조회):", err);
    return;
  }

  const now = new Date();
  const dueArticles = articles.filter(a =>
    a.status === 'scheduled' && a.scheduledAt && new Date(a.scheduledAt) <= now
  );
  if (dueArticles.length === 0) return;

  for (const art of dueArticles) {
    art.status = 'published';
    try {
      await window.SupabaseAdapter.saveArticle(art);
      await logAudit("예약 발행 자동 전환", art.id, `예약 시각(${new Date(art.scheduledAt).toLocaleString("ko-KR")}) 도달로 자동 발행 처리됨.`);
    } catch (err) {
      console.error(`예약 기사 자동 발행 실패 (id ${art.id}):`, err);
    }
  }
}

// Dashboard 예약 발행 내역 table -- every article still flagged 'scheduled',
// soonest scheduledAt first.
async function renderScheduledList() {
  const listEl = document.getElementById("dashboard-scheduled-list");
  const panelEl = document.getElementById("dashboard-scheduled-panel");
  if (!listEl) return;

  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  // status stays 'scheduled' in the DB forever -- nothing flips it to
  // 'published' once the scheduled time passes (the public site's
  // isArticleLive() just treats a past scheduledAt as live for display
  // purposes, it never writes back to the row). So filtering on status
  // alone kept already-live articles stuck in this "예약된" list
  // indefinitely; the real "still pending" condition is scheduledAt still
  // being in the future. Ascending sort then naturally puts the soonest
  // upcoming one on top.
  const now = new Date();
  const scheduled = articles
    .filter(a => a.status === 'scheduled' && a.scheduledAt && new Date(a.scheduledAt) > now)
    .slice()
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  if (panelEl) panelEl.style.display = scheduled.length > 0 ? '' : 'none';
  if (scheduled.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = scheduled.map(art => `
    <tr>
      <td><span class="ai-tag" style="margin:0;">${art.categoryLabel || art.category}</span></td>
      <td style="font-weight: 500; color: var(--admin-text-primary);">${art.title}</td>
      <td>${art.approver || '<span style="color: var(--admin-text-muted);">미지정</span>'}</td>
      <td style="white-space: nowrap;">${art.scheduledAt ? new Date(art.scheduledAt).toLocaleString("ko-KR") : '-'}</td>
      <td class="action-links">
        <a onclick="editArticle(${art.id})">편집</a>
        <a onclick="previewArticle(${art.id})">미리보기</a>
      </td>
    </tr>
  `).join('');
}

// Render Dashboard Top-Viewed list (full ranking, shown when toggled open)
async function renderTopViewedList() {
  const listEl = document.getElementById("dashboard-top-viewed-list");
  if (!listEl) return;

  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }

  const topViewed = articles
    .filter(a => a.status === 'published')
    .slice()
    .sort((a, b) => (b.views || 0) - (a.views || 0));

  if (topViewed.length === 0) {
    listEl.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--admin-text-muted); padding: 24px 0;">발행된 기사가 없거나 아직 조회 기록이 없습니다.</td></tr>`;
    return;
  }

  listEl.innerHTML = topViewed.map((art, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="ai-tag" style="margin:0;">${art.categoryLabel || art.category}</span></td>
      <td style="font-weight: 500; color: var(--admin-text-primary);">${art.title}</td>
      <td>${(art.views || 0).toLocaleString("ko-KR")}</td>
    </tr>
  `).join('');
}

function toggleArticleViewsList() {
  const wrapper = document.getElementById("article-views-list-wrapper");
  const btn = document.getElementById("toggle-article-views-btn");
  if (!wrapper) return;

  const isHidden = wrapper.style.display === "none" || !wrapper.style.display;
  wrapper.style.display = isHidden ? "block" : "none";
  if (btn) btn.textContent = isHidden ? "기사별 조회수 숨기기" : "기사별 조회수 보기";
}

// Daily views/unique-visitors bar chart (last 14 days), built from page_views event rows
async function renderViewsChart() {
  const container = document.getElementById("views-chart-container");
  if (!container) return;

  const days = 14;
  let events = [];
  if (window.SupabaseAdapter && window.SupabaseAdapter.fetchPageViewEvents) {
    events = await window.SupabaseAdapter.fetchPageViewEvents(days);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({
      key: d.toISOString().slice(0, 10),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      views: 0,
      visitorSet: new Set()
    });
  }
  const bucketByKey = {};
  buckets.forEach(b => { bucketByKey[b.key] = b; });

  events.forEach(ev => {
    const key = (ev.viewed_at || '').slice(0, 10);
    const bucket = bucketByKey[key];
    if (!bucket) return;
    bucket.views += 1;
    bucket.visitorSet.add(ev.visitor_id);
  });

  const data = buckets.map(b => ({ label: b.label, views: b.views, visitors: b.visitorSet.size }));

  if (data.every(d => d.views === 0)) {
    container.innerHTML = `<div class="help-text">아직 집계된 조회 이벤트가 없습니다. 독자가 기사를 읽으면 여기에 그래프가 표시됩니다.</div>`;
    return;
  }

  const maxVal = Math.max(1, ...data.map(d => Math.max(d.views, d.visitors)));
  const chartHeight = 180;
  const topPad = 18; // room for the value labels above the tallest bar
  const barGroupWidth = 44;
  const barWidth = 14;
  const svgWidth = data.length * barGroupWidth;

  const bars = data.map((d, i) => {
    const x = i * barGroupWidth;
    const viewsH = Math.round((d.views / maxVal) * chartHeight);
    const visitorsH = Math.round((d.visitors / maxVal) * chartHeight);
    const viewsY = topPad + chartHeight - viewsH;
    const visitorsY = topPad + chartHeight - visitorsH;
    const viewsLabel = d.views > 0
      ? `<text x="${x + 4 + barWidth / 2}" y="${Math.max(viewsY - 5, 10)}" font-size="10" text-anchor="middle" fill="var(--admin-text-secondary)">${d.views}</text>`
      : '';
    const visitorsLabel = d.visitors > 0
      ? `<text x="${x + 4 + barWidth + 2 + barWidth / 2}" y="${Math.max(visitorsY - 5, 10)}" font-size="10" text-anchor="middle" fill="var(--admin-text-secondary)">${d.visitors}</text>`
      : '';
    return `
      <g>
        <title>${d.label}: 조회수 ${d.views}회 / 방문자 ${d.visitors}명</title>
        <rect x="${x + 4}" y="${viewsY}" width="${barWidth}" height="${Math.max(viewsH, 1)}" fill="#f97316" rx="2"></rect>
        <rect x="${x + 4 + barWidth + 2}" y="${visitorsY}" width="${barWidth}" height="${Math.max(visitorsH, 1)}" fill="var(--admin-accent-cyan)" rx="2"></rect>
        ${viewsLabel}
        ${visitorsLabel}
      </g>
      <text x="${x + barGroupWidth / 2}" y="${topPad + chartHeight + 18}" font-size="10" text-anchor="middle" fill="var(--admin-text-muted)">${d.label}</text>
    `;
  }).join('');

  container.innerHTML = `
    <svg width="${svgWidth}" height="${topPad + chartHeight + 30}" viewBox="0 0 ${svgWidth} ${topPad + chartHeight + 30}" style="min-width: 100%;">
      ${bars}
    </svg>
  `;
}

// Render Dashboard Review list
async function renderPendingList() {
  const listEl = document.getElementById("dashboard-pending-list");
  const panelEl = document.getElementById("dashboard-pending-panel");
  if (!listEl) return;

  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  const pending = articles.filter(a => a.status === 'review');

  if (panelEl) panelEl.style.display = pending.length > 0 ? '' : 'none';
  if (pending.length === 0) {
    listEl.innerHTML = '';
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
// Collapses the full article-lifecycle status into the 4 categories the
// article list shows: 발행 (actually live to readers right now, including a
// scheduled article whose time has passed), 미발행 (archived/taken down),
// 예약 (scheduled for later, time not yet reached), 대기 (still in the
// draft/review/approval pipeline with no publish time set at all).
function getArticleStatusDisplay(art) {
  if (art.status === 'archived') {
    return { label: '미발행', cls: 'badge-archived' };
  }
  if (art.status === 'correction') {
    return { label: '정정', cls: 'badge-correction' };
  }
  const isLive = art.status === 'published' ||
    (art.status === 'scheduled' && art.scheduledAt && new Date(art.scheduledAt) <= new Date());
  if (isLive) {
    return { label: '발행', cls: 'badge-published' };
  }
  if (art.status === 'scheduled') {
    return { label: '예약', cls: 'badge-scheduled' };
  }
  return { label: '대기', cls: 'badge-review' };
}

async function renderArticlesList() {
  const tbody = document.getElementById("articles-table-body");
  if (!tbody) return;

  let articles = [];
  let shorts = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
    shorts = await window.SupabaseAdapter.fetchShorts();
  }

  const publishedCountEl = document.getElementById("articles-published-count");
  const scheduledCountEl = document.getElementById("articles-scheduled-count");
  if (publishedCountEl) publishedCountEl.textContent = articles.filter(a => getArticleStatusDisplay(a).label === '발행').length;
  if (scheduledCountEl) scheduledCountEl.textContent = articles.filter(a => getArticleStatusDisplay(a).label === '예약').length;

  if (articles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--admin-text-muted);">등록된 기사가 없습니다. 새 기사를 추가하거나 AI로 작성해 보세요.</td></tr>`;
    return;
  }

  const shortsEligibleStatuses = ['published', 'approved', 'scheduled', 'correction'];

  // Same-day articles (date is day-only, no time) tie-break on whichever
  // precise timestamp the article actually has -- approvedAt for anything
  // that's gone through approval, scheduledAt otherwise -- so the true
  // most-recent one still sorts first instead of falling back to id/insertion order.
  const sortedArticles = articles.slice().sort((a, b) => {
    const dateDiff = parseKoreanDate(b.date) - parseKoreanDate(a.date);
    if (dateDiff !== 0) return dateDiff;
    const aTime = new Date(a.approvedAt || a.scheduledAt || 0).getTime() || 0;
    const bTime = new Date(b.approvedAt || b.scheduledAt || 0).getTime() || 0;
    return bTime - aTime;
  });

  tbody.innerHTML = sortedArticles.map((art, i) => {
    const rowNumber = sortedArticles.length - i; // oldest = 1, even though newest displays first
    const statusInfo = getArticleStatusDisplay(art);

    let snsButton = '';
    // SNS 카드뉴스 발행 탭의 기사 피커는 발행된 기사만 대상으로 하므로
    // (fetchSnsArticlePools 참고), 아직 발행 전인 기사는 이동해도 미리
    // 선택해 줄 수 없다 -- 발행된 기사에만 이 버튼을 보여준다.
    if (art.status === 'published') {
      snsButton = `<a onclick="openCardNewsFromArticle(${art.id})" class="shorts-status-box shorts-status-sns">SNS</a>`;
    }

    let shortsButton = '';
    if (shortsEligibleStatuses.includes(art.status)) {
      const completedShorts = shorts.find(s => s.articleId === art.id && s.status === 'video_ready');
      shortsButton = completedShorts
        ? `<a onclick="openShortsFromArticleList(${completedShorts.id})" class="shorts-status-box shorts-status-shorts">숏폼</a>`
        : `<a onclick="createShortsFromArticle(${art.id})" class="shorts-status-box shorts-status-shorts">숏폼</a>`;
    }

    return `
    <tr>
      <td class="article-select-col"><input type="checkbox" class="article-select-checkbox" value="${art.id}"></td>
      <td>${rowNumber}</td>
      <td>${AI_CATEGORY_LABELS[art.category] || art.category || ''}</td>
      <td class="articles-title-cell">${art.title}</td>
      <td>${art.approver || '미지정'}</td>
      <td><span class="badge ${statusInfo.cls}">${statusInfo.label}</span></td>
      <td style="white-space: nowrap;">${art.date}</td>
      <td>${(art.views || 0).toLocaleString("ko-KR")}</td>
      <td class="action-links">
        <a onclick="editArticle(${art.id})">편집</a>
        <a onclick="previewArticle(${art.id})">미리보기</a>
        ${snsButton}
        ${shortsButton}
      </td>
    </tr>
  `;
  }).join('');
}

// 작업 열의 "SNS뉴스" 초록 박스 -- SNS 카드뉴스 발행 탭(카드뉴스 서브탭)으로
// 이동해 이 기사를 카드뉴스 피커에 미리 선택해 둔다.
async function openCardNewsFromArticle(articleId) {
  await switchTab('sns');
  const cardnewsBtn = document.querySelector('.sns-subtab-btn[data-subtab="cardnews"]');
  switchSnsSubTab('cardnews', cardnewsBtn);
  const state = snsArticlePickers['cardnews-picker-input'];
  const article = state && state.allArticles.find(a => a.id === articleId);
  if (article) {
    selectSnsArticlePicker('cardnews-picker-input', 'cardnews-picker-dropdown', article);
  }
}

// 작업 열의 "숏폼생성" 초록 박스 -- 숏폼 탭으로 이동해 새 프로젝트를 시작하고
// 원본 기사를 미리 선택해 둔다 (대본 자동생성 자체는 API 비용이 드니 관리자가
// 직접 눌러 진행하도록 남겨둔다).
async function createShortsFromArticle(articleId) {
  await switchTab('shorts');
  await startNewShortsProject();
  const select = document.getElementById("shorts-article-select");
  if (select) select.value = articleId;
}

// "숏폼완료" 주황 박스 -- 이미 완성된 숏폼 프로젝트를 바로 열어 확인/다운로드할
// 수 있도록 한다.
async function openShortsFromArticleList(shortsId) {
  await switchTab('shorts');
  await openShortsProject(shortsId);
}

// Toggle between "just show the list" and "select rows to delete" modes.
// First click reveals checkboxes; a second click opens the delete-choice
// modal for whatever's checked, or (if nothing is checked) just exits
// selection mode again.
function toggleArticleDeleteMode() {
  const listView = document.getElementById("articles-list-view");
  if (!listView) return;

  if (!listView.classList.contains("delete-mode-active")) {
    listView.classList.add("delete-mode-active");
    return;
  }

  const checkedIds = Array.from(document.querySelectorAll('.article-select-checkbox:checked'))
    .map(cb => parseInt(cb.value, 10));

  if (checkedIds.length === 0) {
    listView.classList.remove("delete-mode-active");
    return;
  }

  openDeleteChoiceModal(checkedIds, 'list');
}

function toggleAllArticleCheckboxes(masterCheckbox) {
  document.querySelectorAll('.article-select-checkbox').forEach(cb => {
    cb.checked = masterCheckbox.checked;
  });
}

// ==========================================================
// Delete-choice modal: 완전 삭제 (hard delete) vs 아카이브 (soft delete)
// Shared by the single-article delete button (edit form) and the
// bulk "삭제" button in the articles list.
// ==========================================================
let pendingDeleteIds = [];
let pendingDeleteContext = null; // 'form' | 'list'

function openDeleteChoiceModal(ids, context) {
  pendingDeleteIds = ids;
  pendingDeleteContext = context;

  const msgEl = document.getElementById("delete-choice-message");
  if (msgEl) {
    msgEl.textContent = ids.length === 1
      ? "선택한 기사를 어떻게 삭제하시겠습니까?"
      : `선택한 기사 ${ids.length}건을 어떻게 삭제하시겠습니까?`;
  }

  const modal = document.getElementById("delete-choice-modal");
  if (modal) modal.classList.add("active");
}

function closeDeleteChoiceModal() {
  const modal = document.getElementById("delete-choice-modal");
  if (modal) modal.classList.remove("active");
  pendingDeleteIds = [];
  pendingDeleteContext = null;
}

async function confirmDeleteChoice(mode) {
  const ids = pendingDeleteIds.slice();
  const context = pendingDeleteContext;
  closeDeleteChoiceModal();

  if (ids.length === 0) return;

  if (mode === 'hard') {
    for (const id of ids) {
      if (window.SupabaseAdapter) {
        await window.SupabaseAdapter.deleteArticle(id);
      }
      await logAudit("기사 완전 삭제", id, "기사가 영구적으로 삭제되어 복구할 수 없습니다.");
    }
  } else {
    let articles = [];
    if (window.SupabaseAdapter) {
      articles = await window.SupabaseAdapter.fetchArticles();
    }
    for (const id of ids) {
      const art = articles.find(a => a.id === id);
      if (!art) continue;

      art.status = 'archived';
      if (!art.revisionHistory) art.revisionHistory = [];
      art.revisionHistory.push({
        date: new Date().toLocaleString("ko-KR"),
        action: "기사 아카이브 보관 처리"
      });

      if (window.SupabaseAdapter) {
        await window.SupabaseAdapter.saveArticle(art);
      }
      await logAudit("기사 아카이브 보관", id, "기사를 비활성화하여 독자에게서 보이지 않게 처리함.");
    }
  }

  if (context === 'form') {
    await hideArticleForm();
  } else {
    const listView = document.getElementById("articles-list-view");
    if (listView) listView.classList.remove("delete-mode-active");
    const masterCheckbox = document.getElementById("article-select-all");
    if (masterCheckbox) masterCheckbox.checked = false;
    await renderArticlesList();
  }
  await refreshStats();

  alert(mode === 'hard'
    ? `${ids.length}건의 기사가 완전히 삭제되었습니다.`
    : `${ids.length}건의 기사가 휴지통으로 이동되었습니다.`);
}

// Form view controls -- 기사 관리 (list, tab-articles) and 새 기사 작성/편집
// (form, tab-article-editor) are separate tabs; these functions own
// switching to the right one themselves so any caller (sidebar, dashboard
// shortcut, AI transfer, hash routing) can call them directly.
async function showArticleCreateForm() {
  // switchTab() pushes its own '#article-editor' hash entry as a side effect --
  // suppress that intermediate push so only the specific hash set at the end of
  // this function lands in history. Otherwise a single "새 기사 작성" click
  // pushes two entries, and the browser back button lands on the bare
  // '#article-editor' hash (a blank form) instead of wherever the admin came from.
  const wasHashSuppressed = suppressHashUpdate;
  suppressHashUpdate = true;
  await switchTab('article-editor');
  suppressHashUpdate = wasHashSuppressed;

  document.getElementById("form-view-title").textContent = "새 기사 작성";

  // Reset form inputs
  document.getElementById("article-form").reset();
  currentEditingId = null;

  // Set default values
  document.getElementById("edit-article-id").value = "";
  document.getElementById("form-date").value = new Date().toLocaleDateString("ko-KR").replace(/\s/g, '').slice(0, -1); // "2026.07.11" format
  setFormImageValue("images/news_editorial.png");

  // Hide widgets
  document.getElementById("btn-soft-delete").style.display = "none";
  onStatusChangeInForm("draft");
  updateContentCharCount();
  resetAiImagePromptFields();

  setRouteHash('#article-editor/new');
}

async function hideArticleForm() {
  currentEditingId = null;
  await switchTab('articles');
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
  } else if (status === 'approved' || status === 'scheduled') {
    document.getElementById("wf-step-draft").classList.add("active");
    document.getElementById("wf-step-review").classList.add("active");
    document.getElementById("wf-step-approved").classList.add("active");
    document.getElementById("wf-conn-review").classList.add("active");
    document.getElementById("wf-conn-approved").classList.add("active");
  } else if (status === 'published' || status === 'correction') {
    document.getElementById("wf-step-draft").classList.add("active");
    document.getElementById("wf-step-review").classList.add("active");
    document.getElementById("wf-step-approved").classList.add("active");
    document.getElementById("wf-step-published").classList.add("active");
    document.getElementById("wf-conn-review").classList.add("active");
    document.getElementById("wf-conn-approved").classList.add("active");
    document.getElementById("wf-conn-published").classList.add("active");
  }

  // Show approver selector if status is approved, scheduled, published, or correction
  const approverGroup = document.getElementById("approver-select-group");
  if (status === 'approved' || status === 'published' || status === 'scheduled' || status === 'correction') {
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

  // Show scheduled publish datetime picker only when status is 'scheduled'
  const scheduledGroup = document.getElementById("scheduled-at-group");
  const scheduledInput = document.getElementById("form-scheduled-at");
  if (status === 'scheduled') {
    scheduledGroup.style.display = "block";
    scheduledInput.setAttribute("required", "required");
  } else {
    scheduledGroup.style.display = "none";
    scheduledInput.removeAttribute("required");
  }
}

function updateContentCharCount() {
  const el = document.getElementById("form-content");
  const counterEl = document.getElementById("form-content-charcount");
  if (!el || !counterEl) return;
  const noSpaceCount = (el.innerText || "").replace(/\s/g, '').length;
  counterEl.textContent = `공백 제외 ${noSpaceCount.toLocaleString("ko-KR")}자`;
}

// Edit existing article
async function editArticle(id) {
  let art = null;
  if (window.SupabaseAdapter) {
    art = await window.SupabaseAdapter.fetchArticleById(id);
  }
  if (!art) {
    // e.g. navigated back/forward to an edit link for an article that was
    // since deleted -- fall back to the list instead of doing nothing.
    await hideArticleForm();
    return;
  }

  // See showArticleCreateForm() for why this suppresses switchTab's own
  // intermediate hash push -- otherwise editing an article pushes both
  // '#article-editor' and '#article-editor/edit/<id>', and one browser-back
  // press lands on the bare (blank-form) hash instead of the article list.
  const wasHashSuppressed = suppressHashUpdate;
  suppressHashUpdate = true;
  await switchTab('article-editor');
  suppressHashUpdate = wasHashSuppressed;
  resetAiImagePromptFields();

  currentEditingId = id;
  document.getElementById("form-view-title").textContent = `기사 편집 (ID: #${art.id})`;

  // Populate fields
  document.getElementById("edit-article-id").value = art.id;
  document.getElementById("form-title").value = art.title;
  document.getElementById("form-lead").value = art.lead || "";
  document.getElementById("form-content").innerHTML = art.content || "";
  document.getElementById("form-category").value = art.category;
  document.getElementById("form-date").value = art.date;
  document.getElementById("form-ymyl").checked = art.isYMYL || false;
  setFormImageValue(art.image || "images/news_editorial.png");
  
  document.getElementById("form-seo-title").value = art.seoTitle || "";
  document.getElementById("form-seo-meta").value = art.seoMeta || "";
  document.getElementById("form-slug").value = art.slug || "";
  document.getElementById("form-image-caption").value = art.imageCaption || "";

  document.getElementById("form-status").value = art.status;
  document.getElementById("form-approver").value = art.approver || "";
  document.getElementById("form-scheduled-at").value = toDatetimeLocalValue(art.scheduledAt);

  // Show delete button
  document.getElementById("btn-soft-delete").style.display = "block";

  // Trigger status visual logic
  onStatusChangeInForm(art.status);
  updateContentCharCount();

  setRouteHash(`#article-editor/edit/${art.id}`);
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// Shortcut: force status to 'published' and save immediately, so publishing
// doesn't require first discovering the status dropdown.
async function publishArticleNow() {
  document.getElementById("form-status").value = "published";
  onStatusChangeInForm("published");
  await saveArticle();
}

// Save Article
async function saveArticle() {
  const idVal = document.getElementById("edit-article-id").value;
  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  
  const title = document.getElementById("form-title").value;
  const lead = document.getElementById("form-lead").value;
  const content = document.getElementById("form-content").innerHTML;
  const category = document.getElementById("form-category").value;
  let date = document.getElementById("form-date").value;
  const isYMYL = document.getElementById("form-ymyl").checked;
  const image = document.getElementById("form-image").value;
  
  const seoTitle = document.getElementById("form-seo-title").value || `${title} - 바이칼 뉴스`;
  const seoMeta = document.getElementById("form-seo-meta").value || lead;
  const slug = document.getElementById("form-slug").value || `article-${Date.now()}`;
  const imageCaption = document.getElementById("form-image-caption").value.trim();
  
  const status = document.getElementById("form-status").value;
  const approver = document.getElementById("form-approver").value;
  const rejectionNote = document.getElementById("form-rejection-note").value;
  const scheduledAtRaw = document.getElementById("form-scheduled-at").value;

  // Category labels mapping
  const catLabels = {
    culture: "문화·생활",
    economy: "경제·산업",
    tech: "기술·미디어",
    local: "지역·평택",
    opinion: "오피니언"
  };

  // Critical Validation: Approval requires an Approver name
  if ((status === 'approved' || status === 'published' || status === 'scheduled' || status === 'correction') && !approver) {
    alert("승인 완료·예약 발행·공개 발행·기사 정정 상태로 전환하기 위해서는 검토에 책임을 질 최종 데스크 승인인(최상락 또는 장승희)을 반드시 지정해야 합니다.");
    return;
  }

  // Scheduled publish requires a future datetime
  let scheduledAt = null;
  if (status === 'scheduled') {
    if (!scheduledAtRaw) {
      alert("예약 발행 일시를 지정해 주세요.");
      return;
    }
    scheduledAt = new Date(scheduledAtRaw);
    if (scheduledAt <= new Date()) {
      alert("예약 발행 일시는 현재보다 미래여야 합니다.");
      return;
    }
    // The displayed 발행일자 should always match when the article actually
    // goes live, not whatever date happened to be in the form -- so it never
    // needs manual correction to match the scheduled time.
    date = scheduledAt.toLocaleDateString("ko-KR").replace(/\s/g, '').slice(0, -1);
    scheduledAt = scheduledAt.toISOString();
    const dateInput = document.getElementById("form-date");
    if (dateInput) dateInput.value = date;
  }

  let art = null;
  let actionName = "";

  if (idVal) {
    // Edit Mode
    const id = parseInt(idVal, 10);
    art = articles.find(a => a.id === id);
    if (!art) return;

    // 수정 이력 only ever logs a 기사 정정 entry, and only on the transition
    // into that status -- plain edits, approvals, and publishing leave no
    // entry at all (readers only need to know when content was corrected).
    actionName = `기사 편집 및 상태 변경 (${status.toUpperCase()})`;
    let revisionMsg = null;

    if (status === 'correction' && art.status !== 'correction') {
      revisionMsg = `기사 내용 정정 (승인인: ${approver})`;
    }

    // 예약 발행이었던 기사를 예약 시각 전에 "즉시 발행"으로 바꾸는 경우처럼,
    // 폼의 보도 날짜가 이전 상태(예: 예약 날짜)에 맞춰진 채로 남아있을 수
    // 있다. 방금 새로 발행 상태가 된 것이라면 실제로 발행되는 지금 날짜로
    // 맞춘다 (스케줄 발행 때 발행일자를 예약 시각으로 맞추는 것과 같은 원칙).
    if (status === 'published' && art.status !== 'published') {
      date = new Date().toLocaleDateString("ko-KR").replace(/\s/g, '').slice(0, -1);
      const dateInput = document.getElementById("form-date");
      if (dateInput) dateInput.value = date;
    }

    art.title = title;
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
    art.imageCaption = imageCaption;

    // Workflow updates
    if (status !== art.status) {
      art.status = status;
      if (status === 'approved' || status === 'published' || status === 'scheduled' || status === 'correction') {
        art.approver = approver;
        art.byline = `${approver} 기자`;
        art.approvedAt = new Date().toISOString();
      } else {
        art.approver = null;
        art.byline = "";
        art.approvedAt = null;
      }
    }
    art.scheduledAt = status === 'scheduled' ? scheduledAt : null;

    // Add to revision log -- only when there was an actual status transition
    if (revisionMsg) {
      if (!art.revisionHistory) art.revisionHistory = [];
      art.revisionHistory.push({
        date: new Date().toLocaleString("ko-KR"),
        action: revisionMsg
      });
    }

  } else {
    // Create Mode
    const newId = articles.length > 0 ? Math.max(...articles.map(a => a.id)) + 1 : 1;
    actionName = "신규 기사 초안 작성";

    // 수정 이력 only ever logs a 기사 정정 entry -- nothing for a fresh draft,
    // even one created directly as published/scheduled.
    const createRevisionHistory = [];
    if (status === 'correction') {
      createRevisionHistory.push({
        date: new Date().toLocaleString("ko-KR"),
        action: `기사 내용 정정 (승인인: ${approver})`
      });
    }

    art = {
      id: newId,
      title,
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
      approver: (status === 'approved' || status === 'published' || status === 'scheduled' || status === 'correction') ? approver : null,
      byline: (status === 'approved' || status === 'published' || status === 'scheduled' || status === 'correction') ? `${approver} 기자` : "",
      draftedBy: "홍길동",
      approvedAt: (status === 'approved' || status === 'published' || status === 'scheduled' || status === 'correction') ? new Date().toISOString() : null,
      scheduledAt: status === 'scheduled' ? scheduledAt : null,
      revisionHistory: createRevisionHistory,
      seoTitle,
      seoMeta,
      slug,
      imageCaption,
      isYMYL
    };
  }

  // Save via adapter
  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveArticle(art);
  }
  await logAudit(actionName, art.id, `제목: ${title} | 담당자 피드백: ${rejectionNote || '특이사항 없음'}`);

  // saveArticle() silently falls back to LocalStorage-only if the Supabase
  // write itself fails (missing column, RLS policy, etc.) without
  // surfacing that to the caller -- the alert below used to fire
  // unconditionally regardless of which one actually happened, so a
  // fallback-only save looked identical to a real one. Verify directly
  // against the database instead of trusting a bare success return.
  if (window.SupabaseAdapter && window.SupabaseAdapter.isConfigured()) {
    const verify = await window.SupabaseAdapter.fetchArticleById(art.id);
    if (!verify || verify.title !== art.title) {
      alert("⚠ 이 기사가 Supabase(공용 데이터베이스)에 저장되지 않고 이 브라우저에만 저장되었습니다. 기사 목록/사이트에 안 보일 수 있습니다. Supabase 콘솔에서 articles 테이블 구조와 권한(RLS)을 확인해 주세요.");
      hideArticleForm();
      return;
    }
  }

  alert("기사와 편집 설정이 정상적으로 저장되었습니다.");
  hideArticleForm();
}

// Soft delete
function softDeleteArticleInForm() {
  if (!currentEditingId) return;
  openDeleteChoiceModal([currentEditingId], 'form');
}

// 5. AI Assisted Article Generation Engine
// 4 modes: 주제 입력, 링크 재구성, 오늘의 화제 기사(네이버 랭킹), 정보성 기사 추천
let activeAiMode = 'topic';
let generatedDraftData = null;

const AI_CATEGORY_LABELS = {
  culture: "문화·생활",
  economy: "경제·산업",
  tech: "기술·미디어",
  local: "지역·평택",
  opinion: "오피니언"
};

function switchAiMode(mode) {
  activeAiMode = mode;
  document.querySelectorAll(".ai-input-group").forEach(el => el.style.display = "none");
  document.getElementById(`ai-input-${mode}`).style.display = "block";
}

function setAiLoaderText(text) {
  const el = document.querySelector("#ai-loader h4");
  if (el) el.textContent = text;
}

// Shared target length (character count, excluding whitespace) for all 4 generation modes
function getTargetLength() {
  const el = document.getElementById("ai-target-length");
  const val = el ? parseInt(el.value, 10) : NaN;
  return (!isNaN(val) && val > 0) ? val : 1500;
}

// Shared SEO instructions injected into every generation prompt (Naver/Daum/Google)
const SEO_PROMPT_INSTRUCTIONS = `
[검색엔진 최적화(SEO) 지침 - 네이버·다음·구글 공통]
- 이 기사의 핵심 키워드 1~2개를 스스로 정하고, 제목 앞부분에 자연스럽게 포함시키십시오.
- "title"과 "seoTitle"은 실질적으로 같은 의미를 유지해야 합니다. 네이버·다음은 검색 노출 제목과 실제 기사 제목이 다른 낚시성 제목에 불이익을 줍니다.
- 리드 문단(lead)의 첫 2~3문장 안에 핵심 키워드가 자연스럽게 등장하도록 작성하십시오.
- 본문의 <h2> 소제목에도 핵심 키워드 또는 연관 키워드를 자연스럽게 포함시키십시오.
- 키워드를 부자연스럽게 반복(키워드 스터핑)하지 마십시오.
`;

const SEO_JSON_FIELDS_INSTRUCTIONS = `
5. "seoTitle": 검색결과 노출용 제목. 핵심 키워드를 앞부분에 포함하고 실제 title과 의미가 동일해야 함 (60자 이내 권장)
6. "seoMeta": 검색결과 메타 설명. 핵심 키워드를 자연스럽게 포함하는 클릭 유도형 요약 (120~155자 내외)
7. "slug": 핵심 키워드를 반영한 짧은 영문/로마자 URL 슬러그 (소문자와 하이픈만 사용, 예: pyeongtaek-support-fund)
8. "keywords": 핵심 키워드 배열 (3~5개 문자열)
`;

function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Repairs the single most common way Gemini/Claude break their own
// requested JSON: a literal newline/tab/carriage-return left un-escaped
// inside a string value -- very likely whenever a field asks for multi-line
// content (e.g. shorts' scriptMd, a "타임라인 표 형태" markdown document).
// A raw control character inside a JSON string is invalid and JSON.parse()
// rejects the entire response over it. This walks the text char-by-char
// tracking whether we're inside a quoted string (respecting \" escapes)
// and escapes any raw control character found there, leaving whitespace
// between actual JSON tokens (indentation, etc.) untouched.
function repairJsonControlCharsInStrings(text) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        result += ch;
        escaped = false;
      } else if (ch === '\\') {
        result += ch;
        escaped = true;
      } else if (ch === '"') {
        result += ch;
        inString = false;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (ch === '\t') {
        result += '\\t';
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

// 두 번째로 흔한 파손 패턴: 대본 안에 따옴표로 인용한 말("이건 사기다"
// 같은)이 있을 때, 모델이 그 안쪽 따옴표를 \"로 이스케이프하지 않고
// 그대로 두는 경우. repairJsonControlCharsInStrings()의 단순 토글
// 방식으로는 이 안쪽 따옴표에서 문자열이 끝난 것으로 잘못 판단해버려서
// (그 결과 나머지 글자가 JSON 구조 바깥의 날텍스트로 취급되어) "Expected
// ',' or '}' after property value" 에러가 난다. 따옴표를 만날 때마다
// 그 다음 의미있는 문자가 , } ] : 중 하나(=진짜 문자열 종료)인지 아니면
// 글자/숫자 등(=이스케이프 누락)인지 미리 살펴봐서 판단한다. 제어 문자
// 이스케이프도 같은 문자열 상태 추적을 공유해야 정확하므로 한 번에
// 처리한다.
function repairJsonStringIssues(text) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        result += ch;
        escaped = false;
      } else if (ch === '\\') {
        result += ch;
        escaped = true;
      } else if (ch === '"') {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        const next = text[j];
        if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') {
          result += ch;
          inString = false;
        } else {
          result += '\\"';
        }
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (ch === '\t') {
        result += '\\t';
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

function parseAiJsonResponse(resultText) {
  const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleanedText);
  } catch (err) {
    try {
      return JSON.parse(repairJsonControlCharsInStrings(cleanedText));
    } catch (err2) {
      try {
        return JSON.parse(repairJsonStringIssues(cleanedText));
      } catch (err3) {
        console.error("AI output parsing failed. Raw text:", resultText);
        throw new Error("AI 응답 결과 파싱에 실패했습니다: " + err.message);
      }
    }
  }
}

// Builds the system-instruction style prompt + few-shot samples for a selected style id
async function buildStylePromptFromSelection(styleId) {
  if (!styleId) {
    return { stylePrompt: "정직하고 깊이 있는 저널리즘 스타일로 작성해 주세요.", fewShotPrompt: "" };
  }
  const styles = await window.SupabaseAdapter.fetchWritingStyles();
  const style = styles.find(s => s.id === styleId);
  if (!style) {
    return { stylePrompt: "정직하고 깊이 있는 저널리즘 스타일로 작성해 주세요.", fewShotPrompt: "" };
  }

  const stylePrompt = `
당신은 다음 스타일 가이드라인을 엄격하게 지켜 기사를 작성해야 합니다:
- 매체/논조 스타일: ${style.name}
- 주요 톤앤매너 설명: ${style.description}
- 반드시 준수해야 할 스타일 규칙:
${(style.styleRules || []).map(r => `  * ${r}`).join('\n')}
`;

  let fewShotPrompt = "";
  const samples = await window.SupabaseAdapter.fetchWritingSamples(styleId);
  if (samples && samples.length > 0) {
    const latestSamples = samples.slice(0, 2);
    fewShotPrompt = `
아래는 당신이 모방해야 할 이 스타일의 실제 기사 예시(Few-shot)입니다. 톤앤매너, 문체, 문장 구성, 헤드라인 느낌을 완벽하게 따라 하십시오.

${latestSamples.map((s, idx) => `
[기사 예시 ${idx + 1}]
- 제목: ${s.title}
- 본문 요약:
${s.content.substring(0, 800)}
---
`).join('\n')}
`;
  }

  return { stylePrompt, fewShotPrompt };
}

// ---- Mode 1: 주제 입력 ----
async function generateTopicDraft() {
  const topic = document.getElementById("ai-topic-input").value.trim();
  const providedContent = document.getElementById("ai-topic-content").value.trim();
  const category = document.getElementById("ai-topic-category").value;
  const styleId = document.getElementById("ai-topic-style").value;

  if (!topic) throw new Error("기사 주제 키워드를 입력해 주세요.");

  const { stylePrompt, fewShotPrompt } = await buildStylePromptFromSelection(styleId);
  const targetLength = getTargetLength();

  const contentBlock = providedContent
    ? `\n[제공된 취재 내용 - 반드시 이 내용에 기반하여 작성하고, 사실관계를 임의로 지어내지 마십시오]\n${providedContent}\n`
    : `\n[취재 내용]\n별도로 제공된 취재 내용이 없습니다. 주제를 바탕으로 신뢰할 수 있는 수준에서 기사를 직접 작성하십시오.\n`;

  const prompt = `
제공된 주제와 지침을 바탕으로 신뢰감 있고 완성도 높은 뉴스 기사를 작성하십시오.

[작성할 기사 주제]
${topic}
${contentBlock}
[카테고리]
${category}

${fewShotPrompt}
${SEO_PROMPT_INSTRUCTIONS}

[작성 지침]
반드시 다음 구조의 JSON 형식으로만 답변하십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 JSON 오브젝트 자체만 출력해야 합니다.
1. "title": 지정된 논조 스타일을 완벽하게 따르고 핵심 키워드를 포함한 기사 제목
2. "lead": 독자의 관심을 끄는 2~3문장의 흡입력 있는 리드 문단
3. "body": 2개 이상의 <h2> 소제목을 포함하고 적절한 <p> 단락들로 구성된 뉴스 본문 HTML 코드. 문장 어조와 관점은 지정된 논조 스타일을 완벽하게 재현해야 합니다. (전체 분량 공백 제외 ${targetLength}자 내외로 상세하게 작성)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callClaudeApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, lead: draft.lead, body: draft.body, category,
    seoTitle: draft.seoTitle, seoMeta: draft.seoMeta, slug: draft.slug, keywords: draft.keywords
  };
}

// ---- Mode 2: 링크 재구성 ----
async function generateLinkDraft() {
  const styleId = document.getElementById("ai-link-style").value;
  const url = document.getElementById("ai-link-url").value.trim();
  const rawText = document.getElementById("ai-link-raw-text").value.trim();
  const category = document.getElementById("ai-link-category").value;

  if (!url && !rawText) {
    throw new Error("출처 링크(URL) 또는 기사 본문 텍스트 중 하나는 반드시 기재해야 합니다.");
  }

  let articleText = rawText;
  if (!articleText && url) {
    setAiLoaderText("외부 링크에서 본문을 가져오는 중입니다 (CORS 우회 프록시 사용)...");
    try {
      articleText = await scrapeExternalLink(url);
    } catch (err) {
      throw new Error("외부 기사 크롤링에 실패했습니다. 본문 텍스트를 직접 붙여넣어 주세요.");
    }
  }

  if (!articleText || articleText.length < 50) {
    throw new Error("가져온 기사 본문이 너무 짧거나 비어 있습니다. 기사 본문을 직접 붙여넣어 주세요.");
  }

  const { stylePrompt, fewShotPrompt } = await buildStylePromptFromSelection(styleId);
  const targetLength = getTargetLength();

  setAiLoaderText("원문을 분석하고 새로운 관점의 기사로 재구성하는 중...");

  const prompt = `
아래 원천 기사의 핵심 사실관계나 주제를 참고하되, 절대 원문을 그대로 베끼지 말고 지정된 논조 스타일로 완전히 새로 집필하십시오. 다른 각도, 다른 취재원, 다른 구성으로 독창적인 기사를 작성해야 합니다.

[원천 기사 본문]
${articleText.substring(0, 4000)}

[카테고리]
${category}

${fewShotPrompt}
${SEO_PROMPT_INSTRUCTIONS}

[작성 지침]
반드시 다음 구조의 JSON 형식으로만 답변하십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 JSON 오브젝트 자체만 출력해야 합니다.
1. "title": 위 [원천 기사 본문]에 쓰인 단어 선택·어순·문장 구조와 뚜렷하게 다른 완전히 새로운 제목. 원문 제목을 살짝 다듬은 정도가 아니라, 같은 소재를 다른 관점(원인, 결과, 반응, 전망, 구체적 수치 등)에서 새로 지어라. 지정된 논조 스타일이 드러나야 하며, 고유명사·핵심 수치 등 사실관계상 꼭 필요한 단어 외에는 원문의 표현을 그대로 재사용하지 마라.
2. "lead": 독자의 관심을 끄는 2~3문장의 리드 문단
3. "body": 2개 이상의 <h2> 소제목과 <p> 단락으로 구성된 새 기사 본문 HTML (전체 분량 공백 제외 ${targetLength}자 내외)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callClaudeApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, lead: draft.lead, body: draft.body, category,
    seoTitle: draft.seoTitle, seoMeta: draft.seoMeta, slug: draft.slug, keywords: draft.keywords
  };
}

// ---- Mode 3: 오늘의 화제 기사 (네이버 랭킹 뉴스) ----
let trendingArticles = [];
let selectedTrendingArticle = null;

// Fetches a clean, readable-text/markdown rendition of a page via r.jina.ai --
// a free "reader" proxy purpose-built for exactly this (LLM-friendly content
// extraction), and in practice far more reliable than raw-HTML CORS proxies,
// which are prone to timeouts (allorigins.win) or now block unauthenticated
// requests outright (corsproxy.io -> HTTP 403).
async function fetchViaJinaReader(targetUrl) {
  const response = await fetch(`https://r.jina.ai/${targetUrl}`);
  if (!response.ok) throw new Error("HTTP error " + response.status);
  return await response.text();
}

// Fetches a URL's raw HTML through a public CORS proxy -- used as a fallback
// when the jina.ai reader is unavailable. Retries once per proxy and falls
// back to a second proxy before giving up.
async function fetchViaCorsProxy(targetUrl) {
  const proxyUrls = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`
  ];

  let lastError;
  for (const proxyUrl of proxyUrls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("HTTP error " + response.status);
        return await response.text();
      } catch (err) {
        lastError = err;
        if (attempt === 0) await new Promise(r => setTimeout(r, 1200));
      }
    }
  }
  throw lastError;
}

// Naver's ranking page markdown (via jina.ai) renders each headline as a
// standard [title](article-url) link -- pull those out directly instead of
// needing DOM/CSS selectors that break whenever Naver changes its markup.
function parseNaverTrendingFromMarkdown(markdown) {
  const linkRegex = /\[([^\]]{8,80})\]\((https:\/\/n\.news\.naver\.com\/article\/[^)]+)\)/g;
  const seen = new Set();
  const unique = [];
  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    const title = match[1].trim();
    const url = match[2];
    if (!seen.has(title)) {
      seen.add(title);
      unique.push({ title, url });
    }
    if (unique.length >= 30) break;
  }
  return unique;
}

async function fetchNaverTrending() {
  const targetUrl = 'https://news.naver.com/main/ranking/popularDay.naver';

  try {
    const markdown = await fetchViaJinaReader(targetUrl);
    const items = parseNaverTrendingFromMarkdown(markdown);
    if (items.length > 0) return items;
  } catch (err) {
    console.warn("jina.ai reader 실패, HTML 프록시로 재시도합니다:", err);
  }

  const html = await fetchViaCorsProxy(targetUrl);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const extract = (selector) => {
    const out = [];
    doc.querySelectorAll(selector).forEach(a => {
      const title = (a.textContent || "").trim();
      const href = a.getAttribute("href") || "";
      if (title.length >= 8 && href.includes("/article/")) {
        out.push({ title, url: href.startsWith("http") ? href : `https://news.naver.com${href}` });
      }
    });
    return out;
  };

  let items = extract(".rankingnews_list .list_title");
  if (items.length === 0) items = extract("a.list_title");
  if (items.length === 0) items = extract("a[href*='/article/']");

  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (!seen.has(item.title)) {
      seen.add(item.title);
      unique.push(item);
    }
    if (unique.length >= 30) break;
  }

  if (unique.length === 0) {
    throw new Error("네이버 랭킹 뉴스 목록을 파싱하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return unique;
}

async function loadTrendingArticles() {
  const listEl = document.getElementById("trending-list");
  const btn = document.getElementById("trending-load-btn");
  if (!listEl) return;
  listEl.innerHTML = '<div class="help-text">네이버 랭킹 뉴스를 불러오는 중...</div>';
  if (btn) btn.disabled = true;
  try {
    trendingArticles = await fetchNaverTrending();
    selectedTrendingArticle = null;
    renderTrendingList();
  } catch (err) {
    listEl.innerHTML = `<div class="help-text" style="color:#ef4444;">${err.message}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderTrendingList() {
  const listEl = document.getElementById("trending-list");
  if (!listEl) return;
  if (trendingArticles.length === 0) {
    listEl.innerHTML = '<div class="help-text">불러온 화제 뉴스가 없습니다.</div>';
    return;
  }
  listEl.innerHTML = trendingArticles.map((item, i) => `
    <label class="trending-item">
      <input type="radio" name="trending-pick" value="${i}" onchange="selectTrendingArticle(${i})">
      <span>${item.title}</span>
      ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="trending-item-link" title="원문 기사 새 탭으로 열기" onclick="event.stopPropagation()">↗</a>` : ''}
    </label>
  `).join('');
}

function selectTrendingArticle(i) {
  selectedTrendingArticle = trendingArticles[i];
}

async function generateTrendingDraft() {
  if (!selectedTrendingArticle) {
    throw new Error("먼저 '네이버 화제 뉴스 불러오기'로 목록을 불러오고 기사를 하나 선택해 주세요.");
  }
  const styleId = document.getElementById("ai-trending-style").value;
  const category = document.getElementById("ai-trending-category").value;

  setAiLoaderText("선택한 화제 기사 원문을 가져오는 중...");
  let sourceText = "";
  try {
    sourceText = await scrapeExternalLink(selectedTrendingArticle.url);
  } catch (err) {
    sourceText = "";
  }

  // Claude로 배경 자료 보강 -- 원문 스크랩은 CORS 프록시에 의존해 실패하기 쉬우므로,
  // 성공 여부와 무관하게 배경지식으로 맥락을 추가 수집해 둔다. 글쓰기 자체도
  // 그대로 Claude가 담당한다 (예전엔 이 조사 단계만 Gemini였으나 Claude로 통일).
  setAiLoaderText("Claude로 배경 자료를 수집하는 중...");
  let researchNotes = "";
  try {
    researchNotes = await callClaudeApi(
      `"${selectedTrendingArticle.title}"라는 오늘의 화제 뉴스 제목에 대해, 이 사안의 배경, 관련 맥락, 일반적으로 알려진 사실관계를 한국어로 5~8문장으로 정리해 주십시오. 확실하지 않은 내용은 추측하지 말고, 알려진 배경 정보 위주로 작성하십시오.`,
      "당신은 신속하게 뉴스 배경 자료를 조사해 정리하는 리서치 어시스턴트입니다."
    );
  } catch (err) {
    console.warn("Claude 자료수집 실패, 스크랩 원문만 사용합니다:", err);
  }

  if (!sourceText || sourceText.length < 50) {
    sourceText = selectedTrendingArticle.title;
  }

  const { stylePrompt, fewShotPrompt } = await buildStylePromptFromSelection(styleId);
  const targetLength = getTargetLength();

  setAiLoaderText("오늘의 화제 기사를 참고하여 새로운 기사를 집필하는 중...");

  const prompt = `
아래는 오늘 네이버에서 화제가 된 뉴스의 제목과 관련 자료입니다. 이 사실관계와 화제성을 참고하되, 절대 원문을 그대로 베끼지 말고 완전히 새로운 취재 각도와 문장으로 독창적인 기사를 작성하십시오.

[오늘의 화제 뉴스 제목]
${selectedTrendingArticle.title}

[참고 원문 발췌]
${sourceText.substring(0, 3000)}
${researchNotes ? `\n[Gemini가 수집한 배경 자료]\n${researchNotes}\n` : ''}

[카테고리]
${category}

${fewShotPrompt}
${SEO_PROMPT_INSTRUCTIONS}

[작성 지침]
반드시 다음 구조의 JSON 형식으로만 답변하십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 JSON 오브젝트 자체만 출력해야 합니다.
1. "title": 위 [오늘의 화제 뉴스 제목]과 단어 선택·어순·문장 구조가 겹치지 않는 완전히 다른 제목. 원제목을 살짝 다듬은 정도가 아니라, 같은 소재를 다른 관점(원인, 결과, 반응, 전망, 구체적 수치 등)에서 새로 지어라. 지정된 논조 스타일이 드러나야 하며, 고유명사·핵심 수치 등 사실관계상 꼭 필요한 단어 외에는 원제목의 표현을 그대로 재사용하지 마라.
2. "lead": 독자의 관심을 끄는 2~3문장의 리드 문단
3. "body": 2개 이상의 <h2> 소제목과 <p> 단락으로 구성된 새 기사 본문 HTML (전체 분량 공백 제외 ${targetLength}자 내외)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callClaudeApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, lead: draft.lead, body: draft.body, category,
    seoTitle: draft.seoTitle, seoMeta: draft.seoMeta, slug: draft.slug, keywords: draft.keywords
  };
}

// ---- Mode 4: 정보성 기사 추천 (정책지원금/세금/복지 등 시의성 주제) ----
let infoTopicSuggestions = [];

async function loadInfoTopicSuggestions() {
  const listEl = document.getElementById("info-topic-list");
  const btn = document.getElementById("info-topic-load-btn");
  if (!listEl) return;
  listEl.innerHTML = '<div class="help-text">이 시기에 맞는 추천 주제를 분석 중...</div>';
  if (btn) btn.disabled = true;
  try {
    const dateStr = new Date().toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `
오늘은 ${dateStr}입니다. 대한민국 독자들이 이 시기에 특히 관심을 가질 만한 "정보성 기사" 주제를 5개 추천해 주십시오.
정부 정책지원금, 세금 신고 및 환급금, 노인 복지, 청년 지원금, 연말정산, 각종 신청 마감일 등 실생활에 밀접한 정보를 우선적으로 고려하고, 현재 월/계절에 맞는 시의성을 반드시 반영하십시오.

반드시 다음 구조의 JSON 배열 형식으로만 답변하십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 JSON 배열 자체만 출력해야 합니다.
[
  { "title": "추천 기사 주제", "reason": "왜 지금 이 주제가 시의성이 있는지 1~2문장 설명" }
]
`;
    const resultText = await callGeminiTextApi(prompt, "당신은 대한민국 생활 정보 전문 기자입니다. 반드시 유효한 JSON 배열로만 답하십시오.");
    infoTopicSuggestions = parseAiJsonResponse(resultText);
    renderInfoTopicList();
  } catch (err) {
    listEl.innerHTML = `<div class="help-text" style="color:#ef4444;">추천 주제를 가져오지 못했습니다: ${err.message}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderInfoTopicList() {
  const listEl = document.getElementById("info-topic-list");
  if (!listEl) return;
  if (!infoTopicSuggestions || infoTopicSuggestions.length === 0) {
    listEl.innerHTML = '<div class="help-text">추천 주제가 없습니다.</div>';
    return;
  }
  listEl.innerHTML = infoTopicSuggestions.map((item, i) => `
    <label class="trending-item">
      <input type="radio" name="info-topic-pick" value="${i}" onchange="selectInfoTopic(${i})">
      <span><strong>${item.title}</strong><br><span class="help-text">${item.reason || ''}</span></span>
    </label>
  `).join('');
}

function selectInfoTopic(i) {
  const item = infoTopicSuggestions[i];
  if (!item) return;
  const input = document.getElementById("ai-info-topic-input");
  if (input) input.value = item.title;
}

async function generateInfoDraft() {
  const topic = document.getElementById("ai-info-topic-input").value.trim();
  const category = document.getElementById("ai-info-category").value;
  const styleId = document.getElementById("ai-info-style").value;

  if (!topic) throw new Error("정보성 기사 주제를 추천받거나 직접 입력해 주세요.");

  const { stylePrompt, fewShotPrompt } = await buildStylePromptFromSelection(styleId);
  const targetLength = getTargetLength();

  const prompt = `
아래 생활 정보성 주제를 바탕으로, 독자가 실제로 신청·활용할 수 있도록 구체적이고 실용적인 정보를 담은 뉴스 기사를 작성하십시오. 신청 대상, 조건, 신청 방법, 유의사항 등을 가능한 한 구체적으로 안내하되, 확정되지 않은 수치나 날짜는 단정적으로 서술하지 말고 "관계 기관 공지를 확인해야 한다"는 취지로 안내하십시오.

[정보성 기사 주제]
${topic}

[카테고리]
${category}

${fewShotPrompt}
${SEO_PROMPT_INSTRUCTIONS}

[작성 지침]
반드시 다음 구조의 JSON 형식으로만 답변하십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 JSON 오브젝트 자체만 출력해야 합니다.
1. "title": 독자의 실질적 관심을 끌고 핵심 키워드를 포함한 정보성 기사 제목
2. "lead": 핵심 정보를 요약하는 2~3문장의 리드 문단
3. "body": 2개 이상의 <h2> 소제목과 <p> 단락으로 구성된 본문 HTML (신청 대상/방법/유의사항 등 실용 정보 포함, 전체 분량 공백 제외 ${targetLength}자 내외)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callClaudeApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, lead: draft.lead, body: draft.body, category,
    seoTitle: draft.seoTitle, seoMeta: draft.seoMeta, slug: draft.slug, keywords: draft.keywords
  };
}

// ---- Self-check: every generated draft is graded against admin/check.md ----
async function loadChecklistItems() {
  try {
    const response = await fetch('check.md');
    if (!response.ok) throw new Error("check.md fetch failed with status " + response.status);
    const text = await response.text();

    const items = [];
    let currentSection = "";
    text.split('\n').forEach(line => {
      const sectionMatch = line.match(/^##\s+(.*)/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        return;
      }
      const itemMatch = line.match(/^-\s*\[ \]\s*(.*)/);
      if (itemMatch) {
        items.push({ section: currentSection, text: itemMatch[1].trim() });
      }
    });
    return items;
  } catch (err) {
    console.error("체크리스트(check.md)를 불러오지 못했습니다:", err);
    return [];
  }
}

async function runSelfCheck(draft) {
  const items = await loadChecklistItems();
  if (items.length === 0) return null;

  const checklistText = items.map((it, i) => `${i + 1}. [${it.section}] ${it.text}`).join('\n');
  const plainBody = draft.content.replace(/<[^>]+>/g, ' ');

  const prompt = `
당신은 바이칼 뉴스의 깐깐한 데스크 편집자입니다. 아래 체크리스트 각 항목에 대해 주어진 기사 초안이 통과하는지 냉정하게 평가하십시오. 애매하면 통과(true)가 아니라 실패(false)로 판단하십시오.

[체크리스트]
${checklistText}

[기사 초안]
제목: ${draft.title}
리드: ${draft.lead}
본문: ${plainBody}
카테고리: ${draft.category}
검색 노출 타이틀(SEO title): ${draft.seoTitle}
검색 노출 설명(SEO meta): ${draft.seoMeta}
URL 슬러그: ${draft.slug}

반드시 다음 구조의 JSON 배열로만 답변하십시오. 백틱이나 'json' 마킹 없이, 배열의 순서와 개수를 체크리스트와 정확히 동일하게 맞춰야 합니다.
[
  { "pass": true, "note": "판단 근거를 1문장으로" }
]
`;

  try {
    const resultText = await callClaudeApi(prompt, "당신은 엄격한 저널리즘 데스크 편집자입니다. 반드시 유효한 JSON 배열로만 답하십시오.");
    const results = parseAiJsonResponse(resultText);
    return items.map((it, i) => ({
      section: it.section,
      text: it.text,
      pass: results[i] ? !!results[i].pass : false,
      note: results[i] ? (results[i].note || '') : ''
    }));
  } catch (err) {
    console.error("AI 자체 점검 실패:", err);
    return null;
  }
}

function renderSelfCheckResults(results) {
  const wrapper = document.getElementById("ai-selfcheck-section");
  const container = document.getElementById("ai-selfcheck-body");
  if (!wrapper || !container) return;

  if (!results || results.length === 0) {
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "block";
  const passCount = results.filter(r => r.pass).length;

  const bySection = {};
  results.forEach(r => {
    if (!bySection[r.section]) bySection[r.section] = [];
    bySection[r.section].push(r);
  });

  let html = `<div style="font-weight: 600; margin-bottom: 12px;">${passCount} / ${results.length}개 항목 통과 (check.md 기준, 참고용 자체 점검)</div>`;
  Object.keys(bySection).forEach(section => {
    html += `<div style="margin-bottom: 14px;"><div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 6px; color: var(--admin-text-secondary);">${section}</div>`;
    bySection[section].forEach(r => {
      html += `
        <div class="checklist-item ${r.pass ? 'pass' : 'fail'}">
          <span class="checklist-icon">${r.pass ? '✓' : '✗'}</span>
          <span>${r.text}${r.note ? ` <span class="help-text">— ${r.note}</span>` : ''}</span>
        </div>
      `;
    });
    html += `</div>`;
  });

  container.innerHTML = html;
}

// Dispatch + render the draft output (shared by all 4 modes)
async function generateAiDraft() {
  document.getElementById("ai-empty-state").style.display = "none";
  document.getElementById("ai-draft-viewer").style.display = "none";
  document.getElementById("ai-loader").style.display = "flex";
  setAiLoaderText("AI 뉴스 초안을 작성하는 중...");

  try {
    let result;
    if (activeAiMode === 'topic') {
      result = await generateTopicDraft();
    } else if (activeAiMode === 'link') {
      result = await generateLinkDraft();
    } else if (activeAiMode === 'trending') {
      result = await generateTrendingDraft();
    } else if (activeAiMode === 'info') {
      result = await generateInfoDraft();
    }

    const { headline, lead, body, category, seoTitle, seoMeta, slug, keywords } = result;
    const finalSlug = slugify(slug) || `article-${Date.now()}`;
    const finalKeywords = Array.isArray(keywords) ? keywords : [];

    generatedDraftData = {
      title: headline,
      lead: lead,
      content: body,
      category: category,
      date: new Date().toLocaleDateString("ko-KR").replace(/\s/g, '').slice(0, -1),
      image: "images/news_editorial.png",
      seoTitle: seoTitle || `${headline} - 바이칼 뉴스`,
      seoMeta: seoMeta || lead,
      slug: finalSlug
    };

    document.getElementById("ai-out-headline").textContent = headline;
    document.getElementById("ai-out-lead").textContent = lead;
    document.getElementById("ai-out-body").innerHTML = body;
    document.getElementById("ai-out-seo-title").textContent = generatedDraftData.seoTitle;
    document.getElementById("ai-out-seo-meta").textContent = generatedDraftData.seoMeta;
    document.getElementById("ai-out-slug").textContent = generatedDraftData.slug;
    const keywordsEl = document.getElementById("ai-out-seo-keywords");
    if (keywordsEl) keywordsEl.textContent = finalKeywords.length > 0 ? finalKeywords.join(', ') : '-';

    setAiLoaderText("check.md 체크리스트 기준으로 자체 점검하는 중...");
    const selfCheckResults = await runSelfCheck(generatedDraftData);
    renderSelfCheckResults(selfCheckResults);

    document.getElementById("ai-loader").style.display = "none";
    document.getElementById("ai-draft-viewer").style.display = "block";

  } catch (err) {
    console.error("AI Generation Error:", err);
    document.getElementById("ai-loader").style.display = "none";
    document.getElementById("ai-empty-state").style.display = "block";
    alert("AI 초안 생성 실패: " + err.message);
  }
}

// Clears every mode's inputs and the generated draft/output panel so the
// writer can start over without reloading the page.
function resetAiWriter() {
  // Mode 1: topic
  document.getElementById("ai-topic-input").value = "";
  document.getElementById("ai-topic-content").value = "";
  document.getElementById("ai-topic-style").selectedIndex = 0;
  document.getElementById("ai-topic-category").selectedIndex = 0;

  // Mode 2: link
  document.getElementById("ai-link-style").selectedIndex = 0;
  document.getElementById("ai-link-url").value = "";
  document.getElementById("ai-link-raw-text").value = "";
  document.getElementById("ai-link-category").selectedIndex = 0;

  // Mode 3: trending
  trendingArticles = [];
  selectedTrendingArticle = null;
  const trendingListEl = document.getElementById("trending-list");
  if (trendingListEl) trendingListEl.innerHTML = '<div class="help-text">위 버튼을 눌러 화제 뉴스 목록을 불러오세요.</div>';
  document.getElementById("ai-trending-style").selectedIndex = 0;
  document.getElementById("ai-trending-category").selectedIndex = 0;

  // Mode 4: info
  infoTopicSuggestions = [];
  const infoListEl = document.getElementById("info-topic-list");
  if (infoListEl) infoListEl.innerHTML = '<div class="help-text">위 버튼을 눌러 추천 주제를 불러오세요.</div>';
  document.getElementById("ai-info-topic-input").value = "";
  document.getElementById("ai-info-style").selectedIndex = 0;
  document.getElementById("ai-info-category").selectedIndex = 0;

  // Output panel
  generatedDraftData = null;
  document.getElementById("ai-draft-viewer").style.display = "none";
  document.getElementById("ai-empty-state").style.display = "block";
  document.getElementById("ai-loader").style.display = "none";

  const selfCheckSection = document.getElementById("ai-selfcheck-section");
  if (selfCheckSection) selfCheckSection.style.display = "none";
}

// Transfer AI draft to form editor
async function transferAiDraftToEditor() {
  if (!generatedDraftData) return;

  await showArticleCreateForm();

  // Populate editor form with AI draft data
  document.getElementById("form-title").value = generatedDraftData.title;
  document.getElementById("form-lead").value = generatedDraftData.lead;
  document.getElementById("form-content").innerHTML = generatedDraftData.content;
  document.getElementById("form-category").value = generatedDraftData.category;
  document.getElementById("form-date").value = generatedDraftData.date;
  setFormImageValue(generatedDraftData.image);
  document.getElementById("form-seo-title").value = generatedDraftData.seoTitle;
  document.getElementById("form-seo-meta").value = generatedDraftData.seoMeta;
  document.getElementById("form-slug").value = generatedDraftData.slug;
  
  // Set draft state
  document.getElementById("form-status").value = "draft";
  onStatusChangeInForm("draft");
  updateContentCharCount();

  alert("인공지능 초안 데이터가 편집기 폼으로 안전하게 전송되었습니다. 오탈자를 다듬고 추가 취재를 반영한 후 검토 요청 및 최종 데스크 서명을 획득하세요.");
}

// 6. Homepage News Curation Panel
// Cached so the 10 preview updates don't each re-fetch the article list
let curationArticlesCache = [];
const CURATION_POPULAR_COUNT = 5;

// js/main.js의 getOrderedPopularArticles()와 동일한 5일 윈도우 + 백필 로직을
// 그대로 맞춘다 -- 이게 다르면 이 관리자 미리보기가 실제 공개 사이트와
// 다른 목록/순서를 보여주는 불일치가 생긴다. 예전에는 이 순서를 관리자가
// 수동으로 저장해 고정할 수 있었는데, 그 저장된 순서가 조회수가 계속
// 바뀌어도 그대로 남아있어 "실시간 인기기사가 안 바뀐다"는 원인이 됐다 --
// 그래서 수동 재배치 기능 자체를 없애고 항상 실시간 자동 계산만 보여준다.
function computeAutoPopularIds(published, count) {
  const WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - WINDOW_MS;
  const publishedTime = a => new Date(a.approvedAt || a.scheduledAt || 0).getTime() || 0;
  const byViewsDesc = (a, b) => (b.views || 0) - (a.views || 0);

  const recent = published.filter(a => publishedTime(a) >= cutoff).sort(byViewsDesc);
  const top = recent.slice(0, count);

  if (top.length < count) {
    const usedIds = new Set(top.map(a => a.id));
    const backfill = published
      .filter(a => !usedIds.has(a.id))
      .sort(byViewsDesc)
      .slice(0, count - top.length);
    top.push(...backfill);
  }

  return top.map(a => a.id);
}

async function populateCurationDropdowns() {
  const publishedSelects = [
    "curate-latest-1", "curate-latest-2", "curate-latest-3"
  ];

  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  const published = articles.filter(a => a.status === 'published');
  curationArticlesCache = published;

  publishedSelects.forEach(selectId => {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;

    if (published.length === 0) {
      selectEl.innerHTML = `<option value="">발행된 기사가 없습니다.</option>`;
      return;
    }

    // Readable option text: title first, then human category label + date
    let optionsHTML = '<option value="">-- 자동 / 비워두기 --</option>';
    published.forEach(art => {
      const label = AI_CATEGORY_LABELS[art.category] || art.category;
      optionsHTML += `<option value="${art.id}">${art.title} · ${label} · ${art.date}</option>`;
    });
    selectEl.innerHTML = optionsHTML;
  });

  // Load currently set values
  let curation = {};
  if (window.SupabaseAdapter) {
    curation = await window.SupabaseAdapter.fetchCuration();
  }

  const applyValues = (ids, prefix) => {
    (ids || []).forEach((id, i) => {
      const el = document.getElementById(`${prefix}-${i + 1}`);
      if (el && id) el.value = id;
    });
  };

  applyValues(curation.latestNewsIds, "curate-latest");

  // 많이 읽은 인기 기사: 관리자가 손댈 수 있는 값이 없다 -- 항상 최근 5일
  // 조회수 기준 실시간 자동 계산 결과를 그대로 보여준다 (읽기 전용 미리보기).
  renderCurationPopularList(computeAutoPopularIds(published, CURATION_POPULAR_COUNT));

  // Render the initial preview for every slot
  publishedSelects.forEach(selectId => updateCurationPreview(selectId));
}

function renderCurationPopularList(popularIds) {
  const container = document.getElementById("curate-pop-auto-list");
  if (!container) return;

  if (popularIds.length === 0) {
    container.innerHTML = `<div class="help-text">조회수가 집계된 발행 기사가 없습니다.</div>`;
    return;
  }

  container.innerHTML = popularIds.map((id, i) => {
    const art = curationArticlesCache.find(a => a.id === id);
    if (!art) return '';
    const imageUrl = /^https?:\/\//i.test(art.image || '') ? art.image : `https://baikalnews.com/${art.image || 'images/news_editorial.png'}`;
    return `
      <div style="display:flex; align-items:center; gap:10px; border:1px solid var(--admin-border); border-radius:6px; padding:8px;">
        <span style="font-weight:700; color: var(--admin-text-muted); width: 18px; text-align:center;">${i + 1}</span>
        <img src="${imageUrl}" alt="" crossorigin="anonymous" style="width:44px; height:44px; object-fit:cover; border-radius:4px; flex-shrink:0;" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${art.title}</div>
          <div style="font-size:0.72rem; color:var(--admin-text-secondary);">조회수 ${(art.views || 0).toLocaleString("ko-KR")}회</div>
        </div>
      </div>
    `;
  }).join('');
}

// Shows a small thumbnail + title under a curation <select> for whatever
// article is currently chosen in it, so editors don't have to guess from
// the option text alone.
function updateCurationPreview(selectId) {
  const selectEl = document.getElementById(selectId);
  const previewEl = document.getElementById('preview-' + selectId);
  if (!selectEl || !previewEl) return;

  const id = parseInt(selectEl.value, 10);
  if (isNaN(id)) {
    previewEl.innerHTML = '';
    return;
  }

  const art = curationArticlesCache.find(a => a.id === id);
  if (!art) {
    previewEl.innerHTML = '';
    return;
  }

  const imageUrl = /^https?:\/\//i.test(art.image || '') ? art.image : `https://baikalnews.com/${art.image || 'images/news_editorial.png'}`;
  previewEl.innerHTML = `
    <div class="curation-preview-card">
      <img src="${imageUrl}" alt="" crossorigin="anonymous" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
      <span>${art.title}</span>
    </div>
  `;
}

async function saveCurationSettings() {
  const readSlots = (prefix, count) => {
    const ids = [];
    for (let i = 1; i <= count; i++) {
      const val = parseInt(document.getElementById(`${prefix}-${i}`).value, 10);
      if (!isNaN(val)) ids.push(val);
    }
    return ids;
  };

  const newCuration = {
    latestNewsIds: readSlots("curate-latest", 3),
    editorsPicksIds: [],
    pinnedIds: []
  };

  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveCuration(newCuration);

    // saveCuration() silently falls back to LocalStorage-only if the Supabase
    // write itself fails (e.g. a missing column or RLS issue), without
    // surfacing that failure -- verify directly against the database instead
    // of trusting the success alert we're about to show.
    if (window.SupabaseAdapter.isConfigured && window.SupabaseAdapter.isConfigured()) {
      const verify = await window.SupabaseAdapter.fetchCuration();
      const matches = verify &&
        JSON.stringify(verify.latestNewsIds || []) === JSON.stringify(newCuration.latestNewsIds);
      if (!matches) {
        alert("큐레이션 저장이 데이터베이스에 반영되지 않았습니다. Supabase의 curation 테이블에 latest_news_ids 컬럼이 있는지, UPDATE 권한(RLS 정책)이 있는지 확인해 주세요.");
        return;
      }
    }
  }
  await logAudit("홈화면 큐레이션 개정", null, "최신 보도 슬롯 재배포함 (대표 헤드라인은 자동 최신순, 인기 기사는 자동 실시간 집계).");
  alert("홈화면 뉴스 배치 큐레이션이 정상 배포되었습니다. 독자 사이트에서 즉시 노출이 갱신됩니다.");
}

// Settings tab: switches between its three merged sub-pages (정적 페이지
// 관리 / 감사 로그 / 관리자 정보 관리), loading each sub-page's data on
// first visit rather than eagerly for all three.
function switchSettingsSubTab(key, btnEl) {
  document.querySelectorAll(".settings-subtab-btn").forEach(btn => {
    btn.classList.remove("btn-admin-primary");
    btn.classList.add("btn-admin-secondary");
  });
  if (btnEl) {
    btnEl.classList.remove("btn-admin-secondary");
    btnEl.classList.add("btn-admin-primary");
  }

  document.querySelectorAll(".settings-subtab-content").forEach(el => {
    el.style.display = "none";
  });
  const target = document.getElementById("settings-subtab-" + key);
  if (target) target.style.display = "block";

  if (key === "audit") {
    renderAuditLogs();
  } else if (key === "admins") {
    renderAdminsList();
  }
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
    // Load custom content if override exists, otherwise load the real live-page content fallback
    editorEl.innerHTML = overrides[currentStaticPageKey] || DEFAULT_PAGE_CONTENTS[currentStaticPageKey] || "";
  }
}

async function saveStaticPages() {
  const html = document.getElementById("page-html-editor").innerHTML;

  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveStaticPage(currentStaticPageKey, html);
  }

  await logAudit("정적 페이지 법률선언 개정", null, `문서 키: ${currentStaticPageKey} 의 내용을 수정함.`);
  alert(`정적 문서 '${currentStaticPageKey.toUpperCase()}' 변경사항이 정상 공시되었습니다.`);
}

// Rich text editor toolbar commands (WYSIWYG for the static page manager)
function rteExec(command, value, targetId = 'page-html-editor') {
  const editorEl = document.getElementById(targetId);
  if (!editorEl) return;
  editorEl.focus();
  document.execCommand(command, false, value || null);
}

// Pasting normally carries over the source's own font/size/color as inline
// styles, which then override this editor's (and the site's) typography.
// Force plain text on paste so pasted content always inherits whatever
// font/size is defined here, regardless of where it was copied from.
function handleRichEditorPaste(event) {
  event.preventDefault();
  const text = (event.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
}

function rteInsertLink(targetId = 'page-html-editor') {
  const url = prompt("삽입할 링크 주소(URL)를 입력하세요:", "https://");
  if (url) rteExec("createLink", url, targetId);
}

function rteInsertImage(inputId = 'rte-image-input') {
  document.getElementById(inputId).click();
}

function rteHandleImageFile(event, targetId = 'page-html-editor') {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => rteExec("insertImage", e.target.result, targetId);
  reader.readAsDataURL(file);
  event.target.value = "";
}

// 8. Media Library Selector & simulated image prompts generator
let modalMode = 'select'; // select | generate

// Clears the AI image prompt panel so a stale prompt from a previously-edited
// article doesn't linger into a new article-editor session.
function resetAiImagePromptFields() {
  const promptEl = document.getElementById("ai-image-prompt");
  const moodEl = document.getElementById("ai-image-mood");
  const focusEl = document.getElementById("ai-image-focus");
  if (promptEl) promptEl.value = "";
  if (moodEl) moodEl.value = "";
  if (focusEl) focusEl.value = "";
}

let mediaLibraryCurrentPage = 1;
const MEDIA_LIBRARY_PAGE_SIZE = 12;

function openMediaLibraryModal() {
  document.getElementById("media-library-modal").classList.add("active");
  switchModalMediaTab('select');
  mediaLibraryCurrentPage = 1;
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

  const totalPages = Math.max(1, Math.ceil(mediaList.length / MEDIA_LIBRARY_PAGE_SIZE));
  if (mediaLibraryCurrentPage > totalPages) mediaLibraryCurrentPage = totalPages;
  if (mediaLibraryCurrentPage < 1) mediaLibraryCurrentPage = 1;

  const startIdx = (mediaLibraryCurrentPage - 1) * MEDIA_LIBRARY_PAGE_SIZE;
  const pageItems = mediaList.slice(startIdx, startIdx + MEDIA_LIBRARY_PAGE_SIZE);

  gridEl.innerHTML = pageItems.map(src => {
    const filename = src.substring(src.lastIndexOf('/') + 1);
    const isSelected = selectedMediaImage === src;
    const displaySrc = /^https?:\/\//i.test(src) ? src : `https://baikalnews.com/${src}`;
    const safeSrc = src.replace(/'/g, "\\'");
    return `
      <div class="media-card ${isSelected ? 'selected' : ''}" onclick="selectMediaCard(this, '${safeSrc}')">
        <div class="media-card-actions">
          <button type="button" class="media-action-btn" title="다운로드" onclick="event.stopPropagation(); downloadMediaItem('${safeSrc}')">다운</button>
          <button type="button" class="media-action-btn media-action-danger" title="삭제" onclick="event.stopPropagation(); deleteMediaItem('${safeSrc}')">삭제</button>
        </div>
        <img src="${displaySrc}" class="media-img" crossorigin="anonymous" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
        <div class="media-card-info">${filename}</div>
      </div>
    `;
  }).join('');

  renderMediaLibraryPagination(totalPages);
}

function renderMediaLibraryPagination(totalPages) {
  const paginationEl = document.getElementById("modal-media-pagination");
  if (!paginationEl) return;

  if (totalPages <= 1) {
    paginationEl.innerHTML = '';
    return;
  }

  let buttons = '';
  for (let p = 1; p <= totalPages; p++) {
    buttons += `<button type="button" class="btn-admin ${p === mediaLibraryCurrentPage ? 'btn-admin-primary' : 'btn-admin-secondary'}" style="padding:6px 12px; min-width:36px;" onclick="changeMediaLibraryPage(${p})">${p}</button>`;
  }

  paginationEl.innerHTML = `<div style="display:flex; gap:6px; justify-content:center; margin-top:16px; flex-wrap:wrap;">${buttons}</div>`;
}

function changeMediaLibraryPage(page) {
  mediaLibraryCurrentPage = page;
  renderMediaLibraryGrid();
}

function selectMediaCard(cardEl, src) {
  selectedMediaImage = src;
  document.querySelectorAll(".media-card").forEach(c => c.classList.remove("selected"));
  cardEl.classList.add("selected");
}

// Downloads a media library image to the admin's computer as a file
async function downloadMediaItem(src) {
  const displaySrc = /^https?:\/\//i.test(src) ? src : `https://baikalnews.com/${src}`;
  try {
    const res = await fetch(displaySrc);
    if (!res.ok) throw new Error(`다운로드 실패 (HTTP ${res.status})`);
    const blob = await res.blob();
    const filename = src.substring(src.lastIndexOf('/') + 1) || 'image.jpg';

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error("이미지 다운로드 실패:", err);
    alert("이미지 다운로드에 실패했습니다: " + err.message);
  }
}

// Remove an entry from the media library list, and best-effort delete the
// underlying file from Supabase Storage if it's one of our own uploaded/
// AI-generated images (local repo assets like images/xxx.png can't be
// deleted from the browser -- this only removes them from the picker list).
async function deleteMediaItem(src) {
  if (!confirm(`이 이미지를 미디어 라이브러리에서 삭제하시겠습니까?\n${src}`)) return;

  const mediaList = JSON.parse(localStorage.getItem("baikal_media_library") || JSON.stringify(DEFAULT_MEDIA_ASSETS));
  const filtered = mediaList.filter(s => s !== src);
  localStorage.setItem("baikal_media_library", JSON.stringify(filtered));

  if (selectedMediaImage === src) selectedMediaImage = '';

  if (window.SupabaseAdapter && /\/storage\/v1\/object\/public\/article-images\//.test(src)) {
    try {
      const client = window.SupabaseAdapter.getClient();
      if (client) {
        const path = src.split('/storage/v1/object/public/article-images/')[1];
        if (path) {
          await client.storage.from('article-images').remove([path]);
        }
      }
    } catch (err) {
      console.warn("Storage file delete failed (non-critical):", err);
    }
  }

  renderMediaLibraryGrid();
}

function confirmSelectedImage() {
  if (!selectedMediaImage) {
    alert("라이브러리에서 적용할 이미지를 먼저 탭해 주세요.");
    return;
  }
  setFormImageValue(selectedMediaImage);
  closeMediaLibraryModal();
  alert(`기사 대표 이미지로 '${selectedMediaImage}' 파일이 적용되었습니다.`);
}

// Downscales + re-encodes an image (File/Blob/data URL) as JPEG via canvas so
// storage stays small. PC layout never displays an article image wider than
// the 1200px page container, so 1600px (some headroom for retina) is plenty
// -- anything a phone camera or an AI generator produces is far larger than
// that and mostly wastes Supabase's free storage tier for no visible gain.
async function resizeAndCompressImage(fileOrBlob, options) {
  const opts = options || {};
  const maxWidth = opts.maxWidth || 1600;
  const quality = opts.quality || 0.8;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("이미지를 읽는 데 실패했습니다."));
    reader.readAsDataURL(fileOrBlob);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 디코딩하는 데 실패했습니다."));
    image.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxWidth) {
    height = Math.round(height * (maxWidth / width));
    width = maxWidth;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // Flatten onto white first -- PNG/AI transparency would otherwise turn
  // black once forced into JPEG, which has no alpha channel.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("이미지 압축에 실패했습니다.")), 'image/jpeg', quality);
  });

  return blob;
}

// Raw upload of an already-processed blob to the "article-images" bucket --
// no resizing/compression here, callers decide whether that already happened.
// sourceTag prefixes the filename (e.g. "upload-", "ai-") so the public site
// can tell a manually-uploaded photo from an AI-generated one purely from
// its URL -- css/pages.css uses an [src*="/upload-"] attribute selector to
// show manual uploads at their original aspect ratio while keeping
// AI-generated images in the fixed 16:9 crop. No DB column needed for this.
async function uploadRawBlobToStorage(blob, ext, sourceTag) {
  const client = window.SupabaseAdapter && window.SupabaseAdapter.getClient();
  if (!client) {
    throw new Error("Supabase가 연결되어 있지 않습니다.");
  }

  const prefix = sourceTag ? `${sourceTag}-` : '';
  const path = `articles/${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const contentType = ext === 'jpg' ? 'image/jpeg' : (blob.type || `image/${ext}`);

  const { error } = await client.storage.from('article-images').upload(path, blob, {
    cacheControl: '3600',
    upsert: false,
    contentType
  });
  if (error) {
    throw new Error(`${error.message || error}  (버킷 "article-images"가 없거나 업로드 정책이 설정되지 않았을 수 있습니다.)`);
  }

  const { data } = client.storage.from('article-images').getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}

// Uploads a File or Blob to the Supabase Storage "article-images" bucket and
// returns its public URL. Requires the bucket + public read/insert policies
// to already exist (see admin setup docs) -- throws a clear error otherwise.
// Always downscales/recompresses to JPEG first (see resizeAndCompressImage)
// so both AI-generated and manually-uploaded photos land in Storage small.
async function uploadImageToStorage(fileOrBlob, extHint, sourceTag) {
  if (!window.SupabaseAdapter) {
    throw new Error("Supabase 연동 모듈을 찾을 수 없습니다.");
  }

  let uploadBlob = fileOrBlob;
  let ext = 'jpg';
  try {
    uploadBlob = await resizeAndCompressImage(fileOrBlob);
  } catch (err) {
    console.warn("이미지 압축 실패, 원본으로 업로드합니다:", err);
    uploadBlob = fileOrBlob;
    const nameExt = fileOrBlob.name ? fileOrBlob.name.split('.').pop() : null;
    ext = (extHint || nameExt || 'png').toLowerCase().replace('jpeg', 'jpg');
  }

  const { publicUrl } = await uploadRawBlobToStorage(uploadBlob, ext, sourceTag);
  return publicUrl;
}

// Extracts the storage object path from a public article-images URL, e.g.
// ".../storage/v1/object/public/article-images/articles/123-abc.jpg" -> "articles/123-abc.jpg"
function extractStoragePath(url) {
  const marker = '/object/public/article-images/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0];
}

// Bulk-recompresses every already-uploaded image that still lives in our own
// "article-images" bucket: media library entries, article representative
// images, and any matching <img src> left inside article bodies. Downloads
// each once, runs it through the same resizeAndCompressImage() pipeline as
// new uploads, re-uploads the smaller result, rewrites every reference to
// the new URL, then best-effort deletes the old, larger storage object.
async function bulkCompressExistingImages() {
  if (!window.SupabaseAdapter || !window.SupabaseAdapter.getClient()) {
    alert("Supabase가 연결되어 있지 않아 기존 이미지를 압축할 수 없습니다.");
    return;
  }

  const mediaList = JSON.parse(localStorage.getItem("baikal_media_library") || JSON.stringify(DEFAULT_MEDIA_ASSETS));
  const bucketMarker = '/object/public/article-images/';
  const isOurBucketUrl = (url) => typeof url === 'string' && url.includes(bucketMarker);

  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }

  const targetUrls = new Set();
  mediaList.filter(isOurBucketUrl).forEach(u => targetUrls.add(u));
  articles.forEach(art => {
    if (isOurBucketUrl(art.image)) targetUrls.add(art.image);
    if (art.content) {
      const matches = art.content.match(/<img[^>]+src="([^"]+)"/g) || [];
      matches.forEach(tag => {
        const src = tag.match(/src="([^"]+)"/)[1];
        if (isOurBucketUrl(src)) targetUrls.add(src);
      });
    }
  });

  if (targetUrls.size === 0) {
    alert("압축할 기존 이미지가 없습니다. (모든 이미지가 이미 처리되었거나, 외부/기본 이미지만 있습니다.)");
    return;
  }

  if (!confirm(`Supabase에 저장된 이미지 ${targetUrls.size}개를 다운로드하여 압축 후 재업로드합니다. 참조된 미디어 라이브러리/기사 이미지가 새 URL로 자동 교체됩니다. 이미지 수에 따라 시간이 걸릴 수 있습니다. 계속하시겠습니까?`)) {
    return;
  }

  const btn = document.getElementById("bulk-compress-btn");
  const statusEl = document.getElementById("bulk-compress-status");
  if (btn) btn.disabled = true;

  const urlList = Array.from(targetUrls);
  const urlMap = {}; // oldUrl -> newUrl (only when actually replaced)
  let processed = 0, skipped = 0, failed = 0;
  let bytesBefore = 0, bytesAfter = 0;

  for (const oldUrl of urlList) {
    processed++;
    if (statusEl) statusEl.textContent = `처리 중... (${processed}/${urlList.length})`;
    try {
      const res = await fetch(oldUrl);
      if (!res.ok) throw new Error(`원본 다운로드 실패 (HTTP ${res.status})`);
      const originalBlob = await res.blob();

      const compressedBlob = await resizeAndCompressImage(originalBlob);
      if (compressedBlob.size >= originalBlob.size) {
        skipped++;
        continue; // Already smaller than any re-encode would produce -- leave it alone.
      }

      const { publicUrl: newUrl } = await uploadRawBlobToStorage(compressedBlob, 'jpg');
      urlMap[oldUrl] = newUrl;
      bytesBefore += originalBlob.size;
      bytesAfter += compressedBlob.size;

      // Best-effort cleanup of the old, larger object -- not fatal if it fails.
      const oldPath = extractStoragePath(oldUrl);
      if (oldPath) {
        try { await window.SupabaseAdapter.getClient().storage.from('article-images').remove([oldPath]); }
        catch (cleanupErr) { console.warn("이전 이미지 삭제 실패:", cleanupErr); }
      }
    } catch (err) {
      failed++;
      console.warn(`이미지 압축 실패 (${oldUrl}):`, err);
    }
  }

  // Rewrite every reference to the newly compressed URLs.
  const newMediaList = mediaList.map(u => urlMap[u] || u);
  localStorage.setItem("baikal_media_library", JSON.stringify(newMediaList));

  for (const art of articles) {
    let dirty = false;
    if (urlMap[art.image]) {
      art.image = urlMap[art.image];
      dirty = true;
    }
    if (art.content) {
      let newContent = art.content;
      for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
        if (newContent.includes(oldUrl)) {
          newContent = newContent.split(oldUrl).join(newUrl);
          dirty = true;
        }
      }
      art.content = newContent;
    }
    if (dirty) {
      await window.SupabaseAdapter.saveArticle(art);
    }
  }

  if (btn) btn.disabled = false;
  const replacedCount = Object.keys(urlMap).length;
  const savedKb = Math.round((bytesBefore - bytesAfter) / 1024);
  const summary = `압축 완료: ${replacedCount}개 교체 (절감 약 ${savedKb.toLocaleString("ko-KR")}KB), ${skipped}개는 이미 최소 용량, ${failed}개 실패`;
  if (statusEl) statusEl.textContent = summary;
  alert(summary);
  renderMediaLibraryGrid();
}

// Updates the sidebar's live thumbnail to match #form-image's current value
// (hidden when empty). The file input clears its own displayed filename
// right after a successful upload (see handleArticleImageUpload) so admins
// can immediately re-select another file -- without this preview that reset
// reads as "did nothing," even though the URL field below was filled in.
// 기본 플레이스홀더 이미지(images/news_editorial.png)는 실제 대표 이미지가
// 아니라 "아직 안 정함"을 뜻하는 값이라, 그걸 그대로 사진처럼 보여주면
// 마치 이미지가 이미 정해진 것처럼 오해하기 쉽다. 그래서 이 값이거나
// 아예 비어 있을 때는 회색 "NO IMAGE" 박스로 대신 보여준다.
const DEFAULT_ARTICLE_IMAGE = "images/news_editorial.png";

function updateFormImagePreview() {
  const input = document.getElementById("form-image");
  const preview = document.getElementById("form-image-preview");
  const placeholder = document.getElementById("form-image-placeholder");
  if (!input || !preview) return;

  const url = input.value.trim();
  if (!url || url === DEFAULT_ARTICLE_IMAGE) {
    preview.style.display = "none";
    if (placeholder) placeholder.style.display = "flex";
    return;
  }
  if (placeholder) placeholder.style.display = "none";
  preview.onerror = () => { preview.style.display = "none"; };
  preview.src = /^https?:\/\//i.test(url) ? url : `https://baikalnews.com/${url}`;
  preview.style.display = "block";
}

// Sets #form-image's value and refreshes its thumbnail together -- prefer
// this over touching form-image.value directly so the preview never goes stale.
function setFormImageValue(url) {
  const input = document.getElementById("form-image");
  if (input) input.value = url;
  updateFormImagePreview();
}

// Direct upload from the sidebar's "내 컴퓨터에서 업로드" file input
async function handleArticleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById("image-upload-status");
  if (statusEl) statusEl.textContent = "업로드 중...";

  try {
    const url = await uploadImageToStorage(file, null, 'upload');
    setFormImageValue(url);
    if (statusEl) statusEl.textContent = "업로드 완료: 기사 대표 이미지로 적용되었습니다.";
  } catch (err) {
    console.error("Image upload error:", err);
    if (statusEl) statusEl.textContent = "업로드 실패: " + err.message;
  } finally {
    event.target.value = "";
  }
}

// Builds an image-generation prompt from the article's current title/lead/body via
// Gemini (callGeminiTextApi) -- kept on the same key as image generation itself,
// separate from Claude's article-writing calls.
async function autoGenerateImagePrompt() {
  const title = document.getElementById("form-title").value.trim();
  const lead = document.getElementById("form-lead").value.trim();
  const contentEl = document.getElementById("form-content");
  const bodyText = contentEl ? (contentEl.innerText || "") : "";

  if (!title && !lead && !bodyText) {
    alert("먼저 기사 제목이나 본문을 작성한 후 프롬프트를 생성해 주세요.");
    return;
  }

  const btn = document.getElementById("auto-prompt-btn");
  const promptEl = document.getElementById("ai-image-prompt");
  const originalText = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "프롬프트 생성 중..."; }

  try {
    // Two admin-selectable dimensions (mood/tone + subject focus), each falling
    // back to a random pick from the same option pool when left on "자동" so
    // repeated generations still don't converge on one look. Each option maps
    // to a concrete visual descriptor that gets injected into the prompt --
    // a bare label like "밝고 역동적인" was too vague for the model to obey
    // (it kept producing rainy/foggy scenes regardless), so the descriptor
    // spells out exactly what the label means in weather/light/color terms.
    const moodOptions = {
      "밝고 역동적인": "맑고 화창한 날씨, 쨍한 자연광과 파란 하늘, 생생하고 선명한 색감, 움직임과 에너지가 느껴지는 역동적인 순간",
      "따뜻하고 정감 있는": "맑은 날 오후의 부드럽고 따뜻한 햇살, 온화한 색감, 사람 사는 냄새가 나는 편안하고 훈훈한 분위기",
      "활기찬 현장 분위기": "밝은 자연광 아래 사람들이 활발히 움직이는 현장의 생동감, 웃음소리가 들릴 것 같은 자연스러운 순간 포착",
      "차분하고 정돈된": "맑은 날의 깨끗하고 균형 잡힌 구도, 절제된 색감, 안정감과 신뢰감이 느껴지는 분위기",
      "시네마틱한": "영화의 한 장면처럼 깊이감 있는 구도와 인상적인 빛, 또렷한 주제 강조, 맑은 날씨의 선명한 화면",
      "흑백 이미지": "대비가 선명한 흑백 사진, 뚜렷한 빛과 그림자, 또렷한 디테일과 표정",
      "레트로 필름 느낌": "맑은 날 촬영한 빈티지 필름 사진 질감, 따뜻하게 바랜 색감, 부드러운 그레인 (단, 초점은 또렷하게)"
    };
    const focusOptions = {
      "인물 클로즈업 (얼굴·표정)": "한 인물의 얼굴과 생생한 표정이 또렷하게 살아있는 클로즈업 또는 상반신 구도 -- 자연스러운 미소, 집중한 눈빛, 대화하는 모습 등 감정이 그대로 드러나게",
      "여러 사람이 함께": "두 명 이상의 사람들이 함께 등장해 대화하거나 협력하거나 웃는 장면 -- 얼굴과 표정이 자연스럽게 보이는 구도",
      "인물과 배경 함께": "인물의 얼굴과 표정이 보이면서도 기사 배경이 되는 장소가 함께 담긴 중간 거리 구도",
      "풍경/장소 중심": "기사 소재가 되는 장소나 풍경을 넓게 담은 와이드샷 -- 인물은 작게 배치하거나 생략",
      "사물·디테일 중심": "기사 소재를 상징하는 사물, 손동작, 질감을 가까이에서 또렷하게 담은 디테일 샷"
    };
    const moodKeys = Object.keys(moodOptions);
    const focusKeys = Object.keys(focusOptions);
    const selectedMood = document.getElementById("ai-image-mood").value || moodKeys[Math.floor(Math.random() * moodKeys.length)];
    const selectedFocus = document.getElementById("ai-image-focus").value || focusKeys[Math.floor(Math.random() * focusKeys.length)];
    const moodDetail = moodOptions[selectedMood] || selectedMood;
    const focusDetail = focusOptions[selectedFocus] || selectedFocus;

    // Randomized per-generation on top of the two dimensions above, so repeated
    // prompts for similar articles (or the same mood/focus combo) don't all
    // converge on the same shot -- the model still adapts it to the article,
    // but starts from a different visual anchor each time. All hints assume
    // clear weather and sharp focus; variety comes from angle/light/lens, not
    // from gloomy weather (which used to sneak in here and override the mood).
    const shootingStyleHints = [
      "한낮의 맑은 하늘 아래 또렷한 직사광과 선명한 그림자",
      "골든아워(늦은 오후)의 따뜻하고 밝은 햇살",
      "얕은 심도로 주제만 또렷하게 살리고 배경은 은은하게 흐린 구도",
      "낮은 앵글에서 올려다보아 역동성을 살린 구도",
      "넓은 와이드샷으로 시원한 공간감을 살린 구도",
      "클로즈업으로 디테일과 질감을 또렷하게 살린 구도",
      "계절감이 뚜렷한 맑은 날 풍경 (초여름 신록, 파란 가을 하늘과 단풍, 눈 쌓인 맑은 겨울 아침 등)",
      "45도 측면에서 자연스럽게 포착한 스냅 구도",
      "창으로 들어오는 밝은 자연광이 실내를 환하게 채우는 장면",
      "높은 곳에서 내려다본 시원한 부감 구도"
    ];
    const randomHint = shootingStyleHints[Math.floor(Math.random() * shootingStyleHints.length)];

    const analysisPrompt = `
아래 뉴스 기사 내용을 분석하여, 이 기사의 대표 이미지를 생성하기 위한 이미지 생성 AI용 프롬프트를 한글로 작성하십시오.

[기사 제목]
${title}

[리드 문단]
${lead}

[본문 요약]
${bodyText.substring(0, 1000)}

[이번 이미지에 적용할 톤/분위기]
${selectedMood}: ${moodDetail}

[이번 이미지에 적용할 구도/중심 대상]
${selectedFocus}: ${focusDetail}

[추가 촬영 디테일 힌트]
${randomHint}
(위 톤/분위기와 구도 지정을 최우선으로 따르고, 이 촬영 디테일 힌트는 그 안에서 기사 내용에 맞게 자연스럽게 응용하십시오. 매번 다른 힌트가 주어지므로 같은 톤/구도를 골라도 결과 이미지가 서로 겹치지 않고 다양해집니다. 톤/분위기와 구도의 설명 문구를 프롬프트 본문에 구체적인 시각 묘사로 정확하게 녹여 넣으십시오.)

[작성 지침]
- (가장 중요) 이 이미지는 실제 보도 사진을 대신합니다. 다른 모든 지침보다 우선하여, 실제 카메라로 그 자리에서 찍은 것처럼 사실적으로 묘사하십시오. 일러스트, 디지털 아트, 컨셉 아트, 인포그래픽, 아이콘, 은유적 상징물(전구, 톱니바퀴, 그래프 오버레이 등), 매끈하고 대칭적인 'AI 그림체'는 절대 사용하지 마십시오. 실제 인체 비율과 손·얼굴 디테일, 자연스러운 피부 질감, 현실적인 조명과 그림자, 실제 재질감을 갖춘 다큐멘터리 사진(photojournalism) 스타일로만 묘사하십시오.
- 날씨와 조명: 기사 내용이 비·폭설·재해 등 특정 날씨를 직접 다루는 경우가 아니라면, 반드시 맑고 화창한 날씨와 밝은 빛으로 묘사하십시오. 비, 빗방울, 젖은 표면, 안개, 흐린 하늘, 우중충한 분위기, 어두운 새벽·심야 장면은 기사와 직접 관련이 없는 한 절대 넣지 마십시오.
- 선명도: 이미지 전체가 흐릿하거나 뿌옇게 보이면 안 됩니다. 주제는 항상 초점이 또렷하고 선명해야 하며, 배경 흐림(아웃포커스)은 주제를 돋보이게 하는 용도로만 은은하게 사용하십시오.
- 기사의 실제 배경이 되는 구체적이고 현실적인 장소·사물·계절·시간대를 하나 골라 사실적으로 묘사하십시오 (예: 항만 관련 기사라면 실제 하역 장비나 컨테이너 야드, 문화·생활 기사라면 실제 전시 공간이나 골목 풍경 등 기사 소재에 맞는 구체적 장면).
- 인물이 등장한다면 얼굴과 표정이 자연스럽게 살아있는 모습을 우선하십시오. 생기 있는 표정(미소, 집중한 눈빛, 대화하는 모습 등)이 담긴 얼굴이 뒷모습이나 실루엣보다 좋습니다. 단, 실존 인물이나 유명인과 닮지 않은 가상의 인물로 묘사하고, 어색하게 카메라를 정면으로 응시하기보다 장면 속에서 자연스럽게 행동하는 모습으로 묘사하십시오. 완벽하게 대칭적이거나 정면을 향한 포즈보다는 실제 스냅 사진처럼 약간 비대칭적인 자연스러운 구도를 지향하십시오. (질감을 위해 이미지를 어둡거나 탁하게 만들지는 마십시오.)
- 텍스트가 등장하는 요소는 완전히 배제하십시오. AI가 생성하는 한글 텍스트는 작고 흐릿하게 넣어도 철자가 틀린 채로 나오는 경우가 많아, "일부만 보이는 정도"조차 안전하지 않습니다. 문서, 종이, 서류, 손글씨, 화면, 간판, 상점 간판, 현수막, 라벨 등 글자가 보이는 요소는 어떤 형태로든(작게, 흐릿하게, 부분적으로) 절대 등장시키지 마십시오. 간판이 있는 장소라면 간판이 안 보이는 각도·거리로 구도를 잡거나 아예 프레임 밖으로 빼십시오. 정말 불가피하게 텍스트가 필요하다면 반드시 한글로만, 글자로 알아볼 수 없을 만큼 작고 흐릿하게 묘사하고, 영어나 다른 외국어는 절대 사용하지 마십시오.
- 다른 설명이나 마크다운 없이, 한글로 작성한 한 문단의 프롬프트 본문만 출력하십시오.
`;
    const resultText = await callGeminiTextApi(analysisPrompt, "당신은 신문사 사진부 편집자입니다. 이 이미지는 실제 보도 사진을 대신하므로, 무엇보다 사실적인 묘사가 최우선입니다 -- 실제 카메라로 찍은 것처럼 실제 인체 비율, 자연스러운 피부 질감, 현실적인 조명을 갖춘 다큐멘터리 사진 스타일로만 작성하고, 일러스트나 디지털 아트, 매끈한 'AI 그림체' 스타일은 절대 사용하지 마십시오. 기사 내용이 특정 날씨를 직접 다루지 않는 한 항상 맑고 화창한 날씨와 밝은 빛으로 묘사하고, 비/안개/흐린 하늘/우중충한 분위기는 절대 넣지 마십시오. 주제의 초점은 항상 또렷하고 선명해야 합니다. 인물은 얼굴과 표정이 살아있는 모습을 우선하되 실존 인물과 닮지 않게 하십시오. 장면 안의 텍스트는 완전히 배제하십시오 (AI가 그리는 한글 텍스트는 작고 흐릿해도 철자가 틀리게 나옵니다). 문서, 종이, 간판, 현수막 등 글자가 보이는 요소는 어떤 형태로도 넣지 말고, 간판이 있는 곳이라면 안 보이는 구도로 묘사하십시오. 프롬프트 본문은 반드시 한글로만 작성하십시오.");
    if (promptEl) promptEl.value = resultText.trim();
  } catch (err) {
    alert("프롬프트 자동생성 실패: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

// Calls Gemini's image-capable model and returns a data: URI
// Applied to every image-generation prompt regardless of source (auto-written,
// hand-typed, or shorts image cuts) so it can't be skipped or forgotten upstream.
// Gemini's image model reliably misspells/garbles Hangul it renders, even
// small/blurry signage -- there is no reliable way to prompt around this, so
// the only real fix is to eliminate on-screen text entirely rather than try
// to make it "acceptable" in some blurred form.
const IMAGE_TEXT_LANGUAGE_RULE = "\n\nSTRICT NO-TEXT RULE: AI image models reliably render Korean (Hangul) text as garbled, misspelled gibberish -- there is no safe amount of visible text. Do NOT include ANY readable or legible text anywhere in the image, under any circumstances: no documents, papers, forms, handwriting, screens, signage, storefronts, street signs, banners, or labels of any kind, even small, distant, or partially obscured ones. Compose the scene so no text needs to appear at all (e.g. a shopfront shown from an angle/distance where any signage is not legible, or simply excluded from frame). If text is truly unavoidable for the scene to make sense, it must be Korean (Hangul) only and kept so small/out-of-focus that it reads as an abstract texture rather than actual letters -- never English or any other script.";
// Hard backstop applied to BOTH image and Veo video generation -- a Korean
// news outlet's people must read as Korean, and this has been violated
// (a Western-looking person, an English-text phone screen in a Veo clip)
// even when the upstream script-writing prompt already asked for Korean
// people/text. Appended at the actual generation call so it can't be
// skipped or forgotten upstream, same as the other MEDIA_/IMAGE_ rules.
// This is shared by BOTH image generation and Veo video generation. It used
// to allow Korean on-screen text as a fallback (only banning English) --
// but Gemini/Veo garble Hangul just as badly as any other script, so a Veo
// clip still came back with broken Korean text on a phone screen even with
// this rule applied. There's no language for which on-screen text is safe;
// removed the "must be Korean" exception so this now matches the
// image-generation no-text policy (IMAGE_TEXT_LANGUAGE_RULE) exactly.
const MEDIA_KOREAN_PEOPLE_RULE = "\n\nPEOPLE & TEXT (STRICT): Every person shown must have an East Asian/Korean appearance -- absolutely NO Western, non-Korean, or mixed/ambiguous-ethnicity people, under any circumstances. Do NOT include ANY readable or legible text anywhere in the scene, in ANY language -- no signage, storefronts, street signs, banners, labels, phone/device screens, documents, or handwriting, even small, distant, or briefly-glimpsed ones. AI models reliably render on-screen text (Korean included) as garbled, misspelled gibberish, so there is no safe amount of visible text -- compose and frame the scene so none needs to appear at all.";
// This is a news outlet -- every generated image stands in for a real news
// photo, so photorealism is the single most important property, above mood/
// composition/style choices. Applies regardless of prompt source (auto-written,
// hand-typed, or shorts image cuts).
const IMAGE_REALISM_RULE = "\n\nMOST IMPORTANT RULE -- PHOTOREALISM: This image represents a real news/press photograph, so it must look exactly like an actual photo taken with a real camera at the real scene -- not an illustration, painting, 3D render, or 'AI-art' look. Prioritize photorealistic accuracy above all other style choices: realistic anatomy and proportions (especially hands and faces), natural skin texture, correct real-world lighting and shadow physics, authentic materials and textures, and a candid, unposed documentary quality. Avoid the telltale over-smooth, overly symmetrical, glossy 'AI-generated' look.";
const IMAGE_NO_RAIN_RULE = "\n\nWEATHER & CLARITY: Default to clear, sunny weather with bright natural light. AVOID rain, raindrops, wet surfaces, fog, mist, haze, overcast/gray skies, and gloomy or murky moods unless the subject matter specifically calls for them -- these have been overused in recent generations. The main subject must always be in sharp, crisp focus; a subtle out-of-focus/blur background used to emphasize the subject is fine, but the overall image must never look hazy or washed out.";
// A generated image sometimes comes back as the actual photo pillarboxed/
// letterboxed inside a differently-shaped canvas, with plain white (or
// black) bars filling the rest -- visible as ugly margins once the site
// displays the image at its real size. Applies to every image generation
// call (article hero, shorts cuts) since the underlying cause is the same
// regardless of which aspect ratio was requested.
const IMAGE_NO_LETTERBOX_RULE = "\n\nFULL-BLEED FRAMING (STRICT): The photograph must completely fill the entire image canvas edge-to-edge, with the requested aspect ratio being the shape of the photo itself -- not a smaller photo padded, pillarboxed, or letterboxed inside a differently-proportioned canvas. Absolutely no white, black, gray, or blank margins, borders, or bars anywhere in the image, on any side. Every single pixel of the output must be actual photographic scene content.";
// Only appended for the article representative image (triggerAiImageGeneration).
// The site now displays this image at its full original size/aspect ratio
// (no crop box), but Gemini's image model otherwise defaults to a square 1:1
// output, which reads oddly as a wide article hero -- this just steers the
// composition toward a natural widescreen shot instead of forcing a crop.
const IMAGE_ASPECT_RATIO_RULE = "\n\nCOMPOSITION: Wide horizontal 16:9 landscape composition (not square, not portrait), filling the entire frame edge-to-edge with photographic content -- no white/blank margins or letterboxing top or bottom. Compose the shot with this widescreen framing in mind, leaving natural headroom/context at top and bottom rather than a tightly cropped square subject.";

// Runs through the server-side proxy (api/gemini-image-proxy.js) so the
// Gemini key lives in Vercel env vars instead of this browser's
// localStorage -- no more re-entering it on every device (phones
// especially) and no raw provider key visible in devtools.
async function generateGeminiImage(promptText) {
  const response = await fetch("https://baikalnews.com/api/gemini-image-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: promptText + IMAGE_REALISM_RULE + IMAGE_TEXT_LANGUAGE_RULE + IMAGE_NO_RAIN_RULE + IMAGE_NO_LETTERBOX_RULE + MEDIA_KOREAN_PEOPLE_RULE })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI 이미지 생성 실패 (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.dataUri) {
    throw new Error("AI가 이미지를 반환하지 않았습니다. 프롬프트를 조금 더 구체적으로 작성해 보세요.");
  }
  return data.dataUri;
}

// Fills in only the descriptive middle part of the photo caption -- the
// "사진/보도:" prefix and "(ⓒ 승인인 기자)" credit are always assembled at
// render time (js/main.js) from the article's live byline, never typed here,
// so an admin editing this can't accidentally make the credit stale or wrong.
// Matches the exact wording main.js already used as its hardcoded fallback,
// so leaving this blank keeps today's behavior unchanged.
function autoGenerateImageCaption() {
  const title = document.getElementById("form-title").value.trim();
  const captionEl = document.getElementById("form-image-caption");
  if (!captionEl) return;
  captionEl.value = title ? `${title} 관련 취재 자료.` : "취재 자료.";
}

async function triggerAiImageGeneration() {
  const promptText = document.getElementById("ai-image-prompt").value.trim();
  if (!promptText) {
    alert("프롬프트를 간략하게 입력하거나 자동생성 버튼을 눌러주세요.");
    return;
  }

  const loader = document.getElementById("ai-image-loader");
  loader.style.display = "flex";

  beginShortsBusyOperation();
  try {
    const dataUrl = await generateGeminiImage(promptText + IMAGE_ASPECT_RATIO_RULE);
    const blob = await (await fetch(dataUrl)).blob();
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const publicUrl = await uploadImageToStorage(blob, ext, 'ai');

    const mediaList = JSON.parse(localStorage.getItem("baikal_media_library") || JSON.stringify(DEFAULT_MEDIA_ASSETS));
    mediaList.unshift(publicUrl);
    localStorage.setItem("baikal_media_library", JSON.stringify(mediaList));

    selectedMediaImage = publicUrl;
    switchModalMediaTab('select');
    renderMediaLibraryGrid();

    alert("AI 이미지가 생성되어 미디어 라이브러리에 등록되었습니다.");
  } catch (err) {
    console.error("AI image generation error:", err);
    alert("AI 이미지 생성 실패: " + err.message);
  } finally {
    loader.style.display = "none";
    endShortsBusyOperation();
  }
}

// ==========================================================
// 숏폼(Shorts) Auto-Generation
// Workflow: 기사 선택 -> (선택) 참고 영상 업로드로 스타일 학습 -> (선택) 보유
// 영상/사진을 전반·후반에 배정 -> Gemini로 대본 생성(배정된 슬롯만큼 AI 생성량
// 감소) -> 관리자 검토/승인 -> Veo 8초 영상 또는 업로드 자료 + 이미지 22초
// (기본 5컷, 업로드로 대체된 만큼 AI 생성 생략) 생성 -> 브라우저에서 canvas로
// 재생하며 그대로 녹화(MediaRecorder)해 최종 영상 완성.
// ==========================================================
let currentShortsProject = null;
let shortsAssets = null; // { front: {type, el, duration}, images: [{img, duration, caption}] } -- built lazily before preview/record
let shortsPendingUploads = []; // File objects awaiting a 전반/후반 placement choice
const SHORTS_TARGET_CUT_COUNT = 5; // total 후반 image cuts (AI + uploaded combined)
const SHORTS_MAX_BACK_UPLOADS = 5;
const SHORTS_STYLE_TEMPLATES_KEY = "baikal_shorts_style_templates";
const SHORTS_LAST_TEMPLATE_ID_KEY = "baikal_shorts_last_template_id";

// Refreshing/closing the tab mid-generation (Veo, images, narration,
// recording) throws away real time and real API cost with nothing saved to
// resume from -- unlike script/style text edits, which already autosave on
// every keystroke and are safe to lose mid-typing. This counter tracks
// whether any such in-flight operation is running, and the browser's native
// "leave site?" prompt (which we can't customize the wording of, but can
// trigger) is the one guard that actually stops an accidental refresh.
let shortsBusyOperations = 0;
function beginShortsBusyOperation() { shortsBusyOperations++; updateShortsBusyBanner(); }
function endShortsBusyOperation() { shortsBusyOperations = Math.max(0, shortsBusyOperations - 1); updateShortsBusyBanner(); }
// Shows/hides the fixed, animated "작업 진행 중" banner -- an easy-to-miss
// tiny status line was exactly what led to clicking an expensive Veo/image
// generation button again while it was already running, thinking nothing
// had happened. This is impossible to miss: fixed position, large, and
// visibly animated regardless of scroll position or which status text
// element the in-progress function happens to update.
function updateShortsBusyBanner() {
  const banner = document.getElementById("shorts-busy-banner");
  if (!banner) return;
  banner.classList.toggle("is-active", shortsBusyOperations > 0);
}
window.addEventListener('beforeunload', (e) => {
  if (shortsBusyOperations > 0) {
    e.preventDefault();
    e.returnValue = '숏폼 생성 작업이 진행 중입니다. 지금 나가면 진행 중이던 결과가 사라집니다.';
  }
});

// Storage-minimization: while a shorts project is being drafted, its script
// text/narration lives in localStorage+IndexedDB AND is synced to Supabase
// (as base64, via syncShortsScriptToSupabase()) so it survives a different
// browser/device or a cleared profile. Its bulkier media (images/Veo clip/
// final render) lives ONLY in IndexedDB (large Blobs, browser-only) -- too
// big to justify a DB column at scale, and regenerable if lost. Reopening a
// project in the SAME browser rehydrates fresh object URLs from the local
// Blobs (openLocalShortsDraft); opening it elsewhere restores the script/
// narration from Supabase but leaves media blank, needing regeneration
// (openShortsProject).
const SHORTS_LOCAL_DRAFTS_KEY = "baikal_shorts_local_drafts";
const SHORTS_IDB_NAME = "baikal_shorts_media";
const SHORTS_IDB_STORE = "blobs";

function getShortsLocalDrafts() {
  try {
    return JSON.parse(localStorage.getItem(SHORTS_LOCAL_DRAFTS_KEY) || "[]");
  } catch (err) {
    return [];
  }
}

function setShortsLocalDrafts(drafts) {
  try {
    localStorage.setItem(SHORTS_LOCAL_DRAFTS_KEY, JSON.stringify(drafts));
  } catch (err) {
    console.error("로컬 임시 숏폼 저장 실패:", err);
    alert("⚠ 대본/설정을 이 브라우저에 저장하지 못했습니다 (저장 공간 부족일 수 있습니다). 대본 저장 버튼으로 Supabase에도 백업해 두는 것을 권장합니다.");
  }
}

function ensureShortsLocalDraftId() {
  if (!currentShortsProject.localDraftId) {
    currentShortsProject.localDraftId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return currentShortsProject.localDraftId;
}

// Best-effort: asks the browser to treat this origin's storage as
// "persistent" (exempt from automatic eviction under storage pressure)
// instead of the default "best-effort" bucket some browsers silently clear
// over time. Doesn't guarantee anything -- the browser's own heuristics
// decide, and this API isn't supported everywhere -- but costs nothing to
// ask. Also warns immediately if this browser is already low on free space,
// since that's exactly the condition under which a media save can fail.
async function ensureShortsStoragePersisted() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      if (quota && usage / quota > 0.85) {
        alert(`⚠ 이 브라우저의 저장 공간이 거의 다 찼습니다 (${Math.round(usage / quota * 100)}% 사용 중). 숏폼 영상/이미지 저장에 실패할 수 있으니, 완성된 영상을 다운로드하거나 필요 없는 임시 숏폼을 정리해 공간을 확보해 주세요.`);
      }
    }
  } catch (err) {
    console.warn("저장 공간 확인/영구 저장 요청 실패:", err);
  }
}

function openShortsMediaDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHORTS_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHORTS_IDB_STORE)) {
        req.result.createObjectStore(SHORTS_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutBlob(key, blob) {
  const db = await openShortsMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHORTS_IDB_STORE, 'readwrite');
    tx.objectStore(SHORTS_IDB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetBlob(key) {
  const db = await openShortsMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHORTS_IDB_STORE, 'readonly');
    const req = tx.objectStore(SHORTS_IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDeleteByPrefix(prefix) {
  const db = await openShortsMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHORTS_IDB_STORE, 'readwrite');
    const store = tx.objectStore(SHORTS_IDB_STORE);
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (String(cursor.key).startsWith(prefix)) cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 로컬 미디어 복구 -- IndexedDB에 실제로 남아있는 모든 키를 나열해,
// 어떤 초안에도 연결되지 않은(=이미 생성 비용은 지불했지만 추적이
// 끊긴) 파일을 찾아내 바로 다운로드할 수 있게 한다. 대본/초안 메타데이터가
// localStorage에서 손상되거나 지워져도 실제 이미지/영상/나레이션 Blob은
// IndexedDB에 그대로 남아있는 경우가 있어, 재생성(=재과금) 전에 먼저
// 확인할 수 있는 안전장치다.
async function listAllShortsMediaKeys() {
  const db = await openShortsMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHORTS_IDB_STORE, 'readonly');
    const store = tx.objectStore(SHORTS_IDB_STORE);
    const items = [];
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const blob = cursor.value;
        items.push({ key: String(cursor.key), size: blob ? blob.size : 0, type: blob ? blob.type : '' });
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function getKnownShortsMediaKeys() {
  const known = new Set();
  getShortsLocalDrafts().forEach(d => {
    if (d.hasFront) known.add(`${d.localDraftId}:front`);
    if (d.hasFinal) known.add(`${d.localDraftId}:final`);
    if (d.hasHookNarration) known.add(`${d.localDraftId}:narration:hook`);
    (d.imageCuts || []).forEach(c => {
      if (c.imageKey) known.add(c.imageKey);
      if (c.narrationKey) known.add(c.narrationKey);
    });
  });
  return known;
}

async function renderShortsMediaRecoveryPanel() {
  const panel = document.getElementById("shorts-recovery-panel");
  const listEl = document.getElementById("shorts-recovery-list");
  if (!panel || !listEl) return;
  panel.style.display = "block";
  listEl.innerHTML = '<div class="help-text">로컬 저장소를 확인하는 중...</div>';

  try {
    const [allKeys, known] = await Promise.all([listAllShortsMediaKeys(), Promise.resolve(getKnownShortsMediaKeys())]);
    const orphaned = allKeys.filter(item => !known.has(item.key));

    if (orphaned.length === 0) {
      listEl.innerHTML = '<div class="help-text">현재 진행 중인 숏폼과 연결되지 않은 파일은 없습니다.</div>';
      return;
    }

    listEl.innerHTML = orphaned.map(item => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 14px; border:1px solid var(--admin-border); border-radius:8px; margin-bottom:8px;">
        <div style="font-size:0.8rem; word-break:break-all;">
          <div style="font-weight:600;">${item.key}</div>
          <div class="help-text">${item.type || '알 수 없는 형식'} · ${(item.size / 1024 / 1024).toFixed(2)}MB</div>
        </div>
        <button type="button" class="btn-admin btn-admin-secondary" style="white-space:nowrap;" onclick="downloadOrphanedShortsMedia('${item.key.replace(/'/g, "\\'")}')">다운로드</button>
      </div>
    `).join('');
  } catch (err) {
    console.error("로컬 미디어 스캔 실패:", err);
    listEl.innerHTML = `<div class="help-text" style="color:#ef4444;">스캔 실패: ${err.message}</div>`;
  }
}

async function downloadOrphanedShortsMedia(key) {
  try {
    const blob = await idbGetBlob(key);
    if (!blob) {
      alert("이 파일을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다).");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = key.replace(/[:]/g, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.error("로컬 파일 다운로드 실패:", err);
    alert("다운로드 실패: " + err.message);
  }
}

function saveShortsDraftLocally() {
  if (!currentShortsProject) return;
  ensureShortsLocalDraftId();
  const snapshot = {
    localDraftId: currentShortsProject.localDraftId,
    id: currentShortsProject.id || null, // links back to the Supabase row synced by syncShortsScriptToSupabase()
    articleId: currentShortsProject.articleId || null,
    status: currentShortsProject.status,
    hookText: currentShortsProject.hookText || '',
    veoPrompt: currentShortsProject.veoPrompt || '',
    scriptMd: currentShortsProject.scriptMd || '',
    styleGuide: currentShortsProject.styleGuide || '',
    frontIsImage: !!currentShortsProject.frontIsImage,
    hasFront: !!currentShortsProject.veoVideoUrl,
    hasFinal: !!currentShortsProject.finalVideoUrl,
    hasHookNarration: !!currentShortsProject.hookNarrationUrl,
    imageCuts: (currentShortsProject.imageCuts || []).map(c => ({
      prompt: c.prompt, narrationText: c.narrationText || '', caption: c.caption, caption2: c.caption2 || '', duration: c.duration,
      uploaded: !!c.uploaded, imageKey: c.imageKey || null, narrationKey: c.narrationKey || null
    })),
    topBarColor: currentShortsProject.topBarColor,
    topBarHeight: currentShortsProject.topBarHeight,
    topBarTitleColor: currentShortsProject.topBarTitleColor,
    topBarTitleColorLine2: currentShortsProject.topBarTitleColorLine2,
    topBarTitle: currentShortsProject.topBarTitle,
    topBarTitleLine2: currentShortsProject.topBarTitleLine2,
    topBarTitleFontSize: currentShortsProject.topBarTitleFontSize,
    captionFontSize: currentShortsProject.captionFontSize,
    captionColor: currentShortsProject.captionColor,
    captionPosition: currentShortsProject.captionPosition,
    narrationSpeed: currentShortsProject.narrationSpeed,
    extraCutSeconds: currentShortsProject.extraCutSeconds || 0,
    createdBy: currentShortsProject.createdBy || '',
    updatedAt: new Date().toISOString()
  };
  const drafts = getShortsLocalDrafts();
  const idx = drafts.findIndex(d => d.localDraftId === snapshot.localDraftId);
  if (idx !== -1) drafts[idx] = snapshot; else drafts.unshift(snapshot);
  setShortsLocalDrafts(drafts);
}

async function deleteShortsDraftLocally(localDraftId) {
  setShortsLocalDrafts(getShortsLocalDrafts().filter(d => d.localDraftId !== localDraftId));
  try {
    await idbDeleteByPrefix(`${localDraftId}:`);
  } catch (err) {
    console.warn("로컬 미디어 정리 실패:", err);
  }
}

// Turns a generated/uploaded Blob into an in-browser object URL instead of
// uploading it to Supabase Storage -- costs zero server storage. When
// mediaKey is given, the Blob is also durably kept in IndexedDB under that
// key so reopening the project later (openLocalShortsDraft) can regenerate
// a fresh, working object URL instead of the old one (which dies with the
// page). Download or 보관 if the result needs to leave this browser.
//
// idbPutBlob() failing (e.g. IndexedDB quota exceeded) used to be swallowed
// with just a console.warn -- the object URL below still worked for the
// rest of THIS session, so nothing looked wrong, but the media was never
// actually written to IndexedDB and was gone the moment the tab closed or
// reloaded. That silent gap is exactly what caused Veo clips/image cuts/
// narration to "disappear overnight" with no error ever shown. Now it's a
// loud, immediate alert instead, so the admin knows to download right away
// rather than trusting a save that didn't happen.
async function keepShortsBlobLocal(blob, mediaKey) {
  if (mediaKey) {
    try {
      await idbPutBlob(mediaKey, blob);
    } catch (err) {
      console.error("로컬 미디어(IndexedDB) 저장 실패:", err);
      alert("⚠ 이 파일을 브라우저에 저장하지 못했습니다 (저장 공간 부족일 수 있습니다).\n\n지금 화면에는 정상적으로 보이지만, 새로고침하거나 나중에 다시 열면 사라집니다. 지금 바로 다운로드해 두세요.");
    }
  }
  return URL.createObjectURL(blob);
}

async function keepShortsImageLocal(fileOrBlob, mediaKey) {
  let blob = fileOrBlob;
  try {
    blob = await resizeAndCompressImage(fileOrBlob);
  } catch (err) {
    console.warn("이미지 압축 실패, 원본을 사용합니다:", err);
  }
  return keepShortsBlobLocal(blob, mediaKey);
}

function getShortsStyleTemplates() {
  return JSON.parse(localStorage.getItem(SHORTS_STYLE_TEMPLATES_KEY) || "[]");
}

function setShortsStyleTemplates(list) {
  localStorage.setItem(SHORTS_STYLE_TEMPLATES_KEY, JSON.stringify(list));
}

function populateShortsStyleTemplateSelect(selectedId) {
  const select = document.getElementById("shorts-style-template-select");
  if (!select) return;
  const templates = getShortsStyleTemplates();
  select.innerHTML = `<option value="">-- 직접 입력 / 새로 업로드 --</option>` +
    templates.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.name}</option>`).join('');
  const deleteBtn = document.getElementById("shorts-delete-template-btn");
  if (deleteBtn) deleteBtn.style.display = selectedId ? 'inline-flex' : 'none';
}

// Loads a saved template's text into the editable textarea (or clears it for
// "직접 입력") and remembers the choice so the next new project defaults to it.
function applyShortsStyleTemplate(templateId) {
  const templates = getShortsStyleTemplates();
  const tpl = templates.find(t => t.id === templateId);
  document.getElementById("shorts-style-guide").value = tpl ? tpl.styleGuide : "";
  localStorage.setItem(SHORTS_LAST_TEMPLATE_ID_KEY, templateId || "");

  const deleteBtn = document.getElementById("shorts-delete-template-btn");
  if (deleteBtn) deleteBtn.style.display = templateId ? 'inline-flex' : 'none';

  const statusEl = document.getElementById("shorts-style-status");
  if (statusEl) {
    statusEl.textContent = tpl
      ? `"${tpl.name}" 템플릿을 불러왔습니다.`
      : "업로드하면 AI가 영상의 분위기·톤·편집 리듬을 분석해 스타일 가이드를 만듭니다.";
  }
}

// Saves the textarea's current content as a named template -- either a brand
// new one (템플릿 1, 템플릿 2, ... suggested by default) or, if the admin keeps
// the currently-selected template's own name, updates that template in place.
function saveShortsStyleTemplate() {
  const text = document.getElementById("shorts-style-guide").value.trim();
  if (!text) {
    alert("저장할 스타일 가이드 내용이 없습니다.");
    return;
  }

  const templates = getShortsStyleTemplates();
  const select = document.getElementById("shorts-style-template-select");
  const currentId = select ? select.value : "";
  const existing = templates.find(t => t.id === currentId);

  const suggestedName = existing ? existing.name : `템플릿 ${templates.length + 1}`;
  const name = prompt("템플릿 이름을 입력하세요:", suggestedName);
  if (!name) return;

  let savedId;
  if (existing && existing.name === name) {
    existing.styleGuide = text;
    savedId = existing.id;
  } else {
    const newTpl = { id: `tpl-${Date.now()}`, name, styleGuide: text };
    templates.push(newTpl);
    savedId = newTpl.id;
  }

  setShortsStyleTemplates(templates);
  localStorage.setItem(SHORTS_LAST_TEMPLATE_ID_KEY, savedId);
  populateShortsStyleTemplateSelect(savedId);
  document.getElementById("shorts-style-status").textContent = `"${name}" 템플릿으로 저장되었습니다.`;
}

function deleteShortsStyleTemplate() {
  const select = document.getElementById("shorts-style-template-select");
  const templateId = select ? select.value : "";
  if (!templateId) return;

  const templates = getShortsStyleTemplates();
  const tpl = templates.find(t => t.id === templateId);
  if (!tpl) return;
  if (!confirm(`"${tpl.name}" 템플릿을 삭제하시겠습니까?`)) return;

  setShortsStyleTemplates(templates.filter(t => t.id !== templateId));
  if (localStorage.getItem(SHORTS_LAST_TEMPLATE_ID_KEY) === templateId) {
    localStorage.removeItem(SHORTS_LAST_TEMPLATE_ID_KEY);
  }
  populateShortsStyleTemplateSelect("");
  document.getElementById("shorts-style-guide").value = "";
  document.getElementById("shorts-style-status").textContent = "템플릿이 삭제되었습니다.";
}

async function renderShortsList() {
  const tbody = document.getElementById("shorts-list-body");
  if (!tbody) return;

  const costSavingEl = document.getElementById("shorts-veo-cost-saving-mode");
  if (costSavingEl) costSavingEl.checked = getShortsVeoCostSavingMode();

  const [archivedList, articles] = await Promise.all([
    window.SupabaseAdapter.fetchShorts(),
    window.SupabaseAdapter.fetchArticles()
  ]);
  const localDrafts = getShortsLocalDrafts();

  const statusLabels = {
    script_draft: "대본 작성 중 (로컬)",
    script_approved: "대본 승인됨 (로컬)",
    media_ready: "미디어 생성 완료 (로컬)",
    video_ready: "영상 완성 (로컬)",
    archived: "보관됨"
  };

  // Every local draft is ALWAYS shown as its own row, synced-to-Supabase or
  // not -- this must never depend on fetchShorts() succeeding. It used to:
  // a synced draft (has an id) was deliberately left OUT of this list and
  // only shown via its matching Supabase row instead. If that Supabase
  // fetch came back empty or incomplete for any reason (a network blip, a
  // slow response, Supabase briefly unreachable), every already-synced
  // local draft would vanish from the list entirely -- even though its
  // script AND media were still completely intact in localStorage/
  // IndexedDB. That's indistinguishable from real data loss to whoever's
  // looking at an empty list. Now local drafts are the source of truth for
  // "is it in this list," period; Supabase rows only fill in projects that
  // don't already have a local copy in this browser.
  const localDraftIds = new Set(localDrafts.filter(d => d.id).map(d => d.id));
  const combined = [
    ...localDrafts.map(d => ({ ...d, __local: true })),
    ...archivedList.filter(s => !localDraftIds.has(s.id)).map(s => ({ ...s, __local: false }))
  ].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  if (combined.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--admin-text-muted); padding:24px 0;">생성된 숏폼이 없습니다. "+ 새 숏폼 만들기"로 시작하세요.</td></tr>`;
    return;
  }

  tbody.innerHTML = combined.map(s => {
    const art = articles.find(a => a.id === s.articleId);
    // Every row with __local:false came from archivedList already filtered
    // to exclude anything with a matching local draft (see above), so it
    // genuinely has no local copy in this browser -- no need to re-check.
    const openCall = s.__local
      ? `openLocalShortsDraft('${s.localDraftId}')`
      : `openShortsProject(${s.id})`;
    const deleteCall = s.__local ? `deleteShortsLocalDraft('${s.localDraftId}')` : `deleteShortsProject(${s.id})`;
    return `
      <tr>
        <td>${s.id || '로컬'}</td>
        <td>${art ? art.title : '(삭제된 기사)'}</td>
        <td>${statusLabels[s.status] || s.status}</td>
        <td>${s.updatedAt ? new Date(s.updatedAt).toLocaleString('ko-KR') : ''}</td>
        <td>
          <button type="button" class="btn-admin btn-admin-secondary" onclick="${openCall}">열기</button>
          <button type="button" class="btn-admin btn-admin-danger" onclick="${deleteCall}">삭제</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteShortsProject(id) {
  if (!confirm("이 숏폼 프로젝트를 삭제하시겠습니까?")) return;
  await window.SupabaseAdapter.deleteShorts(id);
  await renderShortsList();
}

async function deleteShortsLocalDraft(localDraftId) {
  // A local draft can already have a linked Supabase row (draft.id) once
  // 대본/나레이션 has synced at least once. Deleting only the local copy in
  // that case left the Supabase row orphaned -- it would then reappear in
  // this list on the next load as a separate, media-less "deleted" project,
  // looking exactly like data resurrecting itself. Delete both sides so
  // deleting a project actually deletes it.
  const draft = getShortsLocalDrafts().find(d => d.localDraftId === localDraftId);
  const hasSupabaseCopy = !!(draft && draft.id);
  const confirmMsg = hasSupabaseCopy
    ? "이 숏폼을 삭제하시겠습니까? 이 브라우저의 대본/미디어와 Supabase에 백업된 대본이 모두 삭제되며, 복구할 수 없습니다."
    : "이 로컬 임시 숏폼을 삭제하시겠습니까? (Supabase에는 저장된 적이 없어 복구할 수 없습니다)";
  if (!confirm(confirmMsg)) return;
  if (hasSupabaseCopy) {
    await window.SupabaseAdapter.deleteShorts(draft.id);
  }
  await deleteShortsDraftLocally(localDraftId);
  renderShortsList();
}

// 최신 기사가 위쪽에 오도록 정렬한다 (기존엔 정렬 없이 오래된 기사부터
// 나열돼 있었다) -- 기사 관리 목록과 동일한 기준(날짜 우선, 같은 날짜는
// approvedAt/scheduledAt 정밀 시각으로 타이브레이크)을 사용한다.
async function populateShortsArticleSelect() {
  const select = document.getElementById("shorts-article-select");
  const articles = await window.SupabaseAdapter.fetchArticles();
  const usable = articles
    .filter(a => ['published', 'approved', 'scheduled'].includes(a.status))
    .sort((a, b) => {
      const dateDiff = parseKoreanDate(b.date) - parseKoreanDate(a.date);
      if (dateDiff !== 0) return dateDiff;
      const aTime = new Date(a.approvedAt || a.scheduledAt || 0).getTime() || 0;
      const bTime = new Date(b.approvedAt || b.scheduledAt || 0).getTime() || 0;
      return bTime - aTime;
    });
  select.innerHTML = `<option value="">-- 기사를 선택하세요 --</option>` +
    usable.map(a => `<option value="${a.id}">${a.title} · ${a.date}</option>`).join('');
}

function resetShortsWizardSections() {
  document.getElementById("shorts-script-review").style.display = "none";
  document.getElementById("shorts-media-section").style.display = "none";
  document.getElementById("shorts-assembly-section").style.display = "none";
  document.getElementById("shorts-final-preview").style.display = "none";
  const downloadEl = document.getElementById("shorts-final-download");
  if (downloadEl) downloadEl.style.display = "none";
  const convertMp4Btn = document.getElementById("shorts-convert-mp4-btn");
  if (convertMp4Btn) convertMp4Btn.style.display = "none";
  const narrationStatusEl = document.getElementById("shorts-narration-status");
  if (narrationStatusEl) narrationStatusEl.textContent = "각 컷 화면에 나올 자막을 그대로 읽습니다. 생성하지 않으면 무음(또는 Veo 클립 자체 소리)만 남습니다.";
  const hookAudioEl = document.getElementById("shorts-hook-narration-preview");
  if (hookAudioEl) { hookAudioEl.style.display = "none"; hookAudioEl.src = ""; }
  const selfCheckEl = document.getElementById("shorts-selfcheck-section");
  if (selfCheckEl) selfCheckEl.style.display = "none";
  const veoPromptEditorEl = document.getElementById("shorts-veo-prompt-editor");
  if (veoPromptEditorEl) veoPromptEditorEl.style.display = "none";
  const youtubeMetaEl = document.getElementById("shorts-youtube-meta");
  if (youtubeMetaEl) youtubeMetaEl.style.display = "none";
  const narrationPlayerEl = document.getElementById("shorts-narration-player");
  if (narrationPlayerEl) narrationPlayerEl.style.display = "none";
  document.getElementById("shorts-media-preview").innerHTML = "";
  document.getElementById("shorts-media-status").textContent = "";
  document.getElementById("shorts-assembly-status").textContent = "녹화 중에는 이 탭을 벗어나지 마세요 (화면을 그대로 녹화합니다).";
  shortsPendingUploads = [];
  renderShortsPendingUploads();

  // Reset back to the 수동 생성 mode tab on every fresh/reopened project,
  // same as the "every step reopens expanded" reset just below. (자동 생성
  // is temporarily hidden -- 2026-08-27, API 비용 절감 -- so this resets to
  // 수동 instead of 자동 for now; see the button's style="display:none" in
  // admin/index.html to restore both.)
  const manualReviewEl = document.getElementById("shorts-manual-review");
  if (manualReviewEl) manualReviewEl.style.display = "none";
  const manualModeBtn = document.querySelector('.shorts-mode-tab-btn[data-mode="manual"]');
  if (manualModeBtn) switchShortsModeTab('manual', manualModeBtn);
  renderShortsAssignedUploads();

  // Every step reopens expanded on a fresh/reopened project, regardless of
  // how the admin left a previous project's steps collapsed.
  document.querySelectorAll(".shorts-step-header, .shorts-step-body").forEach(el => {
    el.classList.remove("is-collapsed");
  });
}

// Selecting files just queues them -- nothing uploads until the admin picks
// where each one goes (전반/후반), so a mis-click doesn't waste an upload.
function handleShortsMediaUpload(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (files.length === 0) return;

  files.forEach(file => {
    shortsPendingUploads.push({ file, tempId: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}` });
  });
  renderShortsPendingUploads();
}

function renderShortsPendingUploads() {
  const container = document.getElementById("shorts-pending-uploads");
  if (!container) return;
  container.innerHTML = shortsPendingUploads.map(p => `
    <div style="display:flex; align-items:center; gap:8px; border:1px dashed var(--admin-border); border-radius:6px; padding:8px; margin-bottom:6px; flex-wrap: wrap;">
      <span style="flex:1; font-size:0.78rem; min-width: 120px;">${p.file.name} (${p.file.type.startsWith('video') ? '영상' : '사진'})</span>
      <button type="button" class="btn-admin btn-admin-secondary" onclick="assignShortsUpload('${p.tempId}', 'front')">전반(0:00~0:08)에 사용</button>
      <button type="button" class="btn-admin btn-admin-secondary" onclick="assignShortsUpload('${p.tempId}', 'back')">후반(이미지)에 사용</button>
      <button type="button" class="btn-admin btn-admin-danger" onclick="removeShortsPendingUpload('${p.tempId}')">취소</button>
    </div>
  `).join('');
}

function removeShortsPendingUpload(tempId) {
  shortsPendingUploads = shortsPendingUploads.filter(p => p.tempId !== tempId);
  renderShortsPendingUploads();
}

async function assignShortsUpload(tempId, placement) {
  const pending = shortsPendingUploads.find(p => p.tempId === tempId);
  if (!pending) return;

  if (placement === 'back') {
    const currentBackCount = (currentShortsProject.backUploads || []).length;
    if (currentBackCount >= SHORTS_MAX_BACK_UPLOADS) {
      alert(`후반 자료는 최대 ${SHORTS_MAX_BACK_UPLOADS}개까지만 사용할 수 있습니다.`);
      return;
    }
  }

  shortsPendingUploads = shortsPendingUploads.filter(p => p.tempId !== tempId);
  renderShortsPendingUploads();

  const isVideo = pending.file.type.startsWith('video');
  const draftId = ensureShortsLocalDraftId();

  try {
    let url;
    let mediaKey;
    if (placement === 'front') {
      mediaKey = `${draftId}:front`;
    } else {
      mediaKey = `${draftId}:cut:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    if (isVideo) {
      url = await keepShortsBlobLocal(pending.file, mediaKey);
    } else {
      url = await keepShortsImageLocal(pending.file, mediaKey);
    }

    if (placement === 'front') {
      currentShortsProject.frontUpload = { url, type: isVideo ? 'video' : 'image', name: pending.file.name };
    } else {
      currentShortsProject.backUploads = currentShortsProject.backUploads || [];
      currentShortsProject.backUploads.push({ url, type: isVideo ? 'video' : 'image', name: pending.file.name, imageKey: mediaKey });
    }
    renderShortsAssignedUploads();
  } catch (err) {
    console.error("숏폼 자료 업로드 실패:", err);
    alert("업로드 실패: " + err.message);
  }
}

function renderShortsAssignedUploads() {
  const container = document.getElementById("shorts-assigned-uploads");
  if (!container || !currentShortsProject) return;

  const items = [];
  if (currentShortsProject.frontUpload) {
    items.push(`
      <div style="display:flex; align-items:center; gap:8px; border:1px solid var(--admin-border); border-radius:6px; padding:8px; margin-bottom:6px;">
        <span style="flex:1; font-size:0.78rem;">📹 전반(0:00~0:08): ${currentShortsProject.frontUpload.name}</span>
        <button type="button" class="btn-admin btn-admin-danger" onclick="removeShortsFrontUpload()">제거</button>
      </div>
    `);
  }
  (currentShortsProject.backUploads || []).forEach((u, i) => {
    items.push(`
      <div style="display:flex; align-items:center; gap:8px; border:1px solid var(--admin-border); border-radius:6px; padding:8px; margin-bottom:6px;">
        <span style="flex:1; font-size:0.78rem;">🖼️ 후반: ${u.name}</span>
        <button type="button" class="btn-admin btn-admin-danger" onclick="removeShortsBackUpload(${i})">제거</button>
      </div>
    `);
  });
  container.innerHTML = items.join('');
}

function removeShortsFrontUpload() {
  currentShortsProject.frontUpload = null;
  renderShortsAssignedUploads();
}

function removeShortsBackUpload(i) {
  currentShortsProject.backUploads.splice(i, 1);
  renderShortsAssignedUploads();
}

async function startNewShortsProject() {
  currentShortsProject = { id: null, status: 'script_draft', imageCuts: [], frontUpload: null, backUploads: [] };
  shortsAssets = null;

  document.getElementById("shorts-wizard-title").textContent = "새 숏폼 제작";
  await populateShortsArticleSelect();
  document.getElementById("shorts-article-select").value = "";

  // Pre-select whichever style template was used last, so admins don't have
  // to re-upload/re-pick a reference video for every new project -- but they
  // can still switch templates or start blank from the dropdown.
  const lastTemplateId = localStorage.getItem(SHORTS_LAST_TEMPLATE_ID_KEY) || "";
  populateShortsStyleTemplateSelect(lastTemplateId);
  applyShortsStyleTemplate(lastTemplateId);

  resetShortsWizardSections();

  document.getElementById("shorts-wizard-panel").style.display = "block";
  ensureShortsStoragePersisted();
  loadGeminiApiKey();
}

async function openShortsProject(id) {
  // If this browser has a local draft linked to this Supabase row, ALWAYS
  // open that instead -- it's the copy that actually has the Veo clip/image
  // cuts/narration blobs. Opening the Supabase row directly gives a
  // media-less copy of the same project, which reads as "my media is all
  // gone" even though everything is sitting in IndexedDB behind the local
  // draft. (The list's 열기 button already prefers the local draft, but this
  // guards every other path to make the split impossible.)
  const linkedDraft = getShortsLocalDrafts().find(d => d.id === id);
  if (linkedDraft) {
    await openLocalShortsDraft(linkedDraft.localDraftId);
    return;
  }

  const project = await window.SupabaseAdapter.fetchShortsById(id);
  if (!project) {
    alert("프로젝트를 찾을 수 없습니다.");
    return;
  }
  currentShortsProject = project;
  const scriptJson = project.scriptJson || {};
  // 대본/자막/나레이션 all came back from Supabase (narrationAudio is a
  // base64 data: URL, directly usable as an <audio>/playback src) --
  // narrationBase64 is re-cached from it too, so a later
  // syncShortsScriptToSupabase() call re-sends the same audio instead of
  // overwriting it with blank. Images/영상 were never sent to Supabase in
  // the first place (kept local-only), so they simply aren't here -- media
  // needs regenerating in step 3 if this browser doesn't already have it
  // as a local draft (openLocalShortsDraft covers that case instead).
  currentShortsProject.imageCuts = (currentShortsProject.imageCuts || []).map(cut => ({
    ...cut,
    imageUrl: '',
    narrationUrl: cut.narrationAudio || '',
    narrationBase64: cut.narrationAudio || ''
  }));
  currentShortsProject.hookNarrationUrl = scriptJson.hookNarrationAudio || '';
  currentShortsProject.hookNarrationBase64 = scriptJson.hookNarrationAudio || '';
  currentShortsProject.topBarTitle = scriptJson.topBarTitle || '';
  currentShortsProject.topBarTitleLine2 = scriptJson.topBarTitleLine2 || '';
  currentShortsProject.topBarColor = scriptJson.topBarColor;
  currentShortsProject.topBarHeight = scriptJson.topBarHeight;
  currentShortsProject.topBarTitleFontSize = scriptJson.topBarTitleFontSize;
  currentShortsProject.topBarTitleColor = scriptJson.topBarTitleColor;
  currentShortsProject.topBarTitleColorLine2 = scriptJson.topBarTitleColorLine2;
  currentShortsProject.captionFontSize = scriptJson.captionFontSize;
  currentShortsProject.captionColor = scriptJson.captionColor;
  currentShortsProject.captionPosition = scriptJson.captionPosition;
  currentShortsProject.narrationSpeed = scriptJson.narrationSpeed || 1.2;
  currentShortsProject.extraCutSeconds = scriptJson.extraCutSeconds || 0;
  // frontUpload/backUploads are transient staging state (not persisted --
  // once media generation runs they're baked into veoVideoUrl/imageCuts),
  // so reopening a saved project always starts with an empty upload queue.
  currentShortsProject.frontUpload = null;
  currentShortsProject.backUploads = [];
  shortsAssets = null;

  document.getElementById("shorts-wizard-title").textContent = `숏폼 #${id} 편집`;
  await populateShortsArticleSelect();
  document.getElementById("shorts-article-select").value = project.articleId || "";
  populateShortsStyleTemplateSelect(""); // this project's own saved text, not tied to a template
  document.getElementById("shorts-style-guide").value = project.styleGuide || "";
  document.getElementById("shorts-style-status").textContent = "업로드하면 AI가 영상의 분위기·톤·편집 리듬을 분석해 스타일 가이드를 만듭니다.";
  resetShortsWizardSections();

  if (project.scriptMd || project.veoPrompt) {
    renderShortsScriptReview();
    renderShortsManualPanel();
  }
  if (['script_approved', 'media_ready', 'video_ready'].includes(project.status)) {
    document.getElementById("shorts-media-section").style.display = "block";
    renderShortsMediaPreview();
  }
  if (['media_ready', 'video_ready'].includes(project.status)) {
    document.getElementById("shorts-assembly-section").style.display = "block";
    populateShortsStyleSettingsUI();
  }
  if (project.status === 'video_ready' && project.finalVideoUrl) {
    const previewEl = document.getElementById("shorts-final-preview");
    previewEl.src = project.finalVideoUrl;
    previewEl.style.display = "block";
    updateShortsConvertMp4ButtonVisibility();
    renderShortsYoutubeMetadata();
  }

  document.getElementById("shorts-wizard-panel").style.display = "block";
  ensureShortsStoragePersisted();
  loadGeminiApiKey();
}

// Resumes a local-only draft (script text saved via saveShortsDraftLocally).
// Media never survives a reload since it's only ever an in-browser object
// URL, so this always reopens at most at the 대본 승인 stage -- media/조립
// sections stay hidden and must be regenerated if needed.
// Resumes a local-only draft: script/style text comes straight from the
// localStorage snapshot, and any media (Veo clip/images/final render/
// narration) is rehydrated from IndexedDB into fresh object URLs -- the
// ones from the previous session are already dead by the time this runs.
async function openLocalShortsDraft(localDraftId) {
  const draft = getShortsLocalDrafts().find(d => d.localDraftId === localDraftId);
  if (!draft) {
    alert("로컬 임시 숏폼을 찾을 수 없습니다.");
    return;
  }
  currentShortsProject = {
    id: draft.id || null,
    localDraftId: draft.localDraftId,
    articleId: draft.articleId,
    status: draft.status,
    hookText: draft.hookText,
    veoPrompt: draft.veoPrompt,
    scriptMd: draft.scriptMd,
    styleGuide: draft.styleGuide,
    frontIsImage: !!draft.frontIsImage,
    imageCuts: (draft.imageCuts || []).map(c => ({ ...c, imageUrl: '' })),
    createdBy: draft.createdBy,
    frontUpload: null,
    backUploads: [],
    topBarColor: draft.topBarColor,
    topBarHeight: draft.topBarHeight,
    topBarTitleColor: draft.topBarTitleColor,
    topBarTitleColorLine2: draft.topBarTitleColorLine2,
    topBarTitle: draft.topBarTitle,
    topBarTitleLine2: draft.topBarTitleLine2,
    topBarTitleFontSize: draft.topBarTitleFontSize,
    captionFontSize: draft.captionFontSize,
    captionColor: draft.captionColor,
    captionPosition: draft.captionPosition,
    narrationSpeed: draft.narrationSpeed || 1.2,
    extraCutSeconds: draft.extraCutSeconds || 0
  };
  shortsAssets = null;

  // A key existing (hasFront/imageKey/etc.) but idbGetBlob() coming back
  // null used to be handled identically to "there was never any media here"
  // -- imageUrl/finalVideoUrl etc. just silently stayed blank, no alert, no
  // console warning, nothing. That's indistinguishable from real data loss
  // to whoever's looking at Step 3 missing thumbnails it had a moment ago.
  // Track every expected-but-missing item and surface it as one alert.
  const missingMedia = [];
  try {
    if (draft.hasFront) {
      const blob = await idbGetBlob(`${localDraftId}:front`);
      if (blob) currentShortsProject.veoVideoUrl = URL.createObjectURL(blob);
      else missingMedia.push("전반(0:00~0:08) 영상/이미지");
    }
    if (draft.hasFinal) {
      const blob = await idbGetBlob(`${localDraftId}:final`);
      if (blob) {
        currentShortsProject.finalVideoUrl = URL.createObjectURL(blob);
        currentShortsProject.finalVideoMimeType = blob.type;
      } else {
        missingMedia.push("완성된 최종 영상");
      }
    }
    if (draft.hasHookNarration) {
      const blob = await idbGetBlob(`${localDraftId}:narration:hook`);
      if (blob) {
        currentShortsProject.hookNarrationKey = `${localDraftId}:narration:hook`;
        currentShortsProject.hookNarrationUrl = URL.createObjectURL(blob);
        // Re-cache the base64 copy too -- without it, the next
        // syncShortsScriptToSupabase() call would see an empty
        // hookNarrationBase64 and overwrite the already-saved audio with
        // blank on Supabase.
        currentShortsProject.hookNarrationBase64 = await blobToBase64DataUrl(blob);
      } else {
        missingMedia.push("후킹 나레이션");
      }
    }
    let cutIdx = 0;
    for (const cut of currentShortsProject.imageCuts) {
      cutIdx += 1;
      if (cut.imageKey) {
        const blob = await idbGetBlob(cut.imageKey);
        if (blob) {
          cut.imageUrl = URL.createObjectURL(blob);
        } else {
          missingMedia.push(`컷 ${cutIdx} 이미지`);
        }
      }
      if (cut.narrationKey) {
        const blob = await idbGetBlob(cut.narrationKey);
        if (blob) {
          cut.narrationUrl = URL.createObjectURL(blob);
          cut.narrationBase64 = await blobToBase64DataUrl(blob);
        } else {
          missingMedia.push(`컷 ${cutIdx} 나레이션`);
        }
      }
    }
  } catch (err) {
    console.warn("로컬 미디어 복원 중 일부 실패:", err);
    missingMedia.push("(복원 중 오류 발생 -- 콘솔 참고)");
  }
  if (missingMedia.length > 0) {
    alert(`⚠ 이 브라우저에서 다음 미디어를 찾지 못했습니다 -- 다시 생성해야 합니다:\n\n${missingMedia.join('\n')}\n\n(대본/자막 등 텍스트는 영향 없습니다.)`);
  }

  document.getElementById("shorts-wizard-title").textContent = "로컬 임시 숏폼 편집";
  await populateShortsArticleSelect();
  document.getElementById("shorts-article-select").value = draft.articleId || "";
  populateShortsStyleTemplateSelect("");
  document.getElementById("shorts-style-guide").value = draft.styleGuide || "";
  document.getElementById("shorts-style-status").textContent = "업로드하면 AI가 영상의 분위기·톤·편집 리듬을 분석해 스타일 가이드를 만듭니다.";
  resetShortsWizardSections();

  if (currentShortsProject.scriptMd || currentShortsProject.veoPrompt) {
    renderShortsScriptReview();
    renderShortsManualPanel();
  }
  if (currentShortsProject.status !== 'script_draft') {
    document.getElementById("shorts-media-section").style.display = "block";
    renderShortsMediaPreview();
  }
  if (currentShortsProject.veoVideoUrl || (currentShortsProject.imageCuts || []).some(c => c.imageUrl)) {
    document.getElementById("shorts-assembly-section").style.display = "block";
    populateShortsStyleSettingsUI();
  }
  if (currentShortsProject.finalVideoUrl) {
    const previewEl = document.getElementById("shorts-final-preview");
    previewEl.src = currentShortsProject.finalVideoUrl;
    previewEl.style.display = "block";
    const downloadEl = document.getElementById("shorts-final-download");
    if (downloadEl) {
      downloadEl.href = currentShortsProject.finalVideoUrl;
      downloadEl.download = `shorts-${localDraftId}.${shortsVideoExtFromMime(currentShortsProject.finalVideoMimeType)}`;
      downloadEl.style.display = "inline-block";
    }
    updateShortsConvertMp4ButtonVisibility();
    renderShortsYoutubeMetadata();
  }
  document.getElementById("shorts-wizard-panel").style.display = "block";
  ensureShortsStoragePersisted();
  loadGeminiApiKey();
}

function closeShortsWizard() {
  document.getElementById("shorts-wizard-panel").style.display = "none";
  currentShortsProject = null;
  shortsAssets = null;
  renderShortsList();
}

// Collapses/expands one of the wizard's STEP sections -- purely a display
// toggle on top of the existing "reveal this step" logic (steps 3/4 still
// get shown/hidden by the pipeline itself; this just lets the admin fold
// away a step they're done with).
function toggleShortsStep(n, headerEl) {
  const body = document.getElementById(`shorts-step-body-${n}`);
  if (!body) return;
  body.classList.toggle("is-collapsed");
  if (headerEl) headerEl.classList.toggle("is-collapsed");
}

// Saves during drafting: text fields go to localStorage AND to Supabase
// (대본/자막/나레이션 -- everything except the generated images/영상, which
// stay local-only object URLs/IndexedDB, per the storage-minimization
// approach). This is what makes the script/narration survive a different
// browser, a cleared localStorage, or just time -- unlike media, losing it
// isn't something the admin can just regenerate identically.
async function persistCurrentShortsProject() {
  const session = getAdminSession();
  currentShortsProject.createdBy = currentShortsProject.createdBy || (session ? session.name : '');
  saveShortsDraftLocally();
  await syncShortsScriptToSupabase();
  await renderShortsList();
}

// Upserts the current project's text + narration audio to Supabase's
// `shorts` table. image_cuts and script_json are already generic JSON
// columns, so this rides on the existing schema -- no migration needed.
// Narration audio is embedded as a base64 data: URL in the same column,
// matching how this project already stores article images (a plain DB
// column, no Storage bucket configured). Images/영상 are deliberately left
// out -- they're too large for a DB column at scale and stay local-only
// (IndexedDB/object URLs), regenerable if lost. Silently logs and continues
// on failure -- the localStorage/IndexedDB copy from saveShortsDraftLocally()
// already covers this browser; Supabase is the cross-device/cross-session
// safety net, not the only copy.
async function syncShortsScriptToSupabase() {
  if (!currentShortsProject) return;
  if (!currentShortsProject.hookText && !currentShortsProject.scriptMd) return; // nothing to back up yet
  try {
    const session = getAdminSession();
    const imageCuts = (currentShortsProject.imageCuts || []).map(cut => ({
      prompt: cut.prompt || '',
      caption: cut.caption || '',
      caption2: cut.caption2 || '',
      narrationText: cut.narrationText || '',
      duration: cut.duration || 5,
      uploaded: !!cut.uploaded,
      narrationAudio: cut.narrationBase64 || ''
    }));

    const payload = {
      id: currentShortsProject.id || null,
      articleId: currentShortsProject.articleId,
      status: currentShortsProject.status,
      hookText: currentShortsProject.hookText || '',
      scriptMd: currentShortsProject.scriptMd || '',
      styleGuide: currentShortsProject.styleGuide || '',
      veoPrompt: currentShortsProject.veoPrompt || '',
      frontIsImage: !!currentShortsProject.frontIsImage,
      imageCuts,
      scriptJson: {
        hookNarrationAudio: currentShortsProject.hookNarrationBase64 || '',
        topBarTitle: currentShortsProject.topBarTitle || '',
        topBarTitleLine2: currentShortsProject.topBarTitleLine2 || '',
        topBarColor: currentShortsProject.topBarColor,
        topBarHeight: currentShortsProject.topBarHeight,
        topBarTitleFontSize: currentShortsProject.topBarTitleFontSize,
        topBarTitleColor: currentShortsProject.topBarTitleColor,
        topBarTitleColorLine2: currentShortsProject.topBarTitleColorLine2,
        captionFontSize: currentShortsProject.captionFontSize,
        captionColor: currentShortsProject.captionColor,
        captionPosition: currentShortsProject.captionPosition,
        narrationSpeed: currentShortsProject.narrationSpeed,
        extraCutSeconds: currentShortsProject.extraCutSeconds || 0
      },
      createdBy: currentShortsProject.createdBy || (session ? session.name : '')
    };

    const hadId = !!currentShortsProject.id;
    const saved = await window.SupabaseAdapter.saveShorts(payload);
    if (saved && saved.id) {
      currentShortsProject.id = saved.id;
      // The local snapshot was typically written BEFORE this sync ran, so on
      // the very first successful sync it still says id:null on disk. Left
      // that way, the list can't link the Supabase row to this local draft
      // and shows them as two separate projects -- clicking the Supabase one
      // opens a media-less copy that looks like everything was lost. Re-save
      // immediately so the id is recorded the moment it exists.
      if (!hadId) saveShortsDraftLocally();
    }
  } catch (err) {
    console.error("대본/나레이션 Supabase 저장 실패 (로컬에는 저장됨):", err);
  }
}

// 보관: marks the project as done and clears its local draft (media stays
// local-only regardless -- download it first if it needs to be kept). The
// text/narration is already backed up continuously by
// syncShortsScriptToSupabase() above; this just changes its status and
// stops treating it as an in-progress local draft.
// "보관" only marks the project done and backs the script text/narration up
// to Supabase -- it must NOT touch the local draft. Media (Veo clip, image
// cuts, final render) plus the script itself all keep living in this
// browser's localStorage/IndexedDB exactly as before, so reopening the
// local draft afterward still loads everything. (This used to also delete
// the local draft here, which silently wiped the very media the admin
// expected to still be able to reload -- fixed.)
async function archiveShortsProject() {
  if (!currentShortsProject) return;
  if (!currentShortsProject.scriptMd && !currentShortsProject.hookText) {
    alert("보관할 대본이 없습니다. 먼저 대본을 생성해 주세요.");
    return;
  }
  currentShortsProject.status = 'archived';
  await persistCurrentShortsProject();
  alert("숏폼을 보관 완료로 표시했습니다. 대본·자막·나레이션은 Supabase에도 백업되었고, 대본·자막·나레이션·이미지·영상 모두 이 브라우저에 그대로 저장되어 있어 목록에서 다시 열면 이어서 작업할 수 있습니다.");
}

// Uploads a file to Gemini's Files API (supports up to 2GB per file, unlike
// generateContent's inline-data parts which are capped around ~20MB total
// request size) and waits for server-side processing to finish before it can
// be referenced. Files auto-expire after 48 hours on Google's side -- no
// explicit cleanup needed for a one-off analysis like this.
async function uploadFileToGeminiFilesApi(file, apiKey) {
  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": file.type || 'video/mp4',
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ file: { display_name: file.name || 'reference-video' } })
  });
  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`영상 업로드 시작 실패 (HTTP ${startRes.status}): ${errText}`);
  }
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("영상 업로드 URL을 받지 못했습니다.");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: file
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`영상 업로드 실패 (HTTP ${uploadRes.status}): ${errText}`);
  }
  let fileInfo = (await uploadRes.json()).file;
  if (!fileInfo || !fileInfo.uri) {
    throw new Error("업로드된 영상 정보를 받지 못했습니다.");
  }

  // Video files need server-side processing before they're usable.
  let attempts = 0;
  while (fileInfo.state === 'PROCESSING' && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000));
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileInfo.name}?key=${apiKey}`);
    if (!checkRes.ok) break;
    fileInfo = await checkRes.json();
    attempts++;
  }
  if (fileInfo.state === 'FAILED') {
    throw new Error("영상 처리에 실패했습니다.");
  }

  return { uri: fileInfo.uri, mimeType: fileInfo.mimeType || file.type || 'video/mp4' };
}

// Analyzes an uploaded reference shorts video with Gemini's multimodal
// understanding and returns a written mood/tone/pacing summary -- actual
// pixel-level style transfer isn't something current AI APIs support, so
// this summary is fed as a text style guide into the script/image prompts
// instead (see generateShortsScript / generateShortsMedia).
async function analyzeShortsStyleReference(file) {
  const apiKey = localStorage.getItem("baikal_gemini_key");
  if (!apiKey) {
    throw new Error("Gemini API Key가 등록되지 않았습니다. (참고 영상 분석에도 이미지 생성용 Gemini 키를 사용합니다)");
  }

  const uploaded = await uploadFileToGeminiFilesApi(file, apiKey);
  const model = await resolveGeminiVisionModel(apiKey);
  const prompt = `아래 업로드된 숏폼 영상을 분석하여, 이 영상의 분위기·톤·편집 리듬·색감·자막 스타일을 한국어로 간결하게 요약해 주십시오. 이 요약은 이후 비슷한 분위기의 새로운 숏폼 영상을 기획할 때 스타일 가이드로 사용됩니다.

다음 항목을 포함해 5~8문장으로 작성하십시오:
- 전반적인 분위기/톤
- 색감/조명 특징
- 컷 전환 속도와 리듬
- 자막/텍스트 오버레이 스타일
- 후킹(도입부) 연출 방식

다른 설명 없이 요약 본문만 출력하십시오.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } },
          { text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`영상 분석 실패 (HTTP ${response.status}): ${errText}`);
  }
  const data = await response.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!parts || !parts[0] || !parts[0].text) {
    throw new Error("영상 분석 결과를 받지 못했습니다.");
  }
  return parts[0].text.trim();
}

async function handleShortsStyleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById("shorts-style-status");
  statusEl.textContent = "영상 분석 중...";
  try {
    const summary = await analyzeShortsStyleReference(file);
    document.getElementById("shorts-style-guide").value = summary;
    statusEl.textContent = "분석 완료: 스타일 가이드가 채워졌습니다. 마음에 들면 아래 \"템플릿으로 저장\"으로 이름을 붙여 두면 다음부터 골라서 다시 쓸 수 있습니다.";
  } catch (err) {
    console.error("숏폼 스타일 분석 실패:", err);
    statusEl.textContent = "분석 실패: " + err.message;
  } finally {
    event.target.value = "";
  }
}

async function generateShortsScript() {
  const articleId = parseInt(document.getElementById("shorts-article-select").value, 10);
  if (!articleId) {
    alert("원본 기사를 선택해 주세요.");
    return;
  }

  // Regenerating overwrites currentShortsProject.imageCuts entirely, so any
  // already-generated cut images become orphaned (nothing in the new cuts
  // still points at them). The Veo video isn't touched here, but it was
  // rendered from the OLD hook/veoPrompt and may no longer match the new
  // one. Confirm before silently discarding media that cost real money to
  // generate -- Step 2 stays reachable/clickable even after Step 3/4, so
  // this is the only guard against an accidental re-click.
  if (currentShortsProject) {
    const hasExistingImages = (currentShortsProject.imageCuts || []).some(c => c.imageUrl && !c.uploaded);
    const hasExistingVeo = !!currentShortsProject.veoVideoUrl && !currentShortsProject.frontUpload;
    if (hasExistingImages || hasExistingVeo) {
      const warnings = [];
      if (hasExistingImages) warnings.push("- 이미 생성된 이미지 컷은 모두 사라지고, 새 대본에 맞춰 다시 생성해야 합니다.");
      if (hasExistingVeo) warnings.push("- 기존 Veo 영상은 바로 삭제되진 않지만, 새로 생성될 대본/후킹과 더 이상 맞지 않을 수 있습니다 (필요하면 Step 3에서 다시 생성하세요).");
      const proceed = confirm(`대본을 다시 생성하면:\n${warnings.join('\n')}\n\n그래도 계속하시겠습니까?`);
      if (!proceed) return;
    }
  }

  const articles = await window.SupabaseAdapter.fetchArticles();
  const article = articles.find(a => a.id === articleId);
  if (!article) {
    alert("선택한 기사를 찾을 수 없습니다.");
    return;
  }

  const styleGuide = document.getElementById("shorts-style-guide").value.trim();
  const btn = document.getElementById("shorts-generate-script-btn");
  if (btn) { btn.disabled = true; btn.textContent = "대본 생성 중..."; }

  beginShortsBusyOperation();
  try {
    const bodyText = (article.content || "").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const hasFrontUpload = !!currentShortsProject.frontUpload;
    const backUploads = currentShortsProject.backUploads || [];
    const neededAiCuts = Math.max(0, SHORTS_TARGET_CUT_COUNT - backUploads.length);
    const perCutDuration = Math.max(3, Math.round(22 / SHORTS_TARGET_CUT_COUNT));
    // A soft target, not a hard cap enforced in code -- a previous attempt at
    // truncating narration text after the fact lost meaning mid-sentence,
    // which was worse than a slightly-too-long script. Raised from 4.5 to 6
    // chars/sec after feedback that scripts were coming out too short --
    // 4.5 (a natural TTS speaking pace) was too conservative given 재생
    // 속도 now defaults to 1.0~1.2x rather than always compensating with
    // speed, and "이미지 컷 1초씩 늘리기" exists as a release valve if a
    // script still doesn't fit.
    const targetNarrationChars = Math.round(perCutDuration * 6);

    const frontInstruction = hasFrontUpload
      ? `- 0:00~0:08 (전반)은 관리자가 이미 준비한 영상/사진을 사용합니다. "veoPrompt"는 빈 문자열("")로 반환하십시오.`
      : `- 0:00~0:08 (Veo): 실사 다큐멘터리/기록영상 톤의 8초 연속 장면 하나를 한글 프롬프트로 묘사하십시오. 카메라 움직임, 장소, 분위기를 구체적으로 묘사하되 일러스트/애니메이션 스타일은 피하십시오.`;
    const backInstruction = neededAiCuts > 0
      ? `- 0:08~0:30 (이미지, 22초): ${neededAiCuts}개의 정지 이미지 컷을 작성하십시오. (전체 ${SHORTS_TARGET_CUT_COUNT}컷 중 ${backUploads.length}개는 관리자가 이미 준비한 자료를 사용하므로 나머지 ${neededAiCuts}개만 작성하면 됩니다.) 각 컷은 한글 이미지 생성 프롬프트(다큐멘터리 사진 스타일, 세로 구도), 나레이션으로 읽을 자연스러운 한 문장(자막보다 길고 설명적으로 -- 단, 소리 내어 읽었을 때 ${perCutDuration}초 안팎(약 ${targetNarrationChars}자 내외)에 끝나는 것을 목표로 하고, 내용이 중간에 끊기지 않도록 자연스럽게 마무리하십시오), 화면에 표시할 한국어 자막 2개(caption1, caption2 -- 이 컷이 보여지는 동안 순서대로 화면에 표시됩니다. 각각 15자 내외로 짧고 임팩트 있게 작성하고, 나레이션 문장의 요약이 아니라 완전히 별도의 짧은 문구여야 하며, caption1과 caption2는 서로 다른 내용이어야 합니다 -- 예: 상황 제시 -> 핵심 포인트, 또는 질문 -> 답 형태로 자연스럽게 이어지게), 지속 시간(초, ${perCutDuration}초 내외)을 포함해야 합니다.`
      : `- 0:08~0:30 구간에 쓸 이미지는 관리자가 이미 모두 준비했으므로, "imageCuts"는 빈 배열([])로 반환하십시오.`;

    const prompt = `
아래 뉴스 기사를 바탕으로, 총 30초 분량의 세로형(9:16) 숏폼 영상 대본을 기획하십시오.

[기사 제목]
${article.title}

[리드 문단]
${article.lead || ''}

[본문 요약]
${bodyText.substring(0, 2500)}
${styleGuide ? `\n[참고 스타일 가이드 - 반드시 이 분위기/톤/편집 리듬을 반영하십시오]\n${styleGuide}\n` : ''}

[영상 구성 규칙]
- 전체 30초 = 0:00~0:08 (전반) + 0:08~0:30 (후반, 정지 이미지 ${SHORTS_TARGET_CUT_COUNT}컷, 각 컷에 자막)
- 가장 중요: 0:00~0:03 구간에서 시청자의 스크롤을 멈추게 할 강력한 후킹(hook) 문구를 만드십시오. (전반이 업로드 자료로 대체되어도 이 후킹 자막은 그대로 화면에 표시됩니다.)
${frontInstruction}
${backInstruction}

- 영상 상단에 항상 떠 있는 배너에 들어갈 짧은 후킹 제목도 추천하십시오. 자막(hookText)과는 별개로, 영상 내내 노출되는 타이틀입니다. 1줄로 충분하면 2번째 줄은 빈 문자열로 두십시오.
- (중요) veoPrompt와 각 imageCuts의 prompt에 사람이 등장한다면 반드시 한국인/동양인 외모로 묘사하십시오. 외국인, 서양인, 혼혈로 보이는 인물은 절대 등장시키지 마십시오. AI는 한글 텍스트도 철자가 틀리게 그리므로, 화면에 텍스트(휴대폰 화면, 간판, 문서, 자막 등)가 등장하는 장면은 언어와 상관없이 절대 만들지 마십시오. 간판이 있는 장소라면 안 보이는 구도로 묘사하십시오.

반드시 다음 JSON 형식으로만 답하십시오. 백틱이나 다른 설명 없이 JSON 객체만 출력하십시오. "scriptMd"처럼 여러 줄로 작성하는 값 안의 줄바꿈은 반드시 \\n으로 이스케이프하여, 유효한 JSON 문자열 하나로 만드십시오 (실제 줄바꿈 문자를 문자열 안에 그대로 넣지 마십시오).
{
  "hookText": "0:00~0:03 자막에 사용할 강력한 후킹 문구 (15자 내외)",
  "veoPrompt": "0:00~0:08 Veo 영상용 한글 프롬프트 (후킹 장면 포함, 위 지침에 따라 빈 문자열일 수 있음)",
  "imageCuts": [
    { "prompt": "한글 이미지 프롬프트", "narration": "이 컷에서 나레이션으로 읽을 자연스러운 한 문장 (자막보다 길고 설명적으로)", "caption1": "이 컷 전반부에 표시할 짧고 임팩트있는 자막 (15자 내외)", "caption2": "이 컷 후반부에 표시할, caption1과 다른 짧은 자막 (15자 내외)", "duration": ${perCutDuration} }
  ],
  "scriptMd": "마크다운 형식의 전체 대본 문서 (타임라인 표 형태, 후킹을 강조하여 작성 -- 줄바꿈은 \\n으로 이스케이프)",
  "topBarTitleLine1": "상단 배너용 후킹 제목 1줄 (6~10자 내외)",
  "topBarTitleLine2": "상단 배너용 후킹 제목 2줄 (선택, 없으면 빈 문자열)"
}
`;

    const resultText = await callGeminiTextApi(prompt, "당신은 숏폼 영상 기획 전문 PD입니다. 반드시 유효한 JSON 오브젝트로만 답하십시오.");
    const script = parseAiJsonResponse(resultText);

    const aiCuts = (script.imageCuts || []).map(c => ({
      // c.caption is a fallback for the old single-caption schema, in case
      // the model ever ignores the caption1/caption2 instruction.
      prompt: c.prompt || '', caption: c.caption1 || c.caption || '', caption2: c.caption2 || '',
      narrationText: c.narration || c.caption1 || c.caption || '',
      duration: Number(c.duration) || perCutDuration, imageUrl: '', uploaded: false
    }));
    const uploadedCuts = backUploads.map(u => ({
      prompt: '', caption: '', caption2: '', narrationText: '', duration: perCutDuration, imageUrl: u.url, uploaded: true, imageKey: u.imageKey || null
    }));

    currentShortsProject.articleId = articleId;
    currentShortsProject.styleGuide = styleGuide;
    currentShortsProject.hookText = script.hookText || '';
    currentShortsProject.veoPrompt = hasFrontUpload ? '' : (script.veoPrompt || '');
    currentShortsProject.imageCuts = [...uploadedCuts, ...aiCuts];
    currentShortsProject.scriptMd = script.scriptMd || '';
    currentShortsProject.topBarTitle = script.topBarTitleLine1 || '';
    currentShortsProject.topBarTitleLine2 = script.topBarTitleLine2 || '';
    currentShortsProject.status = 'script_draft';

    renderShortsScriptReview();
    renderShortsManualPanel();
    await persistCurrentShortsProject();
    // Scroll whichever mode panel is actually visible -- this function is
    // shared by both the 자동 and 수동 "대본 생성하기" buttons.
    const manualModeActive = document.getElementById("shorts-mode-manual").style.display !== "none";
    document.getElementById(manualModeActive ? "shorts-manual-review" : "shorts-script-review").scrollIntoView({ behavior: "smooth" });

    if (btn) btn.textContent = "shorts_check.md 기준 자체 점검 중...";
    const selfCheckResults = await runShortsSelfCheck(currentShortsProject);
    renderShortsSelfCheckResults(selfCheckResults);
  } catch (err) {
    console.error("숏폼 대본 생성 실패:", err);
    alert("대본 생성 실패: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "2. 대본(스크립트) 자동 생성"; }
    endShortsBusyOperation();
  }
}

// ---- Self-check: every generated shorts script is graded against
// admin/shorts_check.md (mirrors the article self-check pattern against
// admin/check.md) -- runs right after script generation so a weak hook or
// a rule violation (foreign-looking people, English text) gets flagged
// before the admin moves on to media generation.
async function loadShortsChecklistItems() {
  try {
    const response = await fetch('shorts_check.md');
    if (!response.ok) throw new Error("shorts_check.md fetch failed with status " + response.status);
    const text = await response.text();

    const items = [];
    let currentSection = "";
    text.split('\n').forEach(line => {
      const sectionMatch = line.match(/^##\s+(.*)/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        return;
      }
      const itemMatch = line.match(/^-\s*\[ \]\s*(.*)/);
      if (itemMatch) {
        items.push({ section: currentSection, text: itemMatch[1].trim() });
      }
    });
    return items;
  } catch (err) {
    console.error("숏폼 체크리스트(shorts_check.md)를 불러오지 못했습니다:", err);
    return [];
  }
}

async function runShortsSelfCheck(project) {
  const items = await loadShortsChecklistItems();
  if (items.length === 0) return null;

  const checklistText = items.map((it, i) => `${i + 1}. [${it.section}] ${it.text}`).join('\n');
  const cutsText = (project.imageCuts || []).map((c, i) =>
    `컷 ${i + 1} - 이미지 프롬프트: ${c.prompt || '(없음)'} / 대본: ${c.narrationText || ''} / 자막1: ${c.caption || ''} / 자막2: ${c.caption2 || ''}`
  ).join('\n');

  const prompt = `
당신은 바이칼 뉴스의 깐깐한 숏폼 데스크 편집자입니다. 아래 체크리스트 각 항목에 대해 주어진 숏폼 대본이 통과하는지 냉정하게 평가하십시오. 애매하면 통과(true)가 아니라 실패(false)로 판단하십시오.

[체크리스트]
${checklistText}

[숏폼 대본]
후킹 문구(hookText): ${project.hookText || '(없음)'}
상단 배너 제목: ${project.topBarTitle || ''} ${project.topBarTitleLine2 || ''}
Veo 프롬프트(전반 0:00~0:08): ${project.veoPrompt || '(업로드 자료 사용)'}
후반부 컷:
${cutsText || '(없음)'}
전체 대본 문서(scriptMd):
${project.scriptMd || '(없음)'}

반드시 다음 구조의 JSON 배열로만 답변하십시오. 백틱이나 'json' 마킹 없이, 배열의 순서와 개수를 체크리스트와 정확히 동일하게 맞춰야 합니다.
[
  { "pass": true, "note": "판단 근거를 1문장으로" }
]
`;

  try {
    const resultText = await callClaudeApi(prompt, "당신은 엄격한 숏폼 데스크 편집자입니다. 반드시 유효한 JSON 배열로만 답하십시오.");
    const results = parseAiJsonResponse(resultText);
    return items.map((it, i) => ({
      section: it.section,
      text: it.text,
      pass: results[i] ? !!results[i].pass : false,
      note: results[i] ? (results[i].note || '') : ''
    }));
  } catch (err) {
    console.error("숏폼 대본 AI 자체 점검 실패:", err);
    return null;
  }
}

function renderShortsSelfCheckResults(results) {
  const wrapper = document.getElementById("shorts-selfcheck-section");
  const container = document.getElementById("shorts-selfcheck-body");
  if (!wrapper || !container) return;

  if (!results || results.length === 0) {
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "block";
  const passCount = results.filter(r => r.pass).length;

  const bySection = {};
  results.forEach(r => {
    if (!bySection[r.section]) bySection[r.section] = [];
    bySection[r.section].push(r);
  });

  let html = `<div style="font-weight:600; margin-bottom:12px;">${passCount} / ${results.length}개 항목 통과 (shorts_check.md 기준, 참고용 자체 점검)</div>`;
  Object.keys(bySection).forEach(section => {
    html += `<div style="margin-bottom:14px;"><div style="font-weight:600; font-size:0.85rem; margin-bottom:6px; color:var(--sf-text-muted, var(--admin-text-secondary));">${section}</div>`;
    bySection[section].forEach(r => {
      html += `
        <div class="checklist-item ${r.pass ? 'pass' : 'fail'}">
          <span class="checklist-icon">${r.pass ? '✓' : '✗'}</span>
          <span>${r.text}${r.note ? ` <span class="help-text">— ${r.note}</span>` : ''}</span>
        </div>
      `;
    });
    html += `</div>`;
  });
  container.innerHTML = html;
}

function renderShortsScriptReview() {
  document.getElementById("shorts-hook-text").value = currentShortsProject.hookText || '';
  document.getElementById("shorts-veo-prompt").value = currentShortsProject.veoPrompt || '';
  document.getElementById("shorts-script-md").value = currentShortsProject.scriptMd || '';
  const hookAudioEl = document.getElementById("shorts-hook-narration-preview");
  if (hookAudioEl) {
    if (currentShortsProject.hookNarrationUrl) {
      hookAudioEl.src = currentShortsProject.hookNarrationUrl;
      hookAudioEl.style.display = "block";
    } else {
      hookAudioEl.style.display = "none";
    }
  }
  renderImageCutsEditor(currentShortsProject.imageCuts || []);
  document.getElementById("shorts-script-review").style.display = "block";
}

// ==========================================
// 숏폼 수동 생성 -- cost-saving alternative to Step 3's AI media generation.
// Reuses the exact same currentShortsProject/generateShortsScript() as the
// auto mode (so the selected article/script stay identical across modes,
// per explicit request), but instead of calling Veo/Gemini image generation,
// this surfaces the raw prompts (normally hidden) with a copy button so the
// admin can generate the video/images manually in Gemini and upload the
// result -- same IndexedDB storage path (keepShortsBlobLocal/
// keepShortsImageLocal) as every other shorts media source, so the shared
// Step 4 (나레이션) and Step 5 (조립/녹화/mp4/다운로드) below work
// identically regardless of which mode produced the media.
// ==========================================

function switchShortsModeTab(mode, btnEl) {
  document.querySelectorAll(".shorts-mode-tab-btn").forEach(btn => {
    btn.classList.remove("btn-admin-primary");
    btn.classList.add("btn-admin-secondary");
  });
  if (btnEl) {
    btnEl.classList.remove("btn-admin-secondary");
    btnEl.classList.add("btn-admin-primary");
  }
  document.querySelectorAll(".shorts-mode-panel").forEach(el => { el.style.display = "none"; });
  const target = document.getElementById("shorts-mode-" + mode);
  if (target) target.style.display = "block";

  // Refresh whichever panel just became visible from currentShortsProject --
  // an edit made in one mode (e.g. tweaking a caption in 수동) needs to show
  // up if the admin switches back to 자동, and vice versa.
  if (!currentShortsProject) return;
  if (mode === 'manual') renderShortsManualPanel();
  else if (currentShortsProject.hookText || (currentShortsProject.imageCuts || []).length > 0) renderShortsScriptReview();
}

function renderShortsManualPanel() {
  const reviewEl = document.getElementById("shorts-manual-review");
  if (!reviewEl) return;
  if (!currentShortsProject || (!currentShortsProject.hookText && (currentShortsProject.imageCuts || []).length === 0)) {
    reviewEl.style.display = "none";
    return;
  }
  reviewEl.style.display = "block";

  const hookEl = document.getElementById("shorts-manual-hook-text");
  if (hookEl) hookEl.value = currentShortsProject.hookText || '';
  const veoEl = document.getElementById("shorts-manual-veo-prompt");
  if (veoEl) veoEl.value = currentShortsProject.veoPrompt || '';

  renderShortsManualFrontPreview();
  renderShortsManualCutsEditor();
}

function syncShortsHookEditManual() {
  if (!currentShortsProject) return;
  currentShortsProject.hookText = document.getElementById("shorts-manual-hook-text").value.trim();
  saveShortsDraftLocally();
}

function syncShortsManualVeoPromptEdit() {
  if (!currentShortsProject) return;
  currentShortsProject.veoPrompt = document.getElementById("shorts-manual-veo-prompt").value.trim();
  saveShortsDraftLocally();
}

async function copyShortsManualText(elId) {
  const el = document.getElementById(elId);
  if (!el || !el.value.trim()) {
    alert("복사할 내용이 없습니다. 먼저 대본을 생성해 주세요.");
    return;
  }
  try {
    await navigator.clipboard.writeText(el.value);
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 직접 선택해서 복사해 주세요.");
  }
}

async function copyShortsManualCutPrompt(i) {
  const cut = currentShortsProject && currentShortsProject.imageCuts[i];
  if (!cut || !cut.prompt) {
    alert("복사할 프롬프트가 없습니다.");
    return;
  }
  try {
    await navigator.clipboard.writeText(cut.prompt);
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 직접 선택해서 복사해 주세요.");
  }
}

function renderShortsManualFrontPreview() {
  const el = document.getElementById("shorts-manual-front-preview");
  if (!el || !currentShortsProject) return;
  if (!currentShortsProject.veoVideoUrl) {
    el.innerHTML = '<span class="help-text">아직 업로드된 파일이 없습니다.</span>';
    return;
  }
  el.innerHTML = currentShortsProject.frontIsImage
    ? `<img src="${currentShortsProject.veoVideoUrl}" style="width:110px; border-radius:6px; display:block;">`
    : `<video src="${currentShortsProject.veoVideoUrl}" style="width:110px; border-radius:6px; display:block;" muted controls></video>`;
}

// Mirrors generateShortsFrontOnly()'s upload branch (currentShortsProject.frontUpload)
// but stores the file directly instead of going through the pre-generation
// "assign an upload to a slot" flow -- this happens AFTER a script/prompt
// already exists, matching the 프롬프트 복사 -> Gemini 제작 -> 업로드 order.
async function uploadManualFrontMedia(event) {
  const file = event.target.files[0];
  if (!file || !currentShortsProject) return;
  beginShortsBusyOperation();
  try {
    const isVideo = file.type.startsWith('video');
    const key = `${ensureShortsLocalDraftId()}:front`;
    currentShortsProject.veoVideoUrl = isVideo
      ? await keepShortsBlobLocal(file, key)
      : await keepShortsImageLocal(file, key);
    currentShortsProject.frontIsImage = !isVideo;
    renderShortsManualFrontPreview();
    checkShortsMediaReady();
    await persistCurrentShortsProject();
  } catch (err) {
    console.error("전반 미디어 업로드 실패:", err);
    alert("⚠ 업로드에 실패했습니다: " + err.message);
  } finally {
    endShortsBusyOperation();
    event.target.value = "";
  }
}

async function uploadManualCutImage(i, event) {
  const file = event.target.files[0];
  if (!file || !currentShortsProject) return;
  const cut = currentShortsProject.imageCuts[i];
  if (!cut) return;
  beginShortsBusyOperation();
  try {
    if (!cut.imageKey) cut.imageKey = `${ensureShortsLocalDraftId()}:cut:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cut.imageUrl = await keepShortsImageLocal(file, cut.imageKey);
    cut.uploaded = true;
    renderShortsManualCutsEditor();
    checkShortsMediaReady();
    await persistCurrentShortsProject();
  } catch (err) {
    console.error("컷 이미지 업로드 실패:", err);
    alert("⚠ 이미지 업로드에 실패했습니다: " + err.message);
  } finally {
    endShortsBusyOperation();
    event.target.value = "";
  }
}

function renderShortsManualCutsEditor() {
  const container = document.getElementById("shorts-manual-cuts-editor");
  if (!container || !currentShortsProject) return;
  const cuts = currentShortsProject.imageCuts || [];
  container.innerHTML = cuts.map((cut, i) => `
    <div class="shorts-cut-row shorts-manual-cut-row" data-cut-index="${i}">
      <div class="shorts-cut-row-header">
        <span class="shorts-card-kicker">컷 ${i + 1} · 0:08~0:30</span>
      </div>

      <label class="shorts-field-label">이미지 생성 프롬프트 (Gemini에 붙여넣기용)</label>
      <div style="display:flex; gap:8px; align-items:flex-start;">
        <textarea class="form-control-admin shorts-manual-cut-prompt" readonly style="flex:1; min-height:60px; max-height:100px; resize:none; font-size:0.82rem;">${(cut.prompt || '').replace(/</g, '&lt;')}</textarea>
        <button type="button" class="btn-admin btn-admin-purple" onclick="copyShortsManualCutPrompt(${i})">복사</button>
      </div>

      <label class="shorts-field-label">대본 (나레이션으로 읽힙니다)</label>
      <textarea class="form-control-admin shorts-manual-cut-narration-text" style="min-height:44px; max-height:88px; resize:none;" oninput="syncShortsManualCutEdits()">${(cut.narrationText || '').replace(/</g, '&lt;')}</textarea>

      <label class="shorts-field-label">자막 1 / 자막 2</label>
      <div style="display:flex; gap:8px;">
        <textarea class="form-control-admin shorts-manual-cut-caption" style="min-height:44px; max-height:88px; resize:none;" placeholder="자막 1" oninput="syncShortsManualCutEdits()">${(cut.caption || '').replace(/</g, '&lt;')}</textarea>
        <textarea class="form-control-admin shorts-manual-cut-caption2" style="min-height:44px; max-height:88px; resize:none;" placeholder="자막 2 (선택)" oninput="syncShortsManualCutEdits()">${(cut.caption2 || '').replace(/</g, '&lt;')}</textarea>
      </div>

      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:8px;">
        <label style="font-size:0.75rem; white-space:nowrap;">길이(초)
          <input type="number" class="form-control-admin shorts-manual-cut-duration" style="width:80px; display:inline-block; margin-left:6px;" min="1" max="30" step="0.1" value="${cut.duration || 5}" oninput="syncShortsManualCutEdits()">
        </label>
        <label style="font-size:0.78rem;">Gemini에서 만든 이미지 업로드
          <input type="file" accept="image/*" onchange="uploadManualCutImage(${i}, event)">
        </label>
        ${cut.imageUrl ? `<img src="${cut.imageUrl}" style="width:44px; height:78px; object-fit:cover; border-radius:4px;">` : `<span class="help-text">이미지 없음</span>`}
      </div>
    </div>
  `).join('') + (cuts.length === 0 ? '<span class="help-text">대본을 먼저 생성해 주세요.</span>' : '');
}

function syncShortsManualCutEdits() {
  if (!currentShortsProject) return;
  const rows = document.querySelectorAll("#shorts-manual-cuts-editor .shorts-manual-cut-row");
  rows.forEach((row) => {
    const i = Number(row.dataset.cutIndex);
    const cut = currentShortsProject.imageCuts[i];
    if (!cut) return;
    cut.narrationText = row.querySelector(".shorts-manual-cut-narration-text").value.trim();
    cut.caption = row.querySelector(".shorts-manual-cut-caption").value.trim();
    cut.caption2 = row.querySelector(".shorts-manual-cut-caption2").value.trim();
    cut.duration = Number(row.querySelector(".shorts-manual-cut-duration").value) || cut.duration || 5;
  });
  saveShortsDraftLocally();
}

async function saveShortsManualEdits() {
  if (!currentShortsProject) return;
  syncShortsManualCutEdits();
  const hookEl = document.getElementById("shorts-manual-hook-text");
  const veoEl = document.getElementById("shorts-manual-veo-prompt");
  if (hookEl) currentShortsProject.hookText = hookEl.value.trim();
  if (veoEl) currentShortsProject.veoPrompt = veoEl.value.trim();
  shortsAssets = null;
  await persistCurrentShortsProject();
  const statusEl = document.getElementById("shorts-manual-save-status");
  if (statusEl) {
    statusEl.textContent = "저장되었습니다.";
    setTimeout(() => { statusEl.textContent = ""; }, 2500);
  }
}

// Shows caption + narration side by side per cut, with an individual
// regenerate button -- the raw (English-labeled, now actually Korean but
// still implementation detail) image prompt stays out of view in a hidden
// field so it's still there for image (re)generation without cluttering
// the review screen.
// Each cut shows two stacked boxes -- 대본 (the text that gets read aloud
// as narration) and 자막 (the short on-screen caption) -- both start out
// identical but are independently editable. The raw image prompt stays in
// a hidden field (still needed for image generation, just not shown).
function renderImageCutsEditor(cuts) {
  const container = document.getElementById("shorts-image-cuts-editor");
  const boxStyle = "margin-bottom:10px; min-height:44px; max-height:44px; resize:none; font-size:0.9rem; line-height:1.4; padding:10px 14px;";
  const rows = cuts.map((cut, i) => `
    <div class="shorts-cut-row">
      <div class="shorts-cut-row-header">
        <span class="shorts-card-kicker">컷 ${i + 1} · 0:08~0:30</span>
        <div class="shorts-cut-row-actions">
          <button type="button" class="shorts-ghost-btn" onclick="editCutNarration(${i})">편집</button>
          <button type="button" class="shorts-ghost-btn shorts-ghost-btn-danger" onclick="removeShortsCut(${i})">삭제</button>
        </div>
      </div>
      <textarea class="shorts-cut-prompt" style="display:none;">${(cut.prompt || '').replace(/</g, '&lt;')}</textarea>

      <label class="shorts-field-label">대본 (나레이션으로 읽힙니다 · 자막보다 길게)</label>
      <textarea class="form-control-admin shorts-cut-narration-text" style="${boxStyle}" placeholder="이 컷에서 읽어줄 자연스러운 문장" oninput="syncShortsCutEdits()">${(cut.narrationText || '').replace(/</g, '&lt;')}</textarea>

      <label class="shorts-field-label">자막 1 (컷 전반부에 표시 · 짧고 임팩트 있게 · Enter로 줄바꿈 가능)</label>
      <textarea class="form-control-admin shorts-cut-caption" style="margin-bottom:10px; min-height:44px; max-height:88px; resize:none; font-size:0.9rem; line-height:1.4; padding:10px 14px;" placeholder="자막 1" oninput="syncShortsCutEdits()">${(cut.caption || '').replace(/</g, '&lt;')}</textarea>

      <label class="shorts-field-label">자막 2 (컷 후반부에 표시 · 비워두면 자막 1만 계속 표시)</label>
      <textarea class="form-control-admin shorts-cut-caption2" style="margin-bottom:10px; min-height:44px; max-height:88px; resize:none; font-size:0.9rem; line-height:1.4; padding:10px 14px;" placeholder="자막 2 (선택)" oninput="syncShortsCutEdits()">${(cut.caption2 || '').replace(/</g, '&lt;')}</textarea>

      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:4px;">
        <label style="font-size:0.75rem; color:var(--sf-text-muted, var(--admin-text-secondary)); white-space:nowrap;">길이(초)
          <input type="number" class="form-control-admin shorts-cut-duration" style="width:80px; display:inline-block; margin-left:6px;" min="1" max="30" step="0.1" value="${cut.duration || 5}" oninput="syncShortsCutEdits()">
        </label>
        ${cut.narrationUrl
          ? `<audio controls src="${cut.narrationUrl}" style="height:32px; max-width:220px;"></audio>`
          : `<span class="help-text">나레이션 없음</span>`}
      </div>
    </div>
  `).join('');
  container.innerHTML = rows + `<button type="button" class="btn-admin btn-admin-secondary" onclick="addShortsCut()">+ 컷 추가</button>`;
}

function readImageCutsFromDom() {
  const rows = document.querySelectorAll("#shorts-image-cuts-editor .shorts-cut-row");
  return Array.from(rows).map((row, i) => {
    const existing = currentShortsProject.imageCuts[i];
    return {
      prompt: row.querySelector(".shorts-cut-prompt").value.trim(),
      narrationText: row.querySelector(".shorts-cut-narration-text").value.trim(),
      caption: row.querySelector(".shorts-cut-caption").value.trim(),
      caption2: row.querySelector(".shorts-cut-caption2").value.trim(),
      duration: Number(row.querySelector(".shorts-cut-duration").value) || 5,
      imageUrl: (existing && existing.imageUrl) || '',
      uploaded: !!(existing && existing.uploaded),
      imageKey: (existing && existing.imageKey) || null,
      narrationUrl: (existing && existing.narrationUrl) || '',
      narrationBase64: (existing && existing.narrationBase64) || '',
      narrationKey: (existing && existing.narrationKey) || null
    };
  });
}

// Explicit "대본 저장" button -- on top of the oninput auto-save to
// localStorage, this gives the admin a deliberate action that ALSO pushes
// to Supabase (a real network round-trip, so it belongs on a manual click
// rather than every keystroke) with visible confirmation once both are done.
async function saveShortsScriptManually() {
  if (!currentShortsProject) return;
  currentShortsProject.hookText = document.getElementById("shorts-hook-text").value.trim();
  currentShortsProject.imageCuts = readImageCutsFromDom();
  shortsAssets = null;
  saveShortsDraftLocally();

  const statusEl = document.getElementById("shorts-script-save-status");
  if (statusEl) statusEl.textContent = "저장 중...";
  await syncShortsScriptToSupabase();

  if (statusEl) {
    statusEl.textContent = "저장되었습니다 (" + new Date().toLocaleTimeString("ko-KR") + ")";
    clearTimeout(saveShortsScriptManually._clearTimer);
    saveShortsScriptManually._clearTimer = setTimeout(() => { statusEl.textContent = ""; }, 4000);
  }
}

// Same immediate-save reasoning as syncShortsCutEdits(), for the hook text
// field.
function syncShortsHookEdit() {
  if (!currentShortsProject) return;
  currentShortsProject.hookText = document.getElementById("shorts-hook-text").value.trim();
  shortsAssets = null;
  saveShortsDraftLocally();
}

// Fires on every keystroke in a cut's 대본/자막/길이 fields -- without this,
// typed edits only ever made it into currentShortsProject (and therefore
// localStorage) when some other action happened to call
// readImageCutsFromDom() first (approving the script, adding/removing a
// cut, editing narration). A reload in between silently lost whatever was
// only sitting in the DOM. Cheap and immediate: no debounce, since losing
// the latest keystroke on a crash/close is exactly what must not happen.
function syncShortsCutEdits() {
  if (!currentShortsProject) return;
  currentShortsProject.imageCuts = readImageCutsFromDom();
  shortsAssets = null;
  saveShortsDraftLocally();
}

function addShortsCut() {
  currentShortsProject.imageCuts = readImageCutsFromDom();
  currentShortsProject.imageCuts.push({ prompt: '', narrationText: '', caption: '', caption2: '', duration: 5, imageUrl: '' });
  renderImageCutsEditor(currentShortsProject.imageCuts);
}

function removeShortsCut(i) {
  currentShortsProject.imageCuts = readImageCutsFromDom();
  currentShortsProject.imageCuts.splice(i, 1);
  renderImageCutsEditor(currentShortsProject.imageCuts);
}

// "편집" -- regenerates this cut's narration audio from whatever's
// currently in its 대본 box (after any edits), rather than requiring a
// separate manual "generate narration" step.
async function editCutNarration(i) {
  await regenerateCutNarration(i);
}

async function approveShortsScript() {
  currentShortsProject.hookText = document.getElementById("shorts-hook-text").value.trim();
  currentShortsProject.veoPrompt = document.getElementById("shorts-veo-prompt").value.trim();
  currentShortsProject.imageCuts = readImageCutsFromDom();
  currentShortsProject.scriptMd = document.getElementById("shorts-script-md").value;

  if (!currentShortsProject.veoPrompt || currentShortsProject.imageCuts.length === 0) {
    alert("Veo 영상 프롬프트와 이미지 컷이 최소 1개 이상 필요합니다.");
    return;
  }

  currentShortsProject.status = 'script_approved';

  // Narration is just the 대본 read aloud -- generate it automatically here
  // instead of requiring a separate manual step.
  await generateShortsNarration();

  await persistCurrentShortsProject();

  const mediaSection = document.getElementById("shorts-media-section");
  mediaSection.style.display = "block";
  mediaSection.scrollIntoView({ behavior: "smooth" });
}

// Resolves a Gemini model with general multimodal (text+video/image understanding)
// capability -- used for analyzing an uploaded reference shorts video's style.
async function resolveGeminiVisionModel(apiKey) {
  const cacheKey = "baikal_gemini_vision_model";
  const cacheTimeKey = "baikal_gemini_vision_model_cached_at";
  const cached = localStorage.getItem(cacheKey);
  const cachedAt = parseInt(localStorage.getItem(cacheTimeKey) || "0", 10);
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (cached && (Date.now() - cachedAt) < oneDayMs) {
    return cached;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error("ListModels failed with status " + res.status);
    const data = await res.json();
    const models = (data.models || []).filter(m =>
      (m.supportedGenerationMethods || []).includes("generateContent") &&
      !/embedding|tts|imagen|image-generation/i.test(m.name)
    );
    if (models.length === 0) throw new Error("No usable multimodal models available");

    const pick = (predicate) => models.find(predicate);
    const chosen = pick(m => /flash-latest$/i.test(m.name)) || pick(m => /flash/i.test(m.name)) || models[0];
    const modelName = chosen.name.replace(/^models\//, '');
    localStorage.setItem(cacheKey, modelName);
    localStorage.setItem(cacheTimeKey, String(Date.now()));
    return modelName;
  } catch (err) {
    console.error("Gemini vision model auto-discovery failed, falling back:", err);
    return cached || "gemini-flash-latest";
  }
}

// Plain-text Gemini call (not Claude) -- used specifically for writing the
// AI image-generation prompt, since that step is conceptually part of the
// image pipeline. Runs through the server-side proxy
// (api/gemini-text-proxy.js), which picks the model and holds the API key,
// so nothing here needs the browser-side key anymore.
async function callGeminiTextApi(prompt, systemInstruction = "") {
  const response = await fetch("https://baikalnews.com/api/gemini-text-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, systemInstruction })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 호출 실패 (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.text) {
    throw new Error("Gemini API가 올바른 응답 양식을 반환하지 않았습니다.");
  }
  return data.text;
}

// 비용 절감 테스트 모드 -- 켜져 있으면(기본값 ON) Veo의 lite/fast 계열
// 모델만 골라 쓴다 (풀 모델 대비 훨씬 저렴). 실제 동작 확인만 필요한
// 테스트 단계에서 켜두고, 실제 발행용 고품질 영상이 필요해지면 관리자가
// 직접 꺼서 풀 모델(veo-3)로 되돌릴 수 있다.
function getShortsVeoCostSavingMode() {
  return localStorage.getItem("baikal_shorts_veo_cost_saving") !== "false";
}

function setShortsVeoCostSavingMode(enabled) {
  localStorage.setItem("baikal_shorts_veo_cost_saving", enabled ? "true" : "false");
}

// Kicks off a Veo video generation job (long-running operation) and polls
// until it completes, returning the finished clip as a Blob. All three steps
// (start / poll / download) go through server-side proxies so the Gemini key
// never reaches the browser -- see api/veo-start-proxy.js. The 절감 모드
// toggle is still a local UI preference; it's just passed along as a param
// so the proxy can pick the lite/fast model.
async function generateVeoVideo(promptText, onStatus) {
  if (onStatus) onStatus("Veo 영상 생성 요청 중...");

  const startRes = await fetch("https://baikalnews.com/api/veo-start-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: promptText + MEDIA_KOREAN_PEOPLE_RULE, costSaving: getShortsVeoCostSavingMode() })
  });
  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Veo 영상 생성 요청 실패 (HTTP ${startRes.status}): ${errText}`);
  }
  const { operationName } = await startRes.json();
  if (!operationName) throw new Error("Veo 작업 ID를 받지 못했습니다.");

  if (onStatus) onStatus("Veo 영상 렌더링 중... (최대 몇 분 소요될 수 있습니다)");

  let attempts = 0;
  let result = { done: false };
  while (!result.done && attempts < 60) {
    await new Promise(r => setTimeout(r, 10000));
    const pollRes = await fetch("https://baikalnews.com/api/veo-poll-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationName })
    });
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`Veo 진행상황 확인 실패 (HTTP ${pollRes.status}): ${errText}`);
    }
    result = await pollRes.json();
    attempts++;
    if (onStatus) onStatus(`Veo 영상 렌더링 중... (${attempts * 10}초 경과)`);
  }

  if (!result.done) {
    throw new Error("Veo 영상 생성이 시간 내에 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (result.error) {
    throw new Error(`Veo 영상 생성 실패: ${result.error}`);
  }
  if (!result.videoUri) {
    throw new Error("Veo 응답에서 영상 URI를 찾지 못했습니다.");
  }

  if (onStatus) onStatus("완성된 Veo 영상 다운로드 중...");
  const downloadRes = await fetch("https://baikalnews.com/api/veo-download-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUri: result.videoUri })
  });
  if (!downloadRes.ok) {
    const errText = await downloadRes.text();
    throw new Error(`Veo 영상 파일 다운로드 실패 (HTTP ${downloadRes.status}): ${errText}`);
  }
  return await downloadRes.blob();
}

// Wraps Gemini TTS's raw headerless PCM16 response in a minimal WAV header
// so it can be played/decoded by <audio> and Web Audio's decodeAudioData.
function pcm16ToWavBlob(base64Pcm, sampleRate) {
  const binary = atob(base64Pcm);
  const pcmBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pcmBytes[i] = binary.charCodeAt(i);

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcmBytes);

  return new Blob([buffer], { type: 'audio/wav' });
}

// Calls Gemini's native TTS through the server-side proxy (no browser-side
// Gemini key needed -- see api/gemini-tts-proxy.js) and returns a playable
// WAV Blob.
async function generateGeminiSpeech(text, voiceName) {
  const res = await fetch("https://baikalnews.com/api/gemini-tts-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceName })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`나레이션 생성 실패 (HTTP ${res.status}): ${errText}`);
  }
  const data = await res.json();
  if (!data.audioData) {
    throw new Error("AI가 음성 데이터를 반환하지 않았습니다.");
  }
  const rateMatch = (data.mimeType || '').match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
  return pcm16ToWavBlob(data.audioData, sampleRate);
}

// Generates a single narration track (Gemini TTS) covering the hook text
// plus every image-cut caption, read in order -- this plays for the whole
// 30s timeline, not just the Veo segment, unlike the Veo clip's own audio.
// Kept local-only (object URL), matching the shorts storage-minimization design.
// Strips markdown syntax (headers, table pipes/separators, bold/italic,
// links) from scriptMd so TTS reads plain prose instead of literal symbols.
// Reads a Blob's playback duration via a throwaway <audio> element --
// cheaper than decoding the whole thing through Web Audio just to get a
// number.
function getAudioBlobDuration(blob) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => { resolve(el.duration); URL.revokeObjectURL(el.src); };
    el.onerror = () => reject(new Error("오디오 길이를 확인하지 못했습니다."));
    el.src = URL.createObjectURL(blob);
  });
}

// Reads a Blob into a base64 data: URL -- used only to hand narration audio
// to Supabase (which has no Storage bucket set up in this project; every
// other binary asset here -- article images included -- already goes into
// a plain DB column as a data URL, so narration follows the same
// convention rather than introducing a new one).
function blobToBase64DataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("오디오를 base64로 변환하지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

// Generates one narration clip for either the hook (cutObj=null) or a
// specific image cut, storing it in IndexedDB and -- for a cut -- updating
// its duration to match the clip's actual length. This is what keeps audio
// and visuals in sync: each segment's on-screen time comes directly from
// its own narration length instead of a stretched/guessed estimate. Also
// caches a base64 copy (narrationBase64/hookNarrationBase64) so syncing to
// Supabase later doesn't need to re-fetch and re-encode the local blob.
async function generateCutNarration(cutObj, text, voiceName, draftId) {
  if (!text) return;
  const wavBlob = await generateGeminiSpeech(text, voiceName);
  const duration = await getAudioBlobDuration(wavBlob);
  const base64 = await blobToBase64DataUrl(wavBlob);
  if (cutObj) {
    if (!cutObj.narrationKey) {
      cutObj.narrationKey = `${draftId}:narration:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    cutObj.narrationUrl = await keepShortsBlobLocal(wavBlob, cutObj.narrationKey);
    cutObj.narrationBase64 = base64;
    cutObj.duration = Math.max(1, duration + 0.3);
  } else {
    currentShortsProject.hookNarrationKey = `${draftId}:narration:hook`;
    currentShortsProject.hookNarrationUrl = await keepShortsBlobLocal(wavBlob, currentShortsProject.hookNarrationKey);
    currentShortsProject.hookNarrationBase64 = base64;
  }
}

// Generates narration for the hook and every image cut in one pass --
// reads each segment's 대본 (narrationText) directly, not the raw scriptMd
// (which used to leak structural labels like "[상단 고정 타이틀: ...]"
// into the audio) and not the separate, shorter on-screen 자막. Runs
// automatically when the script is approved -- no manual "generate
// narration" step needed.
async function generateShortsNarration() {
  const statusEl = document.getElementById("shorts-narration-status");

  beginShortsBusyOperation();
  try {
    currentShortsProject.imageCuts = readImageCutsFromDom();
    const voiceSelect = document.getElementById("shorts-narration-voice");
    const voiceName = voiceSelect ? voiceSelect.value : "Kore";
    const draftId = ensureShortsLocalDraftId();

    if (currentShortsProject.hookText) {
      if (statusEl) statusEl.textContent = "나레이션 생성 중... (후킹 문구)";
      await generateCutNarration(null, currentShortsProject.hookText, voiceName, draftId);
    }

    const cuts = currentShortsProject.imageCuts || [];
    for (let i = 0; i < cuts.length; i++) {
      if (statusEl) statusEl.textContent = `나레이션 생성 중... (컷 ${i + 1}/${cuts.length})`;
      await generateCutNarration(cuts[i], cuts[i].narrationText || cuts[i].caption, voiceName, draftId);
    }

    renderImageCutsEditor(currentShortsProject.imageCuts);
    saveShortsDraftLocally();
    await syncShortsScriptToSupabase();
    shortsAssets = null; // force rebuild so the next preview/record picks up the new narration
    if (statusEl) statusEl.textContent = "나레이션 생성 완료. 각 컷 재생 시간이 나레이션 길이에 맞춰 자동 조정되었습니다.";
  } catch (err) {
    console.error("나레이션 생성 실패:", err);
    if (statusEl) statusEl.textContent = "나레이션 생성 실패: " + err.message;
    alert("나레이션 생성 실패: " + err.message);
  } finally {
    endShortsBusyOperation();
  }
}

// Regenerates just one cut's narration from its current 대본 text (e.g.
// after editing it), without touching the others.
async function regenerateCutNarration(i) {
  currentShortsProject.imageCuts = readImageCutsFromDom();
  const cut = currentShortsProject.imageCuts[i];
  if (!cut) return;
  const voiceSelect = document.getElementById("shorts-narration-voice");
  const voiceName = voiceSelect ? voiceSelect.value : "Kore";

  beginShortsBusyOperation();
  try {
    await generateCutNarration(cut, cut.narrationText || cut.caption, voiceName, ensureShortsLocalDraftId());
    renderImageCutsEditor(currentShortsProject.imageCuts);
    renderShortsNarrationRecap();
    saveShortsDraftLocally();
    await syncShortsScriptToSupabase();
    shortsAssets = null;
  } catch (err) {
    console.error("컷 나레이션 재생성 실패:", err);
    alert("나레이션 재생성 실패: " + err.message);
  } finally {
    endShortsBusyOperation();
  }
}

// Regenerates just the hook's narration.
async function regenerateHookNarration() {
  currentShortsProject.hookText = document.getElementById("shorts-hook-text").value.trim();
  if (!currentShortsProject.hookText) return;
  const voiceSelect = document.getElementById("shorts-narration-voice");
  const voiceName = voiceSelect ? voiceSelect.value : "Kore";

  beginShortsBusyOperation();
  try {
    await generateCutNarration(null, currentShortsProject.hookText, voiceName, ensureShortsLocalDraftId());
    saveShortsDraftLocally();
    await syncShortsScriptToSupabase();
    shortsAssets = null;
    const hookAudioEl = document.getElementById("shorts-hook-narration-preview");
    if (hookAudioEl) {
      hookAudioEl.src = currentShortsProject.hookNarrationUrl;
      hookAudioEl.style.display = "block";
    }
    renderShortsNarrationRecap();
  } catch (err) {
    console.error("후킹 나레이션 재생성 실패:", err);
    alert("나레이션 재생성 실패: " + err.message);
  } finally {
    endShortsBusyOperation();
  }
}

async function generateShortsMedia() {
  const statusEl = document.getElementById("shorts-media-status");
  const btn = document.getElementById("shorts-generate-media-btn");
  if (btn) btn.disabled = true;

  beginShortsBusyOperation();
  try {
    if (currentShortsProject.frontUpload) {
      statusEl.textContent = "업로드된 자료를 전반(0:00~0:08)에 적용 중...";
      currentShortsProject.veoVideoUrl = currentShortsProject.frontUpload.url;
      currentShortsProject.frontIsImage = currentShortsProject.frontUpload.type === 'image';
    } else {
      statusEl.textContent = "Veo 영상 생성 중... (몇 분 소요될 수 있습니다)";
      const veoBlob = await generateVeoVideo(currentShortsProject.veoPrompt, (msg) => { statusEl.textContent = msg; });
      currentShortsProject.veoVideoUrl = await keepShortsBlobLocal(veoBlob, `${ensureShortsLocalDraftId()}:front`);
      currentShortsProject.frontIsImage = false;
    }
    await persistCurrentShortsProject();

    for (let i = 0; i < currentShortsProject.imageCuts.length; i++) {
      const cut = currentShortsProject.imageCuts[i];
      if (cut.uploaded && cut.imageUrl) continue; // already a real uploaded image -- nothing to generate

      statusEl.textContent = `이미지 컷 생성 중... (${i + 1}/${currentShortsProject.imageCuts.length})`;
      const verticalPrompt = `${cut.prompt}, vertical 9:16 portrait composition, documentary photography style, natural lighting`;
      const dataUrl = await generateGeminiImage(verticalPrompt);
      const blob = await (await fetch(dataUrl)).blob();
      if (!cut.imageKey) cut.imageKey = `${ensureShortsLocalDraftId()}:cut:${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cut.imageUrl = await keepShortsImageLocal(blob, cut.imageKey);
      renderShortsMediaPreview();
    }

    currentShortsProject.status = 'media_ready';
    await persistCurrentShortsProject();
    statusEl.textContent = "미디어 생성 완료. 아래에서 조립을 진행하세요.";

    const assemblySection = document.getElementById("shorts-assembly-section");
    assemblySection.style.display = "block";
    populateShortsStyleSettingsUI();
    assemblySection.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("숏폼 미디어 생성 실패:", err);
    statusEl.textContent = "미디어 생성 실패: " + err.message;
    alert("미디어 생성 실패: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    endShortsBusyOperation();
  }
}

// If both halves are now present, advance to media_ready and reveal Step 4
// -- shared by the combined button and both granular ones below, so
// whichever order the admin generates things in, the assembly step still
// unlocks the moment everything it needs actually exists.
function checkShortsMediaReady() {
  if (!currentShortsProject) return false;
  const hasFront = !!currentShortsProject.veoVideoUrl;
  const cuts = currentShortsProject.imageCuts || [];
  const allCutsReady = cuts.length > 0 && cuts.every(c => !!c.imageUrl);
  if (hasFront && allCutsReady) {
    currentShortsProject.status = 'media_ready';
    const assemblySection = document.getElementById("shorts-assembly-section");
    assemblySection.style.display = "block";
    populateShortsStyleSettingsUI();
    return true;
  }
  return false;
}

// Generates ONLY the 전반(0:00~0:08) slot -- split out from
// generateShortsMedia() so re-running media generation after already
// having a good Veo clip doesn't also burn another Veo credit just to get
// the image cuts. Applies an uploaded reference file directly (no Veo
// cost) exactly like the combined button does; only actually calls Veo if
// nothing was uploaded for this slot.
async function generateShortsFrontOnly() {
  if (!currentShortsProject) return;
  const statusEl = document.getElementById("shorts-media-status");
  const btn = document.getElementById("shorts-generate-front-btn");
  if (btn) btn.disabled = true;
  beginShortsBusyOperation();
  try {
    if (currentShortsProject.frontUpload) {
      statusEl.textContent = "업로드된 자료를 전반(0:00~0:08)에 적용 중...";
      currentShortsProject.veoVideoUrl = currentShortsProject.frontUpload.url;
      currentShortsProject.frontIsImage = currentShortsProject.frontUpload.type === 'image';
    } else {
      if (!currentShortsProject.veoPrompt) {
        alert("Veo 프롬프트가 없습니다. 대본(Step 2)을 다시 확인해 주세요.");
        return;
      }
      statusEl.textContent = "Veo 영상 생성 중... (몇 분 소요될 수 있습니다)";
      const veoBlob = await generateVeoVideo(currentShortsProject.veoPrompt, (msg) => { statusEl.textContent = msg; });
      currentShortsProject.veoVideoUrl = await keepShortsBlobLocal(veoBlob, `${ensureShortsLocalDraftId()}:front`);
      currentShortsProject.frontIsImage = false;
    }
    document.getElementById("shorts-media-section").style.display = "block";
    renderShortsMediaPreview();
    const ready = checkShortsMediaReady();
    await persistCurrentShortsProject();
    statusEl.textContent = ready
      ? "전반 생성 완료. 아래에서 조립을 진행하세요."
      : "전반 생성 완료. 이미지 컷도 생성해 주세요.";
  } catch (err) {
    console.error("전반 생성 실패:", err);
    statusEl.textContent = "전반 생성 실패: " + err.message;
    alert("전반 생성 실패: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    endShortsBusyOperation();
  }
}

// Generates ONLY the 후반 image cuts -- split out for the same reason as
// generateShortsFrontOnly(), and additionally skips any cut that already
// has an image (the combined button always redoes every non-uploaded cut;
// this one is specifically for "just fill in what's missing" without
// re-spending on cuts that already came out fine).
async function generateShortsCutImagesOnly() {
  if (!currentShortsProject) return;
  const statusEl = document.getElementById("shorts-media-status");
  const btn = document.getElementById("shorts-generate-cuts-btn");
  if (btn) btn.disabled = true;
  beginShortsBusyOperation();
  try {
    const cuts = currentShortsProject.imageCuts || [];
    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      if (cut.imageUrl) continue; // already has an image (uploaded or previously generated) -- nothing to do

      statusEl.textContent = `이미지 컷 생성 중... (${i + 1}/${cuts.length})`;
      const verticalPrompt = `${cut.prompt}, vertical 9:16 portrait composition, documentary photography style, natural lighting`;
      const dataUrl = await generateGeminiImage(verticalPrompt);
      const blob = await (await fetch(dataUrl)).blob();
      if (!cut.imageKey) cut.imageKey = `${ensureShortsLocalDraftId()}:cut:${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cut.imageUrl = await keepShortsImageLocal(blob, cut.imageKey);
    }
    document.getElementById("shorts-media-section").style.display = "block";
    // Unconditional, not just inside the loop above -- if every cut already
    // had an image (all skipped via `continue`), the loop body never ran
    // and the preview grid was never (re)rendered at all, even though the
    // images conceptually already existed. Looked like "generated but not
    // showing."
    renderShortsMediaPreview();
    const ready = checkShortsMediaReady();
    await persistCurrentShortsProject();
    statusEl.textContent = ready
      ? "이미지 컷 생성 완료. 아래에서 조립을 진행하세요."
      : "이미지 컷 생성 완료. 전반(Veo 영상)도 생성해 주세요.";
  } catch (err) {
    console.error("이미지 컷 생성 실패:", err);
    statusEl.textContent = "이미지 컷 생성 실패: " + err.message;
    alert("이미지 컷 생성 실패: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    endShortsBusyOperation();
  }
}

// Syncs the 영상 스타일 설정 inputs (상단 배경색/제목, 자막 크기) with
// currentShortsProject -- pure draw-time styling, so no need to rebuild
// shortsAssets when these change, just re-preview/re-record.
function populateShortsStyleSettingsUI() {
  const colorInput = document.getElementById("shorts-topbar-color");
  const heightInput = document.getElementById("shorts-topbar-height");
  const titleSizeInput = document.getElementById("shorts-topbar-title-size");
  const titleColorInput = document.getElementById("shorts-topbar-title-color");
  const titleColor2Input = document.getElementById("shorts-topbar-title-color-2");
  const titleInput = document.getElementById("shorts-topbar-title");
  const title2Input = document.getElementById("shorts-topbar-title-2");
  const sizeInput = document.getElementById("shorts-caption-size");
  const captionColorInput = document.getElementById("shorts-caption-color");
  const positionInput = document.getElementById("shorts-caption-position");
  const narrationSpeedInput = document.getElementById("shorts-narration-speed");
  if (colorInput) colorInput.value = currentShortsProject.topBarColor || '#0b1a30';
  if (heightInput) heightInput.value = currentShortsProject.topBarHeight || 360;
  if (titleSizeInput) titleSizeInput.value = currentShortsProject.topBarTitleFontSize || 110;
  if (titleColorInput) titleColorInput.value = currentShortsProject.topBarTitleColor || '#ffff00';
  if (titleColor2Input) titleColor2Input.value = currentShortsProject.topBarTitleColorLine2 || '#ff0000';
  if (titleInput) titleInput.value = currentShortsProject.topBarTitle || '';
  if (title2Input) title2Input.value = currentShortsProject.topBarTitleLine2 || '';
  if (sizeInput) sizeInput.value = currentShortsProject.captionFontSize || 72;
  if (captionColorInput) captionColorInput.value = currentShortsProject.captionColor || '#ffffff';
  if (positionInput) positionInput.value = currentShortsProject.captionPosition || 'bottom';
  if (narrationSpeedInput) narrationSpeedInput.value = currentShortsProject.narrationSpeed || 1.2;
  const extraSecondsStatusEl = document.getElementById("shorts-extra-seconds-status");
  if (extraSecondsStatusEl) {
    const extra = currentShortsProject.extraCutSeconds || 0;
    extraSecondsStatusEl.textContent = extra > 0
      ? `컷당 +${extra}초 (총 +${extra * (currentShortsProject.imageCuts || []).length}초)`
      : '';
  }
  renderShortsNarrationRecap();
}

// Read-only recap of the narration already generated back in step 2 (hook +
// each cut's 대본), so the admin can review/replay it here in step 4 without
// flipping back -- editing still happens in step 2, this is just playback.
// Step 4's 나레이션 card only needs a one-line status, not the full per-cut
// breakdown -- that detail already lives in step 2, where it's editable.
function renderShortsNarrationRecap() {
  const statusEl = document.getElementById("shorts-narration-recap-status");
  if (!statusEl || !currentShortsProject) return;
  const cuts = currentShortsProject.imageCuts || [];
  const readyCount = (currentShortsProject.hookNarrationUrl ? 1 : 0) + cuts.filter(c => c.narrationUrl).length;
  const totalCount = 1 + cuts.length;
  statusEl.textContent = readyCount === 0
    ? "생성된 나레이션이 없습니다."
    : `나레이션 ${readyCount}/${totalCount}개 준비됨`;
  refreshShortsNarrationPlayerUI();
}

// "나레이션 생성" in step 4 -- reuses the same generator step 2's approval
// calls, then refreshes this card's status and step 2's cut cards.
async function generateShortsNarrationFromAssembly() {
  if (!currentShortsProject) return;
  const statusEl = document.getElementById("shorts-narration-recap-status");
  if (statusEl) statusEl.textContent = "나레이션 생성 중...";
  try {
    await generateShortsNarration();
    renderShortsNarrationRecap();
  } catch (err) {
    console.error("나레이션 재생성 실패:", err);
    alert("나레이션 재생성 실패: " + err.message);
  }
}

// "▶ 재생" -- plays the hook narration then every cut's narration back to
// back in one continuous <audio>, so the admin can hear the whole thing
// without opening each cut individually.
// 재생/일시정지 토글 + 정지 버튼 -- hook과 각 컷의 나레이션을 이어서 재생하며,
// 일시정지 후 같은 버튼을 다시 누르면 멈춘 지점부터 이어서 재생된다. 정지는
// 큐 전체를 초기화해 다음 재생이 처음(후킹)부터 다시 시작하게 한다.
let shortsNarrationQueue = [];
let shortsNarrationIdx = 0;
let shortsNarrationDurations = [];
let shortsNarrationTotalDuration = 0;

function buildShortsNarrationQueue() {
  const queue = [];
  if (currentShortsProject.hookNarrationUrl) queue.push(currentShortsProject.hookNarrationUrl);
  (currentShortsProject.imageCuts || []).forEach(cut => {
    if (cut.narrationUrl) queue.push(cut.narrationUrl);
  });
  return queue;
}

function formatShortsTime(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Reads a clip's real length off the audio file itself (loadedmetadata),
// rather than trusting the stored cut.duration -- that field includes a
// +0.3s pad and can drift out of sync with edits, and the whole point here
// is giving the admin a number they can actually judge 재생 속도 against.
function getShortsAudioDuration(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(a.duration || 0);
    a.onerror = () => resolve(0);
    a.src = url;
  });
}

// Shows/hides the player-style play/stop controls (hidden until narration
// actually exists -- no point showing playback controls for nothing to
// play) and computes the total runtime up front so it's visible before the
// admin even presses play, not just discovered by listening through once.
async function refreshShortsNarrationPlayerUI() {
  const queue = currentShortsProject ? buildShortsNarrationQueue() : [];
  const playerWrap = document.getElementById("shorts-narration-player");
  const timeEl = document.getElementById("shorts-narration-time");
  if (queue.length === 0) {
    if (playerWrap) playerWrap.style.display = "none";
    shortsNarrationDurations = [];
    shortsNarrationTotalDuration = 0;
    return;
  }
  shortsNarrationDurations = await Promise.all(queue.map(getShortsAudioDuration));
  shortsNarrationTotalDuration = shortsNarrationDurations.reduce((s, d) => s + d, 0);
  if (playerWrap) playerWrap.style.display = "flex";
  if (timeEl) timeEl.textContent = `0:00 / ${formatShortsTime(shortsNarrationTotalDuration)}`;
}

function toggleShortsNarrationPlayback() {
  if (!currentShortsProject) return;
  const player = document.getElementById("shorts-narration-playback");
  const playBtn = document.getElementById("shorts-narration-play-btn");
  const timeEl = document.getElementById("shorts-narration-time");
  if (!player) return;

  if (!player.paused) {
    player.pause();
    if (playBtn) playBtn.textContent = "▶";
    return;
  }

  if (player.src && !player.ended) {
    player.play();
    if (playBtn) playBtn.textContent = "⏸";
    return;
  }

  shortsNarrationQueue = buildShortsNarrationQueue();
  shortsNarrationIdx = 0;
  if (shortsNarrationQueue.length === 0) {
    alert("재생할 나레이션이 없습니다. 먼저 나레이션을 생성해 주세요.");
    return;
  }
  const updateTimeDisplay = () => {
    if (!timeEl) return;
    const elapsedBefore = shortsNarrationDurations.slice(0, shortsNarrationIdx).reduce((s, d) => s + d, 0);
    const current = elapsedBefore + (player.currentTime || 0);
    timeEl.textContent = `${formatShortsTime(current)} / ${formatShortsTime(shortsNarrationTotalDuration)}`;
  };
  player.ontimeupdate = updateTimeDisplay;
  player.onended = () => {
    shortsNarrationIdx += 1;
    if (shortsNarrationIdx < shortsNarrationQueue.length) {
      player.src = shortsNarrationQueue[shortsNarrationIdx];
      player.play();
    } else if (playBtn) {
      playBtn.textContent = "▶";
      updateTimeDisplay();
    }
  };
  player.src = shortsNarrationQueue[0];
  player.play();
  if (playBtn) playBtn.textContent = "⏸";
}

function stopShortsNarrationPlayback() {
  const player = document.getElementById("shorts-narration-playback");
  const playBtn = document.getElementById("shorts-narration-play-btn");
  const timeEl = document.getElementById("shorts-narration-time");
  if (!player) return;
  player.onended = null;
  player.ontimeupdate = null;
  player.pause();
  player.currentTime = 0;
  player.removeAttribute("src");
  shortsNarrationQueue = [];
  shortsNarrationIdx = 0;
  if (playBtn) playBtn.textContent = "▶";
  if (timeEl) timeEl.textContent = `0:00 / ${formatShortsTime(shortsNarrationTotalDuration)}`;
}

function updateShortsStyleSettings() {
  if (!currentShortsProject) return;
  const colorInput = document.getElementById("shorts-topbar-color");
  const heightInput = document.getElementById("shorts-topbar-height");
  const titleSizeInput = document.getElementById("shorts-topbar-title-size");
  const titleColorInput = document.getElementById("shorts-topbar-title-color");
  const titleColor2Input = document.getElementById("shorts-topbar-title-color-2");
  const titleInput = document.getElementById("shorts-topbar-title");
  const title2Input = document.getElementById("shorts-topbar-title-2");
  const sizeInput = document.getElementById("shorts-caption-size");
  const captionColorInput = document.getElementById("shorts-caption-color");
  const positionInput = document.getElementById("shorts-caption-position");
  const narrationSpeedInput = document.getElementById("shorts-narration-speed");
  currentShortsProject.topBarColor = colorInput ? colorInput.value : '#0b1a30';
  currentShortsProject.topBarHeight = heightInput ? (parseInt(heightInput.value, 10) || 360) : 360;
  currentShortsProject.topBarTitleFontSize = titleSizeInput ? (parseInt(titleSizeInput.value, 10) || 110) : 110;
  currentShortsProject.topBarTitleColor = titleColorInput ? titleColorInput.value : '#ffff00';
  currentShortsProject.topBarTitleColorLine2 = titleColor2Input ? titleColor2Input.value : '#ff0000';
  currentShortsProject.topBarTitle = titleInput ? titleInput.value : '';
  currentShortsProject.topBarTitleLine2 = title2Input ? title2Input.value : '';
  currentShortsProject.captionFontSize = sizeInput ? (parseInt(sizeInput.value, 10) || 72) : 72;
  currentShortsProject.captionColor = captionColorInput ? captionColorInput.value : '#ffffff';
  currentShortsProject.captionPosition = positionInput ? positionInput.value : 'bottom';
  currentShortsProject.narrationSpeed = narrationSpeedInput ? (parseFloat(narrationSpeedInput.value) || 1.2) : 1.2;
  shortsAssets = null; // playbackRate/timing baked into the built assets -- force a rebuild so the new speed actually takes effect
  saveShortsDraftLocally();
}

// Media previews link to their own object URL with `download` so the admin
// can grab a local copy -- none of this is uploaded anywhere (see 보관).
// Each thumb carries its own download/재생성/삭제 controls so a single bad
// shot doesn't force regenerating everything -- delete clears just that
// slot's media (keeping its prompt/자막/나레이션 intact) and 재생성
// re-runs generation for that slot alone from its existing prompt.
function renderShortsMediaPreview() {
  const container = document.getElementById("shorts-media-preview");
  const items = [];
  if (currentShortsProject.veoVideoUrl) {
    items.push(`
      <div class="shorts-media-thumb">
        <video src="${currentShortsProject.veoVideoUrl}" controls muted playsinline preload="auto"></video>
        <div class="shorts-media-thumb-actions">
          <a href="${currentShortsProject.veoVideoUrl}" download="shorts-front.mp4" title="다운로드">⬇</a>
          <button type="button" onclick="toggleShortsVeoPromptEditor()" title="프롬프트 수정">✎</button>
          <button type="button" onclick="regenerateShortsFrontMedia()" title="다시 생성">⟳</button>
          <button type="button" class="shorts-media-thumb-delete" onclick="deleteShortsFrontMedia()" title="삭제">✕</button>
        </div>
      </div>
    `);
  }
  (currentShortsProject.imageCuts || []).forEach((cut, i) => {
    if (cut.imageUrl) {
      items.push(`
        <div class="shorts-media-thumb">
          <img src="${cut.imageUrl}">
          <div class="shorts-media-thumb-actions">
            <a href="${cut.imageUrl}" download="shorts-cut-${i + 1}.jpg" title="다운로드">⬇</a>
            <button type="button" onclick="regenerateShortsCutImage(${i})" title="다시 생성">⟳</button>
            <button type="button" class="shorts-media-thumb-delete" onclick="deleteShortsCutImage(${i})" title="삭제">✕</button>
          </div>
        </div>
      `);
    }
  });
  container.innerHTML = items.join('') || `<span class="help-text">아직 생성된 미디어가 없습니다.</span>`;
}

// The raw Veo prompt is hidden by default (Step 2) to keep the review screen
// uncluttered, but the admin needs to be able to tweak it (e.g. remove
// whatever triggered garbled on-screen text) without regenerating the whole
// script. This just toggles that field open/closed, refreshing it from
// currentShortsProject each time it's shown so it's never stale.
function toggleShortsVeoPromptEditor() {
  if (!currentShortsProject) return;
  const wrapper = document.getElementById("shorts-veo-prompt-editor");
  if (!wrapper) return;
  if (wrapper.style.display !== "none") {
    wrapper.style.display = "none";
    return;
  }
  document.getElementById("shorts-veo-prompt").value = currentShortsProject.veoPrompt || '';
  wrapper.style.display = "block";
  wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
}

function syncShortsVeoPromptEdit() {
  if (!currentShortsProject) return;
  currentShortsProject.veoPrompt = document.getElementById("shorts-veo-prompt").value.trim();
  shortsAssets = null;
  saveShortsDraftLocally();
}

async function regenerateShortsFrontMedia() {
  if (!currentShortsProject) return;
  if (currentShortsProject.frontUpload) {
    alert("전반(0:00~0:08)은 업로드한 자료를 사용 중입니다. 먼저 삭제한 뒤 Step 3에서 새 자료를 업로드하거나 Veo 프롬프트로 다시 생성해 주세요.");
    return;
  }
  if (!currentShortsProject.veoPrompt) {
    alert("Veo 프롬프트가 없습니다. 대본(Step 2)을 다시 확인해 주세요.");
    return;
  }
  const statusEl = document.getElementById("shorts-media-status");
  beginShortsBusyOperation();
  try {
    if (statusEl) statusEl.textContent = "전반 영상 재생성 중... (몇 분 소요될 수 있습니다)";
    const veoBlob = await generateVeoVideo(currentShortsProject.veoPrompt, (msg) => { if (statusEl) statusEl.textContent = msg; });
    currentShortsProject.veoVideoUrl = await keepShortsBlobLocal(veoBlob, `${ensureShortsLocalDraftId()}:front`);
    currentShortsProject.frontIsImage = false;
    shortsAssets = null;
    renderShortsMediaPreview();
    await persistCurrentShortsProject();
    if (statusEl) statusEl.textContent = "전반 영상 재생성 완료.";
  } catch (err) {
    console.error("전반 영상 재생성 실패:", err);
    alert("재생성 실패: " + err.message);
    if (statusEl) statusEl.textContent = "재생성 실패: " + err.message;
  } finally {
    endShortsBusyOperation();
  }
}

async function deleteShortsFrontMedia() {
  if (!currentShortsProject) return;
  if (!confirm("전반(0:00~0:08) 영상/이미지를 삭제하시겠습니까?")) return;
  if (currentShortsProject.localDraftId) {
    try { await idbDeleteByPrefix(`${currentShortsProject.localDraftId}:front`); } catch (err) { console.warn("전반 미디어 정리 실패:", err); }
  }
  currentShortsProject.veoVideoUrl = '';
  currentShortsProject.frontUpload = null;
  shortsAssets = null;
  renderShortsMediaPreview();
  await persistCurrentShortsProject();
}

async function regenerateShortsCutImage(i) {
  if (!currentShortsProject) return;
  // Deliberately NOT readImageCutsFromDom() here -- this button lives in the
  // Step 3 media grid, not the Step 2 cut editor, and that editor's DOM
  // isn't guaranteed to be rendered/in sync at this point (e.g. a reopened
  // project that jumped straight past Step 2). Re-reading from it silently
  // replaced imageCuts with whatever that DOM had (often empty), so `cut`
  // came back undefined and this returned with zero feedback -- looked like
  // the button did nothing. Operate on the in-memory array directly instead.
  const cut = (currentShortsProject.imageCuts || [])[i];
  if (!cut) {
    alert("해당 컷을 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
    return;
  }
  if (!cut.prompt) {
    alert("이 컷은 이미지 생성 프롬프트가 없습니다 (업로드된 자료일 수 있습니다). Step 1에서 새 자료를 다시 배정해 주세요.");
    return;
  }
  const statusEl = document.getElementById("shorts-media-status");
  beginShortsBusyOperation();
  try {
    if (statusEl) statusEl.textContent = `컷 ${i + 1} 이미지 재생성 중...`;
    const verticalPrompt = `${cut.prompt}, vertical 9:16 portrait composition, documentary photography style, natural lighting`;
    const dataUrl = await generateGeminiImage(verticalPrompt);
    const blob = await (await fetch(dataUrl)).blob();
    if (!cut.imageKey) cut.imageKey = `${ensureShortsLocalDraftId()}:cut:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cut.imageUrl = await keepShortsImageLocal(blob, cut.imageKey);
    cut.uploaded = false;
    shortsAssets = null;
    renderShortsMediaPreview();
    await persistCurrentShortsProject();
    if (statusEl) statusEl.textContent = `컷 ${i + 1} 이미지 재생성 완료.`;
  } catch (err) {
    console.error("컷 이미지 재생성 실패:", err);
    alert("재생성 실패: " + err.message);
    if (statusEl) statusEl.textContent = "재생성 실패: " + err.message;
  } finally {
    endShortsBusyOperation();
  }
}

async function deleteShortsCutImage(i) {
  if (!currentShortsProject) return;
  // Same reasoning as regenerateShortsCutImage() -- operate on the
  // in-memory array, not a re-read of Step 2's DOM.
  const cut = (currentShortsProject.imageCuts || [])[i];
  if (!cut) {
    alert("해당 컷을 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
    return;
  }
  if (!confirm(`컷 ${i + 1}의 이미지를 삭제하시겠습니까? (대본/자막은 그대로 유지됩니다)`)) return;
  if (cut.imageKey) {
    try { await idbDeleteByPrefix(cut.imageKey); } catch (err) { console.warn("컷 이미지 정리 실패:", err); }
  }
  cut.imageUrl = '';
  cut.imageKey = null;
  cut.uploaded = false;
  shortsAssets = null;
  renderShortsMediaPreview();
  await persistCurrentShortsProject();
}

// The 전반(0:00~0:08) slot is a <video> for AI/Veo-generated or uploaded video
// clips, but a still <img> (held with Ken Burns motion, like the 후반 cuts)
// when the admin uploaded a photo for that slot instead.
async function buildShortsAssets(project) {
  let front;
  // A single shared AudioContext + MediaStreamDestination mixes the Veo
  // clip's own native audio (front-segment only) with the generated
  // narration (full timeline) into one audio track for the recording --
  // canvas.captureStream() alone only ever carries video.
  let audioCtx = null;
  let mixDestination = null;
  function ensureAudioMix() {
    if (!mixDestination) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtx();
      mixDestination = audioCtx.createMediaStreamDestination();
    }
    return { audioCtx, destination: mixDestination };
  }

  if (project.frontIsImage) {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("전반 이미지를 불러오지 못했습니다."));
      el.src = project.veoVideoUrl;
    });
    front = { type: 'image', el: img, duration: 8 };
  } else {
    const videoEl = document.createElement('video');
    videoEl.src = project.veoVideoUrl;
    videoEl.crossOrigin = "anonymous";
    videoEl.muted = false;
    videoEl.playsInline = true;
    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = resolve;
      videoEl.onerror = () => reject(new Error("전반 영상을 불러오지 못했습니다."));
    });
    front = { type: 'video', el: videoEl, duration: Math.min(videoEl.duration || 8, 8) };

    try {
      const mix = ensureAudioMix();
      await mix.audioCtx.resume().catch(() => {});
      const source = mix.audioCtx.createMediaElementSource(videoEl);
      source.connect(mix.destination);
      source.connect(mix.audioCtx.destination);
    } catch (err) {
      console.warn("영상 오디오 트랙을 연결하지 못했습니다:", err);
    }
  }

  const images = await Promise.all((project.imageCuts || []).map(cut => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ img, duration: cut.duration, caption: cut.caption, caption2: cut.caption2 || '', narrationUrl: cut.narrationUrl });
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다: " + cut.imageUrl));
    img.src = cut.imageUrl;
  })));

  // Per-segment narration (Gemini TTS): one clip for the hook, one per image
  // cut. Each is scheduled (in runShortsTimeline) to start exactly when its
  // matching visual segment starts, so there's nothing to drift/stretch --
  // durations already match because cut.duration was set from the clip's
  // own length when it was generated.
  let hookNarrationBuffer = null;
  if (project.hookNarrationUrl) {
    try {
      const mix = ensureAudioMix();
      await mix.audioCtx.resume().catch(() => {});
      const resp = await fetch(project.hookNarrationUrl);
      hookNarrationBuffer = await mix.audioCtx.decodeAudioData(await resp.arrayBuffer());
    } catch (err) {
      console.warn("후킹 나레이션 디코딩 실패:", err);
    }
  }
  for (const imgAsset of images) {
    if (imgAsset.narrationUrl) {
      try {
        const mix = ensureAudioMix();
        await mix.audioCtx.resume().catch(() => {});
        const resp = await fetch(imgAsset.narrationUrl);
        imgAsset.narrationBuffer = await mix.audioCtx.decodeAudioData(await resp.arrayBuffer());
      } catch (err) {
        console.warn("컷 나레이션 디코딩 실패:", err);
      }
    }
  }

  return { front, images, audioCtx, mixDestination, hookNarrationBuffer };
}

// Captions can now contain manual line breaks (Enter in the 자막 textarea),
// so this draws each line separately instead of one fillText() call --
// canvas text rendering has no native newline support, a literal \n in a
// single fillText() just renders as an invisible/garbled character, not an
// actual line break.
function drawShortsCaption(ctx, text, canvasW, canvasH, fontSize, color, position) {
  if (!text) return;
  const size = fontSize || 72;
  ctx.save();
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) { ctx.restore(); return; }
  const lineHeight = size * 1.25;
  const centerY = position === 'top' ? canvasH * 0.22
    : position === 'center' ? canvasH / 2
    : canvasH - 260; // 'bottom' (default) -- original position
  const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
  const paddingX = 32, paddingY = 20;
  const boxH = lineHeight * lines.length + paddingY;
  const boxTop = centerY - boxH / 2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(canvasW / 2 - maxWidth / 2 - paddingX, boxTop, maxWidth + paddingX * 2, boxH);
  ctx.fillStyle = color || "#ffffff";
  lines.forEach((line, i) => {
    const y = boxTop + paddingY / 2 + lineHeight * (i + 0.5);
    ctx.fillText(line, canvasW / 2, y);
  });
  ctx.restore();
}

// Optional colored banner + title (1~2 lines) across the top of the frame,
// configurable per-project via the "영상 스타일 설정" panel.
function drawShortsTopBar(ctx, project, canvasW) {
  if (!project || !project.topBarTitle) return;
  const barH = project.topBarHeight || 360;
  const fontSize = project.topBarTitleFontSize || 110;
  const lines = [
    { text: project.topBarTitle, color: project.topBarTitleColor || "#ffff00" },
    { text: project.topBarTitleLine2, color: project.topBarTitleColorLine2 || "#ff0000" }
  ].filter(l => l.text);
  ctx.save();
  ctx.fillStyle = project.topBarColor || "#0b1a30";
  ctx.fillRect(0, 0, canvasW, barH);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (lines.length === 1) {
    ctx.fillStyle = lines[0].color;
    ctx.fillText(lines[0].text, canvasW / 2, barH / 2);
  } else {
    const lineGap = fontSize * 0.6;
    ctx.fillStyle = lines[0].color;
    ctx.fillText(lines[0].text, canvasW / 2, barH / 2 - lineGap);
    ctx.fillStyle = lines[1].color;
    ctx.fillText(lines[1].text, canvasW / 2, barH / 2 + lineGap);
  }
  ctx.restore();
}

// Draws the front video at its OWN native pixel size -- no upscale,
// downscale, or crop-to-fill -- horizontally centered, with its top edge
// sitting right below the black title banner (or at the very top if there
// is no banner). This is specifically for a manually-made Gemini/Veo clip
// that's already vertical: stretching it to fill the 1080x1920 canvas (the
// old behavior, plain `drawImage(el, 0, 0, W, H)`) distorted its aspect
// ratio, and a horizontal clip stretched into portrait looked especially
// bad. If the video is wider or taller than the available space, the
// excess simply falls outside the canvas and is clipped by it -- never
// resized to force a fit.
function drawShortsFrontVideoNative(ctx, videoEl, project, canvasW) {
  const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
  if (!vw || !vh) return;
  const bannerH = project.topBarTitle ? (project.topBarHeight || 360) : 0;
  const x = (canvasW - vw) / 2;
  ctx.drawImage(videoEl, x, bannerH, vw, vh);
}

// Slow zoom-in (Ken Burns) over the cut's duration so static images don't
// look completely frozen against the Veo clip's motion.
function drawShortsKenBurnsImage(ctx, img, progress, canvasW, canvasH) {
  const scale = 1 + 0.08 * progress;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const canvasRatio = canvasW / canvasH;
  const imgRatio = iw / ih;
  let drawW, drawH;
  if (imgRatio > canvasRatio) {
    drawH = canvasH * scale;
    drawW = drawH * imgRatio;
  } else {
    drawW = canvasW * scale;
    drawH = drawW / imgRatio;
  }
  const x = (canvasW - drawW) / 2;
  const y = (canvasH - drawH) / 2;
  ctx.drawImage(img, x, y, drawW, drawH);
}

// Plays the full 30s timeline onto the canvas (Veo clip, then each image cut
// with Ken Burns motion + caption). When record=true, simultaneously captures
// the canvas via MediaRecorder and resolves with the recorded video Blob.
//
// Guarded against overlapping calls: 미리보기 재생 and 영상으로 녹화 share the
// same cached AudioContext (shortsAssets), and neither button ever disabled
// the other or itself against a second click. Clicking either while one was
// already running scheduled a SECOND full set of narration sources on that
// same audio clock -- two independent playthroughs audibly overlapping,
// which no amount of fixing when a single run stops its OWN sources could
// prevent. This flag makes a second call fail fast with a clear message
// instead of quietly doubling up.
let shortsTimelineRunning = false;
async function runShortsTimeline(canvas, assets, project, { record } = {}) {
  if (shortsTimelineRunning) {
    throw new Error("이미 미리보기 또는 녹화가 진행 중입니다. 끝날 때까지 기다린 후 다시 시도해 주세요.");
  }
  shortsTimelineRunning = true;
  try {
    return await runShortsTimelineInner(canvas, assets, project, { record });
  } finally {
    shortsTimelineRunning = false;
  }
}

async function runShortsTimelineInner(canvas, assets, project, { record } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const frontDuration = assets.front.duration;

  // Full narration content is preserved (no text trimming/truncation) --
  // instead, narration plays back faster via AudioBufferSourceNode.playbackRate,
  // which shortens its actual duration without cutting a single word.
  // Admin-adjustable (Step 4, default 1.2x); raise it further if narration
  // still overlaps or runs long.
  const narrationSpeed = project.narrationSpeed || 1.2;

  // Each cut's visual duration is its own narration clip's natural length
  // (set when the narration was generated), shortened by the speed factor
  // above to match how long it'll actually take to play at that speed. This
  // is a hard backstop on top of that: if the total would STILL blow the
  // 30s budget even after speeding up (e.g. speed left at 1.0x with long
  // narration), scale all cuts down proportionally to fit exactly rather
  // than let the video run long. Narration audio itself still isn't cut
  // short by this scaling -- only how long each image is DISPLAYED before
  // advancing -- so a still-long clip may bleed slightly into the next
  // cut's visual rather than being cut off abruptly (the per-segment
  // stop() below is the actual cutoff backstop for that case).
  // "이미지 컷 1초씩 늘리기" raises this budget by 1s per cut each time it's
  // clicked (extraCutSeconds), for when speeding up narration alone still
  // isn't enough -- deliberately allowing the video to run past 30s rather
  // than compress/cut narration further, since the admin asked for exactly
  // that trade-off.
  const extraCutSeconds = project.extraCutSeconds || 0;
  const SHORTS_TARGET_TOTAL_DURATION = 30 + extraCutSeconds * (project.imageCuts || []).length;
  const cutDurations = (project.imageCuts || []).map(c => Math.max(1, (c.duration || 0) / narrationSpeed + extraCutSeconds));
  const backBudget = Math.max(1, SHORTS_TARGET_TOTAL_DURATION - frontDuration);
  const naturalBackTotal = cutDurations.reduce((s, d) => s + d, 0);
  if (naturalBackTotal > backBudget) {
    const scale = backBudget / naturalBackTotal;
    for (let i = 0; i < cutDurations.length; i++) cutDurations[i] *= scale;
  }
  const totalDuration = frontDuration + cutDurations.reduce((s, d) => s + d, 0);
  const hookCaptionDuration = assets.hookNarrationBuffer
    ? Math.min(assets.hookNarrationBuffer.duration / narrationSpeed, frontDuration)
    : 3;

  let recorder = null;
  let chunks = [];
  let recordedMimeType = 'video/webm';
  if (record) {
    const stream = canvas.captureStream(30);
    if (assets.mixDestination) {
      assets.mixDestination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    }
    // Safari (macOS/iOS) supports MediaRecorder but never any video/webm
    // mimeType -- only Chromium-based browsers do. Since every browser on
    // iOS is required to use WebKit under the hood, without the mp4/h264
    // fallback below, recording silently fails on every browser on iPhone,
    // not just Safari specifically.
    const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=h264', 'video/mp4'];
    const supported = mimeCandidates.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!supported) {
      throw new Error("이 브라우저는 영상 녹화(MediaRecorder)를 지원하지 않습니다. 다른 브라우저로 시도해 주세요.");
    }
    recordedMimeType = supported;
    recorder = new MediaRecorder(stream, { mimeType: recordedMimeType, videoBitsPerSecond: 8000000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start();
  }

  await new Promise(async (resolve) => {
    // Schedule every narration clip up front, each starting exactly when its
    // matching visual segment starts -- sample-accurate via the shared audio
    // clock, so there's nothing left to drift out of sync.
    //
    // Each source is ALSO explicitly stopped at the next segment's start
    // time. Without this, a narration clip longer than its own (possibly
    // duration-scaled, see the 30s cap above) visual slot kept playing right
    // through the next segment's narration starting -- two clips audibly
    // overlapping instead of one cutting off before the other begins. A
    // clip that runs long still gets truncated rather than playing in full,
    // but that's the lesser problem versus garbled simultaneous audio.
    const scheduledSources = [];
    if (assets.audioCtx && assets.mixDestination) {
      const base = assets.audioCtx.currentTime + 0.05;
      if (assets.hookNarrationBuffer) {
        const src = assets.audioCtx.createBufferSource();
        src.buffer = assets.hookNarrationBuffer;
        src.playbackRate.value = narrationSpeed;
        src.connect(assets.mixDestination);
        src.connect(assets.audioCtx.destination);
        src.start(base);
        try { src.stop(base + frontDuration); } catch (err) { /* already stopped */ }
        scheduledSources.push(src);
      }
      let cursor = frontDuration;
      assets.images.forEach((imgAsset, i) => {
        const segmentStart = cursor;
        cursor += cutDurations[i] || 0;
        if (imgAsset.narrationBuffer) {
          const src = assets.audioCtx.createBufferSource();
          src.buffer = imgAsset.narrationBuffer;
          src.playbackRate.value = narrationSpeed;
          src.connect(assets.mixDestination);
          src.connect(assets.audioCtx.destination);
          src.start(base + segmentStart);
          try { src.stop(base + cursor); } catch (err) { /* already stopped */ }
          scheduledSources.push(src);
        }
      });
    }

    if (assets.front.type === 'video') {
      assets.front.el.currentTime = 0;
      const playPromise = assets.front.el.play();
      if (playPromise && playPromise.catch) playPromise.catch(() => {});
    }

    // A video element that hasn't decoded a frame yet (readyState < 2,
    // HAVE_CURRENT_DATA) throws if drawImage() is called on it in some
    // engines. That exception happening inside a requestAnimationFrame
    // callback is silently swallowed by the browser (nothing left to
    // catch it), which killed the whole loop after the very first frame --
    // the canvas stayed on its black fillRect() forever with no visible
    // error, looking exactly like "미리보기가 안 된다" with nothing in the
    // console pointing at why. Wrapping the frame body means a single bad
    // frame just gets skipped (leaving the black background for that
    // frame) instead of ending the entire preview/recording.
    function step() {
      try {
        const elapsed = (performance.now() - startTime) / 1000;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, W, H);

        if (elapsed < frontDuration) {
          if (assets.front.type === 'video') {
            if (assets.front.el.readyState >= 2) {
              drawShortsFrontVideoNative(ctx, assets.front.el, project, W);
            }
          } else {
            drawShortsKenBurnsImage(ctx, assets.front.el, Math.min(elapsed / frontDuration, 1), W, H);
          }
          if (elapsed < hookCaptionDuration) drawShortsCaption(ctx, project.hookText, W, H, project.captionFontSize, project.captionColor, project.captionPosition);
        } else {
          let t = elapsed - frontDuration;
          let idx = 0;
          while (idx < assets.images.length - 1 && t > cutDurations[idx]) {
            t -= cutDurations[idx];
            idx++;
          }
          const cut = assets.images[idx];
          if (cut) {
            drawShortsKenBurnsImage(ctx, cut.img, Math.min(t / (cutDurations[idx] || 1), 1), W, H);
            // caption2 (if present) takes over for the back half of the cut --
            // two short captions shown one after another rather than one long
            // one. Falls back to caption alone for the whole duration when
            // caption2 is empty (uploaded cuts, or cuts written before this).
            const halfDuration = (cutDurations[idx] || 1) / 2;
            const activeCaption = (cut.caption2 && t >= halfDuration) ? cut.caption2 : cut.caption;
            drawShortsCaption(ctx, activeCaption, W, H, project.captionFontSize, project.captionColor, project.captionPosition);
          }
        }
        drawShortsTopBar(ctx, project, W);

        if (elapsed >= totalDuration) {
          if (assets.front.type === 'video') assets.front.el.pause();
          scheduledSources.forEach(src => { try { src.stop(); } catch (err) {} });
          resolve();
          return;
        }
      } catch (err) {
        console.error("숏폼 미리보기 프레임 렌더링 중 오류(이 프레임만 건너뜁니다):", err);
      }
      requestAnimationFrame(step);
    }

    // 비디오가 실제로 프레임 데이터를 준비하기 전에 첫 프레임을 그리려
    // 하면 위 readyState 체크 때문에 그냥 넘어가긴 하지만, 그래도 재생
    // 시작 자체가 늦어지면 처음 1~2초가 통째로 비어 보일 수 있다. 재생
    // 가능 상태가 될 때까지 잠깐(최대 2초) 기다렸다가 타이머를 시작한다.
    async function waitForFrontVideoReady() {
      if (assets.front.type !== 'video') return;
      const el = assets.front.el;
      if (el.readyState >= 2) return;
      await Promise.race([
        new Promise(r => el.addEventListener('canplay', r, { once: true })),
        new Promise(r => setTimeout(r, 2000))
      ]);
    }
    await waitForFrontVideoReady();
    const startTime = performance.now();
    requestAnimationFrame(step);
  });

  if (record && recorder) {
    return new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recordedMimeType }));
      recorder.stop();
    });
  }
}

function shortsVideoExtFromMime(mimeType) {
  return (mimeType || '').includes('mp4') ? 'mp4' : 'webm';
}

// Fills in a draft 유튜브 title/description/hashtags from data the project
// already has (topBarTitle, hookText, the linked article) -- no extra
// Gemini call, so it costs nothing and never fails on an API/billing
// problem. Purely a starting point: all three fields stay freely editable,
// with a 복사 button next to each for pasting straight into YouTube's
// upload dialog.
const SHORTS_YOUTUBE_CATEGORY_TAGS = {
  culture: '문화생활', economy: '경제산업', tech: '기술미디어', local: '지역평택', opinion: '오피니언'
};
async function renderShortsYoutubeMetadata() {
  if (!currentShortsProject || !currentShortsProject.finalVideoUrl) return;
  const wrapper = document.getElementById("shorts-youtube-meta");
  if (!wrapper) return;

  const articles = await window.SupabaseAdapter.fetchArticles();
  const article = articles.find(a => a.id === currentShortsProject.articleId);

  const bannerTitle = [currentShortsProject.topBarTitle, currentShortsProject.topBarTitleLine2]
    .filter(Boolean).join(' ').trim();
  const title = bannerTitle || currentShortsProject.hookText || (article ? article.title : '') || '바이칼뉴스 숏폼';

  const articleUrl = article ? (article.canonicalUrl || `https://baikalnews.com/article.html?id=${article.id}`) : '';
  const descriptionLines = [
    currentShortsProject.hookText || '',
    article ? article.lead || '' : '',
    articleUrl ? `자세히 보기: ${articleUrl}` : '',
    '바이칼뉴스 | 깊고 투명한 시선으로 세상을 비추다'
  ].filter(Boolean);

  const catTag = article ? (SHORTS_YOUTUBE_CATEGORY_TAGS[article.category] || '') : '';
  const hashtags = ['#Shorts', '#바이칼뉴스', catTag ? `#${catTag}` : '', '#평택', '#뉴스'].filter(Boolean).join(' ');

  document.getElementById("shorts-yt-title").value = title;
  document.getElementById("shorts-yt-description").value = descriptionLines.join('\n\n');
  document.getElementById("shorts-yt-hashtags").value = hashtags;
  wrapper.style.display = "block";
}

function copyShortsYoutubeField(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.select();
  navigator.clipboard.writeText(el.value).then(() => {
    el.blur();
  }).catch(() => {
    // Clipboard API can be blocked (permissions, non-HTTPS, etc.) -- the
    // field is already selected, so a manual Ctrl+C still works as a
    // fallback instead of silently doing nothing.
    alert("자동 복사에 실패했습니다. 텍스트가 선택되어 있으니 Ctrl+C(또는 Cmd+C)로 복사해 주세요.");
  });
}

// "이미지 컷 1초씩 늘려서 다시 보기" -- for when 재생 속도 alone still isn't
// enough to fit long narration without overlap/cutoff. Adds 1s per cut to
// the 30s budget runShortsTimelineInner() targets (cumulative -- each click
// adds another second), then immediately re-previews so the admin can tell
// right away whether it's now enough, without a separate button press.
async function extendShortsCutsAndPreview() {
  if (!currentShortsProject) return;
  currentShortsProject.extraCutSeconds = (currentShortsProject.extraCutSeconds || 0) + 1;
  shortsAssets = null;
  saveShortsDraftLocally();
  const statusEl = document.getElementById("shorts-extra-seconds-status");
  if (statusEl) statusEl.textContent = `컷당 +${currentShortsProject.extraCutSeconds}초 (총 +${currentShortsProject.extraCutSeconds * (currentShortsProject.imageCuts || []).length}초)`;
  await previewShortsAssembly();
}

async function previewShortsAssembly() {
  const statusEl = document.getElementById("shorts-assembly-status");
  const previewBtn = document.getElementById("shorts-preview-btn");
  const recordBtn = document.getElementById("shorts-record-btn");
  // Preview and recording share the same AudioContext (cached shortsAssets)
  // -- disabling both while either runs, not just the one that was clicked,
  // stops a second click from scheduling a second, overlapping set of
  // narration sources on that shared clock (runShortsTimeline's own
  // shortsTimelineRunning guard is the hard backstop; this is just so the
  // buttons themselves don't invite the double-click in the first place).
  if (previewBtn) previewBtn.disabled = true;
  if (recordBtn) recordBtn.disabled = true;
  try {
    statusEl.textContent = "미리보기 준비 중...";
    shortsAssets = shortsAssets || await buildShortsAssets(currentShortsProject);
    const canvas = document.getElementById("shorts-canvas");
    statusEl.textContent = "미리보기 재생 중...";
    await runShortsTimeline(canvas, shortsAssets, currentShortsProject, { record: false });
    statusEl.textContent = "미리보기 재생 완료.";
  } catch (err) {
    console.error("숏폼 미리보기 실패:", err);
    statusEl.textContent = "미리보기 실패: " + err.message;
  } finally {
    if (previewBtn) previewBtn.disabled = false;
    if (recordBtn) recordBtn.disabled = false;
  }
}

// Most browsers (Chrome/Edge/Firefox on desktop) can only MediaRecorder to
// webm -- fine to play back, but rejected or awkward on upload targets that
// expect mp4 (YouTube Shorts, Instagram, KakaoTalk, etc). This converts the
// recorded webm to mp4 entirely client-side via ffmpeg.wasm's legacy
// SINGLE-THREADED build (@ffmpeg/ffmpeg 0.11.x) -- deliberately not the
// faster multi-threaded build, which requires serving the whole site with
// cross-origin-isolation headers (COOP/COEP) that would very likely break
// AdSense and other third-party embeds already on this site. Slower (~1-3
// minutes for a 30s clip) but safe. The ~25MB core is only fetched the
// first time a conversion actually runs, not on every admin page load.
let shortsFfmpegInstance = null;
function loadFFmpegLib() {
  if (window.FFmpeg) return Promise.resolve(window.FFmpeg);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
    script.onload = () => resolve(window.FFmpeg);
    script.onerror = () => reject(new Error("mp4 변환 엔진(ffmpeg.wasm)을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

async function getShortsFFmpeg(onProgress) {
  if (shortsFfmpegInstance && shortsFfmpegInstance.isLoaded()) return shortsFfmpegInstance;
  const FFmpegLib = await loadFFmpegLib();
  shortsFfmpegInstance = FFmpegLib.createFFmpeg({
    log: false,
    corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
  });
  if (onProgress) shortsFfmpegInstance.setProgress(({ ratio }) => onProgress(ratio));
  await shortsFfmpegInstance.load();
  return shortsFfmpegInstance;
}

async function convertShortsWebmToMp4(webmBlob, onStatus) {
  if (onStatus) onStatus("mp4 변환 엔진 준비 중... (처음 한 번은 다운로드 때문에 다소 걸릴 수 있습니다)");
  const ffmpeg = await getShortsFFmpeg((ratio) => {
    if (onStatus) onStatus(`mp4로 변환 중... (${Math.round(ratio * 100)}%, 최대 몇 분 소요될 수 있습니다)`);
  });
  const { fetchFile } = window.FFmpeg;
  ffmpeg.FS('writeFile', 'input.webm', await fetchFile(webmBlob));
  // -crf 18 (lower = higher quality, 18 is close to visually lossless) with
  // -preset veryfast instead of the original ultrafast -- ultrafast disables
  // most of libx264's quality-improving coding tools regardless of CRF and
  // was the main cause of visibly blocky/soft output, not the source
  // resolution. veryfast recovers most of that quality for a modest (not
  // dramatic) hit to in-browser wasm conversion speed.
  await ffmpeg.run('-i', 'input.webm', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'output.mp4');
  const data = ffmpeg.FS('readFile', 'output.mp4');
  try { ffmpeg.FS('unlink', 'input.webm'); ffmpeg.FS('unlink', 'output.mp4'); } catch (err) { /* best-effort cleanup */ }
  return new Blob([data.buffer], { type: 'video/mp4' });
}

// mp4 conversion is a separate, admin-triggered step from recording itself --
// recording already takes ~30s, and tacking on another 1-3 minutes of
// conversion before the admin even gets to see/approve the result was more
// waiting than wanted. This button only shows once a final video exists and
// isn't mp4 already (Safari's recordings are already mp4 -- nothing to do).
function updateShortsConvertMp4ButtonVisibility() {
  const btn = document.getElementById("shorts-convert-mp4-btn");
  if (!btn) return;
  const hasNonMp4Video = !!(currentShortsProject && currentShortsProject.finalVideoUrl &&
    !(currentShortsProject.finalVideoMimeType || '').includes('mp4'));
  btn.style.display = hasNonMp4Video ? "inline-flex" : "none";
}

async function convertShortsFinalVideoToMp4() {
  if (!currentShortsProject || !currentShortsProject.finalVideoUrl) return;
  if ((currentShortsProject.finalVideoMimeType || '').includes('mp4')) {
    alert("이미 mp4 형식입니다.");
    return;
  }
  const draftId = currentShortsProject.localDraftId;
  if (!draftId) {
    alert("이 브라우저에 저장된 원본 영상을 찾을 수 없습니다. 먼저 이 프로젝트를 로컬 초안으로 저장해 주세요.");
    return;
  }

  const statusEl = document.getElementById("shorts-assembly-status");
  const btn = document.getElementById("shorts-convert-mp4-btn");
  if (btn) btn.disabled = true;
  beginShortsBusyOperation();
  try {
    const webmBlob = await idbGetBlob(`${draftId}:final`);
    if (!webmBlob) throw new Error("이 브라우저에 저장된 원본 영상을 찾을 수 없습니다. 다시 녹화해 주세요.");

    const mp4Blob = await convertShortsWebmToMp4(webmBlob, (msg) => { if (statusEl) statusEl.textContent = msg; });
    const publicUrl = await keepShortsBlobLocal(mp4Blob, `${draftId}:final`);
    currentShortsProject.finalVideoUrl = publicUrl;
    currentShortsProject.finalVideoMimeType = mp4Blob.type;
    await persistCurrentShortsProject();

    const previewEl = document.getElementById("shorts-final-preview");
    if (previewEl) previewEl.src = publicUrl;
    const downloadEl = document.getElementById("shorts-final-download");
    if (downloadEl) {
      downloadEl.href = publicUrl;
      downloadEl.download = `shorts-${currentShortsProject.id || Date.now()}.mp4`;
    }
    updateShortsConvertMp4ButtonVisibility();
    if (statusEl) statusEl.textContent = "mp4 변환 완료! 다운로드 버튼을 다시 눌러 받아주세요.";
  } catch (err) {
    console.error("mp4 변환 실패:", err);
    alert("mp4 변환 실패: " + err.message);
    if (statusEl) statusEl.textContent = "mp4 변환 실패: " + err.message;
  } finally {
    if (btn) btn.disabled = false;
    endShortsBusyOperation();
  }
}

async function recordShortsVideo() {
  const statusEl = document.getElementById("shorts-assembly-status");
  const btn = document.getElementById("shorts-record-btn");
  const previewBtn = document.getElementById("shorts-preview-btn");
  if (btn) btn.disabled = true;
  if (previewBtn) previewBtn.disabled = true;

  // Best-effort: stops the screen from auto-locking mid-recording on mobile
  // -- a locked/dimmed screen can throttle JS timers and corrupt the ~30s
  // capture. Not supported everywhere (notably iOS Safari as of writing), so
  // recording still proceeds normally without it if the API is missing.
  let wakeLock = null;
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (err) {
    console.warn("화면 잠금 방지 실패 (녹화는 계속 진행됩니다):", err);
  }

  beginShortsBusyOperation();
  try {
    statusEl.textContent = "녹화 준비 중... (완료될 때까지 이 탭을 벗어나지 마세요)";
    shortsAssets = shortsAssets || await buildShortsAssets(currentShortsProject);
    const canvas = document.getElementById("shorts-canvas");
    statusEl.textContent = "녹화 중... (약 30초 소요)";
    // Recording produces whatever the browser's MediaRecorder actually
    // supports (webm on most desktop browsers, mp4 on Safari's fallback
    // path) -- mp4 conversion is now a separate, admin-triggered step
    // (convertShortsFinalVideoToMp4()) rather than automatic, so checking
    // the recording itself doesn't also mean waiting 1-3 minutes for a
    // conversion before you even get to see it.
    const videoBlob = await runShortsTimeline(canvas, shortsAssets, currentShortsProject, { record: true });

    const publicUrl = await keepShortsBlobLocal(videoBlob, `${ensureShortsLocalDraftId()}:final`);
    currentShortsProject.finalVideoUrl = publicUrl;
    currentShortsProject.finalVideoMimeType = videoBlob.type;
    currentShortsProject.status = 'video_ready';
    await persistCurrentShortsProject();

    const previewEl = document.getElementById("shorts-final-preview");
    previewEl.src = publicUrl;
    previewEl.style.display = "block";

    const downloadEl = document.getElementById("shorts-final-download");
    if (downloadEl) {
      downloadEl.href = publicUrl;
      downloadEl.download = `shorts-${currentShortsProject.id || Date.now()}.${shortsVideoExtFromMime(videoBlob.type)}`;
      downloadEl.style.display = "inline-block";
    }
    updateShortsConvertMp4ButtonVisibility();
    await renderShortsYoutubeMetadata();

    statusEl.textContent = "완료! 아래에서 재생/다운로드할 수 있습니다. (서버에는 저장되지 않으니 필요하면 지금 다운로드하거나 보관 버튼으로 대본을 남겨두세요.)";
  } catch (err) {
    console.error("숏폼 녹화 실패:", err);
    statusEl.textContent = "녹화 실패: " + err.message;
    alert("녹화 실패: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (previewBtn) previewBtn.disabled = false;
    if (wakeLock) { try { await wakeLock.release(); } catch (err) { /* already released, ignore */ } }
    endShortsBusyOperation();
  }
}

// ==========================================================
// 뉴스레터: subscriber briefing + an auto-generated, admin-editable daily draft
// (신규 뉴스 3 + 인기 뉴스 3), copied out as email-client-safe HTML for manual sending.
// ==========================================================
let newsletterDraft = null; // { date: 'YYYY-MM-DD', latestIds: [...], popularIds: [...] }
let newsletterArticlesCache = [];

// Parses the site's "2026.07.02" date format into a comparable Date, for
// sorting articles by actual recency (mirrors js/main.js's parseKoreanDate).
function parseKoreanDate(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('.').map(s => parseInt(s, 10));
  if (parts.length < 3 || parts.some(isNaN)) return new Date(0);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// toISOString() reports the UTC calendar date, which lags a full day
// behind Korea's during 00:00-08:59 KST (UTC+9) -- exactly the window the
// new 8am briefing cron runs in. Using Asia/Seoul here keeps the admin's
// "오늘" draft key in sync with the date the cron writes to Supabase.
function todayDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

async function renderNewsletterSubscriberBriefing() {
  const subscribers = await window.SupabaseAdapter.fetchNewsletterSubscribers();

  document.getElementById("newsletter-stat-total").textContent = subscribers.length.toLocaleString("ko-KR");

  const now = new Date();
  const thisMonthCount = subscribers.filter(s => {
    const d = new Date(s.subscribedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  document.getElementById("newsletter-stat-month").textContent = thisMonthCount.toLocaleString("ko-KR");

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const lastWeekCount = subscribers.filter(s => new Date(s.subscribedAt) >= sevenDaysAgo).length;
  document.getElementById("newsletter-stat-week").textContent = lastWeekCount.toLocaleString("ko-KR");

  renderNewsletterTrendChart(subscribers);
  renderNewsletterSubscribersList(subscribers);
}

// 누적 구독자수 추이 -- 월 선택 버튼(예: "2026년 8월")으로 달을 바꿔가며
// 볼 수 있다. 버튼을 다시 그릴 때마다 재조회하지 않도록 마지막으로 받은
// 구독자 목록을 여기 캐시해 둔다.
let newsletterTrendAllSubscribers = [];
let newsletterTrendSelectedMonth = null; // 'YYYY-MM'

function renderNewsletterTrendChart(subscribers) {
  newsletterTrendAllSubscribers = subscribers;

  if (!newsletterTrendSelectedMonth) {
    const now = new Date();
    newsletterTrendSelectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  renderNewsletterTrendMonthButtons();
  renderNewsletterTrendLineChart();
}

function renderNewsletterTrendMonthButtons() {
  const wrap = document.getElementById("newsletter-trend-month-buttons");
  if (!wrap) return;

  // 구독자가 있는 가장 이른 달부터 이번 달까지 버튼을 만든다 -- 데이터가
  // 없는 먼 과거 달까지 억지로 보여주지 않는다.
  const now = new Date();
  let earliest = now;
  newsletterTrendAllSubscribers.forEach(s => {
    const d = new Date(s.subscribedAt);
    if (!isNaN(d) && d < earliest) earliest = d;
  });

  const months = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  const stop = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  while (cursor >= stop) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() - 1);
  }

  wrap.innerHTML = months.map(key => {
    const [y, m] = key.split('-');
    const active = key === newsletterTrendSelectedMonth;
    return `<button type="button" class="btn-admin ${active ? 'btn-admin-orange' : 'btn-admin-secondary'}" onclick="selectNewsletterTrendMonth('${key}')">${y}년 ${Number(m)}월</button>`;
  }).join('');
}

function selectNewsletterTrendMonth(monthKey) {
  newsletterTrendSelectedMonth = monthKey;
  renderNewsletterTrendMonthButtons();
  renderNewsletterTrendLineChart();
}

function renderNewsletterTrendLineChart() {
  const container = document.getElementById("newsletter-trend-chart-container");
  if (!container) return;

  const [year, month] = newsletterTrendSelectedMonth.split('-').map(Number);
  // x축(날짜 라벨)은 그 달 전체 일수를 다 보여주되, 실제 선은 오늘까지만
  // 그린다 -- 아직 안 지난 날짜까지 평평한 선을 그리면 마치 예측인 것처럼
  // 보여서, 데이터가 없는 구간은 아예 비워둔다.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDay = new Date(year, month, 0).getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const lastDataDay = isCurrentMonth ? today.getDate() : lastDay;

  // 정렬된 구독일 목록에서, 특정 날짜까지 누적된 구독자 수를 센다 --
  // 선택한 달 이전에 가입한 사람도 그대로 누적에 포함된다 (달이 바뀌어도
  // 0으로 리셋되지 않는 게 "누적"의 의미).
  const subscribedDates = newsletterTrendAllSubscribers
    .map(s => new Date(s.subscribedAt))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);

  const points = [];
  for (let day = 1; day <= lastDay; day++) {
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
    const cumulative = subscribedDates.filter(d => d <= endOfDay).length;
    points.push({ day, cumulative });
  }
  const dataPoints = points.filter(p => p.day <= lastDataDay);

  if (dataPoints.length === 0 || dataPoints[dataPoints.length - 1].cumulative === 0) {
    container.innerHTML = `<div class="help-text">이 달에는 누적 구독자가 없습니다.</div>`;
    return;
  }

  const maxVal = Math.max(1, ...dataPoints.map(p => p.cumulative));
  const vbW = 640;
  const vbH = 220;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = vbW - padL - padR;
  const plotH = vbH - padT - padB;

  // 날짜(day)를 기준으로 x좌표를 고정한다 -- 실제 선(dataPoints)이 그 달
  // 끝까지 안 가더라도, 라벨은 그 달 전체 일수(points) 기준 위치에 그대로
  // 남아있어야 해서 인덱스가 아니라 day 자체로 계산한다.
  const xFor = day => padL + (lastDay === 1 ? plotW : ((day - 1) / (lastDay - 1)) * plotW);
  const yFor = v => padT + plotH - (v / maxVal) * plotH;

  const linePath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.day).toFixed(1)},${yFor(p.cumulative).toFixed(1)}`).join(' ');

  // Y축 눈금 4단계 (0 포함), 깔끔한 값으로 반올림
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal / tickCount) * i));
  const gridLines = yTicks.map(v => {
    const y = yFor(v);
    return `
      <line x1="${padL}" y1="${y}" x2="${vbW - padR}" y2="${y}" stroke="var(--admin-border)" stroke-width="1"></line>
      <text x="${padL - 8}" y="${y + 3}" font-size="9" text-anchor="end" fill="var(--admin-text-muted)">${v.toLocaleString('ko-KR')}</text>
    `;
  }).join('');

  // 라벨은 5일 간격 + 첫날/마지막날만 -- 30개 넘는 날짜를 다 표시하면 겹친다.
  // 5일 간격 라벨이 마지막 날 라벨과 너무 가까우면(예: 30일과 31일) 겹치니
  // 그 경우는 건너뛰어 마지막 날 라벨만 남긴다.
  const dateLabels = points.map(p => {
    const isFirst = p.day === 1;
    const isLast = p.day === lastDay;
    const isFiveStep = p.day % 5 === 0 && Math.abs(p.day - lastDay) > 2;
    if (!isFirst && !isLast && !isFiveStep) return '';
    return `<text x="${xFor(p.day)}" y="${vbH - 8}" font-size="9" text-anchor="middle" fill="var(--admin-text-muted)">${p.day}일</text>`;
  }).join('');

  const lastPoint = dataPoints[dataPoints.length - 1];
  const endLabel = `<text x="${xFor(lastPoint.day)}" y="${yFor(lastPoint.cumulative) - 10}" font-size="12" font-weight="700" text-anchor="end" fill="var(--admin-text-primary)">${lastPoint.cumulative.toLocaleString('ko-KR')}명</text>`;

  container.innerHTML = `
    <svg id="newsletter-trend-svg" viewBox="0 0 ${vbW} ${vbH}" style="width:100%; height:auto; display:block;">
      ${gridLines}
      <path d="${linePath}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
      <circle id="newsletter-trend-hover-dot" cx="0" cy="0" r="4" fill="#2a78d6" stroke="var(--admin-bg-panel, #fff)" stroke-width="2" style="display:none;"></circle>
      <line id="newsletter-trend-crosshair" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="var(--admin-border)" stroke-width="1" style="display:none;"></line>
      ${dateLabels}
      ${endLabel}
      <rect id="newsletter-trend-hover-area" x="${padL}" y="0" width="${plotW}" height="${vbH}" fill="transparent"></rect>
    </svg>
    <div id="newsletter-trend-tooltip" style="position:fixed; display:none; pointer-events:none; background:var(--admin-bg-panel, #1c2333); border:1px solid var(--admin-border); border-radius:6px; padding:6px 10px; font-size:11px; color:var(--admin-text-primary); box-shadow:0 4px 12px rgba(0,0,0,0.25); z-index:50;"></div>
  `;

  attachNewsletterTrendHover(dataPoints, xFor, yFor, year, month);
}

// 크로스헤어 + 툴팁 -- 포인터가 어디 있든 가장 가까운 날짜를 스냅해서
// 보여준다 (데이터비즈 가이드의 라인차트 호버 규칙: "크로스헤어가 X를
// 찾는다", 포인터가 선 위에 정확히 있을 필요 없음). dataPoints만 받아서
// 아직 선이 그려지지 않은(미래) 구간에서는 크로스헤어가 뜨지 않는다.
function attachNewsletterTrendHover(dataPoints, xFor, yFor, year, month) {
  const svg = document.getElementById("newsletter-trend-svg");
  const hoverArea = document.getElementById("newsletter-trend-hover-area");
  const dot = document.getElementById("newsletter-trend-hover-dot");
  const crosshair = document.getElementById("newsletter-trend-crosshair");
  const tooltip = document.getElementById("newsletter-trend-tooltip");
  if (!svg || !hoverArea) return;

  const vbW = svg.viewBox.baseVal.width;

  function handleMove(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const scale = vbW / rect.width;
    const svgX = (clientX - rect.left) * scale;

    let nearest = dataPoints[0];
    let bestDist = Infinity;
    dataPoints.forEach(p => {
      const dist = Math.abs(xFor(p.day) - svgX);
      if (dist < bestDist) { bestDist = dist; nearest = p; }
    });

    const p = nearest;
    const px = xFor(p.day);
    const py = yFor(p.cumulative);

    dot.setAttribute('cx', px);
    dot.setAttribute('cy', py);
    dot.style.display = '';
    crosshair.setAttribute('x1', px);
    crosshair.setAttribute('x2', px);
    crosshair.style.display = '';

    tooltip.innerHTML = `<strong>${p.cumulative.toLocaleString('ko-KR')}명</strong><br>${year}년 ${month}월 ${p.day}일`;
    tooltip.style.display = 'block';
    tooltip.style.left = `${clientX + 14}px`;
    tooltip.style.top = `${clientY - 36}px`;
  }

  hoverArea.addEventListener('pointermove', e => handleMove(e.clientX, e.clientY));
  hoverArea.addEventListener('pointerleave', () => {
    dot.style.display = 'none';
    crosshair.style.display = 'none';
    tooltip.style.display = 'none';
  });
}

function renderNewsletterSubscribersList(subscribers) {
  const tbody = document.getElementById("newsletter-subscribers-list");
  if (!tbody) return;

  if (subscribers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--admin-text-muted); padding: 20px 0;">아직 구독자가 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = subscribers.map(s => `
    <tr>
      <td>${s.email}</td>
      <td style="white-space: nowrap;">${s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString("ko-KR") : ''}</td>
      <td><a onclick="deleteNewsletterSubscriberRow(${s.id})" style="color: var(--status-review); cursor: pointer;">삭제</a></td>
    </tr>
  `).join('');
}

async function deleteNewsletterSubscriberRow(id) {
  if (!confirm("이 구독자를 목록에서 삭제하시겠습니까?")) return;
  await window.SupabaseAdapter.deleteNewsletterSubscriber(id);
  await renderNewsletterSubscriberBriefing();
}

async function copyNewsletterEmailList() {
  const subscribers = await window.SupabaseAdapter.fetchNewsletterSubscribers();
  if (subscribers.length === 0) {
    alert("복사할 구독자 이메일이 없습니다.");
    return;
  }
  const text = subscribers.map(s => s.email).join(', ');
  try {
    await navigator.clipboard.writeText(text);
    alert(`구독자 이메일 ${subscribers.length}건을 클립보드에 복사했습니다.`);
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
  }
}

// ==========================================
// 카카오톡 3분 뉴스 구독자 -- same structure as the newsletter briefing
// above (stats/trend/list), phone numbers instead of email. Sending itself
// isn't automated here yet (needs a 카카오톡 채널 first); this just tracks
// who's asked to be notified once it's ready, and lets the admin copy the
// number list out for manual use in the meantime.
// ==========================================
async function renderKakaoSubscriberBriefing() {
  const subscribers = await window.SupabaseAdapter.fetchKakaoSubscribers();

  document.getElementById("kakao-stat-total").textContent = subscribers.length.toLocaleString("ko-KR");

  const now = new Date();
  const thisMonthCount = subscribers.filter(s => {
    const d = new Date(s.subscribedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  document.getElementById("kakao-stat-month").textContent = thisMonthCount.toLocaleString("ko-KR");

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const lastWeekCount = subscribers.filter(s => new Date(s.subscribedAt) >= sevenDaysAgo).length;
  document.getElementById("kakao-stat-week").textContent = lastWeekCount.toLocaleString("ko-KR");

  renderKakaoTrendChart(subscribers);
  renderKakaoSubscribersList(subscribers);
  renderKakaoCategoryChart(subscribers);
}

// "모두"는 특정 관심사가 아니라 "필터 없음" 상태라 나머지 8개 카테고리와
// 같은 채도의 색을 주면 마치 9번째 주제인 것처럼 보인다 -- 회색(중립)으로
// 구분하고, 나머지 8개는 데이터비즈 스킬 팔레트의 categorical 8색(순서
// 고정, CVD 검증됨)을 그대로 쓴다.
const KAKAO_CATEGORY_COLORS = {
  all: '#898781',
  politics: '#2a78d6',
  economy: '#eb6834',
  stock: '#1baf7a',
  world: '#eda100',
  society: '#e87ba4',
  culture: '#008300',
  sports: '#4a3aa7',
  tech: '#e34948'
};

// 구독자들이 고른 카테고리 분포 -- 한 사람이 여러 개를 고를 수 있어서 합이
// 구독자 총수보다 클 수 있다 (막대 하나하나가 "그 카테고리를 고른 사람 수").
// "모두"는 항목 수 정렬에 섞이지 않고 항상 맨 위 고정, 나머지 8개만 많은
// 순으로 정렬 -- 카테고리 라벨(한글, 길이 제각각)이 가로축에 있는 것보다
// 세로로 나열하고 막대를 옆으로 뻗는 게 더 읽기 편하다.
function renderKakaoCategoryChart(subscribers) {
  const container = document.getElementById("kakao-category-chart-container");
  if (!container) return;

  const counts = {};
  Object.keys(KAKAO_CATEGORY_LABELS).forEach(id => { counts[id] = 0; });
  subscribers.forEach(s => {
    const cats = (s.categories && s.categories.length > 0) ? s.categories : ['all'];
    cats.forEach(id => { if (id in counts) counts[id] += 1; });
  });

  const allRow = { id: 'all', label: KAKAO_CATEGORY_LABELS.all, count: counts.all };
  const otherRows = Object.entries(counts)
    .filter(([id]) => id !== 'all')
    .map(([id, count]) => ({ id, label: KAKAO_CATEGORY_LABELS[id], count }))
    .sort((a, b) => b.count - a.count);
  const rows = [allRow, ...otherRows];

  if (subscribers.length === 0) {
    container.innerHTML = `<div class="help-text">아직 신청자가 없습니다.</div>`;
    return;
  }

  const maxVal = Math.max(1, ...rows.map(r => r.count));
  const barH = 20;
  const rowH = 32;
  const labelW = 70;
  const valueW = 36;
  const chartW = 360;
  const svgH = rows.length * rowH;

  const bars = rows.map((r, i) => {
    const y = i * rowH + (rowH - barH) / 2;
    const w = Math.max(Math.round((r.count / maxVal) * chartW), r.count > 0 ? 3 : 0);
    return `
      <g>
        <title>${r.label}: ${r.count.toLocaleString('ko-KR')}명</title>
        <text x="${labelW - 8}" y="${y + barH / 2 + 4}" font-size="11" text-anchor="end" fill="var(--admin-text-secondary)">${r.label}</text>
        <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" fill="${KAKAO_CATEGORY_COLORS[r.id] || '#b8860b'}" rx="4"></rect>
        <text x="${labelW + w + 8}" y="${y + barH / 2 + 4}" font-size="11" fill="var(--admin-text-secondary)">${r.count.toLocaleString('ko-KR')}</text>
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg width="${labelW + chartW + valueW}" height="${svgH}" viewBox="0 0 ${labelW + chartW + valueW} ${svgH}" style="min-width: 100%;">
      ${bars}
    </svg>
  `;
}

function renderKakaoTrendChart(subscribers) {
  const container = document.getElementById("kakao-trend-chart-container");
  if (!container) return;

  const days = 14;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ key: d.toISOString().slice(0, 10), label: `${d.getMonth() + 1}/${d.getDate()}`, count: 0 });
  }
  const bucketByKey = {};
  buckets.forEach(b => { bucketByKey[b.key] = b; });

  subscribers.forEach(s => {
    const key = (s.subscribedAt || '').slice(0, 10);
    const bucket = bucketByKey[key];
    if (bucket) bucket.count += 1;
  });

  if (buckets.every(b => b.count === 0)) {
    container.innerHTML = `<div class="help-text">최근 14일간 신규 신청자가 없습니다.</div>`;
    return;
  }

  const maxVal = Math.max(1, ...buckets.map(b => b.count));
  const chartHeight = 140;
  const topPad = 18;
  const barGroupWidth = 36;
  const barWidth = 20;
  const svgWidth = buckets.length * barGroupWidth;

  const bars = buckets.map((b, i) => {
    const x = i * barGroupWidth;
    const h = Math.round((b.count / maxVal) * chartHeight);
    const y = topPad + chartHeight - h;
    const label = b.count > 0
      ? `<text x="${x + 8 + barWidth / 2}" y="${Math.max(y - 5, 10)}" font-size="10" text-anchor="middle" fill="var(--admin-text-secondary)">${b.count}</text>`
      : '';
    return `
      <g>
        <title>${b.label}: 신규 신청 ${b.count}명</title>
        <rect x="${x + 8}" y="${y}" width="${barWidth}" height="${Math.max(h, 1)}" fill="#b8860b" rx="2"></rect>
        ${label}
      </g>
      <text x="${x + barGroupWidth / 2}" y="${topPad + chartHeight + 18}" font-size="10" text-anchor="middle" fill="var(--admin-text-muted)">${b.label}</text>
    `;
  }).join('');

  container.innerHTML = `
    <svg width="${svgWidth}" height="${topPad + chartHeight + 30}" viewBox="0 0 ${svgWidth} ${topPad + chartHeight + 30}" style="min-width: 100%;">
      ${bars}
    </svg>
  `;
}

// js/main.js의 KAKAO_CATEGORY_OPTIONS와 동일한 라벨 -- 관리자 페이지는
// js/main.js를 로드하지 않는 별개 앱이라 여기 따로 둔다 (admin.js/api/*.js
// 사이에서 이미 쓰이는 상수 중복 패턴과 동일).
const KAKAO_CATEGORY_LABELS = {
  all: '모두', politics: '정치', economy: '경제', stock: '주식', world: '국제',
  society: '사회', culture: '문화·연예', sports: '스포츠', tech: 'IT·과학'
};

function formatKakaoSubscriberCategories(categories) {
  const list = (categories && categories.length > 0) ? categories : ['all'];
  return list.map(id => KAKAO_CATEGORY_LABELS[id] || id).join(', ');
}

function renderKakaoSubscribersList(subscribers) {
  const tbody = document.getElementById("kakao-subscribers-list");
  if (!tbody) return;

  if (subscribers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--admin-text-muted); padding: 20px 0;">아직 신청자가 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = subscribers.map(s => `
    <tr>
      <td>${s.phone}</td>
      <td>${formatKakaoSubscriberCategories(s.categories)}</td>
      <td style="white-space: nowrap;">${s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString("ko-KR") : ''}</td>
      <td><a onclick="deleteKakaoSubscriberRow(${s.id})" style="color: var(--status-review); cursor: pointer;">삭제</a></td>
    </tr>
  `).join('');
}

async function deleteKakaoSubscriberRow(id) {
  if (!confirm("이 신청자를 목록에서 삭제하시겠습니까?")) return;
  await window.SupabaseAdapter.deleteKakaoSubscriber(id);
  await renderKakaoSubscriberBriefing();
}

async function copyKakaoPhoneList() {
  const subscribers = await window.SupabaseAdapter.fetchKakaoSubscribers();
  if (subscribers.length === 0) {
    alert("복사할 전화번호가 없습니다.");
    return;
  }
  const text = subscribers.map(s => s.phone).join(', ');
  try {
    await navigator.clipboard.writeText(text);
    alert(`신청자 전화번호 ${subscribers.length}건을 클립보드에 복사했습니다.`);
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
  }
}

// ==========================================
// 비용 관리 (법인카드 지출) -- unlike the subscriber lists, these are
// admin-entered financial records with no meaningful "empty" fallback, so
// save/delete failures alert instead of failing silently (same principle
// applied to shorts media and article-save this session).
// ==========================================
let expensesCache = [];
let expenseReportMonthOffset = 0; // 0 = current month, negative = past months

async function renderExpensesTab() {
  expensesCache = await window.SupabaseAdapter.fetchExpenses();
  renderRecurringExpensesBox();
  renderExpenseLedgerList();
  expenseReportMonthOffset = 0;
  renderExpenseMonthlyReport();

  const dateEl = document.getElementById("expense-date");
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
}

function switchLetterSubTab(key, btnEl) {
  document.querySelectorAll(".letter-subtab-btn").forEach(btn => {
    btn.classList.remove("btn-admin-primary");
    btn.classList.add("btn-admin-secondary");
  });
  if (btnEl) {
    btnEl.classList.remove("btn-admin-secondary");
    btnEl.classList.add("btn-admin-primary");
  }
  document.querySelectorAll(".letter-subtab-content").forEach(el => { el.style.display = "none"; });
  const target = document.getElementById("letter-subtab-" + key);
  if (target) target.style.display = "block";

  // 카카오 서브탭을 열 때마다 카테고리별 변형 목록을 최신 상태로 불러온다
  // (다른 관리자가 방금 생성했거나, 크론이 자동 실행됐을 수 있으므로).
  if (key === 'kakao') renderKakaoBriefingVariantsList();
}

function switchSnsSubTab(key, btnEl) {
  document.querySelectorAll(".sns-subtab-btn").forEach(btn => {
    btn.classList.remove("btn-admin-primary");
    btn.classList.add("btn-admin-secondary");
  });
  if (btnEl) {
    btnEl.classList.remove("btn-admin-secondary");
    btnEl.classList.add("btn-admin-primary");
  }
  document.querySelectorAll(".sns-subtab-content").forEach(el => { el.style.display = "none"; });
  const target = document.getElementById("sns-subtab-" + key);
  if (target) target.style.display = "block";
}

function switchExpenseSubTab(key, btnEl) {
  document.querySelectorAll(".expense-subtab-btn").forEach(btn => {
    btn.classList.remove("btn-admin-primary");
    btn.classList.add("btn-admin-secondary");
  });
  if (btnEl) {
    btnEl.classList.remove("btn-admin-secondary");
    btnEl.classList.add("btn-admin-primary");
  }
  document.querySelectorAll(".expense-subtab-content").forEach(el => { el.style.display = "none"; });
  const target = document.getElementById("expense-subtab-" + key);
  if (target) target.style.display = "block";
}

// De-dupes by item name, keeping only the latest entry -- an admin logging
// "노션 구독" as a new ledger row every month it renews shouldn't make the
// same subscription show up multiple times in this at-a-glance box.
function renderRecurringExpensesBox() {
  const box = document.getElementById("expense-recurring-box");
  const totalEl = document.getElementById("expense-recurring-total");
  if (!box) return;

  const recurring = expensesCache.filter(e => e.isRecurring);
  if (recurring.length === 0) {
    box.innerHTML = '<div class="help-text">등록된 월정액 항목이 없습니다. 아래 "지출 내역"에서 등록 시 "매달 반복되는 월정액 비용"에 체크하세요.</div>';
    if (totalEl) totalEl.textContent = "0원 / 월";
    return;
  }

  const latestByName = new Map();
  recurring.forEach(e => {
    const existing = latestByName.get(e.itemName);
    if (!existing || e.expenseDate > existing.expenseDate) latestByName.set(e.itemName, e);
  });
  const items = [...latestByName.values()].sort((a, b) => b.amount - a.amount);
  const total = items.reduce((sum, e) => sum + e.amount, 0);

  if (totalEl) totalEl.textContent = `${total.toLocaleString('ko-KR')}원 / 월`;
  box.innerHTML = items.map(e => `
    <div style="background: var(--admin-bg-body); border:1px solid var(--admin-border); border-radius:6px; padding:8px 12px; font-size:0.8rem; white-space:nowrap;">
      <strong>${e.itemName}</strong> · ${e.amount.toLocaleString('ko-KR')}원
    </div>
  `).join('');
}

function renderExpenseLedgerList() {
  const tbody = document.getElementById("expense-ledger-list");
  const totalEl = document.getElementById("expense-ledger-total");
  if (!tbody) return;

  const total = expensesCache.reduce((sum, e) => sum + e.amount, 0);
  if (totalEl) totalEl.textContent = `${total.toLocaleString('ko-KR')}원`;

  if (expensesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="help-text" style="text-align:center;">등록된 지출 내역이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = expensesCache.map(e => `
    <tr data-expense-id="${e.id}">
      <td>${e.expenseDate}</td>
      <td>${e.itemName}</td>
      <td>${e.category}</td>
      <td>${e.amount.toLocaleString('ko-KR')}원</td>
      <td>${e.isRecurring ? '✔' : ''}</td>
      <td>${e.memo || ''}</td>
      <td>${e.receiptUrl ? `<a href="${e.receiptUrl}" target="_blank" rel="noopener">보기</a>` : ''}</td>
      <td style="white-space:nowrap;">
        <a onclick="editExpenseRow(${e.id})" style="cursor: pointer;">편집</a> ·
        <a onclick="deleteExpenseRow(${e.id})" style="color: var(--status-review); cursor: pointer;">삭제</a>
      </td>
    </tr>
  `).join('');
}

const EXPENSE_CATEGORY_OPTIONS = ['구독료', '데이터/통신비', '서버·호스팅비', '사무용품비', '교통비', '식비/접대비', '광고·마케팅비', '도서·자료구입비', '소모품비', '기타'];

// Turns one ledger row into inline inputs pre-filled with its current
// values, instead of a separate modal -- the table already has the right
// columns, so reusing them keeps this to one row's worth of DOM change.
function editExpenseRow(id) {
  const e = expensesCache.find(x => x.id === id);
  const row = document.querySelector(`#expense-ledger-list tr[data-expense-id="${id}"]`);
  if (!e || !row) return;

  const esc = (s) => (s || '').replace(/"/g, '&quot;');

  row.innerHTML = `
    <td><input type="date" id="edit-expense-date-${id}" class="form-control-admin" style="padding:4px;" value="${e.expenseDate}"></td>
    <td><input type="text" id="edit-expense-item-${id}" class="form-control-admin" style="padding:4px;" value="${esc(e.itemName)}"></td>
    <td>
      <select id="edit-expense-category-${id}" class="form-control-admin" style="padding:4px;">
        ${EXPENSE_CATEGORY_OPTIONS.map(c => `<option value="${c}" ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </td>
    <td><input type="number" id="edit-expense-amount-${id}" class="form-control-admin" style="padding:4px; width:100px;" min="0" step="1" value="${e.amount}"></td>
    <td style="text-align:center;"><input type="checkbox" id="edit-expense-recurring-${id}" ${e.isRecurring ? 'checked' : ''}></td>
    <td><input type="text" id="edit-expense-memo-${id}" class="form-control-admin" style="padding:4px;" value="${esc(e.memo)}"></td>
    <td>
      <input type="file" id="edit-expense-receipt-${id}" accept="image/*,application/pdf" style="width:110px; font-size:0.72rem;">
      ${e.receiptUrl ? `<div style="font-size:0.7rem; margin-top:2px;"><a href="${e.receiptUrl}" target="_blank" rel="noopener">기존 파일</a></div>` : ''}
    </td>
    <td style="white-space:nowrap;">
      <a onclick="saveExpenseEdit(${id})" style="color: var(--admin-accent-cyan); cursor: pointer;">저장</a> ·
      <a onclick="renderExpenseLedgerList()" style="cursor: pointer;">취소</a>
    </td>
  `;
}

async function saveExpenseEdit(id) {
  const e = expensesCache.find(x => x.id === id);
  if (!e) return;

  const itemName = document.getElementById(`edit-expense-item-${id}`).value.trim();
  const category = document.getElementById(`edit-expense-category-${id}`).value;
  const amount = Number(document.getElementById(`edit-expense-amount-${id}`).value);
  const expenseDate = document.getElementById(`edit-expense-date-${id}`).value;
  const isRecurring = document.getElementById(`edit-expense-recurring-${id}`).checked;
  const memo = document.getElementById(`edit-expense-memo-${id}`).value.trim();
  const receiptFile = document.getElementById(`edit-expense-receipt-${id}`).files[0] || null;

  if (!itemName || !amount || !expenseDate) {
    alert("항목명, 금액, 결제일을 모두 입력해 주세요.");
    return;
  }

  try {
    let receiptUrl = e.receiptUrl;
    if (receiptFile) {
      receiptUrl = await uploadImageToStorage(receiptFile, null, 'receipt');
    }
    await window.SupabaseAdapter.updateExpense(id, { category, itemName, amount, expenseDate, isRecurring, memo, receiptUrl });
    await renderExpensesTab();
  } catch (err) {
    console.error("지출 수정 실패:", err);
    alert("⚠ 수정에 실패했습니다 (저장되지 않았습니다): " + err.message);
  }
}

async function submitExpenseForm(event) {
  event.preventDefault();
  const category = document.getElementById("expense-category").value;
  const itemName = document.getElementById("expense-item-name").value.trim();
  const amount = Number(document.getElementById("expense-amount").value);
  const expenseDate = document.getElementById("expense-date").value;
  const memo = document.getElementById("expense-memo").value.trim();
  const isRecurring = document.getElementById("expense-recurring").checked;
  const receiptFile = document.getElementById("expense-receipt").files[0] || null;

  if (!itemName || !amount || !expenseDate) {
    alert("항목명, 금액, 결제일을 모두 입력해 주세요.");
    return;
  }

  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "등록 중..."; }
  try {
    let receiptUrl = '';
    if (receiptFile) {
      if (submitBtn) submitBtn.textContent = "영수증 업로드 중...";
      // PDFs pass straight through (resizeAndCompressImage rejects on a
      // non-image and uploadImageToStorage falls back to the raw file);
      // image receipts get the same downscale/recompress as article images.
      receiptUrl = await uploadImageToStorage(receiptFile, null, 'receipt');
      if (submitBtn) submitBtn.textContent = "등록 중...";
    }
    await window.SupabaseAdapter.saveExpense({ category, itemName, amount, expenseDate, isRecurring, memo, receiptUrl });
    event.target.reset();
    document.getElementById("expense-date").value = new Date().toISOString().slice(0, 10);
    await renderExpensesTab();
    alert("지출이 등록되었습니다.");
  } catch (err) {
    console.error("지출 등록 실패:", err);
    alert("⚠ 지출 등록에 실패했습니다 (저장되지 않았습니다): " + err.message);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "지출 등록"; }
  }
}

async function deleteExpenseRow(id) {
  if (!confirm("이 지출 내역을 삭제하시겠습니까?")) return;
  try {
    await window.SupabaseAdapter.deleteExpense(id);
    await renderExpensesTab();
  } catch (err) {
    console.error("지출 삭제 실패:", err);
    alert("⚠ 삭제에 실패했습니다: " + err.message);
  }
}

function changeExpenseReportMonth(delta) {
  expenseReportMonthOffset += delta;
  if (expenseReportMonthOffset > 0) expenseReportMonthOffset = 0; // never into the future
  renderExpenseMonthlyReport();
}

// Compares "YYYY-MM" string prefixes rather than Date objects on purpose --
// parsing a plain "YYYY-MM-DD" string with `new Date()` reads it as UTC
// midnight, which can shift into the wrong local month depending on the
// browser's timezone. String comparison sidesteps that entirely.
function renderExpenseMonthlyReport() {
  const labelEl = document.getElementById("expense-report-month-label");
  const totalEl = document.getElementById("expense-report-total");
  const trendEl = document.getElementById("expense-report-total-trend");
  const recurringEl = document.getElementById("expense-report-recurring");
  const countEl = document.getElementById("expense-report-count");
  const breakdownEl = document.getElementById("expense-report-breakdown");
  const listEl = document.getElementById("expense-report-list");
  if (!labelEl) return;

  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + expenseReportMonthOffset; // 0-indexed, can go negative/over 11
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
  labelEl.textContent = `${y}년 ${m + 1}월`;

  const monthItems = expensesCache.filter(e => e.expenseDate && e.expenseDate.slice(0, 7) === monthKey);
  const total = monthItems.reduce((sum, e) => sum + e.amount, 0);
  const recurringTotal = monthItems.filter(e => e.isRecurring).reduce((sum, e) => sum + e.amount, 0);

  let py = m - 1, pyYear = y;
  if (py < 0) { py = 11; pyYear -= 1; }
  const prevMonthKey = `${pyYear}-${String(py + 1).padStart(2, '0')}`;
  const prevTotal = expensesCache
    .filter(e => e.expenseDate && e.expenseDate.slice(0, 7) === prevMonthKey)
    .reduce((sum, e) => sum + e.amount, 0);

  totalEl.textContent = `${total.toLocaleString('ko-KR')}원`;
  recurringEl.textContent = `${recurringTotal.toLocaleString('ko-KR')}원`;
  countEl.textContent = `${monthItems.length}건`;

  if (prevTotal > 0) {
    const diffPct = Math.round(((total - prevTotal) / prevTotal) * 100);
    trendEl.textContent = diffPct === 0 ? "전월과 동일" : (diffPct > 0 ? `전월 대비 ▲${diffPct}%` : `전월 대비 ▼${Math.abs(diffPct)}%`);
  } else {
    trendEl.textContent = "전월 데이터 없음";
  }

  const byCategory = {};
  monthItems.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
  const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  if (categories.length === 0) {
    breakdownEl.innerHTML = '<div class="help-text">이 달의 지출 내역이 없습니다.</div>';
  } else {
    const maxAmount = categories[0][1];
    breakdownEl.innerHTML = categories.map(([cat, amt]) => {
      const barPct = Math.round((amt / maxAmount) * 100);
      const sharePct = total > 0 ? Math.round((amt / total) * 100) : 0;
      return `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
            <span>${cat}</span>
            <span>${amt.toLocaleString('ko-KR')}원 (${sharePct}%)</span>
          </div>
          <div style="background: var(--admin-bg-body); border-radius:4px; height:8px; overflow:hidden;">
            <div style="background: var(--admin-accent-cyan); height:100%; width:${barPct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (monthItems.length === 0) {
    listEl.innerHTML = '<tr><td colspan="5" class="help-text" style="text-align:center;">이 달의 지출 내역이 없습니다.</td></tr>';
  } else {
    listEl.innerHTML = monthItems.map(e => `
      <tr>
        <td>${e.expenseDate}</td>
        <td>${e.itemName}</td>
        <td>${e.category}</td>
        <td>${e.amount.toLocaleString('ko-KR')}원</td>
        <td>${e.memo || ''}</td>
      </tr>
    `).join('');
  }
}

// Loads today's saved draft (admin's slot edits persist across refresh for the
// same day via localStorage) or builds a fresh one the first time today.
async function loadOrGenerateNewsletterDraft() {
  const key = `baikal_newsletter_draft_${todayDateKey()}`;
  const saved = localStorage.getItem(key);
  const articles = await window.SupabaseAdapter.fetchArticles();
  newsletterArticlesCache = articles;

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Drop any slot referencing an article that's since been deleted.
      parsed.latestIds = (parsed.latestIds || []).filter(id => articles.some(a => a.id === id));
      parsed.popularIds = (parsed.popularIds || []).filter(id => articles.some(a => a.id === id));
      newsletterDraft = parsed;
      renderNewsletterDraftUI();
      return;
    } catch (err) {
      console.warn("저장된 뉴스레터 초안 파싱 실패, 새로 생성합니다:", err);
    }
  }

  buildFreshNewsletterDraft(articles);
}

function buildFreshNewsletterDraft(articles) {
  const published = articles.filter(a => a.status === 'published');

  const byDateDesc = published.slice().sort((a, b) => {
    const dateDiff = parseKoreanDate(b.date) - parseKoreanDate(a.date);
    if (dateDiff !== 0) return dateDiff;
    const aTime = new Date(a.approvedAt || a.scheduledAt || 0).getTime() || 0;
    const bTime = new Date(b.approvedAt || b.scheduledAt || 0).getTime() || 0;
    return bTime - aTime;
  });
  const latestIds = byDateDesc.slice(0, 3).map(a => a.id);

  const byViewsDesc = published
    .filter(a => !latestIds.includes(a.id))
    .slice()
    .sort((a, b) => (b.views || 0) - (a.views || 0));
  const popularIds = byViewsDesc.slice(0, 3).map(a => a.id);

  newsletterDraft = { date: todayDateKey(), latestIds, popularIds };
  persistNewsletterDraft();
  renderNewsletterDraftUI();
}

function persistNewsletterDraft() {
  localStorage.setItem(`baikal_newsletter_draft_${todayDateKey()}`, JSON.stringify(newsletterDraft));
}

async function regenerateNewsletterDraft() {
  if (!confirm("현재 구성을 지우고 새로 생성하시겠습니까? 지금까지 편집한 내용은 사라집니다.")) return;
  const articles = await window.SupabaseAdapter.fetchArticles();
  newsletterArticlesCache = articles;
  buildFreshNewsletterDraft(articles);
}

function findNewsletterArticleById(id) {
  return newsletterArticlesCache.find(a => a.id === id);
}

// ==========================================
// 3분 뉴스 브리핑 -- 웹사이트 게시용 (briefing.html 아카이브). 카카오
// 알림톡용 변수(650자 제한)와는 완전히 별개로 생성되는, 더 길고 자세한
// 글이다. Naver 화제 뉴스를 소스로 쓰는 것은 동일하지만 글자수 상한이
// 없고, 초안은 로컬에 두었다가 "웹사이트에 게시" 버튼을 눌러야만
// news_briefings 테이블에 반영되어 공개 페이지에 노출된다.
// ==========================================
let webBriefingDraft = null; // { date: 'YYYY-MM-DD', title: '...', content: '...', status: 'draft'|'published' }

// Own busy banner (separate element from kakao-briefing-busy-banner) since
// "+ 3분 뉴스 브리핑" is now its own sidebar tab, not nested inside 기사
// 레터 발송 -- a banner living in a hidden sibling tab's DOM wouldn't be
// visible while this tab is active.
function setWebBriefingBusy(active, text) {
  const banner = document.getElementById("web-briefing-busy-banner");
  const textEl = document.getElementById("web-briefing-busy-text");
  if (textEl && text) textEl.textContent = text;
  if (banner) banner.classList.toggle("is-active", active);
}

function webBriefingStorageKey() {
  return `baikal_web_briefing_${todayDateKey()}`;
}

// Checks Supabase first (not just localStorage) so this device picks up
// today's draft even if it was created elsewhere -- either the 8am cron,
// or "오늘의 브리핑 생성" clicked from a different admin browser. Falls
// back to localStorage only if Supabase has nothing yet (e.g. offline).
async function loadOrGenerateWebBriefing() {
  const today = todayDateKey();
  if (window.SupabaseAdapter && window.SupabaseAdapter.isConfigured()) {
    try {
      const remote = await window.SupabaseAdapter.fetchNewsBriefingByDate(today);
      if (remote) {
        webBriefingDraft = remote;
        persistWebBriefingDraft();
        renderWebBriefingUI();
        return;
      }
    } catch (err) {
      console.warn("오늘 브리핑 원격 조회 실패, 로컬 저장본으로 대체합니다:", err);
    }
  }

  const saved = localStorage.getItem(webBriefingStorageKey());
  if (saved) {
    try {
      webBriefingDraft = JSON.parse(saved);
      renderWebBriefingUI();
      return;
    } catch (err) {
      console.warn("저장된 웹 브리핑 파싱 실패, 새로 생성이 필요합니다:", err);
    }
  }
  webBriefingDraft = null;
  renderWebBriefingUI();
}

function persistWebBriefingDraft() {
  if (!webBriefingDraft) return;
  localStorage.setItem(webBriefingStorageKey(), JSON.stringify(webBriefingDraft));
}

function renderWebBriefingUI() {
  const titleEl = document.getElementById("web-briefing-title");
  const textEl = document.getElementById("web-briefing-content");
  const statusEl = document.getElementById("web-briefing-status");
  if (!textEl) return;
  if (webBriefingDraft && webBriefingDraft.content) {
    if (titleEl) titleEl.value = webBriefingDraft.title || '';
    textEl.value = webBriefingDraft.content;
    if (statusEl) {
      const publishedNote = webBriefingDraft.status === 'published'
        ? '웹사이트에 게시됨 (매일 아침 8시 자동 생성/게시분일 수 있습니다)'
        : '초안 상태 -- 아직 웹사이트에 게시되지 않았습니다. "오늘의 브리핑 생성" 버튼으로 직접 만든 초안이니, 검토 후 게시해 주세요.';
      statusEl.textContent = `${webBriefingDraft.date} 기준 (${webBriefingDraft.content.length}자) -- ${publishedNote}`;
    }
  } else {
    if (titleEl) titleEl.value = '';
    textEl.value = '';
    if (statusEl) statusEl.textContent = '아직 생성된 브리핑이 없습니다. "오늘의 브리핑 생성" 버튼을 눌러주세요.';
  }
}

function syncWebBriefingEdit() {
  const title = document.getElementById("web-briefing-title").value;
  const content = document.getElementById("web-briefing-content").value;
  const prevStatus = (webBriefingDraft && webBriefingDraft.status) || 'draft';
  webBriefingDraft = { date: todayDateKey(), title, content, status: prevStatus };
  persistWebBriefingDraft();
  const statusEl = document.getElementById("web-briefing-status");
  if (statusEl) {
    const publishedNote = prevStatus === 'published' ? '웹사이트에 게시됨 (수정 후 다시 게시해야 반영됩니다)' : '초안 상태 -- 아직 웹사이트에 게시되지 않았습니다.';
    statusEl.textContent = `${webBriefingDraft.date} 기준 (${content.length}자) -- ${publishedNote}`;
  }
}

// AI가 지침을 어기고 "독자 여러분, 안녕하십니까..." 같은 인사말/도입
// 문장을 첫 줄에 슬쩍 넣는 경우에 대비한 방어적 백스톱 -- 프롬프트
// 지시만으로는 100% 보장되지 않으므로, 첫 줄이 "▩ "로 시작하지 않고
// 인사말처럼 보이면 그 줄(문단)을 통째로 잘라낸다.
function stripLeakedWebBriefingGreeting(text) {
  const lines = text.split('\n');
  if (lines.length === 0) return text;
  const firstLine = lines[0].trim();
  if (firstLine.startsWith('▩')) return text;

  const looksLikeGreeting = /안녕하십니까|독자 여러분|반갑습니다|찾아뵙|전달해 드립니다|브리핑입니다/.test(firstLine);
  if (!looksLikeGreeting) return text;

  // 인사말 문단(첫 번째 빈 줄 전까지) 전체를 제거하고, 그 다음부터 시작한다.
  const blankIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '');
  const rest = blankIdx === -1 ? [] : lines.slice(blankIdx + 1);
  return rest.join('\n').replace(/^\n+/, '');
}

async function generateWebBriefing() {
  const btn = document.getElementById("web-briefing-generate-btn");
  const statusEl = document.getElementById("web-briefing-status");
  if (webBriefingDraft && webBriefingDraft.content) {
    if (!confirm("이미 작성된 오늘의 브리핑이 있습니다. 새로 생성하면 지금까지 수정한 내용은 사라집니다. 계속하시겠습니까?")) return;
  }

  if (btn) btn.disabled = true;
  setWebBriefingBusy(true, "네이버 화제 뉴스 불러오는 중...");
  try {
    const trending = await fetchNaverTrending();
    if (trending.length === 0) throw new Error("오늘의 화제 뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");

    const newsListText = trending.slice(0, 30).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
    const todayLabel = new Date().toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    const prompt = `
아래는 오늘(${todayLabel}) 네이버 랭킹 뉴스 기준 화제가 된 뉴스 제목 목록입니다. 이를 바탕으로 바이칼 뉴스 웹사이트에 게시할 "3분 뉴스 브리핑" 글을 작성하십시오. 이것은 카카오톡 알림톡처럼 글자수 제한이 있는 짧은 글이 아니라, 웹페이지에 그대로 게시되는 정식 기사 형태의 글입니다.

[오늘의 화제 뉴스 제목 목록]
${newsListText}

[작성 지침]
- 전체를 천천히 읽어도 3분 정도(공백 포함 2,600~3,600자 정도)에 읽을 수 있는 분량으로 작성하십시오.
- 오늘의 주요 뉴스를 18~22개 정도 선별하십시오 (적은 소식을 길게 쓰기보다, 많은 소식을 짧고 간결하게 다루는 것이 목표입니다).
- 각 뉴스 항목은 반드시 "▩ "로 시작하는 소제목 한 줄을 쓰고, 그 다음 줄에 설명을 1문장(최대 2문장)으로 짧게 압축해 작성하십시오. "▩ "는 웹사이트에서 굵게 강조되어 표시되므로 반드시 포함해야 합니다.
- 각 항목의 설명 문장은 "~습니다/합니다" 같은 정중체가 아니라, 뉴스 속보에서 쓰는 간결한 "음슴체"로 끝내십시오 (예: "발견되었습니다" → "발견됨", "결정했습니다" → "결정함", "확인됐습니다" → "확인됨", "발표했습니다" → "발표함"). 제목만으로 알 수 없는 내용은 추측하지 말고, 명백한 사실 위주로 작성하십시오.
- 각 항목 사이에는 빈 줄을 하나씩 넣어 구분하십시오.
- 광고성 문구나 특정 상품·서비스 홍보는 포함하지 마십시오.
- 마크다운 문법(#, **, - 등)은 사용하지 마십시오. "▩ "와 줄바꿈만으로 구조를 표현하십시오.
- (매우 중요) "독자 여러분, 안녕하십니까" 같은 인사말이나 도입 문장, 마무리 인사를 절대 넣지 마십시오. 첫 줄부터 바로 "▩ "로 시작하는 첫 번째 뉴스 항목으로 시작하십시오.
- 글 전체의 제목이 될 한 줄을 가장 먼저 "[제목] " 접두사와 함께 작성하십시오 (예: "[제목] 7월 29일, 오늘의 3분 뉴스"). 이 줄 다음에 바로 뉴스 항목들을 이어가십시오.
- 다른 설명 없이, 제목 줄과 본문만 출력하십시오.`;

    const systemInstruction = "당신은 바이칼 뉴스 웹사이트의 '3분 뉴스 브리핑' 코너를 작성하는 뉴스 큐레이터입니다. 인사말이나 도입 문장 없이 뉴스 항목으로 바로 시작하며, 각 뉴스 항목은 '▩ ' 소제목과 음슴체로 끝나는 짧은 설명으로 간결하게 작성하고, 사실 전달에만 집중해 3분 분량의 정리 기사를 작성하십시오.";

    setWebBriefingBusy(true, "AI가 3분 브리핑 작성 중...");
    let resultText = stripLeakedWebBriefingGreeting((await callGeminiTextApi(prompt, systemInstruction)).trim());

    let title = `${todayLabel} 3분 뉴스 브리핑`;
    const titleMatch = resultText.match(/^\[제목\]\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
      resultText = stripLeakedWebBriefingGreeting(resultText.replace(/^\[제목\]\s*.+$/m, '').replace(/^\n+/, '').trim());
    }

    webBriefingDraft = { date: todayDateKey(), title, content: resultText, status: 'draft' };
    persistWebBriefingDraft();
    renderWebBriefingUI();

    // Best-effort -- so this device's manually-generated draft is visible
    // to other admin devices too (same mechanism the 8am cron uses), but a
    // save failure here shouldn't block editing/publishing from this device.
    if (window.SupabaseAdapter && window.SupabaseAdapter.isConfigured()) {
      try {
        await window.SupabaseAdapter.saveNewsBriefing(webBriefingDraft);
      } catch (saveErr) {
        console.warn("생성된 초안을 Supabase에 저장하는 데 실패했습니다 (로컬에는 저장됨):", saveErr);
      }
    }
  } catch (err) {
    console.error("웹 브리핑 생성 실패:", err);
    if (statusEl) statusEl.textContent = "생성 실패: " + err.message;
    alert("브리핑 생성 실패: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    setWebBriefingBusy(false);
  }
}

async function publishWebBriefing() {
  const title = document.getElementById("web-briefing-title").value.trim();
  const content = document.getElementById("web-briefing-content").value.trim();
  if (!title || !content) {
    alert("제목과 본문을 모두 입력해 주세요.");
    return;
  }
  if (!window.SupabaseAdapter || !window.SupabaseAdapter.isConfigured()) {
    alert("Supabase가 설정되지 않아 게시할 수 없습니다.");
    return;
  }

  const btn = document.getElementById("web-briefing-publish-btn");
  if (btn) { btn.disabled = true; btn.textContent = "게시 중..."; }
  try {
    const date = todayDateKey();
    await window.SupabaseAdapter.saveNewsBriefing({ date, title, content });
    webBriefingDraft = { date, title, content };
    persistWebBriefingDraft();
    const statusEl = document.getElementById("web-briefing-status");
    if (statusEl) statusEl.textContent = `${date} 브리핑이 웹사이트에 게시되었습니다. (${content.length}자)`;
    alert("웹사이트에 게시되었습니다.");
  } catch (err) {
    console.error("웹 브리핑 게시 실패:", err);
    alert("게시 실패: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "웹사이트에 게시"; }
  }
}

// ==========================================
// 카카오 3분 브리핑 -- draft-generation + review only. Actual sending is
// manual: the admin copies this text into the Kakao Channel Admin Center's
// own message composer and uses its 예약 발송 (scheduled send) to fire at
// 8am, since true API-based automated sending requires a paid Bizmessage
// vendor (Aligo/Solapi/etc), not something set up yet. Content comes from
// Naver's trending news (reusing fetchNaverTrending(), already built for
// the AI 집필실), not our own articles -- this is meant to be a general
// daily news digest, not a promo for our own coverage.
// ==========================================
let kakaoBriefingDraft = null; // { date: 'YYYY-MM-DD', content: '...' }

function kakaoBriefingStorageKey() {
  return `baikal_kakao_briefing_${todayDateKey()}`;
}

// Send-mode toggle -- Aligo 연동 완료 후에는 실제 자동 발송 여부를 가르는
// 진짜 스위치다 (api/send-kakao-briefing.js 크론이 매일 8시 15분에 이 값을
// app_settings에서 읽어 'auto'일 때만 발송함). localStorage는 즉시 반영되는
// 로컬 캐시/오프라인 대비용일 뿐, 실제 기준값은 Supabase의 app_settings
// 테이블 -- 여러 관리자 기기 간에 이 설정이 어긋나면 "발송될 줄 알았는데
// 안 됐다" 같은 사고로 이어지므로 서버 값을 진실의 원천으로 둔다.
function getKakaoSendMode() {
  return localStorage.getItem('baikal_kakao_send_mode') || 'manual';
}

async function setKakaoSendMode(mode) {
  localStorage.setItem('baikal_kakao_send_mode', mode);
  renderKakaoSendModeUI();
  if (window.SupabaseAdapter && window.SupabaseAdapter.isConfigured()) {
    try {
      await window.SupabaseAdapter.setAppSetting('kakao_send_mode', mode);
    } catch (err) {
      console.error("발송 방식 서버 저장 실패 (로컬에는 반영됨):", err);
      alert("발송 방식이 이 기기에는 반영되었지만, 서버 저장에 실패했습니다: " + err.message);
    }
  }
}

// 탭을 열 때 서버(app_settings)의 실제 값으로 로컬 캐시를 맞춘다 -- 다른
// 관리자 기기에서 바꾼 설정도 여기서 반영되도록.
async function loadKakaoSendModeFromServer() {
  if (!window.SupabaseAdapter || !window.SupabaseAdapter.isConfigured()) return;
  try {
    const serverMode = await window.SupabaseAdapter.getAppSetting('kakao_send_mode');
    if (serverMode === 'manual' || serverMode === 'auto') {
      localStorage.setItem('baikal_kakao_send_mode', serverMode);
      renderKakaoSendModeUI();
    }
  } catch (err) {
    console.warn("발송 방식 서버 조회 실패, 로컬 값 유지:", err);
  }
}

function renderKakaoSendModeUI() {
  const mode = getKakaoSendMode();
  const badge = document.getElementById('kakao-send-mode-badge');
  const descEl = document.getElementById('kakao-send-mode-desc');
  if (!badge) return;

  document.querySelectorAll('.kakao-mode-btn').forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('btn-admin-orange', isActive);
    btn.classList.toggle('btn-admin-secondary', !isActive);
    btn.disabled = isActive;
  });

  if (mode === 'auto') {
    badge.textContent = '자동 발송 (알리고 연동)';
    badge.style.background = 'var(--color-green-deep)';
    badge.style.color = '#ffffff';
    if (descEl) {
      descEl.innerHTML = '매일 오전 8시 15분, 알리고 API를 통해 신청자 전체에게 자동으로 발송됩니다 (오전 8시에 브리핑 내용이 먼저 자동 생성된 뒤 발송). <strong style="color: var(--status-review);">⚠ 실제로 발송되는 모드이니, 발송 전에 반드시 아래 내용을 검토해 주세요.</strong>';
    }
  } else {
    badge.textContent = '수동 발송';
    badge.style.background = 'var(--admin-accent-cyan)';
    badge.style.color = '#0b1a30';
    if (descEl) {
      descEl.textContent = '관리자가 매일 아래 내용을 "본문 복사"로 복사해, 카카오톡 채널 관리자센터에 직접 붙여넣고 오전 8시로 예약 발송합니다. 지금은 이 방식으로 운영 중입니다.';
    }
  }
}

// Checks Supabase first (not just localStorage) so this device picks up
// today's 카카오 초안 even if it was created elsewhere -- either the 8am
// 자동 생성 크론, or "오늘의 브리핑 생성" clicked from a different admin
// browser. Falls back to localStorage only if Supabase has nothing yet
// (mirrors loadOrGenerateWebBriefing() above).
async function loadOrGenerateKakaoBriefing() {
  const today = todayDateKey();
  if (window.SupabaseAdapter && window.SupabaseAdapter.isConfigured()) {
    try {
      const remote = await window.SupabaseAdapter.fetchNewsBriefingByDate(today);
      if (remote && remote.kakaoContent) {
        kakaoBriefingDraft = { date: today, content: remote.kakaoContent };
        persistKakaoBriefingDraft();
        renderKakaoBriefingUI();
        return;
      }
    } catch (err) {
      console.warn("오늘 카카오 브리핑 원격 조회 실패, 로컬 저장본으로 대체합니다:", err);
    }
  }

  const saved = localStorage.getItem(kakaoBriefingStorageKey());
  if (saved) {
    try {
      kakaoBriefingDraft = JSON.parse(saved);
      renderKakaoBriefingUI();
      return;
    } catch (err) {
      console.warn("저장된 카카오 브리핑 파싱 실패, 새로 생성이 필요합니다:", err);
    }
  }
  kakaoBriefingDraft = null;
  renderKakaoBriefingUI();
}

function persistKakaoBriefingDraft() {
  if (!kakaoBriefingDraft) return;
  localStorage.setItem(kakaoBriefingStorageKey(), JSON.stringify(kakaoBriefingDraft));
}

function renderKakaoBriefingCharCount(content) {
  const statusEl = document.getElementById("kakao-briefing-status");
  if (!statusEl) return;
  const len = content.length;
  const over = len > KAKAO_BRIEFING_CHAR_LIMIT;
  statusEl.innerHTML = `${kakaoBriefingDraft.date} 기준 초안 (글자 수: <strong style="color: ${over ? 'var(--status-review)' : 'inherit'};">${len}자 / ${KAKAO_BRIEFING_CHAR_LIMIT}자</strong>)${over ? ' -- 제한 초과, 이 상태로는 발송 불가' : ''}`;
}

function renderKakaoBriefingUI() {
  const textEl = document.getElementById("kakao-briefing-content");
  const statusEl = document.getElementById("kakao-briefing-status");
  if (!textEl) return;
  if (kakaoBriefingDraft && kakaoBriefingDraft.content) {
    textEl.value = kakaoBriefingDraft.content;
    renderKakaoBriefingCharCount(kakaoBriefingDraft.content);
  } else {
    textEl.value = '';
    if (statusEl) statusEl.textContent = '아직 생성된 브리핑이 없습니다. "오늘의 브리핑 생성" 버튼을 눌러주세요.';
  }
}

function syncKakaoBriefingEdit() {
  const content = document.getElementById("kakao-briefing-content").value;
  kakaoBriefingDraft = { date: todayDateKey(), content };
  persistKakaoBriefingDraft();
  renderKakaoBriefingCharCount(content);
}

// 브랜드메시지 템플릿은 고정 문구 + 변수(#{brief}) 구조라 이 함수는 전체
// 메시지가 아니라 그 변수 자리에 들어갈 뉴스 본문만 작성한다 (인사말/구독
// 취소 안내는 승인받은 고정 템플릿 쪽에 이미 포함되어 있어 여기서 또 넣지
// 않는다 -- 알림톡(AlimTalk)에서 브랜드메시지(Brand Message)로 전환하며
// 구독취소 문구를 템플릿 쪽으로 옮김). 알림톡은 ~650자 하드 캡이 있었지만
// 브랜드메시지는 알리고 문서상 확인된 하드 캡이 없어, 아래 값은 실제 발송
// 테스트 전까지의 잠정 목표치다 -- 알리고가 실제로 받아들이는 한도가
// 다르다고 확인되면 이 두 상수만 조정하면 된다.
const KAKAO_BRIEFING_CHAR_LIMIT = 1500;
const KAKAO_BRIEFING_CHAR_TARGET_MIN = 1200; // 짧게 끝나는 것도 문제라 최소선도 둠

function setKakaoBriefingBusy(active, text) {
  const banner = document.getElementById("kakao-briefing-busy-banner");
  const textEl = document.getElementById("kakao-briefing-busy-text");
  if (textEl && text) textEl.textContent = text;
  if (banner) banner.classList.toggle("is-active", active);
}

// A few generations still slipped a "☀ 2026년 7월 27일 ... 브리핑" header line
// in despite the prompt saying not to -- this strips a leading line that
// looks like a decorative title/date header as a defensive backstop, since
// prompt instructions aren't 100% reliable on their own.
function stripLeakedKakaoBriefingHeader(text) {
  const lines = text.split('\n');
  if (lines.length > 1) {
    const firstLine = lines[0].trim();
    const looksLikeHeader = /^[☀️🌅📰🔔]/.test(firstLine) || (/브리핑/.test(firstLine) && /\d{4}년|\d+월|\d+일/.test(firstLine));
    if (looksLikeHeader) {
      return lines.slice(1).join('\n').replace(/^\n+/, '');
    }
  }
  return text;
}

async function generateKakaoBriefing() {
  const btn = document.getElementById("kakao-briefing-generate-btn");
  const statusEl = document.getElementById("kakao-briefing-status");

  // 네이버를 다시 수집하지 않고, 이미 생성해 둔 "웹사이트 게시용" 브리핑
  // 원문을 그대로 소스로 사용해 카카오 알림톡 글자수(650자)에 맞게
  // 압축·재구성한다 -- 같은 날 두 번 수집할 이유가 없고, 두 채널의
  // 내용도 서로 어긋나지 않게 된다.
  if (!webBriefingDraft || !webBriefingDraft.content) {
    alert('먼저 위 "웹사이트 게시용" 브리핑을 생성해 주세요. 카카오톡 발송용은 그 내용을 바탕으로 압축해서 만듭니다.');
    return;
  }

  if (kakaoBriefingDraft && kakaoBriefingDraft.content) {
    if (!confirm("이미 작성된 오늘의 브리핑이 있습니다. 새로 생성하면 지금까지 수정한 내용은 사라집니다. 계속하시겠습니까?")) return;
  }

  if (btn) btn.disabled = true;
  setKakaoBriefingBusy(true, "AI가 3분 브리핑 작성 중...");
  try {
    const sourceContent = webBriefingDraft.content;

    const buildPrompt = (extra) => `
아래는 오늘 바이칼 뉴스 웹사이트에 게시된 "3분 뉴스 브리핑"의 원문입니다. 같은 뉴스를 다시 수집하지 말고, 이 원문에 담긴 소식만을 바탕으로 카카오톡 "브랜드메시지"로 발송할 압축판 본문을 작성하십시오.

[웹사이트 게시용 브리핑 원문]
${sourceContent}

[작성 지침 -- 반드시 모두 지킬 것]
- (매우 중요) 원문에 담긴 모든 항목을 다 담으려 하지 마십시오. 아래 글자수 예산 안에서, 항목마다 제목만 반복하지 않고 그와 겹치지 않는 구체적인 사실(숫자·이름·장소·원인·결과 등)을 최소 하나는 반드시 넣을 수 있을 만큼만 항목을 선별하십시오. 덜 중요하거나 덜 흥미로운 항목은 과감히 제외하십시오 -- 항목 수를 줄여서라도 남긴 항목 하나하나의 정보량을 지키는 것이 항목을 다 담아 내용 없는 제목 나열이 되는 것보다 낫습니다. 원문에 없는 새로운 사실을 추가하거나 추측하지 마십시오.
- 공백 포함 ${KAKAO_BRIEFING_CHAR_TARGET_MIN}~${KAKAO_BRIEFING_CHAR_LIMIT}자 "사이"가 되도록 작성하십시오 (${KAKAO_BRIEFING_CHAR_LIMIT}자를 절대 넘기면 안 되지만, ${KAKAO_BRIEFING_CHAR_TARGET_MIN}자에 크게 못 미치게 짧게 끝내지도 마십시오).
- (매우 중요) 각 뉴스 항목은 "▩ "로 시작하십시오 (번호 대신 이 기호를 사용하십시오). "제목 줄"과 "설명 줄"을 따로 나누지 말고, 하나의 문장으로 바로 핵심 사실을 전달하십시오. 예를 들어 "▩ 밭일하던 100세 할머니 숨진 채 발견\n밭일을 하던 100세 할머니가 숨진 채 발견되었습니다." 처럼 제목을 쓰고 그 아래 줄에서 같은 내용을 다시 풀어 쓰는 방식은 같은 내용이 중복되어 글자를 낭비하므로 절대 금지합니다. 대신 "▩ 밭일하던 100세 할머니 숨진 채 발견됨, 당시 체온 42.2도로 측정돼 폭염 주의 당부됨"처럼 "▩ " 뒤에 바로 한 줄로 이어서 쓰십시오. 각 항목 사이에는 빈 줄을 하나씩 넣어 구분하십시오.
- 문장 종결은 "~습니다/합니다" 같은 정중체가 아니라, 뉴스 속보에서 쓰는 간결한 "음슴체"로 끝내십시오 (예: "발견되었습니다" → "발견됨", "결정했습니다" → "결정함", "확인됐습니다" → "확인됨", "별세했습니다" → "별세함", "비판했습니다" → "비판함"). 음슴체는 문장이 짧아져 글자수 예산도 더 아낄 수 있습니다.
- 이 메시지는 카카오 "브랜드메시지"로 발송되지만, 내용은 여전히 오늘의 뉴스 사실을 안내하는 정보성 문장으로만 구성하고 광고성 문구(할인/이벤트/쿠폰 안내, "지금 확인하세요"·"바로가기" 같은 행동 유도 문구, 특정 상품이나 서비스에 대한 홍보·추천)는 절대 포함하지 마십시오 -- 발송 채널의 정책 분류와 무관하게, 이건 뉴스 브리핑이지 광고가 아닙니다.
- (매우 중요) 인사말, 헤더, 마무리 문구, 날짜, "☀" 같은 장식적 이모지 타이틀을 절대 넣지 마십시오 -- 이미 승인된 고정 템플릿에 별도로 포함되어 있어, 여기서 또 넣으면 중복되고 글자 예산만 낭비됩니다. 첫 줄부터 바로 "▩ "로 시작하는 첫 번째 뉴스 항목으로 시작하십시오.
- 마크다운 문법(#, **, - 등) 없이 "▩ "와 줄바꿈만으로 구성하십시오.
- 다른 설명 없이, 뉴스 요약 본문 그 자체만 출력하십시오.
${extra || ''}`;

    const systemInstruction = "당신은 웹사이트에 이미 게시된 3분 뉴스 브리핑 원문을 카카오 브랜드메시지 발송용으로 압축·재구성하는 편집자입니다. 원문에 없는 내용을 추가하지 말고, 절대 광고성/행동유도 문구를 쓰지 말고, 헤더나 인사말 없이 뉴스 항목으로 바로 시작하며, 주어진 글자수 범위를 반드시 지키십시오.";
    let resultText = stripLeakedKakaoBriefingHeader((await callGeminiTextApi(buildPrompt(), systemInstruction)).trim());

    // Hard technical limit, not a style preference -- retry once, tighter,
    // if the first pass ran long instead of silently truncating mid-sentence.
    if (resultText.length > KAKAO_BRIEFING_CHAR_LIMIT) {
      setKakaoBriefingBusy(true, `글자수 초과(${resultText.length}자)로 더 짧게 재생성 중...`);
      const retryExtra = `\n[중요] 방금 작성한 내용이 ${resultText.length}자로 ${KAKAO_BRIEFING_CHAR_LIMIT}자 제한을 넘었습니다. 항목 수를 더 줄여서라도 반드시 ${KAKAO_BRIEFING_CHAR_LIMIT}자 이내로 다시 작성하십시오.`;
      resultText = stripLeakedKakaoBriefingHeader((await callGeminiTextApi(buildPrompt(retryExtra), systemInstruction)).trim());
    } else if (resultText.length < KAKAO_BRIEFING_CHAR_TARGET_MIN) {
      // Too short wastes the character budget the admin is paying for
      // either way -- retry asking for more items/detail instead of
      // leaving a thin brief.
      setKakaoBriefingBusy(true, `분량 부족(${resultText.length}자)으로 더 채워서 재생성 중...`);
      const retryExtra = `\n[중요] 방금 작성한 내용이 ${resultText.length}자로 너무 짧습니다. 원문에 없는 내용을 새로 지어내지 말고, 원문에 이미 있는 각 항목의 설명을 조금 더 자세히 풀어서, 반드시 ${KAKAO_BRIEFING_CHAR_TARGET_MIN}~${KAKAO_BRIEFING_CHAR_LIMIT}자 사이가 되도록 다시 작성하십시오.`;
      resultText = stripLeakedKakaoBriefingHeader((await callGeminiTextApi(buildPrompt(retryExtra), systemInstruction)).trim());
    }

    kakaoBriefingDraft = { date: todayDateKey(), content: resultText };
    persistKakaoBriefingDraft();
    renderKakaoBriefingUI();

    // Best-effort -- localStorage는 여전히 관리자 UI의 최종 백업이므로,
    // 여기서 실패해도 생성 자체를 막지 않는다 (다른 비필수 Supabase 저장과
    // 동일한 관용 패턴). 단, 재시도에도 글자수 제한을 넘긴 경우는
    // kakao_status를 'draft'가 아니라 'error'로 저장한다 -- 그렇지 않으면
    // 자동 발송 모드일 때 api/send-kakao-briefing.js 크론이 이 초과분을
    // 그대로 알리고에 보내려다 실패하는 낭비가 생긴다 (관리자가 직접
    // 다시 생성/수정할 때까지 발송 대상에서 제외되도록 미리 막아둔다).
    const overLimit = resultText.length > KAKAO_BRIEFING_CHAR_LIMIT;
    if (window.SupabaseAdapter && window.SupabaseAdapter.isConfigured()) {
      try {
        if (overLimit) {
          await window.SupabaseAdapter.saveKakaoBriefingContent(todayDateKey(), resultText, 'error');
        } else {
          await window.SupabaseAdapter.saveKakaoBriefingContent(todayDateKey(), resultText);
        }
      } catch (saveErr) {
        console.error("카카오 브리핑 원격 저장 실패 (로컬에는 저장됨):", saveErr);
      }
    }

    if (overLimit) {
      alert(`⚠ 재생성에도 불구하고 ${resultText.length}자로 제한(${KAKAO_BRIEFING_CHAR_LIMIT}자)을 초과했습니다. 이 상태로는 발송이 불가능하니, 직접 내용을 줄여 주세요. (자동 발송 모드에서는 이 상태의 브리핑을 건너뜁니다.)`);
    }
  } catch (err) {
    console.error("카카오 브리핑 생성 실패:", err);
    if (statusEl) statusEl.textContent = "생성 실패: " + err.message;
    alert("브리핑 생성 실패: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    setKakaoBriefingBusy(false);
  }
}

async function copyKakaoBriefingText() {
  const textEl = document.getElementById("kakao-briefing-content");
  if (!textEl || !textEl.value.trim()) {
    alert("복사할 내용이 없습니다. 먼저 브리핑을 생성해 주세요.");
    return;
  }
  try {
    await navigator.clipboard.writeText(textEl.value);
    alert("클립보드에 복사했습니다. 카카오톡 채널 관리자센터에 붙여넣고 오전 8시로 예약 발송해 주세요.");
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 직접 선택해서 복사해 주세요.");
  }
}

// 알리고 연동 점검용 1건 테스트 발송 -- api/test-kakao-send.js는
// baikalnews.com에서 서빙되고 관리자 화면은 editor815.baikalnews.com이라
// 절대경로로 호출한다 (그 함수가 CORS 헤더를 붙여준다).
const KAKAO_TEST_SEND_ENDPOINT = "https://baikalnews.com/api/test-kakao-send";

async function testKakaoSend() {
  const phoneEl = document.getElementById("kakao-test-send-phone");
  const phone = phoneEl ? phoneEl.value.trim() : '';
  if (!phone) {
    alert("테스트 발송할 전화번호를 입력해 주세요.");
    return;
  }

  const btn = document.getElementById("kakao-test-send-btn");
  const statusEl = document.getElementById("kakao-test-send-status");
  const textEl = document.getElementById("kakao-briefing-content");
  const content = textEl ? textEl.value.trim() : '';

  // 본문이 비어 있으면 content 자체를 안 보내고, 엔드포인트의 기본 테스트
  // 문구를 쓰게 한다.
  const payload = content ? { phone, content } : { phone };

  if (btn) { btn.disabled = true; btn.textContent = "발송 중..."; }
  if (statusEl) { statusEl.textContent = "발송 중..."; statusEl.style.color = ''; }

  try {
    const res = await fetch(KAKAO_TEST_SEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.code === 0) {
      if (statusEl) { statusEl.textContent = `✅ 성공 (code: 0) -- ${data.message || ''}`; statusEl.style.color = 'var(--color-green-deep)'; }
      alert(`테스트 발송 성공입니다 (code: 0).\n${data.message || ''}`);
    } else {
      // 알리고의 message를 그대로 보여준다 -- "잔액이 부족합니다" 같은
      // 원문이 원인 파악에 가장 중요한 신호다.
      const detail = data.message || data.error || JSON.stringify(data);
      if (statusEl) { statusEl.textContent = `❌ 실패 (code: ${data.code !== undefined ? data.code : '-'}) -- ${detail}`; statusEl.style.color = '#ef4444'; }
      alert(`테스트 발송 실패 (code: ${data.code !== undefined ? data.code : '-'})\n${detail}`);
    }
  } catch (err) {
    console.error("알림톡 테스트 발송 요청 실패:", err);
    if (statusEl) { statusEl.textContent = `❌ 요청 실패 -- ${err.message}`; statusEl.style.color = '#ef4444'; }
    alert("테스트 발송 요청에 실패했습니다: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "테스트 발송 (알리고 testMode)"; }
  }
}

// ==========================================
// 카테고리별 알림톡 변형 (Phase 2 서버 파이프라인) -- 위 kakaoBriefingDraft
// (클라이언트에서 Gemini를 직접 호출하는 무필터 단일 본문, "수동 발송"
// 복사-붙여넣기용)와는 완전히 별개의 데이터 흐름이다. 여기서는
// api/generate-daily-briefing.js를 서버에서 호출해 오늘 브리핑을 카테고리별로
// 분류하고, 실제 구독자들이 신청한 카테고리 조합마다 kakao_briefing_variants에
// 저장된 결과를 조회/발송 트리거만 한다 -- 이 두 함수는 baikalnews.com에서
// 서빙되고 관리자 화면은 editor815.baikalnews.com이라 절대경로로 호출한다
// (그 함수들이 CORS 헤더를 붙여준다, api/test-kakao-send.js와 동일한 이유).
// ==========================================
const KAKAO_GENERATE_BRIEFING_ENDPOINT = "https://baikalnews.com/api/generate-daily-briefing";
const KAKAO_SEND_BRIEFING_ENDPOINT = "https://baikalnews.com/api/send-kakao-briefing";

// textarea에 innerHTML 문자열로 본문을 직접 넣으면 "</textarea>"나 "&" 같은
// 문자가 우연히 섞였을 때 마크업이 깨질 수 있어, 구조만 innerHTML로 만들고
// 각 textarea의 실제 내용은 .value 프로퍼티로 따로 채운다 (renderKakaoBriefingUI가
// 위 단일 textarea에 하는 것과 같은 방식).
async function renderKakaoBriefingVariantsList() {
  const listEl = document.getElementById("kakao-variants-list");
  if (!listEl) return;

  const variants = await window.SupabaseAdapter.fetchKakaoBriefingVariants(todayDateKey());
  if (variants.length === 0) {
    listEl.innerHTML = `<p class="help-text">아직 생성된 변형이 없습니다.</p>`;
    return;
  }

  const statusBadge = (status) => {
    if (status === 'sent') return `<span class="badge badge-approved">발송됨</span>`;
    if (status === 'error') return `<span class="badge badge-rejected">오류</span>`;
    return `<span class="badge badge-draft">초안</span>`;
  };

  listEl.innerHTML = variants.map(v => `
    <div class="panel" style="padding: 14px 16px; margin-bottom: 12px; border: 1px solid var(--admin-border);">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom: 8px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <strong style="font-size:0.9rem;">${v.categoryKey}</strong>
          ${statusBadge(v.status)}
          <span class="help-text">${(v.content || '').length}자</span>
        </div>
        ${v.sentAt ? `<span class="help-text">발송: ${new Date(v.sentAt).toLocaleString('ko-KR')}</span>` : ''}
      </div>
      ${v.error ? `<div class="help-text" style="color: var(--status-rejected); margin-bottom: 8px;">오류: ${v.error}</div>` : ''}
      <textarea id="kakao-variant-content-${v.id}" class="form-control-admin" readonly style="min-height: 140px; font-family: inherit; line-height: 1.6;"></textarea>
    </div>
  `).join('');

  variants.forEach(v => {
    const ta = document.getElementById(`kakao-variant-content-${v.id}`);
    if (ta) ta.value = v.content || '';
  });
}

// "카테고리별 변형 생성" 버튼 -- api/generate-daily-briefing.js를 호출한다.
// 이 엔드포인트는 요청 본문이 필요 없고(GET/POST 모두 처리 가능, 메서드로
// 분기하지 않음) 이미 오늘 웹 브리핑이 있으면 그 부분만 건너뛰고 카카오
// 변형 생성은 이어서 시도하는 멱등 동작이라, 몇 번을 눌러도 안전하다.
async function generateKakaoBriefingVariants() {
  const btn = document.getElementById("kakao-variants-generate-btn");
  if (btn) btn.disabled = true;
  setKakaoBriefingBusy(true, "서버에서 카테고리별 변형 생성 중... (시간이 걸릴 수 있습니다)");
  try {
    const res = await fetch(KAKAO_GENERATE_BRIEFING_ENDPOINT, { method: 'POST' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(`카테고리별 변형 생성 요청 실패 (status ${res.status})\n${data.error || JSON.stringify(data)}`);
      return;
    }

    // 이 엔드포인트의 JSON 응답에는 카테고리별 변형 생성 결과가 구조화되어
    // 담겨 있지 않다 (kakao 필드는 무필터 'all' 본문 결과만 나타냄) --
    // 그래서 응답을 파싱해서 요약하려 하지 말고, 호출이 끝난 뒤 실제
    // 저장된 행을 아래 목록에서 다시 불러와 보여준다.
    const kakao = data.kakao || {};
    const lines = [];
    lines.push(data.skipped
      ? `웹 브리핑: 이미 오늘 브리핑이 있어 새로 생성하지 않았습니다.`
      : `웹 브리핑: 새로 생성 완료 (${data.length || 0}자).`);
    if (kakao.skipped) {
      lines.push(`카카오(전체 무필터): 건너뜀 -- ${kakao.skipped}`);
    } else if (kakao.ok) {
      lines.push(`카카오(전체 무필터): 생성 완료 (${kakao.length || 0}자).`);
    } else if (kakao.reason) {
      lines.push(`카카오(전체 무필터): 실패 -- ${kakao.reason}`);
    }
    lines.push('카테고리별 변형은 서버에서 함께 처리되었습니다. 아래 목록에서 실제 생성 결과를 확인해 주세요.');
    alert(lines.join('\n'));
  } catch (err) {
    console.error("카테고리별 변형 생성 요청 실패:", err);
    alert("카테고리별 변형 생성 요청에 실패했습니다: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    setKakaoBriefingBusy(false);
    await renderKakaoBriefingVariantsList();
  }
}

// "지금 카카오 발송" 버튼 -- api/send-kakao-briefing.js를 호출한다. 이
// 함수 자체가 kakao_send_mode 게이트를 지키므로(수동이면 발송 없이
// {skipped:'manual_mode'} 반환), 여기서는 그 게이트를 우회하지 않고 결과를
// 있는 그대로 보여주기만 한다.
async function sendKakaoBriefingNow() {
  if (!confirm("지금 카카오 알림톡을 발송 요청하시겠습니까?\n(발송 방식이 '자동'일 때만 실제로 발송됩니다.)")) return;

  const btn = document.getElementById("kakao-variants-send-btn");
  if (btn) btn.disabled = true;
  setKakaoBriefingBusy(true, "카카오 알림톡 발송 요청 중...");
  try {
    const res = await fetch(KAKAO_SEND_BRIEFING_ENDPOINT, { method: 'POST' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(`발송 요청 실패 (status ${res.status})\n${data.error || JSON.stringify(data)}`);
      return;
    }
    if (data.skipped === 'manual_mode') {
      alert("발송 방식이 수동이라 발송하지 않았습니다 -- 자동으로 전환 후 다시 시도하세요.");
      return;
    }
    if (data.skipped) {
      alert(`발송하지 않았습니다 -- 사유: ${data.skipped}`);
      return;
    }
    if (data.ok === false) {
      alert(`발송 실패 -- ${data.reason || ''}\n${data.message || ''}\n(지금까지 발송된 건수: ${data.sentCount || 0}명)`);
      return;
    }

    const skippedIds = data.skippedSubscriberIds || [];
    const skippedLine = skippedIds.length > 0
      ? `제외된 구독자 (${skippedIds.length}명, 발송 가능한 콘텐츠 없음): ${skippedIds.join(', ')}`
      : '제외된 구독자 없음.';
    alert(`발송 완료.\n발송 건수: ${data.sentCount || 0}명\n사용된 카테고리 조합: ${(data.categoryKeys || []).join(', ') || '없음'}\n${skippedLine}`);
  } catch (err) {
    console.error("카카오 발송 요청 실패:", err);
    alert("카카오 발송 요청에 실패했습니다: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    setKakaoBriefingBusy(false);
    await renderKakaoBriefingVariantsList();
  }
}

// ==========================================
// SNS 관리 -- 리드 문단 + 대표 이미지 + 기사 링크를 채널별 형식에 맞게
// 구성한다. 페이스북/인스타그램/스레드는 공식 API로 원클릭 발행이
// 가능하지만(Meta 개발자 앱/페이지-계정 연동 필요), 지금은 연동 전이라
// 전 채널이 "복사해서 직접 게시" 방식으로 동작한다. X는 API는 있지만
// 2026-02부터 게시글 건당 과금(링크 포함 시 $0.20)이라 별도 확인이
// 필요하고, 유튜브 커뮤니티는 공식 API에 게시 기능 자체가 없어 항상
// 복사 방식만 가능하다.
// ==========================================
const SNS_PLATFORMS = ['facebook', 'instagram', 'threads', 'x', 'youtube'];

// ------------------------------------------------------------------
// 공용 기사 검색 피커 -- "SNS 카드뉴스 발행"과 "SNS 발행용 콘텐츠" 두
// 서브탭이 각자 독립된 인스턴스로 재사용한다 (기사 선택 상태를 공유하지
// 않음 -- 관리자가 서브탭마다 다른 기사를 고를 수 있어야 하므로). 펼침
// 목록(검색어 없음)은 7일 이내 발행 기사로 좁힌다(approvedAt/
// scheduledAt 기준) -- "실시간 인기기사"의 5일 랭킹 윈도우와는 별개로,
// SNS 발행 후보는 최근 것만 보이면 된다는 명시적 요청에 따른 값이다.
// ------------------------------------------------------------------
const SNS_PICKER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const snsArticlePickers = {}; // inputId -> { articles, selected, onSelect }

function snsPublishedTime(a) {
  return new Date(a.approvedAt || a.scheduledAt || 0).getTime() || 0;
}

// 검색어가 없을 때(펼침 목록)는 최근 7일 기사만, 검색어를 입력하면
// 전체 발행 기사 대상으로 찾는다 -- "펼침 목록만 최근 것만, 검색은 전체"라는
// 명시적 요청에 따른 구분.
async function fetchSnsArticlePools() {
  const articles = await window.SupabaseAdapter.fetchArticles();
  const allArticles = articles
    .filter(a => a.status === 'published')
    .sort((a, b) => snsPublishedTime(b) - snsPublishedTime(a));
  const cutoff = Date.now() - SNS_PICKER_WINDOW_MS;
  const recentArticles = allArticles.filter(a => snsPublishedTime(a) >= cutoff);
  return { allArticles, recentArticles };
}

async function initSnsArticlePicker(inputId, dropdownId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  const state = { allArticles: [], recentArticles: [], selected: null, onSelect };
  snsArticlePickers[inputId] = state;

  input.value = '';
  input.disabled = false;
  dropdown.style.display = 'none';

  const pools = await fetchSnsArticlePools();
  state.allArticles = pools.allArticles;
  state.recentArticles = pools.recentArticles;

  if (state.allArticles.length === 0) {
    input.placeholder = '발행된 기사가 없습니다.';
    input.disabled = true;
    if (onSelect) onSelect(null);
    return;
  }

  input.placeholder = '기사 제목으로 검색... (비워두면 최근 7일 기사 표시)';

  const currentList = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return { list: state.recentArticles, isDefaultView: true };
    return { list: state.allArticles.filter(a => (a.title || '').toLowerCase().includes(q)), isDefaultView: false };
  };

  input.oninput = () => {
    state.selected = null;
    const { list, isDefaultView } = currentList();
    renderSnsPickerDropdown(inputId, dropdownId, list, isDefaultView);
    dropdown.style.display = 'block';
  };
  input.onfocus = () => {
    // 이미 선택된 기사가 표시된 상태(입력창에 "선택됨: ...")로 포커스만
    // 다시 준 경우는 검색어로 취급하지 않고 기본(최근 7일) 목록을 연다.
    const { list, isDefaultView } = state.selected ? { list: state.recentArticles, isDefaultView: true } : currentList();
    renderSnsPickerDropdown(inputId, dropdownId, list, isDefaultView);
    dropdown.style.display = 'block';
  };
  // blur가 목록 클릭보다 먼저 발생해 드롭다운이 먼저 닫혀버리지 않도록,
  // 클릭 쪽에서는 mousedown+preventDefault를 쓰고 여기서는 살짝 지연한다.
  input.onblur = () => { setTimeout(() => { dropdown.style.display = 'none'; }, 150); };
}

function renderSnsPickerDropdown(inputId, dropdownId, list, isDefaultView) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  if (list.length === 0) {
    const emptyMsg = isDefaultView
      ? '최근 7일 내 발행된 기사가 없습니다. 검색해 보세요.'
      : '검색 결과가 없습니다.';
    dropdown.innerHTML = `<div class="sns-picker-empty">${emptyMsg}</div>`;
    return;
  }
  dropdown.innerHTML = list.map((a, i) => `
    <div class="sns-picker-item" data-idx="${i}">
      <span class="sns-picker-item-title">${a.title}</span>
      <span class="sns-picker-item-date">${a.date}</span>
    </div>
  `).join('');
  dropdown.querySelectorAll('.sns-picker-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // blur보다 먼저 클릭이 확정되도록
      const idx = parseInt(el.dataset.idx, 10);
      selectSnsArticlePicker(inputId, dropdownId, list[idx]);
    });
  });
}

function selectSnsArticlePicker(inputId, dropdownId, article) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const state = snsArticlePickers[inputId];
  if (!input || !state) return;
  state.selected = article;
  input.value = `선택됨: ${article.title}`;
  if (dropdown) dropdown.style.display = 'none';
  if (state.onSelect) state.onSelect(article);
}

// SNS 관리 탭을 열 때마다 두 서브탭의 피커를 모두 새로 불러온다 (다른
// 관리자가 방금 발행했거나 7일 윈도우가 넘어갔을 수 있으므로).
async function initSnsTab() {
  await Promise.all([
    initSnsArticlePicker('sns-content-picker-input', 'sns-content-picker-dropdown', onSnsContentArticleSelected),
    initSnsArticlePicker('cardnews-picker-input', 'cardnews-picker-dropdown', onCardNewsArticleSelected)
  ]);
}

// "SNS 발행용 콘텐츠" 서브탭에서 현재 선택된 기사 -- 예전에는 <select>의
// value(기사 id)로 매번 캐시에서 찾아왔지만, 이제 피커의 onSelect가 기사
// 객체를 직접 넘겨주므로 그 결과를 그대로 들고 있는다.
let snsContentSelectedArticle = null;

function onSnsContentArticleSelected(article) {
  snsContentSelectedArticle = article;
  loadSnsArticlePreview(article);
}

function renderSnsEmptyState() {
  SNS_PLATFORMS.forEach(p => {
    const el = document.getElementById(`sns-text-${p}`);
    if (el) el.value = '';
  });
  const img = document.getElementById("sns-preview-image");
  if (img) img.style.display = 'none';
}

// 채널별 본문 구성 -- 인스타그램은 캡션 속 링크가 클릭되지 않는다는 점,
// X는 280자 제한(링크는 t.co로 짧아지지만 실제 카운트는 별도 예산으로
// 미리 확보)을 반영한다.
// 채널별 해시태그 전략 -- 플랫폼마다 해시태그의 역할/문화가 달라서 개수와
// 구성을 다르게 한다.
// - 페이스북: 해시태그가 검색/도달에 거의 영향이 없고 많으면 스팸처럼
//   보이므로 브랜드 태그 하나만.
// - 인스타그램: 해시태그가 실제 발견(탐색 피드) 도달에 중요한 채널이라
//   브랜드+카테고리+일반 뉴스 태그까지 여러 개.
// - 스레드: 트위터보다 더 캐주얼한 대화형 문화라 해시태그를 거의 안 씀 --
//   브랜드 태그 하나 정도만, 그마저 없어도 자연스러움.
// - X: 검색/트렌드 문화라 1~2개 정도의 간결한 태그가 적당.
// - 유튜브 커뮤니티: 영상 해시태그처럼 몇 개의 주제 태그를 붙이는 게 흔함.
// 조사(은/는/이/가/을/를 등)가 붙은 한국어 어절에서 조사를 대략 떼어내
// 순수 키워드에 가깝게 만든다. 형태소 분석기가 아니라 정규식 기반의
// 근사치라 완벽하진 않지만, 해시태그 용도로는 이 정도로 충분하다.
const SNS_HASHTAG_PARTICLE_SUFFIX = /(으로써|으로서|이라고|이지만|이었다|하는데|이라는|들의|들은|들이|들을|에게서|에서|부터|까지|보다|께서|이나|라도|마저|조차|밖에|이다|입니다|하며|이며|라고|지만|였다|한다|하는|했다|된다|되는|됐다|는데|은데|라는|와|과|의|에|을|를|은|는|이|가|도|만|로)$/;

const SNS_HASHTAG_STOPWORDS = new Set([
  '오늘', '어제', '내일', '이번', '관련', '이후', '한편', '그러나', '하지만',
  '결국', '역시', '지금', '현재', '것으로', '것이다', '전했다', '밝혔다',
  '말했다', '있는', '없는', '했던', '위해', '통해', '대한', '기자', '뉴스'
]);

// 제목과 리드 문단에서 눈에 띄는 어절(고유명사/사건명일 확률이 높은
// 것들)을 추출한다 -- 제목 쪽을 먼저 훑고, 부족하면 리드에서 채운다.
function extractSnsKeywords(text, maxCount) {
  const cleaned = (text || '').replace(/["""''.,!?()\[\]{}%·\-–—:;…‥]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const keywords = [];
  for (const raw of tokens) {
    const word = raw.replace(SNS_HASHTAG_PARTICLE_SUFFIX, '');
    if (word.length < 2 || /^[0-9]+$/.test(word) || SNS_HASHTAG_STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
    if (keywords.length >= maxCount) break;
  }
  return keywords;
}

// 브랜드(#바이칼뉴스)+카테고리는 모든 채널 공통 기본값이고, 그 위에
// 기사 제목/리드에서 뽑은 실제 키워드를 채널별로 다른 개수만큼 얹는다.
// 어느 채널이든 최소 5개 이상은 되도록 구성 (인스타그램/유튜브는 더 많이).
function buildSnsHashtags(article, platform) {
  const tag = article.categoryLabel ? `#${article.categoryLabel.replace(/[·\s]/g, '')}` : '';
  const base = ['#바이칼뉴스', tag].filter(Boolean);

  const titleKeywords = extractSnsKeywords(article.title, 8);
  const leadKeywords = extractSnsKeywords(article.lead || '', 8)
    .filter(k => !titleKeywords.includes(k));
  const contentKeywords = [...titleKeywords, ...leadKeywords];

  if (platform === 'instagram') {
    const picked = contentKeywords.slice(0, 8).map(k => `#${k}`);
    return [...base, ...picked, '#오늘의뉴스', '#뉴스', '#속보'].join(' ');
  }
  if (platform === 'youtube') {
    const picked = contentKeywords.slice(0, 5).map(k => `#${k}`);
    return [...base, ...picked, '#뉴스'].join(' ');
  }
  if (platform === 'x') {
    const picked = contentKeywords.slice(0, 3).map(k => `#${k}`);
    return [...base, ...picked].join(' ');
  }
  // facebook, threads 등 -- 브랜드/카테고리 2개 + 키워드 3개 = 5개 이상
  const picked = contentKeywords.slice(0, 3).map(k => `#${k}`);
  return [...base, ...picked].join(' ');
}

function buildSnsPostText(article, platform) {
  const url = article.canonicalUrl || `https://baikalnews.com/article.html?id=${article.id}`;
  const lead = (article.lead || '').trim();
  const title = article.title || '';
  const hashtags = buildSnsHashtags(article, platform);

  if (platform === 'facebook') {
    return `${title}\n\n${lead}\n\n${url}\n\n${hashtags}`;
  }
  if (platform === 'instagram') {
    return `${title}\n\n${lead}\n\n📎 기사 원문은 프로필 링크를 통해 확인해 주세요.\n(참고용 링크: ${url})\n\n${hashtags}`;
  }
  if (platform === 'threads') {
    return `${title}\n\n${lead}\n\n${url}\n\n${hashtags}`;
  }
  if (platform === 'x') {
    const LINK_BUDGET = 26; // t.co 단축 링크 + 줄바꿈 여유분
    const tagBudget = hashtags.length + 1; // 해시태그 줄 + 줄바꿈
    const maxTextLen = 280 - LINK_BUDGET - tagBudget;
    let text = `${title} - ${lead}`.trim();
    if (text.length > maxTextLen) {
      text = text.slice(0, Math.max(0, maxTextLen - 1)).trim() + '…';
    }
    return `${text}\n${url}\n${hashtags}`;
  }
  if (platform === 'youtube') {
    return `${title}\n\n${lead}\n\n${url}\n\n${hashtags}`;
  }
  return '';
}

function loadSnsArticlePreview(article) {
  if (!article) {
    renderSnsEmptyState();
    return;
  }

  const img = document.getElementById("sns-preview-image");
  if (img) {
    if (article.image) {
      img.src = article.image;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
  }

  SNS_PLATFORMS.forEach(p => {
    const el = document.getElementById(`sns-text-${p}`);
    if (el) el.value = buildSnsPostText(article, p);
  });
}

async function copySnsText(platform) {
  const el = document.getElementById(`sns-text-${platform}`);
  if (!el || !el.value.trim()) {
    alert("복사할 내용이 없습니다. 먼저 기사를 선택해 주세요.");
    return;
  }
  try {
    await navigator.clipboard.writeText(el.value);
    alert("클립보드에 복사했습니다.");
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 직접 선택해서 복사해 주세요.");
  }
}

// api/sns-publish.js는 baikalnews.com에서 서빙되고, 관리자 화면은
// editor815.baikalnews.com에서 열리는 다른 오리진이라 절대경로로
// 호출해야 한다 (그 함수가 CORS 헤더를 붙여준다).
const SNS_PUBLISH_ENDPOINT = "https://baikalnews.com/api/sns-publish";
const SNS_AUTOMATABLE_PLATFORMS = ['facebook', 'instagram', 'threads'];
const SNS_PLATFORM_LABELS = { facebook: '페이스북', instagram: '인스타그램', threads: '스레드' };

async function publishSnsAllAutomatable() {
  const article = snsContentSelectedArticle;
  if (!article) {
    alert("먼저 발행할 기사를 선택해 주세요.");
    return;
  }
  if (!confirm("페이스북, 인스타그램, 스레드 중 연동된 채널에 지금 바로 발행합니다. 계속하시겠습니까?")) return;

  const btn = document.getElementById("sns-publish-all-btn");
  const resultsEl = document.getElementById("sns-publish-all-results");
  if (btn) { btn.disabled = true; btn.textContent = "발행 중..."; }
  if (resultsEl) resultsEl.innerHTML = '<div class="help-text">발행 진행 중...</div>';

  const lines = [];
  for (const platform of SNS_AUTOMATABLE_PLATFORMS) {
    const label = SNS_PLATFORM_LABELS[platform];
    const textEl = document.getElementById(`sns-text-${platform}`);
    const text = textEl ? textEl.value.trim() : '';
    if (!text) {
      lines.push(`<div style="color: var(--status-review);">⚠ ${label}: 내용이 비어있어 건너뛰었습니다.</div>`);
      continue;
    }
    try {
      const res = await fetch(SNS_PUBLISH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, text, imageUrl: article.image || null })
      });
      const data = await res.json();
      if (data.ok) {
        lines.push(`<div style="color: var(--color-green-deep);">✅ ${label}: 발행 완료</div>`);
      } else if (data.error === 'not_configured') {
        lines.push(`<div class="help-text">⚠ ${label}: 아직 연동되지 않았습니다.</div>`);
      } else {
        lines.push(`<div style="color: #ef4444;">❌ ${label}: 실패 -- ${data.error}</div>`);
      }
    } catch (err) {
      console.error(`${label} 발행 요청 실패:`, err);
      lines.push(`<div style="color: #ef4444;">❌ ${label}: 요청 실패 -- ${err.message}</div>`);
    }
  }

  if (resultsEl) resultsEl.innerHTML = lines.join('');
  if (btn) { btn.disabled = false; btn.textContent = "페이스북·인스타그램·스레드 한꺼번에 발행"; }
}

// 채널 하나만 개별 발행 -- 한꺼번에 발행과 같은 엔드포인트를 쓰지만,
// 다른 채널은 건드리지 않고 이 채널의 결과만 그 패널 아래 상태줄에 표시한다.
async function publishSnsOne(platform) {
  const article = snsContentSelectedArticle;
  if (!article) {
    alert("먼저 발행할 기사를 선택해 주세요.");
    return;
  }

  const label = SNS_PLATFORM_LABELS[platform] || platform;
  const textEl = document.getElementById(`sns-text-${platform}`);
  const text = textEl ? textEl.value.trim() : '';
  if (!text) {
    alert("발행할 내용이 없습니다.");
    return;
  }
  if (!confirm(`${label}에 지금 바로 발행합니다. 계속하시겠습니까?`)) return;

  const statusEl = document.getElementById(`sns-status-${platform}`);
  if (statusEl) statusEl.textContent = "발행 중...";

  try {
    const res = await fetch(SNS_PUBLISH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, text, imageUrl: article.image || null })
    });
    const data = await res.json();
    if (data.ok) {
      if (statusEl) { statusEl.textContent = `✅ 발행 완료`; statusEl.style.color = 'var(--color-green-deep)'; }
    } else if (data.error === 'not_configured') {
      if (statusEl) { statusEl.textContent = `⚠ 아직 연동되지 않았습니다.`; statusEl.style.color = ''; }
    } else {
      if (statusEl) { statusEl.textContent = `❌ 실패 -- ${data.error}`; statusEl.style.color = '#ef4444'; }
    }
  } catch (err) {
    console.error(`${label} 발행 요청 실패:`, err);
    if (statusEl) { statusEl.textContent = `❌ 요청 실패 -- ${err.message}`; statusEl.style.color = '#ef4444'; }
  }
}

// ==========================================
// SNS 카드뉴스 발행 -- 원본 기사 사진을 그대로 공유하면 맥락 없이 어색해
// 보인다는 문제로 시작한 기능. 두 가지를 함께 보여준다: 1) 인포그래픽
// 이미지는 Gemini Gem 등 외부 도구에서 만들기 때문에, 그곳에 붙여넣을
// "인포그래픽용 기사 요약"을 AI로 생성 -> 2) SNS 게시글 캡션으로 그대로
// 복사해 쓸 "제목+내용+해시태그" 상자(템플릿 기반, AI 호출 없음). 기사를
// 선택하면 두 상자가 한 화면에 함께 채워진다.
// ==========================================
let cardNewsSelectedArticle = null;

function onCardNewsArticleSelected(article) {
  cardNewsSelectedArticle = article;
  renderCardNewsPreview(article);

  const summaryEl = document.getElementById("cardnews-summary");
  if (summaryEl) summaryEl.value = '';
  const summaryStatusEl = document.getElementById("cardnews-summary-status");
  if (summaryStatusEl) summaryStatusEl.textContent = '';

  // 기사를 바꾸면 이전 기사 기준으로 생성한 카드뉴스 이미지는 더 이상
  // 유효하지 않으므로 함께 초기화한다.
  const imageResultWrap = document.getElementById("cardnews-image-result");
  if (imageResultWrap) imageResultWrap.style.display = 'none';
  const imageStatusEl = document.getElementById("cardnews-image-status");
  if (imageStatusEl) imageStatusEl.textContent = '';

  const copyTextEl = document.getElementById("cardnews-copy-text");
  if (copyTextEl) copyTextEl.value = buildCardNewsCopyText(article);
  const copyStatusEl = document.getElementById("cardnews-copy-status");
  if (copyStatusEl) copyStatusEl.textContent = '';
}

function renderCardNewsPreview(article) {
  const wrap = document.getElementById("cardnews-preview");
  const img = document.getElementById("cardnews-preview-image");
  const titleEl = document.getElementById("cardnews-preview-title");
  const dateEl = document.getElementById("cardnews-preview-date");
  const leadEl = document.getElementById("cardnews-preview-lead");
  if (!wrap) return;

  if (!article) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = 'block';
  if (img) {
    if (article.image) {
      img.src = article.image;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
  }
  if (titleEl) titleEl.textContent = article.title || '';
  if (dateEl) dateEl.textContent = article.date || '';
  if (leadEl) leadEl.textContent = (article.lead || '').trim();
}

// 인포그래픽용 기사 요약: 관리자가 Gemini Gem 등 외부 도구에 붙여넣어
// 인포그래픽 이미지를 만들 때 쓸 텍스트를 AI로 생성. 리드 문단을 그대로
// 옮기지 않도록, 그리고 뉴스 보도체가 아닌 카드뉴스 카피 문체로 쓰도록
// 프롬프트에서 명시하고, 결과를 반드시 검토/수정 가능한 textarea로 먼저
// 보여준다. 제목/내용을 라벨이나 별도 입력창으로 나누지 않고 한 textarea에
// 그대로 담는다 (첫 줄 = 헤드라인, 그 아래 = 핵심 내용 불릿).
async function generateCardNewsSummary() {
  if (!cardNewsSelectedArticle) {
    alert("먼저 기사를 선택해 주세요.");
    return;
  }

  const btn = document.getElementById("cardnews-summarize-btn");
  const summaryEl = document.getElementById("cardnews-summary");
  const statusEl = document.getElementById("cardnews-summary-status");
  const originalLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = "생성 중..."; }
  if (statusEl) statusEl.textContent = '';

  try {
    const article = cardNewsSelectedArticle;
    const bodyText = (article.content || "").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const prompt = `
아래 뉴스 기사를 "한 장짜리 카드뉴스(인포그래픽)"에 그대로 복사해 넣을 수 있는 문구로 정리하십시오. 여러 장의 슬라이드가 아니라, 이미지 한 장 안에 제목·핵심 내용이 한눈에 들어오도록 구성하는 것이 목적입니다.

[기사 제목]
${article.title}

[리드 문단]
${article.lead || ''}

[본문]
${bodyText.substring(0, 4000)}

[작성 방식]
- 첫 줄에 헤드라인을 쓰십시오. 한 줄, 15~25자 내외, 이 기사에서 가장 임팩트 있는 사실 하나로 압축. 날짜·수치가 핵심이면 그대로 포함.
- 빈 줄을 하나 두고, 그 아래에 핵심 내용을 짧은 불릿("- ")으로 3~6개 쓰십시오. 각 항목은 15~30자 내외, 기사에서 실제로 중요한 사실만, 순서대로 읽으면 기사 맥락이 파악되도록 자연스럽게 구성.
- 제목/내용을 가리키는 라벨(예: "헤드라인:", "[내용]" 등)은 절대 쓰지 마십시오. 그대로 복사해서 쓸 카드뉴스 문구만 출력하십시오.

[작성 지침 -- 반드시 모두 지킬 것]
- 리드 문단을 그대로 옮기지 마십시오.
- "~했습니다", "~라고 밝혔습니다", "~를 발표했습니다" 같은 뉴스 보도체 문장을 쓰지 마십시오. 대신 카드뉴스 헤드라인처럼 짧게 끊어 쓰는 카피 문체를 쓰십시오. 예: "고덕동, 10월 12일부터 둘로 나뉩니다" / "인구 6.8만 명 → 고덕1동·고덕2동 분동 확정".
- 불릿 항목은 완결된 문장이 아니어도 됩니다. 명사형이나 짧은 절로 끝내도 됩니다.
- 마크다운 문법(#, ** 등)이나 추가 설명 없이, 위 작성 방식 그대로만 출력하십시오.`;

    const systemInstruction = "당신은 뉴스 기사를 한 장짜리 카드뉴스(인포그래픽) 문구로 재구성하는 카피라이터입니다. 뉴스 보도체 문장이 아니라, 짧고 임팩트 있는 카드뉴스 카피 문체로 쓰십시오. 라벨이나 섹션 구분 없이, 첫 줄은 헤드라인, 그 아래는 핵심 내용 불릿으로만 이루어진 그대로 복사 가능한 텍스트를 출력하십시오.";
    const resultText = await callGeminiTextApi(prompt, systemInstruction);
    if (summaryEl) summaryEl.value = resultText.trim();
  } catch (err) {
    console.error("카드뉴스 요약 생성 실패:", err);
    if (statusEl) statusEl.textContent = "생성 실패: " + err.message;
    alert("생성 실패: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

async function copyCardNewsSummary() {
  const textEl = document.getElementById("cardnews-summary");
  const statusEl = document.getElementById("cardnews-summary-status");
  const text = textEl ? textEl.value.trim() : '';
  if (!text) {
    alert("복사할 내용이 없습니다. 먼저 요약을 생성해 주세요.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) statusEl.textContent = "클립보드에 복사했습니다.";
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 직접 선택해서 복사해 주세요.");
  }
}

// ==========================================
// 카드뉴스 인포그래픽 이미지 생성 -- 관리자가 준 상세 지침(템플릿 11종,
// 바이칼 물범 캐릭터 18종, 레이아웃/텍스트 제한 규칙)을 그대로 프롬프트로
// 조립해 4:5 인포그래픽 이미지를 한 장 생성한다. 기사 대표 이미지 생성
// (generateGeminiImage)과는 완전히 다른 스타일(다큐멘터리 사진이 아니라
// 일러스트/캐릭터 인포그래픽)이라, 그 함수가 강제로 붙이는 사실적 사진
// 규칙(IMAGE_REALISM_RULE 등)을 타면 안 된다 -- 그래서 같은 이미지 생성
// 프록시(api/gemini-image-proxy.js)를 별도로, 직접 호출한다.
// ==========================================
const CARDNEWS_TEMPLATES = [
  { id: 1, name: '노란색과 연두색 링철', desc: '노란 모눈 배경 RGB(253,224,71), 흰 메모지 RGB(255,255,255), 연두 바인더 링 RGB(74,222,128)' },
  { id: 2, name: '하늘색과 파스텔톤 귀여운 우표 메모지', desc: '연회색 도트 배경 RGB(241,245,249), 파스텔 하늘색 우표 프레임 RGB(186,230,253), 핑크/노랑 포인트' },
  { id: 3, name: '노랑바탕 링노트', desc: '노란 가로 줄무늬 배경 RGB(253,224,71), 흰색 스프링노트 RGB(255,255,255), 민트 포인트 RGB(0,199,149)' },
  { id: 4, name: '민트색과 흰색 클립', desc: '파스텔 민트 배경 RGB(203,232,224), 흰색 라운드 카드 RGB(255,255,255), 검은 종이클립' },
  { id: 5, name: '연두색과 노란색 캐릭터 집게', desc: '연두색 격자 배경 RGB(157,217,168), 흰색 메모지 RGB(255,255,255), 노란 바인더 집게 RGB(254,231,107)' },
  { id: 6, name: '옐로우 인덱스', desc: '파스텔 노랑 배경 RGB(254,240,138), 우측 3색 인덱스 탭(하늘 RGB(186,230,253) / 연두 RGB(187,247,208))' },
  { id: 7, name: '주황색과 노란색 엄청 심플', desc: '연회색/오프화이트 배경 RGB(240,240,240), 링 고리가 달린 흰 카드, 주황 RGB(248,211,193) & 노랑 포인트' },
  { id: 8, name: '파란색과 노란색 강렬한 느낌', desc: '로열 블루 모눈 배경 RGB(67,97,238), 비비드 레몬 노랑 캡슐 RGB(255,230,0), 눈동자 그래픽' },
  { id: 9, name: '파란색 바탕과 흰색 심플', desc: '미디엄 블루 배경 RGB(92,138,230), 고리 구멍이 뚫린 태그 형태 흰 카드 RGB(255,255,255)' },
  { id: 10, name: '하늘색 집게와 아이보리 심플', desc: '따뜻한 아이보리 배경 RGB(248,245,237), 상단 하늘색 집게 RGB(147,197,253), 기울어진 타이틀 배지' },
  { id: 11, name: '회색바탕 악어 노트북 노트', desc: '연회색 배경 RGB(210,210,210), 스티치 테두리 흰 태그 카드, 마커펜 소품 및 파스텔 멀티 컬러' }
];

const CARDNEWS_CHARACTERS = [
  { id: 'yellow-default', desc: '노란 몸체 RGB(255,222,59), 땀방울 RGB(96,165,250)을 흘리며 곤란해하는 표정' },
  { id: 'yellow-study', desc: '노란 몸체 RGB(255,222,59), 검은 안경 RGB(34,34,34)을 쓰고 책 RGB(100,116,139)을 든 모습' },
  { id: 'yellow-focus', desc: '노란 몸체 RGB(255,222,59), 진지하고 또렷하게 집중하는 눈매' },
  { id: 'yellow-task', desc: '노란 몸체 RGB(255,222,59), 회색 노트북 RGB(148,163,184) 타이핑 포즈' },
  { id: 'yellow-tired', desc: '노란 몸체 RGB(255,222,59), 피곤해서 침/땀을 흘리며 졸려하는 포즈' },
  { id: 'yellow-worry', desc: '노란 몸체 RGB(255,222,59), 턱에 손을 얹고 물음표(?) 말풍선을 띄운 모습' },
  { id: 'yellow-phone', desc: '노란 몸체 RGB(255,222,59), 스마트폰 RGB(148,163,184)을 들고 바라보는 모습' },
  { id: 'yellow-understand', desc: '노란 몸체 RGB(255,222,59), 눈을 반짝이며 머리 위에 노란 전구 RGB(250,204,21)가 켜진 모습' },
  { id: 'yellow-solved', desc: '노란 몸체 RGB(255,222,59), 만세를 부르며 노란 별 RGB(250,204,21)이 반짝이는 모습' },
  { id: 'mint-default', desc: '민트 몸체 RGB(110,210,175), 입 위치에 점선(....)이 떠 있는 어리둥절한 표정' },
  { id: 'mint-smile', desc: '민트 몸체 RGB(110,210,175), 방긋 웃으며 입을 벌린 긍정적인 표정' },
  { id: 'mint-glare', desc: '민트 몸체 RGB(110,210,175), 눈을 가늘게 뜨고 정색하는 표정' },
  { id: 'mint-shock', desc: '민트 몸체 RGB(110,210,175), 눈을 크게 뜨고 입을 떡 벌린 충격받은 표정' },
  { id: 'mint-sad', desc: '민트 몸체 RGB(110,210,175), 눈썹이 처지고 침/눈물을 흘리는 표정' },
  { id: 'mint-hmm', desc: '민트 몸체 RGB(110,210,175), 손을 턱에 대고 물음표(?) 말풍선을 든 모습' },
  { id: 'mint-hi', desc: '민트 몸체 RGB(110,210,175), 한쪽 손을 들고 반갑게 인사하는 포즈' },
  { id: 'mint-heart', desc: '민트 몸체 RGB(110,210,175), 볼이 빨개지고 핑크 하트 RGB(244,114,182)가 떠 있는 모습' },
  { id: 'mint-sleep', desc: "민트 몸체 RGB(110,210,175), 엎드려 'zzz' 글자와 함께 잠든 모습" }
];

function buildCardNewsImagePrompt(templateId, characterId, summaryText) {
  const template = CARDNEWS_TEMPLATES.find(t => t.id === templateId);
  const character = CARDNEWS_CHARACTERS.find(c => c.id === characterId);
  if (!template || !character) return null;

  return `
너는 인터넷 신문사 '바이칼뉴스' 전담 세로형 인포그래픽 이미지 생성 전문 AI다. 아래 조건에 맞춰 완성형 단일 인포그래픽 이미지 1장만 생성하라. 텍스트 답변이나 설명문은 절대 출력하지 말고, 오직 이미지만 출력하라.

[규격]
- 비율: 4:5 세로형 (1080 x 1350px). 프레임 전체를 인포그래픽 내용으로 꽉 채우고, 여백이나 레터박스 없이 출력하라.

[허용 텍스트 -- 최우선 절대 수칙]
- 이미지 안에 그려 넣을 수 있는 글자는 아래 [뉴스 요약글] 내용과 "baikalnews.com" 이 두 가지뿐이다.
- [뉴스 요약글]에 있는 문장만 토씨 하나 바꾸지 말고 원문 그대로 사용하라. 요약하거나 풀어쓰거나 다른 표현으로 바꾸지 말고, 주어진 글자를 그대로 옮겨 적어라. 요약글에 없는 단어·문장·조사·숫자를 새로 지어내서 추가하지 마라 (AI가 스스로 새로 만들어낸 한글은 철자가 틀리게 그려지는 경우가 매우 많다 -- 주어진 글자를 그대로 베끼는 것이 오류를 막는 유일한 방법이다).
- "뉴스 인포그래픽", "카드뉴스", "뉴스", "Baikal News" 같은 임의의 라벨이나 여백을 채우기 위한 단어는 절대 넣지 마라.
- "baikalnews.com"은 이미지 상단 또는 하단 중 한 곳에 검정색 소형 글씨로 딱 1번만 깔끔하게 넣어라.
- 이 두 가지(요약글 원문 그대로, baikalnews.com) 외의 텍스트는 단 한 글자도 그리지 마라 -- 가짜 단어, 장식용 글자, 말풍선 안의 즉흥 대사, 표지판/포스트잇에 쓰인 임의의 글자 포함, 어떤 형태로도 절대 안 된다.

[레이아웃 자율성]
- 아래 선택된 템플릿의 메인 컬러 배합과 기본 테두리/배경 분위기만 유지하고, 내부 레이아웃은 정형화된 틀에 매이지 않고 뉴스 내용에 맞춰 가장 읽기 쉽고 매력적인 구조로 자유롭게 재배치하라.
- 텍스트 뒤나 문단 주위에 노란 상자, 둥근 박스, 카드, 테두리, 배경 색상 블록 같은 텍스트 배경 상자/박스는 절대 그리지 마라.
- 뉴스 주제에 맞는 메인 그래픽 일러스트(버스, 기차, 건물, 차트, 산, 호수 등)를 중앙/주요 위치에 시원하게 배치하되, 바이칼 물범 캐릭터를 제외한 일러스트 그래픽 요소는 최대 3개 이하로 제한하라.
- 핵심 데이터를 강조하는 말풍선, 포스트잇 메모지, 색상 배지, 화살표, 체크박스, 그래프 아이콘을 자유롭게 삽입하고, 빈 공간에는 별·하트·반짝이·점선 같은 스티커 장식을 아기자기하게 채워 어색하지 않게 하라.

[마스코트 배치]
- 아래 지정된 '바이칼 물범' 캐릭터를 텍스트나 핵심 내용 옆에 1~2개 귀엽게 배치하라. 크기는 제목 크기의 2배보다 크지 않게 하라.
- 캐릭터가 단순 마스코트가 아니라 인포그래픽의 안내자/설명자 역할을 하도록, 손가락으로 제목/자료를 가리키거나 안내 상자 옆에 서 있는 등 레이아웃과 자연스럽게 결합하라. 말풍선을 띄우고 싶다면 느낌표(!)·물음표(?)·하트·반짝임 같은 기호만 넣고, 새로운 문구를 지어내서 글자로 적지는 마라 (위 [허용 텍스트] 규칙과 동일하게, 요약글에 없는 한글은 절대 새로 만들지 않는다).
- 물범 공통 외형: 동글동글하고 매끈한 덤피 형태의 몸매, 아랫니 2개가 작게 드러난 귀여운 얼굴.

[선택된 템플릿 -- 템플릿 ${template.id}: ${template.name}]
${template.desc}

[선택된 캐릭터]
${character.desc}

[뉴스 요약글 -- 이미지에 그대로 반영할 텍스트]
${summaryText}
`.trim();
}

async function generateCardNewsImage() {
  const templateSelect = document.getElementById("cardnews-template-select");
  const characterSelect = document.getElementById("cardnews-character-select");
  const summaryEl = document.getElementById("cardnews-summary");
  const btn = document.getElementById("cardnews-generate-image-btn");
  const statusEl = document.getElementById("cardnews-image-status");
  const resultWrap = document.getElementById("cardnews-image-result");
  const previewImg = document.getElementById("cardnews-image-preview");
  const downloadLink = document.getElementById("cardnews-image-download");

  const summaryText = summaryEl ? summaryEl.value.trim() : '';
  if (!summaryText) {
    alert("먼저 위에서 인포그래픽용 기사 요약을 생성하거나 직접 입력해 주세요.");
    return;
  }
  const templateId = parseInt(templateSelect.value, 10);
  const characterId = characterSelect.value;
  const prompt = buildCardNewsImagePrompt(templateId, characterId, summaryText);
  if (!prompt) {
    alert("템플릿/캐릭터 선택을 확인해 주세요.");
    return;
  }

  const originalLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = "생성 중... (최대 1분 정도 걸릴 수 있습니다)"; }
  if (statusEl) statusEl.textContent = '';
  if (resultWrap) resultWrap.style.display = 'none';

  try {
    // generateGeminiImage()는 기사 대표 이미지용 사실적 사진 규칙을 강제로
    // 붙이므로 여기서는 쓰지 않고, 같은 프록시를 직접 호출한다.
    const response = await fetch("https://baikalnews.com/api/gemini-image-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`카드뉴스 생성 실패 (HTTP ${response.status}): ${errText}`);
    }
    const data = await response.json();
    if (!data.dataUri) {
      throw new Error("AI가 이미지를 반환하지 않았습니다.");
    }
    if (previewImg) previewImg.src = data.dataUri;
    if (downloadLink) downloadLink.href = data.dataUri;
    if (resultWrap) resultWrap.style.display = 'block';
    if (statusEl) statusEl.textContent = "카드뉴스 이미지가 생성되었습니다.";
  } catch (err) {
    console.error("카드뉴스 이미지 생성 실패:", err);
    if (statusEl) statusEl.textContent = "생성 실패: " + err.message;
    alert("카드뉴스 생성 실패: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

function buildCardNewsCopyText(article) {
  if (!article) return '';
  const title = article.title || '';
  const lead = (article.lead || '').trim();
  const url = article.canonicalUrl || `https://baikalnews.com/article.html?id=${article.id}`;
  // 특정 채널 전용이 아니라 여러 SNS에 두루 쓰는 문구라, buildSnsHashtags의
  // 기본(facebook/threads) 분기 -- 브랜드+카테고리 2개 + 키워드 3개 --를 그대로 쓴다.
  const hashtags = buildSnsHashtags(article, 'facebook');
  return `${title}\n\n${lead}\n\n${url}\n\n${hashtags}`;
}

async function copyCardNewsText() {
  const textEl = document.getElementById("cardnews-copy-text");
  const statusEl = document.getElementById("cardnews-copy-status");
  const text = textEl ? textEl.value.trim() : '';
  if (!text) {
    alert("복사할 내용이 없습니다. 먼저 기사를 선택해 주세요.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) statusEl.textContent = "클립보드에 복사했습니다.";
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 직접 선택해서 복사해 주세요.");
  }
}

function renderNewsletterDraftUI() {
  renderNewsletterSlotGroup('newsletter-latest-slots', 'latestIds');
  renderNewsletterSlotGroup('newsletter-popular-slots', 'popularIds');
  refreshNewsletterPreview();
}

function renderNewsletterSlotGroup(containerId, fieldName) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const ids = newsletterDraft[fieldName] || [];
  if (ids.length === 0) {
    container.innerHTML = `<div class="help-text">표시할 발행 기사가 없습니다.</div>`;
    return;
  }

  container.innerHTML = ids.map((id, idx) => {
    const art = findNewsletterArticleById(id);
    if (!art) return '';
    const imgSrc = /^https?:\/\//i.test(art.image || '') ? art.image : `https://baikalnews.com/${art.image || 'images/news_editorial.png'}`;
    return `
      <div class="newsletter-slot" style="display: flex; align-items: center; gap: 12px; border: 1px solid var(--admin-border); border-radius: 8px; padding: 10px;">
        <img src="${imgSrc}" crossorigin="anonymous" style="width: 56px; height: 56px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.7rem; color: var(--admin-text-secondary);">${art.categoryLabel || art.category} · ${art.date}</div>
          <div style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${art.title}</div>
        </div>
        <button type="button" class="btn-admin btn-admin-secondary" onclick="openNewsletterSlotEditor('${fieldName}', ${idx}, this)">편집</button>
      </div>
    `;
  }).join('');
}

function openNewsletterSlotEditor(fieldName, idx, btnEl) {
  const slotEl = btnEl.closest('.newsletter-slot');
  const currentId = newsletterDraft[fieldName][idx];
  const published = newsletterArticlesCache.filter(a => a.status === 'published');
  const selectId = `newsletter-slot-select-${fieldName}-${idx}`;

  slotEl.innerHTML = `
    <select class="form-control-admin" style="flex: 1;" id="${selectId}">
      ${published.map(a => `<option value="${a.id}" ${a.id === currentId ? 'selected' : ''}>${a.title} · ${a.categoryLabel || a.category} · ${a.date}</option>`).join('')}
    </select>
    <button type="button" class="btn-admin btn-admin-primary" onclick="applyNewsletterSlotEdit('${fieldName}', ${idx}, '${selectId}')">적용</button>
    <button type="button" class="btn-admin btn-admin-secondary" onclick="cancelNewsletterSlotEdit('${fieldName}')">취소</button>
  `;
}

// Bails out of edit mode without touching newsletterDraft -- re-rendering the
// slot group from the still-unmodified draft state is enough to revert it.
function cancelNewsletterSlotEdit(fieldName) {
  const containerId = fieldName === 'latestIds' ? 'newsletter-latest-slots' : 'newsletter-popular-slots';
  renderNewsletterSlotGroup(containerId, fieldName);
}

function applyNewsletterSlotEdit(fieldName, idx, selectId) {
  const select = document.getElementById(selectId);
  const newId = parseInt(select.value, 10);
  newsletterDraft[fieldName][idx] = newId;
  persistNewsletterDraft();
  renderNewsletterDraftUI();
}

// Table-based, inline-styled HTML row for one article -- deliberately not reusing
// the site's own card markup/CSS classes, since email clients strip external
// stylesheets and mangle most modern CSS (flexbox/grid, custom properties, etc).
function buildNewsletterArticleRowHtml(art) {
  const imgSrc = /^https?:\/\//i.test(art.image || '') ? art.image : `https://baikalnews.com/${art.image || 'images/news_editorial.png'}`;
  const url = `https://baikalnews.com/article.html?id=${art.id}`;
  const excerptRaw = art.lead || '';
  const excerpt = excerptRaw.substring(0, 80) + (excerptRaw.length > 80 ? '…' : '');
  return `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="100" valign="top" style="padding-right: 14px;">
              <a href="${url}" target="_blank"><img src="${imgSrc}" crossorigin="anonymous" width="100" height="100" style="display:block; border-radius: 6px; object-fit: cover;"></a>
            </td>
            <td valign="top">
              <div style="font-size: 11px; color: #0e7490; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">${art.categoryLabel || art.category}</div>
              <a href="${url}" target="_blank" style="font-size: 16px; font-weight: 700; color: #111827; text-decoration: none; line-height: 1.35;">${art.title}</a>
              <div style="font-size: 13px; color: #4b5563; margin-top: 6px; line-height: 1.5;">${excerpt}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function buildNewsletterEmailHtml() {
  const today = new Date();
  const dateLabel = today.toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const latestArticles = (newsletterDraft.latestIds || []).map(findNewsletterArticleById).filter(Boolean);
  const popularArticles = (newsletterDraft.popularIds || []).map(findNewsletterArticleById).filter(Boolean);

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius: 10px; overflow: hidden;">
          <tr>
            <td style="background-color:#0b1a30; padding: 28px 32px; text-align:center;">
              <div style="font-size: 24px; font-weight: 800; color:#ffffff; letter-spacing: -0.02em;">바이칼뉴스</div>
              <div style="font-size: 11px; color:#7dd3fc; letter-spacing: 0.2em; margin-top: 4px;">BAIKAL NEWS</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 8px;">
              <div style="font-size: 13px; color:#6b7280;">${dateLabel}</div>
              <div style="font-size: 15px; color:#111827; margin-top: 8px; line-height: 1.6;">깊고 투명한 시선으로 세상을 비추는 바이칼뉴스가 오늘의 소식을 전해드립니다.</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px 0;">
              <div style="font-size: 15px; font-weight: 800; color:#0b1a30; border-bottom: 2px solid #0b1a30; padding-bottom: 8px; margin-bottom: 4px;">🆕 새로운 뉴스</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${latestArticles.map(buildNewsletterArticleRowHtml).join('')}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px 0;">
              <div style="font-size: 15px; font-weight: 800; color:#0b1a30; border-bottom: 2px solid #0b1a30; padding-bottom: 8px; margin-bottom: 4px;">🔥 인기 뉴스</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${popularArticles.map(buildNewsletterArticleRowHtml).join('')}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 32px;">
              <a href="https://baikalnews.com" target="_blank" style="display:inline-block; background-color:#0b1a30; color:#ffffff; text-decoration:none; font-size: 13px; font-weight: 700; padding: 12px 24px; border-radius: 6px;">바이칼뉴스 홈페이지 바로가기</a>
            </td>
          </tr>
          <tr>
            <td style="background-color:#0b1a30; padding: 20px 32px; text-align:center;">
              <div style="font-size: 11px; color:#9ca3af; line-height: 1.7;">
                발행인 최상락 · 편집인 장승희 · 경기도 평택시 지제로 65-4, 105호(지제동)<br>
                문의: <a href="mailto:baikalnews815@gmail.com" style="color:#7dd3fc;">baikalnews815@gmail.com</a><br>
                이 메일을 더 이상 받고 싶지 않으시면 회신으로 알려주시면 구독을 해지해 드립니다.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function refreshNewsletterPreview() {
  const iframe = document.getElementById("newsletter-preview-iframe");
  if (!iframe) return;
  iframe.srcdoc = buildNewsletterEmailHtml();
}

async function copyNewsletterHtml() {
  if (!newsletterDraft) {
    alert("먼저 뉴스레터를 생성해 주세요.");
    return;
  }
  const html = buildNewsletterEmailHtml();
  try {
    await navigator.clipboard.writeText(html);
    alert("뉴스레터 HTML을 클립보드에 복사했습니다. 이메일 발송 도구의 HTML 편집기에 붙여넣어 사용하세요.");
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    alert("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
  }
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
// AI Provider API Key Settings (Claude for writing, Gemini for images)
// & AI Writing Styles Learning / Generation Logic
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
    statusSpan.textContent = "API Key가 설정되지 않았습니다. 숏폼(Shorts) 참고영상 스타일 분석(참고 영상을 업로드해 분위기·톤을 분석하는 기능) 기능을 사용하려면 등록하십시오.";
    statusSpan.style.color = "#fbbf24"; // yellow
  }
}

// Two shared "논조" reference styles the newsroom studies, seeded once and then
// refined over time via the AI 글쓰기 학습 page. Each admin also gets their own
// personal style container that only their samples feed into.
const GLOBAL_STYLE_PRESETS = [
  {
    name: "시민언론 민들레",
    description: "권력과 자본에 대한 비판적 문제의식을 바탕으로, 노동·인권·환경 등 구조적 이슈를 심층 추적하는 진보 성향의 탐사보도 매체입니다.",
    styleRules: [
      "권력기관, 자본, 기득권에 대한 비판적 관점을 명확히 드러낸다",
      "노동자, 소수자, 사회적 약자의 목소리와 구체적 증언을 중심에 둔다",
      "표면적 사실 나열보다 구조적 원인과 책임 소재를 끝까지 추적한다",
      "날카롭고 선명한 은유와 단정적인 문장으로 논지를 전달한다",
      "현장 취재와 자료에 기반한 탐사보도 형식을 선호한다",
      "결론에서 연대와 대안적 행동을 촉구하는 어조를 취한다"
    ]
  },
  {
    name: "오마이뉴스",
    description: "'모든 시민은 기자다'라는 창간 정신에 따라 시민 기자의 생생한 현장 경험과 진보적 시각을 결합한 시민 저널리즘 매체입니다.",
    styleRules: [
      "생활 속 구체적 장면 묘사나 개인적 경험으로 기사를 시작한다",
      "따옴표를 활용한 인용형·대화체 제목을 즐겨 쓴다",
      "직설적이고 생생한 구어체 어조를 사용한다",
      "정치·사회 권력에 대해 비판적이고 개혁적인 시각을 견지한다",
      "기자 개인의 소감이나 문제의식을 1인칭으로 드러내는 경우가 많다",
      "약자와 시민의 눈높이에서 사안을 바라보는 서술을 우선한다"
    ]
  }
];

async function seedGlobalStyles() {
  const styles = await window.SupabaseAdapter.fetchWritingStyles();
  for (const preset of GLOBAL_STYLE_PRESETS) {
    const exists = styles.some(s => s.name === preset.name && s.scope !== 'personal');
    if (!exists) {
      const newStyle = {
        id: crypto.randomUUID ? crypto.randomUUID() : 'style-' + Date.now() + Math.random().toString(36).slice(2),
        name: preset.name,
        description: preset.description,
        styleRules: preset.styleRules,
        scope: 'global',
        ownerEmail: ''
      };
      await window.SupabaseAdapter.saveWritingStyle(newStyle);
    }
  }
}

async function getOrCreatePersonalStyle(session) {
  const styles = await window.SupabaseAdapter.fetchWritingStyles();
  let personal = styles.find(s => s.scope === 'personal' && s.ownerEmail === session.email);
  if (personal) return personal;

  personal = {
    id: crypto.randomUUID ? crypto.randomUUID() : 'style-' + Date.now() + Math.random().toString(36).slice(2),
    name: `${session.name}의 개인 문체`,
    description: `${session.name} 기자가 직접 학습시킨 개인 문체입니다.`,
    styleRules: [],
    scope: 'personal',
    ownerEmail: session.email
  };
  await window.SupabaseAdapter.saveWritingStyle(personal);
  return personal;
}

// Populates a generation-mode <select> with: 기본(중립) + 공용 논조 스타일 + 내 개인 문체
async function populateStyleSelect(selectEl) {
  if (!selectEl) return;
  const session = getAdminSession();
  const styles = await window.SupabaseAdapter.fetchWritingStyles();

  const globalStyles = styles.filter(s => s.scope !== 'personal');
  const personalStyle = session ? styles.find(s => s.scope === 'personal' && s.ownerEmail === session.email) : null;

  let html = '<option value="">-- 기본 스타일 (중립) --</option>';

  if (globalStyles.length > 0) {
    html += '<optgroup label="공용 논조 스타일">';
    globalStyles.forEach(s => {
      html += `<option value="${s.id}">${s.name} (${(s.styleRules || []).length}개 규칙)</option>`;
    });
    html += '</optgroup>';
  }

  if (personalStyle) {
    html += '<optgroup label="내 개인 문체">';
    html += `<option value="${personalStyle.id}">${personalStyle.name} (${(personalStyle.styleRules || []).length}개 규칙)</option>`;
    html += '</optgroup>';
  }

  selectEl.innerHTML = html;
}

async function loadWritingStyles() {
  await seedGlobalStyles();
  await populateStyleSelect(document.getElementById("ai-topic-style"));
  await populateStyleSelect(document.getElementById("ai-link-style"));
  await populateStyleSelect(document.getElementById("ai-trending-style"));
  await populateStyleSelect(document.getElementById("ai-info-style"));
}

// Scrapes an external article URL's main body text -- tries the jina.ai reader
// first (clean text, no HTML parsing needed), falling back to the CORS-proxy +
// DOM-selector approach if that fails.
async function scrapeExternalLink(url) {
  if (!url) return "";

  try {
    const markdown = await fetchViaJinaReader(url);
    const cleaned = markdown.replace(/^Title:.*\n+URL Source:.*\n+Markdown Content:\n*/s, '').trim();
    if (cleaned.length > 100) {
      return cleaned.replace(/\s+/g, ' ').trim();
    }
  } catch (err) {
    console.warn("jina.ai reader 실패, HTML 프록시로 재시도합니다:", err);
  }

  try {
    const html = await fetchViaCorsProxy(url);

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

// Claude (Anthropic) API caller -- used for all text/writing generation (article
// drafts, self-check grading, writing-style analysis, image prompt writing).
// Actual image pixel generation stays on Gemini (see generateGeminiImage below).
// Runs through the server-side proxy (api/claude-proxy.js), which holds the
// key (Vercel env var CLAUDE_API_KEY) and resolves the model, so the admin
// no longer has to register a Claude key per device/browser.
async function callClaudeApi(prompt, systemInstruction = "") {
  const response = await fetch("https://baikalnews.com/api/claude-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, systemInstruction })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API 호출 실패 (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.text) {
    throw new Error("Claude API가 올바른 응답 양식을 반환하지 않았습니다.");
  }
  return data.text;
}

// Learning style loop
// Accumulates a new sample into an EXISTING style record (personal or global) --
// this is the "이런 식으로 써줘" repeated-training mechanism.
async function learnWritingStyle(styleId, sourceUrl, textContent) {
  if (!styleId || !textContent) {
    throw new Error("학습 대상 스타일과 분석할 본문 텍스트가 모두 필요합니다.");
  }

  const styles = await window.SupabaseAdapter.fetchWritingStyles();
  const existingStyle = styles.find(s => s.id === styleId);
  if (!existingStyle) {
    throw new Error("학습 대상 스타일을 찾을 수 없습니다.");
  }

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

  const analysisResultText = await callClaudeApi(analysisPrompt, "You are a professional writing style analyzer. Answer strictly in JSON format matching the specifications.");
  const analysisJson = parseAiJsonResponse(analysisResultText);

  // Merge rules (avoid duplicates)
  const currentRules = existingStyle.styleRules || [];
  const newRules = analysisJson.rules || [];
  const mergedRules = Array.from(new Set([...currentRules, ...newRules]));

  existingStyle.description = analysisJson.description || existingStyle.description;
  existingStyle.styleRules = mergedRules;
  await window.SupabaseAdapter.saveWritingStyle(existingStyle);

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
    description: existingStyle.description,
    rules: mergedRules,
    title: analysisJson.title
  };
}

// ==========================================================
// AI 글쓰기 학습 (style training) tab
// ==========================================================
let currentTrainingStyleId = null;

async function populateTrainingStyleSelect() {
  const select = document.getElementById("training-style-select");
  if (!select) return;

  const session = getAdminSession();
  const styles = await window.SupabaseAdapter.fetchWritingStyles();
  const globalStyles = styles.filter(s => s.scope !== 'personal');
  let personalStyle = session ? styles.find(s => s.scope === 'personal' && s.ownerEmail === session.email) : null;
  if (session && !personalStyle) {
    personalStyle = await getOrCreatePersonalStyle(session);
  }

  let html = '';
  if (personalStyle) {
    html += `<optgroup label="내 개인 문체"><option value="${personalStyle.id}">${personalStyle.name}</option></optgroup>`;
  }
  if (globalStyles.length > 0) {
    html += '<optgroup label="공용 논조 스타일">';
    globalStyles.forEach(s => { html += `<option value="${s.id}">${s.name}</option>`; });
    html += '</optgroup>';
  }
  html += '<option value="__new__">+ 새 공용 스타일 만들기</option>';

  select.innerHTML = html;

  if (!currentTrainingStyleId || !styles.some(s => s.id === currentTrainingStyleId)) {
    currentTrainingStyleId = personalStyle ? personalStyle.id : (globalStyles[0] ? globalStyles[0].id : null);
  }
  if (currentTrainingStyleId) select.value = currentTrainingStyleId;

  onTrainingStyleSelectChange();
}

function onTrainingStyleSelectChange() {
  const select = document.getElementById("training-style-select");
  const newNameGroup = document.getElementById("training-new-style-name-group");
  if (!select) return;

  if (select.value === '__new__') {
    currentTrainingStyleId = null;
    if (newNameGroup) newNameGroup.style.display = 'block';
    renderTrainingStyleDetail(null);
  } else {
    currentTrainingStyleId = select.value;
    if (newNameGroup) newNameGroup.style.display = 'none';
    renderTrainingStyleDetail(currentTrainingStyleId);
  }
}

async function renderTrainingStyleDetail(styleId) {
  const detailEl = document.getElementById("training-style-detail");
  const samplesEl = document.getElementById("training-samples-list");
  if (!detailEl || !samplesEl) return;

  if (!styleId) {
    detailEl.innerHTML = '<div class="help-text">새 스타일 이름을 입력하고 첫 샘플을 학습시켜 주세요.</div>';
    samplesEl.innerHTML = '';
    return;
  }

  const styles = await window.SupabaseAdapter.fetchWritingStyles();
  const style = styles.find(s => s.id === styleId);
  if (!style) {
    detailEl.innerHTML = '<div class="help-text">스타일 정보를 찾을 수 없습니다.</div>';
    samplesEl.innerHTML = '';
    return;
  }

  detailEl.innerHTML = `
    <p style="font-size: 0.85rem; color: var(--admin-text-secondary); margin-bottom: 10px;">${style.description || '아직 분석된 설명이 없습니다.'}</p>
    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
      ${(style.styleRules || []).map(r => `<span class="ai-tag">${r}</span>`).join('') || '<span class="help-text">아직 학습된 규칙이 없습니다.</span>'}
    </div>
    ${style.scope !== 'personal' ? `<button type="button" class="btn-admin btn-admin-danger" style="margin-top: 16px;" onclick="deleteStyleFromTraining('${style.id}')">이 스타일 삭제</button>` : ''}
  `;

  const samples = await window.SupabaseAdapter.fetchWritingSamples(styleId);
  if (samples.length === 0) {
    samplesEl.innerHTML = '<div class="help-text">아직 학습시킨 샘플이 없습니다.</div>';
  } else {
    samplesEl.innerHTML = samples.map(s => `
      <div class="training-sample-item">
        <div>
          <strong>${s.title}</strong>
          <div class="help-text">${new Date(s.createdAt).toLocaleString("ko-KR")}${s.url ? ` · <a href="${s.url}" target="_blank" rel="noopener">원문 링크</a>` : ''}</div>
        </div>
        <button type="button" class="btn-admin btn-admin-danger" onclick="deleteSampleFromTraining('${s.id}', '${styleId}')">삭제</button>
      </div>
    `).join('');
  }
}

async function submitStyleTraining() {
  const select = document.getElementById("training-style-select");
  const newNameInput = document.getElementById("training-new-style-name");
  const urlInput = document.getElementById("training-sample-url");
  const textInput = document.getElementById("training-sample-text");
  const submitBtn = document.getElementById("training-submit-btn");

  const url = urlInput.value.trim();
  let text = textInput.value.trim();

  if (!url && !text) {
    alert("학습시킬 기사 링크(URL) 또는 본문 텍스트 중 하나는 반드시 입력해야 합니다.");
    return;
  }

  let styleId = select.value;
  if (styleId === '__new__') {
    const newName = newNameInput.value.trim();
    if (!newName) {
      alert("새 스타일의 이름을 입력해 주세요.");
      return;
    }
    const newStyle = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'style-' + Date.now(),
      name: newName,
      description: `${newName} 기사 스타일`,
      styleRules: [],
      scope: 'global',
      ownerEmail: ''
    };
    await window.SupabaseAdapter.saveWritingStyle(newStyle);
    styleId = newStyle.id;
  }

  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;

  try {
    if (!text && url) {
      submitBtn.textContent = "원문을 가져오는 중...";
      try {
        text = await scrapeExternalLink(url);
      } catch (err) {
        throw new Error("링크에서 본문을 가져오지 못했습니다. 본문 텍스트를 직접 붙여넣어 주세요.");
      }
    }

    if (!text || text.length < 50) {
      throw new Error("학습할 본문이 너무 짧거나 비어 있습니다. 본문을 더 길게 붙여넣어 주세요.");
    }

    submitBtn.textContent = "문체를 분석하고 학습하는 중...";
    await learnWritingStyle(styleId, url, text);

    urlInput.value = "";
    textInput.value = "";
    if (newNameInput) newNameInput.value = "";

    currentTrainingStyleId = styleId;
    await populateTrainingStyleSelect();
    await loadWritingStyles();

    alert("학습이 완료되었습니다. 이 스타일로 기사를 생성하면 방금 배운 문체가 반영됩니다.");
  } catch (err) {
    console.error("Style training error:", err);
    alert("학습 실패: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

async function deleteSampleFromTraining(sampleId, styleId) {
  if (!confirm("이 학습 샘플을 삭제하시겠습니까?")) return;
  await window.SupabaseAdapter.deleteWritingSample(sampleId);
  await renderTrainingStyleDetail(styleId);
}

async function deleteStyleFromTraining(styleId) {
  if (!confirm("이 스타일과 학습된 모든 샘플을 삭제하시겠습니까?")) return;
  await window.SupabaseAdapter.deleteWritingStyle(styleId);
  currentTrainingStyleId = null;
  await populateTrainingStyleSelect();
  await loadWritingStyles();
}
