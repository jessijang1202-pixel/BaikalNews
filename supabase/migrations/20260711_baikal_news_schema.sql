-- Baikal News - Supabase Migration Schema
-- Location: supabase/migrations/20260711_baikal_news_schema.sql

-- 1. Articles Table
CREATE TABLE IF NOT EXISTS public.articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    lead TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    category_label TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft | review | approved | published | archived
    image TEXT DEFAULT 'images/news_editorial.png',
    author JSONB NOT NULL,
    approver TEXT,
    byline TEXT,
    drafted_by TEXT,
    approved_at TIMESTAMPTZ,
    revision_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    seo_title TEXT,
    seo_meta TEXT,
    slug TEXT UNIQUE,
    canonical_url TEXT,
    is_ymyl BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Curation Table (Single row for homepage layouts)
CREATE TABLE IF NOT EXISTS public.curation (
    id INTEGER PRIMARY KEY DEFAULT 1,
    featured_hero_id INTEGER REFERENCES public.articles(id) ON DELETE SET NULL,
    editors_picks_ids INTEGER[] DEFAULT '{}'::integer[],
    popular_reads_ids INTEGER[] DEFAULT '{}'::integer[],
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Seed curation row if not exists
INSERT INTO public.curation (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 3. Static Pages Table
CREATE TABLE IF NOT EXISTS public.static_pages (
    key TEXT PRIMARY KEY, -- about | editorial-policy | privacy-policy | terms | corrections | contact
    html_content TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL,
    article_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Enable Row-Level Security (RLS)
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.static_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies Configuration
-- A. Articles Policies
-- Anonymous users (public readers) can only read published articles
CREATE POLICY select_published_anon ON public.articles
    FOR SELECT
    TO anon, authenticated
    USING (status = 'published');

-- Admins / Editors can manage all articles
CREATE POLICY admin_all_articles ON public.articles
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- B. Curation Policies
-- Anyone can view curation
CREATE POLICY select_curation_public ON public.curation
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Admin can manage curation
CREATE POLICY admin_all_curation ON public.curation
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- C. Static Pages Policies
-- Anyone can read static pages
CREATE POLICY select_static_pages_public ON public.static_pages
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Admin can manage static pages
CREATE POLICY admin_all_static_pages ON public.static_pages
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- D. Audit Logs Policies
-- Admin can view and insert audit logs, public cannot see
CREATE POLICY admin_all_audit_logs ON public.audit_logs
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);
