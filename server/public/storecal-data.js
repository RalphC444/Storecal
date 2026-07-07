/* StoreCal content sync — render your live services & staff on your own website.
 *
 *   <script src="https://YOUR-DOMAIN/storecal-data.js" data-store="sc_xxx"></script>
 *
 * Then mark up where you want the content:
 *   <div data-storecal="services"></div>   ← service cards (name, description, price)
 *   <div data-storecal="staff"></div>      ← staff (name, bio) for an About section
 *   <span data-storecal-text="shop.name"></span>     (also shop.phone, shop.address)
 *
 * Or render it yourself:  StoreCal.ready(function (data) { ... data.services, data.providers ... });
 *
 * Data comes from the public, CORS-open GET /api/shop-config?key=<store> endpoint,
 * so your site always reflects what's in StoreCal.
 */
(function () {
  "use strict";
  var script = document.currentScript || (function () {
    var s = document.querySelectorAll("script[data-store]"); return s[s.length - 1];
  })();
  if (!script) return;
  var KEY = script.getAttribute("data-store");
  if (!KEY) { console.error("[StoreCal] storecal-data.js needs data-store=\"<store key>\""); return; }
  var API = new URL(script.src).origin;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtDur(m) { if (!m) return ""; var h = Math.floor(m / 60), mm = m % 60; return h ? (h + "h" + (mm ? " " + mm + "m" : "")) : (mm + " min"); }

  var StoreCal = { data: null, _cbs: [], ready: function (cb) { if (this.data) cb(this.data); else this._cbs.push(cb); } };
  window.StoreCal = StoreCal;

  function bindText(data) {
    document.querySelectorAll("[data-storecal-text]").forEach(function (el) {
      var v = data; el.getAttribute("data-storecal-text").split(".").forEach(function (k) { v = v && v[k]; });
      if (v != null) el.textContent = v;
    });
  }
  function renderServices(data) {
    document.querySelectorAll('[data-storecal="services"]').forEach(function (host) {
      host.classList.add("scd-grid");
      host.innerHTML = (data.services || []).map(function (s) {
        var meta = [fmtDur(s.durationMin), s.price].filter(Boolean).join(" · ");
        // The Book button deep-links into the widget (embed.js) preselected to
        // this service — it opens straight to the staff step.
        return '<div class="scd-card"><h3 class="scd-card__name">' + esc(s.name) + "</h3>" +
          (s.description ? '<p class="scd-card__desc">' + esc(s.description) + "</p>" : "") +
          (meta ? '<div class="scd-card__meta">' + esc(meta) + "</div>" : "") +
          '<button class="scd-card__book" type="button" data-storecal-book data-service="' + esc(s.id || s._id) + '">Book</button>' +
          "</div>";
      }).join("");
    });
  }
  function renderStaff(data) {
    document.querySelectorAll('[data-storecal="staff"]').forEach(function (host) {
      host.classList.add("scd-grid");
      host.innerHTML = (data.providers || []).map(function (p) {
        var av = p.photo
          ? '<span class="scd-person__av" style="background-image:url(' + p.photo + ');background-size:cover;background-position:center"></span>'
          : '<span class="scd-person__av">' + esc((p.name || "?").slice(0, 1).toUpperCase()) + "</span>";
        return '<div class="scd-person">' + av +
          '<div><div class="scd-person__name">' + esc(p.name) + "</div>" +
          (p.bio ? '<div class="scd-person__bio">' + esc(p.bio) + "</div>" : "") + "</div></div>";
      }).join("");
    });
  }

  // Light default styling — override freely from your own CSS.
  var style = document.createElement("style");
  style.textContent = [
    ".scd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}",
    ".scd-card{border:1px solid #e6e8ec;border-radius:12px;padding:18px;display:flex;flex-direction:column}",
    ".scd-card__name{margin:0 0 6px;font-size:17px}",
    ".scd-card__desc{margin:0 0 10px;color:#5a6069;font-size:14px;line-height:1.5}",
    ".scd-card__meta{font-weight:600}",
    ".scd-card__book{margin-top:14px;align-self:flex-start;background:#2563eb;color:#fff;border:0;border-radius:9px;padding:9px 18px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer}",
    ".scd-card__book:hover{filter:brightness(.95)}",
    ".scd-person{display:flex;gap:12px;align-items:center}",
    ".scd-person__av{width:44px;height:44px;border-radius:50%;background:#e8eefc;color:#2563eb;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}",
    ".scd-person__name{font-weight:700}",
    ".scd-person__bio{color:#5a6069;font-size:14px}",
  ].join("");
  document.head.appendChild(style);

  fetch(API + "/api/shop-config?key=" + encodeURIComponent(KEY))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) throw new Error(data.error);
      StoreCal.data = data;
      bindText(data); renderServices(data); renderStaff(data);
      StoreCal._cbs.forEach(function (cb) { try { cb(data); } catch (e) { /* ignore */ } });
      document.dispatchEvent(new CustomEvent("storecal:loaded", { detail: data }));
    })
    .catch(function (e) { console.error("[StoreCal] couldn't load content:", e.message); });
})();
