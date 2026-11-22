/* Yard Ledger — plant list, filters and detail panel */
(() => {
  "use strict";

  const LIGHT_ORDER = ["full-sun", "part-shade", "full-shade"];
  const STORE_KEY = "yardledger.planted.v1";

  const state = {
    plants: [],
    lights: new Set(),
    stock: false,
    query: "",
    sort: "list",
    planted: new Set(readPlanted()),
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
  };

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
    const bloom = shortBloom(p.fields["Bloom time"]);
    const meta = [];
    if (p.qty) meta.push(`<span class="card__qty">${p.qty} × ${esc(p.size)}</span>`);
    if (bloom) meta.push(`<span>Blooms ${esc(bloom)}</span>`);

    return `
      <article class="card${out ? " is-out" : ""}${planted ? " is-planted" : ""}" data-id="${esc(p.id)}" style="animation-delay:${Math.min(i * 35, 320)}ms">
        <div class="card__media">
          <img src="${esc(p.images[0] ? p.images[0].src : "")}" alt="${esc(p.name)} (${esc(p.scientificName)})" loading="lazy" decoding="async" width="${p.images[0] ? p.images[0].w : 980}" height="${p.images[0] ? p.images[0].h : 735}">
          <span class="card__no">No. ${String(ORDER.get(p.id) + 1).padStart(2, "0")}</span>
          ${out ? `<span class="card__badge">${esc(p.note || "Not available")}</span>` : ""}
        </div>
        <div class="card__body">
          <h3 class="card__name"><button class="card__open" type="button" data-open="${esc(p.id)}">${esc(p.name)}</button></h3>
          <p class="card__sci">${esc(p.scientificName)}</p>
          <div class="lights">
            <span class="lights__glyphs">${lightGlyphs(p.lights)}</span>
            <span class="lights__text">${esc(lightPhrase(p.lights))}</span>
          </div>
          <p class="card__meta">${meta.join("")}</p>
          ${p.note && p.available ? `<p class="card__meta"><span class="card__note">${esc(p.note)}</span></p>` : ""}
          <p class="card__comp"><strong>Good with</strong> ${esc(comps.join(", "))}${extra ? ` +${extra}` : ""}</p>
        </div>
        <div class="card__foot">
          <label class="planted">
            <input type="checkbox" data-planted="${esc(p.id)}" ${planted ? "checked" : ""}>
            <span class="planted__box"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4 4.7 9 10 3.2"/></svg></span>
            <span class="planted__label">Planted</span>
          </label>
          <a class="card__link" href="${esc(p.productUrl)}" target="_blank" rel="noopener">Sparrowhawk ↗</a>
        </div>
      </article>`;
  }

  function render() {
    const list = visiblePlants();
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
    const plantsToBuy = state.plants.reduce((n, p) => n + (p.qty || 0), 0);
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

    const gallery = p.images.length
      ? `<div class="drawer__gallery">
           <img class="drawer__hero" id="drawer-hero" src="${esc(p.images[0].src)}" alt="${esc(p.name)}" width="${p.images[0].w}" height="${p.images[0].h}">
           ${p.images.length > 1 ? `<div class="thumbs">${p.images
             .map((img, i) => `<button type="button" data-thumb="${i}" aria-current="${i === 0}" aria-label="Photo ${i + 1}"><img src="${esc(img.src)}" alt="" loading="lazy"></button>`)
             .join("")}</div>` : ""}
         </div>`
      : "";

    const comps = (p.companions || []).length
      ? `<h3>Companion plants</h3>
         <ul class="comp-list">${p.companions
           .map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>${c.inList ? '<span class="why inlist">on your list</span>' : `<span class="why">${esc(c.why)}</span>`}</li>`)
           .join("")}</ul>`
      : "";

    const quote = p.companionText
      ? `<div class="quote"><strong>Companion note from Sparrowhawk</strong>${esc(p.companionText)}</div>`
      : "";

    els.drawerInner.innerHTML = `
      <button class="drawer__close" type="button" data-close aria-label="Close plant details">✕</button>
      ${gallery}
      <div class="drawer__content">
        <p class="drawer__kicker">No. ${String(ORDER.get(p.id) + 1).padStart(2, "0")}<span class="sep"></span>${esc(lightPhrase(p.lights))}<span class="sep"></span>${esc(p.available ? "In stock" : "Not available")}</p>
        <h2 id="drawer-title">${esc(p.name)}</h2>
        <p class="drawer__sci">${esc(p.scientificName)}</p>

        <div class="drawer__status">
          ${p.qty ? `<span class="pill">${p.qty} × ${esc(p.size)}</span>` : `<span class="pill pill--clay">${esc(p.note || "Not available")}</span>`}
          ${p.qty && p.note ? `<span class="pill pill--clay">${esc(p.note)}</span>` : ""}
          <span class="pill">${esc(shortType(f["Plant type/canopy layer"]) || "Native perennial")}</span>
        </div>

        <div class="drawer__planted">
          <p>${planted ? "This one is in the ground." : "Still to plant."}</p>
          <button class="pill ${planted ? "pill--moss" : ""}" type="button" data-drawer-planted="${esc(p.id)}"><span>${planted ? "Planted ✓" : "Mark as planted"}</span></button>
        </div>

        ${p.description ? `<p class="drawer__desc">${esc(p.description)}</p>` : ""}

        <dl class="facts">
          ${fact("Light", prettyList(f["Light requirements"]) || lightPhrase(p.lights))}
          ${fact("Moisture", prettyList(f["Moisture requirements"]) || prettyList(p.moistureTags.join(", ")))}
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

  /* -------------------------------- events -------------------------------- */

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

  fetch("data/plants.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      state.plants = data.plants;
      state.plants.forEach((p, i) => ORDER.set(p.id, i));

      const species = state.plants.length;
      const toBuy = state.plants.reduce((n, p) => n + (p.qty || 0), 0);
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
