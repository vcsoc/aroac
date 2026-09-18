import { test, expect } from "@playwright/test";

test("compact topbar, themed help/about and saved-location confirmation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", () => {
    throw new Error("Unexpected native confirmation");
  });
  const label = "UI test " + Date.now();
  await page.request.post("/api/pins", {
    data: { label, lat: -33.9, lng: 18.4 },
  });
  await page.goto("/");
  const search = page.locator(".topbar-search-group");
  const narrow = (await search.boundingBox()).width;
  await page.getByLabel("Search addresses and places").focus();
  await page.waitForTimeout(300);
  const wide = (await search.boundingBox()).width;
  expect(wide).toBeGreaterThan(narrow);
  expect(wide).toBeLessThanOrEqual(300);
  const pin = await page.locator(".topbar-location-button").boundingBox();
  const breadcrumb = await page.locator(".breadcrumb").boundingBox();
  expect(breadcrumb.x).toBeGreaterThan(pin.x);
  await page.getByRole("button", { name: "About OAR", exact: true }).click();
  const about = page.getByRole("dialog", { name: "About OAR" });
  await expect(about).toContainText("Chris Visser");
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--panel", "#254963"),
  );
  await expect(about).toHaveCSS("background-color", "rgb(37, 73, 99)");
  await expect(about.getByRole("link")).toHaveAttribute(
    "href",
    "https://github.com/vcsoc/oar",
  );
  await page.keyboard.press("Escape");
  await expect(about).not.toBeVisible();
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  const card = page.locator(".pin-editor").filter({ hasText: label });
  const remove = card.getByRole("button", {
    name: "Delete saved location " + label,
  });
  await expect(remove).toBeVisible();
  const move = await card
    .getByRole("button", { name: "Move on map" })
    .boundingBox();
  const home = await card
    .getByRole("button", { name: "Use this pin as home location" })
    .boundingBox();
  expect(home.x).toBeGreaterThan(move.x);
  expect(home.x - move.x).toBeLessThan(60);
  await remove.click();
  const confirmation = page.getByRole("dialog", { name: "Please confirm" });
  await expect(confirmation).toContainText(label);
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(card).toBeVisible();
  await remove.click();
  await confirmation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  if (
    !(await page
      .getByRole("button", { name: "About home location" })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Location details", exact: true })
      .click();
  await page.getByRole("button", { name: "About home location" }).focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "Timezone identifiers name a representative city",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const profile = await page.locator(".profile-button").boundingBox();
  expect(profile.x + profile.width).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("authenticated callsign opens an account menu", async ({ page }) => {
  const callsign = "U" + Date.now().toString().slice(-7);
  await page.request.post("/api/register", {
    data: {
      callsign,
      name: "UI Operator",
      email: "ui@example.com",
      password: "ui-test-password-123",
    },
  });
  await page.goto("/");
  await page.locator(".profile-button").click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "About OAR" }).click();
  await expect(page.getByRole("dialog", { name: "About OAR" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".profile-button").click();
  await menu.getByRole("menuitem", { name: "Edit Profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Profile & equipment" }),
  ).toBeVisible();
});
