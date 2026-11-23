/* Yard Ledger — plant list, filters and detail panel */
(() => {
  "use strict";

  const LIGHT_ORDER = ["full-sun", "part-shade", "full-shade"];
  const STORE_KEY = "yardledger.planted.v1";
  const VIEW_KEY = "yardledger.view.v1";
  const ORDER_KEY = "yardledger.order.v1";
  const GROUP_KEY = "yardledger.groups.v1";

  const state = {
    plants: [],
    companionMethod: "",
    companionSources: [],
    availability: [],
    availabilityMeta: {},
    orders: [],
    groups: [],
    lights: new Set(),
    stock: false,
    query: "",
    sort: "list",
    planted: new Set(readPlanted()),
    view: readView(),
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    grid: $("#plants"),
    empty: $("#empty"),
    result: $("#result"),
    hint: $("#active-filters"),
    clear: $("#clear-filters"),
    search: $("#search"),
    stock: $("#stock-toggle"),
    sort: $("#sort"),
    drawer: $("#drawer"),
    drawerInner: $("#drawer-inner"),
    orderDialog: $("#order-dialog"),
    orderRows: $("#order-rows"),
    orderStatus: $("#order-status"),
    addForm: $("#add-plant-form"),
    addMatch: $("#add-plant-match"),
    plantName: $("#new-plant-name"),
    plantScientific: $("#new-plant-scientific"),
    plantSize: $("#new-plant-size"),
    plantSuggestions: $("#plant-suggestions"),
    groupDialog: $("#group-dialog"),
    groupForm: $("#group-form"),
    groupName: $("#group-name"),
    groupPicker: $("#group-plant-picker"),
    groupSummary: $("#group-summary"),
    groupSuggestions: $("#group-suggestions"),
    savedGroups: $("#saved-groups-list"),
  };

  let selectedPlantId = "";

  /* ------------------------------ helpers ------------------------------ */

  function readPlanted() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (err) {
      return [];
    }
  }

  function savePlanted() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...state.planted]));
    } catch (err) {
      /* storage may be unavailable; the list still works */
    }
  }

  function readView() {
    try {
      return localStorage.getItem(VIEW_KEY) === "compact" ? "compact" : "cards";
    } catch (err) {
      return "cards";
    }
  }

  function saveView() {
    try { localStorage.setItem(VIEW_KEY, state.view); } catch (err) { /* storage may be unavailable */ }
  }

  function saveOrders() {
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(state.orders)); } catch (err) { /* storage may be unavailable */ }
  }

  function readGroups() {
    try {
      const saved = JSON.parse(localStorage.getItem(GROUP_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((g) => g && g.id && g.name && Array.isArray(g.plantIds)) : [];
    } catch (err) { return []; }
  }

  function saveGroups() {
    try { localStorage.setItem(GROUP_KEY, JSON.stringify(state.groups)); } catch (err) { /* storage may be unavailable */ }
  }

  function norm(text) {
    return String(text || "").toLowerCase().replace(/[.’'’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function slugify(text) {
    return String(text || "plant").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "plant";
  }

  function readOrders(plants) {
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
      if (Array.isArray(saved)) return saved.filter((x) => x && x.id && Number(x.qty) > 0).map((x) => ({ ...x, qty: Number(x.qty) }));
    } catch (err) { /* fall through to catalogue order */ }
    return plants.filter((p) => p.qty > 0).map((p) => ({ id: p.id, name: p.name, scientificName: p.scientificName || "", size: p.size || "", qty: p.qty }));
  }

  function orderFor(id) { return state.orders.find((x) => x.id === id); }

  function availabilityFor(item) {
    const sci = norm(item.scientificName), name = norm(item.name);
    let matches = sci ? state.availability.filter((r) => norm(r.scientificName) === sci) : [];
    if (!matches.length && name) matches = state.availability.filter((r) => norm(r.name) === name);
    if (!matches.length && name) matches = state.availability.filter((r) => norm(r.name).includes(name) || name.includes(norm(r.name)));
    if (item.size) {
      const size = norm(item.size);
      const exact = matches.filter((r) => norm(r.size) === size || norm(r.size).replace(/s$/, "") === size.replace(/s$/, ""));
      if (exact.length) matches = exact;
    }
    return matches;
  }

  function availabilitySummary(item) {
    const rows = availabilityFor(item);
    if (!rows.length) return "Not listed in Beaver Lake snapshot";
    const now = rows.reduce((n, r) => n + (r.availableNow || 0), 0);
    const spring = rows.reduce((n, r) => n + (r.spring || 0), 0);
    const future = rows.reduce((n, r) => n + (r.future || 0), 0);
    if (now) return `${now.toLocaleString()} available now`;
    if (spring) return `${spring.toLocaleString()} projected for spring`;
    if (future) return `${future.toLocaleString()} projected for future`;
    return "Listed, none available now";
  }

  function sizeKey(text) {
    return norm(text)
      .replace(/inches?|\"|''/g, " inch")
      .replace(/gallons?|gal/g, " gallon")
      .replace(/(\d)(?=gallon)/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function priceFor(item) {
    const rows = availabilityFor({ ...item, size: "" });
    const exact = rows.find((r) => Number.isFinite(Number(r.price)) && Number(r.price) >= 0 && sizeKey(r.size) === sizeKey(item.size));
    const fallback = rows.find((r) => Number.isFinite(Number(r.price)) && Number(r.price) >= 0);
    return exact ? Number(exact.price) : (fallback ? Number(fallback.price) : null);
  }

  function formatMoney(value) {
    return value == null ? "—" : `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function nurseryRowsFor(plant) {
    return availabilityFor({ name: plant.name, scientificName: plant.scientificName, size: "" });
  }

  function sizeOptionsFor(item) {
    const matched = nurseryRowsFor(item);
    const rows = matched.length ? matched : state.availability;
    const seen = new Set();
    return rows.filter((r) => {
      const key = sizeKey(r.size);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((r) => r.size);
  }

  function sizeOptionsHTML(item, current) {
    const options = sizeOptionsFor(item);
    if (current && !options.some((size) => sizeKey(size) === sizeKey(current))) options.unshift(current);
    return options.map((size) => `<option value="${esc(size)}" ${sizeKey(size) === sizeKey(current) ? "selected" : ""}>${esc(size)}</option>`).join("");
  }

  function nurseryCardText(plant) {
    const allRows = nurseryRowsFor(plant);
    if (!allRows.length) return "Not listed in snapshot";
    const order = orderFor(plant.id);
    const selectedKey = order ? sizeKey(order.size) : "";
    const rows = selectedKey ? allRows.filter((r) => sizeKey(r.size) === selectedKey) : allRows;
    const shown = (rows.length ? rows : allRows).slice(0, 3);
    const text = shown.map((r) => {
      const now = Number(r.availableNow) || 0;
      const spring = Number(r.spring) || 0;
      const availability = now ? `${now.toLocaleString()} available now` : (spring ? `${spring.toLocaleString()} projected for spring` : "none available now");
      return `${r.size} · ${formatMoney(Number.isFinite(Number(r.price)) ? Number(r.price) : null)} · ${availability}`;
    });
    return text.join("  /  ") + (shown.length < (rows.length || allRows.length) ? "  /  +more sizes" : "");
  }

  function nurseryDetailHTML(plant) {
    const rows = nurseryRowsFor(plant);
    if (!rows.length) return `<section class="drawer__nursery"><h3>Beaver Lake availability</h3><p class="drawer__nursery-empty">Not listed in the current snapshot.</p></section>`;
    return `<section class="drawer__nursery">
      <h3>Beaver Lake availability</h3>
      <p class="drawer__nursery-note">Snapshot pricing by container size. Confirm current quantities with the nursery before ordering.</p>
      <div class="nursery-table" role="table" aria-label="Beaver Lake availability by pot size">
        <div class="nursery-table__row nursery-table__head" role="row"><span>Size</span><span>Price</span><span>Available now</span><span>Spring</span><span>Future</span></div>
        ${rows.map((r) => `<div class="nursery-table__row" role="row"><span>${esc(r.size)}</span><span>${formatMoney(Number.isFinite(Number(r.price)) ? Number(r.price) : null)}</span><span>${Number(r.availableNow || 0).toLocaleString()}</span><span>${Number(r.spring || 0).toLocaleString()}</span><span>${Number(r.future || 0).toLocaleString()}</span></div>`).join("")}
      </div>
    </section>`;
  }

  function budgetTotals() {
    return state.orders.reduce((out, item) => {
      const unit = priceFor(item);
      if (unit == null) out.unknown += 1;
      else out.total += unit * (Number(item.qty) || 0);
      return out;
    }, { total: 0, unknown: 0 });
  }

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const MONTHS = {
    january: "Jan", february: "Feb", march: "Mar", april: "Apr", may: "May",
    june: "Jun", july: "Jul", august: "Aug", september: "Sep", october: "Oct",
    november: "Nov", december: "Dec",
  };

  function shortBloom(text) {
    if (!text) return "";
    if (/^n\/?a$/i.test(text.trim())) return "";
    let t = text.split("(")[0].trim().replace(/\.$/, "");
    t = t.replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
      (m) => MONTHS[m.toLowerCase()]);
    return t.replace(/\s+-\s+/g, "–");
  }

  function shortType(text) {
    if (!text) return "";
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1] || text;
    return last.charAt(0).toUpperCase() + last.slice(1);
  }

  function prettyList(text) {
    if (!text) return "";
    return text
      .split(",")
      .map((raw) => {
        const t = raw
          .trim()
          .replace(/part-?\s*sun\s*\/\s*part-?\s*shade/gi, "part sun / part shade")
          .replace(/part-?\s*shade/gi, "part shade")
          .replace(/part-?\s*sun/gi, "part sun");
        return t.charAt(0).toUpperCase() + t.slice(1);
      })
      .filter(Boolean)
      .join(", ");
  }

  function lightPhrase(lights) {
    const has = (l) => lights.includes(l);
    if (has("full-sun") && has("part-shade") && has("full-shade")) return "Sun to deep shade";
    if (has("full-sun") && has("part-shade")) return "Sun to part shade";
    if (has("part-shade") && has("full-shade")) return "Part shade to deep shade";
    if (has("full-sun") && has("full-shade")) return "Sun or deep shade";
    if (has("full-sun")) return "Full sun";
    if (has("full-shade")) return "Full shade";
    return "Part shade";
  }

  const GLYPHS = {
    "full-sun": `<svg viewBox="0 0 24 24" aria-hidden="true" class="g"><circle cx="12" cy="12" r="4.1"/><g class="rays"><path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/></g></svg>`,
    "part-shade": `<svg viewBox="0 0 24 24" aria-hidden="true" class="g"><circle cx="12" cy="12" r="6.2" fill="none"/><path d="M12 5.8a6.2 6.2 0 0 1 0 12.4Z" class="fill"/><path d="M12 1.8v2.2M21.2 12h-2.2M12 20v2.2M2.8 12h2.2"/></svg>`,
    "full-shade": `<svg viewBox="0 0 24 24" aria-hidden="true" class="g"><circle cx="12" cy="12" r="6.4" fill="none"/><path d="M12 5.6a6.4 6.4 0 1 1-4.5 10.9A6.4 6.4 0 0 0 12 5.6Z" class="fill"/></svg>`,
  };

  function lightGlyphs(lights) {
    return LIGHT_ORDER.map(
      (l) => GLYPHS[l].replace('class="g"', `class="g${lights.includes(l) ? " on" : ""}"`)
    ).join("");
  }

  const ORDER = new Map();

  /* ------------------------------ filtering ------------------------------ */

  function matchesQuery(p, q) {
    if (!q) return true;
    const hay = [
      p.name, p.catalogName, p.scientificName, p.fields["Plant type/canopy layer"],
    ].join(" ").toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  }

  function baseFiltered() {
    return state.plants.filter(
      (p) => (!state.stock || p.available) && matchesQuery(p, state.query)
    );
  }

  function visiblePlants() {
    const list = baseFiltered().filter(
      (p) => state.lights.size === 0 || p.lights.some((l) => state.lights.has(l))
    );
    const byName = (a, b) => a.name.localeCompare(b.name, "en");
    if (state.sort === "name") list.sort(byName);
    else if (state.sort === "light")
      list.sort((a, b) => {
        const ai = Math.min(...a.lights.map((l) => LIGHT_ORDER.indexOf(l)));
        const bi = Math.min(...b.lights.map((l) => LIGHT_ORDER.indexOf(l)));
        return ai - bi || byName(a, b);
      });
    else if (state.sort === "qty")
      list.sort((a, b) => (b.qty || -1) - (a.qty || -1) || byName(a, b));
    else list.sort((a, b) => ORDER.get(a.id) - ORDER.get(b.id));
    return list;
  }

  /* ------------------------------ rendering ------------------------------ */

  function cardHTML(p, i) {
    const out = !p.available;
    const planted = state.planted.has(p.id);
    const comps = (p.companions || []).slice(0, 2).map((c) => c.name);
    const extra = Math.max(0, (p.companions || []).length - comps.length);
    const bloom = shortBloom((p.fields || {})["Bloom time"]);
    const images = p.images || [];
    const meta = [];
    const order = orderFor(p.id);
    if (order && order.qty) meta.push(`<span class="card__qty">${order.qty} × ${esc(order.size)}</span>`);
    if (bloom) meta.push(`<span>Blooms ${esc(bloom)}</span>`);

    return `
      <article class="card${out ? " is-out" : ""}${planted ? " is-planted" : ""}" data-id="${esc(p.id)}" style="animation-delay:${Math.min(i * 35, 320)}ms">
        <div class="card__media">
          ${p.images && p.images[0] ? `<img src="${esc(images[0].src)}" alt="${esc(p.name)} (${esc(p.scientificName)})" loading="lazy" decoding="async" width="${images[0].w}" height="${images[0].h}">` : `<div class="card__placeholder" aria-hidden="true"><span>✦</span></div>`}
          <span class="card__no">No. ${String((ORDER.get(p.id) ?? 0) + 1).padStart(2, "0")}</span>
          ${out ? `<span class="card__badge">${esc(p.note || "Not available")}</span>` : ""}
        </div>
        <div class="card__body">
          <h3 class="card__name"><button class="card__open" type="button" data-open="${esc(p.id)}">${esc(p.name)}</button></h3>
          <p class="card__sci">${esc(p.scientificName)}</p>
          <div class="lights">
            <span class="lights__glyphs">${lightGlyphs(p.lights)}</span>
            <span class="lights__text">${esc((p.lights || []).length ? lightPhrase(p.lights) : "Light not recorded")}</span>
          </div>
          <p class="card__meta">${meta.join("")}</p>
          <div class="card__nursery"><strong class="card__nursery-label">Beaver Lake availability</strong><span class="card__nursery-value">${esc(nurseryCardText(p))}</span></div>
          ${p.note && p.available ? `<p class="card__meta"><span class="card__note">${esc(p.note)}</span></p>` : ""}
          <p class="card__comp"><strong>Good with</strong> ${esc(comps.join(", "))}${extra ? ` +${extra}` : ""}</p>
        </div>
        <div class="card__foot">
          <label class="planted">
            <input type="checkbox" data-planted="${esc(p.id)}" ${planted ? "checked" : ""}>
            <span class="planted__box"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4 4.7 9 10 3.2"/></svg></span>
            <span class="planted__label">Planted</span>
          </label>
          ${p.productUrl ? `<a class="card__link" href="${esc(p.productUrl)}" target="_blank" rel="noopener">Sparrowhawk ↗</a>` : `<span class="card__link">Local plant</span>`}
        </div>
      </article>`;
  }

  function render() {
    const list = visiblePlants();
    els.grid.classList.toggle("is-compact", state.view === "compact");
    $$(`[data-view]`).forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.view === state.view)));
    els.grid.innerHTML = list.map(cardHTML).join("");
    els.empty.hidden = list.length > 0;
    els.grid.hidden = list.length === 0;

    const total = state.plants.length;
    els.result.textContent =
      list.length === total
        ? `Showing all ${total} species`
        : `Showing ${list.length} of ${total} species`;

    // counts per light, respecting search and stock but not the light filter
    const base = baseFiltered();
    $$("[data-count]").forEach((el) => {
      const l = el.dataset.count;
      el.textContent = base.filter((p) => p.lights.includes(l)).length;
    });

    const parts = [];
    if (state.lights.size)
      parts.push([...state.lights].map((l) => $(".chip__label", $(`[data-light="${l}"]`)).textContent.trim()).join(" or "));
    if (state.stock) parts.push("in stock");
    if (state.query) parts.push(`“${state.query}”`);
    els.hint.textContent = parts.length ? `Filtered to ${parts.join(" · ")}` : "";
    els.clear.hidden = !parts.length;

    updateStats();
  }

  function updateStats() {
    const total = state.plants.length;
    const plantsToBuy = state.orders.reduce((n, p) => n + (p.qty || 0), 0);
    const inStock = state.plants.filter((p) => p.available).length;
    const planted = state.planted.size;

    const set = (key, val) => {
      const el = $(`[data-stat="${key}"]`);
      if (el) el.textContent = val;
    };
    set("species", total);
    set("plants", plantsToBuy);
    set("stock", inStock);
    set("planted", planted);
    const budget = budgetTotals();
    set("budget", budget.total ? formatMoney(budget.total) : (budget.unknown ? "—" : formatMoney(0)));
    const bar = $("#planted-bar");
    if (bar) bar.style.width = `${total ? (planted / total) * 100 : 0}%`;
  }

  function syncCard(id) {
    const card = $(`.card[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    const planted = state.planted.has(id);
    card.classList.toggle("is-planted", planted);
    const box = $("input[data-planted]", card);
    if (box) box.checked = planted;
  }

  function setPlanted(id, planted, sourceEl) {
    if (planted) state.planted.add(id);
    else state.planted.delete(id);
    savePlanted();
    syncCard(id);
    updateStats();
    if (sourceEl) {
      const label = sourceEl.closest(".planted") || sourceEl.closest(".drawer__planted");
      if (label) {
        label.classList.add("is-stamping");
        setTimeout(() => label.classList.remove("is-stamping"), 340);
      }
    }
    const drawerBtn = $("[data-drawer-planted]");
    if (drawerBtn && drawerBtn.dataset.drawerPlanted === id) {
      drawerBtn.classList.toggle("pill--moss", planted);
      drawerBtn.querySelector("span").textContent = planted ? "Planted ✓" : "Mark as planted";
    }
  }

  /* -------------------------------- drawer -------------------------------- */

  function fact(label, value) {
    if (!value) return "";
    return `<div class="fact"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  }

  function openDrawer(id) {
    const p = state.plants.find((x) => x.id === id);
    if (!p) return;
    const f = p.fields || {};
    const planted = state.planted.has(p.id);

    const images = p.images || [];
    const gallery = images.length
      ? `<div class="drawer__gallery">
           <img class="drawer__hero" id="drawer-hero" src="${esc(images[0].src)}" alt="${esc(p.name)}" width="${images[0].w}" height="${images[0].h}">
           ${images.length > 1 ? `<div class="thumbs">${images
             .map((img, i) => `<button type="button" data-thumb="${i}" aria-current="${i === 0}" aria-label="Photo ${i + 1}"><img src="${esc(img.src)}" alt="" loading="lazy"></button>`)
             .join("")}</div>` : ""}
         </div>`
      : "";

    const comps = (p.companions || []).length
      ? `<h3>Companion plants</h3>
         ${state.companionMethod ? `<p class="companion-note">${esc(state.companionMethod)}</p>` : ""}
         <ul class="comp-list">${p.companions
           .map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>${c.inList ? '<span class="why inlist">on your list</span>' : `<span class="why">${esc(c.why)}</span>`}</li>`)
           .join("")}</ul>
         ${state.companionSources.length ? `<p class="companion-sources">Regional references: ${state.companionSources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(" · ")}</p>` : ""}`
      : "";

    const quote = p.companionText
      ? `<div class="quote"><strong>Companion note from Sparrowhawk</strong>${esc(p.companionText)}</div>`
      : "";

    els.drawerInner.innerHTML = `
      <button class="drawer__close" type="button" data-close aria-label="Close plant details">✕</button>
      ${gallery}
      <div class="drawer__content">
        <p class="drawer__kicker">No. ${String((ORDER.get(p.id) ?? 0) + 1).padStart(2, "0")}<span class="sep"></span>${esc((p.lights || []).length ? lightPhrase(p.lights) : "Light not recorded")}<span class="sep"></span>${esc(p.available ? "In stock" : "Not available")}</p>
        <h2 id="drawer-title">${esc(p.name)}</h2>
        <p class="drawer__sci">${esc(p.scientificName)}</p>

        <div class="drawer__status">
          ${p.qty ? `<span class="pill">${p.qty} × ${esc(p.size)}</span>` : `<span class="pill pill--clay">${esc(p.note || "Not available")}</span>`}
          ${p.qty && p.note ? `<span class="pill pill--clay">${esc(p.note)}</span>` : ""}
          <span class="pill">${esc(shortType(f["Plant type/canopy layer"]) || "Native perennial")}</span>
        </div>

        ${nurseryDetailHTML(p)}

        <div class="drawer__planted">
          <p>${planted ? "This one is in the ground." : "Still to plant."}</p>
          <button class="pill ${planted ? "pill--moss" : ""}" type="button" data-drawer-planted="${esc(p.id)}"><span>${planted ? "Planted ✓" : "Mark as planted"}</span></button>
        </div>

        ${p.description ? `<p class="drawer__desc">${esc(p.description)}</p>` : `<p class="drawer__desc">This plant was added to the local order. Use the Beaver Lake availability check in the order editor to confirm current nursery quantities.</p>`}

        <dl class="facts">
          ${fact("Light", prettyList(f["Light requirements"]) || lightPhrase(p.lights))}
          ${fact("Moisture", prettyList(f["Moisture requirements"]) || prettyList((p.moistureTags || []).join(", ")))}
          ${fact("Bloom time", (f["Bloom time"] || "").replace(/\s+-\s+/g, "–"))}
          ${fact("Size at maturity", f["Size at maturity"])}
          ${fact("Foliage", (p.evergreen || []).join(", "))}
          ${fact("Growth", f["Growth rate/ease"])}
        </dl>

        ${comps}
        ${quote}

        ${p.gardening ? `<h3>Gardening notes</h3><p class="drawer__desc">${esc(p.gardening)}</p>` : ""}

        ${f["Wildlife support"] ? `<details><summary>Wildlife support</summary><p>${esc(f["Wildlife support"])}</p></details>` : ""}
        ${f["Native habitat/range"] ? `<details><summary>Native habitat & range</summary><p>${esc(f["Native habitat/range"])}</p></details>` : ""}
        ${f["Special features & uses"] ? `<details><summary>Special features & uses</summary><p>${esc(f["Special features & uses"])}</p></details>` : ""}

        <a class="drawer__source" href="${esc(p.productUrl)}" target="_blank" rel="noopener">Full profile at Sparrowhawk Native Plants ↗</a>
        ${p.photoCredit ? `<p class="credit">${esc(p.photoCredit)}</p>` : ""}
      </div>`;

    if (typeof els.drawer.showModal === "function") els.drawer.showModal();
    else els.drawer.setAttribute("open", "");
    els.drawerInner.dataset.plantId = p.id;
    document.body.style.overflow = "hidden";
    els.drawerInner.scrollTop = 0;
    $("[data-close]", els.drawerInner).focus({ preventScroll: true });
  }

  function closeDrawer() {
    if (els.drawer.open && typeof els.drawer.close === "function") els.drawer.close();
    else els.drawer.removeAttribute("open");
    document.body.style.overflow = "";
  }

  /* --------------------------- planting groups --------------------------- */
  const CANOPY_ORDER = ["canopy", "large tree", "small tree", "shrub", "herbaceous/ground"];
  function groupPlants(group) { return group.plantIds.map((id) => state.plants.find((p) => p.id === id)).filter(Boolean); }
  function groupProfile(group) {
    const plants = groupPlants(group);
    const sets = plants.map((p) => new Set(p.lights || []));
    const sharedLights = LIGHT_ORDER.filter((l) => sets.length && sets.every((set) => set.has(l)));
    const allLights = LIGHT_ORDER.filter((l) => sets.some((set) => set.has(l)));
    const canopy = [...new Set(plants.flatMap((p) => p.canopy || []))];
    const missingCanopy = CANOPY_ORDER.filter((layer) => !canopy.some((value) => norm(value).includes(norm(layer))));
    const sizes = plants.map((p) => `${p.name}: ${(p.fields || {})["Size at maturity"] || "size not recorded"}`);
    const moisture = [...new Set(plants.flatMap((p) => p.moistureTags || []))];
    return { plants, sharedLights, allLights, canopy, missingCanopy, sizes, moisture };
  }
  function renderGroupPicker(selected = []) {
    els.groupPicker.innerHTML = state.plants.map((p) => `<label class="group-plant-option"><input type="checkbox" data-group-plant value="${esc(p.id)}" ${selected.includes(p.id) ? "checked" : ""}><span><strong>${esc(p.name)}</strong><em>${esc(p.scientificName)}</em></span></label>`).join("");
  }
  function currentGroupSelection() { return $$('input[data-group-plant]:checked', els.groupPicker).map((input) => input.value); }
  function renderGroupAnalysis() {
    const profile = groupProfile({ plantIds: currentGroupSelection() });
    if (!profile.plants.length) { els.groupSummary.innerHTML = `<p class="group-empty">Choose at least one plant to see the group’s shape.</p>`; els.groupSuggestions.innerHTML = ""; return; }
    const lights = profile.sharedLights.length ? profile.sharedLights : profile.allLights;
    const lightText = lights.map((l) => l === "full-sun" ? "Full sun" : l === "part-shade" ? "Part sun / shade" : "Full shade").join(", ");
    els.groupSummary.innerHTML = `<div class="group-summary__facts"><div><dt>Light fit</dt><dd>${esc(profile.sharedLights.length ? lightText : `${lightText} (mixed exposure)`)}</dd></div><div><dt>Canopy layers</dt><dd>${esc(profile.canopy.join(", ") || "Not recorded")}</dd></div><div><dt>Moisture</dt><dd>${esc(profile.moisture.join(", ") || "Not recorded")}</dd></div></div><h3>Selected mature sizes</h3><ul class="group-size-list">${profile.sizes.map((size) => `<li>${esc(size)}</li>`).join("")}</ul>`;
    const selected = new Set(profile.plants.map((p) => p.id));
    const suggestions = state.plants.filter((p) => !selected.has(p.id)).map((p) => {
      const shared = (p.lights || []).some((l) => profile.allLights.includes(l));
      const fills = profile.missingCanopy.filter((layer) => (p.canopy || []).some((value) => norm(value).includes(norm(layer))));
      const moist = (p.moistureTags || []).some((m) => profile.moisture.includes(m));
      return { p, fills, score: (shared ? 2 : 0) + fills.length * 3 + (moist ? 1 : 0) };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).slice(0, 6);
    els.groupSuggestions.innerHTML = `<h3>Suggested gap-fillers</h3>${profile.missingCanopy.length ? `<p class="group-suggestion-note">Open layers: ${esc(profile.missingCanopy.join(", "))}</p>` : `<p class="group-suggestion-note">The group covers the main canopy layers represented in this catalogue.</p>`}<div class="group-suggestion-list">${suggestions.length ? suggestions.map(({ p, fills }) => `<article class="group-suggestion"><strong>${esc(p.name)}</strong><em>${esc(lightPhrase(p.lights))} · ${esc((p.fields || {})["Size at maturity"] || "size not recorded")}</em><span>${esc(fills.length ? `Fills: ${fills.join(", ")}` : "Matches the group exposure")}</span><button type="button" class="linkish" data-add-group-plant="${esc(p.id)}">Add to group</button></article>`).join("") : `<p class="group-empty">No close catalogue matches yet. Try adding another plant or mixing the light exposure.</p>`}</div>`;
  }
  function renderSavedGroups() {
    els.savedGroups.innerHTML = state.groups.length ? state.groups.map((group) => { const profile = groupProfile(group); return `<article class="saved-group"><div><strong>${esc(group.name)}</strong><span>${profile.plants.length} plants · ${esc(profile.canopy.join(", ") || "layers not recorded")}</span></div><button type="button" class="linkish" data-delete-group="${esc(group.id)}">Remove</button></article>`; }).join("") : `<p class="group-empty">No saved groups yet.</p>`;
  }
  function openGroupPlanner() { renderGroupPicker(); renderGroupAnalysis(); renderSavedGroups(); if (typeof els.groupDialog.showModal === "function") els.groupDialog.showModal(); else els.groupDialog.setAttribute("open", ""); document.body.style.overflow = "hidden"; }
  function closeGroupPlanner() { if (els.groupDialog.open && typeof els.groupDialog.close === "function") els.groupDialog.close(); else els.groupDialog.removeAttribute("open"); document.body.style.overflow = ""; }

  /* ----------------------------- order editor ----------------------------- */

  function renderOrderRows() {
    if (!state.orders.length) {
      els.orderRows.innerHTML = `<p class="order-empty">Your order is empty. Add a plant below.</p>`;
    } else {
      els.orderRows.innerHTML = state.orders.map((item) => `
        <div class="order-row" data-order-id="${esc(item.id)}">
          <div class="order-row__name"><strong>${esc(item.name)}</strong><em>${esc(item.scientificName || "Scientific name not recorded")}</em></div>
          <label>Qty<input type="number" min="1" step="1" data-order-field="qty" value="${Number(item.qty) || 1}"></label>
          <label>Pot size<select data-order-field="size">${sizeOptionsHTML(item, item.size || "1 Gallon")}</select></label>
          <div class="availability-status ${availabilityFor(item).length ? "is-listed" : "is-missing"}">${esc(availabilitySummary(item))}</div>
          <div class="order-row__cost">${priceFor(item) == null ? "Price not in snapshot" : `${formatMoney(priceFor(item))} ea · ${formatMoney(priceFor(item) * (Number(item.qty) || 0))} est.`}</div>
          <button class="order-remove" type="button" data-order-remove aria-label="Remove ${esc(item.name)}">Remove</button>
        </div>`).join("");
    }
    const total = state.orders.reduce((n, x) => n + (Number(x.qty) || 0), 0);
    const budget = budgetTotals();
    const budgetText = budget.unknown ? `${formatMoney(budget.total)} estimated · ${budget.unknown} price${budget.unknown === 1 ? "" : "s"} unknown` : `${formatMoney(budget.total)} estimated`;
    els.orderStatus.textContent = `${state.orders.length} ${state.orders.length === 1 ? "plant" : "plants"} · ${total} total plants · ${budgetText}`;
  }

  function openOrderEditor() {
    renderOrderRows();
    if (typeof els.orderDialog.showModal === "function") els.orderDialog.showModal();
    else els.orderDialog.setAttribute("open", "");
    document.body.style.overflow = "hidden";
  }

  function closeOrderEditor() {
    if (els.orderDialog.open && typeof els.orderDialog.close === "function") els.orderDialog.close();
    else els.orderDialog.removeAttribute("open");
    document.body.style.overflow = "";
  }

  function updateOrderItem(id, field, value) {
    const item = orderFor(id);
    if (!item) return;
    if (field === "qty") item.qty = Math.max(1, Number(value) || 1);
    if (field === "size") item.size = value.trim() || "1 Gallon";
    const plant = state.plants.find((p) => p.id === id);
    if (plant) { plant.qty = item.qty; plant.size = item.size; }
    saveOrders(); render(); renderOrderRows();
  }

  function findAvailability(name, scientificName) {
    const q = norm(name), sci = norm(scientificName);
    if (sci) { const hit = state.availability.find((r) => norm(r.scientificName) === sci); if (hit) return hit; }
    if (q) return state.availability.find((r) => norm(r.name) === q) || state.availability.find((r) => norm(r.name).includes(q) || q.includes(norm(r.name)));
    return null;
  }

  function updateAddMatch() {
    const name = $("#new-plant-name").value, sci = $("#new-plant-scientific").value;
    if (!name && !sci) { els.addMatch.textContent = ""; return; }
    const hit = findAvailability(name, sci);
    els.addMatch.textContent = hit ? `Beaver Lake match: ${hit.name} (${hit.scientificName}) · ${availabilitySummary({ name: hit.name, scientificName: hit.scientificName, size: $("#new-plant-size").value })}` : "No exact Beaver Lake match yet — you can still add this as a custom plant.";
  }

  function renderAddSizeOptions(item = { name: els.plantName.value, scientificName: els.plantScientific.value }, current = els.plantSize.value) {
    const options = sizeOptionsFor(item);
    if (!options.length) return;
    els.plantSize.innerHTML = sizeOptionsHTML(item, current || options[0]);
    updateAddMatch();
  }

  function closePlantSuggestions() {
    els.plantSuggestions.hidden = true;
    els.plantName.setAttribute("aria-expanded", "false");
  }

  function renderPlantSuggestions() {
    const query = norm(els.plantName.value);
    const matches = query ? state.plants.filter((p) => norm(`${p.name} ${p.scientificName}`).includes(query)).slice(0, 8) : [];
    if (!matches.length) return closePlantSuggestions();
    els.plantSuggestions.innerHTML = matches.map((p) => `<button type="button" class="plant-suggestion" role="option" data-plant-suggestion="${esc(p.id)}"><strong>${esc(p.name)}</strong><em>${esc(p.scientificName || "Scientific name not recorded")}</em></button>`).join("");
    els.plantSuggestions.hidden = false;
    els.plantName.setAttribute("aria-expanded", "true");
  }

  /* -------------------------------- events -------------------------------- */

  $("#group-open").addEventListener("click", openGroupPlanner);
  $("#group-close").addEventListener("click", closeGroupPlanner);
  els.groupDialog.addEventListener("click", (e) => { if (e.target === els.groupDialog) closeGroupPlanner(); });
  els.groupPicker.addEventListener("change", renderGroupAnalysis);
  els.groupSuggestions.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-group-plant]");
    if (add) { const box = $(`input[data-group-plant][value="${CSS.escape(add.dataset.addGroupPlant)}"]`, els.groupPicker); if (box) box.checked = true; renderGroupAnalysis(); }
  });
  els.savedGroups.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-delete-group]");
    if (!remove) return;
    state.groups = state.groups.filter((group) => group.id !== remove.dataset.deleteGroup);
    saveGroups(); renderSavedGroups();
  });
  els.groupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const plantIds = currentGroupSelection();
    if (!plantIds.length) { els.groupSummary.innerHTML = `<p class="group-empty">Choose at least one plant before saving.</p>`; return; }
    state.groups.push({ id: `group-${Date.now()}`, name: els.groupName.value.trim(), plantIds });
    saveGroups(); els.groupForm.reset(); renderGroupPicker(); renderGroupAnalysis(); renderSavedGroups();
  });

  $("#order-open").addEventListener("click", openOrderEditor);
  $("#order-close").addEventListener("click", closeOrderEditor);
  els.orderDialog.addEventListener("click", (e) => { if (e.target === els.orderDialog) closeOrderEditor(); });
  els.orderRows.addEventListener("input", (e) => { const row = e.target.closest("[data-order-id]"); const field = e.target.dataset.orderField; if (row && field) updateOrderItem(row.dataset.orderId, field, e.target.value); });
  els.orderRows.addEventListener("change", (e) => { const row = e.target.closest("[data-order-id]"); const field = e.target.dataset.orderField; if (row && field) updateOrderItem(row.dataset.orderId, field, e.target.value); });
  els.orderRows.addEventListener("click", (e) => { const btn = e.target.closest("[data-order-remove]"); if (!btn) return; const row = btn.closest("[data-order-id]"); state.orders = state.orders.filter((x) => x.id !== row.dataset.orderId); state.plants = state.plants.filter((p) => p.id !== row.dataset.orderId); saveOrders(); render(); renderOrderRows(); });
  els.plantName.addEventListener("input", () => { if (!selectedPlantId) els.plantScientific.value = ""; selectedPlantId = ""; renderPlantSuggestions(); renderAddSizeOptions(); updateAddMatch(); });
  els.plantScientific.addEventListener("input", () => { selectedPlantId = ""; renderAddSizeOptions(); updateAddMatch(); });
  els.plantSize.addEventListener("change", updateAddMatch);
  els.plantSuggestions.addEventListener("click", (e) => {
    const option = e.target.closest("[data-plant-suggestion]");
    if (!option) return;
    const plant = state.plants.find((p) => p.id === option.dataset.plantSuggestion);
    if (!plant) return;
    selectedPlantId = plant.id;
    els.plantName.value = plant.name;
    els.plantScientific.value = plant.scientificName || "";
    renderAddSizeOptions(plant, plant.size || "");
    closePlantSuggestions();
    updateAddMatch();
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".plant-picker")) closePlantSuggestions(); });
  els.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.plantName.value.trim();
    const scientificName = els.plantScientific.value.trim();
    const qty = Math.max(1, Number($("#new-plant-qty").value) || 1);
    const size = els.plantSize.value || "1 Gallon";
    if (!name) return;
    const source = selectedPlantId ? state.plants.find((p) => p.id === selectedPlantId) : null;
    const hit = source ? null : findAvailability(name, scientificName);
    const id = source ? source.id : `custom-${slugify(name)}-${Date.now()}`;
    const p = source || { id, name: hit ? hit.name : name, scientificName: hit ? hit.scientificName : scientificName, qty, size, available: Boolean(hit && availabilityFor({ name: hit.name, scientificName: hit.scientificName, size }).some((r) => r.availableNow > 0)), note: hit ? "Beaver Lake snapshot match" : "Custom plant", lights: [], images: [], companions: [], fields: {}, productUrl: "" };
    p.qty = qty; p.size = size;
    if (!source) { state.plants.push(p); ORDER.set(id, state.plants.length - 1); }
    const existing = orderFor(id);
    if (existing) { existing.qty = qty; existing.size = size; }
    else state.orders.push({ id, name: p.name, scientificName: p.scientificName, qty, size });
    saveOrders(); render(); renderOrderRows();
    selectedPlantId = ""; els.addForm.reset(); els.plantSize.innerHTML = `<option value="1 Gallon">1 Gallon</option>`; $("#new-plant-qty").value = 1; els.addMatch.textContent = `${p.name} added to your order.`; closePlantSuggestions();
  });

  els.grid.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) {
      openDrawer(openBtn.dataset.open);
    }
  });

  els.grid.addEventListener("change", (e) => {
    const box = e.target.closest("input[data-planted]");
    if (box) setPlanted(box.dataset.planted, box.checked, box);
  });

  els.drawerInner.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeDrawer();
    const thumb = e.target.closest("[data-thumb]");
    if (thumb) {
      const hero = $("#drawer-hero");
      const buttons = $$("[data-thumb]", els.drawerInner);
      const idx = Number(thumb.dataset.thumb);
      const card = els.drawerInner.dataset.plantId;
      const plant = state.plants.find((x) => x.id === card);
      if (plant && hero && plant.images[idx]) {
        hero.src = plant.images[idx].src;
        hero.alt = `${plant.name} — photo ${idx + 1}`;
        buttons.forEach((b) => b.setAttribute("aria-current", String(b === thumb)));
      }
      return;
    }
    const toggle = e.target.closest("[data-drawer-planted]");
    if (toggle) {
      const id = toggle.dataset.drawerPlanted;
      setPlanted(id, !state.planted.has(id), toggle);
      const p = state.plants.find((x) => x.id === id);
      const note = $(".drawer__planted p", els.drawerInner);
      if (note && p) note.textContent = state.planted.has(id) ? "This one is in the ground." : "Still to plant.";
    }
  });

  els.drawer.addEventListener("click", (e) => {
    if (e.target === els.drawer) closeDrawer();
  });
  els.drawer.addEventListener("close", () => {
    document.body.style.overflow = "";
  });

  $$("[data-light]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const l = btn.dataset.light;
      if (state.lights.has(l)) state.lights.delete(l);
      else state.lights.add(l);
      btn.setAttribute("aria-pressed", String(state.lights.has(l)));
      render();
    });
  });

  els.stock.addEventListener("click", () => {
    state.stock = !state.stock;
    els.stock.setAttribute("aria-pressed", String(state.stock));
    render();
  });

  let searchTimer;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.search.value.trim().toLowerCase();
      render();
    }, 140);
  });

  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    render();
  });

  $$('[data-view]').forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      saveView();
      render();
    });
  });

  const clearAll = () => {
    state.lights.clear();
    state.stock = false;
    state.query = "";
    state.sort = "list";
    els.search.value = "";
    els.sort.value = "list";
    els.stock.setAttribute("aria-pressed", "false");
    $$("[data-light]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    render();
  };
  els.clear.addEventListener("click", clearAll);
  $$("[data-clear]").forEach((b) => b.addEventListener("click", clearAll));

  const refineBtn = $("#refine-toggle");
  const controlsBar = $(".controls");
  if (refineBtn) {
    refineBtn.addEventListener("click", () => {
      const open = controlsBar.classList.toggle("refine-open");
      refineBtn.setAttribute("aria-expanded", String(open));
      refineBtn.querySelector("span").textContent = open ? "Done" : "Refine";
    });
  }

  // sticky shadow
  const controls = $(".controls");
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  controls.parentNode.insertBefore(sentinel, controls);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => controls.classList.toggle("is-stuck", !entry.isIntersecting),
      { threshold: 0 }
    ).observe(sentinel);
  }

  /* --------------------------------- boot --------------------------------- */

  Promise.all([
    fetch("data/plants.json").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    fetch("data/beaverlake-availability.json").then((r) => r.ok ? r.json() : null).catch(() => null),
  ]).then(([data, availability]) => {
      state.plants = data.plants;
      state.companionMethod = data.companionMethod || "";
      state.companionSources = data.companionSources || [];
      state.availability = availability && availability.rows ? availability.rows : [];
      state.availabilityMeta = availability || {};
      state.groups = readGroups();
      renderAddSizeOptions();
      state.orders = readOrders(state.plants);
      state.orders.forEach((o) => { const p = state.plants.find((x) => x.id === o.id); if (p) { p.qty = o.qty; p.size = o.size; } });
      state.plants.forEach((p, i) => ORDER.set(p.id, i));
      if (availability && availability.snapshot) { const d = new Date(`${availability.snapshot}T12:00:00`); const el = $("#availability-date"); if (el) el.textContent = d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); }

      const species = state.plants.length;
      const toBuy = state.orders.reduce((n, p) => n + (p.qty || 0), 0);
      const stock = state.plants.filter((p) => p.available).length;
      $('[data-stat="species"]').textContent = species;
      $('[data-stat="plants"]').textContent = toBuy;
      $('[data-stat="stock"]').textContent = stock;

      if (data.updated) {
        const d = new Date(`${data.updated}T12:00:00`);
        const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        const el = $("#footer-updated");
        if (el) el.textContent = `Updated ${label}`;
      }

      render();
    })
    .catch((err) => {
      els.grid.innerHTML = `<p class="empty">The plant data could not be loaded (${esc(err.message)}). If you opened this file directly from disk, try the hosted GitHub Pages version instead.</p>`;
      els.grid.hidden = false;
    });
})();
