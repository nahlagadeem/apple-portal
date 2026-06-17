import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const DEFAULT_CONFIG = {
  ipadPercentage: 8,
  macPercentage: 13,
  accessoriesPercentage: 5,
  iphonePercentage: 0,
  appleWatchPercentage: 0,
  tvHomePercentage: 0,
  airpodsPercentage: 0,
};

const LEGACY_COLLECTION_FIELDS = [
  {
    key: "ipadPercentage",
    collectionId: "gid://shopify/Collection/452991221978",
    title: "iPad",
    defaultPercentage: DEFAULT_CONFIG.ipadPercentage,
  },
  {
    key: "macPercentage",
    collectionId: "gid://shopify/Collection/452991746266",
    title: "Mac",
    defaultPercentage: DEFAULT_CONFIG.macPercentage,
  },
  {
    key: "accessoriesPercentage",
    collectionId: "gid://shopify/Collection/453527797978",
    title: "Accessories",
    defaultPercentage: DEFAULT_CONFIG.accessoriesPercentage,
  },
  {
    key: "iphonePercentage",
    collectionId: "gid://shopify/Collection/452991123674",
    title: "iPhone",
    defaultPercentage: DEFAULT_CONFIG.iphonePercentage,
  },
  {
    key: "appleWatchPercentage",
    collectionId: "gid://shopify/Collection/52991287514",
    title: "Apple Watch",
    defaultPercentage: DEFAULT_CONFIG.appleWatchPercentage,
  },
  {
    key: "tvHomePercentage",
    collectionId: "gid://shopify/Collection/453560008922",
    title: "TV & Home",
    defaultPercentage: DEFAULT_CONFIG.tvHomePercentage,
  },
];

function clampPercentage(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

function normalizeRules(rawRules) {
  if (!Array.isArray(rawRules)) return [];

  return rawRules
    .map((rule) => ({
      collectionId: String(rule?.collectionId || "").trim(),
      collectionTitle: String(rule?.collectionTitle || "").trim(),
      percentage: clampPercentage(rule?.percentage, 0),
    }))
    .filter((rule) => rule.collectionId && rule.percentage > 0);
}

function parseRulesInput(rawValue) {
  try {
    return normalizeRules(JSON.parse(String(rawValue || "[]")));
  } catch {
    return [];
  }
}

function parseConfig(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    const legacyConfig = {
      ipadPercentage: clampPercentage(parsed.ipadPercentage, DEFAULT_CONFIG.ipadPercentage),
      macPercentage: clampPercentage(parsed.macPercentage, DEFAULT_CONFIG.macPercentage),
      accessoriesPercentage: clampPercentage(
        parsed.accessoriesPercentage,
        DEFAULT_CONFIG.accessoriesPercentage,
      ),
      iphonePercentage: clampPercentage(parsed.iphonePercentage, DEFAULT_CONFIG.iphonePercentage),
      appleWatchPercentage: clampPercentage(
        parsed.appleWatchPercentage,
        DEFAULT_CONFIG.appleWatchPercentage,
      ),
      tvHomePercentage: clampPercentage(parsed.tvHomePercentage, DEFAULT_CONFIG.tvHomePercentage),
      airpodsPercentage: clampPercentage(parsed.airpodsPercentage, DEFAULT_CONFIG.airpodsPercentage),
    };
    const rules = normalizeRules(parsed.rules);
    return {
      ...legacyConfig,
      rules,
      collectionIds: rules.map((rule) => rule.collectionId),
    };
  } catch {
    return { ...DEFAULT_CONFIG, rules: [], collectionIds: [] };
  }
}

function normalizeDiscountNodeId(rawId) {
  if (!rawId) return "";
  const value = String(rawId).trim();
  if (!value) return "";
  if (value.startsWith("gid://")) return value;
  if (/^\d+$/.test(value)) return `gid://shopify/DiscountCodeNode/${value}`;
  return value;
}

async function runGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();
  return { response, json };
}

async function fetchCollections(admin) {
  const query = `#graphql
    query Collections($cursor: String) {
      collections(first: 250, after: $cursor, sortKey: TITLE) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          handle
        }
      }
    }
  `;

  const collections = [];
  let cursor = null;

  do {
    const result = await runGraphql(admin, query, { cursor });
    if (!result.response.ok || result.json?.errors?.length) break;

    const connection = result.json?.data?.collections;
    collections.push(
      ...(connection?.nodes ?? []).map((collection) => ({
        id: String(collection?.id || "").trim(),
        title: String(collection?.title || "").trim(),
        handle: String(collection?.handle || "").trim(),
      })),
    );
    cursor = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);

  return collections.filter((collection) => collection.id && collection.title);
}

