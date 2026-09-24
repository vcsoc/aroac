import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const directory = mkdtempSync(path.join(os.tmpdir(), "oar-active-icon-theme-"));
let app;
async function launch() {
  app = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + directory,
    ],
    env: { ...process.env, OAR_DEV_URL: "" },
  });
  if (process.env.OAR_EXPECTED_VERSION)
    assert.equal(
      await app.evaluate(({ app }) => app.getVersion()),
      process.env.OAR_EXPECTED_VERSION,
    );
  const page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Good to have you on air." })
    .waitFor();
  return page;
}
try {
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  const active = page
    .locator('.header-map-toggles button[aria-pressed="true"]')
    .first();
  const color = () => active.evaluate((el) => getComputedStyle(el).color);
  await expect.poll(color).toBe("rgb(156, 255, 87)");
  for (const button of await page.locator(".header-map-toggles button").all()) {
    const style = await button.evaluate((el) => ({
      border: getComputedStyle(el).borderTopWidth,
      bg: getComputedStyle(el).backgroundColor,
    }));
    assert.deepEqual(style, { border: "0px", bg: "rgba(0, 0, 0, 0)" });
  }
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Themes", exact: true }).click();
  await expect(page.getByLabel("activeIcon color picker")).toHaveValue(
    "#9cff57",
  );
  await page.getByLabel("activeIcon hex color").fill("#ff9900");
  await expect.poll(color).toBe("rgb(255, 153, 0)");
  await page.getByRole("button", { name: "Revert", exact: true }).click();
  await expect.poll(color).toBe("rgb(156, 255, 87)");
  await page.getByLabel("activeIcon hex color").fill("#ff9900");
  await page.getByRole("button", { name: "Apply theme", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.oarDesktop.request("/preferences/theme")).value.colors
            .activeIcon,
      ),
    )
    .toBe("#ff9900");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await active.hover();
  await expect.poll(color).toBe("rgb(255, 153, 0)");
  assert.equal(
    await active.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(
    await active.evaluate((el) => getComputedStyle(el).borderTopWidth),
    "0px",
  );
  await app.close();
  app = null;
  page = await launch();
  await expect
    .poll(() =>
      page
        .locator('.header-map-toggles button[aria-pressed="true"]')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    )
    .toBe("rgb(255, 153, 0)");
  assert.deepEqual(errors, []);
  console.log(
    "ACTIVE ICON THEME PASSED: borderless/transparent header, new picker, live preview/revert, active hover color, saved theme survives restart.",
  );
} finally {
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
}
