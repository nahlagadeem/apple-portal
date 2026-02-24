import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';


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

  const productLinesByPercent: Record<number, {id: string; quantity: number}[]> =
    {};

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const product = line.merchandise.product;
    const percentage =
      (product.mac.some((membership) => membership.isMember) && 13) ||
      (product.ipad.some((membership) => membership.isMember) && 8) ||
      (product.accessories.some((membership) => membership.isMember) && 5) ||
      0;

    if (percentage <= 0) continue;
    if (!productLinesByPercent[percentage]) {
      productLinesByPercent[percentage] = [];
    }
    productLinesByPercent[percentage].push({id: line.id, quantity: line.quantity});
  }

  const candidates = Object.entries(productLinesByPercent).map(
    ([percentage, lines]) => ({
      message: `${percentage}% category discount`,
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
