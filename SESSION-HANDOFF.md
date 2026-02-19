## Session Handoff (2026-02-19)

### Trigger
- If user says `tama tama sadiki`, resume this exact project flow immediately.

### Project
- Repo: `C:\Windows\System32\student-discount`
- Branch: `main`
- Remote: `git@github.com:nahlagadeem/apple-portal.git`
- Live app: `https://apple-portal.onrender.com`
- Live shop: `7shdka-4d.myshopify.com`

### Current architecture
- Discount route:
  - `app/routes/create-discount-live.ts`
  - `app/routes/create-discount.ts` re-exports live route
  - `app/routes/proxy.create-discount.ts` re-exports live route
- Behavior target:
  - Create a new discount code on each visit
  - No generic 500 behavior; return structured JSON errors
- Auth path:
  - First tries `unauthenticated.admin(shop)`
  - Fallback uses offline session token from Prisma `Session` table
  - Does not require `SHOPIFY_ADMIN_TOKEN`

### Database state
- Migrated to Postgres:
  - `prisma/schema.prisma` uses `provider = "postgresql"` and `DATABASE_URL`
  - Migrations updated for Postgres SQL compatibility
- Render now needs `DATABASE_URL` set to Render Postgres internal URL.

### Deployment flow
- Preferred deployment: push to `main` and let Render auto-deploy.
- If live output seems old, Render has not completed deployment yet.

### Verification commands
- Health check:
  - `curl -i "https://apple-portal.onrender.com/proxy/ping"`
- Discount route:
  - `curl -i "https://apple-portal.onrender.com/create-discount?shop=7shdka-4d.myshopify.com"`
- Postgres table checks (Render psql):
  - `\dt`
  - `select count(*) from "Session";`
  - `select count(*) from "StudentDiscount";`

### Known failure modes
- If no offline session exists in DB, discount creation returns 401 until app is opened/reinstalled in Shopify Admin.
- If Render has not deployed latest commit, endpoint responses will reflect old code.
