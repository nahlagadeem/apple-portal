/* eslint-disable react/prop-types */
import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useMemo, useState} from "preact/hooks";

const DEFAULTS = {
  ipadPercentage: 8,
  macPercentage: 13,
  accessoriesPercentage: 5,
  iphonePercentage: 0,
  appleWatchPercentage: 0,
  tvHomePercentage: 0,
  airpodsPercentage: 0,
};

const LEGACY_COLLECTION_FIELDS = [
  {
    key: "ipadPercentage",
    collectionId: "gid://shopify/Collection/452991221978",
    defaultPercentage: DEFAULTS.ipadPercentage,
  },
  {
    key: "macPercentage",
    collectionId: "gid://shopify/Collection/452991746266",
    defaultPercentage: DEFAULTS.macPercentage,
  },
  {
    key: "accessoriesPercentage",
    collectionId: "gid://shopify/Collection/453527797978",
    defaultPercentage: DEFAULTS.accessoriesPercentage,
  },
  {
    key: "iphonePercentage",
    collectionId: "gid://shopify/Collection/452991123674",
    defaultPercentage: DEFAULTS.iphonePercentage,
  },
  {
    key: "appleWatchPercentage",
    collectionId: "gid://shopify/Collection/52991287514",
    defaultPercentage: DEFAULTS.appleWatchPercentage,
  },
  {
    key: "tvHomePercentage",
    collectionId: "gid://shopify/Collection/453560008922",
    defaultPercentage: DEFAULTS.tvHomePercentage,
  },
];

export default async () => {
  render(<App />, document.body);
};

function App() {
  const {i18n, applyMetafieldChange, data, query} = shopify;
  const initialValues = useMemo(
    () =>
      parseConfig(
        data?.metafields?.find(
          (metafield) => metafield.key === "function-configuration",
        )?.value,
      ),
    [data?.metafields],
  );

  const [values, setValues] = useState(initialValues);
  const [collections, setCollections] = useState([]);
  const [rulePercentages, setRulePercentages] = useState({});

  useEffect(() => {
    let active = true;

    async function loadCollections() {
      const loadedCollections = await fetchCollections(query);
      if (!active) return;
      setCollections(loadedCollections);
      setRulePercentages(buildInitialRulePercentages(initialValues, loadedCollections));
    }

    loadCollections();

    return () => {
      active = false;
    };
  }, [initialValues, query]);

  const onChange = (field, rawValue) => {
    setValues((previous) => ({
      ...previous,
      [field]: clampPercentage(rawValue, previous[field]),
    }));
  };

  const onSubmit = async () => {
    const rules = buildRules(collections, rulePercentages);
    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app:category-tier-discount-native",
      key: "function-configuration",
      valueType: "json",
      value: JSON.stringify({
        ...values,
        rules,
        collectionIds: rules.map((rule) => rule.collectionId),
      }),
    });
  };

  return (
    <s-function-settings
      onSubmit={(event) => event.waitUntil?.(onSubmit())}
      onReset={() => setValues(initialValues)}
    >
      <s-heading>{i18n.translate("title")}</s-heading>
      <s-stack gap="base">
        {collections.length ? (
          collections.map((collection) => (
            <s-number-field
              key={collection.id}
              label={`${collection.title} ${i18n.translate("labels.percentageSuffix")}`}
              name={`collection-${collection.id}`}
              value={String(rulePercentages[collection.id] ?? 0)}
              defaultValue={String(rulePercentages[collection.id] ?? 0)}
              min={0}
              max={100}
              suffix="%"
              onChange={(event) =>
                setRulePercentages((previous) => ({
                  ...previous,
                  [collection.id]: clampPercentage(
                    event.currentTarget.value,
                    previous[collection.id] ?? 0,
                  ),
                }))
              }
            />
          ))
        ) : (
          <LegacyFields
            i18n={i18n}
            values={values}
            initialValues={initialValues}
            onChange={onChange}
          />
        )}
      </s-stack>
    </s-function-settings>
  );
}

