// Baikal News - Hybrid Supabase & LocalStorage Database Adapter
// Exposes window.SupabaseAdapter globally

(function() {
  // Converts a raw Postgres row (snake_case) to the camelCase shape the rest
  // of the site reads (e.g. article.scheduledAt) -- fetchArticles/fetchArticleById
  // used to return raw rows here, so isArticleLive()'s scheduledAt check was
  // always undefined and a scheduled article could never go live on its own.
  function mapArticleRow(row) {
    if (!row) return row;
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      lead: row.lead,
      content: row.content,
      category: row.category,
      categoryLabel: row.category_label,
      date: row.date,
      status: row.status,
      image: row.image,
      imageCaption: row.image_caption,
      author: row.author,
      approver: row.approver,
      byline: row.byline,
      draftedBy: row.drafted_by,
      approvedAt: row.approved_at,
      scheduledAt: row.scheduled_at,
      revisionHistory: row.revision_history,
      seoTitle: row.seo_title,
      seoMeta: row.seo_meta,
      slug: row.slug,
      canonicalUrl: row.canonical_url,
      isYMYL: row.is_ymyl,
      isPinned: row.is_pinned,
      isFeatured: row.is_featured,
      views: row.views || 0
    };
  }

  const Adapter = {
    // 1. Connection states (falls back to the site's baked-in project config
    // in js/supabase-config.js if no per-browser override is set)
    isConfigured: function() {
      const url = localStorage.getItem("baikal_supabase_url") || window.SUPABASE_URL;
      const key = localStorage.getItem("baikal_supabase_key") || window.SUPABASE_ANON_KEY;
      return !!(url && key);
    },

    getClient: function() {
      if (!this.isConfigured()) return null;

      const url = localStorage.getItem("baikal_supabase_url") || window.SUPABASE_URL;
      const key = localStorage.getItem("baikal_supabase_key") || window.SUPABASE_ANON_KEY;

      // Initialize client globally if not cached
      if (!window.supabaseClient) {
        if (typeof supabase === 'undefined') {
          console.error("Supabase SDK is not loaded in the browser. Fallback to LocalStorage.");
          return null;
        }
        window.supabaseClient = supabase.createClient(url, key);
      }
      return window.supabaseClient;
    },

    // 2. Fetch all articles
    fetchArticles: async function() {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('articles')
              .select('*')
              .order('id', { ascending: true });
            
            if (error) throw error;
            return (data || []).map(mapArticleRow);
          } catch (err) {
            console.error("Supabase fetchArticles error, falling back to LocalStorage:", err);
          }
        }
      }
      
      // Fallback
      return JSON.parse(localStorage.getItem("baikal_articles") || "[]");
    },

    // 3. Fetch single article by ID
    fetchArticleById: async function(id) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('articles')
              .select('*')
              .eq('id', id)
              .maybeSingle();
            
            if (error) throw error;
            return mapArticleRow(data);
          } catch (err) {
            console.error(`Supabase fetchArticleById (${id}) error, falling back to LocalStorage:`, err);
          }
        }
      }

      // Fallback
      const articles = JSON.parse(localStorage.getItem("baikal_articles") || "[]");
      return articles.find(a => a.id === id) || null;
    },

    // 4. Save (Insert or Update) Article
    saveArticle: async function(article) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            // Map JS camelCase object variables to PostgreSQL snake_case schema columns
            const dbRow = {
              id: article.id,
              title: article.title,
              subtitle: article.subtitle,
              lead: article.lead,
              content: article.content,
              category: article.category,
              category_label: article.categoryLabel,
              date: article.date,
              status: article.status,
              image: article.image,
              image_caption: article.imageCaption || '',
              author: article.author,
              approver: article.approver,
              byline: article.byline,
              drafted_by: article.draftedBy,
              approved_at: article.approvedAt,
              scheduled_at: article.scheduledAt || null,
              revision_history: article.revisionHistory,
              seo_title: article.seoTitle,
              seo_meta: article.seoMeta,
              slug: article.slug,
              canonical_url: article.canonicalUrl || "",
              is_ymyl: article.isYMYL || false,
              is_pinned: article.isPinned || false,
              is_featured: article.isFeatured || false,
              views: article.views || 0
            };

            const { data, error } = await client
              .from('articles')
              .upsert(dbRow, { onConflict: 'id' })
              .select();

            if (error) throw error;
            
            // Sync locally to keep secondary storage warm
            this.syncLocalArticles();
            return true;
          } catch (err) {
            console.error("Supabase saveArticle error, falling back to LocalStorage:", err);
          }
        }
      }

      // Fallback CRUD
      const articles = JSON.parse(localStorage.getItem("baikal_articles") || "[]");
      const idx = articles.findIndex(a => a.id === article.id);
      if (idx !== -1) {
        articles[idx] = article;
      } else {
        articles.push(article);
      }
      localStorage.setItem("baikal_articles", JSON.stringify(articles));
      return true;
    },

    // 5. Delete Article (Soft delete by setting status to archived, or hard delete)
    deleteArticle: async function(id) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { error } = await client
              .from('articles')
              .delete()
              .eq('id', id);
            
            if (error) throw error;
            this.syncLocalArticles();
            return true;
          } catch (err) {
            console.error("Supabase deleteArticle error, falling back to LocalStorage:", err);
          }
        }
      }

      // Fallback
      const articles = JSON.parse(localStorage.getItem("baikal_articles") || "[]");
      const filtered = articles.filter(a => a.id !== id);
      localStorage.setItem("baikal_articles", JSON.stringify(filtered));
      return true;
    },

    // 6. Homepage Curation
    fetchCuration: async function() {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('curation')
              .select('*')
              .eq('id', 1)
              .maybeSingle();

            if (error) throw error;
            
            if (data) {
              return {
                featuredHeroId: data.featured_hero_id,
                editorsPicksIds: data.editors_picks_ids || [],
                popularReadsIds: data.popular_reads_ids || [],
                latestNewsIds: data.latest_news_ids || [],
                pinnedIds: []
              };
            }
          } catch (err) {
            console.error("Supabase fetchCuration error, falling back to LocalStorage:", err);
          }
        }
      }

      // Fallback
      return JSON.parse(localStorage.getItem("baikal_curation") || "{}");
    },

    saveCuration: async function(curation) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const dbRow = {
              id: 1,
              featured_hero_id: curation.featuredHeroId,
              editors_picks_ids: curation.editorsPicksIds,
              popular_reads_ids: curation.popularReadsIds,
              latest_news_ids: curation.latestNewsIds
            };

            const { error } = await client
              .from('curation')
              .upsert(dbRow, { onConflict: 'id' });

            if (error) throw error;
            return true;
          } catch (err) {
            console.error("Supabase saveCuration error, falling back to LocalStorage:", err);
          }
        }
      }

      // Fallback
      localStorage.setItem("baikal_curation", JSON.stringify(curation));
      return true;
    },

    // 7. Static Pages
    fetchStaticPages: async function() {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('static_pages')
              .select('*');

            if (error) throw error;
            
            const overrides = {};
            if (data) {
              data.forEach(row => {
                overrides[row.key] = row.html_content;
              });
            }
            return overrides;
          } catch (err) {
            console.error("Supabase fetchStaticPages error, falling back to LocalStorage:", err);
          }
        }
      }

      // Fallback
      return JSON.parse(localStorage.getItem("baikal_static_pages") || "{}");
    },

    saveStaticPage: async function(key, htmlContent) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { error } = await client
              .from('static_pages')
              .upsert({ key: key, html_content: htmlContent }, { onConflict: 'key' });

            if (error) throw error;
            return true;
          } catch (err) {
            console.error(`Supabase saveStaticPage (${key}) error, falling back to LocalStorage:`, err);
          }
        }
      }

      // Fallback
      const overrides = JSON.parse(localStorage.getItem("baikal_static_pages") || "{}");
      overrides[key] = htmlContent;
      localStorage.setItem("baikal_static_pages", JSON.stringify(overrides));
      return true;
    },

    // 8. Audit logs
    fetchAuditLogs: async function() {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('audit_logs')
              .select('*')
              .order('id', { ascending: false });

            if (error) throw error;
            
            // Map snake_case database schema to JS camelCase
            return (data || []).map(row => ({
              id: row.id,
              timestamp: row.timestamp,
              role: row.role,
              action: row.action,
              articleId: row.article_id,
              notes: row.notes
            }));
          } catch (err) {
            console.error("Supabase fetchAuditLogs error, falling back to LocalStorage:", err);
          }
        }
      }

      // Fallback
      return JSON.parse(localStorage.getItem("baikal_audit_logs") || "[]");
    },

    saveAuditLog: async function(log) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const dbRow = {
              timestamp: log.timestamp,
              role: log.role,
              action: log.action,
              article_id: String(log.articleId),
              notes: log.notes
            };

            const { error } = await client
              .from('audit_logs')
              .insert(dbRow);

            if (error) throw error;
            return true;
          } catch (err) {
            console.error("Supabase saveAuditLog error, falling back to LocalStorage:", err);
          }
        }
      }

      // Fallback
      const logs = JSON.parse(localStorage.getItem("baikal_audit_logs") || "[]");
      logs.unshift(log);
      localStorage.setItem("baikal_audit_logs", JSON.stringify(logs));
      return true;
    },

    // Helper: Sync remote Supabase database back to localStorage so that the public reader site
    // continues to run blazing fast without hitting database limits during normal navigation.
    syncLocalArticles: async function() {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('articles')
              .select('*')
              .order('id', { ascending: true });
            
            if (error) throw error;
            
            if (data) {
              const camelCased = data.map(mapArticleRow);

              localStorage.setItem("baikal_articles", JSON.stringify(camelCased));
              window.ARTICLES = camelCased;
              console.log("Supabase database synced to LocalStorage cache successfully.");
            }
          } catch (err) {
            console.warn("Supabase local sync failed:", err);
          }
        }
      }
    },

    // 9. Article page-view tracking
    incrementArticleView: async function(id) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error: fetchErr } = await client
              .from('articles')
              .select('views')
              .eq('id', id)
              .maybeSingle();
            if (fetchErr) throw fetchErr;

            const newViews = ((data && data.views) || 0) + 1;
            const { error } = await client
              .from('articles')
              .update({ views: newViews })
              .eq('id', id);
            if (error) throw error;

            // Keep the local cache warm so this reader's own view reflects immediately
            const cached = JSON.parse(localStorage.getItem("baikal_articles") || "[]");
            const idx = cached.findIndex(a => a.id === id);
            if (idx !== -1) {
              cached[idx].views = newViews;
              localStorage.setItem("baikal_articles", JSON.stringify(cached));
            }
            return newViews;
          } catch (err) {
            console.error(`Supabase incrementArticleView (${id}) error, falling back to LocalStorage:`, err);
          }
        }
      }

      // Fallback: local-only counter
      const articles = JSON.parse(localStorage.getItem("baikal_articles") || "[]");
      const idx = articles.findIndex(a => a.id === id);
      if (idx === -1) return 0;
      articles[idx].views = (articles[idx].views || 0) + 1;
      localStorage.setItem("baikal_articles", JSON.stringify(articles));
      return articles[idx].views;
    },

    // Logs a single page-view event (timestamp + anonymous per-browser visitor id)
    // so the admin dashboard can chart daily views/unique visitors over time.
    // Best-effort only -- never blocks or breaks article rendering if it fails.
    logPageView: async function(articleId) {
      if (!this.isConfigured()) return;
      const client = this.getClient();
      if (!client) return;

      try {
        let visitorId = localStorage.getItem("baikal_visitor_id");
        if (!visitorId) {
          visitorId = crypto.randomUUID ? crypto.randomUUID() : ('visitor-' + Date.now() + Math.random().toString(36).slice(2));
          localStorage.setItem("baikal_visitor_id", visitorId);
        }

        await client.from('page_views').insert({
          article_id: articleId || null,
          visitor_id: visitorId
        });
      } catch (err) {
        console.warn("logPageView failed (non-critical):", err);
      }
    },

    // Newsletter signup from the homepage form. Throws a Korean-language
    // error the caller can show directly (duplicate email vs. any other failure).
    subscribeNewsletter: async function(email) {
      const client = this.getClient();
      if (!client) {
        throw new Error("구독 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }

      const { error } = await client.from('newsletter_subscribers').insert({ email });
      if (error) {
        if (error.code === '23505') {
          throw new Error("이미 구독 중인 이메일 주소입니다.");
        }
        console.error("Supabase subscribeNewsletter error:", error);
        throw new Error("구독 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
      return true;
    },

    // 카카오톡 3분 뉴스 signup from the homepage form. Same shape as
    // subscribeNewsletter -- collects the phone number now; actual sending
    // happens later via a 카카오톡 채널, not automated from here yet.
    subscribeKakao: async function(phone) {
      const client = this.getClient();
      if (!client) {
        throw new Error("신청 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }

      const { error } = await client.from('kakao_subscribers').insert({ phone });
      if (error) {
        if (error.code === '23505') {
          throw new Error("이미 신청된 전화번호입니다.");
        }
        console.error("Supabase subscribeKakao error:", error);
        throw new Error("신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
      return true;
    }
  };

  window.SupabaseAdapter = Adapter;
})();
