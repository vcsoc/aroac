import { _electron, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const directory = mkdtempSync(path.join(os.tmpdir(), "aroac-brand-"));
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
  const logo = page.locator(".brand-logo");
  await expect(logo).toHaveAttribute("src", "./aroac-logo.png");
  assert.ok(await logo.evaluate((img) => img.complete && img.naturalWidth > 0));
  await page.getByRole("button", { name: "About AROAC" }).click();
  const dialog = page.getByRole("dialog", { name: "About AROAC" });
  const aboutLogo = dialog.locator(".about-logo");
  await expect(aboutLogo).toBeVisible();
  assert.ok(
    await aboutLogo.evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await dialog.getByRole("tab", { name: "License" }).click();
  await expect(
    dialog.getByText("AROAC Free Noncommercial Use License", { exact: false }),
  ).toBeVisible();
} finally {
  await desktop?.close();
  rmSync(directory, { recursive: true, force: true });
}
