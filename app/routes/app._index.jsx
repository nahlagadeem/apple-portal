import { useEffect, useState } from "react";
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

function clampPercentage(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const code = String(formData.get("code") || "").trim().toUpperCase();

  const ipadPercentage = clampPercentage(formData.get("ipadPercentage"), 8);
  const macPercentage = clampPercentage(formData.get("macPercentage"), 13);
  const accessoriesPercentage = clampPercentage(formData.get("accessoriesPercentage"), 5);
  const iphonePercentage = clampPercentage(formData.get("iphonePercentage"), 0);
  const appleWatchPercentage = clampPercentage(formData.get("appleWatchPercentage"), 0);
  const tvHomePercentage = clampPercentage(formData.get("tvHomePercentage"), 0);
  const airpodsPercentage = clampPercentage(formData.get("airpodsPercentage"), 0);

  if (!code) {
    return { ok: false, error: "Please enter a discount code." };
  }

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
      title: code,
      code,
      functionId: discountFunction.id,
      startsAt: now,
      discountClasses: ["PRODUCT"],
      combinesWith: {
        orderDiscounts: false,
        productDiscounts: false,
        shippingDiscounts: false,
      },
      metafields: [
        {
          namespace: "$app:category-tier-discount-native",
          key: "function-configuration",
          type: "json",
          value: JSON.stringify({
            ipadPercentage,
            macPercentage,
            accessoriesPercentage,
            iphonePercentage,
            appleWatchPercentage,
            tvHomePercentage,
            airpodsPercentage,
          }),
        },
      ],
    },
  };

  const result = await runGraphql(admin, mutation, variables);
  const userErrors = result.json?.data?.discountCodeAppCreate?.userErrors ?? [];

  return {
    ok: result.response.ok && userErrors.length === 0,
    functionId: discountFunction.id,
    code,
    config: {
      ipadPercentage,
      macPercentage,
      accessoriesPercentage,
      iphonePercentage,
      appleWatchPercentage,
      tvHomePercentage,
      airpodsPercentage,
    },
    result: result.json,
    userErrors,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [code, setCode] = useState("");

  const [ipadPercentage, setIpadPercentage] = useState(8);
  const [macPercentage, setMacPercentage] = useState(13);
  const [accessoriesPercentage, setAccessoriesPercentage] = useState(5);
  const [iphonePercentage, setIphonePercentage] = useState(0);
  const [appleWatchPercentage, setAppleWatchPercentage] = useState(0);
  const [tvHomePercentage, setTvHomePercentage] = useState(0);
  const [airpodsPercentage, setAirpodsPercentage] = useState(0);

  const isSubmitting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data?.ok) {
      shopify.toast.show("Discount code created");
    } else if (fetcher.data?.error || (fetcher.data?.userErrors?.length ?? 0) > 0) {
      shopify.toast.show("Failed to create discount");
    }
  }, [fetcher.data, shopify]);

  const createCode = () => {
    const form = new FormData();
    form.set("code", code);
    form.set("ipadPercentage", String(ipadPercentage));
    form.set("macPercentage", String(macPercentage));
    form.set("accessoriesPercentage", String(accessoriesPercentage));
    form.set("iphonePercentage", String(iphonePercentage));
    form.set("appleWatchPercentage", String(appleWatchPercentage));
    form.set("tvHomePercentage", String(tvHomePercentage));
    form.set("airpodsPercentage", String(airpodsPercentage));
    fetcher.submit(form, { method: "POST" });
  };

  return (
    <s-page heading="Combined Student Discount Manager">
      <s-section heading="Create code discount in Shopify">
        <s-paragraph>Admin can enter code and set collection percentages before creating.</s-paragraph>
        <s-stack gap="base">
          <s-text-field
            label="Discount code"
            value={code}
            onChange={(event) => setCode(String(event.currentTarget.value || "").toUpperCase())}
          />
          <s-stack direction="inline" gap="base">
            <s-number-field
              label="iPad %"
              min={0}
              max={100}
              suffix="%"
              value={String(ipadPercentage)}
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
              onChange={(event) =>
                setAccessoriesPercentage(
                  clampPercentage(event.currentTarget.value, accessoriesPercentage),
                )
              }
            />
          </s-stack>
          <s-stack direction="inline" gap="base">
            <s-number-field
              label="iPhone %"
              min={0}
              max={100}
              suffix="%"
              value={String(iphonePercentage)}
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
              onChange={(event) =>
                setTvHomePercentage(clampPercentage(event.currentTarget.value, tvHomePercentage))
              }
            />
          </s-stack>
          <s-stack direction="inline" gap="base">
            <s-number-field
              label="AirPods %"
              min={0}
              max={100}
              suffix="%"
              value={String(airpodsPercentage)}
              onChange={(event) =>
                setAirpodsPercentage(clampPercentage(event.currentTarget.value, airpodsPercentage))
              }
            />
          </s-stack>
        </s-stack>
        <s-stack direction="inline" gap="base">
          <s-button onClick={createCode} {...(isSubmitting ? { loading: true } : {})}>
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
