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

  function globalHistoryMap(history) {
    const map = new Map();
    (history || []).forEach(entry => map.set(entry.status, entry));
    return map;
  }

  function prepHistoryMap(history, type) {
    const map = new Map();
    (history || []).filter(entry => entry.preparation_type === type).forEach(entry => map.set(entry.stage, entry));
    return map;
  }

  function timelineStep({ label, description, complete, current, date }) {
    const classes = ["timeline-step"];
    if (complete) classes.push("complete");
    if (current) classes.push("current");
    return `
      <div class="${classes.join(" ")}">
        <div class="timeline-dot">✓</div>
        <div class="timeline-copy">
          <strong>${O.escapeHtml(label)}</strong>
          <p>${O.escapeHtml(description)}</p>
          ${date ? `<time>${O.escapeHtml(O.formatDateTime(date))}</time>` : ""}
        </div>
      </div>`;
  }

  function commonPaymentTimeline(order, history) {
    const commonSteps = O.GENERAL_STATUS_FLOW.slice(1);
    const currentGlobalIndex = O.statusIndex(order.status || "pedido_ingresado");
    return commonSteps.map((status, index) => {
      const stepGlobalIndex = index + 1;
      const complete = currentGlobalIndex >= stepGlobalIndex;
      const current = currentGlobalIndex === stepGlobalIndex;
      return timelineStep({
        label: status.label,
        description: status.description,
        complete,
        current,
        date: history.get(status.key)?.created_at
      });
    }).join("");
  }

  function renderSingleNucleoTimeline(order, globalHistory, prepHistory) {
    const globalAdvanced = (order.status || "pedido_ingresado") !== "pedido_ingresado";
    const prepIndex = globalAdvanced ? 2 : O.prepStageIndex("nucleo", order.nucleo_stage || "pendiente");
    const initialCurrent = !globalAdvanced && prepIndex === 0;

    return [
      timelineStep({
        label: "Pedido ingresado",
        description: O.statusByKey("pedido_ingresado").description,
        complete: true,
        current: initialCurrent,
        date: globalHistory.get("pedido_ingresado")?.created_at || order.created_at
      }),
      ...O.NUCLEO_PREP_FLOW.slice(1).map((stage, idx) => {
        const stepIndex = idx + 1;
        return timelineStep({
          label: stage.label,
          description: stage.description,
          complete: prepIndex >= stepIndex,
          current: !globalAdvanced && prepIndex === stepIndex,
          date: prepHistory.get(stage.key)?.created_at
        });
      }),
      commonPaymentTimeline(order, globalHistory)
    ].join("");
  }

  function renderSingleReinaTimeline(order, globalHistory, prepHistory) {
    const globalAdvanced = (order.status || "pedido_ingresado") !== "pedido_ingresado";
    const prepIndex = globalAdvanced ? 2 : O.prepStageIndex("reina", order.reina_stage || "pendiente");
    return [
      ...O.REINA_PREP_FLOW.slice(1).map((stage, idx) => {
        const stepIndex = idx + 1;
        return timelineStep({
          label: stage.label,
          description: stage.description,
          complete: prepIndex >= stepIndex,
          current: !globalAdvanced && prepIndex === stepIndex,
          date: prepHistory.get(stage.key)?.created_at
        });
      }),
      commonPaymentTimeline(order, globalHistory)
    ].join("");
  }

  function renderMixedTimeline(order, globalHistory, nucleoHistory, reinaHistory) {
    const globalAdvanced = (order.status || "pedido_ingresado") !== "pedido_ingresado";
    const nucleoIndex = globalAdvanced ? 2 : O.prepStageIndex("nucleo", order.nucleo_stage || "pendiente");
    const reinaIndex = globalAdvanced ? 2 : O.prepStageIndex("reina", order.reina_stage || "pendiente");

    const prepBlock = (title, type, flow, index, history) => `
      <section class="preparation-block">
        <h4>${O.escapeHtml(title)}</h4>
        <div class="timeline">
          ${flow.slice(1).map((stage, idx) => {
            const stepIndex = idx + 1;
            return timelineStep({
              label: stage.label,
              description: stage.description,
              complete: index >= stepIndex,
              current: !globalAdvanced && index === stepIndex,
              date: history.get(stage.key)?.created_at
            });
          }).join("")}
        </div>
      </section>`;

    return `
      <div class="timeline mixed-intro">
        ${timelineStep({
          label: "Pedido ingresado",
          description: O.statusByKey("pedido_ingresado").description,
          complete: true,
          current: !globalAdvanced && nucleoIndex === 0 && reinaIndex === 0,
          date: globalHistory.get("pedido_ingresado")?.created_at || order.created_at
        })}
      </div>
      <div class="preparation-grid">
        ${prepBlock("Preparación de núcleos", "nucleo", O.NUCLEO_PREP_FLOW, nucleoIndex, nucleoHistory)}
        ${prepBlock("Preparación de reinas", "reina", O.REINA_PREP_FLOW, reinaIndex, reinaHistory)}
      </div>
      <div class="after-preparation-label">Cuando ambas preparaciones están listas</div>
      <div class="timeline">${commonPaymentTimeline(order, globalHistory)}</div>`;
  }

  function renderGeneralTimeline(order, globalHistory) {
    const currentGlobalIndex = O.statusIndex(order.status || "pedido_ingresado");
    return O.GENERAL_STATUS_FLOW.map((status, index) => timelineStep({
      label: status.label,
      description: status.description,
      complete: currentGlobalIndex >= index,
      current: currentGlobalIndex === index,
      date: globalHistory.get(status.key)?.created_at || (index === 0 ? order.created_at : null)
    })).join("");
  }

  function renderOrder(order) {
    const type = O.detectOrderType(order);
    const current = O.currentStage(order);
    const progress = O.progressData(order);
    const globalHistory = globalHistoryMap(order.history);
    const nucleoHistory = prepHistoryMap(order.prep_history, "nucleo");
    const reinaHistory = prepHistoryMap(order.prep_history, "reina");

    document.getElementById("resultCode").textContent = `Pedido ${order.tracking_code}`;
    document.getElementById("resultTitle").textContent = "Este es el estado de tu pedido.";
    document.getElementById("currentStatus").textContent = current.label;
    document.getElementById("currentDescription").textContent = current.description;
    document.getElementById("progressFill").style.width = `${progress.percent}%`;
    document.getElementById("progressText").textContent = `${progress.completed} de ${progress.total} etapas`;
    document.getElementById("updatedText").textContent = order.updated_at ? `Actualizado ${O.formatDateTime(order.updated_at)}` : "";
    document.getElementById("estimatedDate").textContent = O.formatDate(order.estimated_date);
    document.getElementById("deliveryMethod").textContent = order.delivery_method || "A coordinar";
    document.getElementById("publicTotal").textContent = Number(order.total || 0) > 0 ? O.formatMoney(Number(order.total)) : "A confirmar";

    const itemsList = document.getElementById("itemsList");
    itemsList.innerHTML = (order.items || []).length
      ? order.items.map(item => {
          const quantity = Number(item.quantity || 0);
          const unitPrice = item.unit_price == null ? null : Number(item.unit_price);
          const lineTotal = unitPrice == null ? null : quantity * unitPrice;
          return `
            <div class="item-row public-item-row">
              <div class="public-item-main">
                <span>${O.escapeHtml(item.description)}</span>
                <small>${O.escapeHtml(item.quantity)} ${O.escapeHtml(item.unit || "u.")}${unitPrice == null ? "" : ` × ${O.escapeHtml(O.formatMoney(unitPrice))}`}</small>
              </div>
              <strong>${lineTotal == null ? `${O.escapeHtml(item.quantity)} ${O.escapeHtml(item.unit || "u.")}` : O.escapeHtml(O.formatMoney(lineTotal))}</strong>
            </div>`;
        }).join("")
      : '<div class="helper">Los artículos del pedido todavía no fueron detallados.</div>';

    const pendingPayment = globalHistory.get("pendiente_pago");
    const confirmedPayment = globalHistory.get("pago_confirmado");
    const paymentInfo = document.getElementById("paymentInfo");
    const paymentReached = O.statusIndex(order.status || "pedido_ingresado") >= O.statusIndex("pendiente_pago") || Boolean(pendingPayment);
    paymentInfo.hidden = !paymentReached;
    if (paymentReached) {
      const waitingPayment = order.status === "pendiente_pago";
      document.getElementById("paymentStatusLabel").textContent = waitingPayment ? "Pendiente de pago" : (confirmedPayment ? "Pago confirmado" : O.statusByKey(order.status).label);
      document.getElementById("paymentAliasBox").hidden = !waitingPayment;

      const pendingRow = document.getElementById("pendingPaymentDateRow");
      pendingRow.hidden = !pendingPayment;
      document.getElementById("pendingPaymentDate").textContent = pendingPayment ? O.formatDateTime(pendingPayment.created_at) : "";

      const confirmedRow = document.getElementById("paymentConfirmedDateRow");
      confirmedRow.hidden = !confirmedPayment;
      document.getElementById("paymentConfirmedDate").textContent = confirmedPayment ? O.formatDateTime(confirmedPayment.created_at) : "";
    }

    const note = document.getElementById("publicNote");
    if (order.public_note) {
      note.hidden = false;
      note.textContent = order.public_note;
    } else {
      note.hidden = true;
      note.textContent = "";
    }

    const timeline = document.getElementById("timeline");
    timeline.className = type === "mixto" ? "timeline-composite" : "timeline";
    if (type === "mixto") {
      timeline.innerHTML = renderMixedTimeline(order, globalHistory, nucleoHistory, reinaHistory);
    } else if (type === "nucleo") {
      timeline.innerHTML = renderSingleNucleoTimeline(order, globalHistory, nucleoHistory);
    } else if (type === "reina") {
      timeline.innerHTML = renderSingleReinaTimeline(order, globalHistory, reinaHistory);
    } else {
      timeline.innerHTML = renderGeneralTimeline(order, globalHistory);
    }

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

  document.getElementById("copyAliasButton").addEventListener("click", async event => {
    const button = event.currentTarget;
    try {
      await O.copyText("apiariolaruda");
      const original = button.textContent;
      button.textContent = "Copiado";
      setTimeout(() => { button.textContent = original; }, 1600);
    } catch (error) {
      console.error(error);
    }
  });

  const params = new URLSearchParams(window.location.search);
  const codeFromUrl = params.get("pedido");
  if (codeFromUrl) lookup(codeFromUrl);
})();
