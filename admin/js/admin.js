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
    제보이메일 <strong>baikalnews815.jebo@gmail.com</strong><br>
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
    1. <strong>신청 방법</strong>: 제보 및 문의 페이지의 온라인 접수 양식을 이용하시거나, 정정요청 이메일(<a href="mailto:baikalnews815.jebo@gmail.com">baikalnews815.jebo@gmail.com</a>)로 접수해 주십시오.<br>
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
    <p style="margin-top: 4px; font-weight: 600; color: var(--accent-cyan);">baikalnews815.jebo@gmail.com</p>
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
  // Switch to dashboard tab initially
  switchTab('dashboard');
  
  // Refresh data models
  await refreshStats();
  await renderArticlesList();
  await renderPendingList();
  await renderTopViewedList();
  await renderViewsChart();
  await populateCurationDropdowns();
  await loadStaticPageContent();
  await renderAuditLogs();
  renderAdminsList();
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
    'ai-training': "AI 글쓰기 학습",
    curation: "홈페이지 큐레이션 통제",
    pages: "정적 페이지 및 AdSense 신뢰성 문서 관리",
    audit: "보도 편집 감사 로그",
    admins: "관리자 정보 관리"
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
  } else if (tabName === 'articles') {
    await renderArticlesList();
  } else if (tabName === 'ai-writer') {
    loadGeminiApiKey();
    await loadWritingStyles();
  } else if (tabName === 'ai-training') {
    loadGeminiApiKey();
    await populateTrainingStyleSelect();
  } else if (tabName === 'curation') {
    await populateCurationDropdowns();
  } else if (tabName === 'audit') {
    await renderAuditLogs();
  } else if (tabName === 'admins') {
    renderAdminsList();
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
  const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);

  document.getElementById("stat-draft-count").textContent = draft;
  document.getElementById("stat-review-count").textContent = review;
  document.getElementById("stat-published-count").textContent = published;
  document.getElementById("stat-total-count").textContent = articles.length;
  document.getElementById("stat-total-views").textContent = totalViews.toLocaleString("ko-KR");
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
  const barGroupWidth = 44;
  const barWidth = 14;
  const svgWidth = data.length * barGroupWidth;

  const bars = data.map((d, i) => {
    const x = i * barGroupWidth;
    const viewsH = Math.round((d.views / maxVal) * chartHeight);
    const visitorsH = Math.round((d.visitors / maxVal) * chartHeight);
    return `
      <g>
        <title>${d.label}: 조회수 ${d.views}회 / 방문자 ${d.visitors}명</title>
        <rect x="${x + 4}" y="${chartHeight - viewsH}" width="${barWidth}" height="${Math.max(viewsH, 1)}" fill="var(--admin-accent-blue)" rx="2"></rect>
        <rect x="${x + 4 + barWidth + 2}" y="${chartHeight - visitorsH}" width="${barWidth}" height="${Math.max(visitorsH, 1)}" fill="var(--admin-accent-cyan)" rx="2"></rect>
      </g>
      <text x="${x + barGroupWidth / 2}" y="${chartHeight + 18}" font-size="10" text-anchor="middle" fill="var(--admin-text-muted)">${d.label}</text>
    `;
  }).join('');

  container.innerHTML = `
    <svg width="${svgWidth}" height="${chartHeight + 30}" viewBox="0 0 ${svgWidth} ${chartHeight + 30}" style="min-width: 100%;">
      ${bars}
    </svg>
  `;
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--admin-text-muted);">등록된 기사가 없습니다. 새 기사를 추가하거나 AI로 작성해 보세요.</td></tr>`;
    return;
  }

  tbody.innerHTML = articles.map(art => `
    <tr>
      <td class="article-select-col"><input type="checkbox" class="article-select-checkbox" value="${art.id}"></td>
      <td>${art.id}</td>
      <td><span class="ai-tag" style="margin: 0; font-size: 0.7rem;">${art.category.toUpperCase()}</span></td>
      <td style="font-weight: 500; color: var(--admin-text-primary); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${art.title}</td>
      <td>${art.approver || '<span style="color: var(--admin-text-muted);">미지정</span>'}</td>
      <td><span class="badge badge-${art.status}">${art.status.toUpperCase()}</span></td>
      <td style="white-space: nowrap;">${art.date}</td>
      <td>${(art.views || 0).toLocaleString("ko-KR")}</td>
      <td class="action-links">
        <a onclick="editArticle(${art.id})">편집</a>
        <a onclick="previewArticle(${art.id})">미리보기</a>
        <a onclick="duplicateArticle(${art.id})" style="color: var(--admin-text-secondary);">복사</a>
      </td>
    </tr>
  `).join('');
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
    hideArticleForm();
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

