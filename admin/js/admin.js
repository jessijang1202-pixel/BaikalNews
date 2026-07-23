// Baikal News - Admin CMS Javascript Logic
document.addEventListener("DOMContentLoaded", () => {
  initAdminAuth();
  setupEventListeners();
  loadGeminiApiKey();
  loadClaudeApiKey();
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
    <div class="stat-value">2026년 8월 15일</div>
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
  const validTabs = ['dashboard', 'articles', 'article-editor', 'ai-writer', 'ai-training', 'shorts', 'newsletter', 'subscribers', 'curation', 'api-costs', 'settings'];
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
    'ai-writer': "AI 어시스턴트 집필실",
    'ai-training': "AI 글쓰기 학습",
    shorts: "숏폼 자동 생성",
    newsletter: "뉴스레터",
    subscribers: "구독자 관리",
    curation: "홈화면 큐레이션 통제",
    'api-costs': "API 사용 비용 관리",
    settings: "설정"
  };
  const titleEl = document.getElementById("current-tab-title");
  if (titleEl) {
    titleEl.textContent = titles[tabName] || "바이칼 뉴스 어드민";
  }

  // Refresh lists if switching to specific tabs
  if (tabName === 'dashboard') {
    await refreshStats();
    await renderPendingList();
    await renderTopViewedList();
    await renderViewsChart();
    await renderScheduledList();
  } else if (tabName === 'articles') {
    await renderArticlesList();
  } else if (tabName === 'ai-writer') {
    loadGeminiApiKey();
    loadClaudeApiKey();
    await loadWritingStyles();
  } else if (tabName === 'ai-training') {
    loadGeminiApiKey();
    loadClaudeApiKey();
    await populateTrainingStyleSelect();
  } else if (tabName === 'shorts') {
    loadGeminiApiKey();
    loadClaudeApiKey();
    await renderShortsList();
  } else if (tabName === 'newsletter') {
    await loadOrGenerateNewsletterDraft();
  } else if (tabName === 'subscribers') {
    await renderNewsletterSubscriberBriefing();
  } else if (tabName === 'curation') {
    await populateCurationDropdowns();
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

// Dashboard 예약 발행 내역 table -- every article still flagged 'scheduled',
// soonest scheduledAt first (there's no server cron to flip status once the
// time passes, so this can include entries whose time has already arrived).
async function renderScheduledList() {
  const listEl = document.getElementById("dashboard-scheduled-list");
  const panelEl = document.getElementById("dashboard-scheduled-panel");
  if (!listEl) return;

  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  const scheduled = articles
    .filter(a => a.status === 'scheduled')
    .slice()
    .sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0));

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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--admin-text-muted);">등록된 기사가 없습니다. 새 기사를 추가하거나 AI로 작성해 보세요.</td></tr>`;
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

    let shortsButton = '';
    if (shortsEligibleStatuses.includes(art.status)) {
      const completedShorts = shorts.find(s => s.articleId === art.id && s.status === 'video_ready');
      shortsButton = completedShorts
        ? `<a onclick="openShortsFromArticleList(${completedShorts.id})" class="shorts-status-box shorts-status-done">숏폼완료</a>`
        : `<a onclick="createShortsFromArticle(${art.id})" class="shorts-status-box shorts-status-create">숏폼생성</a>`;
    }

    return `
    <tr>
      <td class="article-select-col"><input type="checkbox" class="article-select-checkbox" value="${art.id}"></td>
      <td>${rowNumber}</td>
      <td style="font-weight: 500; color: var(--admin-text-primary); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${art.title}</td>
      <td>
        <select class="form-control-admin" style="font-size: 0.78rem; padding: 4px 8px; width: auto;" onchange="changeArticleApprover(${art.id}, this.value)">
          <option value="" ${!art.approver ? 'selected' : ''}>미지정</option>
          <option value="최상락" ${art.approver === '최상락' ? 'selected' : ''}>최상락</option>
          <option value="장승희" ${art.approver === '장승희' ? 'selected' : ''}>장승희</option>
        </select>
      </td>
      <td><span class="badge ${statusInfo.cls}">${statusInfo.label}</span></td>
      <td style="white-space: nowrap;">${art.date}</td>
      <td>${(art.views || 0).toLocaleString("ko-KR")}</td>
      <td class="action-links">
        <a onclick="editArticle(${art.id})">편집</a>
        <a onclick="previewArticle(${art.id})">미리보기</a>
        ${shortsButton}
        <a onclick="duplicateArticle(${art.id})" style="color: var(--admin-text-secondary);">복사</a>
      </td>
    </tr>
  `;
  }).join('');
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

// Quick-edit the approver directly from the 기사 관리 list, without opening
// the full editor. Keeps byline in sync with the approver, matching the
// existing convention (approver name doubles as the article's byline).
async function changeArticleApprover(id, newApprover) {
  let articles = [];
  if (window.SupabaseAdapter) {
    articles = await window.SupabaseAdapter.fetchArticles();
  }
  const art = articles.find(a => a.id === id);
  if (!art) {
    alert("승인인 변경 실패: 목록에서 해당 기사를 찾지 못했습니다 (ID: " + id + ").");
    await renderArticlesList();
    return;
  }

  art.approver = newApprover || null;
  art.byline = newApprover ? `${newApprover} 기자` : "";

  await window.SupabaseAdapter.saveArticle(art);

  // saveArticle() silently falls back to LocalStorage-only if the Supabase
  // write itself fails (e.g. no RLS UPDATE policy on articles), without
  // surfacing that failure to the caller -- so verify directly against the
  // database here instead of trusting the return value.
  if (window.SupabaseAdapter.isConfigured()) {
    const verify = await window.SupabaseAdapter.fetchArticleById(id);
    if (!verify || (verify.approver || null) !== (newApprover || null)) {
      alert("승인인 변경이 데이터베이스에 저장되지 않았습니다. Supabase의 articles 테이블에 UPDATE 권한(RLS 정책)이 있는지 확인해 주세요.");
    }
  }

  await logAudit("승인인 변경", art.id, `기사 관리 목록에서 승인인을 '${newApprover || '미지정'}'(으)로 직접 변경했습니다.`);
  await renderArticlesList();
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
  document.getElementById("form-subtitle").value = art.subtitle || "";
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
    scheduledAt: null,
    revisionHistory: [{"date": new Date().toLocaleString("ko-KR"), "action": "기사 복제본 초안 생성"}]
  };

  if (window.SupabaseAdapter) {
    await window.SupabaseAdapter.saveArticle(duplicated);
  }
  await logAudit("기사 복제", duplicated.id, `기사 #${art.id}을 바탕으로 신규 초안 #${duplicated.id}을 만듦.`);
  await renderArticlesList();
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
  const subtitle = document.getElementById("form-subtitle").value;
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

