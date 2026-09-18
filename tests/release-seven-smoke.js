import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultTimeConfig, defaultTheme } from "../shared/workspace.js";
const dir = mkdtempSync(path.join(tmpdir(), "oar-seven-"));
let app, page;
const errors = [];
const button = (name) => page.getByRole("button", { name, exact: true });
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
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(button("Add clock")).toBeEnabled();
  const cfg = defaultTimeConfig();
  cfg.home = {
    name: "London home",
    lat: 51.5034,
    lng: -0.1276,
    zone: "Europe/London",
  };
  await page.evaluate(async (cfg) => {
    await window.oarDesktop.setOffline(true);
    const post = (r, body) =>
      window.oarDesktop.request(r, {
        method: "POST",
        body: JSON.stringify(body),
      });
    await post("/register", {
      callsign: "N1UI",
      name: "UI Test",
      email: "ui@example.test",
      password: "test-password-123",
    });
    await post("/pins", {
      label: "Toronto pin",
      callsign: "VE3TEST",
      lat: 43.479294,
      lng: -79.708326,
      notes: "A saved point with a safe tooltip",
    });
    await post("/pins", {
      label: "London pin",
      callsign: "G1TEST",
      lat: 51.5034,
      lng: -0.1276,
    });
    await window.oarDesktop.request("/preferences/world-time", {
      method: "PUT",
      body: JSON.stringify(cfg),
    });
  }, cfg);
  const info = await page.evaluate(() => window.oarDesktop.connection()),
    db = new DatabaseSync(info.databasePath),
    now = Math.floor(Date.now() / 1000);
  db.prepare("INSERT INTO weather_cache VALUES(?,?,?)").run(
    "51.503,-0.128",
    JSON.stringify({
      current: { time: now, temperature_2m: 20, weather_code: 3 },
      hourly: { time: [] },
      daily: {
        time: Array.from({ length: 7 }, (_, i) => now + i * 86400),
        weather_code: [0, 1, 2, 3, 61, 71, 95],
        temperature_2m_max: Array(7).fill(22),
        temperature_2m_min: Array(7).fill(12),
        sunrise: Array(7).fill(now),
        sunset: Array(7).fill(now + 36000),
      },
    }),
    Date.now(),
  );
  db.close();
  await page.reload();
  const sidebar = await page.locator(".sidebar").boundingBox(),
    icon = await page
      .locator(".sidebar-bottom .settings-button svg")
      .boundingBox();
  assert.ok(
    Math.abs(sidebar.x + sidebar.width / 2 - icon.x - icon.width / 2) < 2,
  );
  await button("Edit London clock").dblclick();
  const clockDialog = page.getByRole("dialog");
  await clockDialog
    .getByLabel("Clock color", { exact: true })
    .evaluate((el) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(el, "#ffcc00");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await clockDialog
    .getByRole("button", { name: "Save clock", exact: true })
    .click();
  await expect(button("Edit London clock")).toHaveAttribute(
    "data-custom-color",
    "true",
  );
  assert.notEqual(
    await button("Edit London clock").evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    ),
    "rgb(255, 204, 0)",
  );
  assert.equal(
    await button("Edit London clock")
      .locator("strong")
      .evaluate((el) => getComputedStyle(el).color),
    "rgb(255, 204, 0)",
  );
  await button("Add clock").click();
  const add = page.getByRole("dialog");
  await add
    .getByLabel("Location name", { exact: true })
    .fill("Colored fixture");
  await add.getByLabel("Clock color", { exact: true }).evaluate((el) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, "#112233");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await add.getByRole("button", { name: "Save clock", exact: true }).click();
  await expect(button("Edit Colored fixture clock")).toHaveAttribute(
    "data-custom-color",
    "true",
  );
  assert.equal(
    await button("Edit Colored fixture clock")
      .locator("strong")
      .evaluate((el) => getComputedStyle(el).color),
    "rgb(17, 34, 51)",
  );
  const light = {
    ...defaultTheme,
    name: "Light fixture",
    colors: {
      ...defaultTheme.colors,
      panel: "#ffffff",
      surface: "#eeeeee",
      text: "#101010",
      muted: "#444444",
    },
  };
  await page.evaluate(
    (t) =>
      window.oarDesktop.request("/preferences/theme", {
        method: "PUT",
        body: JSON.stringify(t),
      }),
    light,
  );
  await page.reload();
  assert.equal(
    await button("Edit London clock")
      .locator("strong")
      .evaluate((el) => getComputedStyle(el).color),
    "rgb(255, 204, 0)",
  );
  await page.evaluate(
    (t) =>
      window.oarDesktop.request("/preferences/theme", {
        method: "PUT",
        body: JSON.stringify(t),
      }),
    defaultTheme,
  );
  await page.reload();
  await button("Saved pin Toronto pin").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Set as source location", exact: true })
    .click();
  await expect(page.locator("#map-drawer")).toContainText(
    "43.479294, -79.708326",
  );
  await button("Saved pin London pin").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Analyse link from source", exact: true })
    .click();
  await expect(page.locator("#map-drawer")).toContainText(
    "Terrain-verified line of sight: unknown",
  );
  await page.getByLabel("Source antenna height", { exact: true }).fill("10");
  await page
    .getByLabel("Destination antenna height", { exact: true })
    .fill("10");
  await expect(page.locator("#map-drawer")).toContainText(
    "beyond that nominal radio horizon",
  );
  await page.screenshot({ path: "/tmp/oar-link-planning.png" });
  await page
    .getByRole("switch", { name: "Map projection", exact: true })
    .click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-projection",
    "globe",
  );
  await button("Saved pin Toronto pin").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Analyse link from source", exact: true })
    .click();
  await expect(page.locator("#map-drawer")).toContainText("0.00 km");
  await page
    .getByRole("switch", { name: "Map projection", exact: true })
    .click();
  const storedPins = await page.evaluate(() =>
    window.oarDesktop.request("/pins"),
  );
  assert.deepEqual(
    storedPins.map((p) => [p.label, p.lat, p.lng]).sort(),
    [
      ["London pin", 51.5034, -0.1276],
      ["Toronto pin", 43.479294, -79.708326],
    ].sort(),
  );
  await button("Saved locations").click();
  const right = page.locator("#map-drawer");
  await button("Saved pin Toronto pin").click();
  await expect(
    page.getByRole("region", {
      name: "Selected location details",
      exact: true,
    }),
  ).toContainText("Toronto pin");
  await button("Saved pin Toronto pin").hover();
  await expect(page.locator(".pin-hover-popup")).toContainText("43.479294");
  await expect(page.locator(".location-card.pin-hovered")).toHaveCount(1);
  await expect(right.locator(".pin-editor.pin-hovered")).toHaveCount(1);
  await page.screenshot({ path: "/tmp/oar-pin-hover.png" });
  await page.mouse.move(10, 10);
  await expect(page.locator(".pin-hovered")).toHaveCount(0);
  const selected = page.getByRole("region", {
    name: "Selected location details",
    exact: true,
  });
  await expect(selected.locator(".location-live-time")).toContainText(
    "America/Toronto",
  );
  await expect(selected.locator(".location-live-time")).toContainText(
    "vs home",
  );
  const homeCard = page.getByRole("region", {
    name: "Home location details",
    exact: true,
  });
  await expect(
    homeCard.getByRole("button", { name: "Change", exact: true }),
  ).toHaveCount(0);
  await homeCard.locator(".location-title").click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-selected-location",
    "51.5034,-0.1276",
  );
  await selected
    .locator(".location-title")
    .dblclick({ position: { x: 150, y: 10 } });
  await expect(selected.locator(".location-live-time")).toHaveCount(0);
  await page.waitForTimeout(350);
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-selected-location",
    "51.5034,-0.1276",
  );
  await selected.locator(".location-title").dblclick();
  await expect(selected.locator(".location-live-time")).toBeVisible();
  await selected.locator(".location-title").click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-selected-location",
    "43.479294,-79.708326",
  );
  for (const label of [
    "Save location as pin",
    "Use approximate location for my station",
  ]) {
    const control = selected.getByRole("button", { name: label, exact: true });
    await expect(control).toHaveAttribute("title", label);
    assert.equal((await control.innerText()).trim(), "");
  }
  await selected
    .getByRole("button", { name: "Close selected location", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Selected location details",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Home location details", exact: true }),
  ).toBeVisible();
  const labels = [
    "Locations",
    "Contacts",
    "Export locations / contacts",
    "Import",
    "About locations and contacts transfer",
  ];
  let x = -1;
  for (const label of labels) {
    const control = right.getByRole("button", { name: label, exact: true }),
      bounds = await control.boundingBox();
    assert.ok(bounds.x > x);
    x = bounds.x;
    assert.equal((await control.innerText()).trim(), "");
  }
  await expect(
    right.getByRole("button", { name: labels[4], exact: true }),
  ).toHaveAttribute("title", /JSON file: device-wide/);
  await right
    .getByRole("button", { name: "Show group headers", exact: true })
    .click();
  await expect(right.locator(".saved-group-header")).toHaveCount(2);
  await expect(right.locator(".group-title")).toContainText(["L (1)", "T (1)"]);
  for (const group of await right.locator(".group-title").all())
    await group.dblclick();
  await expect(right.locator(".pin-editor")).toHaveCount(0);
  for (const label of ["Group by", "Order by"]) {
    await right.getByRole("button", { name: label, exact: true }).click();
    const menu = page.locator(".floating-list-menu");
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("button", { name: "Done", exact: true }),
    ).toHaveCount(0);
    const bounds = await menu.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 1000);
    assert.equal(
      await menu.evaluate((el) => !!el.closest("#map-drawer")),
      false,
    );
    await page.screenshot({ path: "/tmp/oar-unclipped-group-menu.png" });
    await page.keyboard.press("Escape");
    await expect(right).toHaveAttribute("aria-hidden", "false");
  }
  await button("Saved locations").click();
  await button("Go to home location").click();
  const home = page.getByRole("region", {
    name: "Home location details",
    exact: true,
  });
  await expect(home.locator(".forecast-grid>div")).toHaveCount(3);
  const tops = async () =>
    home
      .locator(".forecast-grid>div")
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().top)),
      );
  assert.equal(new Set(await tops()).size, 1);
  await page
    .locator(".location-pane")
    .getByRole("switch", { name: "Forecast days", exact: true })
    .click();
  await expect(home.locator(".forecast-grid>div")).toHaveCount(7);
  const ys = await tops();
  assert.equal(new Set(ys.slice(0, 3)).size, 1);
  assert.equal(new Set(ys.slice(3)).size, 1);
  assert.ok(ys[3] > ys[0]);
  await page
    .getByRole("separator", { name: "Resize left panel", exact: true })
    .press("Home");
  await expect.poll(async () => new Set(await tops()).size).toBe(4);
  await page
    .getByRole("separator", { name: "Resize left panel", exact: true })
    .press("End");
  await expect.poll(async () => new Set(await tops()).size).toBe(2);
  await page.screenshot({ path: "/tmp/oar-responsive-forecast.png" });
  await home.locator(".location-title").click();
  await page.waitForTimeout(1500);
  await expect(button("Saved pin London pin")).toBeInViewport();
  await button("Saved pin London pin").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add location as clock", exact: true })
    .click();
  await expect(button("Edit London pin clock")).toBeVisible();
  await page
    .locator(".world-map canvas")
    .click({ position: { x: 700, y: 220 } });
  const newSelected = page.getByRole("region", {
    name: "Selected location details",
    exact: true,
  });
  await expect(newSelected.locator(".location-live-time")).toBeVisible();
  await newSelected
    .getByRole("button", { name: "Set as home location", exact: true })
    .click();
  await expect(newSelected.locator(".location-live-time")).toContainText(
    "Same time as home",
  );
  const saved = await page.evaluate(() =>
    window.oarDesktop.request("/preferences/world-time"),
  );
  assert.ok(saved.value.clocks.some((c) => c.name === "London pin"));
  assert.notEqual(saved.value.home.lat, cfg.home.lat);
  assert.deepEqual(errors, []);
  console.log(
    "Release-seven UI passed: source/destination planning on flat/globe, explicit horizon limitations, clock color/theme contrast/persistence, centered sidebar icon, hover tooltip and linked highlights, icon actions/dismissal, alphabetical grouping and unclipped menus without Done, compact transfer toolbar, responsive 3 and 3+4 forecast layouts.",
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-seven-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-6500));
    console.error(
      await page.locator(".saved-map-pin").evaluateAll((els) =>
        els.map((el) => ({
          name: el.getAttribute("aria-label"),
          style: el.getAttribute("style"),
          opacity: getComputedStyle(el).opacity,
          rect: el.getBoundingClientRect().toJSON(),
          class: el.className,
        })),
      ),
    );
  }
  throw e;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
