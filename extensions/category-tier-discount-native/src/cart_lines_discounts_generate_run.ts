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
  rules?: {
    instituteKey?: string;
    categoryKey?: string;
    percentage?: number;
  }[];
};

type MatchedRule = {
  categoryKey: string;
  percentage: number;
};

type ProductLineProduct = Extract<
  CartInput["cart"]["lines"][number]["merchandise"],
  { __typename: "ProductVariant" }
>["product"];

const DEFAULT_CONFIG: TierConfig = {
  ipadPercentage: 8,
  macPercentage: 13,
  accessoriesPercentage: 5,
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

function getBuyerInstituteKey(input: CartInput): string {
  return String(input.cart.buyerIdentity?.customer?.metafield?.value || "").trim();
}

function isCollectionMember(memberships: { isMember: boolean }[]): boolean {
  return memberships.some((membership) => membership.isMember);
}

function readRuleConfig(input: CartInput, config: RuleConfig): MatchedRule[] {
  if (!Array.isArray(config.rules)) return [];

  const buyerInstituteKey = getBuyerInstituteKey(input);
  if (!buyerInstituteKey) return [];

  return config.rules
    .filter((rule) => String(rule.instituteKey || "").trim() === buyerInstituteKey)
    .map((rule) => ({
      categoryKey: String(rule.categoryKey || "").trim(),
      percentage: clampPercentage(rule.percentage, 0),
    }))
    .filter((rule) => rule.categoryKey && rule.percentage > 0);
}

function getLinePercentageFromRules(product: ProductLineProduct, rules: MatchedRule[]): number {
  let maxPercentage = 0;

  for (const rule of rules) {
    const isMatch =
      (rule.categoryKey === "ipad" && isCollectionMember(product.ipad)) ||
      (rule.categoryKey === "mac" && isCollectionMember(product.mac)) ||
      (rule.categoryKey === "accessories" && isCollectionMember(product.accessories)) ||
      (rule.categoryKey === "iphone" && isCollectionMember(product.iphone)) ||
      (rule.categoryKey === "apple-watch" && isCollectionMember(product.appleWatch)) ||
      (rule.categoryKey === "tv-home" && isCollectionMember(product.tvHome));

    if (isMatch) {
      maxPercentage = Math.max(maxPercentage, rule.percentage);
    }
  }

  return maxPercentage;
}

function getLinePercentage(input: CartInput, product: ProductLineProduct, config: RuleConfig): number {
  const rules = readRuleConfig(input, config);
  if (rules.length) return getLinePercentageFromRules(product, rules);

  const tierConfig = readTierConfig(config);
  return Math.max(
    isCollectionMember(product.mac) ? tierConfig.macPercentage : 0,
    isCollectionMember(product.ipad) ? tierConfig.ipadPercentage : 0,
    isCollectionMember(product.accessories) ? tierConfig.accessoriesPercentage : 0,
    isCollectionMember(product.iphone) ? tierConfig.iphonePercentage : 0,
    isCollectionMember(product.appleWatch) ? tierConfig.appleWatchPercentage : 0,
    isCollectionMember(product.tvHome) ? tierConfig.tvHomePercentage : 0,
    0,
  );
}

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    return {operations: []};
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    return {operations: []};
  }

  const codeConfig = parseConfig(input.discount.discountConfig?.value);
  const automaticConfig = parseConfig(input.discount.automaticConfig?.value);
  const productLinesByPercent: Record<number, {id: string}[]> =
    {};

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const product = line.merchandise.product;
    if (getLinePercentage(input, product, automaticConfig) > 0) continue;

    const percentage = getLinePercentage(input, product, codeConfig);

    if (percentage <= 0) continue;
    if (!productLinesByPercent[percentage]) {
      productLinesByPercent[percentage] = [];
    }
    productLinesByPercent[percentage].push({id: line.id});
  }

  const candidates = Object.entries(productLinesByPercent).map(
    ([percentage, lines]) => ({
      message: `${percentage}% category discount`,
      targets: lines.map((line) => ({
        cartLine: {
          id: line.id,
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
