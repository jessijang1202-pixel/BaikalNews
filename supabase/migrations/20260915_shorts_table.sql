-- Baikal News - Shorts (숏폼) Projects Table
-- Location: supabase/migrations/20260915_shorts_table.sql
--
-- admin/js/supabase-adapter.js (fetchShorts/fetchShortsById/saveShorts/
-- deleteShorts) has queried a `public.shorts` table since it was written,
-- but the table itself was never actually created in Supabase -- every
-- call has been silently failing and falling back to browser
-- localStorage only (baikal_shorts), with no real off-browser backup.
-- This creates the table those functions already expect, matching
-- mapShortsRow()'s column mapping exactly.

CREATE TABLE IF NOT EXISTS public.shorts (
    id SERIAL PRIMARY KEY,
    article_id INTEGER REFERENCES public.articles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'script_draft',
    hook_text TEXT DEFAULT '',
    script_md TEXT DEFAULT '',
    script_json JSONB,
    style_guide TEXT DEFAULT '',
    veo_prompt TEXT DEFAULT '',
    veo_video_url TEXT DEFAULT '',
    front_is_image BOOLEAN DEFAULT false,
    image_cuts JSONB DEFAULT '[]'::jsonb,
    final_video_url TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shorts ENABLE ROW LEVEL SECURITY;

-- Admin-only data (never queried by the public site) -- same "no real
-- Supabase Auth layer, admin gate is client-side" pattern already used
-- for curation/static_pages/audit_logs in 20260711_baikal_news_schema.sql.
CREATE POLICY admin_all_shorts ON public.shorts
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);