function parseAiJsonResponse(resultText) {
  const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleanedText);
  } catch (err) {
    console.error("AI output parsing failed. Raw text:", resultText);
    throw new Error("AI 응답 결과 파싱에 실패했습니다: " + err.message);
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
2. "subtitle": 제목과 겹치지 않게 기사의 핵심 내용을 한 문장으로 압축한 부제목 (핵심 요약, 30자 내외)
3. "lead": 독자의 관심을 끄는 2~3문장의 흡입력 있는 리드 문단
4. "body": 2개 이상의 <h2> 소제목을 포함하고 적절한 <p> 단락들로 구성된 뉴스 본문 HTML 코드. 문장 어조와 관점은 지정된 논조 스타일을 완벽하게 재현해야 합니다. (전체 분량 공백 제외 ${targetLength}자 내외로 상세하게 작성)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callClaudeApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, subtitle: draft.subtitle, lead: draft.lead, body: draft.body, category,
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
1. "title": 지정된 논조 스타일을 반영하고 핵심 키워드를 포함한 새로운 독창적 기사 제목
2. "subtitle": 제목과 겹치지 않게 기사의 핵심 내용을 한 문장으로 압축한 부제목 (핵심 요약, 30자 내외)
3. "lead": 독자의 관심을 끄는 2~3문장의 리드 문단
4. "body": 2개 이상의 <h2> 소제목과 <p> 단락으로 구성된 새 기사 본문 HTML (전체 분량 공백 제외 ${targetLength}자 내외)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callClaudeApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, subtitle: draft.subtitle, lead: draft.lead, body: draft.body, category,
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
    if (unique.length >= 15) break;
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
    if (unique.length >= 15) break;
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

  // Gemini로 배경 자료 보강 -- 원문 스크랩은 CORS 프록시에 의존해 실패하기 쉬우므로,
  // 성공 여부와 무관하게 Gemini의 배경지식으로 맥락을 추가 수집해 둔다. 글쓰기 자체는
  // 그대로 Claude가 담당한다.
  setAiLoaderText("Gemini로 배경 자료를 수집하는 중...");
  let researchNotes = "";
  try {
    researchNotes = await callGeminiTextApi(
      `"${selectedTrendingArticle.title}"라는 오늘의 화제 뉴스 제목에 대해, 이 사안의 배경, 관련 맥락, 일반적으로 알려진 사실관계를 한국어로 5~8문장으로 정리해 주십시오. 확실하지 않은 내용은 추측하지 말고, 알려진 배경 정보 위주로 작성하십시오.`,
      "당신은 신속하게 뉴스 배경 자료를 조사해 정리하는 리서치 어시스턴트입니다."
    );
  } catch (err) {
    console.warn("Gemini 자료수집 실패, 스크랩 원문만 사용합니다:", err);
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
1. "title": 지정된 논조 스타일을 반영하고 핵심 키워드를 포함한 새로운 독창적 기사 제목
2. "subtitle": 제목과 겹치지 않게 기사의 핵심 내용을 한 문장으로 압축한 부제목 (핵심 요약, 30자 내외)
3. "lead": 독자의 관심을 끄는 2~3문장의 리드 문단
4. "body": 2개 이상의 <h2> 소제목과 <p> 단락으로 구성된 새 기사 본문 HTML (전체 분량 공백 제외 ${targetLength}자 내외)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callClaudeApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, subtitle: draft.subtitle, lead: draft.lead, body: draft.body, category,
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
2. "subtitle": 제목과 겹치지 않게 기사의 핵심 내용을 한 문장으로 압축한 부제목 (핵심 요약, 30자 내외)
3. "lead": 핵심 정보를 요약하는 2~3문장의 리드 문단
4. "body": 2개 이상의 <h2> 소제목과 <p> 단락으로 구성된 본문 HTML (신청 대상/방법/유의사항 등 실용 정보 포함, 전체 분량 공백 제외 ${targetLength}자 내외)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callClaudeApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, subtitle: draft.subtitle, lead: draft.lead, body: draft.body, category,
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

    const { headline, subtitle, lead, body, category, seoTitle, seoMeta, slug, keywords } = result;
    const finalSlug = slugify(slug) || `article-${Date.now()}`;
    const finalKeywords = Array.isArray(keywords) ? keywords : [];

    generatedDraftData = {
      title: headline,
      subtitle: subtitle || `${AI_CATEGORY_LABELS[category] || category} 부문 AI 작성 초안`,
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
    document.getElementById("ai-out-subtitle").textContent = generatedDraftData.subtitle;
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
  document.getElementById("form-subtitle").value = generatedDraftData.subtitle;
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
// Ordered article IDs for 많이 읽은 인기 기사 -- membership is always the
// current top-5-by-views, admins can only reorder these via the ▲/▼ list.
let curationPopularOrder = [];
const CURATION_POPULAR_COUNT = 5;

function computeAutoPopularIds(published, count) {
  return published.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, count).map(a => a.id);
}

async function populateCurationDropdowns() {
  const publishedSelects = [
    "curate-hero",
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

  if (curation.featuredHeroId) document.getElementById("curate-hero").value = curation.featuredHeroId;
  applyValues(curation.latestNewsIds, "curate-latest");

  // 많이 읽은 인기 기사: trust the saved order only if it's still the exact
  // same set of articles the current view counts would auto-select -- if
  // membership drifted (a new article rose into the top 5), reset to the
  // fresh view-count order rather than let a stale pick linger.
  const autoIds = computeAutoPopularIds(published, CURATION_POPULAR_COUNT);
  const savedIds = curation.popularReadsIds || [];
  const sameSet = savedIds.length === autoIds.length && autoIds.every(id => savedIds.includes(id));
  curationPopularOrder = sameSet ? savedIds.slice() : autoIds;
  renderCurationPopularList();

  // Render the initial preview for every slot
  publishedSelects.forEach(selectId => updateCurationPreview(selectId));
}

function renderCurationPopularList() {
  const container = document.getElementById("curate-pop-auto-list");
  if (!container) return;

  if (curationPopularOrder.length === 0) {
    container.innerHTML = `<div class="help-text">조회수가 집계된 발행 기사가 없습니다.</div>`;
    return;
  }

  container.innerHTML = curationPopularOrder.map((id, i) => {
    const art = curationArticlesCache.find(a => a.id === id);
    if (!art) return '';
    const imageUrl = /^https?:\/\//i.test(art.image || '') ? art.image : `https://baikalnews.com/${art.image || 'images/news_editorial.png'}`;
    return `
      <div style="display:flex; align-items:center; gap:10px; border:1px solid var(--admin-border); border-radius:6px; padding:8px;">
        <span style="font-weight:700; color: var(--admin-text-muted); width: 18px; text-align:center;">${i + 1}</span>
        <img src="${imageUrl}" alt="" style="width:44px; height:44px; object-fit:cover; border-radius:4px; flex-shrink:0;" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${art.title}</div>
          <div style="font-size:0.72rem; color:var(--admin-text-secondary);">조회수 ${(art.views || 0).toLocaleString("ko-KR")}회</div>
        </div>
        <button type="button" class="btn-admin btn-admin-secondary" style="padding:4px 10px;" onclick="moveCurationPopularItem(${i}, -1)" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" class="btn-admin btn-admin-secondary" style="padding:4px 10px;" onclick="moveCurationPopularItem(${i}, 1)" ${i === curationPopularOrder.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
    `;
  }).join('');
}

function moveCurationPopularItem(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= curationPopularOrder.length) return;
  const tmp = curationPopularOrder[index];
  curationPopularOrder[index] = curationPopularOrder[newIndex];
  curationPopularOrder[newIndex] = tmp;
  renderCurationPopularList();
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
      <img src="${imageUrl}" alt="" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
      <span>${art.title}</span>
    </div>
  `;
}

async function saveCurationSettings() {
  const heroId = parseInt(document.getElementById("curate-hero").value, 10);

  const readSlots = (prefix, count) => {
    const ids = [];
    for (let i = 1; i <= count; i++) {
      const val = parseInt(document.getElementById(`${prefix}-${i}`).value, 10);
      if (!isNaN(val)) ids.push(val);
    }
    return ids;
  };

  if (isNaN(heroId)) {
    alert("최소한 메인 추천 탑 뉴스는 1건 지정해야 홈화면 배포가 가능합니다.");
    return;
  }

  const newCuration = {
    featuredHeroId: heroId,
    latestNewsIds: readSlots("curate-latest", 3),
    editorsPicksIds: [],
    popularReadsIds: curationPopularOrder.slice(),
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
      const matches = verify && verify.featuredHeroId === newCuration.featuredHeroId &&
        JSON.stringify(verify.popularReadsIds || []) === JSON.stringify(newCuration.popularReadsIds) &&
        JSON.stringify(verify.latestNewsIds || []) === JSON.stringify(newCuration.latestNewsIds);
      if (!matches) {
        alert("큐레이션 저장이 데이터베이스에 반영되지 않았습니다. Supabase의 curation 테이블에 latest_news_ids 컬럼이 있는지, UPDATE 권한(RLS 정책)이 있는지 확인해 주세요.");
        return;
      }
    }
  }
  await logAudit("홈화면 큐레이션 개정", null, `헤드라인 기사 ID: #${heroId}로 정렬 배포함.`);
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
        <img src="${displaySrc}" class="media-img" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
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
async function uploadRawBlobToStorage(blob, ext) {
  const client = window.SupabaseAdapter && window.SupabaseAdapter.getClient();
  if (!client) {
    throw new Error("Supabase가 연결되어 있지 않습니다.");
  }

  const path = `articles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
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
async function uploadImageToStorage(fileOrBlob, extHint) {
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

  const { publicUrl } = await uploadRawBlobToStorage(uploadBlob, ext);
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
function updateFormImagePreview() {
  const input = document.getElementById("form-image");
  const preview = document.getElementById("form-image-preview");
  if (!input || !preview) return;

  const url = input.value.trim();
  if (!url) {
    preview.style.display = "none";
    return;
  }
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
    const url = await uploadImageToStorage(file);
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

// Resolves an image-generation-capable Gemini model for this API key (same
// self-healing auto-discovery approach as resolveClaudeModel(), filtered to image models).
async function resolveGeminiImageModel(apiKey) {
  const cacheKey = "baikal_gemini_image_model";
  const cacheTimeKey = "baikal_gemini_image_model_cached_at";
  const cached = localStorage.getItem(cacheKey);
  const cachedAt = parseInt(localStorage.getItem(cacheTimeKey) || "0", 10);
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (cached && (Date.now() - cachedAt) < oneDayMs) {
    return cached;
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error("모델 목록을 가져오지 못했습니다 (HTTP " + res.status + ")");
  const data = await res.json();
  const models = (data.models || []).filter(m =>
    (m.supportedGenerationMethods || []).includes("generateContent") && /image/i.test(m.name)
  );

  if (models.length === 0) {
    throw new Error("이 API 키로 사용 가능한 이미지 생성 모델을 찾지 못했습니다. Google AI Studio에서 이미지 생성 모델 접근 권한을 확인해 주세요.");
  }

  const chosen = models.find(m => /flash/i.test(m.name)) || models[0];
  const modelName = chosen.name.replace(/^models\//, '');
  localStorage.setItem(cacheKey, modelName);
  localStorage.setItem(cacheTimeKey, String(Date.now()));
  return modelName;
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
// Only appended for the article representative image (triggerAiImageGeneration) --
// that slot is always displayed in a 16:9 box (object-fit:cover), and Gemini's
// image model otherwise defaults to a square 1:1 output, which forces a harsh
// crop that cuts off headroom/context instead of a properly composed shot.
const IMAGE_ASPECT_RATIO_RULE = "\n\nCOMPOSITION: Wide horizontal 16:9 landscape composition (not square, not portrait). Compose the shot with this widescreen framing in mind, leaving natural headroom/context at top and bottom rather than a tightly cropped square subject.";

async function generateGeminiImage(promptText) {
  const apiKey = localStorage.getItem("baikal_gemini_key");
  if (!apiKey) {
    throw new Error("Gemini API Key가 등록되지 않았습니다. AI 집필실 상단에서 먼저 등록해 주세요.");
  }

  const model = await resolveGeminiImageModel(apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: promptText + IMAGE_REALISM_RULE + IMAGE_TEXT_LANGUAGE_RULE + IMAGE_NO_RAIN_RULE + MEDIA_KOREAN_PEOPLE_RULE }] }] })
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 404) {
      localStorage.removeItem("baikal_gemini_image_model");
      localStorage.removeItem("baikal_gemini_image_model_cached_at");
    }
    throw new Error(`AI 이미지 생성 실패 (HTTP ${response.status}, 모델: ${model}): ${errText}`);
  }

  const data = await response.json();
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const imagePart = parts.find(p => p.inlineData && p.inlineData.data);
  if (!imagePart) {
    throw new Error("AI가 이미지를 반환하지 않았습니다. 프롬프트를 조금 더 구체적으로 작성해 보세요.");
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
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
  captionEl.value = title ? `${title} 관련 현장 취재 자료.` : "현장 취재 자료.";
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
    const publicUrl = await uploadImageToStorage(blob, ext);

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
      prompt: c.prompt, narrationText: c.narrationText || '', caption: c.caption, duration: c.duration,
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

async function populateShortsArticleSelect() {
  const select = document.getElementById("shorts-article-select");
  const articles = await window.SupabaseAdapter.fetchArticles();
  const usable = articles.filter(a => ['published', 'approved', 'scheduled'].includes(a.status));
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
  const narrationStatusEl = document.getElementById("shorts-narration-status");
  if (narrationStatusEl) narrationStatusEl.textContent = "각 컷 화면에 나올 자막을 그대로 읽습니다. 생성하지 않으면 무음(또는 Veo 클립 자체 소리)만 남습니다.";
  const hookAudioEl = document.getElementById("shorts-hook-narration-preview");
  if (hookAudioEl) { hookAudioEl.style.display = "none"; hookAudioEl.src = ""; }
  const selfCheckEl = document.getElementById("shorts-selfcheck-section");
  if (selfCheckEl) selfCheckEl.style.display = "none";
  const veoPromptEditorEl = document.getElementById("shorts-veo-prompt-editor");
  if (veoPromptEditorEl) veoPromptEditorEl.style.display = "none";
  document.getElementById("shorts-media-preview").innerHTML = "";
  document.getElementById("shorts-media-status").textContent = "";
  document.getElementById("shorts-assembly-status").textContent = "녹화 중에는 이 탭을 벗어나지 마세요 (화면을 그대로 녹화합니다).";
  shortsPendingUploads = [];
  renderShortsPendingUploads();
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
  loadClaudeApiKey();
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
  }

  document.getElementById("shorts-wizard-panel").style.display = "block";
  ensureShortsStoragePersisted();
  loadGeminiApiKey();
  loadClaudeApiKey();
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
    captionPosition: draft.captionPosition
  };
  shortsAssets = null;

  try {
    if (draft.hasFront) {
      const blob = await idbGetBlob(`${localDraftId}:front`);
      if (blob) currentShortsProject.veoVideoUrl = URL.createObjectURL(blob);
    }
    if (draft.hasFinal) {
      const blob = await idbGetBlob(`${localDraftId}:final`);
      if (blob) {
        currentShortsProject.finalVideoUrl = URL.createObjectURL(blob);
        currentShortsProject.finalVideoMimeType = blob.type;
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
      }
    }
    for (const cut of currentShortsProject.imageCuts) {
      if (cut.imageKey) {
        const blob = await idbGetBlob(cut.imageKey);
        if (blob) cut.imageUrl = URL.createObjectURL(blob);
      }
      if (cut.narrationKey) {
        const blob = await idbGetBlob(cut.narrationKey);
        if (blob) {
          cut.narrationUrl = URL.createObjectURL(blob);
          cut.narrationBase64 = await blobToBase64DataUrl(blob);
        }
      }
    }
  } catch (err) {
    console.warn("로컬 미디어 복원 중 일부 실패:", err);
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
  }
  document.getElementById("shorts-wizard-panel").style.display = "block";
  ensureShortsStoragePersisted();
  loadGeminiApiKey();
  loadClaudeApiKey();
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
        captionPosition: currentShortsProject.captionPosition
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

    const frontInstruction = hasFrontUpload
      ? `- 0:00~0:08 (전반)은 관리자가 이미 준비한 영상/사진을 사용합니다. "veoPrompt"는 빈 문자열("")로 반환하십시오.`
      : `- 0:00~0:08 (Veo): 실사 다큐멘터리/기록영상 톤의 8초 연속 장면 하나를 한글 프롬프트로 묘사하십시오. 카메라 움직임, 장소, 분위기를 구체적으로 묘사하되 일러스트/애니메이션 스타일은 피하십시오.`;
    const backInstruction = neededAiCuts > 0
      ? `- 0:08~0:30 (이미지, 22초): ${neededAiCuts}개의 정지 이미지 컷을 작성하십시오. (전체 ${SHORTS_TARGET_CUT_COUNT}컷 중 ${backUploads.length}개는 관리자가 이미 준비한 자료를 사용하므로 나머지 ${neededAiCuts}개만 작성하면 됩니다.) 각 컷은 한글 이미지 생성 프롬프트(다큐멘터리 사진 스타일, 세로 구도), 나레이션으로 읽을 자연스러운 한 문장(자막보다 길고 설명적으로), 화면에 표시할 한국어 자막(15자 내외, 짧고 임팩트 있게 -- 나레이션 문장의 요약이 아니라 완전히 별도의 짧은 문구), 지속 시간(초, ${perCutDuration}초 내외)을 포함해야 합니다.`
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

반드시 다음 JSON 형식으로만 답하십시오. 백틱이나 다른 설명 없이 JSON 객체만 출력하십시오.
{
  "hookText": "0:00~0:03 자막에 사용할 강력한 후킹 문구 (15자 내외)",
  "veoPrompt": "0:00~0:08 Veo 영상용 한글 프롬프트 (후킹 장면 포함, 위 지침에 따라 빈 문자열일 수 있음)",
  "imageCuts": [
    { "prompt": "한글 이미지 프롬프트", "narration": "이 컷에서 나레이션으로 읽을 자연스러운 한 문장 (자막보다 길고 설명적으로)", "caption": "화면에 표시할 짧고 임팩트있는 자막 (15자 내외)", "duration": ${perCutDuration} }
  ],
  "scriptMd": "마크다운 형식의 전체 대본 문서 (타임라인 표 형태, 후킹을 강조하여 작성)",
  "topBarTitleLine1": "상단 배너용 후킹 제목 1줄 (6~10자 내외)",
  "topBarTitleLine2": "상단 배너용 후킹 제목 2줄 (선택, 없으면 빈 문자열)"
}
`;

    const resultText = await callGeminiTextApi(prompt, "당신은 숏폼 영상 기획 전문 PD입니다. 반드시 유효한 JSON 오브젝트로만 답하십시오.");
    const script = parseAiJsonResponse(resultText);

    const aiCuts = (script.imageCuts || []).map(c => ({
      prompt: c.prompt || '', caption: c.caption || '', narrationText: c.narration || c.caption || '',
      duration: Number(c.duration) || perCutDuration, imageUrl: '', uploaded: false
    }));
    const uploadedCuts = backUploads.map(u => ({
      prompt: '', caption: '', narrationText: '', duration: perCutDuration, imageUrl: u.url, uploaded: true, imageKey: u.imageKey || null
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
    await persistCurrentShortsProject();
    document.getElementById("shorts-script-review").scrollIntoView({ behavior: "smooth" });

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
    `컷 ${i + 1} - 이미지 프롬프트: ${c.prompt || '(없음)'} / 대본: ${c.narrationText || ''} / 자막: ${c.caption || ''}`
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

      <label class="shorts-field-label">자막 (화면에 표시 · 짧고 임팩트 있게)</label>
      <input type="text" class="form-control-admin shorts-cut-caption" style="${boxStyle}" placeholder="자막" value="${(cut.caption || '').replace(/"/g, '&quot;')}" oninput="syncShortsCutEdits()">

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
  currentShortsProject.imageCuts.push({ prompt: '', narrationText: '', caption: '', duration: 5, imageUrl: '' });
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

// Plain-text Gemini call (uses the image-generation Gemini key/model resolver,
// not Claude) -- used specifically for writing the AI image-generation prompt,
// since that step is conceptually part of the image pipeline.
async function callGeminiTextApi(prompt, systemInstruction = "") {
  const apiKey = localStorage.getItem("baikal_gemini_key");
  if (!apiKey) {
    throw new Error("Gemini API Key가 등록되지 않았습니다. AI 집필실 상단에서 먼저 등록해 주세요.");
  }

  const model = await resolveGeminiVisionModel(apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
  if (systemInstruction) {
    requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 404) {
      localStorage.removeItem("baikal_gemini_vision_model");
      localStorage.removeItem("baikal_gemini_vision_model_cached_at");
    }
    throw new Error(`Gemini API 호출 실패 (HTTP ${response.status}, 모델: ${model}): ${errText}`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
    return data.candidates[0].content.parts[0].text;
  } else {
    throw new Error("Gemini API가 올바른 응답 양식을 반환하지 않았습니다.");
  }
}

// Resolves a Veo (video generation) capable model for this API key.
// NOTE: Veo access requires separate enablement/billing beyond a plain Gemini
// text/image key -- resolveVeoModel throws a clear message if none is found.
async function resolveVeoModel(apiKey) {
  const cacheKey = "baikal_veo_model";
  const cacheTimeKey = "baikal_veo_model_cached_at";
  const cached = localStorage.getItem(cacheKey);
  const cachedAt = parseInt(localStorage.getItem(cacheTimeKey) || "0", 10);
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (cached && (Date.now() - cachedAt) < oneDayMs) {
    return cached;
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error("모델 목록을 가져오지 못했습니다 (HTTP " + res.status + ")");
  const data = await res.json();
  const models = (data.models || []).filter(m => /veo/i.test(m.name));
  if (models.length === 0) {
    throw new Error("이 API 키로 사용 가능한 Veo 영상 생성 모델을 찾지 못했습니다. Google AI Studio/Cloud 콘솔에서 Veo 접근 권한(별도 결제 활성화)이 있는지 확인해 주세요.");
  }

  const chosen = models.find(m => /veo-3/i.test(m.name)) || models[0];
  const modelName = chosen.name.replace(/^models\//, '');
  localStorage.setItem(cacheKey, modelName);
  localStorage.setItem(cacheTimeKey, String(Date.now()));
  return modelName;
}

// Kicks off a Veo video generation job (long-running operation) and polls
// until it completes, returning the finished clip as a Blob. Veo's exact
// response shape is newer/less stable than Gemini's text & image endpoints,
// so this defensively tries a few known field-name variants.
async function generateVeoVideo(promptText, onStatus) {
  const apiKey = localStorage.getItem("baikal_gemini_key");
  if (!apiKey) {
    throw new Error("Gemini API Key가 등록되지 않았습니다. (Veo 영상 생성도 이미지 생성용 Gemini 키를 사용합니다)");
  }

  const model = await resolveVeoModel(apiKey);
  if (onStatus) onStatus("Veo 영상 생성 요청 중...");

  const startRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: promptText + MEDIA_KOREAN_PEOPLE_RULE }],
      parameters: { aspectRatio: "9:16", durationSeconds: 8 }
    })
  });
  if (!startRes.ok) {
    const errText = await startRes.text();
    if (startRes.status === 404) {
      localStorage.removeItem("baikal_veo_model");
      localStorage.removeItem("baikal_veo_model_cached_at");
    }
    throw new Error(`Veo 영상 생성 요청 실패 (HTTP ${startRes.status}, 모델: ${model}): ${errText}`);
  }

  let operation = await startRes.json();
  const operationName = operation.name;
  if (!operationName) throw new Error("Veo 작업 ID를 받지 못했습니다: " + JSON.stringify(operation));

  if (onStatus) onStatus("Veo 영상 렌더링 중... (최대 몇 분 소요될 수 있습니다)");

  let attempts = 0;
  while (!operation.done && attempts < 60) {
    await new Promise(r => setTimeout(r, 10000));
    const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`);
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`Veo 진행상황 확인 실패 (HTTP ${pollRes.status}): ${errText}`);
    }
    operation = await pollRes.json();
    attempts++;
    if (onStatus) onStatus(`Veo 영상 렌더링 중... (${attempts * 10}초 경과)`);
  }

  if (!operation.done) {
    throw new Error("Veo 영상 생성이 시간 내에 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (operation.error) {
    throw new Error(`Veo 영상 생성 실패: ${operation.error.message || JSON.stringify(operation.error)}`);
  }

  const genResponse = operation.response || {};
  const samples = (genResponse.generateVideoResponse && genResponse.generateVideoResponse.generatedSamples)
    || genResponse.generatedSamples
    || genResponse.videos;
  const firstSample = samples && samples[0];
  const videoUri = firstSample && (
    (firstSample.video && firstSample.video.uri) || firstSample.uri || firstSample.video
  );
  if (!videoUri) {
    throw new Error("Veo 응답에서 영상 URI를 찾지 못했습니다. API 응답 형식이 예상과 다를 수 있습니다: " + JSON.stringify(genResponse).substring(0, 500));
  }

  if (onStatus) onStatus("완성된 Veo 영상 다운로드 중...");
  const videoUrl = videoUri.includes('key=') ? videoUri : `${videoUri}${videoUri.includes('?') ? '&' : '?'}key=${apiKey}`;
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Veo 영상 파일 다운로드 실패 (HTTP ${videoRes.status})`);
  return await videoRes.blob();
}

// Resolves a Gemini TTS-capable model -- same auto-discovery/caching pattern
// as resolveVeoModel/resolveGeminiImageModel.
async function resolveGeminiTtsModel(apiKey) {
  const cacheKey = "baikal_gemini_tts_model";
  const cacheTimeKey = "baikal_gemini_tts_model_cached_at";
  const cached = localStorage.getItem(cacheKey);
  const cachedAt = parseInt(localStorage.getItem(cacheTimeKey) || "0", 10);
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (cached && (Date.now() - cachedAt) < oneDayMs) {
    return cached;
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error("모델 목록을 가져오지 못했습니다 (HTTP " + res.status + ")");
  const data = await res.json();
  const models = (data.models || []).filter(m => /tts/i.test(m.name));
  if (models.length === 0) {
    throw new Error("이 API 키로 사용 가능한 음성(TTS) 생성 모델을 찾지 못했습니다. Google AI Studio에서 TTS 모델 접근 권한을 확인해 주세요.");
  }

  const chosen = models.find(m => /flash/i.test(m.name)) || models[0];
  const modelName = chosen.name.replace(/^models\//, '');
  localStorage.setItem(cacheKey, modelName);
  localStorage.setItem(cacheTimeKey, String(Date.now()));
  return modelName;
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

// Calls Gemini's native TTS (same API key already used for images/Veo) and
// returns a playable WAV Blob.
async function generateGeminiSpeech(text, voiceName) {
  const apiKey = localStorage.getItem("baikal_gemini_key");
  if (!apiKey) {
    throw new Error("Gemini API Key가 등록되지 않았습니다. AI 집필실 상단에서 먼저 등록해 주세요.");
  }

  const model = await resolveGeminiTtsModel(apiKey);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || "Kore" } } }
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404) {
      localStorage.removeItem("baikal_gemini_tts_model");
      localStorage.removeItem("baikal_gemini_tts_model_cached_at");
    }
    throw new Error(`나레이션 생성 실패 (HTTP ${res.status}, 모델: ${model}): ${errText}`);
  }

  const data = await res.json();
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const audioPart = parts.find(p => p.inlineData && p.inlineData.data);
  if (!audioPart) {
    throw new Error("AI가 음성 데이터를 반환하지 않았습니다.");
  }

  const mimeType = audioPart.inlineData.mimeType || "audio/L16;rate=24000";
  const rateMatch = mimeType.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
  return pcm16ToWavBlob(audioPart.inlineData.data, sampleRate);
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

function buildShortsNarrationQueue() {
  const queue = [];
  if (currentShortsProject.hookNarrationUrl) queue.push(currentShortsProject.hookNarrationUrl);
  (currentShortsProject.imageCuts || []).forEach(cut => {
    if (cut.narrationUrl) queue.push(cut.narrationUrl);
  });
  return queue;
}

function toggleShortsNarrationPlayback() {
  if (!currentShortsProject) return;
  const player = document.getElementById("shorts-narration-playback");
  const playBtn = document.getElementById("shorts-narration-play-btn");
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
  player.onended = () => {
    shortsNarrationIdx += 1;
    if (shortsNarrationIdx < shortsNarrationQueue.length) {
      player.src = shortsNarrationQueue[shortsNarrationIdx];
      player.play();
    } else if (playBtn) {
      playBtn.textContent = "▶";
    }
  };
  player.src = shortsNarrationQueue[0];
  player.play();
  if (playBtn) playBtn.textContent = "⏸";
}

function stopShortsNarrationPlayback() {
  const player = document.getElementById("shorts-narration-playback");
  const playBtn = document.getElementById("shorts-narration-play-btn");
  if (!player) return;
  player.onended = null;
  player.pause();
  player.currentTime = 0;
  player.removeAttribute("src");
  shortsNarrationQueue = [];
  shortsNarrationIdx = 0;
  if (playBtn) playBtn.textContent = "▶";
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
        <video src="${currentShortsProject.veoVideoUrl}" controls muted playsinline></video>
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
    img.onload = () => resolve({ img, duration: cut.duration, caption: cut.caption, narrationUrl: cut.narrationUrl });
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

function drawShortsCaption(ctx, text, canvasW, canvasH, fontSize, color, position) {
  if (!text) return;
  const size = fontSize || 72;
  ctx.save();
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const y = position === 'top' ? canvasH * 0.22
    : position === 'center' ? canvasH / 2
    : canvasH - 260; // 'bottom' (default) -- original position
  const metrics = ctx.measureText(text);
  const paddingX = 32, paddingY = 20;
  const boxH = size + 20;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(canvasW / 2 - metrics.width / 2 - paddingX, y - boxH / 2 - paddingY / 2, metrics.width + paddingX * 2, boxH + paddingY);
  ctx.fillStyle = color || "#ffffff";
  ctx.fillText(text, canvasW / 2, y);
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
async function runShortsTimeline(canvas, assets, project, { record } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const frontDuration = assets.front.duration;

  // Each cut's duration already comes from its own narration clip's actual
  // length (set when the narration was generated) -- no stretching/guessing
  // needed, since visuals and audio are timed from the same source.
  const cutDurations = (project.imageCuts || []).map(c => c.duration || 0);
  const totalDuration = frontDuration + cutDurations.reduce((s, d) => s + d, 0);
  const hookCaptionDuration = assets.hookNarrationBuffer
    ? Math.min(assets.hookNarrationBuffer.duration, frontDuration)
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
    recorder = new MediaRecorder(stream, { mimeType: recordedMimeType, videoBitsPerSecond: 4000000 });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start();
  }

  await new Promise((resolve) => {
    // Schedule every narration clip up front, each starting exactly when its
    // matching visual segment starts -- sample-accurate via the shared audio
    // clock, so there's nothing left to drift out of sync.
    const scheduledSources = [];
    if (assets.audioCtx && assets.mixDestination) {
      const base = assets.audioCtx.currentTime + 0.05;
      if (assets.hookNarrationBuffer) {
        const src = assets.audioCtx.createBufferSource();
        src.buffer = assets.hookNarrationBuffer;
        src.connect(assets.mixDestination);
        src.connect(assets.audioCtx.destination);
        src.start(base);
        scheduledSources.push(src);
      }
      let cursor = frontDuration;
      assets.images.forEach((imgAsset, i) => {
        if (imgAsset.narrationBuffer) {
          const src = assets.audioCtx.createBufferSource();
          src.buffer = imgAsset.narrationBuffer;
          src.connect(assets.mixDestination);
          src.connect(assets.audioCtx.destination);
          src.start(base + cursor);
          scheduledSources.push(src);
        }
        cursor += cutDurations[i] || 0;
      });
    }

    if (assets.front.type === 'video') {
      assets.front.el.currentTime = 0;
      const playPromise = assets.front.el.play();
      if (playPromise && playPromise.catch) playPromise.catch(() => {});
    }

    const startTime = performance.now();

    function step() {
      const elapsed = (performance.now() - startTime) / 1000;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);

      if (elapsed < frontDuration) {
        if (assets.front.type === 'video') {
          ctx.drawImage(assets.front.el, 0, 0, W, H);
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
          drawShortsCaption(ctx, cut.caption, W, H, project.captionFontSize, project.captionColor, project.captionPosition);
        }
      }
      drawShortsTopBar(ctx, project, W);

      if (elapsed >= totalDuration) {
        if (assets.front.type === 'video') assets.front.el.pause();
        scheduledSources.forEach(src => { try { src.stop(); } catch (err) {} });
        resolve();
        return;
      }
      requestAnimationFrame(step);
    }
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

async function previewShortsAssembly() {
  const statusEl = document.getElementById("shorts-assembly-status");
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
  }
}

async function recordShortsVideo() {
  const statusEl = document.getElementById("shorts-assembly-status");
  const btn = document.getElementById("shorts-record-btn");
  if (btn) btn.disabled = true;

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

    statusEl.textContent = "완료! 아래에서 재생/다운로드할 수 있습니다. (서버에는 저장되지 않으니 필요하면 지금 다운로드하거나 보관 버튼으로 대본을 남겨두세요.)";
  } catch (err) {
    console.error("숏폼 녹화 실패:", err);
    statusEl.textContent = "녹화 실패: " + err.message;
    alert("녹화 실패: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
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

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
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

function renderNewsletterTrendChart(subscribers) {
  const container = document.getElementById("newsletter-trend-chart-container");
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
    container.innerHTML = `<div class="help-text">최근 14일간 신규 구독자가 없습니다.</div>`;
    return;
  }

  const maxVal = Math.max(1, ...buckets.map(b => b.count));
  const chartHeight = 140;
  const topPad = 18; // room for the value label above the tallest bar
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
        <title>${b.label}: 신규 구독 ${b.count}명</title>
        <rect x="${x + 8}" y="${y}" width="${barWidth}" height="${Math.max(h, 1)}" fill="var(--admin-accent-cyan)" rx="2"></rect>
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

  const byDateDesc = published.slice().sort((a, b) => parseKoreanDate(b.date) - parseKoreanDate(a.date));
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
        <img src="${imgSrc}" style="width: 56px; height: 56px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
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
              <a href="${url}" target="_blank"><img src="${imgSrc}" width="100" height="100" style="display:block; border-radius: 6px; object-fit: cover;"></a>
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
    statusSpan.textContent = "API Key가 설정되지 않았습니다. AI 이미지 생성 기능을 사용하려면 등록하십시오.";
    statusSpan.style.color = "#fbbf24"; // yellow
  }
}

function toggleClaudeApiConfig() {
  const content = document.getElementById("claude-api-config-content");
  const icon = document.getElementById("claude-api-config-toggle-icon");
  if (content.style.display === "none" || !content.style.display) {
    content.style.display = "block";
    icon.textContent = "▲";
  } else {
    content.style.display = "none";
    icon.textContent = "▼";
  }
}

function saveClaudeApiKey() {
  const keyInput = document.getElementById("ai-claude-key").value.trim();
  if (keyInput) {
    localStorage.setItem("baikal_claude_key", keyInput);
    document.getElementById("claude-api-key-status").textContent = "API Key가 안전하게 저장되었습니다.";
    document.getElementById("claude-api-key-status").style.color = "#10b981"; // green
  } else {
    localStorage.removeItem("baikal_claude_key");
    document.getElementById("claude-api-key-status").textContent = "API Key가 제거되었습니다.";
    document.getElementById("claude-api-key-status").style.color = "#ef4444"; // red
  }
}

function loadClaudeApiKey() {
  const savedKey = localStorage.getItem("baikal_claude_key");
  const keyInput = document.getElementById("ai-claude-key");
  const statusSpan = document.getElementById("claude-api-key-status");
  if (savedKey && keyInput && statusSpan) {
    keyInput.value = savedKey;
    statusSpan.textContent = "API Key 연동 중";
    statusSpan.style.color = "#10b981"; // green
  } else if (keyInput && statusSpan) {
    keyInput.value = "";
    statusSpan.textContent = "API Key가 설정되지 않았습니다. 기사 작성 기능을 사용하려면 등록하십시오.";
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

// Resolves which Claude model this API key can actually use, instead of hardcoding a
// version string that Anthropic can rename/deprecate later (same self-healing
// approach as the Gemini image-model resolver below). Cached for a day.
async function resolveClaudeModel(apiKey) {
  const cacheKey = "baikal_claude_model";
  const cacheTimeKey = "baikal_claude_model_cached_at";
  const cached = localStorage.getItem(cacheKey);
  const cachedAt = parseInt(localStorage.getItem(cacheTimeKey) || "0", 10);
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (cached && (Date.now() - cachedAt) < oneDayMs) {
    return cached;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      }
    });
    if (!res.ok) throw new Error("ListModels failed with status " + res.status);
    const data = await res.json();
    const models = data.data || [];
    if (models.length === 0) throw new Error("No models available");

    // Prefer a Sonnet-tier model -- the best balance of quality/cost for article writing
    const pick = (predicate) => models.find(predicate);
    const chosen =
      pick(m => /sonnet-5/i.test(m.id)) ||
      pick(m => /sonnet/i.test(m.id)) ||
      models[0];

    localStorage.setItem(cacheKey, chosen.id);
    localStorage.setItem(cacheTimeKey, String(Date.now()));
    return chosen.id;
  } catch (err) {
    console.error("Claude model auto-discovery failed, falling back:", err);
    return cached || "claude-sonnet-5";
  }
}

// Claude (Anthropic) API caller -- used for all text/writing generation (article
// drafts, self-check grading, writing-style analysis, image prompt writing).
// Actual image pixel generation stays on Gemini (see generateGeminiImage below).
async function callClaudeApi(prompt, systemInstruction = "") {
  const apiKey = localStorage.getItem("baikal_claude_key");
  if (!apiKey) {
    throw new Error("Claude API Key가 등록되지 않았습니다. AI 집필실 상단에서 먼저 등록해 주세요.");
  }

  const model = await resolveClaudeModel(apiKey);

  const requestBody = {
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }]
  };

  if (systemInstruction) {
    requestBody.system = systemInstruction;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 404) {
      // The cached/discovered model name turned out to be invalid or has since been
      // deprecated -- clear the cache so the next call re-discovers a working one.
      localStorage.removeItem("baikal_claude_model");
      localStorage.removeItem("baikal_claude_model_cached_at");
    }
    throw new Error(`Claude API 호출 실패 (HTTP ${response.status}, 모델: ${model}): ${errText}`);
  }

  const data = await response.json();
  if (data.content && data.content[0] && data.content[0].text) {
    return data.content[0].text;
  } else {
    throw new Error("Claude API가 올바른 응답 양식을 반환하지 않았습니다.");
  }
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
