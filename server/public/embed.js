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
    ".sc__opt-main{font-weight:600}",
    ".sc__opt-sub{font-size:12px;color:#8a9099;margin-top:2px}",
    ".sc__opt-meta{font-size:13px;color:#5a6069;white-space:nowrap}",
    ".sc__av{width:34px;height:34px;border-radius:50%;background:" + ACCENT + "22;color:" + ACCENT + ";",
    "display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex:none}",
    ".sc__opt-row{display:flex;align-items:center;gap:11px}",
    ".sc__slots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
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
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function frame(stepLabel, bodyNode, opts) {
    opts = opts || {};
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
      var b = el('<button class="sc__opt"><span class="sc__opt-row"><span class="sc__av">' + esc(initials(p.name)) +
        '</span><span><span class="sc__opt-main">' + esc(p.name) + "</span>" +
        (p.bio ? '<span class="sc__opt-sub">' + esc(p.bio) + "</span>" : "") + "</span></span></button>");
      b.onclick = function () { state.provider = p; chooseDate(); };
      list.appendChild(b);
    });
    body.appendChild(list);
    frame("Step 2 of 4 · Team member", body, { onBack: chooseService });
  }

  function chooseDate() {
    var body = document.createElement("div");
    body.appendChild(el('<h3 class="sc__h">Pick a day</h3>'));
    var field = el('<label class="sc__field"><span class="sc__label">Date</span>' +
      '<input class="sc__input" type="date" min="' + todayStr() + '"></label>');
    var input = field.querySelector("input");
    input.value = state.date || todayStr();
    input.onchange = function () { state.date = input.value; chooseTime(); };
    body.appendChild(field);
    var go = el('<button class="sc__btn">See times</button>');
    go.onclick = function () { state.date = input.value; chooseTime(); };
    body.appendChild(go);
    frame("Step 3 of 4 · Date", body, { onBack: chooseProvider });
  }

  function chooseTime() {
    if (!state.date) { chooseDate(); return; }
    var body = document.createElement("div");
    body.appendChild(el('<h3 class="sc__h">' + esc(fmtDate(state.date)) + "</h3>"));
    var holder = el('<div class="sc__slots"></div>');
    body.appendChild(loading("Finding open times…"));
    frame("Step 3 of 4 · Time", body, { onBack: chooseDate });

    var dur = state.service.durationMin || 45;
    fetch(api("/api/availability/" + state.provider._id + "/slots") + "&date=" + state.date + "&durationMin=" + dur)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        body.innerHTML = "";
        body.appendChild(el('<h3 class="sc__h">' + esc(fmtDate(state.date)) + "</h3>"));
        var slots = (d && d.slots) || [];
        if (!slots.length) {
          body.appendChild(el('<div class="sc__msg">No open times on this day. Try another date.</div>'));
          var pick = el('<button class="sc__btn">Choose another day</button>');
          pick.onclick = chooseDate; body.appendChild(pick);
        } else {
          slots.forEach(function (t) {
            var b = el('<button class="sc__slot">' + esc(fmtTime(t)) + "</button>");
            b.onclick = function () { state.time = t; contact(); };
            holder.appendChild(b);
          });
          body.appendChild(holder);
        }
        frame("Step 3 of 4 · Time", body, { onBack: chooseDate });
      })
      .catch(function () {
        body.innerHTML = "";
        body.appendChild(el('<div class="sc__err">Couldn\'t load times. Please try again.</div>'));
        frame("Step 3 of 4 · Time", body, { onBack: chooseDate });
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
    frame("Step 4 of 4 · Your details", body, { onBack: chooseTime });
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
