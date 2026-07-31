// ONE-OFF MANUAL TEST -- verifies that a Threads access token (obtained
// manually via Meta's "사용자 토큰 생성기" tool, since the app's Client
// OAuth Settings form is currently failing to save in the Meta console)
// can actually create and publish a post. This bypasses the sns_connections
// table entirely and reads the token straight from an env var.
//
// DELETE THIS FILE once the real OAuth flow (api/threads-oauth-callback.js)
// is working end-to-end -- it has no auth guard of its own, so anyone who
// finds the URL can trigger a test post as long as THREADS_TEST_ACCESS_TOKEN
// is set. It's meant to exist only for this one verification step.
//
// Env var required (Vercel): THREADS_TEST_ACCESS_TOKEN

module.exports = async (req, res) => {
  const token = process.env.THREADS_TEST_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'THREADS_TEST_ACCESS_TOKEN이 설정되지 않았습니다.' });
    return;
  }

  try {
    const meRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
    const meData = await meRes.json();
    if (!meRes.ok || !meData.id) {
      res.status(500).json({ step: 'me', error: meData });
      return;
    }

    const testText = `바이칼뉴스 자동 발행 테스트입니다. (${new Date().toISOString()})`;

    const createRes = await fetch(`https://graph.threads.net/v1.0/${meData.id}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        media_type: 'TEXT',
        text: testText,
        access_token: token
      })
    });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
      res.status(500).json({ step: 'create', error: createData });
      return;
    }

    // Threads (like Instagram's Content Publishing API) needs a short beat
    // to actually finish processing the container -- publishing immediately
    // after create() reliably 404s with "Media Not Found" (error_subcode
    // 4279009). Poll the container's status until it's FINISHED (or give up
    // after ~20s) instead of publishing blind.
    // Kept short (max ~6s of waiting) since Vercel's default serverless
    // function timeout is 10s on lower tiers -- better to report "still
    // processing" gracefully than get killed mid-request.
    let status = 'IN_PROGRESS';
    for (let attempt = 0; attempt < 4 && status === 'IN_PROGRESS'; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      const statusRes = await fetch(`https://graph.threads.net/v1.0/${createData.id}?fields=status,error_message&access_token=${encodeURIComponent(token)}`);
      const statusData = await statusRes.json();
      status = statusData.status || 'IN_PROGRESS';
      if (status === 'ERROR') {
        res.status(500).json({ step: 'container_status', error: statusData });
        return;
      }
    }
    if (status !== 'FINISHED') {
      res.status(500).json({ step: 'container_status', error: { message: `컨테이너가 시간 내에 완료되지 않았습니다 (마지막 상태: ${status})` } });
      return;
    }

    const publishRes = await fetch(`https://graph.threads.net/v1.0/${meData.id}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        creation_id: createData.id,
        access_token: token
      })
    });
    const publishData = await publishRes.json();
    if (!publishRes.ok) {
      res.status(500).json({ step: 'publish', error: publishData });
      return;
    }

    res.status(200).json({ ok: true, username: meData.username, published: publishData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
