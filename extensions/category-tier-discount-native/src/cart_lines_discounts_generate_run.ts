import {
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

type TierConfig = {
  ipadPercentage: number;
  macPercentage: number;
  accessoriesPercentage: number;
  iphonePercentage: number;
  appleWatchPercentage: number;
  tvHomePercentage: number;
};

type RuleConfig = Partial<TierConfig> & {
  collectionIds?: string[];
  rules?: {
    instituteKey?: string;
    categoryKey?: string;
    collectionId?: string;
    collectionTitle?: string;
    percentage?: number;
  }[];
};

type MatchedRule = {
  categoryKey?: string;
  collectionId?: string;
  collectionTitle?: string;
  percentage: number;
};

type CartLineDiscountMatch = {
  percentage: number;
  targetLineId: string;
};

type ProductLineProduct = Extract<
  CartInput["cart"]["lines"][number]["merchandise"],
  { __typename: "ProductVariant" }
>["product"];

type CartLine = CartInput["cart"]["lines"][number];
type BundleProduct = {
  title?: string;
};

type BundleMerchandise = {
  __typename?: string;
  title?: string;
  product?: BundleProduct;
};

const DEFAULT_CONFIG: TierConfig = {
  ipadPercentage: 8,
  macPercentage: 13,
  accessoriesPercentage: 5,
  iphonePercentage: 0,
  appleWatchPercentage: 0,
  tvHomePercentage: 0,
};

const ZERO_CONFIG: TierConfig = {
  ipadPercentage: 0,
  macPercentage: 0,
  accessoriesPercentage: 0,
  iphonePercentage: 0,
  appleWatchPercentage: 0,
  tvHomePercentage: 0,
};

function clampPercentage(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  if (numberValue < 0) return 0;
  if (numberValue > 100) return 100;
  return numberValue;
}

function parseConfig(rawValue: string | undefined | null): RuleConfig {
  try {
    return JSON.parse(String(rawValue || "{}")) as RuleConfig;
  } catch {
    return {};
  }
}

function readTierConfig(config: RuleConfig): TierConfig {
  return {
    ipadPercentage: clampPercentage(config.ipadPercentage, DEFAULT_CONFIG.ipadPercentage),
    macPercentage: clampPercentage(config.macPercentage, DEFAULT_CONFIG.macPercentage),
    accessoriesPercentage: clampPercentage(config.accessoriesPercentage, DEFAULT_CONFIG.accessoriesPercentage),
    iphonePercentage: clampPercentage(config.iphonePercentage, DEFAULT_CONFIG.iphonePercentage),
    appleWatchPercentage: clampPercentage(config.appleWatchPercentage, DEFAULT_CONFIG.appleWatchPercentage),
    tvHomePercentage: clampPercentage(config.tvHomePercentage, DEFAULT_CONFIG.tvHomePercentage),
  };
}

function readAutomaticConfig(rawValue: string | undefined | null): RuleConfig {
  if (!rawValue) return { ...ZERO_CONFIG, rules: [], collectionIds: [] };

  try {
    const parsed = JSON.parse(String(rawValue || "{}")) as RuleConfig;
    return {
      ipadPercentage: clampPercentage(parsed.ipadPercentage, 0),
      macPercentage: clampPercentage(parsed.macPercentage, 0),
      accessoriesPercentage: clampPercentage(parsed.accessoriesPercentage, 0),
      iphonePercentage: clampPercentage(parsed.iphonePercentage, 0),
      appleWatchPercentage: clampPercentage(parsed.appleWatchPercentage, 0),
      tvHomePercentage: clampPercentage(parsed.tvHomePercentage, 0),
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      collectionIds: Array.isArray(parsed.collectionIds) ? parsed.collectionIds : [],
    };
  } catch {
    return { ...ZERO_CONFIG, rules: [], collectionIds: [] };
  }
}

function getBuyerInstituteKey(input: CartInput): string {
  return String(input.cart.buyerIdentity?.customer?.metafield?.value || "").trim();
}

function isCollectionMember(memberships: unknown): boolean {
  if (typeof memberships === "boolean") return memberships;
  if (!Array.isArray(memberships)) return false;

  return memberships.some((membership) => Boolean(membership?.isMember));
}

function readRuleConfig(input: CartInput, config: RuleConfig): MatchedRule[] {
  if (!Array.isArray(config.rules)) return [];

  const buyerInstituteKey = getBuyerInstituteKey(input);

  return config.rules
    .filter((rule) => {
      const instituteKey = String(rule.instituteKey || "").trim();
      return !instituteKey || (buyerInstituteKey && instituteKey === buyerInstituteKey);
    })
    .map((rule) => ({
      categoryKey: String(rule.categoryKey || "").trim(),
      collectionId: String(rule.collectionId || "").trim(),
      collectionTitle: String(rule.collectionTitle || "").trim(),
      percentage: clampPercentage(rule.percentage, 0),
    }))
    .filter((rule) => (rule.categoryKey || rule.collectionId) && rule.percentage > 0);
}

function getDynamicCollectionMemberships(product: ProductLineProduct): {collectionId: string; isMember: boolean}[] {
  const memberships = (product as ProductLineProduct & {
    dynamicCollections?: {collectionId?: string; isMember?: boolean}[];
  }).dynamicCollections;

  if (!Array.isArray(memberships)) return [];

  return memberships
    .map((membership) => ({
      collectionId: String(membership.collectionId || "").trim(),
      isMember: Boolean(membership.isMember),
    }))
    .filter((membership) => membership.collectionId);
}

function getLinePercentageFromRules(product: ProductLineProduct, rules: MatchedRule[]): number {
  let maxPercentage = 0;
  const dynamicMemberships = getDynamicCollectionMemberships(product);

  for (const rule of rules) {
    const isMatch =
      (rule.collectionId &&
        dynamicMemberships.some(
          (membership) => membership.collectionId === rule.collectionId && membership.isMember,
        )) ||
      (rule.categoryKey === "ipad" && isCollectionMember(product.ipad)) ||
      (rule.categoryKey === "mac" && isCollectionMember(product.mac)) ||
      (rule.categoryKey === "accessories" && isCollectionMember(product.accessories));

    if (isMatch) {
      maxPercentage = Math.max(maxPercentage, rule.percentage);
    }
  }

  return maxPercentage;
}

function getBundleRulePercentage(input: CartInput, config: RuleConfig): number {
  const rules = readRuleConfig(input, config);

  return rules.reduce((maxPercentage, rule) => {
    const title = String(rule.collectionTitle || "").toLowerCase();
    if (!title.includes("bundle")) return maxPercentage;

    return Math.max(maxPercentage, rule.percentage);
  }, 0);
}

function getBundleOnlyRulePercentage(input: CartInput, config: RuleConfig): number {
  const rules = readRuleConfig(input, config);
  if (!rules.length) return 0;

  let maxPercentage = 0;
  for (const rule of rules) {
    const title = String(rule.collectionTitle || "").toLowerCase();
    if (!title.includes("bundle")) return 0;
    maxPercentage = Math.max(maxPercentage, rule.percentage);
  }

  return maxPercentage;
}

function isBundleProduct(product: BundleProduct): boolean {
  const productText = String(product.title || "").toLowerCase();

  return productText.includes("bundle");
}

function isBundleMerchandise(merchandise: BundleMerchandise): boolean {
  if (merchandise.__typename === "CustomProduct") {
    return String(merchandise.title || "")
      .toLowerCase()
      .includes("bundle");
  }

  if (merchandise.__typename === "ProductVariant" && merchandise.product) {
    return isBundleProduct(merchandise.product);
  }

  return false;
}

function getLinePercentage(input: CartInput, product: ProductLineProduct, config: RuleConfig): number {
  const rules = readRuleConfig(input, config);
  if (rules.length) return getLinePercentageFromRules(product, rules);

  const tierConfig = readTierConfig(config);
  return Math.max(
    isCollectionMember(product.mac) ? tierConfig.macPercentage : 0,
    isCollectionMember(product.ipad) ? tierConfig.ipadPercentage : 0,
    isCollectionMember(product.accessories) ? tierConfig.accessoriesPercentage : 0,
    0,
  );
}

function getParentProduct(line: CartLine): ProductLineProduct | null {
  const parentMerchandise = line.parentRelationship?.parent?.merchandise;
  if (parentMerchandise?.__typename !== "ProductVariant") return null;

  return parentMerchandise.product as ProductLineProduct;
}

function getParentMerchandise(line: CartLine): BundleMerchandise | null {
  return line.parentRelationship?.parent?.merchandise ?? null;
}

function getParentLineId(line: CartLine): string | null {
  return line.parentRelationship?.parent?.id ?? null;
}

function getCartLineDiscountMatch(
  input: CartInput,
  line: CartLine,
  config: RuleConfig,
): CartLineDiscountMatch | null {
  if (line.merchandise.__typename !== "ProductVariant") return null;
  const targetLineId = getParentLineId(line) || line.id;

  const productPercentage = getLinePercentage(input, line.merchandise.product, config);
  if (productPercentage > 0) {
    return {
      percentage: productPercentage,
      targetLineId,
    };
  }

  const parentProduct = getParentProduct(line);
  if (!parentProduct) return null;

  const parentPercentage = getLinePercentage(input, parentProduct, config);
  if (parentPercentage <= 0) return null;

  return {
    percentage: parentPercentage,
    targetLineId,
  };
}

function getBundleFallbackDiscountMatch(
  input: CartInput,
  line: CartLine,
  config: RuleConfig,
): CartLineDiscountMatch | null {
  const bundlePercentage = getBundleRulePercentage(input, config);
  if (bundlePercentage <= 0) return null;

  if (isBundleMerchandise(line.merchandise)) {
    return {
      percentage: bundlePercentage,
      targetLineId: line.id,
    };
  }

  const parentMerchandise = getParentMerchandise(line);
  if (!parentMerchandise || !isBundleMerchandise(parentMerchandise)) return null;

  return {
    percentage: bundlePercentage,
    targetLineId: getParentLineId(line) || line.id,
  };
}

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    return {operations: []};
  }

  const discountClasses =
    (input.discount as CartInput["discount"] & {discountClasses?: string[]}).discountClasses ?? [];
  const hasProductDiscountClass = discountClasses.includes("PRODUCT");

  if (!hasProductDiscountClass) {
    return {operations: []};
  }

  const codeConfig = parseConfig(input.discount.discountConfig?.value);
  const automaticConfig = readAutomaticConfig(input.discount.automaticConfig?.value);
  const productLineIdsByPercent: Record<number, Set<string>> = {};
  const codeEligibleLineIds = new Set<string>();
  const bundleOnlyPercentage = getBundleOnlyRulePercentage(input, codeConfig);
  const resolvedPercentageByTargetLineId: Record<string, number> = {};

  for (const line of input.cart.lines) {
    if (bundleOnlyPercentage > 0) {
      codeEligibleLineIds.add(getParentLineId(line) || line.id);
    }

    if (
      getCartLineDiscountMatch(input, line, automaticConfig) ||
      getBundleFallbackDiscountMatch(input, line, automaticConfig)
    ) {
      continue;
    }

    const match =
      getCartLineDiscountMatch(input, line, codeConfig) ||
      getBundleFallbackDiscountMatch(input, line, codeConfig);

    if (!match) continue;
    const existingPercentage = resolvedPercentageByTargetLineId[match.targetLineId] ?? 0;
    resolvedPercentageByTargetLineId[match.targetLineId] = Math.max(
      existingPercentage,
      match.percentage,
    );
  }

  for (const [targetLineId, percentage] of Object.entries(resolvedPercentageByTargetLineId)) {
    if (!productLineIdsByPercent[percentage]) {
      productLineIdsByPercent[percentage] = new Set<string>();
    }
    productLineIdsByPercent[percentage].add(targetLineId);
  }

  if (
    !Object.keys(productLineIdsByPercent).length &&
    bundleOnlyPercentage > 0 &&
    codeEligibleLineIds.size > 0
  ) {
    productLineIdsByPercent[bundleOnlyPercentage] = codeEligibleLineIds;
  }

  const candidates = Object.entries(productLineIdsByPercent).map(
    ([percentage, lineIds]) => ({
      message: `${percentage}% category discount`,
      targets: Array.from(lineIds).map((id) => ({
        cartLine: {
          id,
        },
      })),
      value: {
        percentage: {
          value: Number(percentage),
        },
      },
    }),
  );

  if (!candidates.length) {
    return {operations: []};
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
