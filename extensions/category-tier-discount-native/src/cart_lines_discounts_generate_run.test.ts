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
                merchandise: {
                  __typename: "ProductVariant",
                  product: {
                    title: "Primary Years Learning Bundle",
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

  test("applies a bundle title rule from the parent bundle product", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-1",
            parentRelationship: {
              parent: {
                merchandise: {
                  __typename: "ProductVariant",
                  product: {
                    title: "Primary Years Learning Bundle",
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

  test("applies a bundle title rule to a top-level custom bundle line", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/custom-bundle",
            merchandise: {
              __typename: "CustomProduct",
              title: "Primary Years Learning Bundle",
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
                      id: "gid://shopify/CartLine/custom-bundle",
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

  test("applies a bundle-only rule when Shopify exposes only expanded component lines", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-1",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "11-inch iPad Wi-Fi",
                ipad: true,
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
          {
            id: "gid://shopify/CartLine/component-2",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "Flip Hybrid Case",
                ipad: false,
                mac: false,
                accessories: true,
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
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/component-2",
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

  test("does not apply the bundle-only failsafe when another positive rule is configured", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-1",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "Unmatched Product",
                ipad: false,
                mac: false,
                accessories: false,
                dynamicCollections: [
                  {
                    collectionId: BUNDLES_COLLECTION_ID,
                    isMember: false,
                  },
                  {
                    collectionId: "gid://shopify/Collection/other",
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
              {
                collectionId: "gid://shopify/Collection/other",
                collectionTitle: "Other",
                percentage: 5,
              },
            ],
            collectionIds: [BUNDLES_COLLECTION_ID, "gid://shopify/Collection/other"],
          }),
        },
        automaticConfig: {
          value: JSON.stringify({ rules: [], collectionIds: [] }),
        },
      },
    } as CartInput;

    expect(cartLinesDiscountsGenerateRun(input)).toEqual({ operations: [] });
  });

  test("applies a bundle-only rule even when automatic exclusions match component categories", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-1",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "11-inch iPad Wi-Fi",
                ipad: true,
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
          value: JSON.stringify({
            ipadPercentage: 8,
            rules: [],
            collectionIds: [],
          }),
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
});
