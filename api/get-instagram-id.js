// ONE-OFF LOOKUP -- reads FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN
// (already set in Vercel) and returns the connected Instagram Business
// Account ID, so the admin never has to paste the actual access token
// into a browser URL bar just to look this one value up.
//
// DELETE THIS FILE once INSTAGRAM_BUSINESS_ID has been copied into
// Vercel -- it has no auth guard, and there's no reason to leave a
// standing lookup endpoint around after this one-time need is done.

module.exports = async (req, res) => {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) {
    res.status(500).json({ error: 'FACEBOOK_PAGE_ID 또는 FACEBOOK_PAGE_ACCESS_TOKEN이 설정되지 않았습니다.' });
    return;
  }

  try {
    const result = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account,name&access_token=${encodeURIComponent(token)}`);
    const data = await result.json();
    if (!result.ok) {
      res.status(500).json({ error: data.error || data });
      return;
    }
    res.status(200).json({
      pageName: data.name,
      instagramBusinessId: data.instagram_business_account ? data.instagram_business_account.id : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
