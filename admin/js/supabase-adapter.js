// Baikal News - Hybrid Supabase & LocalStorage Database Adapter
// Exposes window.SupabaseAdapter globally

(function() {
  const Adapter = {
    // 1. Connection states
    isConfigured: function() {
      const url = localStorage.getItem("baikal_supabase_url");
      const key = localStorage.getItem("baikal_supabase_key");
      return !!(url && key);
    },

    getClient: function() {
      if (!this.isConfigured()) return null;
      
      const url = localStorage.getItem("baikal_supabase_url");
      const key = localStorage.getItem("baikal_supabase_key");
      
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
            return data || [];
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
            return data;
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
              author: article.author,
              approver: article.approver,
              byline: article.byline,
              drafted_by: article.draftedBy,
              approved_at: article.approvedAt,
              revision_history: article.revisionHistory,
              seo_title: article.seoTitle,
              seo_meta: article.seoMeta,
              slug: article.slug,
              canonical_url: article.canonicalUrl || "",
              is_ymyl: article.isYMYL || false,
              is_pinned: article.isPinned || false,
              is_featured: article.isFeatured || false
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
              popular_reads_ids: curation.popularReadsIds
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
              const camelCased = data.map(row => ({
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
                author: row.author,
                approver: row.approver,
                byline: row.byline,
                draftedBy: row.drafted_by,
                approvedAt: row.approved_at,
                revisionHistory: row.revision_history,
                seoTitle: row.seo_title,
                seoMeta: row.seo_meta,
                slug: row.slug,
                canonicalUrl: row.canonical_url,
                isYMYL: row.is_ymyl,
                isPinned: row.is_pinned,
                isFeatured: row.is_featured
              }));
              
              localStorage.setItem("baikal_articles", JSON.stringify(camelCased));
              window.ARTICLES = camelCased;
              console.log("Supabase database synced to LocalStorage cache successfully.");
            }
          } catch (err) {
            console.warn("Supabase local sync failed:", err);
          }
        }
      }
    }
  };

  window.SupabaseAdapter = Adapter;
})();
