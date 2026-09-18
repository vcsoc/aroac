import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
const dir = mkdtempSync(path.join(tmpdir(), "oar-display-"));
let app, page;
const launch = async () => {
  app = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + dir,
    ],
    env: { ...process.env, OAR_DEV_URL: "" },
  });
  page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
};
try {
  await launch();
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  const info = await page.evaluate(() => window.oarDesktop.connection()),
    db = new DatabaseSync(info.databasePath);
  db.prepare("INSERT OR REPLACE INTO feed_cache VALUES(?,?,?)").run(
    "radar",
    JSON.stringify({
      data: {
        host: "https://tilecache.rainviewer.com",
        radar: { past: [{ path: "/v2/radar/test", time: 1789677000 }] },
      },
      fetchedAt: new Date().toISOString(),
      source: "test",
    }),
    Date.now(),
  );
  db.close();
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  const top = page.locator("#quick-switch-panel");
  const grey = top.getByRole("switch", { name: "Grey line", exact: true }),
    radar = top.getByRole("switch", { name: "Radar", exact: true });
  await expect(grey).toHaveAttribute("title", /day\/night/);
  await grey.click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-night-features",
    "0",
  );
  await grey.click();
  await expect(page.locator(".world-map")).not.toHaveAttribute(
    "data-night-features",
    "0",
  );
  await expect(page.locator(".map-footer input[type=checkbox]")).toHaveCount(0);
  await radar.click();
  const legend = page.getByRole("complementary", { name: "Radar legend" });
  await expect(legend).toBeVisible();
  await expect(legend).toContainText("Cached frame");
  await expect(legend).toContainText("UTC");
  await expect(legend).toContainText("dBZ");
  await radar.click();
  await expect(legend).toHaveCount(0);
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--font-scale",
          ),
        ),
      ),
    )
    .toBe(1.12);
  const range = page.getByRole("slider", {
    name: "Interface text size",
    exact: true,
  });
  await range.focus();
  await range.press("ArrowRight");
  await page
    .getByRole("button", { name: "Apply text size", exact: true })
    .click();
  await expect(
    page.getByText("Text size saved.", { exact: true }),
  ).toBeVisible();
  assert.equal(
    (
      await page.evaluate(() =>
        window.oarDesktop.request("/preferences/appearance"),
      )
    ).value.fontScale,
    1.13,
  );
  await page.keyboard.press("Control+=");
  await expect
    .poll(() =>
      page.evaluate(() => window.oarDesktop.zoom().then((r) => r.zoomFactor)),
    )
    .toBe(1.1);
  await expect(
    page.getByRole("slider", { name: "App zoom", exact: true }),
  ).toHaveValue("1.1");
  await page.keyboard.press("Control+-");
  await expect
    .poll(() =>
      page.evaluate(() => window.oarDesktop.zoom().then((r) => r.zoomFactor)),
    )
    .toBe(1);
  await page.keyboard.press("Control+=");
  await page.keyboard.press("Control+0");
  await expect
    .poll(() =>
      page.evaluate(() => window.oarDesktop.zoom().then((r) => r.zoomFactor)),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Zoom app in", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.oarDesktop.zoom().then((r) => r.zoomFactor)),
    )
    .toBe(1.1);
  await page.screenshot({ path: "/tmp/oar-display-settings.png" });
  await app.close();
  app = null;
  await launch();
  await expect
    .poll(() =>
      page.evaluate(() => window.oarDesktop.zoom().then((r) => r.zoomFactor)),
    )
    .toBe(1.1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--font-scale",
          ),
        ),
      ),
    )
    .toBe(1.13);
  console.log(
    "Display tests passed: topbar grey-line/radar slider toggles and tooltips, timestamped radar legend, larger configurable text, Ctrl+/Ctrl-/Ctrl+0, native zoom and restart persistence.",
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-display-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-5000));
  }
  throw e;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
