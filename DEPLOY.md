# Deploying StoreCal to Render

StoreCal runs as **one Render Web Service**: the Express server serves the API
under `/api/*` and serves the built React admin app for everything else — so the
frontend and backend share one origin and one domain. The database is your
existing MongoDB Atlas cluster (same data in dev and prod).

```
  Browser ──▶  storecal.onrender.com
                 ├─ /            → React admin app (client/dist)
                 └─ /api/*       → Express API ──▶ MongoDB Atlas
  Customer site ──▶ /api/* (?key=STORE_KEY, CORS-open)  ← booking widget
```

---

## 1. Push the code to GitHub

The repo is committed locally with secrets excluded (`.env` is gitignored — only
`.env.example` is tracked). Create an empty GitHub repo, then:

```bash
cd "/Users/ralphcapriglione/Desktop/Salon Booking Admin"
git remote add origin https://github.com/<you>/storecal.git
git branch -M main
git push -u origin main
```

(If you have the GitHub CLI: `gh repo create storecal --private --source=. --push`.)

> Double-check before pushing: `git ls-files | grep .env` should return **only**
> `.env.example`. The real `.env` must never be committed.

## 2. Open MongoDB Atlas to Render

Render's free/standard tiers don't have fixed outbound IPs, so allow access from
anywhere:

- Atlas → **Network Access** → **Add IP Address** → **Allow access from anywhere**
  (`0.0.0.0/0`) → Confirm.

Your data already lives in Atlas, so the existing owner login
(`owner@glamour.com`) works in production immediately — no reseeding needed.

## 3. Create the Render service

**Easiest (Blueprint):** Render dashboard → **New** → **Blueprint** → pick your
repo. It reads `render.yaml` and configures the service. Then fill in the secret
env vars (step 4).

**Manual (if you prefer):** New → **Web Service** → connect repo →
- Runtime: **Node**
- Build command: `npm run build`
- Start command: `npm start`
- Health check path: `/api/shop-config`

## 4. Set environment variables (Render → the service → Environment)

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` (makes the auth cookie Secure/HTTPS-only) |
| `MONGODB_URI` | your Atlas connection string |
| `JWT_SECRET` | a long random string (rotate away from the dev value) |
| `SHOP_SLUG` | `default` |
| `STRIPE_SECRET_KEY` | your Stripe secret key |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional, to auto-send invites/resets |

`PORT` is injected by Render automatically — don't set it.

## 5. Deploy & verify

Render builds (`npm run build` → installs server+client deps, builds the client)
and starts (`npm start` → `node server/index.js`). When live you get
`https://storecal.onrender.com`:

- Open it → the login screen loads.
- Sign in with `owner@glamour.com` (your prod DB password).
- `https://storecal.onrender.com/api/shop-config` returns JSON.

## 6. Connect a custom domain

Render → the service → **Settings → Custom Domains → Add**. Render shows the DNS
record to create at your registrar:

- Apex domain (`storecal.com`) → an **ALIAS/ANAME** (or the A records Render lists).
- Subdomain (`app.storecal.com` / `book.storecal.com`) → a **CNAME** to
  `storecal.onrender.com`.

Render provisions HTTPS automatically once DNS resolves. Because auth is a
same-origin cookie, no other change is needed when the domain goes live.

---

## Notes

- **Cookies:** with `NODE_ENV=production` the auth cookie is `Secure` — it only
  flows over HTTPS, which Render provides. Same-origin serving keeps `sameSite:lax`
  working without any cross-site cookie configuration.
- **The booking widget** calls the API cross-origin from customer sites; CORS is
  open (`origin: true`) for exactly that. Those calls are non-credentialed and
  scoped by a public store key, so they can't touch admin data.
- **Free tier** sleeps after inactivity (first request after idle is slow). Move
  to a paid instance for always-on once you're selling.
- **Provisioning a new store:** the same Atlas DB backs every environment, so you
  can create/seed stores locally (e.g. `node server/scripts/create-owner.js`) or via
  `POST /api/auth/register`, and they appear in production instantly.
