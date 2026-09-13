# Deployment

Three things you might be trying to do. Pick one.

1. [**Run it locally**](#1-run-it-locally) — evaluate it in five minutes
2. [**Publish the static demo**](#2-publish-the-static-demo) — GitHub Pages, no backend
3. [**Deploy it for real**](#3-deploy-it-for-real) — with a production checklist

---

## 1. Run it locally

**Prerequisites:** Node 20+, Docker.

```bash
git clone https://github.com/nazmul284/kormo-hr.git && cd kormo-hr
cp .env.example .env
npm run bootstrap     # install → containers → schema → seed
npm run dev           # API :4000, web :3000
```

Open <http://localhost:3000>, sign in as `md` / `Kormo@123`. API reference at
<http://localhost:4000/api/docs>.

`bootstrap` is idempotent — rerun it any time. The individual steps, if one
fails:

```bash
npm install
npm run build -w @kormo/shared
npm run infra:up               # Postgres :55432, Redis :56379, MinIO :59000
node scripts/wait-for-db.mjs
npm run db:generate            # Prisma client
npm run db:deploy              # migrations
npm run db:seed                # demo data — see docs/SEEDING.md
```

Ports are deliberately non-default so they cannot collide with a Postgres or
Redis already on your machine.

### Sharing it on your network

Both servers bind to every interface, so anyone on the same network can reach
it at your machine's LAN address:

```bash
# macOS
echo "http://$(ipconfig getifaddr "$(route -n get default | awk '/interface/{print $2}')"):3000"
# Linux
echo "http://$(hostname -I | awk '{print $1}'):3000"
```

Only port 3000 needs to be reachable — the API is proxied through it.

> Cookies are sent without the `Secure` flag over plain HTTP
> (`COOKIE_SECURE=false`). Fine on a trusted LAN for a demo. Put it behind
> HTTPS and set `COOKIE_SECURE=true` before exposing it any further.

---

## 2. Publish the static demo

The [live demo](https://nazmul284.github.io/kormo-hr/) is the real front end
with no server behind it: `output: 'export'` produces a folder of static
files, and the API client answers from a bundle of JSON fixtures recorded
from a real, seeded backend.

Recording from the real thing rather than writing mocks is deliberate — a
hand-written mock drifts the moment either side changes, and the drift is
invisible until someone reports that the demo shows something the product
does not.

### Enabling it on your fork

1. **Settings → Pages → Source → GitHub Actions.**
2. Push to `main`. `.github/workflows/deploy-demo.yml` builds and deploys.

That is all — the fixture bundle is committed, so the workflow needs no
database and no browser.

### Re-recording the fixtures

Do this whenever the API's response shape changes, or after reseeding with a
different country.

```bash
npm run dev            # needs a running, seeded stack
npm run demo:capture   # in another terminal
```

`scripts/capture-demo.mjs` signs in as each role, walks that role's routes in
real Chrome, and writes every `/api/*` response it sees. Set `CHROME_PATH` if
Chrome is not at the macOS default location.

It exits non-zero if any role fails or if a role is missing an endpoint the
app cannot start without (`/auth/me`, `/dashboard`, …) — a bundle with a hole
in it publishes a demo of error screens and tells nobody, so the script is
deliberately loud about it rather than best-effort.

```bash
npm run demo:preview   # build and serve the export at :4173
```

Commit `apps/web/public/demo-data/`.

> **Stop `next dev` before building the demo.** An export build writes its
> manifests to `.next` even though the export itself goes elsewhere, and those
> manifests carry the `basePath` — a dev server running at the time starts
> serving `/kormo-hr/_next/…` URLs it cannot answer. `build:demo` deletes
> `.next` when it finishes so the next `npm run dev` starts clean.

### What the demo can and cannot do

Reads work. Writes are **refused**, not faked — a demo that appears to approve
a leave request and then forgets it on reload is worse than one that says
plainly it cannot, because the visitor is left unsure whether they hit a bug.

Choosing a role on the sign-in page selects which fixture bundle is read.
There is no authentication, because there is nothing to authenticate against.

### Deploying it somewhere else

The export is plain static files — Netlify, Vercel, Cloudflare Pages, S3, any
web server:

```bash
NEXT_PUBLIC_BASE_PATH="" npm run demo:build   # empty for a root domain
# publish apps/web/out/
```

`NEXT_PUBLIC_BASE_PATH` must match the sub-path you serve from (`/kormo-hr`
for a GitHub project site, empty for a custom domain).

---

## 3. Deploy it for real

### Production checklist

Work through all of it. The first three are not negotiable.

- [ ] **Generate fresh JWT secrets.** `openssl rand -hex 32` for each of
      `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. The API refuses to boot in
      production if the `.env.example` placeholders are still in place — that
      check exists because a placeholder secret makes every token forgeable.
- [ ] **`COOKIE_SECURE=true`** and serve over HTTPS.
- [ ] **Change every seeded password**, or do not seed at all.
- [ ] `NODE_ENV=production`
- [ ] `COOKIE_DOMAIN` set to your actual domain
- [ ] `CORS_ORIGINS` listing only origins you control
- [ ] Managed Postgres with automated backups, not the compose container
- [ ] S3 or R2 for storage — `STORAGE_DRIVER=s3` with real credentials
- [ ] Managed Redis
- [ ] `THROTTLE_LIMIT` tuned for your traffic
- [ ] Migrations run as a deploy step (`npm run db:deploy`), never on boot
- [ ] Log aggregation, and alerting on the API's `/api/health`

### Build

```bash
npm ci
npm run build              # shared → api → web
npm run db:deploy          # migrations
npm run start              # API :4000, web :3000
```

Run the two processes separately in production, each with its own restart
policy — `npm start` runs both under `concurrently`, which is right for a
single box and wrong for anything that needs one to be restartable without the
other.

### Environment

Every variable is documented in [`.env.example`](../.env.example). The ones
that matter in production:

```bash
NODE_ENV=production
DATABASE_URL="postgresql://user:pass@host:5432/kormo_hr?schema=public&connection_limit=20"
REDIS_URL="redis://host:6379"

JWT_ACCESS_SECRET="<openssl rand -hex 32>"
JWT_REFRESH_SECRET="<openssl rand -hex 32>"
COOKIE_DOMAIN="hr.yourcompany.com"
COOKIE_SECURE=true

STORAGE_DRIVER=s3
S3_ENDPOINT="https://s3.eu-west-1.amazonaws.com"
S3_BUCKET="your-bucket"
S3_ACCESS_KEY="..."
S3_SECRET_KEY="..."

API_INTERNAL_URL="http://api:4000"      # where the web tier reaches the API
NEXT_PUBLIC_API_BASE_URL="/api"         # browser-visible — leave as /api
CORS_ORIGINS="https://hr.yourcompany.com"
```

`NEXT_PUBLIC_API_BASE_URL` should stay `/api`. The web tier proxies to the API
so every request is same-origin: no CORS preflight, and auth cookies stay
first-party `sameSite=lax`. Pointing it at the API's own host gives that up.

### Reverse proxy

Route everything to the web tier on :3000. It proxies `/api/*` onward itself.

```nginx
server {
  listen 443 ssl http2;
  server_name hr.yourcompany.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`X-Forwarded-For` matters: the sign-in rate limit is per-IP, and without it
every attempt appears to come from the proxy.

### Containers

The API builds to plain Node output and the web tier to a standard Next
server, so a two-stage `node:20-alpine` image works for both. Run migrations
as a separate job before the new version starts — never from an app container,
or two replicas will race.

`infra/docker-compose.yml` is for local development. It has no resource
limits, no backups and hardcoded passwords; do not point it at production.

### Setting up the first tenant

The seed is demo data, not a bootstrap. For a real deployment:

```bash
npm run db:deploy                      # schema only, no seed
npm run db:studio                      # create your company, then the first admin
```

Choose the `country` on the Company row from the shipped packs, or add your
own first — see [LOCALIZATION.md](LOCALIZATION.md). It sets the currency,
weekend, holiday calendar and tax rules for everyone in that tenant.

---

## Upgrading

```bash
git pull
npm ci
npm run build -w @kormo/shared
npm run db:generate
npm run db:deploy      # forward-only; review the SQL first
npm run build
```

Migrations are forward-only. Take a database backup before applying any that
drop or rename a column.
