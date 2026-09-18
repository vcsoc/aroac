import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parse } from "yaml";
const directory = mkdtempSync(path.join(tmpdir(), "oar-workspace-"));
let app, page;
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
  page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
}
const request = (route, options) =>
  page.evaluate(
    ([route, options]) => window.oarDesktop.request(route, options),
    [route, options],
  );
try {
  await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  const info = await page.evaluate(() => window.oarDesktop.connection());
  const db = new DatabaseSync(info.databasePath),
    now = Math.floor(Date.now() / 1000);
  const weather = {
    source: "Open-Meteo test fixture",
    fetchedAt: new Date().toISOString(),
    timezone: "Europe/London",
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
      weather_code: [0, 2, 45, 61, 71, 95, 999],
      temperature_2m_max: Array(7).fill(22),
      temperature_2m_min: Array(7).fill(12),
      sunrise: Array(7).fill(now),
      sunset: Array(7).fill(now + 36000),
      precipitation_probability_max: Array(7).fill(40),
      wind_speed_10m_max: Array(7).fill(20),
    },
  };
  db.prepare("INSERT INTO weather_cache VALUES(?,?,?)").run(
    "51.503,-0.128",
    JSON.stringify(weather),
    Date.now(),
  );
  db.close();
  await page
    .getByRole("button", { name: "Edit Home Location Time clock" })
    .dblclick();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Location name", { exact: true }).fill("London home");
  await dialog.getByLabel("Timezone", { exact: true }).fill("Europe/London");
  await dialog.getByLabel("Latitude (optional)").fill("51.5034");
  await dialog.getByLabel("Longitude (optional)").fill("-0.1276");
  await dialog.getByRole("button", { name: "Save clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Home Location Time clock" }),
  ).toContainText("London home");
  await page.getByRole("button", { name: "Add clock", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Location name", { exact: true }).fill("Kathmandu");
  await dialog.getByLabel("Timezone", { exact: true }).fill("Asia/Kathmandu");
  await dialog.getByRole("button", { name: "Save clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Kathmandu clock" }),
  ).toBeVisible();
  const before = await page
    .locator(".world-clocks .clock strong")
    .allTextContents();
  const slider = page.getByRole("slider", {
    name: "Compare world clock times",
  });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "15 minutes from now");
  const after = await page
      .locator(".world-clocks .clock strong")
      .allTextContents(),
    seconds = (s) =>
      s
        .replace("Z", "")
        .split(":")
        .map(Number)
        .reduce((n, v) => n * 60 + v, 0);
  assert.equal(before.length, 6);
  for (let i = 0; i < before.length; i++) {
    const diff = (seconds(after[i]) - seconds(before[i]) + 86400) % 86400;
    assert.ok(diff >= 899 && diff <= 903, `${before[i]} -> ${after[i]}`);
  }
  await page.getByRole("button", { name: "Now", exact: true }).click();
  await page
    .getByRole("button", { name: "Location details", exact: true })
    .click();
  const left = page.getByRole("complementary", {
    name: "Location details",
    exact: true,
  });
  await expect(left.getByText("20°C", { exact: true })).toBeVisible();
  await left.getByRole("switch", { name: "Temperature units" }).click();
  await expect(left.getByText("68°F", { exact: true })).toBeVisible();
  await left.getByRole("switch", { name: "Forecast days" }).click();
  assert.equal(await left.locator(".forecast-grid>div").count(), 7);
  await page
    .getByRole("button", { name: "Go to home location", exact: true })
    .click();
  for (const name of ["Home location details", "Selected location details"]) {
    const card = page.getByRole("region", { name, exact: true });
    await expect(card.getByText("68°F", { exact: true })).toBeVisible();
    assert.equal(await card.locator(".forecast-grid svg").count(), 7);
    await expect(
      card.locator(".forecast-grid .weather-icon-clear"),
    ).toHaveCount(1);
    await expect(card.locator(".forecast-grid .weather-icon-rain")).toHaveCount(
      1,
    );
    await expect(card.locator(".forecast-grid .weather-icon-snow")).toHaveCount(
      1,
    );
    assert.equal(
      await card
        .locator(".weather-facts")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
      2,
    );
  }
  await page.screenshot({ path: "/tmp/oar-home-weather.png" });
  await page
    .getByRole("button", { name: "Pin left panel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close location details" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pin right panel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await expect(page.locator("#map-drawer")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await page
    .getByRole("button", { name: "Pin right panel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close side panel", exact: true })
    .click();
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Themes", exact: true }).click();
  await page.getByLabel("accent hex color").fill("#ffcc66");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--accent"),
      ),
    )
    .toBe("#ffcc66");
  await page.getByRole("button", { name: "Apply theme", exact: true }).click();
  await expect(page.getByText("Theme saved.", { exact: true })).toBeVisible();
  const themeFile = path.join(directory, "theme.yaml");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, themeFile);
  await page.getByRole("button", { name: "Export YAML" }).click();
  await expect(
    page.getByText("Theme exported.", { exact: true }),
  ).toBeVisible();
  assert.equal(parse(readFileSync(themeFile, "utf8")).colors.accent, "#ffcc66");
  await page.getByLabel("accent hex color").fill("#112233");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, themeFile);
  await page.getByRole("button", { name: "Import YAML" }).click();
  await expect(page.getByLabel("accent hex color")).toHaveValue("#ffcc66");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await request("/pins", {
    method: "POST",
    body: JSON.stringify({
      label: "Export test",
      callsign: "N0TEST",
      lat: 51.5034,
      lng: -0.1276,
      notes: "Local data",
    }),
  });
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.getByLabel("name for contact new").fill("Radio friend");
  await page.getByLabel("callsign for contact new").fill("N0TEST");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect
    .poll(async () => (await request("/address-book")).length)
    .toBe(1);
  const libraryFile = path.join(directory, "locations.json");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, libraryFile);
  await page
    .getByRole("button", { name: "Export locations / contacts" })
    .click();
  await expect(
    page.getByText("Locations and contacts exported.", { exact: true }),
  ).toBeVisible();
  const exported = JSON.parse(readFileSync(libraryFile, "utf8"));
  assert.equal(exported.pins.length, 1);
  assert.equal(exported.contacts.length, 1);
  exported.pins.push({ ...exported.pins[0], label: "Imported pin" });
  writeFileSync(libraryFile, JSON.stringify(exported));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, libraryFile);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import preview", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm merge import" }).click();
  await expect.poll(async () => (await request("/pins")).length).toBe(2);
  assert.equal((await request("/address-book")).length, 1);
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await page.getByRole("button", { name: "Conditions", exact: true }).click();
  await expect(left).toBeVisible();
  await page.evaluate(() => window.oarDesktop.setOffline(false));
  await app.evaluate(async ({ session }) => {
    await session
      .fromPartition("oar-specialists")
      .protocol.handle(
        "https",
        () =>
          new Response(
            "<html><body><h1>Isolated specialist fixture</h1></body></html>",
            { headers: { "content-type": "text/html" } },
          ),
      );
  });
  await page.getByRole("button", { name: /Maximum usable frequency/ }).click();
  await expect
    .poll(() =>
      app.evaluate(
        ({ webContents }) =>
          webContents
            .getAllWebContents()
            .filter((c) => c.getURL().startsWith("https://prop.kc2g.com"))
            .length,
      ),
    )
    .toBe(1);
  const isolated = await app.evaluate(async ({ webContents }) => {
    const c = webContents
      .getAllWebContents()
      .find((c) => c.getURL().startsWith("https://prop.kc2g.com"));
    return {
      preferences: c.getLastWebPreferences(),
      exposed: await c.executeJavaScript(
        'typeof window.oarDesktop + ":" + typeof require',
      ),
    };
  });
  assert.equal(isolated.preferences.sandbox, true);
  assert.equal(isolated.preferences.nodeIntegration, false);
  assert.equal(isolated.exposed, "undefined:undefined");
  await page.getByRole("button", { name: "Close view", exact: true }).click();
  await page.getByRole("button", { name: "World atlas", exact: true }).click();
  await page.screenshot({ path: "/tmp/oar-workspace-customization.png" });
  assert.deepEqual(errors, []);
  await app.close();
  app = null;
  await launch();
  await expect(
    page.getByRole("button", { name: "Edit Kathmandu clock" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Home Location Time clock" }),
  ).toContainText("London home");
  assert.equal(
    (await request("/preferences/theme")).value.colors.accent,
    "#ffcc66",
  );
  await expect(
    page.getByRole("button", { name: "Pin left panel" }),
  ).toHaveAttribute("aria-pressed", "true");
  console.log(
    "Workspace smoke passed: editable/home clocks, shared timeline, seven-day weather C/F, pinned panels, live themes and YAML round-trip, contact/location merge imports, isolated specialist view, restart persistence.",
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-workspace-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-6000));
  }
  throw error;
} finally {
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
}
