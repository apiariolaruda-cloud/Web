(() => {
  "use strict";

  const NUCLEO_STATUS_FLOW = [
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
      description: "El material necesario para el núcleo ya está preparado."
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

  // Para pedidos compuestos solamente por reinas reutilizamos la clave
  // material_preparado como etapa "Reina encerrada". De esta forma no hace
  // falta modificar la estructura actual de la base de datos.
  const REINA_STATUS_FLOW = [
    {
      key: "reina_fecundada",
      label: "Reina fecundada",
      short: "Reina fecundada",
      description: "La reina ya se encuentra fecundada."
    },
    {
      key: "material_preparado",
      label: "Reina encerrada",
      short: "Reina encerrada",
      description: "La reina ya fue encerrada y está preparada para continuar con el pedido."
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

  const GENERAL_STATUS_FLOW = [
    {
      key: "pedido_ingresado",
      label: "Pedido ingresado",
      short: "Ingresado",
      description: "Recibimos el pedido y quedó registrado en nuestro sistema."
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

  const STATUS_FILTER = [
    { key: "pedido_ingresado", label: "Pedido ingresado" },
    { key: "material_preparado", label: "Material preparado / Reina encerrada" },
    { key: "reina_fecundada", label: "Reina fecundada" },
    { key: "pendiente_pago", label: "Pendiente de pago" },
    { key: "pago_confirmado", label: "Pago confirmado" },
    { key: "envio", label: "Envío / entrega" },
    { key: "finalizado", label: "Finalizado" }
  ];

  // Compatibilidad con código anterior: STATUS_FLOW sigue siendo el circuito de núcleos.
  const STATUS_FLOW = NUCLEO_STATUS_FLOW;

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

  function orderItems(orderOrItems) {
    if (Array.isArray(orderOrItems)) return orderOrItems;
    if (!orderOrItems || typeof orderOrItems !== "object") return [];
    if (Array.isArray(orderOrItems.items)) return orderOrItems.items;
    if (Array.isArray(orderOrItems.order_items)) return orderOrItems.order_items;
    return [];
  }

  function normalizedDescription(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function detectOrderType(orderOrItems) {
    const descriptions = orderItems(orderOrItems)
      .map(item => normalizedDescription(item?.description))
      .filter(Boolean);

    const hasNucleo = descriptions.some(text => /\bnucleo(s)?\b/.test(text));
    const hasQueenOrder = descriptions.some(text =>
      /\breina(s)?\b/.test(text) && !/\bjaula(s)?\b/.test(text)
    );

    // Si hay núcleo + reina, prevalece el circuito de núcleo porque la reina
    // forma parte del proceso de armado del núcleo. Los artículos generales
    // (por ejemplo una jaula de reina) usan un circuito corto y genérico.
    if (hasNucleo) return "nucleo";
    if (hasQueenOrder) return "reina";
    return "general";
  }

  function statusFlow(orderOrItems) {
    const type = detectOrderType(orderOrItems);
    if (type === "reina") return REINA_STATUS_FLOW;
    if (type === "nucleo") return NUCLEO_STATUS_FLOW;
    return GENERAL_STATUS_FLOW;
  }

  function statusByKey(key, orderOrItems) {
    const flow = statusFlow(orderOrItems);
    return flow.find(status => status.key === key)
      || NUCLEO_STATUS_FLOW.find(status => status.key === key)
      || REINA_STATUS_FLOW.find(status => status.key === key)
      || flow[0];
  }

  function statusIndex(key, orderOrItems) {
    const flow = statusFlow(orderOrItems);
    const index = flow.findIndex(status => status.key === key);
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
    const type = detectOrderType(order);

    const common = {
      pedido_ingresado:
        `Hola${namePart}. Tu pedido ${code} en Apiario La Ruda ya fue ingresado. ` +
        `Desde ahora podés seguir cada etapa desde este enlace:\n${link}`,
      pendiente_pago:
        `Hola${namePart}. Tu pedido ${code} llegó a la etapa de pago.${totalLine} ` +
        `Podés consultar el estado actualizado acá:\n${link}`,
      pago_confirmado:
        `Hola${namePart}. Confirmamos correctamente el pago de tu pedido ${code}. ` +
        `Podés ver el estado actualizado acá:\n${link}`,
      envio:
        `Hola${namePart}. Tu pedido ${code} ya está en etapa de envío / entrega. ` +
        `Vamos a coordinar con vos los detalles correspondientes. Seguimiento:\n${link}`,
      finalizado:
        `Hola${namePart}. Tu pedido ${code} figura como finalizado. ` +
        `Gracias por elegir Apiario La Ruda. Podés consultar el registro del pedido acá:\n${link}`
    };

    const nucleoMessages = {
      ...common,
      material_preparado:
        `Hola${namePart}. Tenemos novedades de tu pedido ${code}: el material para tu núcleo ya está preparado. ` +
        `Podés ver el avance acá:\n${link}`,
      reina_fecundada:
        `Hola${namePart}. Tu pedido ${code} avanzó: la reina del núcleo ya se encuentra fecundada. ` +
        `Seguimiento actualizado:\n${link}`
    };

    const reinaMessages = {
      ...common,
      reina_fecundada:
        `Hola${namePart}. Tu pedido ${code} avanzó: la reina ya se encuentra fecundada. ` +
        `Seguimiento actualizado:\n${link}`,
      material_preparado:
        `Hola${namePart}. Tu pedido ${code} avanzó: la reina ya se encuentra encerrada. ` +
        `Podés ver el estado actualizado acá:\n${link}`
    };

    const messages = type === "reina" ? reinaMessages : nucleoMessages;
    return messages[order.status] || common.pedido_ingresado;
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
    NUCLEO_STATUS_FLOW,
    REINA_STATUS_FLOW,
    GENERAL_STATUS_FLOW,
    STATUS_FILTER,
    getConfig,
    isConfigured,
    createDbClient,
    escapeHtml,
    cleanTrackingCode,
    cleanPhone,
    formatMoney,
    formatDate,
    formatDateTime,
    detectOrderType,
    statusFlow,
    statusByKey,
    statusIndex,
    trackingUrl,
    whatsappUrl,
    buildWhatsAppMessage,
    copyText
  };
})();
