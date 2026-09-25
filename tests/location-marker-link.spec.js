import { test, expect } from "@playwright/test";
import { defaultTimeConfig } from "../shared/workspace.js";

test("temporary pins retain matching colored headers and markers; saved selection is yellow", async ({
  page,
}) => {
  await page.request.post("/api/register", {
    data: {
      callsign: "L" + Date.now().toString().slice(-7),
      name: "Marker Tester",
      email: "marker@example.com",
      password: "marker-tests-password-123",
    },
  });
  await page.goto("/");
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  const cards = page.getByRole("region", { name: "Selected location details" });
  const marker = page.locator(".linked-location-marker");
  let box = await canvas.boundingBox();
  await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
  await expect(cards).toHaveCount(1);
  await cards
    .first()
    .getByRole("button", { name: "Pin selected location" })
    .click();
  await expect(marker).toHaveCount(1);
  await expect(marker.first()).toBeVisible();
  expect((await marker.first().boundingBox()).width).toBeGreaterThan(15);
  const color = await cards
    .first()
    .locator("header")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect
    .poll(() =>
      marker.first().evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe(color);
  box = await canvas.boundingBox();
  await canvas.click({
    position: { x: box.width * 0.65, y: box.height * 0.55 },
  });
  await expect(cards).toHaveCount(2);
  await cards
    .last()
    .getByRole("button", { name: "Pin selected location" })
    .click();
  await expect(marker).toHaveCount(2);
  expect((await marker.nth(1).boundingBox()).width).toBeGreaterThan(15);
  const secondColor = await cards
    .last()
    .locator("header")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(secondColor).not.toBe(color);
  await expect
    .poll(() =>
      marker.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe(secondColor);
  const projection = page.getByRole("switch", { name: "Map projection" });
  await projection.click();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-projection",
    "globe",
  );
  await expect(marker).toHaveCount(2);
  expect((await marker.first().boundingBox()).width).toBeGreaterThan(15);
  await projection.click();
  await cards
    .last()
    .getByRole("button", { name: "Save selected location" })
    .click();
  const saved = page.locator(".saved-map-pin").first();
  await expect(saved).toBeVisible();
  await saved.click();
  await expect(saved).toHaveClass(/selected-saved-map-pin/);
  await expect(
    page.locator(".pin-editor.selected .pin-editor-title"),
  ).toHaveCSS("background-color", "rgb(255, 211, 79)");
  await expect(saved).toHaveCSS("background-color", "rgb(255, 211, 79)");
  await page.getByRole("button", { name: "Saved locations on map" }).click();
  await expect(saved).toBeVisible(); // The active saved location stays identifiable even when others are hidden.
  box = await canvas.boundingBox();
  await canvas.click({ position: { x: box.width * 0.4, y: box.height * 0.6 } });
  await expect(page.locator(".saved-map-pin")).toHaveCount(0);
});

test("focusing home from the left panel shows a home marker on the map", async ({
  page,
}) => {
  const registration = await page.request.post("/api/register", {
    data: {
      callsign: "H" + Date.now().toString().slice(-7),
      name: "Home Marker Tester",
      email: "home-marker@example.com",
      password: "home-marker-tests-password-123",
    },
  });
  expect(registration.ok()).toBeTruthy();
  const update = await page.request.put("/api/preferences/world-time", {
    data: {
      ...defaultTimeConfig(),
      home: {
        name: "Toronto",
        zone: "America/Toronto",
        lat: 43.65,
        lng: -79.38,
      },
    },
  });
  expect(update.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Location details" }).click();
  const home = page.getByRole("region", { name: "Home location details" });
  await expect(home).toBeVisible();
  await home.locator("button.location-title").click();
  await expect(page.locator(".home-location-marker")).toBeVisible();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-selected-location",
    "43.65,-79.38",
  );
});
