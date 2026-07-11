# StoreCal server

Express + MongoDB API. Entry point: `index.js` (wires middleware, mounts routes,
serves the built client and the static embed scripts).

## Layout

```
server/
  index.js            App entry: middleware, route mounting, static serving.
  lib/                Shared infrastructure + domain helpers (no HTTP here).
    db.js               Mongo connection (getDb).
    auth.js             Password hashing, JWT cookie, requireAuth/Owner/SuperAdmin.
    shopScope.js        Multi-tenant scoping — resolve a shop from a request/key.
    clients.js          Customer (booker) upsert/dedupe helpers.
    availabilityCheck.js Booking availability math shared by routes.
    mailer.js           Transactional email (invites, resets).
  routes/             One file per API area; each exports an Express Router.
    auth.js  providers.js  availability.js  timeoff.js  appointments.js
    shopConfig.js  clients.js  services.js  addons.js  gallery.js
    billing.js  public.js  admin.js  apply.js
  scripts/            Standalone maintenance / seed CLIs (run with `node`).
    seedDemo.js         Idempotent demo-store seeder (also run on boot).
    make-superadmin.js  set-plan.js  set-business-type.js  create-owner.js
    backfill-keys.js    backfill-clients.js  seed-appointments.js  store-embed.js
  public/             Static assets served as-is: embed.js, storecal-data.js, demo.html
```

## Conventions

- **Routes** never talk to Mongo directly beyond `getDb()`; shared logic lives in `lib/`.
- **Every query is shop-scoped** via `shopScope` — this is a multi-tenant system.
- **Scripts** are one-off; invoke them explicitly, e.g. `node server/scripts/make-superadmin.js <email>`.
- The public embed contract (`public/embed.js`, `public/storecal-data.js`, the
  `/api/shop-config` + `/api/gallery` shapes) is consumed by live client sites —
  keep it backward-compatible.
