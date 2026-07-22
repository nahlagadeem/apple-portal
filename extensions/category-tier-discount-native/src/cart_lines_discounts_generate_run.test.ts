import { describe, expect, test } from "vitest";
import { DiscountClass, CartInput } from "../generated/api";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";

const BUNDLES_COLLECTION_ID = "gid://shopify/Collection/999";
const IPAD_COLLECTION_ID = "gid://shopify/Collection/1001";
const ACCESSORIES_COLLECTION_ID = "gid://shopify/Collection/1002";

describe("cartLinesDiscountsGenerateRun", () => {
  test("does not apply legacy default percentages when code config is missing", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/mac",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "13-inch MacBook Air",
                ipad: false,
                mac: true,
                accessories: false,
                dynamicCollections: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        automaticConfig: {
          value: JSON.stringify({ rules: [], collectionIds: [] }),
        },
      },
    } as CartInput;

    expect(cartLinesDiscountsGenerateRun(input)).toEqual({operations: []});
  });

  test("does not apply legacy default percentages when code config is malformed", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/mac",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "13-inch MacBook Air",
                ipad: false,
                mac: true,
                accessories: false,
                dynamicCollections: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        discountConfig: {
          value: "{not-json",
        },
        automaticConfig: {
          value: JSON.stringify({ rules: [], collectionIds: [] }),
        },
      },
    } as CartInput;

    expect(cartLinesDiscountsGenerateRun(input)).toEqual({operations: []});
  });

  test("applies the configured category percentages to iPad and Mac cart lines", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/ipad",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "11-inch iPad Wi-Fi",
                ipad: true,
                mac: false,
                accessories: false,
                dynamicCollections: [],
              },
            },
          },
          {
            id: "gid://shopify/CartLine/mac",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "13-inch MacBook Air M5-16GB",
                ipad: false,
                mac: true,
                accessories: false,
                dynamicCollections: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        discountConfig: {
          value: JSON.stringify({
            ipadPercentage: 8,
            macPercentage: 13,
            accessoriesPercentage: 5,
            rules: [],
            collectionIds: [],
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
                message: "13% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/mac",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 13,
                  },
                },
              },
              {
                message: "8% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/ipad",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 8,
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

  test("targets the bundle parent when a bundle component matches the collection directly", () => {
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
                ipad: true,
                mac: false,
                accessories: false,
                dynamicCollections: [
                  {
                    collectionId: BUNDLES_COLLECTION_ID,
                    isMember: true,
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

  test("applies a bundle title rule from the bundle component line", () => {
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

  test("applies a legacy namespace bundle config to a top-level bundle product", () => {
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
        discountConfig: null,
        legacyDiscountConfig: {
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

  test("uses the highest percentage when mixed bundle components share a bundle", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-ipad",
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
                title: "11-inch iPad Wi-Fi",
                ipad: true,
                mac: false,
                accessories: false,
                dynamicCollections: [
                  {
                    collectionId: IPAD_COLLECTION_ID,
                    isMember: true,
                  },
                ],
              },
            },
          },
          {
            id: "gid://shopify/CartLine/component-case",
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
                title: "Flip Hybrid Case",
                ipad: false,
                mac: false,
                accessories: true,
                dynamicCollections: [
                  {
                    collectionId: ACCESSORIES_COLLECTION_ID,
                    isMember: true,
                  },
                ],
              },
            },
          },
          {
            id: "gid://shopify/CartLine/component-screen",
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
                title: "ESR Tempered-Glass",
                ipad: false,
                mac: false,
                accessories: true,
                dynamicCollections: [
                  {
                    collectionId: ACCESSORIES_COLLECTION_ID,
                    isMember: true,
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
                collectionId: IPAD_COLLECTION_ID,
                collectionTitle: "iPad Collection",
                percentage: 8,
              },
              {
                collectionId: ACCESSORIES_COLLECTION_ID,
                collectionTitle: "Accessories Collection",
                percentage: 5,
              },
            ],
            collectionIds: [IPAD_COLLECTION_ID, ACCESSORIES_COLLECTION_ID],
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
                message: "8% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/component-ipad",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 8,
                  },
                },
              },
              {
                message: "5% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/component-case",
                    },
                  },
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/component-screen",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 5,
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

  test("uses the bundle percentage before component category percentages for bundle children", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-ipad",
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
                title: "11-inch iPad Wi-Fi",
                ipad: true,
                mac: false,
                accessories: false,
                dynamicCollections: [
                  {
                    collectionId: IPAD_COLLECTION_ID,
                    isMember: true,
                  },
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
                percentage: 12,
              },
              {
                collectionId: IPAD_COLLECTION_ID,
                collectionTitle: "iPad",
                percentage: 7,
              },
            ],
            collectionIds: [BUNDLES_COLLECTION_ID, IPAD_COLLECTION_ID],
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
                message: "12% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/component-ipad",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 12,
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

  test("keeps mixed bundle codes applicable when Shopify exposes only expanded bundle components", () => {
    const input = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/component-1",
            merchandise: {
              __typename: "ProductVariant",
              product: {
                title: "Bundle Component",
                ipad: false,
                mac: false,
                accessories: false,
                dynamicCollections: [
                  {
                    collectionId: BUNDLES_COLLECTION_ID,
                    isMember: false,
                  },
                  {
                    collectionId: IPAD_COLLECTION_ID,
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
                percentage: 12,
              },
              {
                collectionId: IPAD_COLLECTION_ID,
                collectionTitle: "iPad",
                percentage: 7,
              },
            ],
            collectionIds: [BUNDLES_COLLECTION_ID, IPAD_COLLECTION_ID],
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
                message: "12% category discount",
                targets: [
                  {
                    cartLine: {
                      id: "gid://shopify/CartLine/component-1",
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 12,
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

  test("applies the bundle fallback when mixed rules otherwise produce no candidates", () => {
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
