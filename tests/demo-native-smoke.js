import { _electron, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const directory = mkdtempSync(path.join(os.tmpdir(), "aroac-demo-"));
let desktop;
try {
  desktop = await _electron.launch({
    args: [".", "--user-data-dir=" + directory],
    env: { ...process.env, OAR_DEV_URL: "", OAR_SERVER_URL: "" },
  });
  const page = await desktop.firstWindow();
  await expect(page.getByRole("button", { name: "About AROAC" })).toBeVisible();
  await page.bringToFront();
  await page.evaluate(() => localStorage.setItem("demo-probe", "private"));
  await page.keyboard.press("Control+Alt+Shift+D");
  await page.waitForURL("oar://demo/index.html");
  await expect(
    page.getByText("DEMO · Changes discarded on exit", { exact: false }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("demo-probe")),
    null,
  );
  const demo = await page.evaluate(async () => {
    const pins = await window.oarDesktop.request("/pins");
    const me = await window.oarDesktop.request("/me");
    const created = await window.oarDesktop.request("/pins", {
      method: "POST",
      body: JSON.stringify({ label: "Disposable", lat: 2, lng: 3 }),
    });
    localStorage.setItem("demo-probe", "throw-away");
    return { pins, me, created };
  });
  assert.equal(demo.pins.length, 8);
  assert.equal(demo.me.callsign, "DEMO");
  assert.equal(demo.created.label, "Disposable");
  await page.keyboard.press("Control+Alt+Shift+D");
  await page.waitForURL("oar://app/index.html");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("demo-probe")),
    "private",
  );
  assert.deepEqual(
    await page.evaluate(() => window.oarDesktop.request("/pins")),
    [],
  );
  await page.keyboard.press("Control+Alt+Shift+D");
  await page.waitForURL("oar://demo/index.html");
  assert.equal(
    (await page.evaluate(() => window.oarDesktop.request("/pins"))).length,
    8,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("demo-probe")),
    null,
  );
} finally {
  await desktop?.close();
  rmSync(directory, { recursive: true, force: true });
}
