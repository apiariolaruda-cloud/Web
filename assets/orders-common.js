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
    const base = String(cfg.siteUrl || window.location.origin || "").replace(/\/$/, "");
    return `${base}/seguimiento.html?pedido=${encodeURIComponent(cleanTrackingCode(code))}`;
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
