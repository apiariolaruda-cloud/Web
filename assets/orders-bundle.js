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
/*
  APIARIO LA RUDA - CONFIGURACIÓN DEL PANEL DE PEDIDOS

  1) Crear el proyecto en Supabase.
  2) Ejecutar el archivo supabase_setup.sql en SQL Editor.
  3) Copiar Project URL y anon/public key debajo.

  IMPORTANTE: la contraseña de administración NO se guarda en este archivo.
*/
window.LA_RUDA_CONFIG = {
  supabaseUrl: "https://bfqqpniakxznbgfbektb.supabase.co",
  supabaseAnonKey: "sb_publishable_InNsEXDoaDs-hTDeHl6vPA_Q05BuaBp",
  adminUsername: "admin",
  adminEmail: "admin@apiariolaruda.local",
  siteUrl: ""
};
(() => {
  "use strict";

  const STATUS_FLOW = [
    {
      key: "pedido_ingresado",
      label: "Pedido ingresado",
      short: "Ingresado",
      description: "Recibimos el pedido y quedó registrado en nuestro sistema."
    },
    {
      key: "material_preparado",
      label: "Material preparado",
      short: "Material preparado",
      description: "Estamos preparando el material necesario para formar el núcleo."
    },
    {
      key: "reina_fecundada",
      label: "Reina fecundada",
      short: "Reina fecundada",
      description: "La reina del pedido ya se encuentra fecundada y el núcleo sigue avanzando."
    },
    {
      key: "pendiente_pago",
      label: "Pendiente de pago",
      short: "Pendiente de pago",
      description: "El pedido llegó a la instancia de pago."
    },
    {
      key: "pago_confirmado",
      label: "Pago confirmado",
      short: "Pago confirmado",
      description: "Registramos correctamente el pago del pedido."
    },
    {
      key: "envio",
      label: "Envío / entrega",
      short: "Envío / entrega",
      description: "El pedido está en la etapa de despacho o coordinación de entrega."
    },
    {
      key: "finalizado",
      label: "Finalizado",
      short: "Finalizado",
      description: "El pedido fue entregado y quedó finalizado."
    }
  ];

  const moneyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  });

  const dateFormatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  function getConfig() {
    return window.LA_RUDA_CONFIG || {};
  }

  function isConfigured() {
    const cfg = getConfig();
    return Boolean(
      cfg.supabaseUrl &&
      cfg.supabaseAnonKey &&
      !String(cfg.supabaseUrl).includes("PEGA_AQUI") &&
      !String(cfg.supabaseAnonKey).includes("PEGA_AQUI")
    );
  }

  function createDbClient() {
    if (!isConfigured() || !window.supabase) return null;
    const cfg = getConfig();
    return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanTrackingCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function cleanPhone(value) {
    let phone = String(value || "").replace(/\D/g, "");
    if (!phone) return "";

    // Ayuda para números argentinos ingresados como 11XXXXXXXX.
    if (phone.length === 10 && !phone.startsWith("54")) {
      phone = `549${phone}`;
    } else if (phone.startsWith("54") && !phone.startsWith("549") && phone.length >= 12) {
      phone = `549${phone.slice(2)}`;
    }

    return phone;
  }

  function formatMoney(value) {
    const number = Number(value || 0);
    return moneyFormatter.format(Number.isFinite(number) ? number : 0);
  }

  function formatDate(value) {
    if (!value) return "A coordinar";
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? "A coordinar" : dateFormatter.format(date);
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
  }

  function statusByKey(key) {
    return STATUS_FLOW.find(status => status.key === key) || STATUS_FLOW[0];
  }

  function statusIndex(key) {
    const index = STATUS_FLOW.findIndex(status => status.key === key);
    return index < 0 ? 0 : index;
  }

  function trackingUrl(code) {
    const cfg = getConfig();
    const cleanCode = cleanTrackingCode(code);
    if (cfg.siteUrl) {
      const base = String(cfg.siteUrl).replace(/\/$/, "");
      return `${base}/seguimiento.html?pedido=${encodeURIComponent(cleanCode)}`;
    }
    return new URL(`seguimiento.html?pedido=${encodeURIComponent(cleanCode)}`, window.location.href).href;
  }

  function whatsappUrl(phone, message) {
    const clean = cleanPhone(phone);
    const text = encodeURIComponent(String(message || ""));
    return clean ? `https://wa.me/${clean}?text=${text}` : `https://wa.me/?text=${text}`;
  }

  function buildWhatsAppMessage(order) {
    const firstName = String(order.customer_name || "").trim().split(/\s+/)[0] || "";
    const namePart = firstName ? ` ${firstName}` : "";
    const code = order.tracking_code || "";
    const link = trackingUrl(code);
    const total = Number(order.total || 0);
    const totalLine = total > 0 ? `\nImporte registrado: ${formatMoney(total)}.` : "";

    const messages = {
      pedido_ingresado:
        `Hola${namePart}. Tu pedido ${code} en Apiario La Ruda ya fue ingresado. ` +
        `Desde ahora podés seguir cada etapa desde este enlace:\n${link}`,
      material_preparado:
        `Hola${namePart}. Tenemos novedades de tu pedido ${code}: el material para tu núcleo ya está preparado. ` +
        `Podés ver el avance acá:\n${link}`,
      reina_fecundada:
        `Hola${namePart}. Tu pedido ${code} avanzó: la reina ya se encuentra fecundada. ` +
        `Seguimiento actualizado:\n${link}`,
      pendiente_pago:
        `Hola${namePart}. Tu pedido ${code} llegó a la etapa de pago.${totalLine} ` +
        `Podés consultar el estado actualizado acá:\n${link}`,
      pago_confirmado:
        `Hola${namePart}. Confirmamos correctamente el pago de tu pedido ${code}. ` +
        `Seguimos avanzando con la preparación. Podés verlo acá:\n${link}`,
      envio:
        `Hola${namePart}. Tu pedido ${code} ya está en etapa de envío / entrega. ` +
        `Vamos a coordinar con vos los detalles correspondientes. Seguimiento:\n${link}`,
      finalizado:
        `Hola${namePart}. Tu pedido ${code} figura como finalizado. ` +
        `Gracias por elegir Apiario La Ruda. Podés consultar el registro del pedido acá:\n${link}`
    };

    return messages[order.status] || messages.pedido_ingresado;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  window.LaRudaOrders = {
    STATUS_FLOW,
    getConfig,
    isConfigured,
    createDbClient,
    escapeHtml,
    cleanTrackingCode,
    cleanPhone,
    formatMoney,
    formatDate,
    formatDateTime,
    statusByKey,
    statusIndex,
    trackingUrl,
    whatsappUrl,
    buildWhatsAppMessage,
    copyText
  };
})();
