import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };

const userData = mkdtempSync(path.join(os.tmpdir(), "oar-guidance-test-"));
let app;
try {
  app = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + userData,
    ],
    env: { ...process.env, OAR_SERVER_URL: "", OAR_DEV_URL: "" },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".app-statusbar")).toContainText(
    "OAR v" + pkg.version,
  );
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), pkg.version);
  await app.evaluate(({ net }) => {
    const original = net.fetch.bind(net);
    net.fetch = async (url, options) =>
      url === "https://raw.githubusercontent.com/vcsoc/oar/main/roadmap.md"
        ? new Response(
            "# Desktop roadmap test\n\n- **Safe Markdown** rendered through the packaged IPC route.",
            { headers: { "content-type": "text/plain" } },
          )
        : original(url, options);
  });
  await page.getByRole("button", { name: "About OAR", exact: true }).click();
  await page.getByRole("tab", { name: "Roadmap" }).click();
  await expect(
    page.getByRole("heading", { name: "Desktop roadmap test" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  await page.reload();
  await page.getByRole("button", { name: "About OAR", exact: true }).click();
  await page.getByRole("tab", { name: "Roadmap" }).click();
  await expect(page.locator(".roadmap-fallback")).toContainText(
    "working offline",
  );
  await page.keyboard.press("Escape");
  const pin = await page.evaluate(async () => {
    await window.oarDesktop.request("/register", {
      method: "POST",
      body: JSON.stringify({
        callsign: "N1TOUR",
        name: "Tour Operator",
        email: "tour@example.com",
        password: "offline-tour-test-123",
      }),
    });
    return window.oarDesktop.request("/pins", {
      method: "POST",
      body: JSON.stringify({
        label: "Desktop test pin",
        lat: 51.5,
        lng: -0.12,
      }),
    });
  });
  await page.reload();
  await expect(page.locator(".profile-button")).toContainText("N1TOUR");
  await page.locator(".profile-button").click();
  await page.getByRole("menuitem", { name: "Help" }).click();
  await page.getByRole("menuitem", { name: "Tutorial" }).click();
  const tour = page.getByRole("dialog", { name: "OAR tutorial" });
  await expect(tour).toContainText("Welcome to OAR");
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Choose a workspace");
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await page.getByRole("button", { name: "Add clock", exact: true }).click();
  const clockEditor = page.locator(".clock-editor");
  assert.ok(
    (await clockEditor.locator('input[type="color"]').boundingBox()).width <=
      40,
  );
  await expect(
    clockEditor.getByRole("button", { name: "Use theme color" }),
  ).toHaveAttribute("title", "Use theme color");
  await clockEditor
    .getByRole("button", { name: "About clock coordinates" })
    .focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "Coordinates enable home weather",
  );
  await page.keyboard.press("Escape");
  await expect(clockEditor).toBeVisible();
  await clockEditor
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  const card = page.locator(`[data-pin-id="${pin.id}"]`);
  await card
    .getByRole("button", { name: "Use this pin as home location" })
    .click();
  await expect(page.locator(".oar-toast")).toContainText(
    "Home location changed to saved pin “Desktop test pin”",
  );
  await page.screenshot({ path: "/tmp/oar-0.3.9-desktop.png" });
  await expect(page.locator(".oar-toast")).toHaveCount(0, { timeout: 6000 });
  assert.deepEqual(errors, []);
  console.log(
    "Desktop guidance passed: packaged version, bounded roadmap IPC/Markdown, offline fallback, authenticated tutorial, compact clock editor/tooltips, home-location toast and four-second expiry.",
  );
} finally {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
}
