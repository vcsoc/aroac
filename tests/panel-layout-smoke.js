import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultTimeConfig } from "../shared/workspace.js";
const dir = mkdtempSync(path.join(tmpdir(), "oar-panels-"));
let app, page;
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
}
const panel = (side) =>
  page.locator(side === "left" ? ".location-pane" : "#map-drawer");
async function drag(side, delta) {
  const handle = page.getByRole("separator", {
      name: "Resize " + side + " panel",
      exact: true,
    }),
    b = await handle.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 100);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + delta, b.y + 100, { steps: 8 });
  await page.mouse.up();
}
try {
  await launch();
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  const config = defaultTimeConfig();
  config.home = {
    name: "London home",
    zone: "Europe/London",
    lat: 51.5034,
    lng: -0.1276,
  };
  await page.evaluate(
    (c) =>
      window.oarDesktop.request("/preferences/world-time", {
        method: "PUT",
        body: JSON.stringify(c),
      }),
    config,
  );
  const info = await page.evaluate(() => window.oarDesktop.connection()),
    db = new DatabaseSync(info.databasePath),
    now = Math.floor(Date.now() / 1000);
  db.prepare("INSERT INTO weather_cache VALUES(?,?,?)").run(
    "51.503,-0.128",
    JSON.stringify({
      source: "Test fixture",
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
  await page
    .getByRole("button", { name: "Go to home location", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Forecast days", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Home location details", exact: true })
      .locator(".forecast-grid>div"),
  ).toHaveCount(7);
  const body = panel("left").locator(".themed-scroll");
  await expect
    .poll(() => body.evaluate((el) => el.scrollHeight > el.clientHeight))
    .toBe(true);
  await expect(body).not.toHaveClass(/scrolling/);
  assert.equal(
    await body.evaluate(
      (el) => getComputedStyle(el, "::-webkit-scrollbar").width,
    ),
    "4px",
  );
  assert.equal(
    await body.evaluate(
      (el) => getComputedStyle(el, "::-webkit-scrollbar-thumb").backgroundColor,
    ),
    "rgba(0, 0, 0, 0)",
  );
  const previous = await page.evaluate(() => {
    const v = document.documentElement.style.getPropertyValue("--muted");
    document.documentElement.style.setProperty("--muted", "#f020aa");
    return v;
  });
  await body.hover();
  await page.mouse.wheel(0, 200);
  await expect(body).toHaveClass(/scrolling/);
  assert.equal(
    await body.evaluate(
      (el) => getComputedStyle(el, "::-webkit-scrollbar-thumb").backgroundColor,
    ),
    "rgb(240, 32, 170)",
  );
  await expect(body).not.toHaveClass(/scrolling/, { timeout: 3000 });
  await page.evaluate(
    (v) => document.documentElement.style.setProperty("--muted", v),
    previous,
  );
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await drag("left", 90);
  await drag("right", -90);
  await expect
    .poll(() =>
      panel("left").evaluate((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    )
    .toBe(440);
  await expect
    .poll(() =>
      panel("right").evaluate((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    )
    .toBe(430);
  const saved = await page.evaluate(() => [
    localStorage.getItem("oar-left-width"),
    localStorage.getItem("oar-right-width"),
  ]);
  assert.deepEqual(saved, ["440", "430"]);
  await page.setViewportSize({ width: 1000, height: 720 });
  assert.ok((await page.locator(".world-map").boundingBox()).width >= 250);
  assert.deepEqual(
    await page.evaluate(() => [
      localStorage.getItem("oar-left-width"),
      localStorage.getItem("oar-right-width"),
    ]),
    saved,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("separator", { name: "Resize left panel" })
    .press("ArrowRight");
  await expect
    .poll(() =>
      panel("left").evaluate((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    )
    .toBe(450);
  await page
    .getByRole("separator", { name: "Resize right panel" })
    .press("ArrowLeft");
  await expect
    .poll(() =>
      panel("right").evaluate((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    )
    .toBe(440);
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  const quick = page.locator("#quick-switch-panel");
  await page.waitForTimeout(200);
  const switches = await quick.getByRole("switch").all();
  assert.equal(switches.length, 8);
  let prior;
  for (const control of switches) {
    const b = await control.boundingBox();
    if (prior) {
      assert.ok(Math.abs(b.x - prior.x) < 1);
      assert.ok(Math.abs(b.width - prior.width) < 1);
      assert.ok(Math.abs(b.height - prior.height) < 1);
      assert.ok(b.y >= prior.y + prior.height - 1);
    }
    prior = b;
  }
  await page.screenshot({ path: "/tmp/oar-panels-and-quick-switch.png" });
  await page
    .getByRole("button", { name: "Close Quick Switch", exact: true })
    .click();
  const pin = await page
      .getByRole("button", { name: "Location details", exact: true })
      .boundingBox(),
    nav = await page.locator(".breadcrumb").boundingBox();
  assert.ok(pin.x + pin.width <= nav.x + 1);
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  const auth = page.locator(".auth-dialog"),
    call = await auth.getByLabel("Callsign", { exact: true }).boundingBox(),
    toggle = auth.getByRole("switch", {
      name: "Remember my callsign",
      exact: true,
    }),
    t = await toggle.boundingBox();
  assert.ok(t.y >= call.y + call.height);
  assert.ok(Math.abs(t.x - call.x) < 2);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.screenshot({ path: "/tmp/oar-login-toggle.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await app.close();
  app = null;
  await launch();
  await page
    .getByRole("button", { name: "Location details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await expect
    .poll(() =>
      panel("left").evaluate((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    )
    .toBe(450);
  await expect
    .poll(() =>
      panel("right").evaluate((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    )
    .toBe(440);
  await page.getByRole("separator", { name: "Resize left panel" }).dblclick();
  await expect
    .poll(() =>
      panel("left").evaluate((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    )
    .toBe(350);
  console.log(
    "Panel layout passed: themed 4px scrolling-only thumb, stacked aligned switches, login switch placement/keyboard, topbar icon order, mouse/keyboard resizing, responsive bounds and restart persistence.",
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-panel-layout-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-3000));
  }
  throw e;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
