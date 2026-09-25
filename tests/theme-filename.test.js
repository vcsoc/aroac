import test from "node:test";
import assert from "node:assert/strict";
import { themeExportFilename } from "../shared/themeFilename.js";

test("theme YAML export defaults to a safe name derived from the theme", () => {
  assert.equal(themeExportFilename("AROAC dark"), "aroac-aroac-dark.yaml");
  assert.equal(
    themeExportFilename("Night Sky / 70 cm"),
    "aroac-night-sky-70-cm.yaml",
  );
  assert.equal(themeExportFilename("Café & Radio"), "aroac-cafe-radio.yaml");
  assert.equal(themeExportFilename("../"), "aroac-theme.yaml");
  assert.equal(themeExportFilename("A".repeat(100)).length, 75);
});