function LegacyFields({i18n, values, initialValues, onChange}) {
  return (
    <s-stack gap="base">
      <s-number-field
        label={i18n.translate("labels.ipad")}
        name="ipadPercentage"
        value={String(values.ipadPercentage)}
        defaultValue={String(initialValues.ipadPercentage)}
        min={0}
        max={100}
        suffix="%"
        onChange={(event) => onChange("ipadPercentage", event.currentTarget.value)}
      />
      <s-number-field
        label={i18n.translate("labels.mac")}
        name="macPercentage"
        value={String(values.macPercentage)}
        defaultValue={String(initialValues.macPercentage)}
        min={0}
        max={100}
        suffix="%"
        onChange={(event) => onChange("macPercentage", event.currentTarget.value)}
      />
      <s-number-field
        label={i18n.translate("labels.accessories")}
        name="accessoriesPercentage"
        value={String(values.accessoriesPercentage)}
        defaultValue={String(initialValues.accessoriesPercentage)}
        min={0}
        max={100}
        suffix="%"
        onChange={(event) => onChange("accessoriesPercentage", event.currentTarget.value)}
      />
      <s-number-field
        label={i18n.translate("labels.iphone")}
        name="iphonePercentage"
        value={String(values.iphonePercentage)}
        defaultValue={String(initialValues.iphonePercentage)}
        min={0}
        max={100}
        suffix="%"
        onChange={(event) => onChange("iphonePercentage", event.currentTarget.value)}
      />
      <s-number-field
        label={i18n.translate("labels.appleWatch")}
        name="appleWatchPercentage"
        value={String(values.appleWatchPercentage)}
        defaultValue={String(initialValues.appleWatchPercentage)}
        min={0}
        max={100}
        suffix="%"
        onChange={(event) => onChange("appleWatchPercentage", event.currentTarget.value)}
      />
      <s-number-field
        label={i18n.translate("labels.tvHome")}
        name="tvHomePercentage"
        value={String(values.tvHomePercentage)}
        defaultValue={String(initialValues.tvHomePercentage)}
        min={0}
        max={100}
        suffix="%"
        onChange={(event) => onChange("tvHomePercentage", event.currentTarget.value)}
      />
      <s-number-field
        label={i18n.translate("labels.airpods")}
        name="airpodsPercentage"
        value={String(values.airpodsPercentage)}
        defaultValue={String(initialValues.airpodsPercentage)}
        min={0}
        max={100}
        suffix="%"
        onChange={(event) => onChange("airpodsPercentage", event.currentTarget.value)}
      />
    </s-stack>
  );
}

function parseConfig(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    const legacyConfig = {
      ipadPercentage: clampPercentage(parsed.ipadPercentage, DEFAULTS.ipadPercentage),
      macPercentage: clampPercentage(parsed.macPercentage, DEFAULTS.macPercentage),
      accessoriesPercentage: clampPercentage(
        parsed.accessoriesPercentage,
        DEFAULTS.accessoriesPercentage,
      ),
      iphonePercentage: clampPercentage(parsed.iphonePercentage, DEFAULTS.iphonePercentage),
      appleWatchPercentage: clampPercentage(
        parsed.appleWatchPercentage,
        DEFAULTS.appleWatchPercentage,
      ),
      tvHomePercentage: clampPercentage(parsed.tvHomePercentage, DEFAULTS.tvHomePercentage),
      airpodsPercentage: clampPercentage(parsed.airpodsPercentage, DEFAULTS.airpodsPercentage),
    };
    const rules = normalizeRules(parsed.rules);
    return {
      ...legacyConfig,
      rules,
      collectionIds: rules.map((rule) => rule.collectionId),
    };
  } catch {
    return {...DEFAULTS, rules: [], collectionIds: []};
  }
}

function normalizeRules(rawRules) {
  if (!Array.isArray(rawRules)) return [];

  return rawRules
    .map((rule) => ({
      collectionId: String(rule?.collectionId || "").trim(),
      collectionTitle: String(rule?.collectionTitle || "").trim(),
      percentage: clampPercentage(rule?.percentage, 0),
    }))
    .filter((rule) => rule.collectionId && rule.percentage > 0);
}

async function fetchCollections(query) {
  const collectionsQuery = `#graphql
    query Collections($cursor: String) {
      collections(first: 250, after: $cursor, sortKey: TITLE) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          handle
        }
      }
    }
  `;

  const collections = [];
  let cursor = null;

  do {
    const result = await query(collectionsQuery, {variables: {cursor}});
    if (result?.errors?.length) break;

    const connection = result?.data?.collections;
    collections.push(
      ...(connection?.nodes ?? []).map((collection) => ({
        id: String(collection?.id || "").trim(),
        title: String(collection?.title || "").trim(),
        handle: String(collection?.handle || "").trim(),
      })),
    );
    cursor = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);

  return collections.filter((collection) => collection.id && collection.title);
}

function buildInitialRulePercentages(config, collections) {
  const byCollectionId = {};

  for (const rule of config?.rules ?? []) {
    byCollectionId[rule.collectionId] = rule.percentage;
  }

  if (Object.keys(byCollectionId).length) return byCollectionId;

  for (const field of LEGACY_COLLECTION_FIELDS) {
    if (collections.some((collection) => collection.id === field.collectionId)) {
      byCollectionId[field.collectionId] = config?.[field.key] ?? field.defaultPercentage;
    }
  }

  return byCollectionId;
}

function buildRules(collections, rulePercentages) {
  return collections
    .map((collection) => ({
      collectionId: collection.id,
      collectionTitle: collection.title,
      percentage: clampPercentage(rulePercentages[collection.id], 0),
    }))
    .filter((rule) => rule.percentage > 0);
}

function clampPercentage(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}
