import { test, expect } from "@playwright/test";
import { ROADMAP_URL } from "../shared/roadmap.js";
import pkg from "../package.json" with { type: "json" };
const { version } = pkg;

test("clock editor uses compact color controls and heading help", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add clock", exact: true }).click();
  const editor = page.locator(".clock-editor");
  const picker = editor.locator('input[type="color"]');
  const reset = editor.getByRole("button", {
    name: "Use theme color",
    exact: true,
  });
  const box = await picker.boundingBox();
  const resetBox = await reset.boundingBox();
  expect(box.width).toBeLessThanOrEqual(40);
  expect(box.height).toBeLessThanOrEqual(32);
  expect(resetBox.x).toBeGreaterThan(box.x);
  expect(Math.abs(resetBox.y - box.y)).toBeLessThan(3);
  await expect(reset).toHaveAttribute("title", "Use theme color");
  await expect(reset).toHaveText("");
  await picker.fill("#ff00aa");
  await expect(picker).toHaveValue("#ff00aa");
  await reset.click();
  await expect(picker).not.toHaveValue("#ff00aa");
  for (const [name, text] of [
    ["About clock locations", "City suggestions are available offline"],
    ["About clock text colors", "Custom text colors keep the theme background"],
    ["About clock coordinates", "Coordinates enable home weather"],
    ["About city and timezone search", "GeoNames"],
  ]) {
    await editor.getByRole("button", { name, exact: true }).focus();
    await expect(page.getByRole("tooltip")).toContainText(text);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(editor).toBeVisible();
  }
  await editor.getByLabel("Location name", { exact: true }).focus();
  await page.screenshot({ path: "/tmp/oar-clock-editor-0.3.9.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowPicker = await picker.boundingBox();
  const narrowReset = await reset.boundingBox();
  expect(Math.abs(narrowPicker.y - narrowReset.y)).toBeLessThan(3);
  expect(narrowReset.x + narrowReset.width).toBeLessThanOrEqual(390);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("roadmap renders safe Markdown and explains unavailable content", async ({
  page,
}) => {
  let requests = 0;
  await page.route(ROADMAP_URL, (route) => {
    requests++;
    return route.fulfill({
      contentType: "text/plain",
      body: "# Potential improvements\n\n- **Offline maps**\n- Better logging\n\n[Project](https://github.com/vcsoc/aroac)\n\n<script>window.roadmapInjected=true</script>\n\n![remote](https://example.com/tracker.png)\n\n[Unsafe](javascript:alert(1))",
    });
  });
  await page.goto("/");
  await expect(page.locator(".app-statusbar")).toContainText(
    `AROAC v${version}`,
  );
  await page.getByRole("button", { name: "About AROAC", exact: true }).click();
  expect(requests).toBe(0);
  await page.getByRole("tab", { name: "Roadmap" }).click();
  await expect(
    page.getByRole("heading", { name: "Potential improvements" }),
  ).toBeVisible();
  await expect(page.locator(".roadmap-content strong")).toHaveText(
    "Offline maps",
  );
  // React development StrictMode may start and cancel the first request.
  expect(requests).toBeGreaterThanOrEqual(1);
  expect(requests).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.roadmapInjected)).toBeUndefined();
  await expect(
    page.locator(
      '.roadmap-content img, .roadmap-content script, .roadmap-content a[href^="javascript:"]',
    ),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "About", exact: true }).click();
  await page.route(ROADMAP_URL, (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.getByRole("tab", { name: "Roadmap" }).click();
  await expect(page.locator(".roadmap-fallback")).toContainText(
    "contribute or sponsor future development",
  );
  await page.keyboard.press("Escape");
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "About AROAC", exact: true }).click();
  await page.getByRole("tab", { name: "Roadmap" }).click();
  await expect(page.locator(".roadmap-fallback")).toContainText(
    "working offline",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeDisabled();
});

test("location saves and home changes produce meaningful four-second toasts", async ({
  page,
}) => {
  const label = "Toast location " + Date.now();
  const pin = await (
    await page.request.post("/api/pins", {
      data: { label, lat: -33.9, lng: 18.4 },
    })
  ).json();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  const card = page.locator(`[data-pin-id="${pin.id}"]`);
  await card
    .getByRole("button", { name: "Edit saved location " + label, exact: true })
    .click();
  await card
    .getByLabel("Name for saved location " + pin.id, { exact: true })
    .fill(label + " edited");
  await card.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".oar-toast")).toContainText(
    `Updated saved location “${label} edited”`,
  );
  await expect(page.locator(".oar-toast")).toHaveCount(0, { timeout: 6000 });
  await card
    .getByRole("button", { name: "Use this pin as home location" })
    .click();
  await expect(page.locator(".oar-toast")).toHaveCount(1);
  await expect(page.locator(".oar-toast")).toContainText(
    `Home location changed to saved pin “${label} edited”`,
  );
  await expect(page.locator(".oar-toast")).toHaveCount(0, { timeout: 6000 });
  await page.request.delete("/api/pins/" + pin.id);
});

test("authenticated Help tutorial walks through sections and restores the view", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.post("/api/register", {
    data: {
      callsign: "H" + Date.now().toString().slice(-7),
      name: "Tutorial Operator",
      email: "tutorial@example.com",
      password: "tutorial-password-123",
    },
  });
  await page.goto("/");
  const before = await page.locator(".breadcrumb").innerText();
  await page.locator(".profile-button").click();
  await page.getByRole("menuitem", { name: "Help" }).click();
  await page.getByRole("menuitem", { name: "Tutorial", exact: true }).click();
  const tour = page.getByRole("dialog", { name: "AROAC tutorial" });
  await expect(tour).toBeVisible();
  await expect(tour.getByRole("button", { name: "Previous" })).toBeDisabled();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Choose a workspace");
  await tour.getByRole("button", { name: "Previous" }).click();
  await expect(tour).toContainText("Welcome to AROAC");
  for (let i = 0; i < 12; i++) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour.locator(".tutorial-spotlight")).toBeVisible();
    if (i === 4) await page.screenshot({ path: "/tmp/oar-tutorial.png" });
  }
  await expect(tour).toContainText("Version and station status");
  await expect(tour.getByRole("button", { name: "Next" })).toBeDisabled();
  await tour.getByRole("button", { name: "End", exact: true }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.locator(".breadcrumb")).toHaveText(before);
  await expect(page.locator(".app-statusbar")).toBeVisible();
  expect(errors).toEqual([]);
});
