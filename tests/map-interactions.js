import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeRepeaters } from "../server/repeaters.js";
import { DEFAULT_COVERAGE } from "../shared/coverage.js";
const directory = mkdtempSync(path.join(tmpdir(), "oar-map-interactions-"));
let app;
async function projectedPoint(page, lng, lat) {
  return page.locator(".world-map").evaluate(
    (el, coords) => {
      let fiber = el[Object.keys(el).find((k) => k.startsWith("__reactFiber"))];
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const map = hook.memoizedState?.current;
          if (map?.project) {
            const point = map.project(coords),
              canvas = map.getCanvas(),
              rect = canvas.getBoundingClientRect();
            return {
              x: rect.left + (point.x * rect.width) / canvas.offsetWidth,
              y: rect.top + (point.y * rect.height) / canvas.offsetHeight,
            };
          }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      throw Error("Map instance not available");
    },
    [lng, lat],
  );
}
async function rangeCamera(page) {
  return page.locator(".world-map").evaluate(async (el) => {
    let fiber = el[Object.keys(el).find((k) => k.startsWith("__reactFiber"))];
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        if (map?.project) {
          const features = (await map.getSource("coverage").getData()).features;
          const center = map.getCenter().lng;
          const points = features
            .filter((f) => ["direct", "secondary"].includes(f.properties.kind))
            .flatMap((f) => f.geometry.coordinates.flat());
          return {
            zoom: map.getZoom(),
            moving: map.isMoving(),
            fits:
              points.length > 0 &&
              points.every(([lng, lat]) => {
                const p = map.project([
                  center + ((lng - center + 540) % 360) - 180,
                  lat,
                ]);
                return (
                  p.x >= 5 &&
                  p.y >= 5 &&
                  p.x <= el.clientWidth - 5 &&
                  p.y <= el.clientHeight - 5
                );
              }),
          };
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    throw Error("Map instance not available");
  });
}
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
  const page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Good to have you on air." })
    .waitFor();
  return page;
}
const pins = (page) => page.evaluate(() => window.oarDesktop.request("/pins"));
try {
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const iconToggles = page.getByRole("group", { name: "Map quick toggles" });
  await expect(iconToggles.getByRole("button")).toHaveCount(10);
  for (const button of await iconToggles.getByRole("button").all()) {
    assert.ok((await button.getAttribute("title")).length > 40);
    await expect(button.locator("svg")).toHaveCount(1);
  }
  const rangeIcon = iconToggles.getByRole("button", {
    name: "Estimated range",
    exact: true,
  });
  await expect(rangeIcon).toHaveAttribute("aria-pressed", "false");
  await rangeIcon.focus();
  await page.keyboard.press("Space");
  await expect(rangeIcon).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Range", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Estimated range", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await rangeIcon.click();
  await expect(rangeIcon).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("tabpanel", { name: "General", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "General", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Location details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Location details", exact: true })
    .click();
  const left = page.getByRole("complementary", {
    name: "Location details",
    exact: true,
  });
  await expect(
    left.getByRole("tab", { name: "General", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    left.getByRole("heading", { name: "Location details", exact: true }),
  ).toBeVisible();
  await left.getByRole("tab", { name: "General", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    left.getByRole("tab", { name: "Range", exact: true }),
  ).toBeFocused();
  await expect(
    left.getByRole("tabpanel", { name: "Range", exact: true }),
  ).toBeVisible();
  assert.equal(await page.locator(".atlas .coverage-controls").count(), 0);
  await expect(left.getByRole("tab")).toHaveCount(2);
  await expect(
    left.getByRole("tab", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  await expect(left.locator("#location-panel-settings")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(
    left.getByRole("tab", { name: "General", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    left.getByRole("tab", { name: "Range", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    left.getByRole("tab", { name: "General", exact: true }),
  ).toBeFocused();
  await left.getByRole("tab", { name: "Range", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Map view", exact: true })
    .selectOption("topographic");
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-basemap",
    "topographic",
  );
  const rangeSwitch = page.getByRole("switch", {
    name: "Estimated range",
    exact: true,
  });
  await expect(rangeSwitch).toHaveAttribute("aria-checked", "false");
  await expect(rangeSwitch).toHaveAttribute("title", "Turn estimated range ON");
  const resetRange = left.getByRole("button", {
    name: "Reset range defaults",
    exact: true,
  });
  await expect(resetRange).toHaveCount(0);
  await expect(left.locator(".coverage-toolbar [role='switch']")).toHaveCount(
    0,
  );
  const headingLayout = await left
    .locator(".coverage-heading")
    .evaluate((el) => {
      const heading = el.querySelector("h2").getBoundingClientRect();
      const toggle = el
        .querySelector('[role="switch"]')
        .getBoundingClientRect();
      const container = el.getBoundingClientRect();
      return {
        aligned:
          Math.abs(
            heading.y + heading.height / 2 - toggle.y - toggle.height / 2,
          ) < 2,
        rightAligned: Math.abs(toggle.right - container.right) < 2,
        headingFirst: heading.right < toggle.left,
      };
    });
  assert.deepEqual(headingLayout, {
    aligned: true,
    rightAligned: true,
    headingFirst: true,
  });
  await rangeSwitch.focus();
  await page.keyboard.press("Space");
  await expect(rangeSwitch).toHaveAttribute("aria-checked", "true");
  await expect(rangeIcon).toHaveAttribute("aria-pressed", "true");
  await expect(rangeSwitch).toHaveAttribute(
    "title",
    "Turn estimated range OFF",
  );
  await expect(resetRange).toBeVisible();
  await expect(resetRange).toHaveAttribute(
    "title",
    /Reset band, range assumptions and map view/,
  );
  await expect(
    page.getByText(
      "Select a location on the map, a saved location, or Home to set the range origin.",
    ),
  ).toBeVisible();
  const info = await page.evaluate(() => window.oarDesktop.connection());
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  const db = new DatabaseSync(info.databasePath);
  const fixture = normalizeRepeaters([
    {
      id: 1,
      callsign: "N0TEST",
      latitude: 51.5034,
      longitude: -0.1276,
      frequency: 145270000,
      offset: -600000,
      mode: "FM",
      description: "Test-only repeater details",
      encode: "100.0",
    },
    {
      id: 2,
      callsign: "N0TEST2",
      latitude: 51.5034,
      longitude: -0.1276,
      frequency: 438800000,
      offset: -5000000,
      mode: "DMR",
      description: "Second test-only repeater",
    },
  ]);
  db.prepare("INSERT INTO repeater_cache VALUES(1,?,?)").run(
    JSON.stringify({
      repeaters: fixture,
      source: "test fixture",
      fetchedAt: new Date().toISOString(),
      providerCount: 2,
      omitted: 0,
    }),
    Date.now(),
  );
  db.close();
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Quick Switch", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator(".topbar").getByRole("switch", { name: "Show time zones" }),
  ).toHaveCount(0);
  for (const label of [
    "Grey line",
    "Radar",
    "MUF",
    "Show time zones",
    "Show street names",
    "Show city names",
    "Show repeaters",
    "Grey line follows clock slider",
  ]) {
    const icon = iconToggles.getByRole("button", { name: label, exact: true });
    const toggle = page
      .locator("#quick-switch-panel")
      .getByRole("switch", { name: label, exact: true });
    const before = await icon.getAttribute("aria-pressed");
    await expect(toggle).toHaveAttribute("aria-checked", before);
    await page
      .getByRole("button", { name: "Close Quick Switch", exact: true })
      .click();
    await icon.click();
    await page
      .getByRole("button", { name: "Quick Switch", exact: true })
      .click();
    await expect(toggle).toHaveAttribute(
      "aria-checked",
      String(before !== "true"),
    );
    await toggle.click();
    await expect(icon).toHaveAttribute("aria-pressed", before);
  }
  const quickSwitchFont = await page
    .locator(".quick-switch-body .drawer-setting strong")
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize);
  await page.getByRole("switch", { name: "Show street names" }).click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-street-names",
    "true",
  );
  await page
    .getByRole("switch", { name: "Show repeaters", exact: true })
    .click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-repeater-count",
    "2",
  );
  await page
    .getByRole("button", { name: "Close Quick Switch", exact: true })
    .click();
  await expect(page.locator("#map-drawer")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await page
    .getByRole("combobox", { name: "Search addresses and places" })
    .fill("51.5034, -0.1276");
  await page
    .getByRole("button", { name: "Search location", exact: true })
    .click();
  await page.waitForTimeout(1200);
  await left.getByRole("tab", { name: "General", exact: true }).click();
  await expect(left.getByRole("tab", { name: "General" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // Clicking a cluster expands it; individual repeaters then open the details drawer.
  for (let i = 0; i < 3; i++) {
    if (
      await page
        .getByRole("heading", { name: "Repeater details", exact: true })
        .isVisible()
    )
      break;
    const point = await projectedPoint(page, -0.1276, 51.5034);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(650);
  }
  await expect(
    page.getByRole("heading", { name: "Repeater details", exact: true }),
  ).toBeVisible();
  await expect(left.getByRole("tab", { name: "Range" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(left.getByRole("tabpanel", { name: "Range" })).toBeVisible();
  await expect(rangeSwitch).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByLabel("Choose repeater at this location"),
  ).toBeVisible();
  await page
    .getByLabel("Choose repeater at this location")
    .selectOption("hearham-1");
  await expect(
    page.getByText("Test-only repeater details", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".repeater-raw")).toContainText(
    "145,270,000 Hz (145.27 MHz)",
  );
  const crossCheck = page.getByRole("link", {
    name: "Cross-check details on RepeaterBook ↗",
  });
  await crossCheck.scrollIntoViewIfNeeded();
  await crossCheck.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "not an active AROAC data feed",
  );
  await expect(
    page.getByRole("region", { name: "Repeater range estimate" }),
  ).toContainText("Estimated radius:");
  await expect(page.locator(".coverage-controls")).toContainText(
    "Selected repeater N0TEST",
  );
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-coverage-count",
    "4",
  );
  await page
    .getByRole("combobox", { name: "Coverage band" })
    .selectOption("20m");
  await expect(page.locator(".coverage-controls")).toContainText(
    "F2 single-hop envelope",
  );
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-coverage-count",
    "4",
  );
  await expect
    .poll(async () => {
      const c = await rangeCamera(page);
      return !c.moving && c.fits;
    })
    .toBe(true);
  const hfZoom = (await rangeCamera(page)).zoom;
  await rangeSwitch.click();
  await expect(rangeSwitch).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-coverage-count",
    "0",
  );
  await rangeSwitch.click();
  await expect(rangeSwitch).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("combobox", { name: "Coverage band" })
    .selectOption("2m");
  await expect
    .poll(async () => {
      const c = await rangeCamera(page);
      return !c.moving && c.fits;
    })
    .toBe(true);
  assert.ok((await rangeCamera(page)).zoom > hfZoom + 3);
  const localZoom = (await rangeCamera(page)).zoom;
  await page
    .getByRole("combobox", { name: "Coverage band" })
    .selectOption("10m");
  await expect(page.locator(".coverage-controls")).toContainText("No F2 path");
  assert.equal((await rangeCamera(page)).zoom, localZoom);
  // A no-path band must not suppress the next valid band's fit after manual zoom.
  await page.locator(".maplibregl-ctrl-zoom-out").click();
  await expect.poll(async () => (await rangeCamera(page)).moving).toBe(false);
  assert.ok((await rangeCamera(page)).zoom < localZoom - 0.5);
  await page
    .getByRole("combobox", { name: "Coverage band" })
    .selectOption("2m");
  await expect
    .poll(async () => {
      const c = await rangeCamera(page);
      return !c.moving && c.fits && Math.abs(c.zoom - localZoom) < 0.01;
    })
    .toBe(true);
  await left.getByLabel("Station antenna height AGL (m)").fill("80");
  await page
    .getByRole("combobox", { name: "Coverage band" })
    .selectOption("20m");
  await left.getByLabel("Assumed F2 height (km)").fill("420");
  await resetRange.click();
  await expect(
    page.getByRole("combobox", { name: "Coverage band" }),
  ).toHaveValue("2m");
  await expect(left.getByLabel("Station antenna height AGL (m)")).toHaveValue(
    "10",
  );
  await expect(
    page.getByRole("combobox", { name: "Map view", exact: true }),
  ).toHaveValue("imagery");
  await expect(rangeSwitch).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("oar-coverage"))),
    )
    .toEqual({ ...DEFAULT_COVERAGE, enabled: true });
  await expect(left.locator(".coverage-controls details")).toHaveCount(0);
  await expect(left.getByLabel("Station antenna height AGL (m)")).toBeVisible();
  const rangeFonts = await left
    .locator("#location-panel-range")
    .evaluate((el) =>
      [...el.querySelectorAll("h2, h4, p, label, input, select, strong")].map(
        (node) => getComputedStyle(node).fontSize,
      ),
    );
  assert.ok(
    rangeFonts.every((font) => font === quickSwitchFont),
    JSON.stringify({ rangeFonts, quickSwitchFont }),
  );
  const spacing = await left.locator(".coverage-toolbar").evaluate((el) => {
    const style = getComputedStyle(el);
    const row = getComputedStyle(el.querySelector("label"));
    const panel = getComputedStyle(el.closest('[role="tabpanel"]'));
    return { gap: style.gap, columnGap: row.columnGap, padding: panel.padding };
  });
  assert.deepEqual(spacing, {
    gap: "6px",
    columnGap: "8px",
    padding: "4px 10px",
  });
  const overflow = await left
    .getByRole("tabpanel", { name: "Range", exact: true })
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  assert.equal(overflow, false);
  await page.screenshot({ path: "/tmp/oar-range-tabs.png" });
  await left.getByRole("tab", { name: "General", exact: true }).click();
  const separator = left
    .locator("#location-panel-general > .location-card + .location-card")
    .first();
  await expect(separator).toBeVisible();
  const separatorWidth = await separator.evaluate((el) =>
    parseFloat(getComputedStyle(el).borderTopWidth),
  );
  assert.ok(separatorWidth > 0 && separatorWidth <= 2);
  assert.equal(
    await separator.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--repeater)";
      el.append(probe);
      const match =
        getComputedStyle(probe).color === getComputedStyle(el).borderTopColor;
      probe.remove();
      return match;
    }),
    true,
  );
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-coverage-count",
    "4",
  );
  await left.getByRole("tab", { name: "Range", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Coverage band" }),
  ).toHaveValue("2m");
  await page
    .getByRole("complementary", { name: "Repeater details", exact: true })
    .getByRole("button", { name: "Save location as pin", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved locations", exact: true }),
  ).toBeVisible();
  let saved = (await pins(page))[0];
  assert.equal(saved.callsign, "N0TEST");
  await page
    .getByLabel("Name for saved location " + saved.id, { exact: true })
    .fill("Home station");
  await page
    .getByLabel("Callsign for saved location " + saved.id, { exact: true })
    .fill("ZS1ABC");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(async () => (await pins(page))[0].label)
    .toBe("Home station");
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await page.waitForTimeout(200);
  let marker = page.getByRole("button", {
    name: "Saved pin Home station",
    exact: true,
  });
  assert.match(
    await marker.evaluate((el) => getComputedStyle(el).cursor),
    /crosshair/,
  );
  await marker.click({ button: "right" });
  await expect(
    page.getByRole("menu", { name: "Saved location actions" }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "Move pin to another location" })
    .click();
  const canvas = await page.locator(".maplibregl-canvas").boundingBox();
  await page.mouse.click(
    canvas.x + canvas.width / 2 + 70,
    canvas.y + canvas.height / 2 + 40,
  );
  await expect.poll(async () => (await pins(page))[0].lng).not.toBe(saved.lng);
  saved = (await pins(page))[0];
  marker = page.getByRole("button", {
    name: "Saved pin Home station",
    exact: true,
  });
  let bounds = await marker.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 45,
    bounds.y + bounds.height / 2 - 25,
    { steps: 12 },
  );
  assert.equal(
    await marker.evaluate((el) => getComputedStyle(el).cursor),
    "grabbing",
  );
  assert.equal(
    await page
      .locator(".maplibregl-canvas")
      .evaluate((el) => getComputedStyle(el).cursor),
    "grabbing",
  );
  await page.mouse.up();
  await expect
    .poll(() => marker.evaluate((el) => getComputedStyle(el).cursor))
    .toMatch(/crosshair/);
  await expect.poll(async () => (await pins(page))[0].lng).not.toBe(saved.lng);
  await marker.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete pin", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect.poll(async () => (await pins(page)).length).toBe(0);
  // Right-click an empty map location, save a new pin, and verify it survives restart.
  await page.mouse.click(
    canvas.x + canvas.width * 0.25,
    canvas.y + canvas.height * 0.35,
    { button: "right" },
  );
  await page.getByRole("menuitem", { name: "Save pin here" }).click();
  await expect.poll(async () => (await pins(page)).length).toBe(1);
  saved = (await pins(page))[0];
  await page.screenshot({ path: "/tmp/oar-saved-locations.png" });
  assert.deepEqual(errors, []);
  await app.close();
  app = null;
  page = await launch();
  assert.equal((await pins(page))[0].id, saved.id);
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  await expect(
    page.getByLabel("Name for saved location " + saved.id, { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Edit saved location " + saved.label,
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Name for saved location " + saved.id, { exact: true }),
  ).toHaveValue(saved.label);
  console.log(
    "Map interaction tests passed: drawer toggles, streets, cached repeaters/details, inline pin edits, context menus, click-to-move, dragging, deletion and persistence.",
  );
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    await page.screenshot({ path: "/tmp/oar-map-interactions-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-6000));
    console.error(
      "Map debug:",
      await page.locator(".world-map").evaluate((el) => {
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber"))];
        while (f) {
          let h = f.memoizedState;
          while (h) {
            const m = h.memoizedState?.current;
            if (m?.getProjection)
              return {
                projection: m.getProjection(),
                center: m.getCenter(),
                point: m.project([-0.1276, 51.5034]),
                zoom: m.getZoom(),
                layers: m.getStyle().layers.map((l) => l.id),
                sourceLoaded: m.getSource("repeaters")
                  ? m.isSourceLoaded("repeaters")
                  : null,
                features: m.getSource("repeaters")
                  ? m.querySourceFeatures("repeaters").map((f) => f.properties)
                  : null,
                rendered: m.getLayer("repeater-clusters")
                  ? m
                      .queryRenderedFeatures({
                        layers: ["repeater-clusters", "repeater-points"],
                      })
                      .map((f) => f.properties)
                  : null,
              };
            h = h.next;
          }
          f = f.return;
        }
      }),
    );
  }
  throw error;
} finally {
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
}
