-- Baikal News - Shorts Style Templates Table
-- Location: supabase/migrations/20260915_shorts_style_templates_table.sql
--
-- Reusable "스타일 템플릿" entries saved from the 숏폼 "템플릿 형성하기"
-- panel (admin.js's getShortsStyleTemplates/saveShortsStyleTemplate/
-- deleteShortsStyleTemplate) lived ONLY in browser localStorage
-- (baikal_shorts_style_templates) -- nothing tied them to a specific
-- shorts project, so they weren't covered by the shorts table migration
-- (20260915_shorts_table.sql). A fresh Chrome profile / different
-- computer starts with empty localStorage, so every saved template
-- (and which one was "last used") was gone the moment that happened.
-- This table is what admin/js/supabase-adapter.js's
-- fetchShortsStyleTemplates/saveShortsStyleTemplate/deleteShortsStyleTemplate
-- now read/write, with localStorage kept only as an offline fallback.
--
-- id stays TEXT (not SERIAL) to match the existing client-generated ids
-- already in use (`tpl-${Date.now()}`), so nothing needs migrating.

CREATE TABLE IF NOT EXISTS public.shorts_style_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    style_guide TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shorts_style_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_shorts_style_templates ON public.shorts_style_templates
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);
