(() => {
  "use strict";

  const O = window.LaRudaOrders;
  const cfg = O.getConfig();
  const db = O.createDbClient();

  const loginCard = document.getElementById("loginCard");
  const loginForm = document.getElementById("loginForm");
  const loginButton = document.getElementById("loginButton");
  const loginMessage = document.getElementById("loginMessage");
  const adminApp = document.getElementById("adminApp");
  const ordersList = document.getElementById("ordersList");
  const searchOrders = document.getElementById("searchOrders");
  const statusFilter = document.getElementById("statusFilter");
  const orderModal = document.getElementById("orderModal");
  const orderForm = document.getElementById("orderForm");
  const itemsEditor = document.getElementById("itemsEditor");
  const orderStatus = document.getElementById("orderStatus");
  const nucleoStage = document.getElementById("nucleoStage");
  const reinaStage = document.getElementById("reinaStage");
  const nucleoStageField = document.getElementById("nucleoStageField");
  const reinaStageField = document.getElementById("reinaStageField");
  const toast = document.getElementById("toast");
  const addItemButton = document.getElementById("addItemButton");
  const saveOrderButton = document.getElementById("saveOrderButton");
  const cancelOrderButton = document.getElementById("cancelOrderButton");
  const orderTotalField = document.getElementById("orderTotal");

  let orders = [];
  let currentOrder = null;
  let toastTimer = null;

  function showLoginMessage(text, type = "error") {
    loginMessage.textContent = text;
    loginMessage.className = `message show ${type}`;
  }

  function clearLoginMessage() {
    loginMessage.textContent = "";
    loginMessage.className = "message";
  }

  function showToast(text, type = "success") {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.className = `toast show${type === "error" ? " error" : ""}`;
    toastTimer = setTimeout(() => { toast.className = "toast"; }, 3600);
  }

  function setAuthView(loggedIn) {
    loginCard.style.display = loggedIn ? "none" : "block";
    adminApp.classList.toggle("show", loggedIn);
  }

  function renderOrderStatusOptions(preferredStatus = "") {
    const previous = preferredStatus || orderStatus.value || "pedido_ingresado";
    orderStatus.innerHTML = O.GENERAL_STATUS_FLOW
      .map(status => `<option value="${O.escapeHtml(status.key)}">${O.escapeHtml(status.label)}</option>`)
      .join("");
    orderStatus.value = O.GENERAL_STATUS_FLOW.some(status => status.key === previous) ? previous : "pedido_ingresado";
  }

  function renderPrepOptions(select, type, preferred = "pendiente") {
    const flow = O.prepFlow(type);
    select.innerHTML = flow
      .map(stage => `<option value="${O.escapeHtml(stage.key)}">${O.escapeHtml(stage.label)}</option>`)
      .join("");
    select.value = flow.some(stage => stage.key === preferred) ? preferred : "pendiente";
  }

  function setupStatusControls() {
    statusFilter.innerHTML = [
      '<option value="">Todos los estados</option>',
      ...O.STATUS_FILTER.map(status => `<option value="${O.escapeHtml(status.key)}">${O.escapeHtml(status.label)}</option>`)
    ].join("");
    renderOrderStatusOptions("pedido_ingresado");
    renderPrepOptions(nucleoStage, "nucleo", "pendiente");
    renderPrepOptions(reinaStage, "reina", "pendiente");
  }

  function legacyProductOption(item) {
    const description = String(item.description || "").trim();
    if (!description) return null;
    return {
      code: `legacy:${description}`,
      label: `${description} · anterior`,
      type: item.product_type || O.itemType(item),
      description
    };
  }

  function itemTemplate(item = {}) {
    const inferred = O.inferProduct(item);
    const selectedCode = item.product_code || inferred?.code || "";
    const legacy = !selectedCode ? legacyProductOption(item) : null;
    const options = [
      '<option value="">Seleccionar artículo…</option>',
      ...O.PRODUCT_CATALOG.map(product => (
        `<option value="${O.escapeHtml(product.code)}" data-type="${O.escapeHtml(product.type)}"${selectedCode === product.code ? " selected" : ""}>${O.escapeHtml(product.label)}</option>`
      )),
      ...(legacy ? [`<option value="${O.escapeHtml(legacy.code)}" data-type="${O.escapeHtml(legacy.type)}" selected>${O.escapeHtml(legacy.label)}</option>`] : [])
    ].join("");

    const row = document.createElement("div");
    row.className = "item-editor-row";
    row.innerHTML = `
      <select class="select item-product" required aria-label="Artículo">${options}</select>
      <input class="input item-quantity" type="number" min="0.01" step="0.01" value="${O.escapeHtml(item.quantity ?? 1)}" aria-label="Cantidad" required />
      <input class="input item-price" type="number" min="0" step="1" value="${item.unit_price == null ? "" : O.escapeHtml(item.unit_price)}" placeholder="$ unit." aria-label="Precio unitario" required />
      <button class="remove-item" type="button" aria-label="Eliminar artículo">×</button>
    `;

    row.dataset.legacyDescription = legacy?.description || "";
    row.querySelector(".remove-item").addEventListener("click", () => {
      row.remove();
      syncPreparationControls();
      refreshCalculatedTotal();
    });
    row.querySelector(".item-product").addEventListener("change", () => {
      syncPreparationControls();
      refreshCalculatedTotal();
    });
    row.querySelectorAll("input").forEach(input => input.addEventListener("input", () => {
      refreshCalculatedTotal();
      updateToolsPreview();
    }));
    return row;
  }

  function addItem(item = {}) {
    itemsEditor.appendChild(itemTemplate(item));
    syncPreparationControls();
    refreshCalculatedTotal();
    applyOrderMode();
  }

  function collectItems() {
    return [...itemsEditor.querySelectorAll(".item-editor-row")]
      .map((row, index) => {
        const select = row.querySelector(".item-product");
        const code = select.value;
        if (!code) return null;

        let product = O.catalogProduct(code);
        let description = product?.label || "";
        let productType = product?.type || "general";
        let productCode = product?.code || null;

        if (code.startsWith("legacy:")) {
          description = row.dataset.legacyDescription || select.options[select.selectedIndex]?.textContent?.replace(/ · anterior$/, "") || "Artículo";
          productType = select.options[select.selectedIndex]?.dataset.type || "general";
          productCode = null;
        }

        return {
          product_code: productCode,
          product_type: productType,
          description,
          quantity: Number(row.querySelector(".item-quantity").value || 0),
          unit: "u.",
          unit_price: row.querySelector(".item-price").value === "" ? null : Number(row.querySelector(".item-price").value),
          sort_order: index
        };
      })
      .filter(item => item && item.description && item.quantity > 0);
  }

  function syncPreparationControls() {
    const items = collectItems();
    const { hasNucleo, hasReina } = O.detectOrderTypes(items);
    nucleoStageField.hidden = !hasNucleo;
    reinaStageField.hidden = !hasReina;
    updateToolsPreview();
  }

  function computeItemsTotal(items) {
    return items.reduce((total, item) => {
      if (item.unit_price == null || !Number.isFinite(item.unit_price)) return total;
      return total + (Number(item.quantity || 0) * Number(item.unit_price));
    }, 0);
  }

  function refreshCalculatedTotal() {
    const items = collectItems();
    const hasAnyPrice = items.some(item => item.unit_price != null && Number.isFinite(item.unit_price));
    let total = computeItemsTotal(items);
    if (!hasAnyPrice && currentOrder && Number(currentOrder.total || 0) > 0) total = Number(currentOrder.total || 0);
    orderTotalField.dataset.rawValue = String(total || 0);
    orderTotalField.value = O.formatMoney(total || 0);
    return total || 0;
  }

  function currentFormOrder() {
    const items = collectItems();
    const types = O.detectOrderTypes(items);
    const computedTotal = refreshCalculatedTotal();

    return {
      id: document.getElementById("orderId").value || null,
      tracking_code: currentOrder?.tracking_code || "",
      customer_name: document.getElementById("customerName").value.trim(),
      customer_phone: O.cleanPhone(document.getElementById("customerPhone").value),
      customer_email: document.getElementById("customerEmail").value.trim() || null,
      status: orderStatus.value,
      nucleo_stage: types.hasNucleo ? nucleoStage.value : "pendiente",
      reina_stage: types.hasReina ? reinaStage.value : "pendiente",
      estimated_date: document.getElementById("estimatedDateInput").value || null,
      delivery_method: document.getElementById("deliveryMethodInput").value || "A coordinar",
      total: computedTotal,
      public_note: document.getElementById("publicNoteInput").value.trim() || null,
      internal_note: document.getElementById("internalNoteInput").value.trim() || null,
      items
    };
  }

  function addWhatsAppButton(container, draft, label, target) {
    const anchor = document.createElement("a");
    anchor.className = "button button-whatsapp button-small";
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = label;
    anchor.href = O.whatsappUrl(draft.customer_phone, O.buildWhatsAppMessage(draft, target));
    container.appendChild(anchor);
  }

  function updateToolsPreview() {
    if (!currentOrder?.tracking_code) return;
    const draft = { ...currentOrder, ...currentFormOrder(), tracking_code: currentOrder.tracking_code };
    const link = O.trackingUrl(draft.tracking_code);
    const stage = O.currentStage(draft);
    const types = O.detectOrderTypes(draft);
    const buttons = document.getElementById("whatsappButtons");

    document.getElementById("trackingLinkPreview").textContent = link;
    document.getElementById("openTrackingButton").href = link;
    document.getElementById("whatsappStagePreview").textContent = stage.label;
    buttons.innerHTML = "";

    if (draft.status !== "pedido_ingresado") {
      addWhatsAppButton(buttons, draft, `WhatsApp · ${O.statusByKey(draft.status).short}`, "general");
      return;
    }

    if (types.hasNucleo && draft.nucleo_stage !== "pendiente") {
      addWhatsAppButton(buttons, draft, `WhatsApp · Núcleo · ${O.prepStageByKey("nucleo", draft.nucleo_stage).short}`, "nucleo");
    }
    if (types.hasReina && draft.reina_stage !== "pendiente") {
      addWhatsAppButton(buttons, draft, `WhatsApp · Reina · ${O.prepStageByKey("reina", draft.reina_stage).short}`, "reina");
    }
    if (!buttons.children.length) {
      addWhatsAppButton(buttons, draft, "WhatsApp · Pedido ingresado", "general");
    }
  }

  function renderHistory(order) {
    const list = document.getElementById("historyList");
    const globalHistory = (order.order_status_history || []).map(entry => ({
      created_at: entry.created_at,
      label: O.statusByKey(entry.status).label,
      detail: entry.note || "Estado general"
    }));
    const prepHistory = (order.order_preparation_history || []).map(entry => ({
      created_at: entry.created_at,
      label: O.prepStageByKey(entry.preparation_type, entry.stage).label,
      detail: entry.preparation_type === "nucleo" ? "Preparación de núcleos" : "Preparación de reinas"
    }));
    const sorted = [...globalHistory, ...prepHistory].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    list.innerHTML = sorted.length
      ? sorted.map(entry => `
          <div class="history-row">
            <strong>${O.escapeHtml(entry.label)}</strong>
            <span>${O.escapeHtml(entry.detail)}</span>
            <span>${O.escapeHtml(O.formatDateTime(entry.created_at))}</span>
          </div>
        `).join("")
      : '<div class="helper">Todavía no hay cambios de estado registrados.</div>';
  }

  function latestStatusHistory(order, status) {
    return (order?.order_status_history || [])
      .filter(entry => entry.status === status)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .at(-1) || null;
  }

  function renderPaymentAudit(order) {
    const section = document.getElementById("paymentAuditSection");
    const box = document.getElementById("paymentAudit");
    if (!order?.id) {
      section.hidden = true;
      box.innerHTML = "";
      return;
    }

    const pending = latestStatusHistory(order, "pendiente_pago");
    const confirmed = latestStatusHistory(order, "pago_confirmado");
    section.hidden = false;
    box.innerHTML = `
      <div class="payment-audit-row">
        <span>Entró en pendiente de pago</span>
        <strong>${pending ? O.escapeHtml(O.formatDateTime(pending.created_at)) : "Todavía no"}</strong>
      </div>
      <div class="payment-audit-row">
        <span>Confirmación de pago recibida</span>
        <strong>${confirmed ? O.escapeHtml(O.formatDateTime(confirmed.created_at)) : "Todavía no"}</strong>
      </div>`;
  }

  function renderReadOnlySummary(order) {
    const summary = document.getElementById("orderReadOnlySummary");
    const items = [...(order.order_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const itemsHtml = items.length
      ? items.map(item => {
          const qty = Number(item.quantity || 0);
          const price = Number(item.unit_price || 0);
          const lineTotal = qty * price;
          return `
            <div class="readonly-item-row">
              <div>
                <strong>${O.escapeHtml(item.description || "Artículo")}</strong>
                <span>${O.escapeHtml(String(item.quantity || 0))} ${O.escapeHtml(item.unit || "u.")} × ${O.escapeHtml(O.formatMoney(price))}</span>
              </div>
              <strong>${O.escapeHtml(O.formatMoney(lineTotal))}</strong>
            </div>`;
        }).join("")
      : '<div class="helper">Sin artículos cargados.</div>';

    summary.innerHTML = `
      <div class="readonly-summary-grid">
        <div class="readonly-block">
          <span>Comprador</span>
          <strong>${O.escapeHtml(order.customer_name || "—")}</strong>
          <small>${O.escapeHtml(order.customer_phone || "")}${order.customer_email ? ` · ${O.escapeHtml(order.customer_email)}` : ""}</small>
        </div>
        <div class="readonly-block">
          <span>Entrega estimada</span>
          <strong>${O.escapeHtml(O.formatDate(order.estimated_date))}</strong>
          <small>${O.escapeHtml(order.delivery_method || "A coordinar")}</small>
        </div>
      </div>
      <div class="readonly-items">
        <div class="readonly-section-title">Artículos del pedido</div>
        ${itemsHtml}
        <div class="readonly-total-row">
          <span>Total del pedido</span>
          <strong>${O.escapeHtml(O.formatMoney(Number(order.total || 0)))}</strong>
        </div>
      </div>
      ${order.public_note ? `<div class="readonly-note"><span>Nota visible para el cliente</span><p>${O.escapeHtml(order.public_note)}</p></div>` : ""}
      ${order.internal_note ? `<div class="readonly-note internal"><span>Nota interna</span><p>${O.escapeHtml(order.internal_note)}</p></div>` : ""}
    `;
  }

  function applyOrderMode() {
    const existing = Boolean(currentOrder?.id);
    const readOnlySummary = document.getElementById("orderReadOnlySummary");
    const itemsSection = document.getElementById("itemsSection");

    // Un pedido ya creado es inmutable desde esta pantalla: solo se cambian estados.
    itemsSection.hidden = existing;
    readOnlySummary.hidden = !existing;
    addItemButton.hidden = existing;

    orderStatus.disabled = false;
    nucleoStage.disabled = false;
    reinaStage.disabled = false;
    orderTotalField.readOnly = true;

    if (!existing) {
      saveOrderButton.textContent = "Crear pedido";
      cancelOrderButton.textContent = "Cancelar";
    } else {
      saveOrderButton.textContent = "Guardar estado";
      cancelOrderButton.textContent = "Cerrar";
      renderReadOnlySummary(currentOrder);
    }

    orderModal.classList.toggle("order-view-mode", existing);
  }

  function resetForm() {
    orderForm.reset();
    document.getElementById("orderId").value = "";
    itemsEditor.innerHTML = "";
    renderOrderStatusOptions("pedido_ingresado");
    renderPrepOptions(nucleoStage, "nucleo", "pendiente");
    renderPrepOptions(reinaStage, "reina", "pendiente");
    nucleoStageField.hidden = true;
    reinaStageField.hidden = true;
    document.getElementById("deliveryMethodInput").value = "A coordinar";
    document.getElementById("orderTools").hidden = true;
    document.getElementById("historySection").hidden = true;
    document.getElementById("paymentAuditSection").hidden = true;
    orderTotalField.dataset.rawValue = "0";
    orderTotalField.value = O.formatMoney(0);
  }

  function openNewOrder() {
    currentOrder = null;
    resetForm();
    document.getElementById("orderModalTitle").textContent = "Nuevo pedido";
    document.getElementById("orderModalSubtitle").textContent = "Seleccioná los artículos. El total se calcula automáticamente con los precios unitarios.";
    applyOrderMode();
    openModal();
    setTimeout(() => document.getElementById("customerName").focus(), 50);
  }

  function fillExistingOrder(order) {
    currentOrder = order;
    resetForm();

    document.getElementById("orderId").value = order.id;
    document.getElementById("customerName").value = order.customer_name || "";
    document.getElementById("customerPhone").value = order.customer_phone || "";
    document.getElementById("customerEmail").value = order.customer_email || "";
    document.getElementById("estimatedDateInput").value = order.estimated_date || "";
    document.getElementById("deliveryMethodInput").value = order.delivery_method || "A coordinar";
    document.getElementById("publicNoteInput").value = order.public_note || "";
    document.getElementById("internalNoteInput").value = order.internal_note || "";

    itemsEditor.innerHTML = "";
    const items = [...(order.order_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (items.length) items.forEach(item => itemsEditor.appendChild(itemTemplate(item)));

    renderOrderStatusOptions(order.status || "pedido_ingresado");
    renderPrepOptions(nucleoStage, "nucleo", order.nucleo_stage || "pendiente");
    renderPrepOptions(reinaStage, "reina", order.reina_stage || "pendiente");
    syncPreparationControls();
    refreshCalculatedTotal();

    document.getElementById("orderModalTitle").textContent = `Pedido ${order.tracking_code}`;
    document.getElementById("orderTools").hidden = false;
    document.getElementById("historySection").hidden = false;
    renderHistory(order);
    renderPaymentAudit(order);
    updateToolsPreview();
  }

  function openOrderView(order) {
    fillExistingOrder(order);
    document.getElementById("orderModalSubtitle").textContent = "Pedido en modo consulta. Solo podés actualizar sus estados.";
    applyOrderMode();
    openModal();
  }

  function cancelModalAction() {
    closeModal();
  }

  function openModal() {
    orderModal.classList.add("open");
    orderModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-lock");
  }

  function closeModal() {
    orderModal.classList.remove("open");
    orderModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-lock");
    currentOrder = null;
  }

  function orderItemSummary(order) {
    const items = [...(order.order_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!items.length) return "Sin artículos";
    const first = items[0];
    const extra = items.length > 1 ? ` +${items.length - 1}` : "";
    return `${first.quantity} × ${first.description}${extra}`;
  }

  function filteredOrders() {
    const query = searchOrders.value.trim().toLowerCase();
    const status = statusFilter.value;
    return orders.filter(order => {
      if (status && order.status !== status) return false;
      if (!query) return true;
      const haystack = [
        order.customer_name,
        order.customer_phone,
        order.customer_email,
        order.tracking_code,
        ...(order.order_items || []).map(item => item.description)
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderStats() {
    document.getElementById("statActive").textContent = orders.filter(order => order.status !== "finalizado").length;
    document.getElementById("statPayment").textContent = orders.filter(order => order.status === "pendiente_pago").length;
    document.getElementById("statDelivery").textContent = orders.filter(order => order.status === "envio").length;
    document.getElementById("statDone").textContent = orders.filter(order => order.status === "finalizado").length;
  }

  function renderOrders() {
    const list = filteredOrders();
    renderStats();

    if (!list.length) {
      ordersList.innerHTML = `
        <div class="card empty-state">
          <strong>No hay pedidos para mostrar.</strong>
          <span>${orders.length ? "Probá cambiando la búsqueda o el filtro." : "Creá el primer pedido con el botón “Nuevo pedido”."}</span>
        </div>`;
      return;
    }

    ordersList.innerHTML = list.map(order => {
      const stage = O.currentStage(order);
      return `
        <article class="card order-card" data-order-id="${O.escapeHtml(order.id)}">
          <div class="order-card-main">
            <div>
              <h3>${O.escapeHtml(order.customer_name)}</h3>
              <div class="order-card-code">${O.escapeHtml(order.tracking_code)}</div>
            </div>
            <div class="order-card-meta">
              <span>Pedido</span>
              <strong>${O.escapeHtml(orderItemSummary(order))}</strong>
            </div>
            <div class="order-card-meta">
              <span>Estado</span>
              <div class="status-badge">${O.escapeHtml(stage.label)}</div>
            </div>
            <div class="order-card-meta">
              <span>Total</span>
              <strong>${O.escapeHtml(O.formatMoney(Number(order.total || 0)))}</strong>
            </div>
            <div class="order-card-actions">
              <button class="button button-secondary button-small" type="button" data-action="view">Ver pedido</button>
              <a class="button button-whatsapp button-small" data-action="whatsapp" href="${O.escapeHtml(O.whatsappUrl(order.customer_phone, O.buildWhatsAppMessage(order)))}" target="_blank" rel="noopener">WhatsApp</a>
            </div>
          </div>
        </article>`;
    }).join("");

    ordersList.querySelectorAll("[data-order-id]").forEach(card => {
      const order = orders.find(item => item.id === card.dataset.orderId);
      card.addEventListener("click", event => {
        if (event.target.closest('[data-action="whatsapp"]')) return;
        openOrderView(order);
      });
      card.querySelector('[data-action="view"]').addEventListener("click", event => {
        event.stopPropagation();
        openOrderView(order);
      });
    });
  }

  async function loadOrders(showSuccess = false) {
    if (!db) return;
    ordersList.innerHTML = '<div class="card empty-state"><strong>Cargando pedidos…</strong></div>';

    const { data, error } = await db
      .from("orders")
      .select("*, order_items(*), order_status_history(*), order_preparation_history(*)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      ordersList.innerHTML = '<div class="card empty-state"><strong>No pudimos cargar los pedidos.</strong><span>Ejecutá ACTUALIZAR_PEDIDOS_MIXTOS_V3.sql en Supabase y recargá.</span></div>';
      showToast("No se pudieron cargar los pedidos.", "error");
      return;
    }

    orders = data || [];
    renderOrders();
    if (showSuccess) showToast("Pedidos actualizados.");
  }

  async function saveItems(orderId, items) {
    const { error: deleteError } = await db.from("order_items").delete().eq("order_id", orderId);
    if (deleteError) throw deleteError;
    if (!items.length) return;
    const payload = items.map(item => ({ ...item, order_id: orderId }));
    const { error: insertError } = await db.from("order_items").insert(payload);
    if (insertError) throw insertError;
  }

  function validatePreparationBeforePayment(draft) {
    if (draft.status === "pedido_ingresado") return true;
    const { hasNucleo, hasReina } = O.detectOrderTypes(draft);
    if (hasNucleo && !O.prepCompleted("nucleo", draft.nucleo_stage)) {
      showToast("Completá la preparación del núcleo antes de pasar a pago.", "error");
      return false;
    }
    if (hasReina && !O.prepCompleted("reina", draft.reina_stage)) {
      showToast("Completá la preparación de la reina antes de pasar a pago.", "error");
      return false;
    }
    return true;
  }

  async function saveOrder(event) {
    event.preventDefault();
    if (!db) return;

    const draft = currentFormOrder();
    const isExisting = Boolean(draft.id);
    if (!isExisting) {
      if (!draft.customer_name || !draft.customer_phone) {
        showToast("Completá nombre y WhatsApp.", "error");
        return;
      }
      if (!draft.items.length) {
        showToast("Seleccioná al menos un artículo del pedido.", "error");
        return;
      }
      const missingPrice = draft.items.some(item => item.unit_price == null || !Number.isFinite(item.unit_price));
      if (missingPrice) {
        showToast("Cargá el precio unitario de todos los artículos.", "error");
        return;
      }
    }
    if (!validatePreparationBeforePayment(draft)) return;

    saveOrderButton.disabled = true;
    saveOrderButton.textContent = "Guardando…";

    try {
      let savedOrder;

      if (draft.id) {
        // REGLA: después de crear un pedido, sus datos comerciales quedan bloqueados.
        // Desde esta vista solo se actualizan estado general y preparaciones.
        const statusPayload = {
          status: draft.status,
          nucleo_stage: draft.nucleo_stage,
          reina_stage: draft.reina_stage
        };
        const { data, error } = await db.from("orders").update(statusPayload).eq("id", draft.id).select().single();
        if (error) throw error;
        savedOrder = data;
      } else {
        const orderPayload = {
          customer_name: draft.customer_name,
          customer_phone: draft.customer_phone,
          customer_email: draft.customer_email,
          status: draft.status,
          nucleo_stage: draft.nucleo_stage,
          reina_stage: draft.reina_stage,
          estimated_date: draft.estimated_date,
          delivery_method: draft.delivery_method,
          total: draft.total,
          public_note: draft.public_note,
          internal_note: draft.internal_note
        };
        const { data, error } = await db.from("orders").insert(orderPayload).select().single();
        if (error) throw error;
        savedOrder = data;
        await saveItems(savedOrder.id, draft.items);
      }

      const wasNew = !draft.id;
      const statusOnly = Boolean(draft.id);
      await loadOrders();

      const fresh = orders.find(order => order.id === savedOrder.id);
      if (fresh) openOrderView(fresh);
      else closeModal();

      if (wasNew) showToast(`Pedido creado: ${savedOrder.tracking_code}`);
      else if (statusOnly) showToast("Estado del pedido actualizado.");
    } catch (error) {
      console.error(error);
      showToast(`No pudimos guardar el pedido: ${error?.message || "revisá Supabase"}.`, "error");
    } finally {
      saveOrderButton.disabled = false;
      applyOrderMode();
    }
  }


  function savedAdminEmail() {
    return localStorage.getItem("la_ruda_admin_email") || String(cfg.adminEmail || "").trim();
  }

  function resolveLoginEmail(username) {
    if (username.includes("@")) return username;
    if (username !== String(cfg.adminUsername || "admin")) return "";
    const saved = savedAdminEmail();
    if (saved) return saved;
    return String(window.prompt(
      "Primera vez en este navegador: ingresá el email REAL que figura en Authentication → Users de Supabase para el administrador.\n\nDespués vas a poder seguir entrando solamente con ‘admin’."
    ) || "").trim();
  }

  async function validateAdminAccess() {
    const { data, error } = await db.rpc("la_ruda_is_admin");
    if (error) throw error;
    return data === true;
  }

  function friendlyAuthError(error) {
    const raw = String(error?.message || "");
    const code = String(error?.details?.code || error?.code || "");
    const lowered = `${raw} ${code}`.toLowerCase();
    if (lowered.includes("email_not_confirmed") || lowered.includes("email not confirmed")) {
      return "El email del administrador todavía no está confirmado en Supabase.";
    }
    if (lowered.includes("invalid_credentials") || lowered.includes("invalid login credentials")) {
      return "Supabase rechazó las credenciales. Revisá la contraseña del usuario administrador.";
    }
    if (lowered.includes("failed to fetch") || lowered.includes("network")) {
      return "No se pudo conectar con Supabase desde el navegador. Revisá Internet y volvé a intentar.";
    }
    return `Supabase respondió: ${raw || "no se pudo iniciar sesión"}.`;
  }

  async function login(event) {
    event.preventDefault();
    clearLoginMessage();
    if (!db) {
      showLoginMessage("No se pudo inicializar la conexión con Supabase. Recargá la página con Ctrl+F5.");
      return;
    }

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const email = resolveLoginEmail(username);
    if (!email || !email.includes("@")) {
      showLoginMessage("Para el primer acceso necesito el email real del usuario administrador creado en Supabase.");
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Ingresando…";
    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw error || new Error("No session");
      const isAdmin = await validateAdminAccess();
      if (!isAdmin) {
        await db.auth.signOut();
        throw new Error("El usuario inició sesión, pero no está autorizado como administrador.");
      }
      localStorage.setItem("la_ruda_admin_email", email);
      document.getElementById("username").value = String(cfg.adminUsername || "admin");
      setAuthView(true);
      document.getElementById("password").value = "";
      await loadOrders();
    } catch (error) {
      console.error(error);
      showLoginMessage(friendlyAuthError(error));
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Ingresar";
    }
  }

  async function logout() {
    if (db) await db.auth.signOut();
    setAuthView(false);
    orders = [];
    document.getElementById("password").value = "";
    clearLoginMessage();
  }

  async function initializeAuth() {
    setupStatusControls();
    if (!db) {
      setAuthView(false);
      showLoginMessage("No se pudo inicializar la conexión con Supabase. Hacé Ctrl+F5.", "info");
      return;
    }

    const { data } = await db.auth.getSession();
    const session = data?.session;
    if (session) {
      try {
        const validAdmin = await validateAdminAccess();
        if (validAdmin) {
          if (session.user?.email) localStorage.setItem("la_ruda_admin_email", session.user.email);
          setAuthView(true);
          await loadOrders();
        } else {
          await db.auth.signOut();
          setAuthView(false);
        }
      } catch (error) {
        console.error(error);
        await db.auth.signOut();
        setAuthView(false);
        showLoginMessage("No se pudo validar el administrador en Supabase.", "info");
      }
    } else {
      setAuthView(false);
    }
    db.auth.onAuthStateChange((_event, newSession) => { if (!newSession) setAuthView(false); });
  }

  loginForm.addEventListener("submit", login);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("refreshButton").addEventListener("click", () => loadOrders(true));
  document.getElementById("newOrderButton").addEventListener("click", openNewOrder);
  document.getElementById("closeOrderModal").addEventListener("click", closeModal);
  cancelOrderButton.addEventListener("click", cancelModalAction);
  addItemButton.addEventListener("click", () => addItem({ quantity: 1 }));
  orderForm.addEventListener("submit", saveOrder);

  orderModal.addEventListener("click", event => { if (event.target === orderModal) closeModal(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && orderModal.classList.contains("open")) closeModal(); });
  searchOrders.addEventListener("input", renderOrders);
  statusFilter.addEventListener("change", renderOrders);
  [orderStatus, nucleoStage, reinaStage].forEach(select => select.addEventListener("change", updateToolsPreview));
  ["customerName", "customerPhone"].forEach(id => document.getElementById(id).addEventListener("input", updateToolsPreview));

  document.getElementById("copyTrackingButton").addEventListener("click", async () => {
    if (!currentOrder?.tracking_code) return;
    try {
      await O.copyText(O.trackingUrl(currentOrder.tracking_code));
      showToast("Link de seguimiento copiado.");
    } catch (error) {
      console.error(error);
      showToast("No se pudo copiar el link.", "error");
    }
  });

  initializeAuth();
})();
