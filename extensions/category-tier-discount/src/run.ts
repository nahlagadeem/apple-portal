import type {
  RunInput,
  FunctionRunResult
} from "../generated/api";
import {
  DiscountApplicationStrategy,
} from "../generated/api";

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.All,
  discounts: [],
};

function isInCollection(memberships: Array<{ isMember: boolean }>): boolean {
  return memberships.some((membership) => membership.isMember);
}

export function run(input: RunInput): FunctionRunResult {
  const discountsByPercent: Record<number, { id: string; quantity: number }[]> = {};

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const product = line.merchandise.product;
    const percentage =
      (isInCollection(product.mac) && 13) ||
      (isInCollection(product.ipad) && 8) ||
      (isInCollection(product.accessories) && 5) ||
      0;
    if (percentage <= 0) continue;

    if (!discountsByPercent[percentage]) {
      discountsByPercent[percentage] = [];
    }
    discountsByPercent[percentage].push({ id: line.id, quantity: line.quantity });
  }

  const discounts = Object.entries(discountsByPercent).map(([percentage, lines]) => ({
    message: `${percentage}% student discount`,
    targets: lines.map((line) => ({
      cartLine: {
        id: line.id,
        quantity: line.quantity,
      },
    })),
    value: {
      percentage: {
        value: Number(percentage),
      },
    },
  }));

  if (!discounts.length) {
    return EMPTY_DISCOUNT;
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.All,
    discounts,
  };
}