async function resolveDiscountFunction(admin) {
  const functionsQuery = `#graphql
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
  `;
  const functionsResult = await runGraphql(admin, functionsQuery);
  if (!functionsResult.response.ok) {
    return { functionId: "", error: "Failed to load function list." };
  }

  const functionNodes = functionsResult.json?.data?.shopifyFunctions?.nodes ?? [];
  const discountFunction =
    functionNodes.find(
      (node) =>
        String(node?.apiType || "").toLowerCase().startsWith("discount") &&
        String(node?.title || "").toLowerCase().includes("category-tier-discount-native"),
    ) ||
    functionNodes.find(
      (node) =>
        String(node?.apiType || "").toLowerCase().startsWith("discount") &&
        String(node?.app?.title || "").toLowerCase().includes("student_discount"),
    ) ||
    functionNodes.find((node) => String(node?.apiType || "").toLowerCase().startsWith("discount"));

  if (!discountFunction?.id) {
    return { functionId: "", error: "No discount function found for this app." };
  }

  return { functionId: discountFunction.id, error: "" };
}

async function fetchExistingDiscount(admin, discountNodeId) {
  if (!discountNodeId) return null;
  const query = `#graphql
    query ExistingCodeDiscount($id: ID!) {
      node(id: $id) {
        __typename
        ... on DiscountCodeNode {
          id
          codeDiscount {
            __typename
            ... on DiscountCodeApp {
              title
              codes(first: 1) {
                nodes {
                  code
                }
              }
              metafield(
                namespace: "$app:category-tier-discount-native"
                key: "function-configuration"
              ) {
                value
              }
            }
          }
        }
        ... on DiscountCodeApp {
          discountId
          title
          codes(first: 1) {
            nodes {
              code
            }
          }
          metafield(
            namespace: "$app:category-tier-discount-native"
            key: "function-configuration"
          ) {
            value
          }
        }
      }
    }
  `;

  const result = await runGraphql(admin, query, { id: discountNodeId });
  if (!result.response.ok) return null;

  const node = result.json?.data?.node;
  if (!node) return null;

  let effectiveNodeId = discountNodeId;
  let discount = null;
  if (node.__typename === "DiscountCodeNode") {
    effectiveNodeId = node.id || discountNodeId;
    discount = node.codeDiscount;
  } else if (node.__typename === "DiscountCodeApp") {
    effectiveNodeId = node.discountId || discountNodeId;
    discount = node;
  }

  if (!discount || discount.__typename !== "DiscountCodeApp") return null;

  const code = discount.codes?.nodes?.[0]?.code || discount.title || "";
  return {
    discountNodeId: effectiveNodeId,
    code,
    config: parseConfig(discount.metafield?.value),
  };
}

export const loader = async ({ request }) => {
  let admin = null;
  try {
    ({ admin } = await authenticate.admin(request));
  } catch {
    return { existing: null, collections: [], unavailable: true };
  }
  const url = new URL(request.url);
  const discountNodeId = normalizeDiscountNodeId(
    url.searchParams.get("id") ||
      url.searchParams.get("discountId") ||
      url.searchParams.get("discountNodeId"),
  );

  const existing = await fetchExistingDiscount(admin, discountNodeId);
  const collections = await fetchCollections(admin);
  return { existing, collections, unavailable: false };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const discountNodeId = normalizeDiscountNodeId(formData.get("discountNodeId"));
  const code = String(formData.get("code") || "").trim().toUpperCase();

  const config = {
    ipadPercentage: clampPercentage(formData.get("ipadPercentage"), DEFAULT_CONFIG.ipadPercentage),
    macPercentage: clampPercentage(formData.get("macPercentage"), DEFAULT_CONFIG.macPercentage),
    accessoriesPercentage: clampPercentage(
      formData.get("accessoriesPercentage"),
      DEFAULT_CONFIG.accessoriesPercentage,
    ),
    iphonePercentage: clampPercentage(
      formData.get("iphonePercentage"),
      DEFAULT_CONFIG.iphonePercentage,
    ),
    appleWatchPercentage: clampPercentage(
      formData.get("appleWatchPercentage"),
      DEFAULT_CONFIG.appleWatchPercentage,
    ),
    tvHomePercentage: clampPercentage(formData.get("tvHomePercentage"), DEFAULT_CONFIG.tvHomePercentage),
    airpodsPercentage: clampPercentage(
      formData.get("airpodsPercentage"),
      DEFAULT_CONFIG.airpodsPercentage,
    ),
  };
  const rules = parseRulesInput(formData.get("rules"));
  config.rules = rules;
  config.collectionIds = rules.map((rule) => rule.collectionId);

  if (!code) {
    return { ok: false, error: "Please enter a discount code." };
  }

  if (discountNodeId) {
    return {
      ok: false,
      mode: "edit",
      discountNodeId,
      code,
      config,
      error: "Editing existing discounts is disabled.",
      userErrors: [],
    };
  }

  const { functionId, error } = await resolveDiscountFunction(admin);
  if (!functionId) {
    return { ok: false, error };
  }

  const createMutation = `#graphql
    mutation CreateCodeDiscount($codeAppDiscount: DiscountCodeAppInput!) {
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
  `;

  const createVariables = {
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
          value: JSON.stringify(config),
        },
      ],
    },
  };

  const result = await runGraphql(admin, createMutation, createVariables);
  const userErrors = result.json?.data?.discountCodeAppCreate?.userErrors ?? [];
  return {
    ok: result.response.ok && userErrors.length === 0,
    mode: "create",
    functionId,
    code,
    config,
    result: result.json,
    userErrors,
  };
};

