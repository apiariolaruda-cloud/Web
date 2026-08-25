/*
  Supabase Lite para Apiario La Ruda.
  Implementa únicamente las operaciones usadas por esta web mediante fetch,
  evitando depender de un CDN externo para @supabase/supabase-js.
*/
(() => {
  "use strict";

  function createClient(projectUrl, publishableKey) {
    const baseUrl = String(projectUrl || "").replace(/\/$/, "");
    const apiKey = String(publishableKey || "");
    const storageKey = `la_ruda_supabase_session_${baseUrl.replace(/\W+/g, "_")}`;
    const listeners = new Set();

    function readSession() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const session = JSON.parse(raw);
        return session && session.access_token ? session : null;
      } catch (_error) {
        return null;
      }
    }

    function writeSession(session) {
      if (!session) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(session));
      }
    }

    function notify(event, session) {
      listeners.forEach(callback => {
        try { callback(event, session); } catch (error) { console.error(error); }
      });
    }

    async function parseResponse(response) {
      const text = await response.text();
      let payload = null;
      if (text) {
        try { payload = JSON.parse(text); } catch (_error) { payload = text; }
      }
      if (!response.ok) {
        const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || `HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.details = payload;
        return { data: null, error };
      }
      return { data: payload, error: null };
    }

    async function refreshSessionIfNeeded() {
      const session = readSession();
      if (!session) return null;

      const now = Math.floor(Date.now() / 1000);
      if (!session.expires_at || session.expires_at - now > 60) return session;
      if (!session.refresh_token) {
        writeSession(null);
        notify("SIGNED_OUT", null);
        return null;
      }

      try {
        const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            apikey: apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ refresh_token: session.refresh_token })
        });
        const result = await parseResponse(response);
        if (result.error || !result.data?.access_token) {
          writeSession(null);
          notify("SIGNED_OUT", null);
          return null;
        }
        const fresh = normalizeSession(result.data);
        writeSession(fresh);
        notify("TOKEN_REFRESHED", fresh);
        return fresh;
      } catch (error) {
        console.error("No se pudo refrescar la sesión de Supabase", error);
        return session;
      }
    }

    function normalizeSession(data) {
      const now = Math.floor(Date.now() / 1000);
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type || "bearer",
        expires_in: data.expires_in || 3600,
        expires_at: data.expires_at || (now + Number(data.expires_in || 3600)),
        user: data.user || null
      };
    }

    async function requestHeaders(extra = {}, useAuth = true) {
      const headers = {
        apikey: apiKey,
        ...extra
      };
      if (useAuth) {
        const session = await refreshSessionIfNeeded();
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      }
      return headers;
    }

    class QueryBuilder {
      constructor(table) {
        this.table = table;
        this.method = "GET";
        this.body = undefined;
        this.filters = [];
        this.selectColumns = null;
        this.orderBy = null;
        this.wantSingle = false;
        this.returnRepresentation = false;
      }

      select(columns = "*") {
        this.selectColumns = columns;
        if (this.method !== "GET") this.returnRepresentation = true;
        return this;
      }

      insert(payload) {
        this.method = "POST";
        this.body = payload;
        return this;
      }

      update(payload) {
        this.method = "PATCH";
        this.body = payload;
        return this;
      }

      delete() {
        this.method = "DELETE";
        return this;
      }

      eq(column, value) {
        this.filters.push([column, `eq.${value}`]);
        return this;
      }

      order(column, options = {}) {
        this.orderBy = `${column}.${options.ascending === false ? "desc" : "asc"}`;
        return this;
      }

      single() {
        this.wantSingle = true;
        return this;
      }

      async execute() {
        try {
          const url = new URL(`${baseUrl}/rest/v1/${encodeURIComponent(this.table)}`);
          if (this.selectColumns) url.searchParams.set("select", this.selectColumns);
          this.filters.forEach(([key, value]) => url.searchParams.append(key, value));
          if (this.orderBy) url.searchParams.set("order", this.orderBy);

          const extraHeaders = {};
          if (this.body !== undefined) extraHeaders["Content-Type"] = "application/json";
          if (this.returnRepresentation) extraHeaders.Prefer = "return=representation";
          if (this.wantSingle) extraHeaders.Accept = "application/vnd.pgrst.object+json";

          const response = await fetch(url.toString(), {
            method: this.method,
            headers: await requestHeaders(extraHeaders, true),
            body: this.body === undefined ? undefined : JSON.stringify(this.body)
          });

          const result = await parseResponse(response);
          if (result.error) return result;

          let data = result.data;
          if ((this.method === "POST" || this.method === "PATCH") && this.returnRepresentation && this.wantSingle && Array.isArray(data)) {
            data = data[0] ?? null;
          }
          return { data, error: null };
        } catch (error) {
          return { data: null, error };
        }
      }

      then(resolve, reject) {
        return this.execute().then(resolve, reject);
      }
    }

    const auth = {
      async signInWithPassword({ email, password }) {
        try {
          const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
              apikey: apiKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
          });
          const result = await parseResponse(response);
          if (result.error) return { data: { session: null, user: null }, error: result.error };

          const session = normalizeSession(result.data);
          writeSession(session);
          notify("SIGNED_IN", session);
          return { data: { session, user: session.user }, error: null };
        } catch (error) {
          return { data: { session: null, user: null }, error };
        }
      },

      async getSession() {
        const session = await refreshSessionIfNeeded();
        return { data: { session }, error: null };
      },

      async signOut() {
        const session = readSession();
        try {
          if (session?.access_token) {
            await fetch(`${baseUrl}/auth/v1/logout`, {
              method: "POST",
              headers: {
                apikey: apiKey,
                Authorization: `Bearer ${session.access_token}`
              }
            });
          }
        } catch (_error) {
          // El cierre local debe ocurrir aunque falle la red.
        }
        writeSession(null);
        notify("SIGNED_OUT", null);
        return { error: null };
      },

      onAuthStateChange(callback) {
        listeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe() { listeners.delete(callback); }
            }
          }
        };
      }
    };

    async function rpc(functionName, args = {}) {
      try {
        const response = await fetch(`${baseUrl}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
          method: "POST",
          headers: await requestHeaders({ "Content-Type": "application/json" }, true),
          body: JSON.stringify(args)
        });
        return await parseResponse(response);
      } catch (error) {
        return { data: null, error };
      }
    }

    return {
      auth,
      from(table) { return new QueryBuilder(table); },
      rpc
    };
  }

  window.supabase = { createClient };
})();
