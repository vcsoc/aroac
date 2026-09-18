import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultTimeConfig } from "../shared/workspace.js";
import { nightGeometry } from "../src/solar.js";
import { DatabaseSync } from "node:sqlite";
const dir = mkdtempSync(path.join(tmpdir(), "oar-layout-"));
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
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
}
async function quickToggle(name) {
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  await page.getByRole("switch", { name, exact: true }).click();
  await page
    .getByRole("button", { name: "Close Quick Switch", exact: true })
    .click();
}
async function snapshot() {
  return page.locator(".world-map").evaluate((el) => {
    let fiber = el[Object.keys(el).find((k) => k.startsWith("__reactFiber"))];
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        if (map?.getSource)
          return {
            data:
              map.getSource("night")._data.geojson ??
              map.getSource("night")._data,
            time: el.dataset.nightTime,
            center: map.getCenter(),
            offset: el.dataset.nightOffset,
            muf: map.getSource("muf")?._data.geojson ?? null,
            mufPoint: map.project([31.0292, -29.8579]),
          };
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    throw Error("Map instance not found");
  });
}
async function fits() {
  const boxes = await page.evaluate(() => {
    const selectors = [
      ".atlas",
      ".world-map",
      ".map-footer",
      ...(document.querySelector(".bottom-grid")
        ? [".stats-grid", ".bottom-grid"]
        : []),
    ];
    return {
      height: innerHeight,
      width: innerWidth,
      scrollHeight: document.scrollingElement.scrollHeight,
      scrollWidth: document.scrollingElement.scrollWidth,
      boxes: selectors.map((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return {
          selector: s,
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height,
        };
      }),
    };
  });
  assert.ok(boxes.scrollHeight <= boxes.height + 1, JSON.stringify(boxes));
  assert.ok(boxes.scrollWidth <= boxes.width + 1, JSON.stringify(boxes));
  for (const b of boxes.boxes) {
    assert.ok(
      b.top >= 0 && b.bottom <= boxes.height + 1 && b.height > 0,
      JSON.stringify(boxes),
    );
  }
  assert.ok(
    boxes.boxes.find((b) => b.selector === ".world-map").height > 100,
    JSON.stringify(boxes),
  );
}
try {
  await launch();
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  await page.reload();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-night-ready",
    "true",
  );
  await page
    .getByRole("button", { name: "Go to home location", exact: true })
    .click();
  await expect(page.locator(".clock-editor")).toBeVisible();
  await page.getByRole("button", { name: "Close clock editor" }).click();
  const config = defaultTimeConfig();
  config.home = {
    name: "Durban home",
    zone: "Africa/Johannesburg",
    lat: -29.8579,
    lng: 31.0292,
  };
  await page.evaluate(
    (config) =>
      window.oarDesktop.request("/preferences/world-time", {
        method: "PUT",
        body: JSON.stringify(config),
      }),
    config,
  );
  await page.reload();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-night-ready",
    "true",
  );
  for (const size of [
    { width: 1900, height: 1040 },
    { width: 1280, height: 800 },
    { width: 960, height: 640 },
  ]) {
    await page.setViewportSize(size);
    for (const name of ["Overview", "World atlas"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await fits();
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Location details", exact: true })
    .click();
  const units = await page
      .getByRole("switch", { name: "Temperature units", exact: true })
      .boundingBox(),
    days = await page
      .getByRole("switch", { name: "Forecast days", exact: true })
      .boundingBox();
  assert.ok(Math.abs(units.y - days.y) < 1);
  assert.ok(
    units.width <= 101 && days.width <= 101,
    JSON.stringify({ units, days }),
  );
  await fits();
  await page.screenshot({ path: "/tmp/oar-fitted-overview.png" });
  const info = await page.evaluate(() => window.oarDesktop.connection());
  const db = new DatabaseSync(info.databasePath);
  db.prepare(
    "INSERT INTO feed_cache VALUES('muf',?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,fetched=excluded.fetched",
  ).run(
    JSON.stringify({
      observations: [
        {
          code: "TEST",
          name: "Test ionosonde",
          lat: -29.8579,
          lng: 31.0292,
          mhz: 28.8,
          observedAt: new Date().toISOString(),
          confidence: 100,
        },
      ],
      source: "https://prop.kc2g.com/api/stations.json",
      fetchedAt: new Date().toISOString(),
    }),
    Date.now(),
  );
  db.prepare("INSERT INTO feed_cache VALUES('muf-contours',?,?)").run(
    JSON.stringify({
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { mhz: 28, label: "28.0 MHz" },
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [
                  [26, -30],
                  [31.0292, -29.8579],
                  [40, -24],
                ],
              ],
            },
          },
        ],
      },
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      source: "test fixture",
    }),
    Date.now(),
  );
  db.close();
  await quickToggle("MUF");
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-muf-count",
    "1",
  );
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-muf-contours",
    "1",
  );
  for (const projection of ["mercator", "globe"]) {
    if (projection === "globe")
      await page
        .getByRole("switch", { name: "Map projection", exact: true })
        .click();
    await expect(page.locator(".world-map")).toHaveAttribute(
      "data-projection",
      projection,
    );
    await page
      .getByRole("button", { name: "Go to home location", exact: true })
      .click();
    await expect(page.locator(".world-map")).toHaveAttribute(
      "data-selected-location",
      "-29.8579,31.0292",
    );
    await expect
      .poll(async () => Math.abs((await snapshot()).center.lat + 29.8579))
      .toBeLessThan(0.001);
    await expect(
      page.getByRole("img", { name: "Home location Durban home", exact: true }),
    ).toHaveCount(1);
    const overlay = await snapshot();
    assert.deepEqual(
      overlay.muf.features[0].geometry.coordinates,
      [31.0292, -29.8579],
    );
    assert.equal(overlay.muf.features[0].properties.label, "28.8*");
    const bounds = await page.locator(".world-map").boundingBox();
    await page.mouse.click(
      bounds.x + overlay.mufPoint.x,
      bounds.y + overlay.mufPoint.y,
    );
    await expect(page.locator(".muf-popup")).toContainText("28.8 MHz");
    await expect(page.locator(".muf-popup")).toContainText("Observed:");
    await page.locator(".maplibregl-popup-close-button").click();
  }
  const home = await page
      .getByRole("button", { name: "Go to home location", exact: true })
      .boundingBox(),
    zoom = await page
      .getByRole("button", { name: "Zoom out", exact: true })
      .boundingBox();
  assert.ok(home.y >= zoom.y + zoom.height);
  assert.ok(Math.abs(home.x - zoom.x) < 2);
  const before = await snapshot();
  const slider = page.getByRole("slider", {
    name: "Compare world clock times",
    exact: true,
  });
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-night-offset",
    "15",
  );
  let shifted = await snapshot();
  assert.notDeepEqual(shifted.data, before.data);
  assert.deepEqual(shifted.muf, before.muf);
  await page.locator(".muf-legend summary").click();
  await expect(page.locator(".muf-legend")).toContainText("Offline");
  await expect(page.locator(".muf-legend")).toContainText("modeled contours");
  await page.screenshot({ path: "/tmp/oar-muf-layer.png" });
  await quickToggle("MUF");
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-muf-count",
    "0",
  );
  assert.deepEqual(shifted.data, nightGeometry(new Date(shifted.time)));
  assert.ok(
    Math.abs(new Date(shifted.time).getTime() - Date.now() - 15 * 60000) < 5000,
  );
  await quickToggle("Grey line follows clock slider");
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(6);
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-night-offset",
    "0",
  );
  await page.getByRole("tab", { name: "Map", exact: true }).press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Login", exact: true }),
  ).toBeFocused();
  await page.getByRole("tab", { name: "Themes", exact: true }).click();
  await expect(page.getByLabel("accent hex color")).toBeVisible();
  await page.screenshot({ path: "/tmp/oar-tabbed-settings.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Map settings", exact: true }),
  ).toBeFocused();
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("30");
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-night-offset",
    "0",
  );
  assert.ok(
    Math.abs(new Date((await snapshot()).time).getTime() - Date.now()) < 70000,
  );
  await quickToggle("Grey line follows clock slider");
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-night-offset",
    "30",
  );
  for (const [key, offset] of [
    ["Home", "-1440"],
    ["End", "10080"],
  ]) {
    await slider.focus();
    await slider.press(key);
    await expect(page.locator(".world-map")).toHaveAttribute(
      "data-night-offset",
      offset,
    );
    shifted = await snapshot();
    assert.deepEqual(shifted.data, nightGeometry(new Date(shifted.time)));
  }
  await page.getByRole("button", { name: "Now", exact: true }).click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-night-offset",
    "0",
  );
  await quickToggle("Grey line follows clock slider");
  await app.close();
  app = null;
  await launch();
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  await expect(
    page.getByRole("switch", {
      name: "Grey line follows clock slider",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "false");
  console.log(
    "Layout/settings passed: window-fit overview and atlas at three sizes, aligned switches, both projections, home control and unset-home editor, tabbed modal/keyboard/focus, real grey-line geometry at slider times and persisted opt-out.",
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-layout-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-5000));
  }
  throw error;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
