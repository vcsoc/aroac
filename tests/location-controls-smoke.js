import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
const dir = mkdtempSync(path.join(tmpdir(), "oar-location-controls-"));
let app, page;
try {
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
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  const info = await page.evaluate(() => window.oarDesktop.connection()),
    db = new DatabaseSync(info.databasePath);
  db.prepare("INSERT INTO geocode_cache VALUES(?,?,?)").run(
    "valletta",
    JSON.stringify([
      {
        id: "test-valletta",
        title: "Valletta",
        subtitle: "Malta",
        lat: 35.8992,
        lng: 14.5141,
        zoom: 12,
      },
    ]),
    Date.now(),
  );
  db.close();
  await page.getByRole("button", { name: "Edit New York clock" }).dblclick();
  const dialog = page.getByRole("dialog");
  const layout = await dialog
    .locator(".address-search form")
    .evaluate((el) => ({
      direction: getComputedStyle(el).flexDirection,
      inputWidth: el.querySelector("input").getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    }));
  assert.equal(layout.direction, "row");
  assert.ok(layout.inputWidth > 200);
  assert.ok(layout.height < 40);
  await dialog
    .getByRole("combobox", { name: "Search addresses and places" })
    .fill("Valletta");
  await expect(dialog.getByRole("option", { name: /Valletta/ })).toBeVisible();
  await dialog.getByRole("option", { name: /Valletta/ }).click();
  await expect(dialog.locator(".address-dropdown")).toHaveCount(0);
  const timezone = dialog.getByRole("combobox", {
    name: "Timezone",
    exact: true,
  });
  await timezone.click();
  assert.deepEqual(
    await timezone.evaluate((el) => [el.selectionStart, el.selectionEnd]),
    [0, "Europe/Malta".length],
  );
  await timezone.pressSequentially("Durban");
  await expect(timezone).toHaveValue("Durban");
  const city = dialog
    .getByRole("option", { name: /^Durban/ })
    .filter({ hasText: "South Africa" })
    .first();
  await expect(city).toBeVisible({ timeout: 15000 });
  await city.click();
  await expect(timezone).toHaveValue("Africa/Johannesburg");
  await expect(dialog.getByLabel("Location name", { exact: true })).toHaveValue(
    "Durban",
  );
  await page.screenshot({ path: "/tmp/oar-clock-editor-fixed.png" });
  await dialog.getByRole("button", { name: "Save clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Durban clock" }),
  ).toBeVisible();
  const top = page.locator(".topbar-search-group");
  const pinBounds = await page
      .getByRole("button", { name: "Location details", exact: true })
      .boundingBox(),
    breadcrumb = await page.locator(".breadcrumb").boundingBox();
  assert.ok(pinBounds.x + pinBounds.width <= breadcrumb.x + 1);
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  await page
    .getByRole("switch", { name: "Show city names", exact: true })
    .click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-city-names",
    "true",
  );
  await page
    .getByRole("button", { name: "Close Quick Switch", exact: true })
    .click();
  await top
    .getByRole("combobox", { name: "Search addresses and places" })
    .fill("Valletta");
  await top.getByRole("option", { name: /Valletta/ }).click();
  await expect(page.locator(".searched-place-label")).toHaveText("Valletta");
  await page.waitForTimeout(800);
  const map = page.locator(".world-map");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(map).toHaveAttribute("data-overview-resets", "1");
  await expect(page.locator(".searched-place-label")).toHaveText("Valletta");
  await page
    .getByRole("switch", { name: "Map projection", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(map).toHaveAttribute("data-overview-resets", "2");
  await top.getByRole("button", { name: "Clear address search" }).click();
  await expect(page.locator(".searched-place-label")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Location details", exact: true })
    .click();
  const left = page.getByRole("complementary", {
    name: "Location details",
    exact: true,
  });
  for (const name of ["Temperature units", "Forecast days"]) {
    const control = left.getByRole("switch", { name, exact: true });
    await expect(control).toHaveAttribute("aria-checked", "false");
    await control.click();
    await expect(control).toHaveAttribute("aria-checked", "true");
    await control.press("Space");
    await expect(control).toHaveAttribute("aria-checked", "false");
  }
  const saved = await page.evaluate(() =>
    window.oarDesktop.request("/pins", {
      method: "POST",
      body: JSON.stringify({
        label: "Exact home pin",
        lat: 35.89955,
        lng: 14.515,
        notes: "",
      }),
    }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this pin as home location", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.oarDesktop
          .request("/preferences/world-time")
          .then((r) => r.value.home.lat),
      ),
    )
    .toBe(saved.lat);
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await page
    .locator(".topbar-search-group")
    .getByRole("combobox", { name: "Search addresses and places" })
    .fill("Valletta");
  await page
    .locator(".topbar-search-group")
    .getByRole("option", { name: /Valletta/ })
    .click();
  await left
    .getByText("Correct this address using a saved pin", { exact: true })
    .click();
  await left
    .getByRole("button", {
      name: "Use Exact home pin for this address",
      exact: true,
    })
    .click();
  await expect(map).toHaveAttribute(
    "data-selected-location",
    `${saved.lat},${saved.lng}`,
  );
  const corrected = await page.evaluate(() =>
    window.oarDesktop.request("/geocode?q=Valletta"),
  );
  assert.equal(corrected.results[0].corrected, true);
  assert.equal(corrected.results[0].lat, saved.lat);
  await left
    .getByRole("button", { name: "Restore provider position", exact: true })
    .click();
  await expect(map).toHaveAttribute(
    "data-selected-location",
    "35.8992,14.5141",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Location controls passed: modal layout, autocomplete, 235k-city lookup, selected-text replacement, Durban timezone, city toggle/search labels, double Escape flat/globe, mouse/keyboard weather switches, pin-based home and reversible address correction.",
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-location-controls-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-6000));
  }
  throw e;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
