import { Text, TextInput } from "react-native";

// React 19 no longer reliably applies `defaultProps` to function components.
// Patch the JSX runtime instead so every <Text>/<TextInput> element receives
// the prop, including components imported before app render.
type JsxRuntime = {
  jsx?: (type: unknown, props: unknown, key?: unknown) => unknown;
  jsxs?: (type: unknown, props: unknown, key?: unknown) => unknown;
  jsxDEV?: (
    type: unknown,
    props: unknown,
    key?: unknown,
    isStaticChildren?: unknown,
    source?: unknown,
    self?: unknown,
  ) => unknown;
  __mixDisableFontScalingPatched?: boolean;
};

type Props = Record<string, unknown> | null | undefined;

function patchProps(type: unknown, props: Props): Props {
  if (type !== Text && type !== TextInput) return props;
  return { ...(props ?? {}), allowFontScaling: false };
}

function patchRuntime(runtime: JsxRuntime) {
  if (runtime.__mixDisableFontScalingPatched) return;

  const originalJsx = runtime.jsx;
  if (originalJsx) {
    runtime.jsx = (type, props, key) => originalJsx(type, patchProps(type, props as Props), key);
  }

  const originalJsxs = runtime.jsxs;
  if (originalJsxs) {
    runtime.jsxs = (type, props, key) => originalJsxs(type, patchProps(type, props as Props), key);
  }

  const originalJsxDEV = runtime.jsxDEV;
  if (originalJsxDEV) {
    runtime.jsxDEV = (type, props, key, isStaticChildren, source, self) =>
      originalJsxDEV(
        type,
        patchProps(type, props as Props),
        key,
        isStaticChildren,
        source,
        self,
      );
  }

  runtime.__mixDisableFontScalingPatched = true;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
patchRuntime(require("react/jsx-runtime") as JsxRuntime);
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  patchRuntime(require("react/jsx-dev-runtime") as JsxRuntime);
} catch {
  // Production bundles may not include the dev runtime.
}