function buildInitialRulePercentages(config, collections) {
  const byCollectionId = {};

  for (const rule of config?.rules ?? []) {
    byCollectionId[rule.collectionId] = rule.percentage;
  }

  if (Object.keys(byCollectionId).length) return byCollectionId;

  for (const field of LEGACY_COLLECTION_FIELDS) {
    if (collections.some((collection) => collection.id === field.collectionId)) {
      byCollectionId[field.collectionId] = config?.[field.key] ?? field.defaultPercentage;
    }
  }

  return byCollectionId;
}

function buildRules(collections, rulePercentages) {
  return collections
    .map((collection) => ({
      collectionId: collection.id,
      collectionTitle: collection.title,
      percentage: clampPercentage(rulePercentages[collection.id], 0),
    }))
    .filter((rule) => rule.percentage > 0);
}

export default function Index() {
  const { existing, collections, unavailable } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [discountNodeId] = useState(existing?.discountNodeId || "");
  const [code, setCode] = useState(existing?.code || "");

  const [ipadPercentage, setIpadPercentage] = useState(
    existing?.config?.ipadPercentage ?? DEFAULT_CONFIG.ipadPercentage,
  );
  const [macPercentage, setMacPercentage] = useState(
    existing?.config?.macPercentage ?? DEFAULT_CONFIG.macPercentage,
  );
  const [accessoriesPercentage, setAccessoriesPercentage] = useState(
    existing?.config?.accessoriesPercentage ?? DEFAULT_CONFIG.accessoriesPercentage,
  );
  const [iphonePercentage, setIphonePercentage] = useState(
    existing?.config?.iphonePercentage ?? DEFAULT_CONFIG.iphonePercentage,
  );
  const [appleWatchPercentage, setAppleWatchPercentage] = useState(
    existing?.config?.appleWatchPercentage ?? DEFAULT_CONFIG.appleWatchPercentage,
  );
  const [tvHomePercentage, setTvHomePercentage] = useState(
    existing?.config?.tvHomePercentage ?? DEFAULT_CONFIG.tvHomePercentage,
  );
  const [airpodsPercentage, setAirpodsPercentage] = useState(
    existing?.config?.airpodsPercentage ?? DEFAULT_CONFIG.airpodsPercentage,
  );
  const [rulePercentages, setRulePercentages] = useState(() =>
    buildInitialRulePercentages(existing?.config, collections ?? []),
  );

  const isEdit = Boolean(discountNodeId);
  const isSubmitting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data?.ok) {
      shopify.toast.show(isEdit ? "Discount updated" : "Discount code created");
    } else if (fetcher.data?.error || (fetcher.data?.userErrors?.length ?? 0) > 0) {
      shopify.toast.show("Failed to save discount");
    }
  }, [fetcher.data, shopify, isEdit]);

  const submitForm = () => {
    if (isEdit) return;
    const rules = buildRules(collections ?? [], rulePercentages);
    const form = new FormData();
    if (discountNodeId) form.set("discountNodeId", discountNodeId);
    form.set("code", code);
    form.set("ipadPercentage", String(ipadPercentage));
    form.set("macPercentage", String(macPercentage));
    form.set("accessoriesPercentage", String(accessoriesPercentage));
    form.set("iphonePercentage", String(iphonePercentage));
    form.set("appleWatchPercentage", String(appleWatchPercentage));
    form.set("tvHomePercentage", String(tvHomePercentage));
    form.set("airpodsPercentage", String(airpodsPercentage));
    form.set("rules", JSON.stringify(rules));
    fetcher.submit(form, { method: "POST" });
  };

  return (
    <s-page heading="Combined Student Discount Manager">
      {unavailable ? (
        <s-section heading="Session unavailable">
          <s-paragraph>Please open this discount from Shopify Admin again.</s-paragraph>
        </s-section>
      ) : null}
      <s-section heading={isEdit ? "Edit code discount" : "Create code discount in Shopify"}>
        <s-paragraph>
          {isEdit
            ? "Editing is disabled for existing discounts."
            : "Enter code and collection percentages before creating."}
        </s-paragraph>

        <s-stack gap="base">
          <s-text-field
            label="Discount code"
            value={code}
            disabled={isEdit}
            onChange={(event) => setCode(String(event.currentTarget.value || "").toUpperCase())}
          />

          {(collections ?? []).length ? (
            <s-stack gap="base">
              {(collections ?? []).map((collection) => (
                <s-number-field
                  key={collection.id}
                  label={`${collection.title} %`}
                  min={0}
                  max={100}
                  suffix="%"
                  value={String(rulePercentages[collection.id] ?? 0)}
                  disabled={isEdit}
                  onChange={(event) =>
                    setRulePercentages((previous) => ({
                      ...previous,
                      [collection.id]: clampPercentage(
                        event.currentTarget.value,
                        previous[collection.id] ?? 0,
                      ),
                    }))
                  }
                />
              ))}
            </s-stack>
          ) : (
            <s-stack gap="base">
              <s-number-field
                label="iPad %"
                min={0}
                max={100}
                suffix="%"
                value={String(ipadPercentage)}
                disabled={isEdit}
                onChange={(event) =>
                  setIpadPercentage(clampPercentage(event.currentTarget.value, ipadPercentage))
                }
              />
              <s-number-field
                label="Mac %"
                min={0}
                max={100}
                suffix="%"
                value={String(macPercentage)}
                disabled={isEdit}
                onChange={(event) =>
                  setMacPercentage(clampPercentage(event.currentTarget.value, macPercentage))
                }
              />
              <s-number-field
                label="Accessories %"
                min={0}
                max={100}
                suffix="%"
                value={String(accessoriesPercentage)}
                disabled={isEdit}
                onChange={(event) =>
                  setAccessoriesPercentage(
                    clampPercentage(event.currentTarget.value, accessoriesPercentage),
                  )
                }
              />
              <s-number-field
                label="iPhone %"
                min={0}
                max={100}
                suffix="%"
                value={String(iphonePercentage)}
                disabled={isEdit}
                onChange={(event) =>
                  setIphonePercentage(clampPercentage(event.currentTarget.value, iphonePercentage))
                }
              />
              <s-number-field
                label="Apple Watch %"
                min={0}
                max={100}
                suffix="%"
                value={String(appleWatchPercentage)}
                disabled={isEdit}
                onChange={(event) =>
                  setAppleWatchPercentage(
                    clampPercentage(event.currentTarget.value, appleWatchPercentage),
                  )
                }
              />
              <s-number-field
                label="TV & Home %"
                min={0}
                max={100}
                suffix="%"
                value={String(tvHomePercentage)}
                disabled={isEdit}
                onChange={(event) =>
                  setTvHomePercentage(clampPercentage(event.currentTarget.value, tvHomePercentage))
                }
              />
              <s-number-field
                label="AirPods %"
                min={0}
                max={100}
                suffix="%"
                value={String(airpodsPercentage)}
                disabled={isEdit}
                onChange={(event) =>
                  setAirpodsPercentage(clampPercentage(event.currentTarget.value, airpodsPercentage))
                }
              />
            </s-stack>
          )}
        </s-stack>

        <s-stack direction="inline" gap="base">
          <s-button
            onClick={submitForm}
            disabled={isEdit}
            {...(isSubmitting ? { loading: true } : {})}
          >
            {isEdit ? "Save changes" : "Create code discount"}
          </s-button>
        </s-stack>
      </s-section>

      {fetcher.data ? (
        <s-section heading="Result">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre style={{ margin: 0 }}>
              <code>{JSON.stringify(fetcher.data, null, 2)}</code>
            </pre>
          </s-box>
        </s-section>
      ) : null}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
