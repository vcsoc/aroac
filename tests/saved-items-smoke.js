import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultTimeConfig } from "../shared/workspace.js";
import { homeDifference } from "../src/contactContext.js";
const dir = mkdtempSync(path.join(tmpdir(), "oar-items-"));
let app, page;
const errors = [];
async function launch() {
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
  await page.setViewportSize({ width: 1600, height: 1040 });
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
}
const button = (name) => page.getByRole("button", { name, exact: true });
const right = () => page.locator("#map-drawer");
try {
  await launch();
  await page.evaluate(async () => {
    await window.oarDesktop.setOffline(true);
    const post = (route, body) =>
      window.oarDesktop.request(route, {
        method: "POST",
        body: JSON.stringify(body),
      });
    await post("/pins", {
      label: "Durban station",
      callsign: "ZS1ABC",
      lat: -29.8579,
      lng: 31.0292,
    });
    await post("/pins", {
      label: "London station",
      callsign: "G1ABC",
      lat: 51.5034,
      lng: -0.1276,
    });
    for (const c of [
      { name: "Zelda operator", callsign: "ZS1ABC" },
      { name: "Alpha friend", callsign: "VE3ABC", grid: "FN03" },
      { name: "Zoe duplicate", callsign: "ZS1ABC" },
      { name: "No coordinates", callsign: "K1NONE" },
    ])
      await post("/address-book", c);
  });
  const cfg = defaultTimeConfig();
  cfg.home = {
    name: "London home",
    lat: 51.5034,
    lng: -0.1276,
    zone: "Europe/London",
  };
  await page.evaluate(
    (c) =>
      window.oarDesktop.request("/preferences/world-time", {
        method: "PUT",
        body: JSON.stringify(c),
      }),
    cfg,
  );
  const info = await page.evaluate(() => window.oarDesktop.connection()),
    db = new DatabaseSync(info.databasePath),
    now = Math.floor(Date.now() / 1000);
  for (const key of ["51.503,-0.128", "-29.858,31.029"])
    db.prepare("INSERT INTO weather_cache VALUES(?,?,?)").run(
      key,
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        current: {
          time: now,
          temperature_2m: 20,
          apparent_temperature: 19,
          relative_humidity_2m: 70,
          weather_code: 3,
          wind_speed_10m: 16,
          wind_gusts_10m: 24,
          wind_direction_10m: 90,
          pressure_msl: 1012,
          cloud_cover: 90,
        },
        hourly: { time: [now], visibility: [20000], dew_point_2m: [12] },
        daily: {
          time: Array.from({ length: 7 }, (_, i) => now + i * 86400),
          weather_code: [0, 2, 45, 61, 71, 95, 3],
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
  await button("Saved locations").click();
  await expect(right().locator(".pin-editor input")).toHaveCount(0);
  const pin = right()
    .locator("[data-pin-id]")
    .filter({ has: button("Go to saved location Durban station") });
  await pin
    .getByRole("button", {
      name: "Edit saved location Durban station",
      exact: true,
    })
    .click();
  await pin.getByLabel(/Contact name for saved location/).fill("Captain Local");
  for (const name of [
    "Save changes",
    "Use this pin as home location",
    "Move on map",
  ]) {
    await expect(
      pin.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("title", name);
    assert.equal(
      (await pin.getByRole("button", { name, exact: true }).innerText()).trim(),
      "",
    );
  }
  await pin.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(pin.locator("input")).toHaveCount(0);
  await expect(pin).toContainText("Captain Local");
  await button("Go to saved location Durban station").dblclick();
  await expect(pin.locator(".contact-context")).toHaveCount(0);
  await button("Go to saved location Durban station").dblclick();
  await expect(pin.locator(".contact-context")).toHaveCount(1);
  await right().getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(right().locator("[data-contact-id]")).toHaveCount(4);
  await expect(right().locator(".pin-editor input")).toHaveCount(0);
  const zelda = right()
    .locator("[data-contact-id]")
    .filter({ has: button("Go to contact Zelda operator") });
  await zelda.scrollIntoViewIfNeeded();
  await expect(zelda.locator(".contact-weather")).toContainText("20°C");
  await button("Location details").click();
  const units = page
    .locator(".location-pane")
    .getByRole("switch", { name: "Temperature units", exact: true });
  await units.click();
  await expect(zelda.locator(".contact-weather")).toContainText("68°F");
  await units.click();
  await expect(zelda.locator(".contact-weather")).toContainText("20°C");
  await button("Close location details").click();
  await expect(zelda.locator(".contact-time svg")).toHaveAttribute(
    "aria-label",
    /Daylight|Night/,
  );
  await expect(zelda).toContainText("Africa/Johannesburg");
  await expect(zelda).toContainText(
    homeDifference("Africa/Johannesburg", "Europe/London", new Date()),
  );
  await expect(zelda).toContainText("Cached / stale");
  await zelda.locator("summary").click();
  await expect(zelda.locator(".link-planning")).toContainText(
    "not dial settings",
  );
  await expect(zelda.locator(".link-planning")).toContainText("true from home");
  await page.screenshot({ path: "/tmp/oar-readonly-contacts.png" });
  const before = await page
    .locator(".world-map")
    .getAttribute("data-selected-location");
  await button("Go to contact Zelda operator").dblclick();
  await expect(zelda.locator(".contact-context")).toHaveCount(0);
  await page.waitForTimeout(400);
  assert.equal(
    await page.locator(".world-map").getAttribute("data-selected-location"),
    before,
  );
  await button("Go to contact Zelda operator").dblclick();
  await right().getByRole("button", { name: "Order by", exact: true }).click();
  await page
    .getByLabel("Order field", { exact: true })
    .selectOption("callsign");
  await page.getByLabel("Order direction", { exact: true }).selectOption("asc");
  await expect(
    right().locator("[data-contact-id] .location-card-title").first(),
  ).toContainText("No coordinates");
  await page
    .getByLabel("Order direction", { exact: true })
    .selectOption("desc");
  await expect(
    right().locator("[data-contact-id] .location-card-title").first(),
  ).toContainText("Zelda operator");
  await page.getByLabel("Order field", { exact: true }).selectOption("name");
  await page
    .getByLabel("Order direction", { exact: true })
    .selectOption("desc");
  await page.keyboard.press("Escape");
  await expect(
    right().locator("[data-contact-id] .location-card-title").first(),
  ).toContainText("Zoe duplicate");
  await right()
    .getByRole("button", { name: "Show group headers", exact: true })
    .click();
  await expect(right().locator(".saved-group-header")).toHaveCount(3);
  const group = right().getByRole("button", {
    name: "Z (2)",
    exact: true,
  });
  await group.dblclick();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await right()
    .getByRole("button", { name: "Collapse all items", exact: true })
    .click();
  await expect(right().locator(".contact-context")).toHaveCount(0);
  await right()
    .getByRole("button", { name: "Expand all items", exact: true })
    .click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await group.dblclick();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await right().getByRole("button", { name: "Group by", exact: true }).click();
  await page
    .getByLabel("Group field", { exact: true })
    .selectOption("timezone");
  await page.keyboard.press("Escape");
  await expect(right().locator(".saved-group-header")).toHaveCount(3);
  await expect(right().locator(".saved-group-header")).toContainText([
    "Unknown timezone",
    "America/Toronto",
    "Africa/Johannesburg",
  ]);
  await page.screenshot({ path: "/tmp/oar-grouped-contacts.png" });
  await right()
    .getByRole("button", { name: "Show group headers", exact: true })
    .click();
  const alpha = right()
    .locator("[data-contact-id]")
    .filter({ has: button("Go to contact Alpha friend") });
  await alpha
    .getByRole("button", { name: "Edit contact Alpha friend", exact: true })
    .click();
  await alpha.getByLabel(/name for contact/).fill("Private Renamed");
  await alpha
    .getByRole("button", { name: "Save contact", exact: true })
    .click();
  await expect(button("Go to contact Private Renamed")).toBeVisible();
  await button("Saved locations").click();
  await app.evaluate(({ net }) => {
    globalThis.geocodeQueries = [];
    const fetch = net.fetch;
    net.fetch = function (url, ...args) {
      if (String(url).includes("/api/geocode?"))
        globalThis.geocodeQueries.push(String(url));
      return fetch.call(this, url, ...args);
    };
  });
  const search = page.getByRole("combobox", {
    name: "Search addresses and places",
    exact: true,
  });
  await search.fill("Captain Local");
  await page.getByRole("option").filter({ hasText: "Captain Local" }).click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-selected-location",
    "-29.8579,31.0292",
  );
  await expect(right()).toHaveAttribute("aria-hidden", "true");
  await search.fill("Private Renamed");
  await page.getByRole("option").filter({ hasText: "Private Renamed" }).click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-selected-location",
    "43.5,-79",
  );
  assert.deepEqual(await app.evaluate(() => globalThis.geocodeQueries), []);
  await search.fill("No coordinates");
  await page.getByRole("option").filter({ hasText: "No coordinates" }).click();
  await expect(right()).toHaveAttribute("aria-hidden", "false");
  await expect(right().locator(".selected")).toContainText("No coordinates");
  await right()
    .getByRole("button", { name: "Collapse all items", exact: true })
    .click();
  await expect(right().locator(".selected .contact-context")).toHaveCount(0);
  await search.fill("No coordinates");
  await page.getByRole("option").filter({ hasText: "No coordinates" }).click();
  await expect(right().locator(".selected .contact-context")).toHaveCount(1);
  assert.deepEqual(await app.evaluate(() => globalThis.geocodeQueries), []);
  await button("Quick Switch").click();
  const quick = page.locator("#quick-switch-panel");
  assert.ok((await quick.boundingBox()).width <= 282);
  const radar = quick.getByRole("switch", { name: "Radar", exact: true });
  await expect(radar).toHaveAttribute("aria-checked", "false");
  await radar.locator("strong").click();
  await expect(radar).toHaveAttribute("aria-checked", "true");
  const box = await radar.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(radar).toHaveAttribute("aria-checked", "false");
  for (const control of await quick.getByRole("switch").all()) {
    await expect(control.locator(".row-toggle-track")).toHaveCount(1);
    const initial = await control.getAttribute("aria-checked");
    await control.locator("strong").click();
    await expect(control).toHaveAttribute(
      "aria-checked",
      initial === "true" ? "false" : "true",
    );
    await control.press("Space");
    await expect(control).toHaveAttribute("aria-checked", initial);
  }
  await button("Close Quick Switch").click();
  await button("Saved locations").click();
  await button("Go to home location").click();
  const home = page.getByRole("region", {
    name: "Home location details",
    exact: true,
  });
  await expect(home.locator(".forecast-grid>div")).toHaveCount(3);
  await expect(
    page.locator(".location-pane .location-card").first(),
  ).toHaveAttribute("aria-label", "Home location details");
  for (const name of [
    "Home location details",
    "Home current weather",
    "Home forecast",
  ])
    await home.getByRole("button", { name, exact: true }).click();
  await home
    .getByRole("button", { name: "Collapse home location", exact: true })
    .click();
  await app.close();
  app = null;
  await launch();
  await button("Location details").click();
  const restored = page.getByRole("region", {
    name: "Home location details",
    exact: true,
  });
  await expect(
    restored.getByRole("button", { name: "Expand home location", exact: true }),
  ).toBeVisible();
  await restored
    .getByRole("button", { name: "Expand home location", exact: true })
    .click();
  for (const name of [
    "Home location details",
    "Home current weather",
    "Home forecast",
  ])
    await expect(
      restored.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
  await restored
    .getByRole("button", { name: "Home forecast", exact: true })
    .click();
  await expect(restored.locator(".forecast-grid")).toBeVisible();
  await button("Saved locations").click();
  await expect(right().locator(".pin-editor input")).toHaveCount(0);
  assert.equal(
    (await page.evaluate(() => window.oarDesktop.request("/pins"))).find(
      (p) => p.label === "Durban station",
    ).name,
    "Captain Local",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Saved items passed: read-only/edit/save, pin contact names, local private name search, weather/time/DST context, honest link guidance, title double-click, sorting/grouping and independent collapse controls, full-row narrow Quick Switch, persistent home sections and restart data.",
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-saved-items-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-6500));
  }
  throw e;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
