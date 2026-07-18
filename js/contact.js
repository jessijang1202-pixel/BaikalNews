// Baikal News - 제보·문의 form submission (sends via EmailJS, no backend server involved)

const CONTACT_TYPE_LABELS = {
  report: "기사 제보 및 팩트 보완",
  correction: "정정 보도 및 오보 정정 신청",
  alliance: "광고 및 콘텐츠 제휴",
  other: "기타 편집국 문의"
};

async function handleContactSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;

  if (!window.EMAILJS_PUBLIC_KEY || window.EMAILJS_PUBLIC_KEY.startsWith("REPLACE_")) {
    alert("이메일 전송 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.");
    return;
  }

  const name = document.getElementById("contact-name").value.trim();
  const email = document.getElementById("contact-email").value.trim();
  const type = document.getElementById("contact-type").value;
  const message = document.getElementById("contact-message").value.trim();

  submitBtn.disabled = true;
  submitBtn.textContent = "전송 중...";

  try {
    await emailjs.send(window.EMAILJS_SERVICE_ID, window.EMAILJS_TEMPLATE_ID, {
      from_name: name,
      from_email: email,
      inquiry_type: CONTACT_TYPE_LABELS[type] || type,
      message: message
    }, window.EMAILJS_PUBLIC_KEY);

    alert("소중한 문의가 정상적으로 접수되었습니다. 신속하게 답변드리겠습니다.");
    form.reset();
  } catch (err) {
    console.error("Contact form send failed:", err);
    alert("전송 중 오류가 발생했습니다. 잠시 후 다시 시도하시거나 이메일(baikalnews815@gmail.com)로 직접 문의해 주세요.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}