// Form view controls
// Sidebar shortcut: jump straight to the blank new-article form
function openNewArticleFromSidebar() {
  switchTab('articles');
  showArticleCreateForm();
}

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
  updateContentCharCount();
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
  } else if (status === 'approved' || status === 'scheduled') {
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

  // Show approver selector if status is approved, scheduled, or published
  const approverGroup = document.getElementById("approver-select-group");
  if (status === 'approved' || status === 'published' || status === 'scheduled') {
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
  document.getElementById("form-content").innerHTML = art.content || "";
  document.getElementById("form-category").value = art.category;
  document.getElementById("form-date").value = art.date;
  document.getElementById("form-ymyl").checked = art.isYMYL || false;
  document.getElementById("form-image").value = art.image || "images/news_editorial.png";
  
  document.getElementById("form-seo-title").value = art.seoTitle || "";
  document.getElementById("form-seo-meta").value = art.seoMeta || "";
  document.getElementById("form-slug").value = art.slug || "";
  
  document.getElementById("form-status").value = art.status;
  document.getElementById("form-approver").value = art.approver || "";
  document.getElementById("form-scheduled-at").value = toDatetimeLocalValue(art.scheduledAt);

  // Show delete button
  document.getElementById("btn-soft-delete").style.display = "block";

  // Trigger status visual logic
  onStatusChangeInForm(art.status);
  updateContentCharCount();
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
  const date = document.getElementById("form-date").value;
  const isYMYL = document.getElementById("form-ymyl").checked;
  const image = document.getElementById("form-image").value;
  
  const seoTitle = document.getElementById("form-seo-title").value || `${title} - 바이칼 뉴스`;
  const seoMeta = document.getElementById("form-seo-meta").value || lead;
  const slug = document.getElementById("form-slug").value || `article-${Date.now()}`;
  
  const status = document.getElementById("form-status").value;
  const approver = document.getElementById("form-approver").value;
  const rejectionNote = document.getElementById("form-rejection-note").value;
  const scheduledAtRaw = document.getElementById("form-scheduled-at").value;

  // Category labels mapping
  const catLabels = {
    culture: "문화·예술",
    economy: "경제·산업",
    tech: "기술·미디어",
    local: "지역·평택",
    opinion: "오피니언"
  };

  // Critical Validation: Approval requires an Approver name
  if ((status === 'approved' || status === 'published' || status === 'scheduled') && !approver) {
    alert("승인 완료·예약 발행·공개 발행 상태로 전환하기 위해서는 검토에 책임을 질 최종 데스크 승인인(최상락 또는 장승희)을 반드시 지정해야 합니다.");
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
    scheduledAt = scheduledAt.toISOString();
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
      } else if (status === 'scheduled') {
        revisionMsg = `보도 승인 및 예약 발행 설정 (승인인: ${approver}, 예약일시: ${new Date(scheduledAt).toLocaleString("ko-KR")})`;
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
      if (status === 'approved' || status === 'published' || status === 'scheduled') {
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
      approver: (status === 'approved' || status === 'published' || status === 'scheduled') ? approver : null,
      byline: (status === 'approved' || status === 'published' || status === 'scheduled') ? `${approver} 기자` : "",
      draftedBy: "홍길동",
      approvedAt: (status === 'approved' || status === 'published' || status === 'scheduled') ? new Date().toISOString() : null,
      scheduledAt: status === 'scheduled' ? scheduledAt : null,
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
function softDeleteArticleInForm() {
  if (!currentEditingId) return;
  openDeleteChoiceModal([currentEditingId], 'form');
}

// 5. AI Assisted Article Generation Engine
// 4 modes: 주제 입력, 링크 재구성, 오늘의 화제 기사(네이버 랭킹), 정보성 기사 추천
let activeAiMode = 'topic';
let generatedDraftData = null;

const AI_CATEGORY_LABELS = {
  culture: "문화·예술",
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
4. "seoTitle": 검색결과 노출용 제목. 핵심 키워드를 앞부분에 포함하고 실제 title과 의미가 동일해야 함 (60자 이내 권장)
5. "seoMeta": 검색결과 메타 설명. 핵심 키워드를 자연스럽게 포함하는 클릭 유도형 요약 (120~155자 내외)
6. "slug": 핵심 키워드를 반영한 짧은 영문/로마자 URL 슬러그 (소문자와 하이픈만 사용, 예: pyeongtaek-support-fund)
7. "keywords": 핵심 키워드 배열 (3~5개 문자열)
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
    console.error("Gemini output parsing failed. Raw text:", resultText);
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
2. "lead": 독자의 관심을 끄는 2~3문장의 흡입력 있는 리드 문단
3. "body": 2개 이상의 <h2> 소제목을 포함하고 적절한 <p> 단락들로 구성된 뉴스 본문 HTML 코드. 문장 어조와 관점은 지정된 논조 스타일을 완벽하게 재현해야 합니다. (전체 분량 공백 제외 ${targetLength}자 내외로 상세하게 작성)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callGeminiApi(prompt, stylePrompt);
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
1. "title": 지정된 논조 스타일을 반영하고 핵심 키워드를 포함한 새로운 독창적 기사 제목
2. "lead": 독자의 관심을 끄는 2~3문장의 리드 문단
3. "body": 2개 이상의 <h2> 소제목과 <p> 단락으로 구성된 새 기사 본문 HTML (전체 분량 공백 제외 ${targetLength}자 내외)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callGeminiApi(prompt, stylePrompt);
  const draft = parseAiJsonResponse(resultText);
  return {
    headline: draft.title, lead: draft.lead, body: draft.body, category,
    seoTitle: draft.seoTitle, seoMeta: draft.seoMeta, slug: draft.slug, keywords: draft.keywords
  };
}

// ---- Mode 3: 오늘의 화제 기사 (네이버 랭킹 뉴스) ----
let trendingArticles = [];
let selectedTrendingArticle = null;

async function fetchNaverTrending() {
  const targetUrl = 'https://news.naver.com/main/ranking/popularDay.naver';
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error("HTTP error " + response.status);
  const html = await response.text();

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
  if (!sourceText || sourceText.length < 50) {
    sourceText = selectedTrendingArticle.title;
  }

  const { stylePrompt, fewShotPrompt } = await buildStylePromptFromSelection(styleId);
  const targetLength = getTargetLength();

  setAiLoaderText("오늘의 화제 기사를 참고하여 새로운 기사를 집필하는 중...");

  const prompt = `
아래는 오늘 네이버에서 화제가 된 뉴스의 제목과 본문 정보입니다. 이 사실관계와 화제성을 참고하되, 절대 원문을 그대로 베끼지 말고 완전히 새로운 취재 각도와 문장으로 독창적인 기사를 작성하십시오.

[오늘의 화제 뉴스 제목]
${selectedTrendingArticle.title}

[참고 원문 발췌]
${sourceText.substring(0, 3000)}

[카테고리]
${category}

${fewShotPrompt}
${SEO_PROMPT_INSTRUCTIONS}

[작성 지침]
반드시 다음 구조의 JSON 형식으로만 답변하십시오. 백틱(\`\`\`)이나 'json' 마킹 없이 오직 JSON 오브젝트 자체만 출력해야 합니다.
1. "title": 지정된 논조 스타일을 반영하고 핵심 키워드를 포함한 새로운 독창적 기사 제목
2. "lead": 독자의 관심을 끄는 2~3문장의 리드 문단
3. "body": 2개 이상의 <h2> 소제목과 <p> 단락으로 구성된 새 기사 본문 HTML (전체 분량 공백 제외 ${targetLength}자 내외)
${SEO_JSON_FIELDS_INSTRUCTIONS}
`;

  const resultText = await callGeminiApi(prompt, stylePrompt);
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
    const resultText = await callGeminiApi(prompt, "당신은 대한민국 생활 정보 전문 기자입니다. 반드시 유효한 JSON 배열로만 답하십시오.");
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

  const resultText = await callGeminiApi(prompt, stylePrompt);
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
    const resultText = await callGeminiApi(prompt, "당신은 엄격한 저널리즘 데스크 편집자입니다. 반드시 유효한 JSON 배열로만 답하십시오.");
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
      subtitle: `${AI_CATEGORY_LABELS[category] || category} 부문 AI 작성 초안`,
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

// Transfer AI draft to form editor
function transferAiDraftToEditor() {
  if (!generatedDraftData) return;

  switchTab('articles');
  showArticleCreateForm();

  // Populate editor form with AI draft data
  document.getElementById("form-title").value = generatedDraftData.title;
  document.getElementById("form-subtitle").value = generatedDraftData.subtitle;
  document.getElementById("form-lead").value = generatedDraftData.lead;
  document.getElementById("form-content").innerHTML = generatedDraftData.content;
  document.getElementById("form-category").value = generatedDraftData.category;
  document.getElementById("form-date").value = generatedDraftData.date;
  document.getElementById("form-image").value = generatedDraftData.image;
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
    const displaySrc = /^https?:\/\//i.test(src) ? src : `https://baikalnews.com/${src}`;
    return `
      <div class="media-card ${isSelected ? 'selected' : ''}" onclick="selectMediaCard(this, '${src}')">
        <img src="${displaySrc}" class="media-img" onerror="this.src='https://baikalnews.com/images/news_editorial.png'">
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

// Uploads a File or Blob to the Supabase Storage "article-images" bucket and
// returns its public URL. Requires the bucket + public read/insert policies
// to already exist (see admin setup docs) -- throws a clear error otherwise.
async function uploadImageToStorage(fileOrBlob, extHint) {
  if (!window.SupabaseAdapter) {
    throw new Error("Supabase 연동 모듈을 찾을 수 없습니다.");
  }
  const client = window.SupabaseAdapter.getClient();
  if (!client) {
    throw new Error("Supabase가 연결되어 있지 않습니다.");
  }

  const nameExt = fileOrBlob.name ? fileOrBlob.name.split('.').pop() : null;
  const ext = (extHint || nameExt || 'png').toLowerCase().replace('jpeg', 'jpg');
  const path = `articles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const contentType = fileOrBlob.type || `image/${ext}`;

  const { error } = await client.storage.from('article-images').upload(path, fileOrBlob, {
    cacheControl: '3600',
    upsert: false,
    contentType
  });
  if (error) {
    throw new Error(`${error.message || error}  (버킷 "article-images"가 없거나 업로드 정책이 설정되지 않았을 수 있습니다.)`);
  }

  const { data } = client.storage.from('article-images').getPublicUrl(path);
  return data.publicUrl;
}

// Direct upload from the sidebar's "내 컴퓨터에서 업로드" file input
async function handleArticleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById("image-upload-status");
  if (statusEl) statusEl.textContent = "업로드 중...";

  try {
    const url = await uploadImageToStorage(file);
    document.getElementById("form-image").value = url;
    if (statusEl) statusEl.textContent = "업로드 완료: 기사 대표 이미지로 적용되었습니다.";
  } catch (err) {
    console.error("Image upload error:", err);
    if (statusEl) statusEl.textContent = "업로드 실패: " + err.message;
  } finally {
    event.target.value = "";
  }
}

// Builds an image-generation prompt from the article's current title/lead/body via Gemini
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
    const analysisPrompt = `
아래 뉴스 기사 내용을 바탕으로, 이 기사의 대표 이미지를 생성하기 위한 이미지 생성 AI용 프롬프트를 작성하십시오.

[기사 제목]
${title}

[리드 문단]
${lead}

[본문 요약]
${bodyText.substring(0, 1000)}

[작성 지침]
- 실제 인물의 얼굴, 자극적이거나 선정적인 이미지는 피하고, 차분하고 신뢰감 있는 에디토리얼 사진/일러스트 스타일로 묘사하십시오.
- 기사 주제를 은유적으로 표현하는 사물, 풍경, 구도를 구체적으로 서술하십시오.
- 다른 설명이나 마크다운 없이, 한 문단의 프롬프트 본문만 출력하십시오.
`;
    const resultText = await callGeminiApi(analysisPrompt, "당신은 신문 편집 디자인 전문가입니다.");
    if (promptEl) promptEl.value = resultText.trim();
  } catch (err) {
    alert("프롬프트 자동생성 실패: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

// Resolves an image-generation-capable Gemini model for this API key (same
// auto-discovery approach as resolveGeminiModel(), filtered to image models).
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
    body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
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

async function triggerAiImageGeneration() {
  const promptText = document.getElementById("ai-image-prompt").value.trim();
  if (!promptText) {
    alert("프롬프트를 간략하게 입력하거나 자동생성 버튼을 눌러주세요.");
    return;
  }

  const loader = document.getElementById("ai-image-loader");
  loader.style.display = "flex";

  try {
    const dataUrl = await generateGeminiImage(promptText);
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

// Resolves which Gemini model this API key can actually use, instead of hardcoding a
// version string that Google can deprecate at any time (as happened with gemini-2.5-flash).
// Cached for a day so normal usage doesn't add an extra request per generation.
async function resolveGeminiModel(apiKey) {
  const cacheKey = "baikal_gemini_model";
  const cacheTimeKey = "baikal_gemini_model_cached_at";
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
      (m.supportedGenerationMethods || []).includes("generateContent")
    );
    if (models.length === 0) throw new Error("No generateContent-capable models available");

    // Prefer a fast/cheap "flash" text model over specialized non-text variants
    const pick = (predicate) => models.find(predicate);
    const chosen =
      pick(m => /flash-latest$/i.test(m.name)) ||
      pick(m => /flash/i.test(m.name) && !/image|audio|tts|embedding|vision/i.test(m.name)) ||
      pick(m => !/image|audio|tts|embedding|vision/i.test(m.name)) ||
      models[0];

    const modelName = chosen.name.replace(/^models\//, '');
    localStorage.setItem(cacheKey, modelName);
    localStorage.setItem(cacheTimeKey, String(Date.now()));
    return modelName;
  } catch (err) {
    console.error("Gemini model auto-discovery failed, falling back:", err);
    return cached || "gemini-flash-latest";
  }
}

// Gemini API Caller
async function callGeminiApi(prompt, systemInstruction = "") {
  const apiKey = localStorage.getItem("baikal_gemini_key");
  if (!apiKey) {
    throw new Error("Gemini API Key가 등록되지 않았습니다. AI 집필실 상단에서 먼저 등록해 주세요.");
  }

  const model = await resolveGeminiModel(apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
    if (response.status === 404) {
      // The cached/discovered model name turned out to be invalid or has since been
      // deprecated -- clear the cache so the next call re-discovers a working one.
      localStorage.removeItem("baikal_gemini_model");
      localStorage.removeItem("baikal_gemini_model_cached_at");
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

  const analysisResultText = await callGeminiApi(analysisPrompt, "You are a professional writing style analyzer. Answer strictly in JSON format matching the specifications.");
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
