import { describe, expect, test } from "vitest";
import { DiscountClass, CartInput } from "../generated/api";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";

const BUNDLES_COLLECTION_ID = "gid://shopify/Collection/999";

describe("cartLinesDiscountsGenerateRun", () => {
  test("applies a dynamic collection rule to a bundle parent product line", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-1",
            parentRelationship: {
              parent: {
                id: "gid://shopify/CartLine/bundle-parent",
                merchandise: {
                  __typename: "ProductVariant",
                  product: {
                    dynamicCollections: [
                      {
                        collectionId: BUNDLES_COLLECTION_ID,
                        isMember: true,
                      },
                    ],
                  },
                },
              },
            },
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "iPad Component",
                ipad: false,
                mac: false,
                accessories: false,
                dynamicCollections: [
                  {
                    collectionId: BUNDLES_COLLECTION_ID,
                    isMember: false,
                  },
                ],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        discountConfig: {
          value: JSON.stringify({
            rules: [
              {
                collectionId: BUNDLES_COLLECTION_ID,
                collectionTitle: "Bundles",
                percentage: 10,
              },
            ],
            collectionIds: [BUNDLES_COLLECTION_ID],
          }),
        },
        automaticConfig: {
          value: JSON.stringify({ rules: [], collectionIds: [] }),
        },
      },
    } as CartInput;

    expect(cartLinesDiscountsGenerateRun(input)).toEqual({
      operations: [
        {
          productDiscountsAdd: {
            candidates: [
              {
                message: "10% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/component-1",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 10,
                  },
                },
              },
            ],
            selectionStrategy: "ALL",
          },
        },
      ],
    });
  });

  test("applies a bundle title rule when parent collection membership is unavailable", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-1",
            parentRelationship: {
              parent: {
                id: "gid://shopify/CartLine/bundle-parent",
                merchandise: {
                  __typename: "ProductVariant",
                  product: {
                    dynamicCollections: [
                      {
                        collectionId: BUNDLES_COLLECTION_ID,
                        isMember: false,
                      },
                    ],
                  },
                },
              },
            },
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "iPad Component",
                ipad: false,
                mac: false,
                accessories: false,
                dynamicCollections: [
                  {
                    collectionId: BUNDLES_COLLECTION_ID,
                    isMember: false,
                  },
                ],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        discountConfig: {
          value: JSON.stringify({
            rules: [
              {
                collectionId: BUNDLES_COLLECTION_ID,
                collectionTitle: "All Bundles",
                percentage: 10,
              },
            ],
            collectionIds: [BUNDLES_COLLECTION_ID],
          }),
        },
        automaticConfig: {
          value: JSON.stringify({ rules: [], collectionIds: [] }),
        },
      },
    } as CartInput;

    expect(cartLinesDiscountsGenerateRun(input)).toEqual({
      operations: [
        {
          productDiscountsAdd: {
            candidates: [
              {
                message: "10% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/component-1",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 10,
                  },
                },
              },
            ],
            selectionStrategy: "ALL",
          },
        },
      ],
    });
  });

  test("applies a bundle title rule to a top-level bundle product", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/top-level-bundle",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "Primary Years Learning Bundle",
                ipad: false,
                mac: false,
                accessories: false,
                dynamicCollections: [
                  {
                    collectionId: BUNDLES_COLLECTION_ID,
                    isMember: false,
                  },
                ],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        discountConfig: {
          value: JSON.stringify({
            rules: [
              {
                collectionId: BUNDLES_COLLECTION_ID,
                collectionTitle: "All Bundles",
                percentage: 10,
              },
            ],
            collectionIds: [BUNDLES_COLLECTION_ID],
          }),
        },
        automaticConfig: {
          value: JSON.stringify({ rules: [], collectionIds: [] }),
        },
      },
    } as CartInput;

    expect(cartLinesDiscountsGenerateRun(input)).toEqual({
      operations: [
        {
          productDiscountsAdd: {
            candidates: [
              {
                message: "10% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/top-level-bundle",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 10,
                  },
                },
              },
            ],
            selectionStrategy: "ALL",
          },
        },
      ],
    });
  });
});
