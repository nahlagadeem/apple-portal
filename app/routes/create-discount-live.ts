import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

type GraphqlClient = {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

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

function normalizeMode(input: string | null | undefined): "basic" | "app" {
  return String(input || "").trim().toLowerCase() === "app" ? "app" : "basic";
}

function clampPercentage(input: string | null | undefined, fallback = 0) {
  const parsed = Number(String(input ?? "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

function buildAppConfigFromSearchParams(searchParams: URLSearchParams) {
  const collectionRules = [
    {
      key: "ipadPercentage",
      collectionId: "gid://shopify/Collection/452991221978",
      collectionTitle: "iPad",
      defaultPercentage: 8,
    },
    {
      key: "macPercentage",
      collectionId: "gid://shopify/Collection/452991746266",
      collectionTitle: "Mac",
      defaultPercentage: 13,
    },
    {
      key: "accessoriesPercentage",
      collectionId: "gid://shopify/Collection/453527797978",
      collectionTitle: "Accessories",
      defaultPercentage: 5,
    },
    {
      key: "iphonePercentage",
      collectionId: "gid://shopify/Collection/452991123674",
      collectionTitle: "iPhone",
      defaultPercentage: 0,
    },
    {
      key: "appleWatchPercentage",
      collectionId: "gid://shopify/Collection/52991287514",
      collectionTitle: "Apple Watch",
      defaultPercentage: 0,
    },
    {
      key: "tvHomePercentage",
      collectionId: "gid://shopify/Collection/453560008922",
      collectionTitle: "TV & Home",
      defaultPercentage: 0,
    },
  ];

  const rules = collectionRules
    .map((entry) => {
      const percentage = clampPercentage(searchParams.get(entry.key), entry.defaultPercentage);
      return {
        collectionId: entry.collectionId,
        collectionTitle: entry.collectionTitle,
        percentage,
      };
    })
    .filter((rule) => rule.percentage > 0);

  return {
    ipadPercentage: clampPercentage(searchParams.get("ipadPercentage"), 8),
    macPercentage: clampPercentage(searchParams.get("macPercentage"), 13),
    accessoriesPercentage: clampPercentage(searchParams.get("accessoriesPercentage"), 5),
    iphonePercentage: clampPercentage(searchParams.get("iphonePercentage"), 0),
    appleWatchPercentage: clampPercentage(searchParams.get("appleWatchPercentage"), 0),
    tvHomePercentage: clampPercentage(searchParams.get("tvHomePercentage"), 0),
    airpodsPercentage: clampPercentage(searchParams.get("airpodsPercentage"), 0),
    rules,
    collectionIds: rules.map((rule) => rule.collectionId),
  };
}

function buildBundleAppConfig() {
  const bundleCollectionId = "gid://shopify/Collection/458566009050";
  return {
    ipadPercentage: 0,
    macPercentage: 0,
    accessoriesPercentage: 0,
    iphonePercentage: 0,
    appleWatchPercentage: 0,
    tvHomePercentage: 0,
    airpodsPercentage: 0,
    rules: [
      {
        collectionId: bundleCollectionId,
        collectionTitle: "All Bundles",
        percentage: 10,
      },
    ],
    collectionIds: [bundleCollectionId],
  };
}

async function resolveDiscountFunctionId(admin: GraphqlClient): Promise<string> {
  const result = await admin.graphql(
    `
      query DiscountFunctions {
        shopifyFunctions(first: 100) {
          nodes {
            id
            title
            apiType
            app {
              title
            }
          }
        }
      }
    `
  );
  const body = await result.json().catch(() => null);
  const functionNodes = body?.data?.shopifyFunctions?.nodes ?? [];
  const discountFunction =
    functionNodes.find(
      (node: { apiType?: string; title?: string; app?: { title?: string } }) =>
        String(node?.apiType || "").toLowerCase().startsWith("discount") &&
        String(node?.title || "").toLowerCase().includes("category-tier-discount-native"),
    ) ||
    functionNodes.find(
      (node: { apiType?: string; title?: string; app?: { title?: string } }) =>
        String(node?.apiType || "").toLowerCase().startsWith("discount") &&
        String(node?.app?.title || "").toLowerCase().includes("student_discount"),
    ) ||
    functionNodes.find((node: { apiType?: string }) => String(node?.apiType || "").toLowerCase().startsWith("discount"));

  const functionId = String(discountFunction?.id || "").trim();
  if (!functionId) {
    throw new Error("No discount function found for student_discount.");
  }
  return functionId;
}

async function handle(request: Request) {
  console.log("[create-discount-live] HIT", new Date().toISOString(), request.method, request.url);

  const url = new URL(request.url);
  const liveShop = normalizeShopDomain(env.LIVE_SHOP_DOMAIN);
  const requestedShop = normalizeShopDomain(url.searchParams.get("shop"));
  const shop = requestedShop || liveShop;
  const mode = normalizeMode(url.searchParams.get("mode"));
  let proxyVerified = false;
  try {
    await authenticate.public.appProxy(request);
    proxyVerified = true;
  } catch (e: unknown) {
    console.warn("[create-discount-live] appProxy signature invalid, continuing as direct request:", errorMessage(e));
  }

  if (!shop) {
    return json({ ok: false, error: "Missing shop parameter." }, { status: 400 });
  }

  let admin: GraphqlClient;
  let via: "offline_session" | "session_token" = "offline_session";
  try {
    ({ admin } = await unauthenticated.admin(shop));
  } catch (e: unknown) {
    const offlineSession = await prisma.session.findFirst({
      where: { shop, isOnline: false },
    });
    const sessionAccessToken = (offlineSession?.accessToken || "").trim();

    if (sessionAccessToken) {
      via = "session_token";
      admin = {
        graphql: async (query: string, opts: { variables?: Record<string, unknown> } = {}) =>
          fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": sessionAccessToken,
            },
            body: JSON.stringify({ query, variables: opts?.variables ?? {} }),
          }),
      };
    } else {
      console.error("[create-discount-live] no usable offline session token", {
        shop,
        liveShop,
        detail: errorMessage(e),
      });
      return json(
        {
          ok: false,
          error: "No offline session for this shop. Open the app once in Shopify Admin and reinstall if needed, then retry.",
        },
        { status: 401 }
      );
    }
  }

  const code =
    String(url.searchParams.get("code") || "").trim().toUpperCase() ||
    (mode === "app"
      ? `BUNDLE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      : `STUDENT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);

  try {
    if (mode === "app") {
      const functionId = await resolveDiscountFunctionId(admin);
      const bundleConfig = buildAppConfigFromSearchParams(url.searchParams);
      const result = await admin.graphql(
        `
          mutation discountCodeAppCreate($codeAppDiscount: DiscountCodeAppInput!) {
            discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
              codeAppDiscount {
                discountId
                title
                codes(first: 1) {
                  nodes {
                    code
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            codeAppDiscount: {
              title: code,
              code,
              functionId,
              startsAt: new Date().toISOString(),
              discountClasses: ["PRODUCT"],
              combinesWith: {
                orderDiscounts: false,
                productDiscounts: true,
                shippingDiscounts: false,
              },
              metafields: [
                {
                  namespace: "$app:category-tier-discount-native",
                  key: "function-configuration",
                  type: "json",
                  value: JSON.stringify(bundleConfig),
                },
              ],
            },
          },
        }
      );

      const bodyText = await result.text();
      let body: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(bodyText) as unknown;
        body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
      } catch {
        body = null;
      }

      if (!result.ok) {
        const status = result.status >= 400 && result.status < 500 ? result.status : 502;
        return json({ ok: false, error: "Admin API HTTP error", status: result.status, body: body ?? bodyText }, { status });
      }

      const userErrors =
        (body as { data?: { discountCodeAppCreate?: { userErrors?: unknown[] } } } | null)?.data
          ?.discountCodeAppCreate?.userErrors ?? [];
      if (userErrors.length) {
        return json({ ok: false, userErrors }, { status: 400 });
      }

      return json({
        ok: true,
        code,
        via,
        proxyVerified,
        mode,
        functionId,
        bundleConfig,
      });
    }

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
    let body: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      body = null;
    }

    if (!result.ok) {
      const status = result.status >= 400 && result.status < 500 ? result.status : 502;
      return json({ ok: false, error: "Admin API HTTP error", status: result.status, body: body ?? bodyText }, { status });
    }

    const userErrors =
      (body as { data?: { discountCodeBasicCreate?: { userErrors?: unknown[] } } } | null)?.data
        ?.discountCodeBasicCreate?.userErrors ?? [];
    if (userErrors.length) {
      return json({ ok: false, userErrors }, { status: 400 });
    }

    return json({ ok: true, code, via, proxyVerified, mode });
  } catch (e: unknown) {
    console.error("[create-discount-live] graphql exception:", e);
    return json({ ok: false, error: "Failed to create discount code.", detail: errorMessage(e) }, { status: 502 });
  }
}

export async function loader({ request }: { request: Request }) {
  return handle(request);
}

export async function action({ request }: { request: Request }) {
  return handle(request);
}

