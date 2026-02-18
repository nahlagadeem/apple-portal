import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnv() {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(thisDir, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const shop = (process.env.LIVE_SHOP_DOMAIN || "").trim();
const token = (process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || "").trim();

if (!shop) {
  console.error("Missing LIVE_SHOP_DOMAIN in environment.");
  process.exit(1);
}

if (!token) {
  console.error("Missing SHOPIFY_ADMIN_TOKEN (or SHOPIFY_ADMIN_API_ACCESS_TOKEN) in environment.");
  process.exit(1);
}

const code = `STUDENT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const query = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

const variables = {
  basicCodeDiscount: {
    title: `Student Discount ${code}`,
    code,
    startsAt: new Date().toISOString(),
    customerSelection: { all: true },
    customerGets: {
      value: { percentage: 0.1 },
      items: { all: true },
    },
    usageLimit: 1,
  },
};

const endpoint = `https://${shop}/admin/api/2026-01/graphql.json`;
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  },
  body: JSON.stringify({ query, variables }),
});

const body = await response.json().catch(() => null);

if (!response.ok) {
  console.error("HTTP error from Shopify Admin API:", response.status, body);
  process.exit(2);
}

const userErrors = body?.data?.discountCodeBasicCreate?.userErrors ?? [];
if (userErrors.length > 0) {
  console.error("Shopify returned userErrors:", userErrors);
  process.exit(3);
}

const id = body?.data?.discountCodeBasicCreate?.codeDiscountNode?.id;
console.log(JSON.stringify({ ok: true, shop, code, id }, null, 2));
