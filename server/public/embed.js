/* StoreCal embeddable booking widget.
 *
 * Drop this on any website:
 *   <script src="https://YOUR-DOMAIN/embed.js" data-store="sc_xxxxxxxx"></script>
 *
 * Optional attributes:
 *   data-target="#booking"   mount into this element instead of inline
 *   data-accent="#2563eb"    override the accent color
 *
 * The store is identified by data-store (the shop's public key); the API base is
 * derived from this script's own src, so it works on any domain with no config.
 * Renders inside a Shadow DOM so host-site CSS can't clash with the widget.
 */
(function () {
  "use strict";

  var script = document.currentScript || (function () {
    var s = document.querySelectorAll("script[data-store]");
    return s[s.length - 1];
  })();
  if (!script) return;

  var STORE_KEY = script.getAttribute("data-store");
  var ACCENT = script.getAttribute("data-accent") || "#2563eb";
  if (!STORE_KEY) { console.error("[StoreCal] Missing data-store on embed script."); return; }

  var API = new URL(script.src).origin;
  var api = function (path) { return API + path + (path.indexOf("?") === -1 ? "?" : "&") + "key=" + encodeURIComponent(STORE_KEY); };

  // ── Mount + shadow root ────────────────────────────────────────────────────
  var host = document.createElement("div");
  host.className = "storecal-widget";
  var targetSel = script.getAttribute("data-target");
  var target = targetSel && document.querySelector(targetSel);
  if (target) target.appendChild(host);
  else script.parentNode.insertBefore(host, script.nextSibling);

  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent = [
    ":host,*{box-sizing:border-box}",
    ".sc{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
    "width:100%;max-width:800px;margin:0 auto;border:1px solid #e6e8ec;border-radius:16px;overflow:hidden;text-align:left;",
    "background:#fff;color:#111;box-shadow:0 24px 60px rgba(16,18,28,.28);display:flex;flex-direction:column;max-height:92vh}",
    /* trigger button (what the CTA looks like inline on the site) */
    ".sc-trigger{background:" + ACCENT + ";color:#fff;border:0;border-radius:10px;padding:13px 26px;",
    "font-size:15px;font-weight:600;font-family:inherit;cursor:pointer}",
    ".sc-trigger:hover{filter:brightness(.95)}",
    /* modal overlay */
    ".sc-overlay{display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(15,18,28,.5);",
    "padding:24px;overflow:auto}",
    ".sc-overlay--open{display:flex;align-items:flex-start;justify-content:center}",
    ".sc__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #eef0f3;flex:none}",
    ".sc__close{background:#fff;border:1px solid #e0e3e8;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;color:#333;flex:none}",
    ".sc__close:hover{background:#f5f6f8}",
    ".sc__shop{font-size:16px;font-weight:700;letter-spacing:-.01em}",
    ".sc__step{font-size:12px;color:#8a9099;margin-top:2px}",
    ".sc__body{padding:16px 20px 20px;flex:1;overflow-y:auto;width:100%;max-width:680px;margin:0 auto}",
    ".sc--wide .sc__body{max-width:none}",
    ".sc__back{background:none;border:0;color:#8a9099;font-size:13px;cursor:pointer;padding:0;margin-bottom:12px}",
    ".sc__back:hover{color:#111}",
    ".sc__h{font-size:14px;font-weight:600;margin:0 0 12px}",
    ".sc__list{display:flex;flex-direction:column;gap:8px}",
    ".sc__opt{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;",
    "padding:13px 14px;border:1px solid #e6e8ec;border-radius:11px;background:#fff;cursor:pointer;font-size:14px;font-family:inherit;color:#111}",
    ".sc__opt:hover{border-color:" + ACCENT + ";background:#f7f9ff}",
    ".sc__opt--sel{border-color:" + ACCENT + ";background:#f7f9ff;box-shadow:inset 0 0 0 1px " + ACCENT + "}",
    ".sc__opt-main{font-weight:600;display:block}",
    ".sc__opt-sub{font-size:12px;color:#8a9099;line-height:1.45;display:block}",
    ".sc__opt-meta{font-size:13px;color:#5a6069;white-space:nowrap}",
    ".sc__av{width:38px;height:38px;border-radius:50%;background:" + ACCENT + "22;color:" + ACCENT + ";",
    "display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex:none}",
    ".sc__av--any{background:" + ACCENT + ";color:#fff}",
    /* staff row: avatar + stacked name/bio */
    ".sc__opt--staff{justify-content:flex-start;gap:12px;text-align:left}",
    ".sc__opt-text{display:flex;flex-direction:column;gap:3px;min-width:0}",
    ".sc__slots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
    /* Date & time: calendar + times, two panes */
    ".sc__panes{display:grid;grid-template-columns:1.25fr 1fr;gap:18px}",
    ".sc__cal{background:#f7f8fa;border:1px solid #eef0f3;border-radius:14px;padding:14px}",
    ".sc__cal-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}",
    ".sc__cal-title{font-size:14px;font-weight:700}",
    ".sc__cal-arrow{width:30px;height:30px;border-radius:50%;border:1px solid #e0e3e8;background:#fff;cursor:pointer;font-size:16px;line-height:1;color:#333}",
    ".sc__cal-arrow:disabled{opacity:.4;cursor:default}",
    ".sc__cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px 0}",
    ".sc__cal-dow{text-align:center;font-size:11px;font-weight:600;color:#9aa0a8;padding-bottom:6px}",
    ".sc__cal-empty{aspect-ratio:1}",
    ".sc__cal-day{position:relative;aspect-ratio:1;border:0;background:none;padding:0;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center}",
    // The number + its hover/selected disc live in a fixed-size inner circle so the
    // highlight never balloons to the (wide) cell width on desktop.
    ".sc__cal-n{position:relative;display:flex;align-items:center;justify-content:center;width:min(38px,86%);aspect-ratio:1;border-radius:50%;font-size:13px;font-weight:600;color:#1a2b4a;transition:background .12s}",
    ".sc__cal-day:not(.sc__cal-day--off):not(.sc__cal-day--sel):hover .sc__cal-n{background:#e9edf5}",
    ".sc__cal-day--off{cursor:default}",
    ".sc__cal-day--off .sc__cal-n{color:#c2c7cf;font-weight:500}",
    ".sc__cal-day--today .sc__cal-n{box-shadow:inset 0 0 0 1.5px " + ACCENT + "66}",
    ".sc__cal-day--sel .sc__cal-n{background:" + ACCENT + ";color:#fff;box-shadow:none}",
    ".sc__cal-dot{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:" + ACCENT + "}",
    ".sc__cal-day--sel .sc__cal-dot{background:#fff}",
    ".sc__times-head{margin-bottom:10px}",
    ".sc__times-day{font-size:14px;font-weight:700}",
    ".sc__times-sub{font-size:12px;color:#8a9099;margin-top:2px}",
    ".sc__times-list{display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;padding-right:4px}",
    ".sc__slot--row{width:100%;text-align:center;padding:12px;font-size:14px;font-weight:600}",
    ".sc__times-empty{font-size:13px;color:#8a9099;padding:14px 0}",
    ".sc__tz{font-size:11.5px;color:#9aa0a8;margin-top:14px}",
    /* collapsible calendar (mobile): a summary bar replaces the grid once a day is picked */
    ".sc__cal-toggle{display:none;width:100%;align-items:center;justify-content:space-between;gap:10px;",
    "background:#fff;border:1px solid #e6e8ec;border-radius:12px;padding:13px 15px;font-family:inherit;",
    "font-size:14px;font-weight:600;color:#111;cursor:pointer;text-align:left}",
    ".sc__cal-toggle-hint{font-size:12.5px;font-weight:600;color:" + ACCENT + ";display:flex;align-items:center;gap:6px;flex:none}",
    ".sc__cal-caret{display:inline-block;transition:transform .18s;color:#8a9099}",
    ".sc__cal--collapsed .sc__cal-caret{transform:rotate(-90deg)}",
    "@media(max-width:640px){.sc__panes{grid-template-columns:1fr;gap:14px}",
    ".sc__cal-toggle{display:flex}",
    ".sc__cal{background:none;border:0;border-radius:0;padding:0}",
    ".sc__cal-body{margin-top:10px;background:#f7f8fa;border:1px solid #eef0f3;border-radius:14px;padding:14px}",
    ".sc__cal--collapsed .sc__cal-body{display:none}}",
    ".sc__h-opt{font-weight:400;color:#8a9099}",
    ".sc__addons{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}",
    "@media(max-width:520px){.sc__addons{grid-template-columns:1fr}}",
    ".sc__addon{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;padding:12px 14px;border:1px solid #e6e8ec;border-radius:11px;background:#fff;cursor:pointer;font-family:inherit}",
    ".sc__addon:hover{border-color:" + ACCENT + "}",
    ".sc__addon--on{border-color:" + ACCENT + ";background:#f7f9ff}",
    ".sc__addon-name{font-size:14px;font-weight:600;color:#111}",
    ".sc__addon-price{font-size:13px;color:" + ACCENT + ";font-weight:600}",
    ".sc__slot{padding:10px 6px;border:1px solid #e6e8ec;border-radius:9px;background:#fff;cursor:pointer;font-size:13px;font-family:inherit;color:#111}",
    ".sc__slot:hover{border-color:" + ACCENT + ";background:#f7f9ff;color:" + ACCENT + "}",
    ".sc__field{display:block;margin-bottom:12px}",
    ".sc__label{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px;color:#3a4049}",
    ".sc__input{width:100%;padding:11px 12px;border:1px solid #dfe2e7;border-radius:10px;font-size:14px;font-family:inherit;color:#111}",
    ".sc__input:focus{outline:none;border-color:" + ACCENT + "}",
    ".sc__select{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:34px;background-color:#fff;",
    "background-repeat:no-repeat;background-position:right 12px center;",
    "background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1l5 5 5-5' stroke='%238a9099' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")}",
    ".sc__btn{width:100%;padding:13px;border:0;border-radius:11px;background:" + ACCENT + ";color:#fff;",
    "font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;margin-top:4px}",
    ".sc__btn:hover{filter:brightness(.95)}",
    ".sc__btn:disabled{opacity:.6;cursor:default}",
    ".sc__summary{background:#f7f9ff;border:1px solid " + ACCENT + "22;border-radius:11px;padding:12px 14px;margin-bottom:16px;font-size:13px;line-height:1.6}",
    ".sc__summary b{color:#111}",
    ".sc__msg{font-size:13px;color:#8a9099;padding:14px 0}",
    ".sc__err{font-size:13px;color:#c0392b;margin-top:8px}",
    ".sc__done{text-align:center;padding:14px 0}",
    ".sc__check{width:52px;height:52px;border-radius:50%;background:" + ACCENT + "22;color:" + ACCENT + ";",
    "display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 12px}",
    ".sc__done-t{font-size:16px;font-weight:700;margin-bottom:6px}",
    ".sc__done-s{font-size:13px;color:#5a6069;line-height:1.6}",
    ".sc__done-actions{display:flex;gap:10px;margin-top:18px}",
    ".sc__done-actions .sc__btn{flex:1;margin-top:0}",
    ".sc__btn--ghost{background:#fff;color:#333;border:1px solid #e0e3e8}",
    ".sc__btn--ghost:hover{background:#f5f6f8;filter:none}",
    /* docked footer (holds the Continue CTA so it stays pinned while the body scrolls) */
    ".sc__foot{flex:none;padding:14px 20px;border-top:1px solid #eef0f3;background:#fff}",
    ".sc__foot .sc__btn{margin-top:0}",
    ".sc__foot-inner{width:100%;max-width:680px;margin:0 auto}",
    ".sc__pow{text-align:center;font-size:11px;color:#b3b8c0;padding:10px}",
    /* shown in the modal if booking is opened while membership is inactive */
    ".sc-unavail{text-align:center;padding:20px 6px}",
    ".sc-unavail-t{font-size:16px;font-weight:700;margin-bottom:6px}",
    ".sc-unavail-s{font-size:13px;color:#5a6069;line-height:1.6;margin-bottom:16px}",
    ".sc-callbtn{display:inline-block;text-decoration:none;background:" + ACCENT + ";color:#fff;border:0;border-radius:11px;padding:13px 24px;font-size:15px;font-weight:600}",
    ".sc-callbtn:hover{filter:brightness(.95)}",
  ].join("");
  root.appendChild(style);

  // Booking gate: when a shop's membership isn't active, booking CTAs are hidden
  // and replaced with a "Call {phone}" action. Optimistic (active) until the
  // shop-config load below tells us otherwise, so CTAs never flash-disable.
  var booking = { active: true, phone: "" };
  function telHref(p) { return String(p || "").replace(/[^0-9+]/g, ""); }
  function callStore() { if (booking.phone) window.location.href = "tel:" + telHref(booking.phone); }

  // ── Trigger button + modal overlay ──────────────────────────────────────────
  var trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "sc-trigger";
  trigger.textContent = script.getAttribute("data-button-text") || "Book Appointment";
  root.appendChild(trigger);

  var overlay = document.createElement("div");
  overlay.className = "sc-overlay";
  var wrap = document.createElement("div");
  wrap.className = "sc";
  overlay.appendChild(wrap);
  root.appendChild(overlay);

  // openModal(opts): opts.service = a service id or name to preselect (jumps
  // straight to the staff step). Ignores non-object args (e.g. click events).
  function openModal(opts) {
    var pre = opts && typeof opts === "object" && (opts.service || opts.serviceId || opts.serviceName);
    overlay.classList.add("sc-overlay--open");
    document.body.style.overflow = "hidden"; // lock page scroll behind the modal
    start(pre || null);
  }
  function closeModal() {
    overlay.classList.remove("sc-overlay--open");
    document.body.style.overflow = "";
  }
  trigger.onclick = function () { if (!booking.active) return callStore(); openModal(); };
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  // Link-in-bio pages set data-auto to open the booking modal immediately.
  if (script.getAttribute("data-auto")) setTimeout(function () { if (booking.active) openModal(); }, 0);

  // Per-service "Book" CTAs anywhere on the page: <button data-storecal-book
  // data-service="SERVICE_ID_OR_NAME">. Opens the widget preselected to that
  // service (skips to the staff step). When booking is inactive, calls instead.
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-storecal-book]");
    if (!t) return;
    e.preventDefault();
    if (!booking.active) { callStore(); return; }
    openModal({ service: t.getAttribute("data-service") || undefined });
  });

  // Once the shop's status is known, hide/relabel booking CTAs when inactive.
  function applyGate() {
    if (booking.active) return;
    if (booking.phone) trigger.textContent = "📞 Call " + booking.phone;
    else trigger.style.display = "none";
    // Relabel simple (text-only) "Book" CTAs on the host page. CTAs with child
    // nodes (e.g. rendered service cards) are left to their own renderer.
    var tel = telHref(booking.phone);
    Array.prototype.forEach.call(document.querySelectorAll("[data-storecal-book]"), function (el) {
      if (el === trigger || el.children.length) return;
      if (booking.phone) {
        el.textContent = "📞 Call " + booking.phone;
        if (el.tagName === "A") el.setAttribute("href", "tel:" + tel);
      } else {
        el.style.display = "none";
      }
    });
  }

  // Learn booking status up-front so CTAs reflect it before any interaction.
  fetch(api("/api/shop-config")).then(function (r) { return r.json(); }).then(function (d) {
    if (!d || d.error) return;
    cfg = d;
    booking.active = d.bookingActive !== false;
    booking.phone = (d.shop && d.shop.phone) || "";
    applyGate();
  }).catch(function () {});

  // Programmatic API for custom sites: StoreCalWidget.book("Service Name" | {service}).
  window.StoreCalWidget = {
    open: function () { if (!booking.active) return callStore(); openModal(); },
    book: function (arg) { if (!booking.active) return callStore(); openModal(typeof arg === "string" ? { service: arg } : arg); },
  };

  // ── State ──────────────────────────────────────────────────────────────────
  var cfg = null;                 // shop-config payload
  // provider = the chosen option ({_id:"any"} allowed); assigned = the concrete
  // staff member (set when a slot is picked, incl. the one chosen for "any").
  var state = { service: null, provider: null, assigned: null, addons: [], date: "", time: "" };
  function findProvider(id) { return (cfg && cfg.providers || []).filter(function (p) { return p._id === id; })[0] || null; }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function initials(name) { return String(name || "?").trim().slice(0, 1).toUpperCase(); }
  function fmtTime(hhmm) {
    var p = hhmm.split(":"), h = +p[0], m = p[1];
    var ap = h >= 12 ? "PM" : "AM", h12 = h % 12 || 12;
    return h12 + ":" + m + " " + ap;
  }
  function fmtDate(d) {
    try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); }
    catch (e) { return d; }
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); } // LOCAL date, not UTC
  function addDays(ds, n) { var d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); }

  function frame(stepLabel, bodyNode, opts) {
    opts = opts || {};
    wrap.className = "sc";        // reset width (calendar step opts into sc--wide)
    wrap.innerHTML = "";
    var head = el(
      '<div class="sc__head"><div class="sc__head-main"><div class="sc__shop">' + esc(cfg ? cfg.shop.name : "Book an appointment") +
      '</div><div class="sc__step">' + esc(stepLabel) + '</div></div>' +
      '<button class="sc__close" type="button">Close</button></div>'
    );
    head.querySelector(".sc__close").onclick = closeModal;
    wrap.appendChild(head);
    var body = document.createElement("div");
    body.className = "sc__body";
    if (opts.onBack) {
      var back = el('<button class="sc__back">← Back</button>');
      back.onclick = opts.onBack;
      body.appendChild(back);
    }
    body.appendChild(bodyNode);
    wrap.appendChild(body);
    if (opts.footer) {
      var foot = el('<div class="sc__foot"><div class="sc__foot-inner"></div></div>');
      foot.querySelector(".sc__foot-inner").appendChild(opts.footer);
      wrap.appendChild(foot);
    }
    wrap.appendChild(el('<div class="sc__pow">Powered by StoreCal</div>'));
  }

  function loading(msg) {
    var n = document.createElement("div");
    n.className = "sc__msg";
    n.textContent = msg || "Loading…";
    return n;
  }

  // Fallback shown if the modal is opened while membership is inactive.
  function renderUnavailable() {
    var body = el('<div class="sc-unavail"><div class="sc-unavail-t">Online booking is unavailable</div>' +
      '<div class="sc-unavail-s">' +
      (booking.phone ? "Give us a call and we’ll get you booked in." : "Please contact us to book your appointment.") +
      "</div></div>");
    if (booking.phone) body.appendChild(el('<a class="sc-callbtn" href="tel:' + telHref(booking.phone) + '">📞 Call ' + esc(booking.phone) + "</a>"));
    frame("Booking unavailable", body);
  }

  // ── Steps ────────────────────────────────────────────────────────────────
  // preselect (optional): a service id or name. When it matches, skip straight
  // to the staff step with that service already chosen.
  function start(preselect) {
    frame("Loading…", loading());
    fetch(api("/api/shop-config")).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error);
      cfg = d;
      booking.active = d.bookingActive !== false;
      booking.phone = (d.shop && d.shop.phone) || "";
      if (!booking.active) { renderUnavailable(); return; }
      var svc = preselect && (cfg.services || []).filter(function (s) {
        return s._id === preselect || (s.name || "").toLowerCase() === String(preselect).toLowerCase();
      })[0];
      if (svc) {
        state.service = svc; state.provider = null; state.assigned = null; state.addons = []; state.date = ""; state.time = "";
        // Deep-link straight to staff when there's nothing to add on the first
        // step; otherwise show the combined step with the service preselected.
        if ((cfg.addons || []).length) chooseService();
        else chooseProvider();
      } else {
        chooseService();
      }
    }).catch(function (e) {
      frame("", el('<div class="sc__err">Couldn\'t load booking. ' + esc(e.message) + "</div>"));
    });
  }

  // Combined first step: pick one service and, in the same view, toggle any
  // optional add-ons. A single docked "Continue" CTA advances to staff.
  function chooseService() {
    state.provider = null; state.assigned = null; state.date = ""; state.time = "";
    var hasAddons = (cfg.addons || []).length;
    var body = document.createElement("div");

    body.appendChild(el('<h3 class="sc__h">Choose a service</h3>'));
    var list = el('<div class="sc__list"></div>');
    if (!cfg.services.length) list.appendChild(el('<div class="sc__msg">No services available yet.</div>'));

    var cont = el('<button class="sc__btn">Continue</button>');
    function refresh() { cont.disabled = !state.service; }

    cfg.services.forEach(function (s) {
      var meta = (s.durationMin ? s.durationMin + " min" : "") + (s.price ? "  ·  " + esc(s.price) : "");
      var sel = state.service && state.service._id === s._id;
      var b = el('<button class="sc__opt' + (sel ? " sc__opt--sel" : "") + '"><span class="sc__opt-main">' + esc(s.name) +
        '</span><span class="sc__opt-meta">' + esc(meta) + "</span></button>");
      b.onclick = function () {
        state.service = s;
        var prev = list.querySelector(".sc__opt--sel");
        if (prev) prev.classList.remove("sc__opt--sel");
        b.classList.add("sc__opt--sel");
        refresh();
      };
      list.appendChild(b);
    });
    body.appendChild(list);

    if (hasAddons) {
      body.appendChild(el('<h3 class="sc__h" style="margin-top:22px">Add-ons <span class="sc__h-opt">(optional)</span></h3>'));
      var grid = el('<div class="sc__addons"></div>');
      var selected = {};
      (state.addons || []).forEach(function (a) { selected[a.name] = a; });
      (cfg.addons || []).forEach(function (a) {
        var on = !!selected[a.name];
        var b = el('<button type="button" class="sc__addon' + (on ? " sc__addon--on" : "") + '">' +
          '<span class="sc__addon-name">' + esc(a.name) + "</span>" +
          (a.price ? '<span class="sc__addon-price">+' + esc(a.price) + "</span>" : "") + "</button>");
        b.onclick = function () {
          if (selected[a.name]) { delete selected[a.name]; b.classList.remove("sc__addon--on"); }
          else { selected[a.name] = { name: a.name, price: a.price }; b.classList.add("sc__addon--on"); }
        };
        grid.appendChild(b);
      });
      body.appendChild(grid);
      cont.onclick = function () {
        if (!state.service) return;
        state.addons = Object.keys(selected).map(function (k) { return selected[k]; });
        chooseProvider();
      };
    } else {
      cont.onclick = function () { if (state.service) chooseProvider(); };
    }

    refresh();
    frame("Service", body, { footer: cont });
  }

  function chooseProvider() {
    var offering = cfg.providers.filter(function (p) {
      return p.serviceIds && p.serviceIds.indexOf(state.service._id) !== -1;
    });
    var staff = offering.length ? offering : cfg.providers; // fall back to all if none tagged

    var body = document.createElement("div");
    body.appendChild(el('<h3 class="sc__h">Choose a team member</h3>'));
    var list = el('<div class="sc__list"></div>');

    // "Any available" first (the default-friendly choice): shows every open time
    // across the team and assigns whoever is free when a slot is picked.
    var anyB = el('<button class="sc__opt sc__opt--staff"><span class="sc__av sc__av--any">★</span>' +
      '<span class="sc__opt-text"><span class="sc__opt-main">Any available</span>' +
      '<span class="sc__opt-sub">First open time with any team member</span></span></button>');
    anyB.onclick = function () { state.provider = { _id: "any", name: "Any available" }; state.assigned = null; chooseWhen(); };
    list.appendChild(anyB);

    if (!staff.length) list.appendChild(el('<div class="sc__msg">No one is available for this service.</div>'));
    staff.forEach(function (p) {
      var b = el('<button class="sc__opt sc__opt--staff"><span class="sc__av"></span>' +
        '<span class="sc__opt-text"><span class="sc__opt-main">' + esc(p.name) + "</span>" +
        (p.bio ? '<span class="sc__opt-sub">' + esc(p.bio) + "</span>" : "") + "</span></button>");
      var av = b.querySelector(".sc__av");
      if (p.photo) { av.style.backgroundImage = "url(" + p.photo + ")"; av.style.backgroundSize = "cover"; av.style.backgroundPosition = "center"; }
      else { av.textContent = initials(p.name); }
      b.onclick = function () { state.provider = p; state.assigned = null; chooseWhen(); };
      list.appendChild(b);
    });
    body.appendChild(list);
    frame("Team member", body, { onBack: chooseService });
  }

  // Date & time: a month calendar (left) + open timeslots for the chosen day (right).
  function chooseWhen() {
    var today = todayStr();
    var provAv = null, shopAv = null;      // weekly schedules for graying closed days
    var startFrom = state.date && state.date >= today ? state.date : today;
    var view = new Date(startFrom + "T00:00:00"); // month being shown
    state.date = null;                     // require an explicit pick
    var calCollapsed = false;              // mobile-only: collapse to a summary bar after a day is picked

    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var DOW = ["S", "M", "T", "W", "T", "F", "S"];

    var body = document.createElement("div");
    body.appendChild(el('<h3 class="sc__h">Select a date &amp; time</h3>'));
    var panes = el('<div class="sc__panes"></div>');
    var calPane = el('<div class="sc__cal"></div>');
    var timePane = el('<div class="sc__times"></div>');
    panes.appendChild(calPane); panes.appendChild(timePane);
    body.appendChild(panes);
    body.appendChild(el('<div class="sc__tz">Times are the shop’s local time.</div>'));
    frame("Date & time", body, { onBack: chooseProvider });
    wrap.classList.add("sc--wide");

    // Open ranges a schedule allows on a date (null = schedule not set → no limit).
    function ranges(av, ds) {
      if (!av || !av.configured) return null;
      var ov = (av.overrides || []).filter(function (o) { return o.date === ds; })[0];
      if (ov) return ov.closed ? [] : (ov.ranges || []);
      var wd = new Date(ds + "T00:00:00").getDay();
      var day = (av.weekA || []).filter(function (d) { return d.weekday === wd; })[0];
      return day && day.enabled ? day.ranges : [];
    }
    function isOpenDay(ds) {
      if (ds < today) return false;
      var p = ranges(provAv, ds), s = ranges(shopAv, ds);
      return (p === null || p.length > 0) && (s === null || s.length > 0);
    }

    function renderCal() {
      calPane.className = "sc__cal" + (calCollapsed ? " sc__cal--collapsed" : "");
      calPane.innerHTML = "";
      var y = view.getFullYear(), m = view.getMonth();

      // Mobile summary bar: tap to expand/collapse the month grid.
      var toggle = el('<button type="button" class="sc__cal-toggle"><span>' +
        (state.date ? esc(fmtDate(state.date)) : "Select a date") +
        '</span><span class="sc__cal-toggle-hint">' + (calCollapsed ? "Change" : "Done") +
        ' <span class="sc__cal-caret">▾</span></span></button>');
      toggle.onclick = function () { calCollapsed = !calCollapsed; renderCal(); };
      calPane.appendChild(toggle);

      var calBody = el('<div class="sc__cal-body"></div>');
      var nav = el('<div class="sc__cal-nav"><button class="sc__cal-arrow" data-d="prev" aria-label="Previous month">‹</button>' +
        '<span class="sc__cal-title">' + MONTHS[m] + " " + y + '</span>' +
        '<button class="sc__cal-arrow" data-d="next" aria-label="Next month">›</button></div>');
      // Don't page before the current month.
      var prevBtn = nav.querySelector('[data-d="prev"]');
      var atCurrentMonth = (y === new Date().getFullYear() && m === new Date().getMonth());
      if (atCurrentMonth) prevBtn.disabled = true;
      prevBtn.onclick = function () { view = new Date(y, m - 1, 1); renderCal(); };
      nav.querySelector('[data-d="next"]').onclick = function () { view = new Date(y, m + 1, 1); renderCal(); };
      calBody.appendChild(nav);

      var grid = el('<div class="sc__cal-grid"></div>');
      DOW.forEach(function (w) { grid.appendChild(el('<span class="sc__cal-dow">' + w + "</span>")); });
      var startDow = new Date(y, m, 1).getDay();
      var count = new Date(y, m + 1, 0).getDate();
      for (var i = 0; i < startDow; i++) grid.appendChild(el('<span class="sc__cal-empty"></span>'));
      for (var day = 1; day <= count; day++) {
        var ds = y + "-" + pad(m + 1) + "-" + pad(day);
        var open = isOpenDay(ds);
        var cls = "sc__cal-day" + (open ? "" : " sc__cal-day--off") +
          (ds === today ? " sc__cal-day--today" : "") + (ds === state.date ? " sc__cal-day--sel" : "");
        var cell = el('<button class="' + cls + '"><span class="sc__cal-n">' + day + "</span></button>");
        if (!open) { cell.disabled = true; }
        else {
          cell.querySelector(".sc__cal-n").appendChild(el('<i class="sc__cal-dot"></i>'));
          (function (dsv) { cell.onclick = function () { state.date = dsv; calCollapsed = true; renderCal(); loadTimes(); }; })(ds);
        }
        grid.appendChild(cell);
      }
      calBody.appendChild(grid);
      calPane.appendChild(calBody);
    }

    function loadTimes(opts) {
      opts = opts || {};
      timePane.innerHTML = "";
      if (!state.date) { timePane.appendChild(el('<div class="sc__times-empty">Pick a day to see open times.</div>')); return; }
      var hd = el('<div class="sc__times-head"><div class="sc__times-day">' + esc(fmtDate(state.date)) +
        '</div><div class="sc__times-sub">pick a start time</div></div>');
      timePane.appendChild(hd);
      var listWrap = el('<div class="sc__times-list"></div>');
      listWrap.appendChild(loading("Finding open times…"));
      timePane.appendChild(listWrap);
      var dur = state.service.durationMin || 45;
      var isAny = state.provider._id === "any";
      var url = api("/api/availability/" + state.provider._id + "/slots") + "&date=" + state.date + "&durationMin=" + dur +
        (isAny ? "&serviceId=" + encodeURIComponent(state.service._id) : "");
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          listWrap.innerHTML = "";
          var slots = (d && d.slots) || [];
          // Hide times already past when booking for today (uses the viewer's clock).
          if (state.date === todayStr()) {
            var nm = new Date().getHours() * 60 + new Date().getMinutes();
            slots = slots.filter(function (t) { var p = t.split(":"); return (+p[0]) * 60 + (+p[1]) > nm; });
          }
          if (!slots.length) {
            // Today's remaining slots may all be in the past — jump to the next
            // open day that actually has availability (bounded so it can't loop).
            var hops = opts.hops || 0;
            if (opts.auto && hops < 21) {
              var next = addDays(state.date, 1), g = 0;
              while (g++ < 90 && !isOpenDay(next)) next = addDays(next, 1);
              if (isOpenDay(next)) { state.date = next; view = new Date(next + "T00:00:00"); renderCal(); loadTimes({ auto: true, hops: hops + 1 }); return; }
            }
            listWrap.appendChild(el('<div class="sc__times-empty">No open times this day.</div>'));
            return;
          }
          var byTime = (d && d.providersByTime) || {};
          slots.forEach(function (t) {
            var b = el('<button class="sc__slot sc__slot--row">' + esc(fmtTime(t)) + "</button>");
            b.onclick = function () {
              state.time = t;
              // Resolve the concrete staff member for the booking.
              if (isAny) {
                var pid = (byTime[t] || [])[0];
                var prov = pid && findProvider(pid);
                state.assigned = prov ? { _id: prov._id, name: prov.name } : null;
              } else {
                state.assigned = { _id: state.provider._id, name: state.provider.name };
              }
              contact();
            };
            listWrap.appendChild(b);
          });
        })
        .catch(function () {
          listWrap.innerHTML = "";
          listWrap.appendChild(el('<div class="sc__err">Couldn\'t load times. Please try again.</div>'));
        });
    }

    renderCal(); loadTimes(); // initial (skeleton) render before schedules load

    Promise.all([
      fetch(api("/api/availability/" + state.provider._id)).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(api("/api/availability/shop")).then(function (r) { return r.json(); }).catch(function () { return null; }),
    ]).then(function (res) {
      provAv = res[0]; shopAv = res[1];
      // Auto-select the first open day (within ~60 days) so times show immediately.
      var probe = startFrom;
      for (var i = 0; i < 60; i++) {
        if (isOpenDay(probe)) { state.date = probe; view = new Date(probe + "T00:00:00"); calCollapsed = true; break; }
        probe = addDays(probe, 1);
      }
      renderCal(); loadTimes({ auto: true });
    });
  }

  function contact() {
    var prov = state.assigned || state.provider;
    // Pet-vertical fields (dog name / breed / weight) are gated by business type
    // so only grooming shops collect them. Driven by the shop's booking config.
    var booking = (cfg.shop && cfg.shop.booking) || {};
    var isPet = cfg.shop.businessType === "grooming" || !!booking.pet;
    var addonLine = (state.addons || []).length
      ? "<br>Add-ons: " + state.addons.map(function (a) { return esc(a.name) + (a.price ? " (" + esc(a.price) + ")" : ""); }).join(", ")
      : "";
    var body = document.createElement("div");
    body.appendChild(el(
      '<div class="sc__summary"><b>' + esc(state.service.name) + "</b> with <b>" + esc(prov.name) +
      "</b><br>" + esc(fmtDate(state.date)) + " at <b>" + esc(fmtTime(state.time)) + "</b>" + addonLine + "</div>"
    ));
    var petFields = isPet ?
      '<label class="sc__field"><span class="sc__label">Pet’s name</span><input class="sc__input" id="sc-pet-name"></label>' +
      '<label class="sc__field"><span class="sc__label">Breed</span><input class="sc__input" id="sc-pet-breed"></label>' +
      '<label class="sc__field"><span class="sc__label">Weight</span>' +
        '<select class="sc__input sc__select" id="sc-pet-weight">' +
          '<option value="">Select weight…</option>' +
          '<option>1–40 lbs</option><option>40–65 lbs</option>' +
          '<option>65–100 lbs</option><option>100+ lbs</option>' +
        "</select></label>" : "";
    var form = el(
      "<div>" + petFields +
      '<label class="sc__field"><span class="sc__label">Your name</span><input class="sc__input" id="sc-name" autocomplete="name"></label>' +
      '<label class="sc__field"><span class="sc__label">Phone</span><input class="sc__input" id="sc-phone" type="tel" autocomplete="tel"></label>' +
      '<label class="sc__field"><span class="sc__label">Email</span><input class="sc__input" id="sc-email" type="email" autocomplete="email"></label>' +
      "</div>"
    );
    var btn = el('<button class="sc__btn">Confirm booking</button>');
    var err = el('<div class="sc__err" style="display:none"></div>');
    btn.onclick = function () {
      var name = form.querySelector("#sc-name").value.trim();
      var phone = form.querySelector("#sc-phone").value.trim();
      var email = form.querySelector("#sc-email").value.trim();
      if (!name) { err.textContent = "Please enter your name."; err.style.display = "block"; return; }
      var pet = null;
      if (isPet) {
        pet = {
          name: form.querySelector("#sc-pet-name").value.trim(),
          breed: form.querySelector("#sc-pet-breed").value.trim(),
          weight: form.querySelector("#sc-pet-weight").value,
        };
        if (!pet.name) { err.textContent = "Please enter your pet’s name."; err.style.display = "block"; return; }
        if (!pet.weight) { err.textContent = "Please select your pet’s weight."; err.style.display = "block"; return; }
      }
      err.style.display = "none"; btn.disabled = true; btn.textContent = "Booking…";
      var payload = {
        key: STORE_KEY,
        providerId: (state.assigned || state.provider)._id,
        service: state.service.name,
        durationMin: state.service.durationMin || 45,
        dateKey: state.date,
        timeValue: state.time,
        addons: state.addons || [],
        client: { name: name, phone: phone, email: email },
      };
      if (pet) payload.pet = pet;
      fetch(API + "/api/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || "Could not book");
          done();
        })
        .catch(function (e) {
          btn.disabled = false; btn.textContent = "Confirm booking";
          err.textContent = e.message; err.style.display = "block";
        });
    };
    body.appendChild(form); body.appendChild(btn); body.appendChild(err);
    frame("Your details", body, { onBack: chooseWhen });
  }

  function done() {
    var body = el(
      '<div class="sc__done"><div class="sc__check">✓</div>' +
      '<div class="sc__done-t">You\'re booked!</div>' +
      '<div class="sc__done-s">' + esc(state.service.name) + " with " + esc((state.assigned || state.provider).name) + "<br>" +
      esc(fmtDate(state.date)) + " at " + esc(fmtTime(state.time)) + "</div></div>"
    );
    var actions = el('<div class="sc__done-actions"></div>');
    var cal = el('<button class="sc__btn">Add to calendar</button>');
    cal.onclick = downloadIcs;
    var close = el('<button class="sc__btn sc__btn--ghost">Close</button>');
    close.onclick = closeModal;
    actions.appendChild(cal); actions.appendChild(close);
    body.appendChild(actions);
    frame("Confirmed", body);
  }

  // Build + download an .ics file for the booked appointment (works with Apple
  // Calendar, Google Calendar import, Outlook, etc.).
  function icsEsc(s) { return String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n"); }
  function icsLocal(dateStr, timeStr, addMin) {
    var p = dateStr.split("-").map(Number), t = timeStr.split(":").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2], t[0], t[1] + (addMin || 0));
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00";
  }
  function icsStamp() {
    var d = new Date();
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }
  function downloadIcs() {
    var dur = state.service.durationMin || 45;
    var ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StoreCal//Booking//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + Date.now() + "@storecal",
      "DTSTAMP:" + icsStamp(),
      "DTSTART:" + icsLocal(state.date, state.time, 0),
      "DTEND:" + icsLocal(state.date, state.time, dur),
      "SUMMARY:" + icsEsc(state.service.name + " · " + cfg.shop.name),
      "LOCATION:" + icsEsc(cfg.shop.address || ""),
      "DESCRIPTION:" + icsEsc("Appointment with " + (state.assigned || state.provider).name),
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    var url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url; a.download = "appointment.ics";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  // Widget renders inside the modal, which opens from the trigger button.
})();
