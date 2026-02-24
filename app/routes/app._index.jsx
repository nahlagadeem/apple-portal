import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

async function runGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();
  return { response, json };
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const mode = String(formData.get("mode") || "code");

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
    return {
      ok: false,
      error: "Failed to load function list.",
      body: functionsResult.json,
    };
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
    return {
      ok: false,
      error: "No discount function found for this app.",
      functionNodes,
    };
  }

  const now = new Date().toISOString();

  if (mode === "code") {
    const code = `CAT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const title = code;
    const mutation = `#graphql
      mutation CreateCodeDiscount($codeAppDiscount: DiscountCodeAppInput!) {
        discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
          codeAppDiscount {
            discountId
            title
            codes(first: 10) {
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

    const variables = {
      codeAppDiscount: {
        title,
        code,
        functionId: discountFunction.id,
        startsAt: now,
        discountClasses: ["PRODUCT"],
        combinesWith: {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: false,
        },
      },
    };

    const result = await runGraphql(admin, mutation, variables);
    const userErrors = result.json?.data?.discountCodeAppCreate?.userErrors ?? [];

    return {
      ok: result.response.ok && userErrors.length === 0,
      mode,
      functionId: discountFunction.id,
      code,
      result: result.json,
      userErrors,
    };
  }

  const mutation = `#graphql
    mutation CreateAutomaticDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount {
          discountId
          title
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    automaticAppDiscount: {
      title,
      functionId: discountFunction.id,
      startsAt: now,
      discountClasses: ["PRODUCT"],
      combinesWith: {
        orderDiscounts: false,
        productDiscounts: false,
        shippingDiscounts: false,
      },
    },
  };

  const result = await runGraphql(admin, mutation, variables);
  const userErrors = result.json?.data?.discountAutomaticAppCreate?.userErrors ?? [];

  return {
    ok: result.response.ok && userErrors.length === 0,
    mode: "automatic",
    functionId: discountFunction.id,
    result: result.json,
    userErrors,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isSubmitting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data?.ok) {
      shopify.toast.show("Discount created in Shopify admin");
    } else if (fetcher.data?.error || (fetcher.data?.userErrors?.length ?? 0) > 0) {
      shopify.toast.show("Failed to create discount");
    }
  }, [fetcher.data, shopify]);

  const createCode = () => {
    const form = new FormData();
    form.set("mode", "code");
    fetcher.submit(form, { method: "POST" });
  };

  return (
    <s-page heading="Category Tier Discount Manager">
      <s-section heading="Create code discount in Shopify">
        <s-paragraph>
          This creates a Shopify Function code discount for your existing logic:
          iPad 8%, Mac 13%, Accessories 5%.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={createCode}
            {...(isSubmitting ? { loading: true } : {})}
          >
            Create code discount
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

