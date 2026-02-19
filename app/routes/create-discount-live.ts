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
  // Extract shop and verify it matches configured live shop.
  const url = new URL(request.url);
  const shop = normalizeShopDomain(url.searchParams.get("shop"));
  const liveShop = normalizeShopDomain(env.LIVE_SHOP_DOMAIN);
  const adminToken = (env.SHOPIFY_ADMIN_TOKEN || env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || "").trim();

  if (!adminToken) {
    return json({ ok: false, error: "Missing SHOPIFY_ADMIN_TOKEN in server environment." }, { status: 500 });
  }

  if (!liveShop) {
    return json({ ok: false, error: "Missing LIVE_SHOP_DOMAIN in server environment." }, { status: 500 });
  }

  if (!shop) {
    return json({ ok: false, error: "Missing shop parameter in proxy request." }, { status: 400 });
  }

  if (shop !== liveShop) {
    return json(
      { ok: false, error: "Shop mismatch.", detail: `request shop=${shop}, configured shop=${liveShop}` },
      { status: 401 }
    );
  }

  const code = `STUDENT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    const result = await fetch(`https://${liveShop}/admin/api/2026-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": adminToken,
      },
      body: JSON.stringify({
        query: `
        mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode { id }
            userErrors { field message }
          }
        }
      `,
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
      }),
    });

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

    return json({ ok: true, code, via: "admin_token" });
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
