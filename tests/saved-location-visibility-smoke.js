import { _electron, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const directory = mkdtempSync(
  path.join(os.tmpdir(), "aroac-saved-visibility-"),
);
let desktop;
try {
  desktop = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + directory,
    ],
    env: { ...process.env, OAR_DEV_URL: "", OAR_SERVER_URL: "" },
  });
  const page = await desktop.firstWindow();
  const pin = page.getByRole("button", {
    name: "Saved locations on map",
    exact: true,
  });
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await expect(pin).toHaveAttribute(
    "title",
    /Show or hide your saved location markers/,
  );
  await page.evaluate(() =>
    window.oarDesktop.request("/pins", {
      method: "POST",
      body: JSON.stringify({ label: "Visibility test", lat: 35, lng: 25 }),
    }),
  );
  // Reload to fetch the new record through the normal saved-location store.
  await page.reload();
  await expect(page.locator(".saved-map-pin[data-pin-id]")).toHaveCount(1);
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".saved-map-pin")).toHaveCount(0);
  assert.equal(
    (await page.evaluate(() => window.oarDesktop.request("/pins"))).length,
    1,
  );
  await page.getByRole("switch", { name: "Map projection" }).click();
  await expect(page.locator(".saved-map-pin")).toHaveCount(0);
  await pin.click();
  await expect(page.locator(".saved-map-pin")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Saved locations on map", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
} finally {
  await desktop?.close();
  rmSync(directory, { recursive: true, force: true });
}
