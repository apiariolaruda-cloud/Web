(() => {
  "use strict";

  const O = window.LaRudaOrders;
  const db = O.createDbClient();
  const form = document.getElementById("trackingForm");
  const input = document.getElementById("trackingCode");
  const submit = document.getElementById("trackingSubmit");
  const message = document.getElementById("trackingMessage");
  const result = document.getElementById("trackingResult");

  function setMessage(text, type = "info") {
    message.textContent = text;
    message.className = `message show ${type}`;
  }

  function clearMessage() {
    message.textContent = "";
    message.className = "message";
  }

  function historyMap(history) {
    const map = new Map();
    (history || []).forEach(entry => {
      if (!map.has(entry.status)) map.set(entry.status, entry);
      else map.set(entry.status, entry);
    });
    return map;
  }

  function renderOrder(order) {
    const current = O.statusByKey(order.status);
    const currentIndex = O.statusIndex(order.status);
    const percent = Math.round(((currentIndex + 1) / O.STATUS_FLOW.length) * 100);
    const history = historyMap(order.history);

    document.getElementById("resultCode").textContent = `Pedido ${order.tracking_code}`;
    document.getElementById("resultTitle").textContent = order.customer_first_name
      ? `${order.customer_first_name}, este es el estado de tu pedido.`
      : "Este es el estado de tu pedido.";
    document.getElementById("resultIntro").textContent = "Acá vas a ver cómo avanza desde que lo ingresamos hasta la entrega.";
    document.getElementById("currentStatus").textContent = current.label;
    document.getElementById("currentDescription").textContent = current.description;
    document.getElementById("progressFill").style.width = `${percent}%`;
    document.getElementById("progressText").textContent = `${currentIndex + 1} de ${O.STATUS_FLOW.length} etapas`;
    document.getElementById("updatedText").textContent = order.updated_at ? `Actualizado ${O.formatDateTime(order.updated_at)}` : "";
    document.getElementById("estimatedDate").textContent = O.formatDate(order.estimated_date);
    document.getElementById("deliveryMethod").textContent = order.delivery_method || "A coordinar";

    const itemsList = document.getElementById("itemsList");
    itemsList.innerHTML = (order.items || []).length
      ? order.items.map(item => `
          <div class="item-row">
            <span>${O.escapeHtml(item.description)}</span>
            <strong>${O.escapeHtml(item.quantity)} ${O.escapeHtml(item.unit || "u.")}</strong>
          </div>
        `).join("")
      : '<div class="helper">Los artículos del pedido todavía no fueron detallados.</div>';

    const note = document.getElementById("publicNote");
    if (order.public_note) {
      note.hidden = false;
      note.textContent = order.public_note;
    } else {
      note.hidden = true;
      note.textContent = "";
    }

    document.getElementById("timeline").innerHTML = O.STATUS_FLOW.map((status, index) => {
      const isComplete = index < currentIndex;
      const isCurrent = index === currentIndex;
      const historyEntry = history.get(status.key);
      const classes = ["timeline-step"];
      if (isComplete) classes.push("complete");
      if (isCurrent) classes.push("current", "complete");

      return `
        <div class="${classes.join(" ")}">
          <div class="timeline-dot">✓</div>
          <div class="timeline-copy">
            <strong>${O.escapeHtml(status.label)}</strong>
            <p>${O.escapeHtml(status.description)}</p>
            ${historyEntry?.created_at ? `<time>${O.escapeHtml(O.formatDateTime(historyEntry.created_at))}</time>` : ""}
          </div>
        </div>
      `;
    }).join("");

    const contactMessage = `Hola, quisiera consultar por mi pedido ${order.tracking_code} de Apiario La Ruda.`;
    document.getElementById("orderWhatsApp").href = O.whatsappUrl("5491126960110", contactMessage);

    result.classList.add("show");
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function lookup(code) {
    const cleanCode = O.cleanTrackingCode(code);
    input.value = cleanCode;
    result.classList.remove("show");
    clearMessage();

    if (!cleanCode) {
      setMessage("Ingresá el código de seguimiento para buscar tu pedido.", "error");
      input.focus();
      return;
    }

    if (!db) {
      setMessage("No se pudo inicializar la conexión con el seguimiento. Recargá la página con Ctrl+F5.", "error");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Buscando…";

    try {
      const { data, error } = await db.rpc("get_public_order", { p_tracking_code: cleanCode });
      if (error) throw error;

      if (!data) {
        setMessage("No encontramos un pedido con ese código. Revisalo y probá nuevamente.", "error");
        return;
      }

      renderOrder(data);
    } catch (error) {
      console.error(error);
      setMessage("No pudimos consultar el pedido en este momento. Probá nuevamente.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Buscar pedido";
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    lookup(input.value);
  });

  const params = new URLSearchParams(window.location.search);
  const codeFromUrl = params.get("pedido");
  if (codeFromUrl) lookup(codeFromUrl);
})();
