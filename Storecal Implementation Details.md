# StoreCal — Website Integration Guide

Everything you need to wire a client's website to StoreCal: online booking and
live content (services, staff, galleries, hours-driven CTAs). All of it is
served by the live StoreCal server, so it works from any host — a static site,
Webflow, Squarespace, WordPress, a hand-built HTML page, anywhere you can paste
a `<script>` tag.

> **Base URL:** `https://www.storecal.com`
> If a client has a custom domain configured on Render, swap that in everywhere
> below. Nothing depends on your local machine.

> **Store key:** every client has a public key like `sc_bdecf02827d97cadda`.
> Find it in the admin console (**Links & embed**) or from the API (see
> [Finding keys & IDs](#finding-keys--ids)). The key is public and safe to ship
> in HTML — it only exposes read-only public content.

---

## The two scripts

StoreCal ships two independent scripts. Use either or both.

| Script | What it does | Tag |
|---|---|---|
| **`embed.js`** | The **booking widget** — a button + modal that runs the whole booking flow (service → staff → date/time → confirm). | `<script src="…/embed.js" data-store="KEY">` |
| **`storecal-data.js`** | **Content sync** — renders live services, staff, galleries, and shop text into your own page markup. | `<script src="…/storecal-data.js" data-store="KEY">` |

They're safe to load together. A common setup: `storecal-data.js` renders a
service menu with "Book" buttons, and `embed.js` provides the widget those
buttons open.

```html
<!-- StoreCal booking widget -->
<script src="https://www.storecal.com/embed.js" data-store="YOUR_STORE_KEY"></script>
<!-- Live content (services, staff, galleries) -->
<script src="https://www.storecal.com/storecal-data.js" data-store="YOUR_STORE_KEY"></script>
```

---

## Part 1 — Booking widget (`embed.js`)

### Script attributes

```html
<script
  src="https://www.storecal.com/embed.js"
  data-store="YOUR_STORE_KEY"          <!-- required -->
  data-button-text="Book your seat"    <!-- optional: floating button label -->
  data-accent="#c0397b"                <!-- optional: brand color for the widget -->
  data-target="#booking"               <!-- optional: mount into this element -->
  data-auto                            <!-- optional: open the modal on page load -->
></script>
```

| Attribute | Default | Purpose |
|---|---|---|
| `data-store` | — | **Required.** The shop's public key. |
| `data-button-text` | `Book Appointment` | Text on the auto-created trigger button. |
| `data-accent` | `#2563eb` | Accent color used throughout the widget UI. |
| `data-target` | *(inline)* | CSS selector of an element to mount into. If omitted, the button is inserted right after the script tag. |
| `data-auto` | off | If present, opens the booking modal automatically on load (good for link-in-bio pages). |

### Ways to trigger booking

**1. The built-in button** — appears automatically wherever the script (or
`data-target`) sits. No extra markup needed.

**2. Your own buttons/links, preselected to a service** — put
`data-storecal-book` on any element. Optionally add `data-service` with a
service **id or name** to jump straight to the staff step for that service:

```html
<button data-storecal-book>Book now</button>
<button data-storecal-book data-service="Gel Manicure">Book a gel mani</button>
<a href="#" data-storecal-book data-service="SERVICE_ID">Book this</a>
```

Any number of these can live on the page; StoreCal wires them all.

**3. Programmatically** from your own JS:

```js
StoreCalWidget.open();                 // open the widget at the start
StoreCalWidget.book("Deluxe Spa Pedicure");   // open preselected to a service (name or id)
StoreCalWidget.book({ service: "SERVICE_ID" });
```

### Booking gate — "Call us" behavior (important)

Online booking is gated per client (subscription / delivery status, controlled
from the admin console). **You don't need to code anything for this** — the
widget handles it:

- **Booking active:** buttons work normally and open the widget.
- **Booking inactive:** the trigger button relabels to **📞 Call us**. Clicking
  dials the shop's phone (`tel:`) if one is set, or opens a "contact us to book"
  message if not. Text-only `data-storecal-book` buttons relabel to **Call us**
  too. (Buttons that contain child elements — e.g. rendered service cards — are
  left alone so your own renderer can style them; see the gated-CTA note in
  Part 2.)

This means you can build the site once, and it automatically switches between
"book online" and "call us" as the client's status changes — no redeploy.

---

## Part 2 — Content sync (`storecal-data.js`)

Load the script once, then mark up where content should go. The script fills
your containers on load and exposes the data for custom rendering.

```html
<script src="https://www.storecal.com/storecal-data.js" data-store="YOUR_STORE_KEY"></script>
```

### Drop-in containers

Add any of these empty elements; the script populates them:

```html
<!-- Service menu (name, description, duration · price, a "Book" button) -->
<div data-storecal="services"></div>

<!-- Staff / "About the team" (name, bio, avatar) -->
<div data-storecal="staff"></div>

<!-- Shop photo gallery (excludes the cover) -->
<div data-storecal="gallery"></div>

<!-- Every staff member's gallery, grouped under each name -->
<div data-storecal="staff-gallery"></div>

<!-- One staff member's gallery -->
<div data-storecal="staff-gallery" data-provider="PROVIDER_ID"></div>

<!-- Cover / hero photo -->
<img data-storecal="cover">                    <!-- sets the img src -->
<div data-storecal-cover-bg style="height:60vh"></div>   <!-- sets a background-image -->
```

The service cards' **Book** buttons already carry `data-storecal-book`, so if
`embed.js` is also on the page they open the widget preselected to that service.

### Text bindings

Bind live shop fields into any element with `data-storecal-text`:

```html
<h1 data-storecal-text="shop.name">Fallback name</h1>
<a data-storecal-text="shop.phone"></a>
<p data-storecal-text="shop.address"></p>
```

Available paths: `shop.name`, `shop.phone`, `shop.address`, `shop.slug`,
`shop.businessType`.

### Visibility toggles (operator-controlled)

Each client has toggles in the admin console. The script respects them
automatically — you don't check anything:

| Toggle | Effect on the page |
|---|---|
| **Show staff** off | `data-storecal="staff"` hides itself. |
| **Show photo gallery** off | `data-storecal="gallery"` hides itself. |
| **Allow per-staff galleries** off | `data-storecal="staff-gallery"` hides itself; `StoreCal.staffGallery()` returns `[]`. |

### Render it yourself (full control)

For custom markup, ignore the drop-ins and read the data directly:

```html
<script>
  StoreCal.ready(function (data) {
    // data.services  → [{ _id, name, description, durationMin, price }]
    // data.providers → [{ _id, name, bio, photo, isOwner, serviceIds }]
    // data.gallery   → [{ _id, url, caption }]  (shop photos, cover excluded)
    // data.cover     → { url, caption } | null
    // data.staffGallery → { providerId: [{ _id, url, caption }] }
    // data.shop      → { name, phone, address, slug, businessType }
    // data.bookingActive, data.showStaff, data.showGallery, data.showStaffGalleries

    data.services.forEach(function (s) { /* build your own card */ });
  });
</script>
```

Helpers on the global `StoreCal` object:

```js
StoreCal.data                    // the full payload once loaded (else null)
StoreCal.ready(cb)               // cb(data) — fires now if loaded, else on load
StoreCal.staffGallery(id)        // photos for one staffer: [{ url, caption }] ([] if none/disabled)
```

A `storecal:loaded` DOM event also fires on `document` with the data in
`event.detail`.

### Staff galleries — the three ways

```html
<!-- A) All staff, grouped by name (simplest) -->
<div data-storecal="staff-gallery"></div>

<!-- B) One specific staffer -->
<div data-storecal="staff-gallery" data-provider="PROVIDER_ID"></div>

<!-- C) Fully custom -->
<script>
  StoreCal.ready(function (data) {
    data.providers.forEach(function (p) {
      var photos = StoreCal.staffGallery(p._id);   // [] if none
      if (!photos.length) return;
      // render p.name + photos[i].url however you like
    });
  });
</script>
```

Staff photos are **separate** from the shop gallery: `data-storecal="gallery"`
renders only shop photos, `data-storecal="cover"` drives the hero, and
`data-storecal="staff-gallery"` renders per-staff photos. No overlap. Each
staffer manages up to 15 photos from their own **My gallery** tab; a bookable
owner's photos show as the shop gallery inside the booking widget.

### Default styling & overriding it

The script injects light default styles you can override from your own CSS.
Key classes:

| Class | Element |
|---|---|
| `.scd-grid` | services / staff grid container |
| `.scd-card`, `.scd-card__name`, `.scd-card__desc`, `.scd-card__meta`, `.scd-card__book` | a service card |
| `.scd-person`, `.scd-person__av`, `.scd-person__name`, `.scd-person__bio` | a staff row |
| `.scd-gallery`, `.scd-shot`, `.scd-shot img`, `.scd-shot figcaption` | gallery grid + photo |
| `.scd-staffgal`, `.scd-staffgal__name` | a staff gallery group (name + its grid) |

Because your selectors load after the script's `<style>`, plain overrides win.

---

## Full example page

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Nail Bar</title>
  <style>
    /* Override StoreCal defaults to match the brand */
    .scd-card__book { background:#c0397b; border-radius:999px; }
    .scd-shot img { aspect-ratio: 4/5; }
  </style>
</head>
<body>
  <!-- Hero with the cover photo as a background -->
  <header data-storecal-cover-bg style="height:70vh;background-size:cover;background-position:center">
    <h1 data-storecal-text="shop.name">The Nail Bar</h1>
    <button data-storecal-book>Book your seat</button>
  </header>

  <section>
    <h2>Services</h2>
    <div data-storecal="services"></div>   <!-- each card has its own Book button -->
  </section>

  <section>
    <h2>Meet the team</h2>
    <div data-storecal="staff"></div>
  </section>

  <section>
    <h2>Our work</h2>
    <div data-storecal="gallery"></div>
  </section>

  <section>
    <h2>Staff portfolios</h2>
    <div data-storecal="staff-gallery"></div>
  </section>

  <footer>
    <a data-storecal-text="shop.phone"></a> ·
    <span data-storecal-text="shop.address"></span>
  </footer>

  <!-- Load both scripts once -->
  <script src="https://www.storecal.com/embed.js"
          data-store="YOUR_STORE_KEY"
          data-accent="#c0397b"
          data-button-text="Book your seat"></script>
  <script src="https://www.storecal.com/storecal-data.js"
          data-store="YOUR_STORE_KEY"></script>
</body>
</html>
```

---

## Finding keys & IDs

**Store key** — from the admin console (**Links & embed**), or:

```js
// in the browser console, any page:
fetch("https://www.storecal.com/api/shop-config?key=YOUR_STORE_KEY")
  .then(r => r.json()).then(console.log);
```

**Provider (staff) IDs** — for `data-provider`:

```js
fetch("https://www.storecal.com/api/shop-config?key=YOUR_STORE_KEY")
  .then(r => r.json())
  .then(d => d.providers.forEach(p => console.log(p.name, "→", p._id)));
```

---

## Raw API (for fully custom builds)

All read endpoints are public and CORS-open — call them from any site.

| Endpoint | Returns |
|---|---|
| `GET /api/shop-config?key=KEY` | Shop identity, booking status + toggles, services, providers, add-ons. |
| `GET /api/gallery?key=KEY` | Shop gallery photos (cover flagged with `cover:true`). |
| `GET /api/gallery?key=KEY&providerId=ID` | One staff member's photos. |
| `GET /api/gallery?key=KEY&scope=staff` | Every staff member's photos (has `providerId` on each). |

`shop-config` shape (abridged):

```jsonc
{
  "bookingActive": true,
  "showStaff": true,
  "showGallery": true,
  "showStaffGalleries": true,
  "shop": { "name": "...", "phone": "...", "address": "...", "slug": "...", "businessType": "nail" },
  "services":  [{ "_id": "...", "name": "...", "description": "...", "durationMin": 45, "price": "$40" }],
  "providers": [{ "_id": "...", "name": "...", "bio": "...", "photo": "...", "isOwner": false, "serviceIds": ["..."] }],
  "addons":    [{ "name": "...", "price": "..." }]
}
```

Respect `bookingActive` and the `show*` flags in custom builds so the site
matches the operator's settings (e.g. show a "Call us" CTA when
`bookingActive` is false).
