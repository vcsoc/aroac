import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, stringify } from "yaml";
import { defaultTheme, validateTheme } from "../shared/workspace.js";

test("active icon color supports v1 themes, explicit customization and YAML round-trip", () => {
  const old = structuredClone(defaultTheme);
  delete old.colors.activeIcon;
  const normalized = validateTheme(old);
  assert.equal(normalized.colors.activeIcon, "#9cff57");
  assert.equal(
    old.colors.activeIcon,
    undefined,
    "validation must not mutate imported data",
  );
  assert.equal(normalized.colors.accent, old.colors.accent);
  normalized.colors.activeIcon = "#ff9900";
  assert.deepEqual(validateTheme(parse(stringify(normalized))), normalized);
});
test("explicit bad active colors, unknown colors and missing required legacy colors stay rejected", () => {
  for (const activeIcon of [
    null,
    undefined,
    "",
    "green",
    "#123",
    "url(https://example.com)",
    42,
  ]) {
    assert.throws(
      () =>
        validateTheme({
          ...defaultTheme,
          colors: { ...defaultTheme.colors, activeIcon },
        }),
      /Invalid activeIcon/,
    );
  }
  const missing = structuredClone(defaultTheme);
  delete missing.colors.accent;
  assert.throws(() => validateTheme(missing), /Invalid accent/);
  assert.throws(
    () =>
      validateTheme({
        ...defaultTheme,
        colors: { ...defaultTheme.colors, arbitrary: "#123456" },
      }),
    /Unknown theme color/,
  );
});
