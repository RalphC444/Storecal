/* StoreCal content sync — render your live services & staff on your own website.
 *
 *   <script src="https://YOUR-DOMAIN/storecal-data.js" data-store="sc_xxx"></script>
 *
 * Then mark up where you want the content:
 *   <div data-storecal="services"></div>   ← service cards (name, description, price)
 *   <div data-storecal="staff"></div>      ← staff (name, bio) for an About section
 *   <div data-storecal="gallery"></div>    ← photo gallery (grooming / salon work)
 *   <div data-storecal="staff-gallery"></div>            ← every staff member's photos, grouped by name
 *   <div data-storecal="staff-gallery" data-provider="<id>"></div>  ← one staff member's photos
 *   <img data-storecal="cover">            ← the cover photo (for a hero image)
 *   ...or [data-storecal-cover-bg] to set the cover as a background image
 *   <span data-storecal-text="shop.name"></span>     (also shop.phone, shop.address)
 *
 * Or render it yourself:  StoreCal.ready(function (data) { ... data.services, data.providers, data.gallery ... });
 * (For a custom gallery, add data-storecal-gallery to any element so the photos load.)
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

  var StoreCal = {
    data: null, _cbs: [],
    ready: function (cb) { if (this.data) cb(this.data); else this._cbs.push(cb); },
    // Photos for one staff member (empty array until content loads or if disabled).
    staffGallery: function (providerId) { return (this.data && this.data.staffGallery && this.data.staffGallery[providerId]) || []; },
  };
  window.StoreCal = StoreCal;

  function bindText(data) {
    document.querySelectorAll("[data-storecal-text]").forEach(function (el) {
      var v = data; el.getAttribute("data-storecal-text").split(".").forEach(function (k) { v = v && v[k]; });
      if (v != null) el.textContent = v;
    });
  }
  // Announcement banner ("We're on vacation…"). Renders into any
  // [data-storecal="banner"] element; if none exists but a message is set, drops
  // a full-width banner at the top of the page so it shows on any site.
  function renderBanner(data) {
    var msg = (data.announcement || "").trim();
    var hosts = document.querySelectorAll('[data-storecal="banner"]');
    hosts.forEach(function (host) {
      if (!msg) { host.style.display = "none"; return; }
      host.style.display = "";
      if (host.className.indexOf("scd-banner") === -1) host.className = (host.className + " scd-banner").trim();
      host.textContent = msg;
    });
    if (msg && hosts.length === 0 && !document.querySelector(".scd-banner--top")) {
      var bar = document.createElement("div");
      bar.className = "scd-banner scd-banner--top";
      bar.textContent = msg;
      document.body.insertBefore(bar, document.body.firstChild);
    }
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
      if (data.showStaff === false) { host.style.display = "none"; return; }
      host.style.display = "";
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

  // Per-staff galleries. Render into any [data-storecal="staff-gallery"] element:
  //   - with data-provider="<id>" → just that staff member's photos
  //   - without → every staff member's photos, grouped under their name
  // Respects the operator's "Allow per-staff galleries" toggle.
  function renderStaffGallery(data) {
    document.querySelectorAll('[data-storecal="staff-gallery"]').forEach(function (host) {
      var byId = data.staffGallery || {};
      if (data.showStaffGalleries === false) { host.style.display = "none"; return; }
      var want = host.getAttribute("data-provider");
      host.style.display = "";
      var groups = want
        ? [{ id: want, shots: byId[want] || [] }]
        : (data.providers || []).map(function (p) { return { id: p._id || p.id, name: p.name, shots: byId[p._id || p.id] || [] }; });
      groups = groups.filter(function (g) { return g.shots && g.shots.length; });
      if (!groups.length) { host.style.display = "none"; return; }
      host.innerHTML = groups.map(function (g) {
        var shots = '<div class="scd-gallery">' + g.shots.map(function (s) {
          return '<figure class="scd-shot"><img src="' + s.url + '" loading="lazy" alt="' + esc(s.caption || "") + '">' +
            (s.caption ? '<figcaption>' + esc(s.caption) + "</figcaption>" : "") + "</figure>";
        }).join("") + "</div>";
        return want ? shots : '<div class="scd-staffgal"><h3 class="scd-staffgal__name">' + esc(g.name || "") + "</h3>" + shots + "</div>";
      }).join("");
    });
  }

  function renderGallery(data) {
    document.querySelectorAll('[data-storecal="gallery"]').forEach(function (host) {
      if (data.showGallery === false) { host.style.display = "none"; return; }
      host.style.display = "";
      host.classList.add("scd-gallery");
      host.innerHTML = (data.gallery || []).map(function (g) {
        return '<figure class="scd-shot"><img src="' + g.url + '" loading="lazy" alt="' + esc(g.caption || "") + '">' +
          (g.caption ? '<figcaption>' + esc(g.caption) + "</figcaption>" : "") + "</figure>";
      }).join("");
    });
  }

  // The cover photo goes in the hero, not the gallery grid. An <img data-storecal="cover">
  // gets its src set; any [data-storecal-cover-bg] element gets it as a background.
  function renderCover(data) {
    document.querySelectorAll('[data-storecal="cover"]').forEach(function (host) {
      if (!data.cover) { host.style.display = "none"; return; }
      host.style.display = "";
      if (host.tagName === "IMG") host.src = data.cover.url;
      else host.innerHTML = '<img src="' + data.cover.url + '" alt="' + esc(data.cover.caption || "") + '" style="width:100%;height:100%;object-fit:cover;display:block">';
    });
    if (data.cover) document.querySelectorAll("[data-storecal-cover-bg]").forEach(function (host) {
      host.style.backgroundImage = "url('" + data.cover.url + "')";
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
    ".scd-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}",
    ".scd-shot{margin:0;border-radius:12px;overflow:hidden;background:#f1f3f6}",
    ".scd-shot img{width:100%;height:100%;aspect-ratio:1;object-fit:cover;display:block}",
    ".scd-shot figcaption{padding:8px 10px;font-size:13px;color:#5a6069}",
    ".scd-staffgal{margin-bottom:28px}",
    ".scd-staffgal__name{margin:0 0 12px;font-size:18px}",
    ".scd-banner{background:#000D6E;color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;line-height:1.5;text-align:center;margin:0 0 16px}",
    ".scd-banner--top{border-radius:0;margin:0;position:relative;z-index:2147483000}",
  ].join("");
  document.head.appendChild(style);

  // Fetch the shop config and (only when a gallery/cover is on the page) its photos.
  var wantsGallery = !!document.querySelector('[data-storecal="gallery"], [data-storecal="cover"], [data-storecal-gallery], [data-storecal-cover-bg]');
  var wantsStaffGallery = !!document.querySelector('[data-storecal="staff-gallery"], [data-storecal-staff-gallery]');
  var q = "?key=" + encodeURIComponent(KEY);
  var getJSON = function (path) { return fetch(API + path).then(function (r) { return r.json(); }).catch(function () { return null; }); };
  Promise.all([
    getJSON("/api/shop-config" + q),
    wantsGallery ? getJSON("/api/gallery" + q) : Promise.resolve(null),
    wantsStaffGallery ? getJSON("/api/gallery" + q + "&scope=staff") : Promise.resolve(null),
  ]).then(function (res) {
    var data = res[0];
    if (!data || data.error) throw new Error((data && data.error) || "no data");
    if (Array.isArray(res[1])) {
      // The cover shows in the hero and is kept out of the gallery grid.
      data.cover = res[1].filter(function (g) { return g.cover; })[0] || null;
      data.gallery = res[1].filter(function (g) { return !g.cover; });
    }
    // Group staff photos by providerId for renderStaffGallery / StoreCal.staffGallery().
    data.staffGallery = {};
    if (Array.isArray(res[2]) && data.showStaffGalleries !== false) {
      res[2].forEach(function (g) {
        if (!g.providerId) return;
        (data.staffGallery[g.providerId] = data.staffGallery[g.providerId] || []).push(g);
      });
    }
    StoreCal.data = data;
    bindText(data); renderBanner(data); renderServices(data); renderStaff(data); renderGallery(data); renderCover(data); renderStaffGallery(data);
    StoreCal._cbs.forEach(function (cb) { try { cb(data); } catch (e) { /* ignore */ } });
    document.dispatchEvent(new CustomEvent("storecal:loaded", { detail: data }));
  }).catch(function (e) { console.error("[StoreCal] couldn't load content:", e.message); });
})();
