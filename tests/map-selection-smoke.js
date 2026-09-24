import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const directory = mkdtempSync(path.join(os.tmpdir(), "oar-map-selection-"));
let app;
async function mapAction(page, action) {
  return page.locator(".world-map").evaluate((el, action) => {
    let fiber = el[Object.keys(el).find((k) => k.startsWith("__reactFiber"))];
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        if (map?.project && map?.getCanvas) {
          if (action.zoom !== undefined)
            map.jumpTo({
              zoom: action.zoom,
              ...(action.center ? { center: action.center } : {}),
            });
          const location = el.dataset.clickedLocation?.split(",").map(Number);
          const point = location
            ? map.project([location[1], location[0]])
            : null;
          const rect = map.getCanvas().getBoundingClientRect();
          return {
            point: point && {
              x:
                rect.left +
                (point.x * rect.width) / map.getCanvas().offsetWidth,
              y:
                rect.top +
                (point.y * rect.height) / map.getCanvas().offsetHeight,
            },
            location,
            zoom: map.getZoom(),
          };
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    throw Error("Map unavailable");
  }, action);
}
try {
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
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("heading", { name: "Good to have you on air." })
    .waitFor();
  await page.evaluate(() => window.oarDesktop.setOffline(true));
  const world = page.locator(".world-map"),
    canvas = page.locator(".maplibregl-canvas");
  await expect(world).toHaveAttribute("data-ready", "true");
  const cursor = () => canvas.evaluate((el) => getComputedStyle(el).cursor);
  assert.match(await cursor(), /crosshair-24.*12 12.*crosshair/);
  let rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.down();
  assert.match(await cursor(), /crosshair/);
  await page.mouse.move(
    rect.x + rect.width * 0.5 + 60,
    rect.y + rect.height * 0.5 + 25,
    { steps: 5 },
  );
  assert.equal(await cursor(), "grabbing");
  await page.mouse.up();
  await expect.poll(cursor).toMatch(/crosshair/);
  await expect(page.locator(".clicked-location-marker")).toHaveCount(0);
  await page.waitForTimeout(700);
  await page.mouse.click(
    rect.x + rect.width * 0.55,
    rect.y + rect.height * 0.45,
  );
  const marker = page.locator(".clicked-location-marker");
  await expect(marker).toHaveCount(1);
  await expect
    .poll(() => marker.evaluate((el) => el.complete && el.naturalWidth === 72))
    .toBe(true);
  async function aligned() {
    const { point } = await mapAction(page, {}),
      box = await marker.boundingBox();
    return Math.hypot(
      box.x + box.width / 2 - point.x,
      box.y + box.height - point.y,
    );
  }
  await expect.poll(aligned).toBeLessThan(2);
  const firstHeight = (await marker.boundingBox()).height;
  const first = (await mapAction(page, {})).location;
  await mapAction(page, { zoom: 14, center: [first[1], first[0]] });
  await expect(world).toHaveAttribute("data-cursor-size", "32");
  assert.match(await cursor(), /crosshair-32.*16 16/);
  await expect.poll(aligned).toBeLessThan(2);
  assert.ok((await marker.boundingBox()).height > firstHeight);
  rect = await canvas.boundingBox();
  await page.mouse.click(
    rect.x + rect.width * 0.65,
    rect.y + rect.height * 0.55,
  );
  await expect(marker).toHaveCount(1);
  await expect
    .poll(async () => JSON.stringify((await mapAction(page, {})).location))
    .not.toBe(JSON.stringify(first));
  await expect.poll(aligned).toBeLessThan(2);
  const selected = (await mapAction(page, {})).location;
  await page
    .getByRole("switch", { name: "Map projection", exact: true })
    .click();
  await expect(world).toHaveAttribute("data-projection", "globe");
  await page.waitForTimeout(800);
  await mapAction(page, { zoom: 2, center: [selected[1], selected[0]] });
  await expect.poll(aligned).toBeLessThan(2);
  await expect(world).toHaveAttribute("data-cursor-size", "24");
  await page.screenshot({ path: "/tmp/oar-custom-map-marker.png" });
  await mapAction(page, {
    zoom: 2,
    center: [((selected[1] + 540) % 360) - 180, -selected[0]],
  });
  // Move longitude an additional half-turn to put the marker behind the globe.
  await mapAction(page, {
    zoom: 2,
    center: [
      selected[1] > 0 ? selected[1] - 180 : selected[1] + 180,
      -selected[0],
    ],
  });
  await expect
    .poll(() => marker.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(0);
  assert.deepEqual(errors, []);
  console.log(
    "CUSTOM MAP SELECTION PASSED: cursor assets/hotspots, drag-only hand, single click marker, tip alignment after zoom/projection and globe occlusion.",
  );
} finally {
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
}
