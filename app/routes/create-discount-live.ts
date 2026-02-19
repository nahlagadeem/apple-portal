import { authenticate, unauthenticated } from "../shopify.server";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

function normalizeShopDomain(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = String(input).trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const withProtocol = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname.trim().toLowerCase();
    return host;
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0].trim().toLowerCase();
  }
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

async function handle(request: Request) {
  console.log("[create-discount-live] HIT", new Date().toISOString(), request.method, request.url);

  // 1) Ensure it's a SIGNED App Proxy request
  try {
    await authenticate.public.appProxy(request);
  } catch (e: any) {
    console.error("[create-discount-live] appProxy signature invalid:", e?.message ?? e);
    return json({ ok: false, error: "Unauthorized (invalid app proxy signature)." }, { status: 401 });
  }

  // 2) Extract shop
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return json({ ok: false, error: "Missing shop parameter." }, { status: 400 });
  }

  // 3) Get Admin API client: try offline session, else fallback to custom app Admin token
  let admin: any;
  let via: "offline_session" | "admin_token" = "offline_session";
  try {
    ({ admin } = await unauthenticated.admin(shop));
  } catch (e: any) {
    console.warn("[create-discount-live] offline session not found; trying Admin token fallback");

    const liveShop = env.LIVE_SHOP_DOMAIN?.trim();
    const normalizedLiveShop = normalizeShopDomain(liveShop);
    const normalizedRequestShop = normalizeShopDomain(shop);
    const adminToken = (env.SHOPIFY_ADMIN_TOKEN || env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || "").trim();

    if (adminToken && normalizedLiveShop && normalizedRequestShop === normalizedLiveShop) {
      via = "admin_token";
      const apiVersion = "2026-01";
      admin = {
        graphql: async (query: string, opts: any = {}) => {
          const endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
          return fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": adminToken,
            },
            body: JSON.stringify({ query, variables: opts?.variables ?? {} }),
          });
        },
      };
    } else {
      console.error("[create-discount-live] unauthenticated.admin failed:", e?.message ?? e);
      console.error("[create-discount-live] fallback mismatch:", {
        hasToken: Boolean(adminToken),
        requestShop: normalizedRequestShop,
        liveShop: normalizedLiveShop,
      });
      return json(
        {
          ok: false,
          error:
            "No offline session for this shop. Either open the app once in Admin to create it, or set LIVE_SHOP_DOMAIN and SHOPIFY_ADMIN_TOKEN env vars for direct Admin API access.",
          detail: String(e?.message ?? e),
        },
        { status: 401 }
      );
    }
  }

  const code = `STUDENT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    const result = await admin.graphql(
      `
        mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode { id }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          basicCodeDiscount: {
            title: `Student Discount ${code}`,
            code,
            startsAt: new Date().toISOString(),
            customerSelection: { all: true },
            customerGets: {
              value: { percentage: 0.5 },
              items: { all: true },
            },
            usageLimit: 1,
          },
        },
      }
    );

    let bodyText = "";
    let body: any = null;
    try {
      bodyText = await result.text();
      try { body = JSON.parse(bodyText); } catch { body = null; }
    } catch (readErr: any) {
      console.error("[create-discount-live] failed to read response:", readErr?.message ?? readErr);
      return json({ ok: false, error: "Failed to read Admin API response." }, { status: 502 });
    }

    if (!result.ok) {
      console.error("[create-discount-live] Admin API HTTP", result.status, bodyText);
      return json({ ok: false, error: "Admin API HTTP error", status: (result as any).status, body: body ?? bodyText }, { status: 502 });
    }

    const userErrors = body?.data?.discountCodeBasicCreate?.userErrors ?? [];
    if (userErrors.length) {
      console.warn("[create-discount-live] userErrors:", userErrors);
      return json({ ok: false, userErrors }, { status: 400 });
    }

    return json({ ok: true, code, via });
  } catch (e: any) {
    console.error("[create-discount-live] graphql exception:", e?.stack ?? e);
    return json(
      { ok: false, error: "Failed to create discount code.", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function loader({ request }: { request: Request }) {
  return handle(request);
}

export async function action({ request }: { request: Request }) {
  return handle(request);
}
