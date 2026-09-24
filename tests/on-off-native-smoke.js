import { _electron, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const directory = mkdtempSync(path.join(os.tmpdir(), "aroac-on-off-"));
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
  await page.getByRole("button", { name: "Quick Switch" }).click();
  const grey = page.getByRole("switch", { name: "Grey line", exact: true });
  await expect(grey.locator(".on-off-track")).toHaveText("ONOFF");
  const size = await grey.locator(".on-off-track").evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  });
  assert.ok(size.width >= 68 && size.height >= 24);
  await expect(grey).toHaveAttribute("aria-checked", "true");
  await grey.click();
  await expect(grey).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Close Quick Switch" }).click();
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Login" }).click();
  const login = page.getByRole("switch", {
    name: "Keep me signed in across restarts",
  });
  await expect(login.locator(".on-off-track")).toHaveText("ONOFF");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page
    .getByRole("button", { name: "Estimated range", exact: true })
    .click();
  const range = page.locator(".range-power-toggle");
  await expect(range.locator(".on-off-track")).toHaveText("ONOFF");
  // Choice switches must retain meaningful labels rather than claiming to be ON/OFF.
  await expect(
    page.getByRole("switch", { name: "Map projection" }),
  ).toContainText("Flat mapGlobe");
} finally {
  await desktop?.close();
  rmSync(directory, { recursive: true, force: true });
}
