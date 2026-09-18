import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeRepeaters } from "../server/repeaters.js";
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
  await expect(
    page.getByLabel("Choose repeater at this location"),
  ).toBeVisible();
  await page
    .getByLabel("Choose repeater at this location")
    .selectOption("hearham-1");
  await expect(
    page.getByText("Test-only repeater details", { exact: true }),
  ).toBeVisible();
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
  await page.mouse.up();
  await expect.poll(async () => (await pins(page))[0].lng).not.toBe(saved.lng);
  await marker.click({ button: "right" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Delete pin", exact: true }).click();
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
