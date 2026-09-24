import { test, expect } from "@playwright/test";

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
