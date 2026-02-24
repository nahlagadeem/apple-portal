import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useMemo, useState} from "preact/hooks";

const DEFAULTS = {
  ipadPercentage: 8,
  macPercentage: 13,
  accessoriesPercentage: 5,
};

export default async () => {
  render(<App />, document.body);
};

function App() {
  const {i18n, applyMetafieldChange, data} = shopify;
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

  const onChange = (field, rawValue) => {
    setValues((previous) => ({
      ...previous,
      [field]: clampPercentage(rawValue, previous[field]),
    }));
  };

  const onSubmit = async () => {
    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app:category-tier-discount-native",
      key: "function-configuration",
      valueType: "json",
      value: JSON.stringify(values),
    });
  };

  return (
    <s-function-settings
      onSubmit={(event) => event.waitUntil?.(onSubmit())}
      onReset={() => setValues(initialValues)}
    >
      <s-heading>{i18n.translate("title")}</s-heading>
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
          onChange={(event) =>
            onChange("accessoriesPercentage", event.currentTarget.value)
          }
        />
      </s-stack>
    </s-function-settings>
  );
}

function parseConfig(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      ipadPercentage: clampPercentage(parsed.ipadPercentage, DEFAULTS.ipadPercentage),
      macPercentage: clampPercentage(parsed.macPercentage, DEFAULTS.macPercentage),
      accessoriesPercentage: clampPercentage(
        parsed.accessoriesPercentage,
        DEFAULTS.accessoriesPercentage,
      ),
    };
  } catch {
    return DEFAULTS;
  }
}

function clampPercentage(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}
