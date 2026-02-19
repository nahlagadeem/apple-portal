import { authenticate, unauthenticated } from "../shopify.server";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

function normalizeShopDomain(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = String(input).trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const withProtocol = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.trim().toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0].trim().toLowerCase();
  }
}

async function handle(request: Request) {
  console.log("[create-discount-live] HIT", new Date().toISOString(), request.method, request.url);

  try {
    await authenticate.public.appProxy(request);
  } catch (e: any) {
    console.error("[create-discount-live] appProxy signature invalid:", e?.message ?? e);
    return json({ ok: false, error: "Unauthorized (invalid app proxy signature)." }, { status: 401 });
  }

  const url = new URL(request.url);
  const shop = normalizeShopDomain(url.searchParams.get("shop"));
  if (!shop) {
    return json({ ok: false, error: "Missing shop parameter." }, { status: 400 });
  }

  let admin: any;
  let via: "offline_session" | "admin_token" = "offline_session";
  try {
    ({ admin } = await unauthenticated.admin(shop));
  } catch (e: any) {
    const liveShop = normalizeShopDomain(env.LIVE_SHOP_DOMAIN);
    const adminToken = (env.SHOPIFY_ADMIN_TOKEN || env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || "").trim();

    if (adminToken && liveShop && shop === liveShop) {
      via = "admin_token";
      admin = {
        graphql: async (query: string, opts: any = {}) =>
          fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": adminToken,
            },
            body: JSON.stringify({ query, variables: opts?.variables ?? {} }),
          }),
      };
    } else {
      console.error("[create-discount-live] no offline session and no valid fallback token", {
        shop,
        hasToken: Boolean(adminToken),
        liveShop,
        detail: String(e?.message ?? e),
      });
      return json(
        {
          ok: false,
          error:
            "No offline session for this shop. Open the app once in Shopify Admin to create app session, then retry.",
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

    const bodyText = await result.text();
    let body: any = null;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = null;
    }

    if (!result.ok) {
      return json({ ok: false, error: "Admin API HTTP error", status: result.status, body: body ?? bodyText }, { status: 502 });
    }

    const userErrors = body?.data?.discountCodeBasicCreate?.userErrors ?? [];
    if (userErrors.length) {
      return json({ ok: false, userErrors }, { status: 400 });
    }

    return json({ ok: true, code, via });
  } catch (e: any) {
    console.error("[create-discount-live] graphql exception:", e?.stack ?? e);
    return json({ ok: false, error: "Failed to create discount code.", detail: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function loader({ request }: { request: Request }) {
  return handle(request);
}

export async function action({ request }: { request: Request }) {
  return handle(request);
}

