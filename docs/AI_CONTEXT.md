# AI Shared Context (Shopify + Render)

## Project Overview
- Project name: `student-discount`
- Repo path: `C:\Windows\System32\student-discount`
- Git remote: `git@github.com:nahlagadeem/apple-portal.git`
- Primary branch: `main`
- Live store: `7shdka-4d.myshopify.com`
- Live app URL: `https://apple-portal.onrender.com`

## Trigger / Resume
- Resume phrase: `tama tama sadiki`
- On trigger, continue this same project context without asking to re-explain setup.

## Stack
- Shopify app (React Router + Shopify app server package)
- Backend runtime: Node.js
- ORM/session storage: Prisma
- Database: PostgreSQL (Render)
- Hosting: Render (web service + Postgres)

## Current Environment Model
- Production DB is Postgres via `DATABASE_URL`.
- Prisma schema provider is `postgresql`.
- Migrations were updated to PostgreSQL-compatible SQL.

## Routing and Discount Flow
- Main discount handler: `app/routes/create-discount-live.ts`
- Aliases:
  - `app/routes/create-discount.ts` -> re-export live handler
  - `app/routes/proxy.create-discount.ts` -> re-export live handler
- Ping route: `app/routes/proxy.ping.ts`

Current intended behavior:
1. Create a new discount code each page entry/request.
2. Avoid generic 500 behavior; return structured JSON error bodies.
3. No hard dependency on `SHOPIFY_ADMIN_TOKEN`.
4. Try `unauthenticated.admin(shop)` first.
5. Fallback to offline session token from Prisma `Session` table.

## Shopify App Proxy Config
From `shopify.app.toml`:
- `application_url = "https://apple-portal.onrender.com"`
- `[app_proxy]`
  - `url = "https://apple-portal.onrender.com"`
  - `prefix = "apps"`
  - `subpath = "student-discount"`

## Deployment Workflow
- Preferred deployment path: commit -> push to `main` -> Render auto-deploy from GitHub.
- If production response looks old, Render has not completed deploy yet.

## Postgres Verification
Use Render Postgres psql:
```sql
\dt
select count(*) from "Session";
select count(*) from "StudentDiscount";
select id, shop, "isOnline" from "Session" order by id desc limit 10;
select id, shop, code, "createdAt" from "StudentDiscount" order by "createdAt" desc limit 20;
```

## Known Failure Modes
- Missing offline session token for shop -> discount creation returns auth failure until app is opened/reinstalled in Shopify Admin.
- Old deployment still live -> endpoint returns previous behavior.
- Invalid Shopify credentials/session token -> Admin API 401 response.

## Non-Negotiable Rules for AI Agents
- Do git commands directly when asked to fix/deploy.
- Keep changes minimal and production-safe.
- Validate with endpoint checks after deploy:
  - `/proxy/ping`
  - `/create-discount?shop=7shdka-4d.myshopify.com`
- Do not reintroduce per-customer persistence logic unless explicitly requested.
