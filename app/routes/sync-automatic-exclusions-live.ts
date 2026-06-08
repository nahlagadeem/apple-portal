import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const SHARED_CONFIG_NAMESPACE = "student-discount-shared";
const SHARED_AUTOMATIC_CONFIG_KEY = "automatic-configuration";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

type GraphqlClient = {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

type CodeDiscountNode = {
  id: string;
  title: string;
  codes: string[];
  functionId: string;
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

async function getAdmin(shop: string): Promise<{ admin: GraphqlClient; via: "offline_session" | "session_token" }> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    return { admin, via: "offline_session" };
  } catch (error) {
    const offlineSession = await prisma.session.findFirst({
      where: { shop, isOnline: false },
    });
    const sessionAccessToken = (offlineSession?.accessToken || "").trim();

    if (!sessionAccessToken) {
      throw new Error(
        `No offline session for ${shop}. Open the student_discount app once in Shopify Admin and retry. ${errorMessage(error)}`,
      );
    }

    return {
      via: "session_token",
      admin: {
        graphql: async (query: string, opts: { variables?: Record<string, unknown> } = {}) =>
          fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": sessionAccessToken,
            },
            body: JSON.stringify({ query, variables: opts?.variables ?? {} }),
          }),
      },
    };
  }
}

function summarizeGraphqlPayload(payloadText: string): string {
  try {
    const payload = JSON.parse(payloadText);
    const messages = [
      ...(payload?.errors ?? []).map((error: { message?: string }) => String(error?.message || "").trim()),
      ...(payload?.data?.discountCodeAppUpdate?.userErrors ?? []).map((error: { message?: string }) =>
        String(error?.message || "").trim(),
      ),
    ].filter(Boolean);
    if (messages.length) return messages.slice(0, 5).join("; ");
  } catch {
    // Use compact body below.
  }

  const compact = String(payloadText || "").replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 240)}...` : compact;
}

async function runAdminGraphql(admin: GraphqlClient, query: string, variables: Record<string, unknown> = {}) {
  const response = await admin.graphql(query, { variables });
  const payloadText = await response.text();
  const payload = JSON.parse(payloadText);

  if (!response.ok) {
    throw new Error(`Admin API HTTP ${response.status}: ${summarizeGraphqlPayload(payloadText)}`);
  }

  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((error: { message?: string }) => error.message).join("; "));
  }

  return payload?.data ?? null;
}

async function resolveDiscountFunctionId(admin: GraphqlClient): Promise<string> {
  const data = await runAdminGraphql(
    admin,
    `#graphql
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
    `,
  );

  const nodes = data?.shopifyFunctions?.nodes ?? [];
  const discountFunction =
    nodes.find(
      (node: { apiType?: string; title?: string }) =>
        String(node?.apiType || "").toLowerCase().startsWith("discount") &&
        String(node?.title || "").toLowerCase().includes("category-tier-discount-native"),
    ) ||
    nodes.find(
      (node: { apiType?: string; app?: { title?: string } }) =>
        String(node?.apiType || "").toLowerCase().startsWith("discount") &&
        String(node?.app?.title || "").toLowerCase().includes("student_discount"),
    ) ||
    nodes.find((node: { apiType?: string }) => String(node?.apiType || "").toLowerCase().startsWith("discount"));

  const functionId = String(discountFunction?.id || "").trim();
  if (!functionId) throw new Error("No discount function found for student_discount.");
  return functionId;
}

async function fetchAutomaticConfig(admin: GraphqlClient): Promise<Record<string, unknown>> {
  const data = await runAdminGraphql(
    admin,
    `#graphql
      query AutomaticDiscountConfig($query: String!) {
        discountNodes(first: 100, query: $query) {
          nodes {
            id
            metafield(namespace: "student-discount-shared", key: "automatic-configuration") {
              value
            }
            discount {
              __typename
              ... on DiscountAutomaticApp {
                title
              }
            }
          }
        }
      }
    `,
    { query: "method:automatic" },
  );

  const node = (data?.discountNodes?.nodes ?? []).find(
    (discountNode: { discount?: { __typename?: string }; metafield?: { value?: string } }) =>
      String(discountNode?.discount?.__typename || "") === "DiscountAutomaticApp" &&
      String(discountNode?.metafield?.value || "").trim(),
  );
  const value = String(node?.metafield?.value || "").trim();
  if (!value) throw new Error("No published automatic discount config found. Run automatic app sync first.");

  return JSON.parse(value) as Record<string, unknown>;
}

async function findOwnedCodeDiscounts(admin: GraphqlClient, functionId: string): Promise<CodeDiscountNode[]> {
  const data = await runAdminGraphql(
    admin,
    `#graphql
      query CodeDiscountNodes($query: String!) {
        discountNodes(first: 100, query: $query) {
          nodes {
            id
            discount {
              __typename
              ... on DiscountCodeApp {
                title
                codes(first: 5) {
                  nodes {
                    code
                  }
                }
                appDiscountType {
                  functionId
                }
              }
            }
          }
        }
      }
    `,
    { query: "method:code" },
  );

  return (data?.discountNodes?.nodes ?? [])
    .filter(
      (node: { discount?: { __typename?: string; appDiscountType?: { functionId?: string } } }) =>
        String(node?.discount?.__typename || "") === "DiscountCodeApp" &&
        String(node?.discount?.appDiscountType?.functionId || "").trim() === functionId,
    )
    .map((node: {
      id?: string;
      discount?: { title?: string; appDiscountType?: { functionId?: string }; codes?: { nodes?: { code?: string }[] } };
    }) => ({
      id: String(node?.id || "").trim(),
      title: String(node?.discount?.title || "").trim(),
      functionId: String(node?.discount?.appDiscountType?.functionId || "").trim(),
      codes: (node?.discount?.codes?.nodes ?? [])
        .map((codeNode) => String(codeNode?.code || "").trim())
        .filter(Boolean),
    }))
    .filter((node: CodeDiscountNode) => node.id);
}

async function updateCodeDiscount(admin: GraphqlClient, discountNode: CodeDiscountNode, automaticConfig: Record<string, unknown>) {
  const data = await runAdminGraphql(
    admin,
    `#graphql
      mutation UpdateCodeDiscount($id: ID!, $codeAppDiscount: DiscountCodeAppInput!) {
        discountCodeAppUpdate(id: $id, codeAppDiscount: $codeAppDiscount) {
          codeAppDiscount {
            discountId
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: discountNode.id,
      codeAppDiscount: {
        combinesWith: {
          orderDiscounts: false,
          productDiscounts: true,
          shippingDiscounts: false,
        },
        metafields: [
          {
            namespace: SHARED_CONFIG_NAMESPACE,
            key: SHARED_AUTOMATIC_CONFIG_KEY,
            type: "json",
            value: JSON.stringify(automaticConfig),
          },
        ],
      },
    },
  );

  const payload = data?.discountCodeAppUpdate;
  if (payload?.userErrors?.length) {
    throw new Error(payload.userErrors.map((error: { message?: string }) => error.message).join("; "));
  }

  return {
    id: payload?.codeAppDiscount?.discountId || discountNode.id,
    title: discountNode.title,
    codes: discountNode.codes,
    functionId: discountNode.functionId,
  };
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const liveShop = normalizeShopDomain(env.LIVE_SHOP_DOMAIN);
  const requestedShop = normalizeShopDomain(url.searchParams.get("shop"));
  const shop = requestedShop || liveShop;
  let proxyVerified = false;

  try {
    await authenticate.public.appProxy(request);
    proxyVerified = true;
  } catch {
    proxyVerified = false;
  }

  if (!shop) return json({ ok: false, error: "Missing shop parameter." }, { status: 400 });

  try {
    const { admin, via } = await getAdmin(shop);
    const functionId = await resolveDiscountFunctionId(admin);
    const automaticConfig = await fetchAutomaticConfig(admin);
    const codeDiscounts = await findOwnedCodeDiscounts(admin, functionId);
    const updatedCodeDiscounts = [];

    for (const discount of codeDiscounts) {
      updatedCodeDiscounts.push(await updateCodeDiscount(admin, discount, automaticConfig));
    }

    return json({
      ok: true,
      shop,
      via,
      proxyVerified,
      automaticConfigVersion: automaticConfig.version ?? null,
      codeDiscountCount: codeDiscounts.length,
      updatedCodeDiscountNodeIds: updatedCodeDiscounts.map((discount) => discount.id),
      updatedCodeDiscounts,
    });
  } catch (error) {
    return json({ ok: false, shop, error: errorMessage(error) }, { status: 500 });
  }
}

export async function loader({ request }: { request: Request }) {
  return handle(request);
}

export async function action({ request }: { request: Request }) {
  return handle(request);
}
