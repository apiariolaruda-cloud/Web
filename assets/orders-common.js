(() => {
  "use strict";

  const PRODUCT_CATALOG = [
    { code: "miel_1kg", label: "Miel 1 kg", type: "general" },
    { code: "miel_500g", label: "Miel 500 g", type: "general" },
    { code: "nucleo_baby_insumo", label: "Núcleo Baby · material 3D", type: "general" },
    { code: "alimentador_externo", label: "Alimentador externo", type: "general" },
    { code: "jaula_belton", label: "Jaula tipo Belton", type: "general" },
    { code: "reina_fecundada", label: "Reina fecundada + nodrizas", type: "reina" },
    { code: "nucleo_baby_vivo", label: "Núcleo Baby · material vivo", type: "nucleo" },
    { code: "nucleo_estandar", label: "Núcleo · 4 cuadros estándar", type: "nucleo" }
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

  const NUCLEO_PREP_FLOW = [
    {
      key: "pendiente",
      label: "Preparación pendiente",
      short: "Pendiente",
      description: "El pedido está ingresado y la preparación del núcleo todavía no comenzó."
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
      description: "La reina destinada al núcleo ya se encuentra fecundada."
    }
  ];

  const REINA_PREP_FLOW = [
    {
      key: "pendiente",
      label: "Preparación pendiente",
      short: "Pendiente",
      description: "La preparación de la reina todavía no comenzó."
    },
    {
      key: "reina_fecundada",
      label: "Reina fecundada",
      short: "Reina fecundada",
      description: "La reina ya se encuentra fecundada."
    },
    {
      key: "reina_encerrada",
      label: "Reina encerrada",
      short: "Reina encerrada",
      description: "La reina ya fue encerrada y está preparada para continuar con el pedido."
    }
  ];

  const STATUS_FILTER = GENERAL_STATUS_FLOW.map(({ key, label }) => ({ key, label }));
  const STATUS_FLOW = GENERAL_STATUS_FLOW;
  const NUCLEO_STATUS_FLOW = NUCLEO_PREP_FLOW;
  const REINA_STATUS_FLOW = REINA_PREP_FLOW;

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

  function normalizedDescription(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function orderItems(orderOrItems) {
    if (Array.isArray(orderOrItems)) return orderOrItems;
    if (!orderOrItems || typeof orderOrItems !== "object") return [];
    if (Array.isArray(orderOrItems.items)) return orderOrItems.items;
    if (Array.isArray(orderOrItems.order_items)) return orderOrItems.order_items;
    return [];
  }

  function catalogProduct(code) {
    return PRODUCT_CATALOG.find(product => product.code === code) || null;
  }

  function inferProduct(item = {}) {
    const exact = catalogProduct(item.product_code);
    if (exact) return exact;

    const text = normalizedDescription(item.description);
    if (!text) return null;

    const sameLabel = PRODUCT_CATALOG.find(product => normalizedDescription(product.label) === text);
    if (sameLabel) return sameLabel;

    if (/\bnucleo(s)?\b/.test(text) && !text.includes("3d") && !text.includes("insumo")) {
      return text.includes("baby")
        ? catalogProduct("nucleo_baby_vivo")
        : catalogProduct("nucleo_estandar");
    }

    if (/\breina(s)?\b/.test(text) && !/\bjaula(s)?\b/.test(text)) {
      return catalogProduct("reina_fecundada");
    }

    if (text.includes("alimentador")) return catalogProduct("alimentador_externo");
    if (text.includes("jaula")) return catalogProduct("jaula_belton");
    if (text.includes("miel") && text.includes("500")) return catalogProduct("miel_500g");
    if (text.includes("miel")) return catalogProduct("miel_1kg");
    return null;
  }

  function itemType(item = {}) {
    if (["nucleo", "reina", "general"].includes(item.product_type)) return item.product_type;
    return inferProduct(item)?.type || "general";
  }

  function detectOrderTypes(orderOrItems) {
    const types = orderItems(orderOrItems).map(itemType);
    return {
      hasNucleo: types.includes("nucleo"),
      hasReina: types.includes("reina")
    };
  }

  function detectOrderType(orderOrItems) {
    const { hasNucleo, hasReina } = detectOrderTypes(orderOrItems);
    if (hasNucleo && hasReina) return "mixto";
    if (hasNucleo) return "nucleo";
    if (hasReina) return "reina";
    return "general";
  }

  function statusFlow() {
    return GENERAL_STATUS_FLOW;
  }

  function statusByKey(key) {
    return GENERAL_STATUS_FLOW.find(status => status.key === key) || GENERAL_STATUS_FLOW[0];
  }

  function statusIndex(key) {
    const index = GENERAL_STATUS_FLOW.findIndex(status => status.key === key);
    return index < 0 ? 0 : index;
  }

  function prepFlow(type) {
    return type === "reina" ? REINA_PREP_FLOW : NUCLEO_PREP_FLOW;
  }

  function prepStageByKey(type, key) {
    const flow = prepFlow(type);
    return flow.find(stage => stage.key === key) || flow[0];
  }

  function prepStageIndex(type, key) {
    const flow = prepFlow(type);
    const index = flow.findIndex(stage => stage.key === key);
    return index < 0 ? 0 : index;
  }

  function prepCompleted(type, key) {
    const flow = prepFlow(type);
    return prepStageIndex(type, key) === flow.length - 1;
  }

  function preparationsComplete(order) {
    const { hasNucleo, hasReina } = detectOrderTypes(order);
    if (hasNucleo && !prepCompleted("nucleo", order.nucleo_stage || "pendiente")) return false;
    if (hasReina && !prepCompleted("reina", order.reina_stage || "pendiente")) return false;
    return true;
  }

  function currentStage(order = {}) {
    const global = statusByKey(order.status || "pedido_ingresado");
    if ((order.status || "pedido_ingresado") !== "pedido_ingresado") return global;

    const { hasNucleo, hasReina } = detectOrderTypes(order);
    const nucleoStage = prepStageByKey("nucleo", order.nucleo_stage || "pendiente");
    const reinaStage = prepStageByKey("reina", order.reina_stage || "pendiente");

    if (hasNucleo && hasReina) {
      if ((order.nucleo_stage || "pendiente") === "pendiente" && (order.reina_stage || "pendiente") === "pendiente") {
        return global;
      }
      return {
        key: "preparacion_mixta",
        label: "Preparación del pedido",
        short: "Preparación",
        description: `Núcleo: ${nucleoStage.label}. Reina: ${reinaStage.label}.`
      };
    }

    if (hasNucleo && (order.nucleo_stage || "pendiente") !== "pendiente") return nucleoStage;
    if (hasReina && (order.reina_stage || "pendiente") !== "pendiente") return reinaStage;
    return global;
  }

  function progressData(order = {}) {
    const type = detectOrderType(order);
    const globalStatus = order.status || "pedido_ingresado";
    const commonCompleted = globalStatus === "pedido_ingresado" ? 0 : statusIndex(globalStatus);
    const globalAdvanced = globalStatus !== "pedido_ingresado";

    const nucleoCompleted = globalAdvanced
      ? 2
      : Math.max(0, prepStageIndex("nucleo", order.nucleo_stage || "pendiente"));
    const reinaCompleted = globalAdvanced
      ? 2
      : Math.max(0, prepStageIndex("reina", order.reina_stage || "pendiente"));

    let completed = 0;
    let total = 0;

    if (type === "nucleo") {
      total = 7;
      completed = 1 + nucleoCompleted + commonCompleted;
    } else if (type === "reina") {
      total = 6;
      completed = reinaCompleted + commonCompleted;
    } else if (type === "mixto") {
      total = 9;
      completed = 1 + nucleoCompleted + reinaCompleted + commonCompleted;
    } else {
      total = 5;
      completed = 1 + commonCompleted;
    }

    completed = Math.max(0, Math.min(total, completed));
    return {
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0
    };
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

  function buildWhatsAppMessage(order, target = "auto") {
    const firstName = String(order.customer_name || "").trim().split(/\s+/)[0] || "";
    const namePart = firstName ? ` ${firstName}` : "";
    const code = order.tracking_code || "";
    const link = trackingUrl(code);
    const total = Number(order.total || 0);
    const totalLine = total > 0 ? `\nImporte registrado: ${formatMoney(total)}.` : "";

    const common = {
      pedido_ingresado:
        `Hola${namePart}. Tu pedido ${code} en Apiario La Ruda ya fue ingresado. ` +
        `Podés seguir su estado desde este enlace:\n${link}`,
      pendiente_pago:
        `Hola${namePart}. Tu pedido ${code} llegó a la etapa de pago.${totalLine}\n` +
        `Alias para realizar el pago: apiariolaruda\n` +
        `Podés consultar el estado actualizado acá:\n${link}`,
      pago_confirmado:
        `Hola${namePart}. Confirmamos correctamente el pago de tu pedido ${code}. ` +
        `Podés ver el estado actualizado acá:\n${link}`,
      envio:
        `Hola${namePart}. Tu pedido ${code} ya está en etapa de envío / entrega. ` +
        `Vamos a coordinar con vos los detalles correspondientes. Seguimiento:\n${link}`,
      finalizado:
        `Hola${namePart}. Tu pedido ${code} figura como finalizado. ` +
        `Gracias por elegir Apiario La Ruda. Seguimiento:\n${link}`
    };

    if (target === "nucleo") {
      const stage = order.nucleo_stage || "pendiente";
      if (stage === "material_preparado") {
        return `Hola${namePart}. Tenemos novedades de tu pedido ${code}: el material para el núcleo ya está preparado. ` +
          `Podés ver el avance acá:\n${link}`;
      }
      if (stage === "reina_fecundada") {
        return `Hola${namePart}. Tu pedido ${code} avanzó: la reina destinada al núcleo ya se encuentra fecundada. ` +
          `Seguimiento actualizado:\n${link}`;
      }
      return common.pedido_ingresado;
    }

    if (target === "reina") {
      const stage = order.reina_stage || "pendiente";
      if (stage === "reina_fecundada") {
        return `Hola${namePart}. Tu pedido ${code} avanzó: la reina ya se encuentra fecundada. ` +
          `Seguimiento actualizado:\n${link}`;
      }
      if (stage === "reina_encerrada") {
        return `Hola${namePart}. Tu pedido ${code} avanzó: la reina ya se encuentra encerrada y preparada para la entrega. ` +
          `Podés ver el estado actualizado acá:\n${link}`;
      }
      return common.pedido_ingresado;
    }

    if ((order.status || "pedido_ingresado") !== "pedido_ingresado") {
      return common[order.status] || common.pedido_ingresado;
    }

    const type = detectOrderType(order);
    if (type === "nucleo") return buildWhatsAppMessage(order, "nucleo");
    if (type === "reina") return buildWhatsAppMessage(order, "reina");
    if (type === "mixto") {
      const n = prepStageByKey("nucleo", order.nucleo_stage || "pendiente").label;
      const r = prepStageByKey("reina", order.reina_stage || "pendiente").label;
      return `Hola${namePart}. Tu pedido ${code} sigue en preparación. Núcleo: ${n}. Reina: ${r}. ` +
        `Podés ver el seguimiento acá:\n${link}`;
    }
    return common.pedido_ingresado;
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
    PRODUCT_CATALOG,
    STATUS_FLOW,
    GENERAL_STATUS_FLOW,
    NUCLEO_STATUS_FLOW,
    REINA_STATUS_FLOW,
    NUCLEO_PREP_FLOW,
    REINA_PREP_FLOW,
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
    normalizedDescription,
    catalogProduct,
    inferProduct,
    itemType,
    detectOrderTypes,
    detectOrderType,
    statusFlow,
    statusByKey,
    statusIndex,
    prepFlow,
    prepStageByKey,
    prepStageIndex,
    prepCompleted,
    preparationsComplete,
    currentStage,
    progressData,
    trackingUrl,
    whatsappUrl,
    buildWhatsAppMessage,
    copyText
  };
})();
