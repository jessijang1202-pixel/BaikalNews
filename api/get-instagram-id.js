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
  if (!token) {
    res.status(500).json({ error: 'FACEBOOK_PAGE_ACCESS_TOKEN이 설정되지 않았습니다.' });
    return;
  }

  try {
    // /me/accounts lists every Page this token actually has access to,
    // with the real Graph API page id/name -- more reliable than trusting
    // a numeric id copied out of a facebook.com/profile.php?id= URL, which
    // isn't necessarily the same id the Graph API recognizes.
    const accountsRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(token)}`);
    const accountsData = await accountsRes.json();
    if (!accountsRes.ok) {
      res.status(500).json({ step: 'me/accounts', error: accountsData.error || accountsData });
      return;
    }

    const pages = (accountsData.data || []).map(p => ({ id: p.id, name: p.name }));
    const configuredPageMatch = pages.find(p => p.id === pageId);

    // Also try to resolve the Instagram Business Account id for whichever
    // page matches FACEBOOK_PAGE_ID (or the first page found, if none match).
    const targetPageId = (configuredPageMatch && configuredPageMatch.id) || (pages[0] && pages[0].id);
    let instagramBusinessId = null;
    if (targetPageId) {
      const igRes = await fetch(`https://graph.facebook.com/v21.0/${targetPageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
      const igData = await igRes.json();
      if (igRes.ok && igData.instagram_business_account) {
        instagramBusinessId = igData.instagram_business_account.id;
      }
    }

    res.status(200).json({
      configuredFacebookPageId: pageId,
      pagesVisibleToToken: pages,
      configuredPageIdMatchesToken: !!configuredPageMatch,
      instagramBusinessId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
