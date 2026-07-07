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
    "max-width:440px;margin:0 auto;border:1px solid #e6e8ec;border-radius:16px;overflow:hidden;",
    "background:#fff;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.06)}",
    ".sc--wide{max-width:720px}",
    ".sc__head{padding:18px 20px;border-bottom:1px solid #eef0f3}",
    ".sc__shop{font-size:16px;font-weight:700;letter-spacing:-.01em}",
    ".sc__step{font-size:12px;color:#8a9099;margin-top:2px}",
    ".sc__body{padding:16px 20px 20px}",
    ".sc__back{background:none;border:0;color:#8a9099;font-size:13px;cursor:pointer;padding:0;margin-bottom:12px}",
    ".sc__back:hover{color:#111}",
    ".sc__h{font-size:14px;font-weight:600;margin:0 0 12px}",
    ".sc__list{display:flex;flex-direction:column;gap:8px}",
    ".sc__opt{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;",
    "padding:13px 14px;border:1px solid #e6e8ec;border-radius:11px;background:#fff;cursor:pointer;font-size:14px;font-family:inherit;color:#111}",
    ".sc__opt:hover{border-color:" + ACCENT + ";background:#f7f9ff}",
    ".sc__opt-main{font-weight:600;display:block}",
    ".sc__opt-sub{font-size:12px;color:#8a9099;line-height:1.45;display:block}",
    ".sc__opt-meta{font-size:13px;color:#5a6069;white-space:nowrap}",
    ".sc__av{width:38px;height:38px;border-radius:50%;background:" + ACCENT + "22;color:" + ACCENT + ";",
    "display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex:none}",
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
    ".sc__cal-day{position:relative;aspect-ratio:1;border:0;background:none;border-radius:50%;cursor:pointer;font-size:13px;font-family:inherit;color:#1a2b4a;font-weight:600}",
    ".sc__cal-day:hover{background:#e9edf5}",
    ".sc__cal-day--off{color:#c2c7cf;cursor:default;font-weight:500}",
    ".sc__cal-day--off:hover{background:none}",
    ".sc__cal-day--sel{background:" + ACCENT + ";color:#fff}",
    ".sc__cal-day--sel:hover{background:" + ACCENT + "}",
    ".sc__cal-dot{position:absolute;bottom:5px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:" + ACCENT + "}",
    ".sc__cal-day--sel .sc__cal-dot{background:#fff}",
    ".sc__times-head{margin-bottom:10px}",
    ".sc__times-day{font-size:14px;font-weight:700}",
    ".sc__times-sub{font-size:12px;color:#8a9099;margin-top:2px}",
    ".sc__times-list{display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;padding-right:4px}",
    ".sc__slot--row{width:100%;text-align:center;padding:12px;font-size:14px;font-weight:600}",
    ".sc__times-empty{font-size:13px;color:#8a9099;padding:14px 0}",
    ".sc__tz{font-size:11.5px;color:#9aa0a8;margin-top:14px}",
    "@media(max-width:640px){.sc__panes{grid-template-columns:1fr;gap:14px}}",
    ".sc__slot{padding:10px 6px;border:1px solid #e6e8ec;border-radius:9px;background:#fff;cursor:pointer;font-size:13px;font-family:inherit;color:#111}",
    ".sc__slot:hover{border-color:" + ACCENT + ";background:#f7f9ff;color:" + ACCENT + "}",
    ".sc__field{display:block;margin-bottom:12px}",
    ".sc__label{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px;color:#3a4049}",
    ".sc__input{width:100%;padding:11px 12px;border:1px solid #dfe2e7;border-radius:10px;font-size:14px;font-family:inherit;color:#111}",
    ".sc__input:focus{outline:none;border-color:" + ACCENT + "}",
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
    ".sc__pow{text-align:center;font-size:11px;color:#b3b8c0;padding:10px}",
  ].join("");
  root.appendChild(style);

  var wrap = document.createElement("div");
  wrap.className = "sc";
  root.appendChild(wrap);

  // ── State ──────────────────────────────────────────────────────────────────
  var cfg = null;                 // shop-config payload
  var state = { service: null, provider: null, date: "", time: "" };

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
      '<div class="sc__head"><div class="sc__shop">' + esc(cfg ? cfg.shop.name : "Book an appointment") +
      '</div><div class="sc__step">' + esc(stepLabel) + "</div></div>"
    );
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
    wrap.appendChild(el('<div class="sc__pow">Powered by StoreCal</div>'));
  }

  function loading(msg) {
    var n = document.createElement("div");
    n.className = "sc__msg";
    n.textContent = msg || "Loading…";
    return n;
  }

  // ── Steps ────────────────────────────────────────────────────────────────
  function start() {
    frame("Loading…", loading());
    fetch(api("/api/shop-config")).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error);
      cfg = d;
      chooseService();
    }).catch(function (e) {
      frame("", el('<div class="sc__err">Couldn\'t load booking. ' + esc(e.message) + "</div>"));
    });
  }

  function chooseService() {
    state.service = null; state.provider = null; state.date = ""; state.time = "";
    var body = document.createElement("div");
    body.appendChild(el('<h3 class="sc__h">Choose a service</h3>'));
    var list = el('<div class="sc__list"></div>');
    if (!cfg.services.length) list.appendChild(el('<div class="sc__msg">No services available yet.</div>'));
    cfg.services.forEach(function (s) {
      var meta = (s.durationMin ? s.durationMin + " min" : "") + (s.price ? "  ·  " + esc(s.price) : "");
      var b = el('<button class="sc__opt"><span class="sc__opt-main">' + esc(s.name) +
        '</span><span class="sc__opt-meta">' + esc(meta) + "</span></button>");
      b.onclick = function () { state.service = s; chooseProvider(); };
      list.appendChild(b);
    });
    body.appendChild(list);
    frame("Step 1 of 4 · Service", body);
  }

  function chooseProvider() {
    var offering = cfg.providers.filter(function (p) {
      return p.serviceIds && p.serviceIds.indexOf(state.service._id) !== -1;
    });
    var staff = offering.length ? offering : cfg.providers; // fall back to all if none tagged

    var body = document.createElement("div");
    body.appendChild(el('<h3 class="sc__h">Choose a team member</h3>'));
    var list = el('<div class="sc__list"></div>');
    if (!staff.length) list.appendChild(el('<div class="sc__msg">No one is available for this service.</div>'));
    staff.forEach(function (p) {
      var b = el('<button class="sc__opt sc__opt--staff"><span class="sc__av">' + esc(initials(p.name)) +
        '</span><span class="sc__opt-text"><span class="sc__opt-main">' + esc(p.name) + "</span>" +
        (p.bio ? '<span class="sc__opt-sub">' + esc(p.bio) + "</span>" : "") + "</span></button>");
      b.onclick = function () { state.provider = p; chooseWhen(); };
      list.appendChild(b);
    });
    body.appendChild(list);
    frame("Step 2 of 4 · Team member", body, { onBack: chooseService });
  }

  // Date & time: a month calendar (left) + open timeslots for the chosen day (right).
  function chooseWhen() {
    var today = todayStr();
    var provAv = null, shopAv = null;      // weekly schedules for graying closed days
    var startFrom = state.date && state.date >= today ? state.date : today;
    var view = new Date(startFrom + "T00:00:00"); // month being shown
    state.date = null;                     // require an explicit pick

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
    frame("Step 3 of 4 · Date & time", body, { onBack: chooseProvider });
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
      calPane.innerHTML = "";
      var y = view.getFullYear(), m = view.getMonth();
      var nav = el('<div class="sc__cal-nav"><button class="sc__cal-arrow" data-d="prev" aria-label="Previous month">‹</button>' +
        '<span class="sc__cal-title">' + MONTHS[m] + " " + y + '</span>' +
        '<button class="sc__cal-arrow" data-d="next" aria-label="Next month">›</button></div>');
      // Don't page before the current month.
      var prevBtn = nav.querySelector('[data-d="prev"]');
      var atCurrentMonth = (y === new Date().getFullYear() && m === new Date().getMonth());
      if (atCurrentMonth) prevBtn.disabled = true;
      prevBtn.onclick = function () { view = new Date(y, m - 1, 1); renderCal(); };
      nav.querySelector('[data-d="next"]').onclick = function () { view = new Date(y, m + 1, 1); renderCal(); };
      calPane.appendChild(nav);

      var grid = el('<div class="sc__cal-grid"></div>');
      DOW.forEach(function (w) { grid.appendChild(el('<span class="sc__cal-dow">' + w + "</span>")); });
      var startDow = new Date(y, m, 1).getDay();
      var count = new Date(y, m + 1, 0).getDate();
      for (var i = 0; i < startDow; i++) grid.appendChild(el('<span class="sc__cal-empty"></span>'));
      for (var day = 1; day <= count; day++) {
        var ds = y + "-" + pad(m + 1) + "-" + pad(day);
        var open = isOpenDay(ds);
        var cls = "sc__cal-day" + (open ? "" : " sc__cal-day--off") + (ds === state.date ? " sc__cal-day--sel" : "");
        var cell = el('<button class="' + cls + '">' + day + "</button>");
        if (!open) { cell.disabled = true; }
        else {
          cell.appendChild(el('<i class="sc__cal-dot"></i>'));
          (function (dsv) { cell.onclick = function () { state.date = dsv; renderCal(); loadTimes(); }; })(ds);
        }
        grid.appendChild(cell);
      }
      calPane.appendChild(grid);
    }

    function loadTimes() {
      timePane.innerHTML = "";
      if (!state.date) { timePane.appendChild(el('<div class="sc__times-empty">Pick a day to see open times.</div>')); return; }
      var hd = el('<div class="sc__times-head"><div class="sc__times-day">' + esc(fmtDate(state.date)) +
        '</div><div class="sc__times-sub">pick a start time</div></div>');
      timePane.appendChild(hd);
      var listWrap = el('<div class="sc__times-list"></div>');
      listWrap.appendChild(loading("Finding open times…"));
      timePane.appendChild(listWrap);
      var dur = state.service.durationMin || 45;
      fetch(api("/api/availability/" + state.provider._id + "/slots") + "&date=" + state.date + "&durationMin=" + dur)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          listWrap.innerHTML = "";
          var slots = (d && d.slots) || [];
          if (!slots.length) { listWrap.appendChild(el('<div class="sc__times-empty">No open times this day.</div>')); return; }
          slots.forEach(function (t) {
            var b = el('<button class="sc__slot sc__slot--row">' + esc(fmtTime(t)) + "</button>");
            b.onclick = function () { state.time = t; contact(); };
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
        if (isOpenDay(probe)) { state.date = probe; view = new Date(probe + "T00:00:00"); break; }
        probe = addDays(probe, 1);
      }
      renderCal(); loadTimes();
    });
  }

  function contact() {
    var body = document.createElement("div");
    body.appendChild(el(
      '<div class="sc__summary"><b>' + esc(state.service.name) + "</b> with <b>" + esc(state.provider.name) +
      "</b><br>" + esc(fmtDate(state.date)) + " at <b>" + esc(fmtTime(state.time)) + "</b></div>"
    ));
    var form = el(
      '<div>' +
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
      err.style.display = "none"; btn.disabled = true; btn.textContent = "Booking…";
      fetch(API + "/api/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: STORE_KEY,
          providerId: state.provider._id,
          service: state.service.name,
          durationMin: state.service.durationMin || 45,
          dateKey: state.date,
          timeValue: state.time,
          client: { name: name, phone: phone, email: email },
        }),
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
    frame("Step 4 of 4 · Your details", body, { onBack: chooseWhen });
  }

  function done() {
    var body = el(
      '<div class="sc__done"><div class="sc__check">✓</div>' +
      '<div class="sc__done-t">You\'re booked!</div>' +
      '<div class="sc__done-s">' + esc(state.service.name) + " with " + esc(state.provider.name) + "<br>" +
      esc(fmtDate(state.date)) + " at " + esc(fmtTime(state.time)) + "</div></div>"
    );
    var again = el('<button class="sc__btn" style="margin-top:16px">Book another</button>');
    again.onclick = chooseService;
    body.appendChild(again);
    frame("Confirmed", body);
  }

  start();
})();
