// Baikal News - Hybrid Supabase & LocalStorage Database Adapter
// Exposes window.SupabaseAdapter globally

(function() {
  // Maps a raw snake_case Supabase `articles` row to the camelCase shape the
  // rest of admin.js expects (matching the localStorage-stored shape exactly).
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
    // in admin/js/supabase-config.js if no per-browser override is set)
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
    },

    // ==========================================
    // AI Writing Styles & Samples Adapter
    // ==========================================
    fetchWritingStyles: async function() {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('writing_styles')
              .select('*')
              .order('name', { ascending: true });
            if (error) throw error;

            // Map snake_case from DB to camelCase for JS if needed
            return (data || []).map(row => ({
              id: row.id,
              name: row.name,
              description: row.description,
              styleRules: row.style_rules,
              scope: row.scope || 'global',
              ownerEmail: row.owner_email || '',
              updatedAt: row.updated_at
            }));
          } catch (err) {
            console.error("Supabase fetchWritingStyles error, falling back to LocalStorage:", err);
          }
        }
      }
      return JSON.parse(localStorage.getItem("baikal_writing_styles") || "[]");
    },

    saveWritingStyle: async function(style) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const dbRow = {
              id: style.id,
              name: style.name,
              description: style.description,
              style_rules: style.styleRules,
              scope: style.scope || 'global',
              owner_email: style.ownerEmail || '',
              updated_at: new Date().toISOString()
            };
            const { error } = await client
              .from('writing_styles')
              .upsert(dbRow, { onConflict: 'id' });
            if (error) throw error;
            return true;
          } catch (err) {
            console.error("Supabase saveWritingStyle error, falling back to LocalStorage:", err);
          }
        }
      }
      const styles = JSON.parse(localStorage.getItem("baikal_writing_styles") || "[]");
      const idx = styles.findIndex(s => s.id === style.id);
      style.updatedAt = new Date().toISOString();
      if (idx !== -1) {
        styles[idx] = style;
      } else {
        styles.push(style);
      }
      localStorage.setItem("baikal_writing_styles", JSON.stringify(styles));
      return true;
    },

    deleteWritingStyle: async function(styleId) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            await client.from('writing_samples').delete().eq('style_id', styleId);
            const { error } = await client.from('writing_styles').delete().eq('id', styleId);
            if (error) throw error;
            return true;
          } catch (err) {
            console.error("Supabase deleteWritingStyle error, falling back to LocalStorage:", err);
          }
        }
      }
      const styles = JSON.parse(localStorage.getItem("baikal_writing_styles") || "[]").filter(s => s.id !== styleId);
      localStorage.setItem("baikal_writing_styles", JSON.stringify(styles));
      const samples = JSON.parse(localStorage.getItem("baikal_writing_samples") || "[]").filter(s => (s.styleId || s.style_id) !== styleId);
      localStorage.setItem("baikal_writing_samples", JSON.stringify(samples));
      return true;
    },

    fetchWritingSamples: async function(styleId) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('writing_samples')
              .select('*')
              .eq('style_id', styleId)
              .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).map(row => ({
              id: row.id,
              styleId: row.style_id,
              url: row.url,
              title: row.title,
              content: row.content,
              analysis: row.analysis,
              createdAt: row.created_at
            }));
          } catch (err) {
            console.error("Supabase fetchWritingSamples error, falling back to LocalStorage:", err);
          }
        }
      }
      const samples = JSON.parse(localStorage.getItem("baikal_writing_samples") || "[]");
      return samples.filter(s => s.styleId === styleId || s.style_id === styleId);
    },

    saveWritingSample: async function(sample) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const dbRow = {
              id: sample.id,
              style_id: sample.styleId || sample.style_id,
              url: sample.url,
              title: sample.title,
              content: sample.content,
              analysis: sample.analysis,
              created_at: sample.createdAt || new Date().toISOString()
            };
            const { error } = await client
              .from('writing_samples')
              .insert(dbRow);
            if (error) throw error;
            return true;
          } catch (err) {
            console.error("Supabase saveWritingSample error, falling back to LocalStorage:", err);
          }
        }
      }
      const samples = JSON.parse(localStorage.getItem("baikal_writing_samples") || "[]");
      sample.styleId = sample.styleId || sample.style_id;
      sample.createdAt = sample.createdAt || new Date().toISOString();
      samples.unshift(sample);
      localStorage.setItem("baikal_writing_samples", JSON.stringify(samples));
      return true;
    },

    deleteWritingSample: async function(sampleId) {
      if (this.isConfigured()) {
        const client = this.getClient();
        if (client) {
          try {
            const { error } = await client.from('writing_samples').delete().eq('id', sampleId);
            if (error) throw error;
            return true;
          } catch (err) {
            console.error("Supabase deleteWritingSample error, falling back to LocalStorage:", err);
          }
        }
      }
      const samples = JSON.parse(localStorage.getItem("baikal_writing_samples") || "[]").filter(s => s.id !== sampleId);
      localStorage.setItem("baikal_writing_samples", JSON.stringify(samples));
      return true;
    }
  };

  window.SupabaseAdapter = Adapter;
})();
